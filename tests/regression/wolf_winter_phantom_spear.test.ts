/**
 * Regression (§15) for bug_0191 — The Wolf-Winter blind-pass content fixes.
 *
 * The bug_0190 blind playtest of wolf_winter found a PHANTOM-SPEAR contradiction: the
 * day-book ("SPEAR AND PADDING OR NOTHING") and Cade ("speared right ... both, mind")
 * both promised a *spear* as a hard requirement, but no spear ITEM exists in the world —
 * the +2 attack actually comes from ASKING Cade, and the player who took the clue
 * literally hunted the steading for a weapon that was never there. The hunting-spear is
 * the hunter's equipped weapon (reflected in base attack 5), not loot; the two things the
 * player must actually GATHER are Cade's counsel (+2 atk) and the byre-jerkin (+2 def).
 *
 * Plus a lesser bug_0188-class stale attribution: the yearling's on_defeat journal said
 * "the way Cade said" even on the route where the player never spoke to Cade.
 *
 * The fix is content-only and TRUE-in-all-reachable-states (the bug_0186 discipline):
 *   (1) the opening room now establishes the spear is ALREADY in the hunter's hand, so a
 *       first-timer never goes looking for a weapon item;
 *   (2) the day-book no longer reads as a "SPEAR AND PADDING" shopping list — it states
 *       the hunter has his spear already and asks only for Cade's counsel + the jerkin;
 *   (3) the yearling-kill journal drops the "the way Cade said" attribution so it is true
 *       on BOTH the heard-counsel and the no-dialogue routes.
 *
 * These assert on the REAL shipped pack text; each assertion fails on the pre-fix YAML
 * (genuine witness, not vacuous green). The combat/guarantee math is untouched — the
 * +2 attack still comes from Cade's counsel, so wolf_winter_three_fight_gauntlet.test.ts
 * stays green and no validator surface moves.
 */
import { describe, it, expect } from "vitest";
import { loadRpgPackFile } from "../../src/rpg/pack.js";
import type { RpgPack } from "../../src/rpg/schema.js";

const PACK_PATH = "content/rpg/pack/wolf_winter.yaml";

function loadPack(): RpgPack {
  const r = loadRpgPackFile(PACK_PATH);
  expect(r.ok, "wolf_winter must load").toBe(true);
  if (!r.ok) throw new Error("unreachable");
  return r.compiled.pack;
}

describe("bug_0191 — The Wolf-Winter: no phantom spear, no stale Cade attribution", () => {
  it("the opening room establishes the spear is ALREADY in the hunter's hand", () => {
    const start = loadPack().rooms.find((r) => r.id === "steading_yard");
    expect(start, "steading_yard must exist").toBeDefined();
    const desc = start!.description.toLowerCase();
    expect(desc).toContain("spear");
    expect(desc).toContain("already"); // it is in hand, not loot to be found
  });

  it("the day-book points the player at Cade + the jerkin, NOT a phantom spear to find", () => {
    const book = loadPack().objects.find((o) => o.id === "day_book");
    expect(book, "day_book must exist").toBeDefined();
    const read = book!.read_text ?? "";
    // The old shopping-list framing that sent the blind tester hunting for a weapon.
    expect(read).not.toMatch(/SPEAR AND PADDING/i);
    // The clue must still name the two things actually gathered: counsel + the jerkin.
    expect(read).toMatch(/CADE/i);
    expect(read).toMatch(/JERKIN/i);
    // And it must make clear the spear is already had (so no one looks for one).
    expect(read).toMatch(/spear/i);
    expect(read).toMatch(/ALREADY/i);
  });

  it("the yearling-kill journal carries no Cade attribution (true on the no-dialogue route)", () => {
    const yearling = loadPack().enemies.find((e) => e.id === "yearling_wolf");
    expect(yearling, "yearling_wolf must exist").toBeDefined();
    const journals = yearling!.on_defeat
      .filter((e): e is { add_journal: string } => "add_journal" in e)
      .map((e) => e.add_journal);
    expect(journals.length).toBeGreaterThan(0);
    for (const j of journals) {
      expect(j, "yearling defeat journal must not attribute to Cade").not.toMatch(/Cade/i);
    }
  });
});
