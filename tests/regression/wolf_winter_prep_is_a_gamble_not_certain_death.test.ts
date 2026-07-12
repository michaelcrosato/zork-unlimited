/**
 * Regression (§15) for bug_0195 — The Wolf-Winter: the day-book's prep clue once read
 * "BOTH, OR NOTHING", which a blind playtester (ai-runs/2026-06-03T18-10-35-852Z) read
 * as a binary promise — do both prep steps or be pulled down. But the mechanic is not
 * binary: skipping prep is a GAMBLE, not certain death. On two seeds the playtester's
 * unprepared rush won comfortably, so the loud "or nothing" over-claimed the stakes and
 * the fiction felt like it had lied. The day-book now makes the honest two-sided risk
 * diegetic: one watchman used Cade's knack and the jerkin and stood, another trusted his
 * spear alone and bled, and doing less still gambles the byre on the night's luck. Cade's
 * spoken line retains the validator-proven prepared guarantee.
 *
 * This test LOCKS the mechanical fact the prose now states — the two-sided gamble — so a
 * future retune can't silently break the calibration in either direction:
 *
 *   - the SAME zero-prep rush (skip the day-book, skip Cade, skip the byre-jerkin; just
 *     march north and fight whatever blocks the corridor) WINS under the player's BEST
 *     rolls and DIES under the player's WORST rolls. Best→win is the "you may hold the
 *     byre yet" half (the gamble is winnable, prep is not the only path to survival);
 *     worst→death is the "you gamble it on the night's luck" half (the death is real,
 *     not a bluff). Both regimes draw only LEGAL die faces (d6 1 and 6), so both routes
 *     are reachable by some concrete seed — the same soundness the all-endings solver
 *     rests on (rpg_all_endings_reachable.test.ts).
 *
 * This is the dynamic-play complement to the static bounds the validator/solver already
 * prove: combat_guaranteed proves the PREPARED hunter always lives (rpg_validator.ts,
 * the three-fight gauntlet test); the all-endings solver proves the death ending is
 * reachable at all. Neither asserts that an UNPREPARED hunter genuinely straddles both
 * outcomes from one route — which is exactly what makes "it's a gamble" true rather than
 * decorative, and what the recalibrated day-book now promises. If a retune made the
 * wolves so weak that even worst rolls can't kill the unprepared rush, or so brutal that
 * even best rolls can't carry it, this fails loudly and the prose would need revisiting.
 */
import { describe, it, expect } from "vitest";
import { makeStep } from "../../src/core/engine.js";
import type { RpgAction } from "../../src/api/types.js";
import type { GameState } from "../../src/core/state.js";
import type { Rng } from "../../src/core/rng.js";
import { loadRpgSourceFile } from "../../src/rpg/source.js";
import { indexRpgPack, buildRpgRules, initStateForRpgPack } from "../../src/rpg/runner.js";
import { HP_VAR } from "../../src/rpg/schema.js";

const PACK_PATH = "content/rpg/quests/wolf_winter.yaml";
const SEED = 7;

/**
 * Fixed-sequence PRNG (same construction as rpg_all_endings_reachable.test.ts): each draw
 * consumes the next fraction; HIGH maps to the max die face, LOW to the min. resolveAttack
 * draws the player's strike first, the enemy's reply second — so BEST for the player is
 * [HIGH, LOW] (max strike, min damage taken) and WORST is [LOW, HIGH].
 */
const HIGH = 0.999999;
const LOW = 0;
function fixedSeqRng(fracs: number[]): Rng {
  let i = 0;
  const next = (): number => {
    const f = fracs[Math.min(i, fracs.length - 1)] ?? 0;
    i += 1;
    return f;
  };
  return {
    next,
    int(min: number, max: number): number {
      const lo = Math.ceil(min);
      const hi = Math.floor(max);
      return lo + Math.floor(next() * (hi - lo + 1));
    },
  };
}
const bestRng = (): Rng => fixedSeqRng([HIGH, LOW]);
const worstRng = (): Rng => fixedSeqRng([LOW, HIGH]);

/**
 * Drive the UNPREPARED corridor rush to its end under a fixed roll regime: from each
 * state, take an authored opening if one is offered, otherwise ATTACK a blocking wolf or
 * march north. This deliberately never reads the day-book, never talks to Cade, never
 * enters the store — so no prep flag is ever set and attack/defense stay at init values.
 * The greedy policy terminates: every combat round lowers an HP, every MOVE advances.
 */
function rushNorthUnprepared(rng: () => Rng): GameState {
  const loaded = loadRpgSourceFile(PACK_PATH);
  expect(loaded.ok, "wolf_winter must load").toBe(true);
  if (!loaded.ok) throw new Error("unreachable");
  const index = indexRpgPack(loaded.compiled.pack);
  const rules = buildRpgRules(index, rng);
  const step = makeStep(rules);
  let state = initStateForRpgPack(index, SEED);
  for (let guard = 0; guard < 200 && !state.ended; guard += 1) {
    const legal = rules.legalActions(state);
    const attack = legal.find(
      (a): a is Extract<RpgAction, { type: "ATTACK" }> => a.type === "ATTACK",
    );
    const maneuver = legal.find(
      (a): a is Extract<RpgAction, { type: "MANEUVER" }> => a.type === "MANEUVER",
    );
    const north = legal.find(
      (a): a is Extract<RpgAction, { type: "MOVE" }> =>
        a.type === "MOVE" && a.direction === "north",
    );
    const RpgAction = maneuver ?? attack ?? north;
    expect(
      RpgAction,
      `rush got stuck with no fight and no way north: ${JSON.stringify(legal)}`,
    ).toBeTruthy();
    const res = step(state, RpgAction as RpgAction);
    expect(res.ok, `engine rejected the rush step: ${res.rejectionReason}`).toBe(true);
    state = res.state;
  }
  expect(state.ended, "the unprepared rush must terminate within the guard").toBe(true);
  // Witness that the route really WAS unprepared: no prep flag, init stats untouched.
  expect(state.flags.heard_counsel ?? false).toBe(false);
  expect(state.flags.heard_plan ?? false).toBe(false);
  expect(state.flags.jerkin_donned ?? false).toBe(false);
  expect(state.flags.read_tally ?? false).toBe(false);
  expect(state.vars.attack).toBe(5);
  expect(state.vars.defense).toBe(3);
  return state;
}

describe("bug_0195 — The Wolf-Winter: skipping prep is a GAMBLE, not certain death", () => {
  it("the unprepared rush WINS on the player's BEST rolls (the 'you may hold the byre yet' half)", () => {
    const state = rushNorthUnprepared(bestRng);
    expect(state.endingId).toBe("ending_held");
    expect(state.vars[HP_VAR]).toBeGreaterThan(0);
    // 3 wolves × 10 + the +15 capstone, but NOT the day-book's +5 (it was never read) —
    // confirming the win came from a genuinely unprepared run.
    expect(state.vars.score).toBe(45);
  });

  it("the SAME unprepared rush DIES on the player's WORST rolls (the 'gamble it on the night's luck' half)", () => {
    const state = rushNorthUnprepared(worstRng);
    const loaded = loadRpgSourceFile(PACK_PATH);
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    const ending = loaded.compiled.pack.endings.find((e) => e.id === state.endingId);
    expect(
      ending?.death,
      `worst-roll unprepared rush should reach a death ending, got ${state.endingId}`,
    ).toBe(true);
    expect(state.vars[HP_VAR]).toBeLessThanOrEqual(0);
  });
});
