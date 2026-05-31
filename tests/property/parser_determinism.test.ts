/**
 * The §8.5 determinism contract for the Stage-2 parser, over The Sealed Crypt.
 * Same properties as the Stage-0 suite, exercised through the parser Rules:
 *   (a) determinism, (b) purity, (c) save/load round-trip, (d) legal ⊇ executable.
 * Random legal action sequences (drawn from the engine's own legal set each step)
 * run twice produce byte-identical hash and event sequences.
 */
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import type { GameState } from "../../src/core/state.js";
import type { GameEvent } from "../../src/core/events.js";
import { makeStep, type Rules } from "../../src/core/engine.js";
import { hashState } from "../../src/core/hash.js";
import { save, load } from "../../src/persist/save_load.js";
import { loadParserPackFile } from "../../src/parser/pack.js";
import { indexParserPack, buildParserRules, initStateForParserPack } from "../../src/parser/runner.js";

const loaded = loadParserPackFile("content/parser/pack/sealed_crypt.yaml");
if (!loaded.ok) throw new Error("sealed_crypt must compile");
const index = indexParserPack(loaded.compiled.pack);
const rules: Rules = buildParserRules(index);
const step = makeStep(rules);
const PACK_ID = loaded.compiled.pack.meta.id;
const HASH = loaded.compiled.contentHash;
const ILLEGAL_REASON = "That action is not available right now.";

type Walk = { hashes: string[]; events: GameEvent[][]; states: GameState[]; finalState: GameState; illegalRejections: number };

function walk(picks: number[], seed: number): Walk {
  let state = initStateForParserPack(index, seed);
  const hashes: string[] = [];
  const events: GameEvent[][] = [];
  const states: GameState[] = [];
  let illegalRejections = 0;
  for (const pick of picks) {
    if (state.ended) break;
    const legal = rules.legalActions(state);
    if (legal.length === 0) break;
    const action = legal[pick % legal.length]!;
    deepFreeze(state);
    const result = step(state, action);
    if (!result.ok && result.rejectionReason === ILLEGAL_REASON) illegalRejections++;
    state = result.state;
    states.push(state);
    hashes.push(hashState(state));
    events.push(result.events);
  }
  return { hashes, events, states, finalState: state, illegalRejections };
}

function deepFreeze<T>(obj: T): T {
  Object.freeze(obj);
  for (const v of Object.values(obj as Record<string, unknown>)) {
    if (v !== null && typeof v === "object" && !Object.isFrozen(v)) deepFreeze(v);
  }
  return obj;
}

const picksArb = fc.array(fc.nat({ max: 1000 }), { maxLength: 40 });
const seedArb = fc.integer({ min: 0, max: 2 ** 31 - 1 });

describe("parser determinism contract (§8.5)", () => {
  it("(a) identical action sequence ⇒ identical hashes and events on repeat", () => {
    fc.assert(
      fc.property(picksArb, seedArb, (picks, seed) => {
        const a = walk(picks, seed);
        const b = walk(picks, seed);
        expect(a.hashes).toEqual(b.hashes);
        expect(a.events).toEqual(b.events);
      }),
    );
  });

  it("(b) step never mutates its input", () => {
    fc.assert(
      fc.property(picksArb, seedArb, (picks, seed) => {
        expect(() => walk(picks, seed)).not.toThrow();
      }),
    );
  });

  it("(c) every reached state survives a save/load round-trip with an identical hash", () => {
    fc.assert(
      fc.property(picksArb, seedArb, (picks, seed) => {
        for (const s of walk(picks, seed).states) {
          const restored = load(save(s, PACK_ID, HASH), HASH);
          expect(hashState(restored.state)).toBe(hashState(s));
        }
      }),
    );
  });

  it("(d) a member of the legal-action set is never rejected as illegal", () => {
    fc.assert(
      fc.property(picksArb, seedArb, (picks, seed) => {
        expect(walk(picks, seed).illegalRejections).toBe(0);
      }),
    );
  });
});
