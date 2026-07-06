/**
 * bug_0097 — the RPG combat-winnability proof must credit the player's BEST
 * REACHABLE attack/defense/HP, not just init stats.
 *
 * COMBAT_UNWINNABLE is meant to fire only on a TRULY impossible fight. The
 * skill-check sibling already used a "best reachable" ceiling (init + every
 * positive inc_var), but the combat proof used init stats ALONE — so a fight that
 * is unwinnable at init yet winnable after a reachable +attack weapon / +defense
 * ward (cold_forge's lantern-spirit +2 attack & founder's-plate +2 defense,
 * sunken_barrow's shade ward) would be FALSELY flagged COMBAT_UNWINNABLE. The fix
 * routes both proofs through one `statCeiling`.
 *
 * Bug-first: the SAME enemy is unwinnable at init (no-buff variant → flagged) and
 * winnable once a reachable +attack buff is credited (buff variant → not flagged),
 * so the buff is provably what removes the false positive. Soundness is preserved:
 * a fight impossible even WITH every buff is still flagged, and a negative inc_var
 * (a debuff) is never credited.
 */
import { describe, it, expect } from "vitest";
import { compileRpgSource } from "../../src/rpg/source.js";
import { validateRpg } from "../../src/validate/rpg_validator.js";

/**
 * A one-room fight: brute hp 30 / attack 3 / defense 0, player hp 10 / attack 1.
 * At init: best player dmg = 6+1 = 7 → 5 rounds; min enemy dmg = 1+3 = 4 →
 * 4*(5-1) = 16 damage ≥ 10 HP ⇒ UNWINNABLE. With a +6 attack buff: best dmg =
 * 6+7 = 13 → 3 rounds; 4*(3-1) = 8 < 10 HP ⇒ winnable. `$BUFF$` is the start
 * room's on_enter (a reachable inc_var the parser scan sees via allParserEffects).
 */
const PACK = (buff: string): string => `
meta:
  id: rpg_buff_winnability
  title: "Buff Winnability"
  start_room: armory
  vars_init: { hp: 10, attack: 1, defense: 0, might: 1 }
  flags_init: []
  max_score: 0
rooms:
  - id: armory
    name: "Armory"
    description: "A weapon rack; a brute guards the north door."
    on_enter:${buff}
    exits:
      - direction: north
        to: freedom
        conditions: [ { has_flag: brute_slain } ]
        locked_msg: "The brute blocks the door."
  - id: freedom
    name: "Freedom"
    description: "Open sky."
    exits:
      - { direction: south, to: armory }
objects: []
npcs: []
enemies:
  - id: brute
    name: "brute"
    description: "A heavy brute."
    room: armory
    hp: 30
    attack: 3
    defense: 0
    defeat_flag: brute_slain
    death_ending: ending_fallen
    on_defeat: []
win_conditions:
  - id: escape
    conditions: [ { visited: freedom } ]
    ending: ending_out
endings:
  - { id: ending_out, title: "Out", text: "Free.", death: false }
  - { id: ending_fallen, title: "Fallen", text: "You fall.", death: true }
`;

const codes = (yaml: string): string[] => {
  const loaded = compileRpgSource(yaml);
  expect(loaded.ok).toBe(true);
  if (!loaded.ok) throw new Error("fixture failed to compile");
  return validateRpg(loaded.compiled.pack).findings.map((f) => f.code);
};

const ATTACK_PLUS_6 = "\n      - inc_var: { name: attack, by: 6 }";

describe("bug_0097 — combat winnability credits best reachable stats", () => {
  it("a fight unwinnable at init but winnable after a reachable +attack buff is NOT flagged", () => {
    const yaml = PACK(ATTACK_PLUS_6);
    expect(codes(yaml)).not.toContain("COMBAT_UNWINNABLE");
    // …and the buff variant is fully shippable (no other findings either).
    const loaded = compileRpgSource(yaml);
    expect(loaded.ok && validateRpg(loaded.compiled.pack).ok).toBe(true);
  });

  it("bug-first: the SAME enemy WITHOUT the buff is flagged COMBAT_UNWINNABLE", () => {
    // Empty on_enter ⇒ init stats only ⇒ the old (pre-fix) behaviour for everyone.
    expect(codes(PACK(" []"))).toContain("COMBAT_UNWINNABLE");
  });

  it("soundness: a fight impossible even WITH the buff is still flagged", () => {
    // Brute hp 30 atk 3, +1 attack only → best dmg 6+2 = 8 → 4 rounds → 4*3 = 12 ≥ 10.
    expect(codes(PACK("\n      - inc_var: { name: attack, by: 1 }"))).toContain(
      "COMBAT_UNWINNABLE",
    );
  });

  it("soundness: a negative inc_var (a debuff) is never credited as a buff", () => {
    // A -5 attack 'buff' must not lower the proof's bar; the fight stays unwinnable.
    expect(codes(PACK("\n      - inc_var: { name: attack, by: -5 }"))).toContain(
      "COMBAT_UNWINNABLE",
    );
  });
});

describe("bug_0097 — shipped RPG packs stay green (no new findings)", () => {
  it("sunken_barrow and cold_forge still validate with zero findings", async () => {
    const { loadRpgSourceFile } = await import("../../src/rpg/source.js");
    for (const path of [
      "content/rpg/pack/sunken_barrow.yaml",
      "content/rpg/pack/cold_forge.yaml",
    ]) {
      const loaded = loadRpgSourceFile(path);
      expect(loaded.ok).toBe(true);
      if (!loaded.ok) return;
      const report = validateRpg(loaded.compiled.pack);
      expect(report.findings).toHaveLength(0);
      expect(report.ok).toBe(true);
    }
  });
});
