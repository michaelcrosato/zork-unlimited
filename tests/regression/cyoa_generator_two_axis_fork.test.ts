/**
 * bug_0169 — the procedural CYOA generator emits a TWO-AXIS (2x2-knowledge) moral fork.
 *
 * bug_0168's next-focus named the deepening: the CYOA generator was "the shallowest" of the three
 * — "single `truth` flag / single gate — it cannot emit the two-axis 2x2 moral fork dead_reckoning
 * has; a second knowledge axis or a second gate tier would deepen it". v2 grows that second axis:
 * TWO independent investigations, in either order, each set their own flag — a SITUATIONAL truth
 * (`knows_way`) and a PERSONAL truth (`knows_ally`) — forming a 2x2 of knowledge over a finale of
 * three-or-four telegraphed acts. The "best" act is GATED on the PERSONAL axis, and BOTH axes drive
 * reactive reframing variants (the white_stag paired-epilogue device), so the hub now carries a
 * three-variant first-match-wins stack that MUST be ordered most-specific-first or the validator's
 * UNREACHABLE_VARIANT shadowing check fires.
 *
 * tests/unit/cyoa_generator.test.ts already holds every emitted pack to the full shipped bar
 * (schema-valid, validator-clean, exhaustively solvable) across 24 seeds, and
 * held_out_corpus_sealed.test.ts pins the re-mint determinism + generator_version. THIS guard is
 * the standing proof of the two-axis SHAPE specifically: it fails loudly if a future change
 * collapses the generator back to a single axis / single gate (which would still pass the generic
 * bar but quietly hollow out the deepening). It asserts both the static structure and the
 * BEHAVIORAL independence + load-bearingness of the two axes.
 */
import { describe, it, expect } from "vitest";
import { generateCyoaPack, CYOA_GENERATOR_VERSION } from "../../src/gen/cyoa_generator.js";
import { indexPack, buildRules, initStateForPack } from "../../src/cyoa/runner.js";
import type { Action } from "../../src/api/types.js";
import { exhaustiveEndings } from "./support/exhaustive_endings.js";

const SEEDS = Array.from({ length: 12 }, (_, i) => i);
const MAX_STATES = 50_000;
const WAY = "knows_way";
const ALLY = "knows_ally";

// The flag a `{ has_flag: x }` condition reads (or undefined for any other shape).
const hasFlag = (c: unknown): string | undefined =>
  c !== null && typeof c === "object" && "has_flag" in c
    ? (c as { has_flag: string }).has_flag
    : undefined;

