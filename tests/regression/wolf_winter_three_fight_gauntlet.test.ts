/**
 * Regression (§15) for bug_0189 — The Wolf-Winter: the project's FOURTH RPG pack and
 * the SECOND to set `meta.combat_guaranteed: true` (after The Dawn Beacon, bug_0187).
 *
 * Where the Dawn Beacon is a fair TWO-fight gauntlet, this is a fair THREE-fight one —
 * the first curated pack to drive the cumulative-HP gauntlet bound
 * (COMBAT_GAUNTLET_NOT_GUARANTEED, bug_0172) across three sequential fights. The
 * cumulative bound is an order-independent OVER-approximation of worst total damage
 * (Σ per-fight worst-case maxDamageTaken), so a third fight makes the surface strictly
 * harder to satisfy than two: more fights to sum, the same reachable-HP budget.
 *
 * This pins the pack-specific claims (the auto-discovered suites already prove the
 * generic structure — all-endings reachability, no soft-lock pocket, score economy,
 * action-id uniqueness, variant liveness — for every pack the moment it ships):
 *   (1) the pack validates with ZERO errors AND genuinely opts in
 *       (combat_guaranteed === true) over THREE enemies, with BOTH guarantee codes
 *       ABSENT — the fair three-fight gauntlet GREEN on disk;
 *   (2) BOTH prep buffs are load-bearing on the CUMULATIVE bound SPECIFICALLY — the
 *       distinctive property a three-fight pack lets us pin. Best reachable stats are
 *       atk7 (base 5 + Cade's +2 counsel) / def5 (base 3 + the byre-jerkin's +2) /
 *       hp30, and the wolves are def2, atk 4/5/6, hp 11/12/13:
 *         - with both buffs: per-fight worst-case 5 / 6 / 14 (each < 30) and cumulative
 *           5 + 6 + 14 = 25 < 30 — every code clear;
 *         - zero the byre-jerkin's +2 defense (def5→3): worst incoming rises to 7/8/9,
 *           per-fight 7 / 8 / 18 (each STILL < 30) but cumulative 7 + 8 + 18 = 33 ≥ 30 —
 *           ONLY the cumulative bound breaks;
 *         - zero Cade's +2 attack (atk7→5): worst player damage falls to 4, rounds rise
 *           to 3/3/4, per-fight 10 / 12 / 21 (each STILL < 30) but cumulative
 *           10 + 12 + 21 = 43 ≥ 30 — again ONLY the cumulative bound breaks.
 *       So across three fights neither buff is decorative AND neither is needed by any
 *       single fight: each is required by the SEQUENCE. Strip either and every fight
 *       still passes in isolation while the gauntlet promise breaks — exactly the
 *       multi-fight failure mode COMBAT_GAUNTLET_NOT_GUARANTEED exists to catch, here
 *       stressed harder than the Dawn Beacon's two fights ever could.
 *
 * Out-of-band teeth: the differential mutations below were confirmed to flip the
 * report RED on the cumulative code while leaving the per-fight code absent, and the
 * unmutated pack is clean — a genuine guarantee witness, not a vacuous green.
 */
import { describe, it, expect } from "vitest";
import { loadRpgPackFile } from "../../src/rpg/pack.js";
import { validateRpg } from "../../src/validate/rpg_validator.js";
import type { RpgPack } from "../../src/rpg/schema.js";
import type { Effect } from "../../src/core/effects.js";

const PACK_PATH = "content/rpg/pack/wolf_winter.yaml";

function loadPack(): RpgPack {
  const r = loadRpgPackFile(PACK_PATH);
  expect(r.ok, "wolf_winter must load").toBe(true);
  if (!r.ok) throw new Error("unreachable");
  return r.compiled.pack;
}

function codes(pack: RpgPack): string[] {
  return validateRpg(pack).findings.map((f) => f.code);
}

/**
 * Zero the `by` of any `inc_var` targeting `varName` across every effect list in a
 * compiled RPG pack — statCeiling credits Math.max(0, by), so `by: 0` removes that
 * buff from the player's best-reachable stat without changing the pack's shape (the
 * same probe used by the Dawn Beacon witness, bug_0187).
 */
