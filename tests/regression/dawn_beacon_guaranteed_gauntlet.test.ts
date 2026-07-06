/**
 * Regression (§15) for bug_0187 — The Dawn Beacon: the project's THIRD RPG pack and
 * the FIRST curated pack (any mode) to set `meta.combat_guaranteed: true`.
 *
 * The two existing RPG packs are deliberate GAMBLES (cold_forge bug_0101 /
 * sunken_barrow bug_0102): even a fully-prepared player can die on bad rolls, and
 * neither opts in, so the validator's UPPER-bound checks — COMBAT_NOT_GUARANTEED
 * (bug_0114, per-fight) and COMBAT_GAUNTLET_NOT_GUARANTEED (bug_0172, cumulative
 * across a sequence) — were only ever exercised GREEN by the generator (bug_0173)
 * and RED by synthetic packs (rpg_combat_guaranteed_optin / the negative corpus
 * bug_0182). No CURATED, hand-authored pack drove them. The Dawn Beacon is that
 * pack: a fair TWO-FIGHT gauntlet whose old watchman can make a TRUE promise of
 * safety because the validator proves it for the best-prepared player.
 *
 * This pins the pack-specific claims (the auto-discovered suites already prove the
 * generic structure — all-endings reachability, no soft-lock pocket, score economy,
 * action-id uniqueness, variant liveness — for every pack the moment it ships):
 *   (1) the curated pack validates with ZERO errors AND genuinely opts in
 *       (combat_guaranteed === true), with BOTH guarantee codes ABSENT — i.e. it
 *       exercises the fair-gauntlet surface GREEN for the first time on disk;
 *   (2) the guarantee is LOAD-BEARING, not slack (the cold_forge/sunken_barrow
 *       "the buff flips a lethal fight" discipline, at the guarantee level): the
 *       promise rests on BOTH prep buffs, shown by a copy-mutate differential —
 *         - zero the garrison mail's +2 defense (best reachable def 4 → 2) and the
 *           pack now fails ONLY the CUMULATIVE bound (each fight still clears the
 *           per-fight bound alone, but jointly the worst-case damage 9+18 = 27 ≥ 26
 *           HP) — proving the mail is exactly what clears the MULTI-FIGHT surface;
 *         - zero the watchman's +2 attack (best reachable atk 6 → 4) and the longer
 *           fights breach the per-fight bound too (fight B worst-case 28 ≥ 26).
 *       So neither buff is decorative: strip either and the audited promise breaks.
 *
 * Out-of-band teeth: the differential mutations below were confirmed to flip the
 * report RED, and the unmutated pack is clean — so this is a genuine guarantee
 * witness, not a vacuous green.
 */
import { describe, it, expect } from "vitest";
import { loadRpgSourceFile } from "../../src/rpg/source.js";
import { validateRpg } from "../../src/validate/rpg_validator.js";
import type { RpgPack } from "../../src/rpg/schema.js";
import type { Effect } from "../../src/core/effects.js";

const PACK_PATH = "content/rpg/pack/dawn_beacon.yaml";

function loadPack(): RpgPack {
  const r = loadRpgSourceFile(PACK_PATH);
  expect(r.ok, "dawn_beacon must load").toBe(true);
  if (!r.ok) throw new Error("unreachable");
  return r.compiled.pack;
}

function codes(pack: RpgPack): string[] {
  return validateRpg(pack).findings.map((f) => f.code);
}

/**
 * Walk every effect list in a compiled RPG pack (room on_enter, object interactions
 * + their skill-check branches, NPC dialogue nodes, enemy on_defeat) and zero the
 * `by` of any `inc_var` targeting `varName`. statCeiling credits Math.max(0, by), so
 * `by: 0` removes that buff from the player's best-reachable stat without changing
 * the pack's shape — the cleanest way to ask "what if this prep didn't exist?".
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

describe("bug_0187 — The Dawn Beacon: the first curated combat_guaranteed gauntlet", () => {
  it("validates clean and genuinely opts in, with both guarantee codes absent", () => {
    const pack = loadPack();
    expect(pack.meta.combat_guaranteed).toBe(true);
    expect(pack.enemies.length).toBe(2); // a real GAUNTLET, not a single fight
    const report = validateRpg(pack);
    expect(report.findings.filter((f) => f.severity === "error")).toEqual([]);
    const c = report.findings.map((f) => f.code);
    expect(c).not.toContain("COMBAT_NOT_GUARANTEED");
    expect(c).not.toContain("COMBAT_GAUNTLET_NOT_GUARANTEED");
    expect(c).not.toContain("COMBAT_UNWINNABLE");
  });

  it("the cumulative (multi-fight) bound is load-bearing: stripping the +2-defense mail breaks ONLY it", () => {
    // With best reachable def 4→2 the per-fight worst-case rises to 9 and 18 (each < 26),
    // but jointly 9 + 18 = 27 ≥ 26 reachable HP — the gauntlet is no longer jointly
    // survivable. This is the exact MULTI-FIGHT surface no curated pack drove before.
    const c = codes(zeroBuff(loadPack(), "defense"));
    expect(c).toContain("COMBAT_GAUNTLET_NOT_GUARANTEED");
    expect(c).not.toContain("COMBAT_NOT_GUARANTEED"); // each fight still clears alone
    expect(c).not.toContain("COMBAT_UNWINNABLE"); // and stays best-case winnable
  });

  it("the per-fight bound is load-bearing too: stripping the watchman's +2 attack breaks the promise", () => {
    // With best reachable atk 6→4 the fights take more rounds, so fight B's worst-case
    // damage 28 ≥ 26 breaches the per-fight bound (and the cumulative one with it).
    const c = codes(zeroBuff(loadPack(), "attack"));
    expect(c).toContain("COMBAT_NOT_GUARANTEED");
    expect(c).toContain("COMBAT_GAUNTLET_NOT_GUARANTEED");
    expect(c).not.toContain("COMBAT_UNWINNABLE"); // still winnable on the luckiest rolls
  });

  it("the two existing RPG packs remain gambles (do NOT opt in) — no false guarantee", () => {
    for (const path of [
      "content/rpg/pack/cold_forge.yaml",
      "content/rpg/pack/sunken_barrow.yaml",
    ]) {
      const r = loadRpgSourceFile(path);
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.compiled.pack.meta.combat_guaranteed).toBeUndefined();
    }
  });
});
