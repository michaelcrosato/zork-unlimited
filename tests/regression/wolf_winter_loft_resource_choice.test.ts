/**
 * Regression for Wolf-Winter's loft route: a failed paling wedge can be bound
 * into one carried guard, then spent safely at the flank-wolf or preserved by
 * taking the longer, one-way fodder-loft approach for the grey leader.
 *
 * The resource decision is deliberately non-dominant. Spending early is safer
 * on bad rolls; preserving the guard can skip both replies on strong opening
 * rolls, and the complete preserved route still wins on all-worst rolls.
 */
import { describe, expect, it } from "vitest";
import { makeStep } from "../../src/core/engine.js";
import type { Rng } from "../../src/core/rng.js";
import type { GameState } from "../../src/core/state.js";
import { buildRpgObservation } from "../../src/rpg/observation.js";
import {
  buildRpgRules,
  enumerateRpgActions,
  indexRpgPack,
  initStateForRpgPack,
} from "../../src/rpg/runner.js";
import { enemyHpVar } from "../../src/rpg/schema.js";
import { loadRpgSourceFile } from "../../src/rpg/source.js";
import { assertRpgStateReferences } from "../../src/rpg/state_integrity.js";

const loaded = loadRpgSourceFile("content/rpg/quests/wolf_winter.yaml");
if (!loaded.ok) throw new Error("wolf_winter must compile");
const index = indexRpgPack(loaded.compiled.pack);

function rolls(...values: number[]): Rng {
  let cursor = 0;
  return {
    next: () => 0.5,
    int: (min, max) => {
      const value = values[cursor++] ?? max;
      expect(value).toBeGreaterThanOrEqual(min);
      expect(value).toBeLessThanOrEqual(max);
      return value;
    },
  };
}

function options(state: GameState) {
  return enumerateRpgActions(index, state);
}

function optionIds(state: GameState): string[] {
  return options(state).map((option) => option.id);
}

function act(state: GameState, id: string, ...fixedRolls: number[]): GameState {
  const option = options(state).find((candidate) => candidate.id === id);
  expect(
    option,
    `expected ${id} in ${state.current}; available: ${optionIds(state).join(", ")}`,
  ).toBeDefined();
  if (!option) throw new Error(`missing ${id}`);
  const result = makeStep(buildRpgRules(index, () => rolls(...fixedRolls)))(state, option.action);
  expect(result.ok, result.rejectionReason).toBe(true);
  return result.state;
}

function fullyPrepared(): GameState {
  let state = initStateForRpgPack(index, 503);
  for (const id of [
    "go_north",
    "talk_houndsman",
    "ask_wolves",
    "ask_byre",
    "ask_leave",
    "go_west",
    "take_byre_jerkin",
    "use_byre_jerkin",
    "go_east",
  ]) {
    state = act(state, id);
  }
  return state;
}

/** Fail the wedge, bind its split lengths, and defeat the yearling. */
function reachBoundGuardAtGap(playerRoll = 1, enemyRoll = 6): GameState {
  let state = act(fullyPrepared(), "go_north");
  state = act(state, "use_paling_rail", 1);
  state = act(state, "use_paling_rail");
  state = act(state, "maneuver_yearling_wolf_set_spear", playerRoll, enemyRoll);
  if (!state.flags.yearling_down) {
    state = act(state, "maneuver_yearling_wolf_drive_set_spear", playerRoll);
  }
  expect(state.flags.yearling_down).toBe(true);
  expect(state.inventory).toContain("split_rail_guard");
  return state;
}

/** Take the deliberate backtrack through the store and commit to the hatch drop. */
function takeLoftDrop(state: GameState): GameState {
  for (const id of ["go_south", "go_west", "go_up"]) state = act(state, id);
  expect(state.current).toBe("fodder_loft");
  expect(optionIds(state)).not.toContain("go_down");
  state = act(state, "go_east");
  expect(state.current).toBe("byre_door");
  expect(state.visited.fodder_loft).toBe(true);
  return state;
}

/** Spend the split guard at the flank, then use the ordinary guarded leader line. */
function finishEarlySpend(state: GameState, playerRoll: number, enemyRoll: number): GameState {
  state = act(state, "maneuver_flank_wolf_splinter_guard", playerRoll, enemyRoll);
  state = act(state, "maneuver_flank_wolf_hook_over_guard", playerRoll);
  expect(state.inventory).not.toContain("split_rail_guard");
  state = act(state, "go_north");
  state = act(state, "maneuver_grey_leader_wait_out_feint", playerRoll, enemyRoll);
  state = act(state, "maneuver_grey_leader_take_true_rush", playerRoll);
  return act(state, "go_north");
}

