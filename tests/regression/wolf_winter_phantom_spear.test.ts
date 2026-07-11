/**
 * Regression (§15) for bug_0191 — The Wolf-Winter blind-pass content fixes.
 *
 * The bug_0190 blind playtest of wolf_winter found a PHANTOM-SPEAR contradiction: the
 * prose said the hunting spear was already in hand, but INVENTORY was empty. The first
 * repair clarified that it was equipped rather than loot; the tactical pass now closes
 * the runtime half too with a real `held: true` relief_spear. Base attack 5 still
 * represents the weapon, so the object itself adds no persistent stat.
 *
 * Plus a lesser bug_0188-class stale attribution: the yearling's on_defeat journal said
 * "the way Cade said" even on the route where the player never spoke to Cade.
 *
 * The fix is content-only and TRUE-in-all-reachable-states (the bug_0186 discipline):
 *   (1) the opening room establishes the spear is ALREADY in hand and the fresh state
 *       actually carries its non-droppable runtime object;
 *   (2) the day-book no longer reads as a "SPEAR AND PADDING" shopping list — it states
 *       the hunter has his spear already and asks only for Cade's counsel + the jerkin;
 *   (3) the yearling-kill journal drops the "the way Cade said" attribution so it is true
 *       on BOTH the heard-counsel and the no-dialogue routes.
 *
 * The combat/guarantee math is untouched — the +2 persistent attack still comes from
 * Cade's counsel, so wolf_winter_three_fight_gauntlet.test.ts remains the economy pin.
 */
import { describe, it, expect } from "vitest";
import { buildRpgObservation } from "../../src/rpg/observation.js";
import { indexRpgPack, initStateForRpgPack } from "../../src/rpg/runner.js";
import { loadRpgSourceFile } from "../../src/rpg/source.js";
import type { RpgPack } from "../../src/rpg/schema.js";

const PACK_PATH = "content/rpg/quests/wolf_winter.yaml";

function loadPack(): RpgPack {
  const r = loadRpgSourceFile(PACK_PATH);
  expect(r.ok, "wolf_winter must load").toBe(true);
  if (!r.ok) throw new Error("unreachable");
  return r.compiled.pack;
}

describe("bug_0191 — The Wolf-Winter: real carried spear, no stale Cade attribution", () => {
  it("the opening promise is true in fresh runtime state: the spear is already held", () => {
    const pack = loadPack();
    const start = pack.rooms.find((r) => r.id === "steading_yard");
    expect(start, "steading_yard must exist").toBeDefined();
    const desc = start!.description.toLowerCase();
    expect(desc).toContain("spear");
    expect(desc).toContain("already");

    const spear = pack.objects.find((o) => o.id === "relief_spear");
    expect(spear).toMatchObject({ id: "relief_spear", held: true });
    expect(spear?.takeable).not.toBe(true);
    const index = indexRpgPack(pack);
    const state = initStateForRpgPack(index, 191);
    expect(state.inventory).toContain("relief_spear");
    expect(buildRpgObservation(index, state).inventory).toContain("relief_spear");
    expect(state.vars).toMatchObject({ attack: 5, defense: 3, hp: 30 });
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
