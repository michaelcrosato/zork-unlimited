/**
 * Regression (§15) for bug_0114 — the OPT-IN combat fairness guarantee.
 *
 * The default RPG combat-winnability proof is a conservative BEST-CASE lower bound
 * (bug_0113): it forbids only a truly impossible fight and deliberately PERMITS a
 * luck-dependent gamble a fully-prepared player can still lose on bad rolls. Every
 * RPG blind playtest names that same gap (cold_forge seed 31, sunken_barrow, …):
 * "a fully-prepared player can still be killed by bad luck." For the shipped packs
 * that is intentional design (bug_0101/0102), so it must stay unflagged.
 *
 * bug_0114 makes "this fight is fair, not a gamble" a DECLARED, AUDITED property:
 * a pack that sets `meta.combat_guaranteed: true` must clear the UPPER bound too —
 * best reachable stats but the player's WORST rolls (player min damage d6=1, enemy
 * max damage d6=6). If even a best-prepared player can be felled on the unluckiest
 * rolls, the promise is false and `COMBAT_NOT_GUARANTEED` errors. This test pins:
 *   (1) the flag is OPT-IN — the exact stats bug_0113 showed are best-case-winnable
 *       but worst-case-lethal are NOT flagged without the flag, and ARE flagged with
 *       it (the broken promise);
 *   (2) a genuinely fair fight (survivable on every roll) WITH the flag is clean;
 *   (3) the `>=` boundary: maxDamageTaken == HP is a broken promise, HP+1 clears it;
 *   (4) the shipped gamble pack cold_forge does NOT opt in, so it is never flagged —
 *       no false positive against deliberate design.
 */
import { describe, it, expect } from "vitest";
import { compileRpgPack, loadRpgPackFile } from "../../src/rpg/pack.js";
import { validateRpg } from "../../src/validate/rpg_validator.js";

/**
 * A one-room fight against `brute` (hp18/atk7/def2 — the same enemy bug_0113 uses).
 * Player init hp/attack/defense are parameterised; `guaranteed` toggles the opt-in.
 */
const PACK = (hp: number, atk: number, def: number, guaranteed: boolean): string => `
meta:
  id: combat_guaranteed_optin_v1
  title: "Guaranteed Combat"
  start_room: arena
  vars_init: { hp: ${hp}, attack: ${atk}, defense: ${def}, might: 3 }
  flags_init: []
  max_score: 0${guaranteed ? "\n  combat_guaranteed: true" : ""}
rooms:
  - id: arena
    name: "The Arena"
    description: "A pit of sand. A brute blocks the only way down; the way up is open."
    objects: [wall]
    exits:
      - { direction: up, to: arena }
enemies:
  - id: brute
    name: "brute"
    description: "A heavy slab of muscle."
    room: arena
    hp: 18
    attack: 7
    defense: 2
    defeat_flag: brute_slain
    death_ending: ending_fallen
    on_defeat:
      - add_journal: "The brute drops."
win_conditions:
  - id: survive
    conditions: [ { has_flag: brute_slain } ]
    ending: ending_won
objects:
  - id: wall
    name: "pit wall"
    aliases: [wall]
    description: "Scarred sandstone."
    takeable: false
endings:
  - id: ending_won
    title: "Standing"
    text: "The brute falls and you stand."
    death: false
  - id: ending_fallen
    title: "Down"
    text: "You fall among the sand."
    death: true
`;

function codes(src: string): string[] {
  const r = compileRpgPack(src);
  expect(r.ok).toBe(true);
  if (!r.ok) return [];
  return validateRpg(r.compiled.pack).findings.map((f) => f.code);
}

describe("bug_0114 — opt-in combat fairness guarantee", () => {
  // brute hp18/atk7/def2; player hp20/atk6/def4 — the exact gamble bug_0113 named.
  //   Best case: player dmg max(1,6+6-2)=10 → rounds 2; min enemy dmg max(1,1+7-4)=4
  //     → 4 < 20 ⇒ NOT COMBAT_UNWINNABLE (winnable on the luckiest rolls).
  //   Worst case: player dmg max(1,1+6-2)=5 → rounds ceil(18/5)=4; max enemy dmg
  //     max(1,6+7-4)=9 → 9*(4-1)=27 ≥ 20 ⇒ a prepared player CAN die on bad rolls.
  it("does NOT flag the gamble without the flag (opt-in)", () => {
    const c = codes(PACK(20, 6, 4, false));
    expect(c).not.toContain("COMBAT_NOT_GUARANTEED");
    expect(c).not.toContain("COMBAT_UNWINNABLE"); // best-case winnable
  });

  it("DOES flag the same gamble once the pack promises a guarantee", () => {
    const c = codes(PACK(20, 6, 4, true));
    expect(c).toContain("COMBAT_NOT_GUARANTEED");
    expect(c).not.toContain("COMBAT_UNWINNABLE"); // still best-case winnable
  });

  // A genuinely fair fight: high defense floors the enemy at min damage, high HP
  // absorbs it. player hp50/atk6/def12:
  //   Worst case: player dmg max(1,1+6-2)=5 → rounds 4; max enemy dmg max(1,6+7-12)=1
  //     → 1*3 = 3 < 50 ⇒ survives EVERY roll ⇒ the guarantee holds, no finding.
  it("accepts a fight that is survivable on every roll under the guarantee", () => {
    expect(codes(PACK(50, 6, 12, true))).not.toContain("COMBAT_NOT_GUARANTEED");
  });

  // Soundness boundary, mirroring bug_0113's `>=` pin. With atk6/def4 the worst-case
  // maxDamageTaken is 27, so HP 27 is a broken promise (== is a loss — the final
  // surviving-round blow lands before the kill) and HP 28 clears it. Neither HP is
  // COMBAT_UNWINNABLE (best-case minDamageTaken is only 4), isolating the new check.
  it("treats maxDamageTaken == HP as a broken promise (>= boundary), HP+1 as kept", () => {
    expect(codes(PACK(27, 6, 4, true))).toContain("COMBAT_NOT_GUARANTEED");
    expect(codes(PACK(28, 6, 4, true))).not.toContain("COMBAT_NOT_GUARANTEED");
  });

  // No false positive against shipped design: cold_forge is a deliberate gamble
  // (bug_0101) and does NOT set combat_guaranteed, so the new check never fires on
  // it. (The health bar separately asserts it validates 0 error / 0 warning.)
  it("never flags the shipped gamble pack cold_forge, which does not opt in", () => {
    const r = loadRpgPackFile("content/rpg/pack/cold_forge.yaml");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.compiled.pack.meta.combat_guaranteed).toBeUndefined();
    const c = validateRpg(r.compiled.pack).findings.map((f) => f.code);
    expect(c).not.toContain("COMBAT_NOT_GUARANTEED");
  });
});
