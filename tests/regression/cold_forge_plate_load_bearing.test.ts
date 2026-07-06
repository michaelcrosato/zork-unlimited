/**
 * Regression (§15) for bug_0179 — The Cold Forge's founder's plate (+2 defense) is
 * MECHANICALLY LOAD-BEARING: completing the third, currently-unguarded tier of
 * bug_0101's "preparation decides the fight" claim with a concrete-play witness.
 *
 * Background. bug_0101 retuned the slag sentinel (hp18/atk7) so preparation matters,
 * and documents THREE tiers (cold_forge.yaml, enemy block comments):
 *   - UNDER-ARMED (atk4/def2): "lethal more often than not";
 *   - the SPIRIT'S +2 ATTACK (atk6/def2): "the decisive survival lever … ~45%→~90%";
 *   - the FOUNDER'S PLATE on top (atk6/def4): "makes it a near-certain win with a
 *     comfortable HP cushion … wins every seed tested".
 * Two of those tiers are pinned by concrete play (cold_forge_sentinel_prep_matters.test.ts,
 * bug_0101: under-armed→ending_fallen at seed 1; +2 attack→ending_victory at seed 1).
 * The PLATE tier was verified only by a throwaway 40-seed probe (`__probe.ts`, since
 * deleted) and is otherwise pinned only for its ROOM TEXT nudge (cold_forge_unworn_plate_nudge.test.ts,
 * bug_0118) — nothing locks that the +2 defense actually BLUNTS the sentinel's blows
 * in the real fight. A regression that re-softened the enemy, dropped the plate's
 * `inc_var: defense`, or made the plate cosmetic again (the exact bug_0101 was created
 * to kill) would pass every existing check green. This is the recurring blind-playtest
 * theme — "does the optional armour actually matter?" — operationalized, and the
 * curated-pack counterpart to the generator's load-bearing-buff witness
 * (rpg_generator_cumulative_survival.test.ts, bug_0174, Phase B/C).
 *
 * Soundness. The plate route takes a side-detour (more steps), and the engine PRNG is
 * (seed, step)-keyed (src/rpg/combat.ts), so playing the plate route and the no-plate
 * route would draw DIFFERENT fight rolls — an apples-to-oranges comparison. So this
 * isolates the +2 defense the way bug_0118 isolates the nudge flag: from ONE
 * +2-attack pre-fight state (atk6/def2, full HP, at a fixed step), it fights two
 * copies that differ ONLY in defense (2 vs 4, plate_donned set) at the IDENTICAL step,
 * so both draw the SAME step-keyed d6 stream. Per-round damage = max(1, d6 + 7 - def)
 * is monotone DECREASING in defense, so the def-4 copy can only ever take ≤ damage per
 * round — never a lucky-roll artefact. The faithful pack linkage (donning the plate
 * really raises defense 2→4) is pinned separately by real play, so the two halves
 * together witness "the plate is load-bearing" without mutating away the pack's own
 * plate→+2 mechanic.
 *
 * Locked here (all values from the committed deterministic PRNG):
 *   (1) the pack still validates green under the full RPG validator;
 *   (2) FAITHFUL LINKAGE: donning the founder's plate raises defense 2→4 (sets
 *       plate_donned + inc_var defense) by real play;
 *   (3) THE PLATE FLIPS A LETHAL FIGHT: at seed 4, from the identical +2-attack
 *       pre-fight state, the UNPLATED (def 2) player is killed (ending_fallen) while
 *       the PLATED copy (def 4) — same step, same rolls, ONLY the +2 defense differs —
 *       survives the sentinel (sentinel_stilled, still standing);
 *   (4) THE CUSHION IS REAL: across seeds where both copies win, the plated player
 *       ends with STRICTLY MORE HP than the unplated one — the +2 defense blunts real
 *       blows, it is not swallowed by the min-1 floor.
 */
import { describe, it, expect } from "vitest";
import { loadRpgSourceFile } from "../../src/rpg/source.js";
import {
  indexRpgPack,
  buildRpgRules,
  initStateForRpgPack,
  enumerateRpgActions,
} from "../../src/rpg/runner.js";
import { validateRpg } from "../../src/validate/rpg_validator.js";
import { makeStep } from "../../src/core/engine.js";
import type { GameState } from "../../src/core/state.js";
import type { Action } from "../../src/api/types.js";

const loaded = loadRpgSourceFile("content/rpg/quests/cold_forge.yaml");
if (!loaded.ok) throw new Error("cold_forge must compile");
const pack = loaded.compiled.pack;
const index = indexRpgPack(pack);
const step = makeStep(buildRpgRules(index));

const options = (s: GameState) => enumerateRpgActions(index, s);

function act(s: GameState, pred: (a: Action) => boolean): GameState {
  const opt = options(s).find((o) => pred(o.action));
  if (!opt)
    throw new Error(
      `no action; legal=[${options(s)
        .map((o) => o.id)
        .join(", ")}] in ${s.current}`,
    );
  const r = step(s, opt.action);
  expect(r.ok).toBe(true);
  if (!r.ok) throw new Error("step failed");
  return r.state;
}