describe("bug_0169 — the CYOA generator emits a two-axis (2x2-knowledge) moral fork", () => {
  it("the generator version is bumped to 2 (the v2 deepening; the corpus is re-sealed to match)", () => {
    expect(CYOA_GENERATOR_VERSION).toBe(2);
  });

  for (const seed of SEEDS) {
    it(`seed ${seed}: two independent investigations, a personal-axis gate, an ordered reframe stack`, () => {
      const pack = generateCyoaPack(seed);
      const sceneById = new Map(pack.scenes.map((s) => [s.id, s]));

      // Two distinct investigation scenes, one per axis (a single-axis generator would lack one).
      const clueWay = sceneById.get("clue_way");
      const clueAlly = sceneById.get("clue_ally");
      const hub = sceneById.get("hub");
      expect(clueWay, "missing the situational investigation scene").toBeDefined();
      expect(clueAlly, "missing the personal investigation scene").toBeDefined();
      expect(hub, "missing the hub").toBeDefined();

      // Each investigation's read sets ITS OWN distinct flag (the two independent axes).
      const setFlagsIn = (sceneId: string): string[] =>
        (sceneById.get(sceneId)?.choices ?? [])
          .flatMap((c) => c.effects)
          .flatMap((e) => ("set_flag" in e ? [e.set_flag] : []));
      expect(setFlagsIn("clue_way")).toContain(WAY);
      expect(setFlagsIn("clue_ally")).toContain(ALLY);
      expect(WAY).not.toBe(ALLY);

      // The hub offers both investigations (each gated not_flag on its own axis) and the gated
      // `best` act keyed on the PERSONAL axis only.
      const learnWay = hub!.choices.find((c) => c.id === "learn_way")!;
      const learnAlly = hub!.choices.find((c) => c.id === "learn_ally")!;
      const best = hub!.choices.find((c) => c.id === "best")!;
      expect(learnWay.conditions.map(hasFlag)).not.toContain(WAY); // gated not_flag, so retires once known
      expect(learnAlly.conditions.map(hasFlag)).not.toContain(ALLY);
      // The `best` act gates on the PERSONAL axis (knows_ally), NOT the situational one.
      expect(best.conditions.map(hasFlag)).toContain(ALLY);
      expect(best.conditions.map(hasFlag)).not.toContain(WAY);

      // The hub's reactive stack is ordered MOST-SPECIFIC FIRST: the both-flags variant precedes
      // each single-flag variant, or the validator's UNREACHABLE_VARIANT shadowing check fires.
      const variants = hub!.variants ?? [];
      expect(variants.length).toBe(3);
      const v0 = variants[0]!.when[0]!;
      expect("all_of" in v0, "first hub variant must be the both-flags (most specific) one").toBe(
        true,
      );
      const bothFlags = ("all_of" in v0 ? v0.all_of : []).map(hasFlag);
      expect(bothFlags).toContain(WAY);
      expect(bothFlags).toContain(ALLY);
      expect(variants[1]!.when.map(hasFlag)).toEqual([WAY]);
      expect(variants[2]!.when.map(hasFlag)).toEqual([ALLY]);

      // The 2x2 reframing: hold/best/greed endings reframe on the SITUATIONAL axis, the dark
      // ending reframes on the PERSONAL axis (each carries exactly one reactive variant).
      const endingById = new Map(pack.endings.map((e) => [e.id, e]));
      const axisOf = (endingId: string): string | undefined =>
        endingById.get(endingId)?.variants?.[0]?.when?.[0] !== undefined
          ? hasFlag(endingById.get(endingId)!.variants![0]!.when[0])
          : undefined;
      expect(axisOf("ending_hold")).toBe(WAY);
      expect(axisOf("ending_best")).toBe(WAY);
      expect(axisOf("ending_dark")).toBe(ALLY);
      if (endingById.has("ending_greed")) expect(axisOf("ending_greed")).toBe(WAY);
    });
  }

  it("the PERSONAL gate is load-bearing: without learning the ally, ending_best is unreachable", () => {
    // Walk only the moves available WITHOUT ever entering the personal investigation: knows_ally is
    // never set, so the gated `best` act is never offered and ending_best can never fire.
    const pack = generateCyoaPack(0);
    const index = indexPack(pack);
    const rules = buildRules(index);
    const noAlly = (a: Action): boolean => !(a.type === "CHOOSE" && a.choiceId === "learn_ally");
    const { reached, cappedOut } = exhaustiveEndings(
      rules,
      initStateForPack(index, 0),
      MAX_STATES,
      undefined,
      { explore: noAlly },
    );
    expect(cappedOut).toBe(false);
    expect(
      reached.has("ending_best"),
      "ending_best reachable without the ally — gate is decorative",
    ).toBe(false);
    // The other acts remain reachable — the gate removes only the best act, not the whole game.
    expect(reached.has("ending_hold")).toBe(true);
    expect(reached.has("ending_dark")).toBe(true);
  });

  it("the two axes are INDEPENDENT: the situational truth does NOT gate the best act", () => {
    // The mirror proof: block the SITUATIONAL investigation instead. knows_way is never set, yet the
    // best act stays reachable (it gates on knows_ally only) — so the two axes are genuinely
    // independent gates, not the same gate twice.
    const pack = generateCyoaPack(0);
    const index = indexPack(pack);
    const rules = buildRules(index);
    const noWay = (a: Action): boolean => !(a.type === "CHOOSE" && a.choiceId === "learn_way");
    const { reached, cappedOut } = exhaustiveEndings(
      rules,
      initStateForPack(index, 0),
      MAX_STATES,
      undefined,
      { explore: noWay },
    );
    expect(cappedOut).toBe(false);
    expect(
      reached.has("ending_best"),
      "ending_best unreachable without the situational truth — the axes are not independent",
    ).toBe(true);
  });
});
