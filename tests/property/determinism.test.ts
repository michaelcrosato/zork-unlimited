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
import { MAX_ENGINE_STEP, type GameState } from "../../src/core/state.js";
import type { GameEvent } from "../../src/core/events.js";
import { makeStep } from "../../src/core/engine.js";
import { hashState } from "../../src/core/hash.js";
import { rngForStep } from "../../src/core/rng.js";
import { save, load } from "../../src/persist/save_load.js";
import type { RpgAction } from "../../src/api/types.js";
import type { Rules } from "../../src/core/engine.js";
import { loadRpgSourceFile } from "../../src/rpg/source.js";
import { indexRpgPack, buildRpgRules, initStateForRpgPack } from "../../src/rpg/runner.js";

const ILLEGAL_REASON = "That action is not available right now.";

/**
 * A subject these properties can be established ON.
 *
 * They used to run against src/demo/micro.ts alone — 99 lines, four hand-written
 * scenes, ends in three moves, with no combat, no skill checks, no RNG draw, no
 * objectState, no quest stages, no dialogue. Determinism and purity held there
 * trivially, because almost none of the state the engine actually carries existed to
 * be non-deterministic or mutated. Properties are what establish correctness here, so
 * they run only on shipped content. Unit tests retain the toy as a minimal engine
 * witness; it is not evidence for the production state graph.
 */
type Subject = {
  label: string;
  rules: Rules<RpgAction>;
  initState: (seed: number) => GameState;
  contentHash: string;
  /** Longest walk to attempt. A real pack needs more steps to reach anything. */
  maxSteps: number;
};

function shippedSubject(path: string, label: string, maxSteps: number): Subject {
  const loaded = loadRpgSourceFile(path);
  if (!loaded.ok) throw new Error(`${label} must compile for the property suite`);
  const index = indexRpgPack(loaded.compiled.pack);
  return {
    label,
    rules: buildRpgRules(index),
    initState: (seed) => initStateForRpgPack(index, seed),
    contentHash: loaded.compiled.contentHash,
    maxSteps,
  };
}

const SUBJECTS: Subject[] = [
  // The smallest shipped quest: real rooms, objects, containers, an NPC, combat, and a
  // score var, so the state graph these properties quantify over is the real one.
  shippedSubject("content/rpg/quests/sunken_barrow.yaml", "sunken_barrow", 40),
];

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
function walk(subject: Subject, picks: number[], seed: number): Walk {
  const step = makeStep(subject.rules);
  let state = subject.initState(seed);
  const hashes: string[] = [];
  const events: GameEvent[][] = [];
  const states: GameState[] = [];
  let illegalRejections = 0;

  for (const pick of picks.slice(0, subject.maxSteps)) {
    if (state.ended) break;
    const legal = subject.rules.legalActions(state);
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

// Long enough for a real pack to reach a container, a fight, or an ending; each
// subject slices this to its own maxSteps.
const picksArb = fc.array(fc.nat({ max: 1000 }), { maxLength: 40 });

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
      2 ** 32 + 0x27d4eb2f,
      4294967295,
      Number.MAX_SAFE_INTEGER,
      Number.MIN_SAFE_INTEGER,
    ),
    weight: 1,
  },
);

const formerWholeStreamAlias = 2 ** 32 + 0x27d4eb2f;

describe("wide-seed RNG state separation", () => {
  it("the confirmed high-word XOR alias stays separated across the accepted step domain", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: MAX_ENGINE_STEP }), (step) => {
        const narrow = rngForStep(0, step);
        const wide = rngForStep(formerWholeStreamAlias, step);
        const narrowPrefix = [narrow.next(), narrow.next(), narrow.next()];
        const widePrefix = [wide.next(), wide.next(), wide.next()];
        expect(widePrefix).not.toEqual(narrowPrefix);
      }),
      { numRuns: 500 },
    );
  });
});

/**
 * Pinned rather than left to fast-check's default so a future default change cannot
 * silently alter how much of the domain these properties actually cover.
 */
const RUNS = { numRuns: 200 };

describe.each(SUBJECTS)("determinism contract (§8.5) — $label", (subject: Subject) => {
  it("(a) identical RpgAction sequence ⇒ identical hashes and events on repeat", () => {
    fc.assert(
      fc.property(picksArb, seedArb, (picks, seed) => {
        const a = walk(subject, picks, seed);
        const b = walk(subject, picks, seed);
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
        expect(() => walk(subject, picks, seed)).not.toThrow();
      }),
      RUNS,
    );
  });

  it("(c) every reached state survives a save/load round-trip with an identical hash", () => {
    fc.assert(
      fc.property(picksArb, seedArb, (picks, seed) => {
        for (const s of walk(subject, picks, seed).states) {
          const restored = load(
            save(s, subject.contentHash, undefined, {
              worldQuestId: `${subject.label}_determinism`,
            }),
            subject.contentHash,
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
        expect(walk(subject, picks, seed).illegalRejections).toBe(0);
      }),
      RUNS,
    );
  });

  it("the walk actually reaches state (a property over an empty region proves nothing)", () => {
    // Guards the whole file against becoming vacuous: if legalActions ever returned
    // nothing, or the pack failed to start, every property above would pass trivially.
    const reached = walk(
      subject,
      Array.from({ length: subject.maxSteps }, (_, index) => index),
      7,
    );
    expect(reached.states.length).toBeGreaterThan(2);
    expect(new Set(reached.hashes).size).toBeGreaterThan(1);
  });
});