const move = (dir: string) => (a: Action) => a.type === "MOVE" && a.direction === dir;
const isAttack = (a: Action) => a.type === "ATTACK";
const isTalk = (a: Action) => a.type === "TALK";
const isTake = (a: Action) => a.type === "TAKE";
const takePlate = (a: Action) =>
  a.type === "TAKE" && (a as { item?: string }).item === "cold_iron_plate";
const donPlate = (a: Action) =>
  a.type === "USE" && (a as { item?: string }).item === "cold_iron_plate";
const askTopic = (topic: string) => (a: Action) =>
  a.type === "ASK" && (a as { topic?: string }).topic === topic;

/**
 * Reach the Bellows Walk fight having taken ONLY the spirit's +2-attack counsel —
 * atk6/def2, full HP, NO plate. Mirrors cold_forge_sentinel_prep_matters case (4),
 * the canonical +2-attack route, so every copy fought below sits at the same step.
 */
function attackOnlyPreFight(seed: number): GameState {
  let s = initStateForRpgPack(index, seed);
  s = act(s, move("down")); // → outer_forge
  s = act(s, isTake); // pry-bar
  s = act(s, isTalk); // lantern-spirit
  s = act(s, askTopic("ask_sentinel")); // +2 attack → atk6
  s = act(s, askTopic("sentinel_back"));
  s = act(s, askTopic("ask_heart"));
  s = act(s, askTopic("heart_back"));
  s = act(s, askTopic("leave_spirit"));
  s = act(s, move("north")); // → bellows_walk
  expect(s.current).toBe("bellows_walk");
  expect(s.vars["attack"]).toBe(6);
  expect(s.vars["defense"]).toBe(2);
  expect(s.flags["plate_donned"]).not.toBe(true);
  return s;
}

/** A def-4 copy of a pre-fight state at the IDENTICAL step (simulating the donned plate). */
function withPlate(s: GameState): GameState {
  return {
    ...s,
    vars: { ...s.vars, defense: 4 },
    flags: { ...s.flags, plate_donned: true },
  };
}

/** Fight the sentinel to the death (one side falls). */
function fightOut(s: GameState): GameState {
  let guard = 0;
  while (!s.ended && !s.flags["sentinel_stilled"]) {
    s = act(s, isAttack);
    if (++guard > 40) throw new Error("fight did not resolve");
  }
  return s;
}

describe("bug_0179 — The Cold Forge founder's plate (+2 defense) is mechanically load-bearing", () => {
  it("(1) the pack still validates green under the full RPG validator", () => {
    const report = validateRpg(pack);
    expect(report.findings.filter((f) => f.severity === "error")).toEqual([]);
    expect(report.ok).toBe(true);
  });

  it("(2) faithful linkage: donning the founder's plate raises defense 2→4 by real play", () => {
    let s = initStateForRpgPack(index, 7);
    s = act(s, move("down")); // → outer_forge
    s = act(s, move("west")); // → founder_cell
    expect(s.current).toBe("founder_cell");
    s = act(s, takePlate);
    expect(s.inventory).toContain("cold_iron_plate");
    expect(s.vars["defense"]).toBe(2); // carried, not yet worn
    s = act(s, donPlate);
    expect(s.flags["plate_donned"]).toBe(true);
    expect(s.vars["defense"]).toBe(4); // the +2 the fight will feel
  });

  it("(3) the plate flips a lethal fight: seed 4, only +2 defense differs, death→survival", () => {
    const s0 = attackOnlyPreFight(4);

    // UNPLATED (def 2): the +2-attack player is killed at this seed.
    const unplated = fightOut(s0);
    expect(unplated.ended).toBe(true);
    expect(unplated.endingId).toBe("ending_fallen");
    expect(unplated.flags["sentinel_stilled"]).not.toBe(true);

    // PLATED copy (def 4) at the IDENTICAL step → same rolls; the ONLY change is the
    // +2 defense, and it carries the player through alive.
    const plated = fightOut(withPlate(s0));
    expect(plated.ended).toBe(false);
    expect(plated.flags["sentinel_stilled"]).toBe(true);
    expect(plated.vars["hp"]).toBeGreaterThan(0);
  });

  it("(4) the cushion is real: where both win, the plate ends with strictly more HP", () => {
    // Seeds where the +2-attack player already wins unplated (so both copies finish
    // the fight) — the plate's +2 defense must leave the player strictly better off,
    // never swallowed by the min-1 damage floor.
    const bothWinSeeds = [0, 1, 2, 3, 7];
    for (const seed of bothWinSeeds) {
      const s0 = attackOnlyPreFight(seed);
      const unplated = fightOut(s0);
      const plated = fightOut(withPlate(s0));
      expect(unplated.flags["sentinel_stilled"], `seed ${seed}: unplated should win`).toBe(true);
      expect(plated.flags["sentinel_stilled"], `seed ${seed}: plated should win`).toBe(true);
      expect(
        plated.vars["hp"] ?? 0,
        `seed ${seed}: the plate's +2 defense must leave strictly more HP ` +
          `(plated ${plated.vars["hp"]} vs unplated ${unplated.vars["hp"]})`,
      ).toBeGreaterThan(unplated.vars["hp"] ?? 0);
    }
  });
});