function zeroBuff(pack: RpgPack, varName: string): RpgPack {
  const clone = structuredClone(pack);
  const scrub = (effects: Effect[] | undefined): void => {
    for (const e of effects ?? [])
      if ("inc_var" in e && e.inc_var.name === varName) e.inc_var.by = 0;
  };
  for (const r of clone.rooms) scrub(r.on_enter);
  for (const o of clone.objects) {
    for (const it of o.interactions) {
      scrub(it.effects);
      scrub(it.skill_check?.on_success);
      scrub(it.skill_check?.on_failure);
    }
  }
  for (const n of clone.npcs) for (const node of n.dialogue.nodes) scrub(node.effects);
  for (const en of clone.enemies) scrub(en.on_defeat);
  return clone;
}

describe("bug_0189 — The Wolf-Winter: a fair THREE-fight combat_guaranteed gauntlet", () => {
  it("validates clean and genuinely opts in over THREE fights, both guarantee codes absent", () => {
    const pack = loadPack();
    expect(pack.meta.combat_guaranteed).toBe(true);
    expect(pack.enemies.length).toBe(3); // a three-fight GAUNTLET, harder cumulative surface
    const report = validateRpg(pack);
    expect(report.findings.filter((f) => f.severity === "error")).toEqual([]);
    const c = report.findings.map((f) => f.code);
    expect(c).not.toContain("COMBAT_NOT_GUARANTEED");
    expect(c).not.toContain("COMBAT_GAUNTLET_NOT_GUARANTEED");
    expect(c).not.toContain("COMBAT_UNWINNABLE");
  });

  it("the byre-jerkin's +2 defense is load-bearing on the CUMULATIVE bound alone", () => {
    // def5→3: per-fight worst-case 7/8/18 (each < 30 reachable HP, so each fight still
    // clears alone) but jointly 7 + 8 + 18 = 33 ≥ 30 — only the three-fight bound breaks.
    const c = codes(zeroBuff(loadPack(), "defense"));
    expect(c).toContain("COMBAT_GAUNTLET_NOT_GUARANTEED");
    expect(c).not.toContain("COMBAT_NOT_GUARANTEED"); // every single fight still clears
    expect(c).not.toContain("COMBAT_UNWINNABLE"); // and stays best-case winnable
  });

  it("Cade's +2 attack is load-bearing on the CUMULATIVE bound alone too", () => {
    // atk7→5: worst player damage 4, rounds 3/3/4, per-fight 10/12/21 (each < 30) but
    // jointly 10 + 12 + 21 = 43 ≥ 30 — again only the three-fight bound breaks. So across
    // three fights BOTH buffs are needed by the SEQUENCE, neither by any single fight.
    const c = codes(zeroBuff(loadPack(), "attack"));
    expect(c).toContain("COMBAT_GAUNTLET_NOT_GUARANTEED");
    expect(c).not.toContain("COMBAT_NOT_GUARANTEED"); // every single fight still clears
    expect(c).not.toContain("COMBAT_UNWINNABLE");
  });

  it("stripping BOTH buffs still only ever breaks the cumulative guarantee, never winnability", () => {
    // The unprepared hunter (base atk5/def3) can still WIN on lucky rolls — the fights
    // stay a genuine gamble (the death ending is reachable, never an unwinnable wall) —
    // so COMBAT_UNWINNABLE (the best-case lower bound) must stay absent even with no prep.
    const stripped = zeroBuff(zeroBuff(loadPack(), "defense"), "attack");
    const c = codes(stripped);
    expect(c).toContain("COMBAT_GAUNTLET_NOT_GUARANTEED");
    expect(c).not.toContain("COMBAT_UNWINNABLE");
  });

  it("the score economy sums to the declared max (5 + 5 + 5 + 10·3 + 15 = 60, bug_0239)", () => {
    const pack = loadPack();
    // bug_0239: the two prep acts (heed counsel, don jerkin) now score +5 each on top of
    // the day-book +5, the three +10 wolf kills, and the +15 cattle capstone.
    expect(pack.meta.max_score).toBe(60);
  });
});
