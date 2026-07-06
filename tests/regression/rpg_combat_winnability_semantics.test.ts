/**
 * Regression (§15) for bug_0113 — the RPG combat-winnability proof is a CONSERVATIVE
 * BEST-CASE lower bound, NOT a worst-case-roll survival guarantee. The proof's
 * docstring and a variable (`worstCaseDamageTaken`) once claimed survival against
 * "worst-case-for-them rolls," but the code computes the LUCKIEST run (player max
 * damage d6=6, enemy min damage d6=1) and errors only when even THAT loses. The
 * contract now matches the code; this test PINS the intended semantics so no later
 * "fix" silently turns the conservative ERROR into a worst-case check that would
 * false-positive the shipped packs' deliberate "preparation is a real gamble" tuning
 * (bug_0101 cold_forge, bug_0102 sunken_barrow).
 *
 * Surfaced by the recurring blind-playtest signal (cold_forge seed 31,
 * ai-runs/2026-06-02T09-35-33-314Z/playtest.md §4/§5/§6, and every prior RPG pass):
 * "a fully-prepared player can still be killed by bad luck." That is TRUE and
 * INTENTIONAL — so it must not be a validator error; the bug was that the verifier's
 * stated contract dishonestly implied it could not happen.
 */
import { describe, it, expect } from "vitest";
import { compileRpgSource } from "../../src/rpg/source.js";
import { validateRpg } from "../../src/validate/rpg_validator.js";

/**
 * A one-room fight against `brute`. Player init hp/attack/defense are parameterised;
 * the enemy is fixed. The room has an unconditional `up` exit (recourse) and an
 * `examine` interaction so the parser layer has no unrelated findings, and a single
 * non-death victory ending plus the brute's declared death ending.
 */
const PACK = (hp: number, atk: number, def: number): string => `
meta:
  id: winnability_semantics_v1
  title: "Winnability Semantics"
  start_room: arena
  vars_init: { hp: ${hp}, attack: ${atk}, defense: ${def}, might: 3 }
  flags_init: []
  max_score: 0
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

describe("bug_0113 — combat winnability is a conservative best-case lower bound", () => {
  // brute hp18/atk7/def2. With atk6/def4 (cold_forge's best reachable stats):
  //   best player dmg = max(1, 6+6-2) = 10 → roundsToKill = ceil(18/10) = 2.
  //   min enemy dmg   = max(1, 1+7-4) = 4 → minDamageTaken = 4*(2-1) = 4.
  //   4 < 20 HP ⇒ winnable on the luckiest rolls ⇒ NOT flagged.
  // Yet on WORST rolls (player 5/round, enemy 9/round) the same prepared player
  // takes 9*(ceil(18/5)-1) = 9*3 = 27 > 20 and DIES. That luck-loss is permitted.
  it("does NOT flag a fight that is best-case winnable but worst-case lethal", () => {
    const c = codes(PACK(20, 6, 4));
    expect(c).not.toContain("COMBAT_UNWINNABLE");
  });

  // Same enemy, but a frail player (hp4/atk0/def0) cannot survive even the luckiest run:
  //   best player dmg = max(1, 6+0-2) = 4 → roundsToKill = ceil(18/4) = 5.
  //   min enemy dmg   = max(1, 1+7-0) = 8 → minDamageTaken = 8*(5-1) = 32 ≥ 4 HP.
  // Impossible even on best-case rolls ⇒ the conservative ERROR still fires.
  it("DOES flag a fight that is impossible even on the luckiest rolls", () => {
    const c = codes(PACK(4, 0, 0));
    expect(c).toContain("COMBAT_UNWINNABLE");
  });

  // Soundness boundary: the threshold is `>=`. minDamageTaken exactly equal to HP is
  // a loss (the final surviving-round blow lands before the kill), so it must flag;
  // one more HP must clear it. brute hp18/atk7/def0, player atk0:
  //   best dmg = max(1,6+0-2)=4 → rounds = ceil(18/4)=5; min enemy dmg = max(1,1+7-0)=8;
  //   minDamageTaken = 8*4 = 32. HP 32 ⇒ flagged (== is a loss); HP 33 ⇒ not flagged.
  it("treats minDamageTaken == HP as a loss (>= boundary), HP+1 as a win", () => {
    expect(codes(PACK(32, 0, 0))).toContain("COMBAT_UNWINNABLE");
    expect(codes(PACK(33, 0, 0))).not.toContain("COMBAT_UNWINNABLE");
  });
});
