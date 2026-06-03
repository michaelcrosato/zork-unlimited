/**
 * bug_0173 — the procedural RPG generator emits a DECLARED, CUMULATIVE-SURVIVABLE
 * `combat_guaranteed` gauntlet (the v3 re-tune).
 *
 * v2 (bug_0171) deepened the generator to a two-fight gauntlet but left it an UNDECLARED gamble:
 * each fight was winnable on best reachable stats, yet the then per-fight `combat_guaranteed`
 * upper bound (bug_0114) could not see cumulative HP drain across the sequence, so the generator
 * dared not set the flag. bug_0172 made `validateRpg` cumulative-HP-aware
 * (`COMBAT_GAUNTLET_NOT_GUARANTEED`) — but that hardest check ran ONLY against frozen witness
 * packs in rpg_combat_guaranteed_optin.test.ts, never against the per-cycle MOVING distribution.
 *
 * v3 re-tunes the two enemies so a FULLY-PREPARED descent (the spirit's +2 attack and the cell
 * ward's +2 defense, both optional) survives BOTH fights on EVERY roll AND cumulatively, so the
 * pack soundly sets `meta.combat_guaranteed: true` and EVERY mint exercises the cumulative bound
 * as a GREEN case — the validator's hardest check becomes a per-mint obligation, not a frozen
 * target. This guard pins, across the emitted distribution:
 *   (1) every mint opts in (`meta.combat_guaranteed === true`);
 *   (2) the guarantee is GREEN and non-vacuous: NO combat finding (UNWINNABLE / NOT_GUARANTEED /
 *       GAUNTLET_NOT_GUARANTEED) on the real pack;
 *   (3) the cumulative check is genuinely LOAD-BEARING — a single mutation that pushes only the
 *       JOINT worst-case over the HP bound (each fight still passes ALONE) makes
 *       COMBAT_GAUNTLET_NOT_GUARANTEED fire, so the green of (2) is real, not a dormant check;
 *   (4) the promise is CONDITIONAL ON PREPARATION — both death endings stay reachable for an
 *       under-prepared player (the 3-ending census the bracket proves), so the guarantee did not
 *       silently neuter the gamble that makes the deaths reachable.
 */
import { describe, it, expect } from "vitest";
import type { Rng } from "../../src/core/rng.js";
import type { GameState } from "../../src/core/state.js";
import { generateRpgPack } from "../../src/gen/rpg_generator.js";
import { validateRpg } from "../../src/validate/rpg_validator.js";
import { indexRpgPack, buildRpgRules, initStateForRpgPack } from "../../src/rpg/runner.js";
import { exhaustiveEndingsMulti } from "./support/exhaustive_endings.js";

const SEEDS = Array.from({ length: 12 }, (_, i) => i);
const MAX_STATES = 200_000;
const COMBAT_CODES = [
  "COMBAT_UNWINNABLE",
  "COMBAT_NOT_GUARANTEED",
  "COMBAT_GAUNTLET_NOT_GUARANTEED",
];

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

describe("bug_0173 — the RPG generator emits a guaranteed cumulative-survivable gauntlet", () => {
  for (const seed of SEEDS) {
    it(`seed ${seed}: opts in to combat_guaranteed and clears it green (non-vacuously)`, () => {
      const pack = generateRpgPack(seed);

      // (1) every mint declares the guarantee.
      expect(pack.meta.combat_guaranteed).toBe(true);

      // (2) GREEN: no combat finding at all — the cumulative bound passes on the real stats.
      const codes = validateRpg(pack).findings.map((f) => f.code);
      for (const c of COMBAT_CODES) expect(codes, `unexpected ${c}`).not.toContain(c);

      // (3) LOAD-BEARING: bump ONLY the span guardian's attack so each fight still passes the
      // per-fight upper bound alone but the JOINT worst-case crosses the HP bound. With best
      // reachable atk6/def4, the guardian's worst-case blow is max(1,6+atk-4): at atk 7 that is 9,
      // worstRounds ceil(9/3)=3 ⇒ maxDamageTaken 9*2 = 18 < 20 (no per-fight COMBAT_NOT_GUARANTEED),
      // while the sentinel's 3 + 18 = 21 ≥ 20 trips the cumulative check. So only the gauntlet code
      // may fire — proving the green above is the cumulative bound actually holding, not dormant.
      const mutant = structuredClone(pack);
      const guardian = mutant.enemies.find((e) => e.id === "warden");
      expect(guardian, "missing the span guardian").toBeDefined();
      guardian!.attack = 7;
      const mutantCodes = validateRpg(mutant).findings.map((f) => f.code);
      expect(mutantCodes).toContain("COMBAT_GAUNTLET_NOT_GUARANTEED");
      expect(mutantCodes).not.toContain("COMBAT_NOT_GUARANTEED"); // each fight still passes alone
      expect(mutantCodes).not.toContain("COMBAT_UNWINNABLE"); // still best-case winnable

      // (4) CONDITIONAL ON PREPARATION: the guarantee did not neuter the gamble — an under-prepared
      // player can still fall to EITHER keeper, so both death endings remain reachable by concrete
      // best/worst-roll play alongside the victory (the 3-ending census).
      const index = indexRpgPack(pack);
      const start: GameState = initStateForRpgPack(index, seed);
      const ruleSets = [buildRpgRules(index, bestRng), buildRpgRules(index, worstRng)];
      const { reached, cappedOut } = exhaustiveEndingsMulti(ruleSets, start, MAX_STATES);
      expect(cappedOut).toBe(false);
      expect(reached.has("ending_victory")).toBe(true);
      expect(reached.has("ending_fallen_sentinel"), "sentinel death unreachable").toBe(true);
      expect(reached.has("ending_fallen_guardian"), "guardian death unreachable").toBe(true);
      expect(reached.size).toBe(3);
    });
  }
});
