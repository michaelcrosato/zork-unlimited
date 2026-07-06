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
import { compileRpgSource, loadRpgSourceFile } from "../../src/rpg/source.js";
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
  const r = compileRpgSource(src);
  expect(r.ok).toBe(true);
  if (!r.ok) return [];
  return validateRpg(r.compiled.pack).findings.map((f) => f.code);
}

/**
 * A two-fight GAUNTLET (bug_0172): the player must beat `gate` (gallery) then
 * `boss` (span) in sequence. Player init hp/attack/defense and the per-enemy
 * stats are parameterised; `guaranteed` toggles the opt-in promise. Both enemies
 * share the same stats per call so the cumulative arithmetic is easy to verify.
 */
const GAUNTLET = (
  hp: number,
  atk: number,
  def: number,
  enemyHp: number,
  enemyAtk: number,
  enemyDef: number,
  guaranteed: boolean,
): string => `
meta:
  id: combat_gauntlet_optin_v1
  title: "Guaranteed Gauntlet"
  start_room: gallery
  vars_init: { hp: ${hp}, attack: ${atk}, defense: ${def}, might: 3 }
  flags_init: []
  max_score: 0${guaranteed ? "\n  combat_guaranteed: true" : ""}
rooms:
  - id: gallery
    name: "The Gallery"
    description: "A long gallery. A gate sentinel blocks the span; the way up is open."
    objects: [wall]
    exits:
      - { direction: up, to: gallery }
      - { direction: east, to: span, conditions: [ { has_flag: gate_slain } ] }
  - id: span
    name: "The Span"
    description: "A narrow span. A boss guardian holds the far end."
    objects: [rail]
    exits:
      - { direction: west, to: gallery }
enemies:
  - id: gate
    name: "gate sentinel"
    description: "The first keeper."
    room: gallery
    hp: ${enemyHp}
    attack: ${enemyAtk}
    defense: ${enemyDef}
    defeat_flag: gate_slain
    death_ending: ending_fallen_gate
    on_defeat:
      - add_journal: "The gate sentinel drops."
  - id: boss
    name: "boss guardian"
    description: "The second keeper."
    room: span
    hp: ${enemyHp}
    attack: ${enemyAtk}
    defense: ${enemyDef}
    defeat_flag: boss_slain
    death_ending: ending_fallen_boss
    on_defeat:
      - add_journal: "The boss guardian drops."
win_conditions:
  - id: survive
    conditions: [ { has_flag: boss_slain } ]
    ending: ending_won
objects:
  - id: wall
    name: "gallery wall"
    aliases: [wall]
    description: "Scarred sandstone."
    takeable: false
  - id: rail
    name: "span rail"
    aliases: [rail]
    description: "A worn iron rail."
    takeable: false
endings:
  - id: ending_won
    title: "Standing"
    text: "Both keepers fall and you stand."
    death: false
  - id: ending_fallen_gate
    title: "Down at the gate"
    text: "You fall before the gate."
    death: true
  - id: ending_fallen_boss
    title: "Down on the span"
    text: "You fall on the span."
    death: true
`;

function gauntletCodes(src: string): string[] {
  const r = compileRpgSource(src);
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
    const r = loadRpgSourceFile("content/rpg/quests/cold_forge.yaml");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.compiled.pack.meta.combat_guaranteed).toBeUndefined();
    const c = validateRpg(r.compiled.pack).findings.map((f) => f.code);
    expect(c).not.toContain("COMBAT_NOT_GUARANTEED");
  });
});

/**
 * bug_0172 — CUMULATIVE-HP-aware gauntlet guarantee. The per-fight upper bound
 * (bug_0114) proves each fight survivable against the player's FULL reachable HP
 * but never threads HP across SEQUENTIAL fights, so two fights that each clear the
 * per-fight bound can still JOINTLY fell a best-prepared player on worst cumulative
 * rolls. When a pack opts in with `meta.combat_guaranteed`, the new
 * COMBAT_GAUNTLET_NOT_GUARANTEED sums every enemy's worst-case `maxDamageTaken`
 * and fires when the running total `>= playerHp`. It is an order-independent
 * OVER-approximation tied to the UPPER/guarantee bound only (it can only refuse an
 * unsafe guarantee, never falsely grant one); it is NOT applied to the lower
 * COMBAT_UNWINNABLE route-existence bound, where summing would be unsound.
 *
 * All arithmetic below is recomputed against the live max(1, d6 + atk - def) math
 * (player strikes first; enemy retaliates only on rounds it survives, i.e.
 * worstRoundsToKill - 1), mirroring the bug_0114 worked-arithmetic style above.
 */
