/**
 * bug_0218 — a SoundnessBench-style NEGATIVE CORPUS for `validateCyoa`: a set of
 * deliberately-UNSOUND CYOA packs the validator MUST REJECT, each pinning ONE
 * previously-untested error branch in the REJECTION direction. This is the CYOA leg
 * of the negative-corpus trilogy (the parser leg is the sibling file; the RPG leg is
 * the original `rpg_validator_negative_corpus.test.ts`, bug_0182).
 *
 * The motivating gap (SoundnessBench, arXiv:2412.03154; the single-checker blind
 * spot, arXiv:2510.14253 / [[verifier-assertion-guard]]): a checker is only proven
 * sound if its FAILING branches are exercised on input that SHOULD fail. bug_0182
 * closed this for `validateRpg` only; an audit of the suite (this cycle) found a
 * large set of `validateCyoa`'s `error`-severity branches have ZERO rejection-
 * direction witness anywhere — they are exercised almost entirely in the ACCEPT
 * direction by the curated + generated clean packs. A future regression that drops a
 * `findings.push`, inverts a guard, or adds a `??` default swallowing the case would
 * leave every existing test GREEN — the present-but-untested-checker surface.
 *
 * The `error` codes this corpus closes (each confirmed un-witnessed this cycle):
 *   - DEAD_END          — a reachable non-ending scene with no choices at all
 *   - START_MISSING     — meta.start resolves to no node
 *   - START_NOT_SCENE   — meta.start is a terminal/ending (the game ends immediately)
 *   - ITEM_UNOBTAINABLE — a choice requires an item that no effect ever grants
 *
 * NOTE on coverage (honest, not inflated). The remaining `validateCyoa` `error`
 * codes already have a rejection-direction witness in `tests/unit/cyoa_validator.ts`
 * or a regression test (DUPLICATE_ID, REF_UNRESOLVED, NO_REACHABLE_ENDING,
 * ENDING_UNREACHABLE, SOFTLOCK, IMPOSSIBLE_GATE, CONTRADICTORY_CONDITION, the
 * DEADLINE_* family), so they are intentionally NOT re-pinned here. `gen(0)` carries
 * no `meta.deadline`, so the deadline-specific codes are not even mutate-reachable
 * from this base without adding a deadline structure (and they are witnessed anyway).
 *
 * Method (the bug_0182 copy-mutate discipline): the GREEN base is the canonical sound
 * pack `generateCyoaPack(0)` — it validates clean and carries the structure each
 * defect needs (a hub scene with choices, a reachable side-scene, declared endings).
 * Each case `structuredClone()`s it and introduces EXACTLY ONE defect, so the
 * rejection is attributable to that mutation alone. Where a minimal single defect
 * unavoidably trips a companion code (a choiceless scene is BOTH a DEAD_END and a
 * SOFTLOCK; a missing start makes every ending unreachable), we assert the targeted
 * code via `.includes(...)` (NOT exact-set-equals) plus the GREEN differential anchor,
 * exactly as the RPG corpus does. The differential anchor proves the code is absent
 * from the clean base until the mutation introduces it.
 *
 * PURELY ADDITIVE: a new regression test + a bug artifact. No source/validator/engine/
 * schema/generator/corpus/scorecard change, no hash re-pin — the validator is
 * exercised exactly as shipped, and the generator is called in-memory (pure, §8.5,
 * no disk write).
 */
import { describe, it, expect } from "vitest";
import { generateCyoaPack } from "../../src/gen/cyoa_generator.js";
import { validateCyoa } from "../../src/validate/cyoa_validator.js";
import type { CyoaPack } from "../../src/cyoa/schema.js";

// The canonical sound pack: validates clean (pinned green by the generator's own test).
const GREEN: CyoaPack = generateCyoaPack(0);

const codesOf = (pack: CyoaPack): string[] =>
  validateCyoa(pack)
    .findings.filter((f) => f.severity === "error")
    .map((f) => f.code);

