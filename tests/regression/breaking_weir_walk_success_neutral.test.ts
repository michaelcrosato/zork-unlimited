/**
 * Regression (§15) for bug_0320 — The Breaking Weir: storm-walk success narration must
 * not claim Pell's technique on the uncounselled (gamble) path.
 *
 * bug_0197 removed "the way Pell told you" from the success journal but left behind the
 * technique language: "going low and steady" (Pell's exact phrasing) in the journal and
 * "go out low, hands on the wire, feet feeling the slick boards" (all three elements of
 * Pell's instruction) in the narrate. A blind playtester on seed 7 noted the character
 * executes the expert technique even when Pell was never consulted.
 *
 * The fix is prose-only — the single interaction is unchanged structurally. The new
 * journal drops "and going low and steady"; the new narrate replaces the technique-
 * specific opening with "you find yourself lower than you expected to be, hands tight on
 * the wire, and that is what saves you" — neutral on whether the crossing was deliberate
 * or instinctive.
 *
 * Locked BEHAVIOURALLY by driving resolveSkillCheck on both paths (max roll = lucky
 * gambler; the structural correctness of the crossing is already proven in
 * breaking_weir_skill_chain.test.ts and breaking_weir_blind_polish.test.ts):
 *   - no "going low and steady" / "low and steady" in the success journal (Pell phrase);
 *   - no "feet feeling the slick boards" in the success narrate (Pell technique detail);
 *   - no "Pell" in the success journal (consistent with bug_0197 assertion);
 *   - success narrate still contains a "line" reference (clipped action confirmed);
 *   - success narrate still contains "nerve" (the theme of the check).
 */
import { describe, it, expect } from "vitest";
import { loadRpgPackFile } from "../../src/rpg/pack.js";
import { resolveSkillCheck } from "../../src/core/skill_check.js";
import { initState } from "../../src/core/state.js";
import type { RpgPack } from "../../src/rpg/schema.js";
import type { Rng } from "../../src/core/rng.js";

/** A d20 that always rolls its MAXIMUM (20) — a lucky crossing for the unprepared gambler. */
const maxRollRng = (): Rng => ({
  next: () => 0.999999,
  int: (_min: number, max: number) => Math.floor(max),
});

const PACK_PATH = "content/rpg/pack/breaking_weir.yaml";
const loaded = loadRpgPackFile(PACK_PATH);
if (!loaded.ok) throw new Error("breaking_weir must compile");
const pack: RpgPack = loaded.compiled.pack;

function walkNerveCheck(p: RpgPack) {
  const walk = p.objects.find((o) => o.id === "walk_span")!;
  const use = walk.interactions.find((it) => it.skill_check?.skill === "nerve")!;
  return use.skill_check!;
}

function successEffects(p: RpgPack) {
  const check = walkNerveCheck(p);
  const base = initState({
    seed: 1,
    start: p.meta.start_room,
    varsInit: p.meta.vars_init,
    flagsInit: p.meta.flags_init,
  });
  // max roll: 20 + base_nerve(3) = 23 >= 9 → success
  return resolveSkillCheck(base, check, maxRollRng()).effects;
}

describe("bug_0320 — breaking_weir storm-walk success prose neutral on technique source", () => {
  it('success journal no longer says "going low and steady" (Pell\'s phrasing)', () => {
    const journal = successEffects(pack)
      .filter((e): e is { add_journal: string } => "add_journal" in e)
      .map((e) => e.add_journal)
      .join(" ");
    expect(journal).not.toBe("");
    expect(journal.toLowerCase()).not.toMatch(/going low and steady/);
    expect(journal.toLowerCase()).not.toMatch(/low and steady/);
  });

  it("success journal still credits no one the gambler never spoke to (bug_0197 regression)", () => {
    const journal = successEffects(pack)
      .filter((e): e is { add_journal: string } => "add_journal" in e)
      .map((e) => e.add_journal)
      .join(" ");
    expect(journal).not.toMatch(/Pell/i);
  });

  it('success narrate no longer describes "feet feeling the slick boards" (Pell technique detail)', () => {
    const narrate = successEffects(pack)
      .filter((e): e is { narrate: string } => "narrate" in e)
      .map((e) => e.narrate)
      .join(" ");
    expect(narrate).not.toBe("");
    expect(narrate.toLowerCase()).not.toContain("feet feeling the slick boards");
  });

  it("success narrate still confirms the life-line was the decisive factor", () => {
    const narrate = successEffects(pack)
      .filter((e): e is { narrate: string } => "narrate" in e)
      .map((e) => e.narrate)
      .join(" ");
    expect(narrate.toLowerCase()).toMatch(/wire|line/); // the clipped line is what held them
    expect(narrate.toLowerCase()).toContain("nerve"); // nerve was what the check tested
  });
});