describe("bug_0172 — cumulative-HP-aware gauntlet guarantee", () => {
  // WITNESS. player hp20/atk6/def4; TWO enemies each hp13/atk5/def2.
  //   Per fight, worst case: player dmg max(1,1+6-2)=5 → rounds ceil(13/5)=3; max
  //     enemy dmg max(1,6+5-4)=7 → maxDamageTaken = 7*(3-1) = 14. 14 < 20 ⇒ each
  //     fight passes the per-fight COMBAT_NOT_GUARANTEED alone.
  //   Cumulative: 14 + 14 = 28 ≥ 20 ⇒ the gauntlet is NOT jointly survivable ⇒
  //     COMBAT_GAUNTLET_NOT_GUARANTEED fires.
  //   Lower bound, best case: player dmg max(1,6+6-2)=10 → rounds ceil(13/10)=2; min
  //     enemy dmg max(1,1+5-4)=2 → minDamageTaken = 2*(2-1) = 2 < 20 ⇒ NOT
  //     COMBAT_UNWINNABLE (each fight is winnable on the luckiest rolls).
  it("fires on a two-fight guarantee that passes per-fight but fails jointly", () => {
    const c = gauntletCodes(GAUNTLET(20, 6, 4, 13, 5, 2, true));
    expect(c).not.toContain("COMBAT_NOT_GUARANTEED"); // 14 < 20 each fight
    expect(c).not.toContain("COMBAT_UNWINNABLE"); // best-case winnable
    expect(c).toContain("COMBAT_GAUNTLET_NOT_GUARANTEED"); // 28 ≥ 20 cumulatively
  });

  // The SAME witness stats WITHOUT the opt-in flag trips nothing — the cumulative
  // check is guarantee-direction-only, so an undeclared gamble gauntlet is permitted.
  it("does NOT fire the cumulative check without the opt-in flag", () => {
    const c = gauntletCodes(GAUNTLET(20, 6, 4, 13, 5, 2, false));
    expect(c).not.toContain("COMBAT_GAUNTLET_NOT_GUARANTEED");
    expect(c).not.toContain("COMBAT_NOT_GUARANTEED");
    expect(c).not.toContain("COMBAT_UNWINNABLE");
  });

  // FAIR GAUNTLET. player hp50/atk6/def12; TWO enemies each hp12/atk5/def2.
  //   Per fight, worst case: player dmg max(1,1+6-2)=5 → rounds ceil(12/5)=3; max
  //     enemy dmg max(1,6+5-12)=max(1,-1)=1 → maxDamageTaken = 1*(3-1) = 2 < 50.
  //   Cumulative: 2 + 2 = 4 < 50 ⇒ jointly survivable ⇒ NEITHER code fires.
  it("accepts a genuinely fair two-fight guaranteed gauntlet", () => {
    const c = gauntletCodes(GAUNTLET(50, 6, 12, 12, 5, 2, true));
    expect(c).not.toContain("COMBAT_NOT_GUARANTEED");
    expect(c).not.toContain("COMBAT_GAUNTLET_NOT_GUARANTEED");
    expect(c).not.toContain("COMBAT_UNWINNABLE");
  });

  // SINGLE-FIGHT MONOTONICITY. For a single-enemy pack the cumulative sum equals the
  // single per-fight term, so the new code must fire IFF the per-fight code fires.
  // Reuse the bug_0114 single-enemy PACK (brute hp18/atk7/def2):
  //   player hp20/atk6/def4 worst case → maxDamageTaken 27 ≥ 20 ⇒ BOTH fire.
  //   player hp50/atk6/def12 worst case → maxDamageTaken 3 < 50 ⇒ NEITHER fires.
  // This is exactly why curated single-enemy cold_forge/sunken_barrow are unaffected.
  it("for a single-enemy pack, fires iff the per-fight code fires (cumulative == single term)", () => {
    const trips = codes(PACK(20, 6, 4, true));
    expect(trips).toContain("COMBAT_NOT_GUARANTEED");
    expect(trips).toContain("COMBAT_GAUNTLET_NOT_GUARANTEED"); // 27 ≥ 20
    const fair = codes(PACK(50, 6, 12, true));
    expect(fair).not.toContain("COMBAT_NOT_GUARANTEED");
    expect(fair).not.toContain("COMBAT_GAUNTLET_NOT_GUARANTEED"); // 3 < 50
  });

  // `>=` BOUNDARY (mirrors bug_0114's boundary discipline). TWO enemies each
  // hp13/atk5/def2, player atk6/def4 ⇒ each fight worst-case maxDamageTaken 14, so
  // cumulative = 28. Per fight 14 stays below both HPs below, isolating the new check
  // (and minDamageTaken 2 keeps both clear of COMBAT_UNWINNABLE).
  //   HP 28: cumulative 28 ≥ 28 ⇒ the promise is broken (== is a loss) ⇒ fires.
  //   HP 29: cumulative 28 <  29 ⇒ the gauntlet holds ⇒ clean.
  it("treats cumulative sum == playerHp as broken (>= boundary), playerHp-1-over as kept", () => {
    const atBound = gauntletCodes(GAUNTLET(28, 6, 4, 13, 5, 2, true));
    expect(atBound).toContain("COMBAT_GAUNTLET_NOT_GUARANTEED"); // 28 ≥ 28
    expect(atBound).not.toContain("COMBAT_NOT_GUARANTEED"); // 14 < 28 each fight
    const overBound = gauntletCodes(GAUNTLET(29, 6, 4, 13, 5, 2, true));
    expect(overBound).not.toContain("COMBAT_GAUNTLET_NOT_GUARANTEED"); // 28 < 29
    expect(overBound).not.toContain("COMBAT_NOT_GUARANTEED");
  });
});
