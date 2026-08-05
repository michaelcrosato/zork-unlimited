/**
 * The §8.5 determinism contract + the §14 testing-strategy properties.
 *
 *   (a) determinism — random valid RpgAction sequences run twice ⇒ identical traces
 *   (b) purity      — step never mutates its input state
 *   (c) save/load   — round-trips to an identical state hash
 *   (d) legality    — the legal-RpgAction set never contains an RpgAction that step
 *                     then rejects as ILLEGAL (conditions may still fail)
 *
 * These properties — not coverage — are what actually establish correctness.
 */
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import type { GameState } from "../../src/core/state.js";
import type { GameEvent } from "../../src/core/events.js";
import { makeStep } from "../../src/core/engine.js";
import { hashState } from "../../src/core/hash.js";
import { save, load } from "../../src/persist/save_load.js";
import type { RpgAction } from "../../src/api/types.js";
import {
  microRules,
  microInitState,
  MICRO_CONTENT_HASH,
} from "../../src/demo/micro.js";

const ILLEGAL_REASON = "That action is not available right now.";
const step = makeStep(microRules);

type Walk = {
  hashes: string[];
  events: GameEvent[][];
  finalState: GameState;
  /** A legal RpgAction that step rejected specifically for illegality (must never happen). */
  illegalRejections: number;
  /** Every intermediate state, for the save/load property. */
  states: GameState[];
};

/** Walk the game guided by `picks`: at each step choose a legal RpgAction by index. */
function walk(picks: number[], seed: number): Walk {
  let state = microInitState(seed);
  const hashes: string[] = [];
  const events: GameEvent[][] = [];
  const states: GameState[] = [];
  let illegalRejections = 0;

  for (const pick of picks) {
    if (state.ended) break;
    const legal = microRules.legalActions(state);
    if (legal.length === 0) break;
    const action = legal[pick % legal.length] as RpgAction;

    // (b) purity: deep-freeze the input; any mutation throws in strict mode.
    deepFreeze(state);
    const result = step(state, action);

    if (!result.ok && result.rejectionReason === ILLEGAL_REASON) illegalRejections++;

    state = result.state;
    states.push(state);
    hashes.push(hashState(state));
    events.push(result.events);
  }
  return { hashes, events, finalState: state, illegalRejections, states };
}

function deepFreeze<T>(obj: T): T {
  Object.freeze(obj);
  for (const v of Object.values(obj as Record<string, unknown>)) {
    if (v !== null && typeof v === "object" && !Object.isFrozen(v)) deepFreeze(v);
  }
  return obj;
}

const picksArb = fc.array(fc.nat({ max: 1000 }), { maxLength: 20 });

/**
 * The full domain `isRuntimeSeed` accepts, not a comfortable slice of it.
 *
 * This generator used to sample only [0, 2**31), so it never exercised a negative
 * seed or one at or above 2**32 — exactly the region where `rngForStep` used to
 * discard the seed's high bits and let seeds 1 and 4294967297 play identically while
 * hashing differently. A property test that cannot reach the boundary cannot fail at
 * it. Weighted so the interesting bands are sampled, not drowned out by the wide one.
 */
const seedArb = fc.oneof(
  { arbitrary: fc.integer({ min: 0, max: 2 ** 31 - 1 }), weight: 4 },
  { arbitrary: fc.integer({ min: -(2 ** 31), max: -1 }), weight: 2 },
  { arbitrary: fc.integer({ min: 2 ** 32, max: Number.MAX_SAFE_INTEGER }), weight: 2 },
  { arbitrary: fc.integer({ min: Number.MIN_SAFE_INTEGER, max: -(2 ** 32) }), weight: 2 },
  {
    arbitrary: fc.constantFrom(
      0,
      -1,
      1,
      2 ** 32,
      2 ** 32 + 1,
      4294967295,
      Number.MAX_SAFE_INTEGER,
      Number.MIN_SAFE_INTEGER,
    ),
    weight: 1,
  },
);

/**
 * Pinned rather than left to fast-check's default so a future default change cannot
 * silently alter how much of the domain these properties actually cover.
 */
const RUNS = { numRuns: 200 };

describe("determinism contract (§8.5)", () => {
  it("(a) identical RpgAction sequence ⇒ identical hashes and events on repeat", () => {
    fc.assert(
      fc.property(picksArb, seedArb, (picks, seed) => {
        const a = walk(picks, seed);
        const b = walk(picks, seed);
        expect(a.hashes).toEqual(b.hashes);
        expect(a.events).toEqual(b.events);
        expect(hashState(a.finalState)).toBe(hashState(b.finalState));
      }),
      RUNS,
    );
  });

  it("(b) step never mutates its input (deep-frozen states never throw)", () => {
    fc.assert(
      fc.property(picksArb, seedArb, (picks, seed) => {
        expect(() => walk(picks, seed)).not.toThrow();
      }),
      RUNS,
    );
  });

  it("(c) every reached state survives a save/load round-trip with an identical hash", () => {
    fc.assert(
      fc.property(picksArb, seedArb, (picks, seed) => {
        for (const s of walk(picks, seed).states) {
          const restored = load(
            save(s, MICRO_CONTENT_HASH, undefined, {
              worldQuestId: "micro_determinism",
            }),
            MICRO_CONTENT_HASH,
          );
          expect(hashState(restored.state)).toBe(hashState(s));
        }
      }),
      RUNS,
    );
  });

  it("(d) a member of the legal-RpgAction set is never rejected as illegal", () => {
    fc.assert(
      fc.property(picksArb, seedArb, (picks, seed) => {
        expect(walk(picks, seed).illegalRejections).toBe(0);
      }),
      RUNS,
    );
  });
});