/** Preserve the split guard at the flank and commit it against the leader. */
function finishLateSpend(state: GameState, playerRoll: number, enemyRoll: number): GameState {
  state = act(state, "maneuver_flank_wolf_drop_from_loft", playerRoll, enemyRoll);
  if (!state.flags.flank_wolf_down) {
    state = act(state, "attack_flank_wolf", playerRoll);
  }
  expect(state.inventory).toContain("split_rail_guard");
  state = act(state, "go_north");
  state = act(state, "maneuver_grey_leader_set_split_guard", playerRoll, enemyRoll);
  if (!state.flags.leader_down) {
    state = act(state, "attack_grey_leader", playerRoll);
  }
  expect(state.inventory).not.toContain("split_rail_guard");
  return act(state, "go_north");
}

describe("Wolf-Winter loft route and split-guard resource choice", () => {
  it("signposts the loft from the store but gates its one-way route until the yearling falls", () => {
    const before = act(fullyPrepared(), "go_west");
    expect(before.current).toBe("store");
    expect(optionIds(before)).not.toContain("go_up");
    expect(buildRpgObservation(index, before).description).toContain("ladder");
    const blockedLoft = buildRpgObservation(index, before).blocked_exits.find(
      (exit) => exit.direction === "up",
    );
    expect(blockedLoft).toBeDefined();
    expect(blockedLoft?.message).toMatch(
      /before the flank-wolf falls[^]*settle the yearling[^]*crawlboard named by certified testimony or Cade's committed plan[^]*or bind a split rail[^]*sound rail wedged/i,
    );
    expect(blockedLoft?.message).not.toMatch(/in your packet|Jamie|Hayden/i);
    expect(blockedLoft?.message).not.toMatch(/brace-stake|saved stake/i);

    const jamieBefore = structuredClone(before);
    jamieBefore.flags.jamie_market_testimony_certified = true;
    const jamieBlockedLoft = buildRpgObservation(index, jamieBefore).blocked_exits.find(
      (exit) => exit.direction === "up",
    );
    expect(jamieBlockedLoft?.message).toMatch(
      /crawlboard named by certified testimony or Cade's committed plan[^]*or bind/i,
    );
    expect(jamieBlockedLoft?.message).not.toMatch(/in your packet/i);
    expect(jamieBlockedLoft?.message).not.toMatch(/must bind|needs? a bound rail/i);

    let after = reachBoundGuardAtGap();
    for (const id of ["go_south", "go_west"]) after = act(after, id);
    expect(optionIds(after)).toContain("go_up");
    after = act(after, "go_up");
    expect(after.current).toBe("fodder_loft");
    expect(buildRpgObservation(index, after).visible_objects).toContainEqual({
      id: "loft_hatch",
      name: "low wolf-hatch",
    });
    expect(optionIds(after)).toContain("examine_loft_hatch");
    expect(optionIds(after)).not.toContain("go_down");
    after = act(after, "go_east");
    expect(after.current).toBe("byre_door");
    expect(after.visited.fodder_loft).toBe(true);
    expect(() => assertRpgStateReferences(index, after)).not.toThrow();
  });

  it("makes the ground and one-way loft approaches distinct resource plans", () => {
    const ground = act(reachBoundGuardAtGap(), "go_north");
    const guardRoot = "maneuver_flank_wolf_splinter_guard";
    const loftRoot = "maneuver_flank_wolf_drop_from_loft";
    expect(optionIds(ground)).toEqual(
      expect.arrayContaining([guardRoot, "maneuver_flank_wolf_offside_cut"]),
    );
    expect(optionIds(ground)).not.toContain(loftRoot);

    const before = takeLoftDrop(reachBoundGuardAtGap());
    expect(optionIds(before)).toContain(loftRoot);
    expect(optionIds(before)).not.toContain(guardRoot);
    expect(optionIds(before)).not.toContain("maneuver_flank_wolf_offside_cut");
    expect(optionIds(before)).not.toContain("attack_flank_wolf");

    let hooked = act(structuredClone(ground), guardRoot, 1, 6);
    expect(hooked.inventory).toContain("split_rail_guard");
    const hookChild = "maneuver_flank_wolf_hook_over_guard";
    expect(options(hooked).find((option) => option.id === hookChild)).toMatchObject({
      combat: { attack_bonus: 0, defense_bonus: 1, phase: "follow_through" },
      resources: { gains: [], costs: ["split_rail_guard"] },
    });
    hooked = act(hooked, hookChild, 1);
    expect(hooked.flags.flank_hooked_over_guard).toBe(true);
    expect(hooked.flags.flank_wolf_down).toBe(true);
    expect(hooked.inventory).not.toContain("split_rail_guard");

    let dropped = act(structuredClone(before), loftRoot, 1, 6);
    expect(dropped.inventory).toContain("split_rail_guard");
    expect(optionIds(dropped)).toContain("attack_flank_wolf");
    dropped = act(dropped, "attack_flank_wolf", 1);
    expect(dropped.flags.flank_dropped_from_loft).toBe(true);
    expect(dropped.flags.flank_wolf_down).toBe(true);
    expect(dropped.inventory).toContain("split_rail_guard");
    expect(() => assertRpgStateReferences(index, dropped)).not.toThrow();
  });

  it("carries the saved guard into a costed leader opening and spends it on commitment", () => {
    let before = takeLoftDrop(reachBoundGuardAtGap());
    before = act(before, "maneuver_flank_wolf_drop_from_loft", 1, 6);
    before = act(before, "attack_flank_wolf", 1);
    before = act(before, "go_north");

    const rootId = "maneuver_grey_leader_set_split_guard";
    expect(options(before).find((option) => option.id === rootId)).toMatchObject({
      combat: { attack_bonus: 2, defense_bonus: 1 },
      resources: { gains: [], costs: ["split_rail_guard"] },
    });
    expect(
      buildRpgObservation(index, before).available_actions.find((option) => option.id === rootId)
        ?.resources,
    ).toEqual({ gains: [], costs: ["split_rail_guard"] });

    // The opening can kill outright, but commitment still spends the guard.
    const openingKill = act(structuredClone(before), rootId, 6);
    expect(openingKill.flags.leader_down).toBe(true);
    expect(openingKill.inventory).not.toContain("split_rail_guard");

    // On a low strike the resource opening returns control for a plain finish.
    let committed = act(before, rootId, 1, 6);
    expect(committed.flags.leader_split_guard_set).toBe(true);
    expect(committed.flags.leader_down).not.toBe(true);
    expect(committed.inventory).not.toContain("split_rail_guard");
    expect(optionIds(committed)).toContain("attack_grey_leader");
    committed = act(committed, "attack_grey_leader", 1);
    expect(committed.flags.leader_split_guard_set).toBe(true);
    expect(committed.flags.leader_down).toBe(true);
    expect(() => assertRpgStateReferences(index, committed)).not.toThrow();
  });

  it("lets fixed outcomes favor either spend timing while the all-worst late route wins", () => {
    const common = reachBoundGuardAtGap(1, 6);
    const ground = act(structuredClone(common), "go_north");
    const loft = takeLoftDrop(structuredClone(common));

    // Low strikes and hard replies reward spending the safer guard at the flank.
    const worstEarly = finishEarlySpend(structuredClone(ground), 1, 6);
    const worstLate = finishLateSpend(structuredClone(loft), 1, 6);
    expect(worstEarly.vars.hp).toBeGreaterThan(worstLate.vars.hp!);
    expect(worstEarly.vars.hp).toBe(17);
    expect(worstLate.vars.hp).toBe(14);

    // Strong opening strikes reward preserving the guard: both late roots kill
    // before a reply, while each early-spend root necessarily leaves a child beat.
    const bestEarly = finishEarlySpend(structuredClone(ground), 6, 1);
    const bestLate = finishLateSpend(structuredClone(loft), 6, 1);
    expect(bestLate.vars.hp).toBeGreaterThan(bestEarly.vars.hp!);
    expect(bestEarly.vars.hp).toBe(23);
    expect(bestLate.vars.hp).toBe(25);

    for (const ending of [worstEarly, worstLate, bestEarly, bestLate]) {
      expect(ending.endingId).toBe("ending_held");
      expect(ending.vars.score).toBe(55);
    }
    expect(worstLate.vars[enemyHpVar("grey_leader")]).toBe(0);
  });
});