/** The base pack always has a hub scene with choices; this narrows the index access. */
const sceneById = (p: CyoaPack, id: string) => {
  const s = p.scenes.find((x) => x.id === id);
  if (!s) throw new Error(`base pack has no scene "${id}" to mutate`);
  return s;
};

/** Each case = one single-defect mutation of the GREEN base, expected to emit `code`. */
interface NegativeCase {
  code: string;
  why: string;
  mutate: (p: CyoaPack) => void;
}

const CASES: NegativeCase[] = [
  {
    code: "DEAD_END",
    why: "a reachable non-ending scene is left with no choices at all",
    mutate: (p) => {
      // clue_way is reachable from the hub (the `learn_way` choice goes there). Empty
      // its choices ⇒ it is a non-ending scene with zero choices ⇒ DEAD_END. (A
      // choiceless scene is also a SOFTLOCK — it can reach no ending — so we assert
      // .includes(DEAD_END), not an exact code set, per the bug_0182 discipline.)
      sceneById(p, "clue_way").choices = [];
    },
  },
  {
    code: "START_MISSING",
    why: "meta.start names a node that does not exist",
    mutate: (p) => {
      p.meta.start = "no_such_node";
    },
  },
  {
    code: "START_NOT_SCENE",
    why: "meta.start points at a declared ending (the game would end immediately)",
    mutate: (p) => {
      // ending_hold is always declared by the generator (it is not gated on the seed's
      // greed knob). Pointing start at it is a terminal start ⇒ START_NOT_SCENE.
      p.meta.start = "ending_hold";
    },
  },
  {
    code: "ITEM_UNOBTAINABLE",
    why: "a choice requires an item that no effect anywhere grants",
    mutate: (p) => {
      // gen(0) has NO items at all, so any positively-required item is unobtainable.
      // Add the single requirement to the hub's `hold` choice (a reachable choice).
      const hold = sceneById(p, "hub").choices.find((c) => c.id === "hold");
      if (!hold) throw new Error("base pack hub has no `hold` choice to gate");
      hold.conditions.push({ has_item: "phantom_relic" });
    },
  },
  {
    // bug_0244: the IMPOSSIBLE_GATE reachability family silently skipped the
    // `quest_stage` condition kind. gen(0) writes NO set_quest_stage effect, so any
    // positively-required quest_stage gate references a (quest, stage) pair that no
    // effect ever sets ⇒ IMPOSSIBLE_QUEST_STAGE. The error severity is pinned by the
    // differential/non-degenerate anchors, which use the error-only `codesOf`.
    code: "IMPOSSIBLE_QUEST_STAGE",
    why: "a choice requires a quest_stage that no set_quest_stage effect ever writes",
    mutate: (p) => {
      const hold = sceneById(p, "hub").choices.find((c) => c.id === "hold");
      if (!hold) throw new Error("base pack hub has no `hold` choice to gate");
      hold.conditions.push({ quest_stage: { quest: "phantom_quest", stage: "phantom_stage" } });
    },
  },
];

describe("validateCyoa negative corpus — rejection-direction witnesses (bug_0218)", () => {
  it("the GREEN base validates clean and carries none of the targeted codes (differential anchor)", () => {
    const base = codesOf(GREEN);
    expect(validateCyoa(GREEN).ok).toBe(true);
    for (const c of CASES) expect(base).not.toContain(c.code);
  });

  for (const c of CASES) {
    it(`REJECTS ${c.code}: ${c.why}`, () => {
      const mutant = structuredClone(GREEN);
      c.mutate(mutant);
      const report = validateCyoa(mutant);
      expect(report.ok).toBe(false);
      expect(report.findings.map((f) => f.code)).toContain(c.code);
    });
  }

  it("the corpus is non-degenerate: every case flips a clean pack into a rejection", () => {
    for (const c of CASES) {
      const mutant = structuredClone(GREEN);
      c.mutate(mutant);
      expect(codesOf(mutant).length).toBeGreaterThan(0);
    }
  });
});
