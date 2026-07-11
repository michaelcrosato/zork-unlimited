/**
 * Regression for bug_0501: a braced funnel now ends in a persistent tactical
 * trade rather than one prompted answer. The reliable pin ends the flank fight
 * immediately; wrenching out the brace-stake can cost another counterattack but
 * earns a stronger, consumable guard against the grey leader.
 */
import { describe, expect, it } from "vitest";
import type { RpgAction } from "../../src/api/types.js";
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
const pack = loaded.compiled.pack;
const index = indexRpgPack(pack);

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

/** Reach the flank-wolf with full prep and commit the funnel opening. */
function reachFunnel(playerRoll: number, yearlingRoll = 6): GameState {
  let state = initStateForRpgPack(index, 501);
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
    "go_north",
  ]) {
    state = act(state, id);
  }
  state = act(state, "use_paling_rail", 20);
  state = act(state, "maneuver_yearling_wolf_set_spear", yearlingRoll, 6);
  if (!state.flags.yearling_down) {
    state = act(state, "maneuver_yearling_wolf_drive_set_spear", 1);
  }
  state = act(state, "go_north");
  return act(state, "maneuver_flank_wolf_funnel_thrust", playerRoll, 6);
}

function finishSafeLine(state: GameState): GameState {
  state = act(state, "maneuver_flank_wolf_pin_at_rail", 1);
  state = act(state, "go_north");
  state = act(state, "maneuver_grey_leader_wait_out_feint", 1, 6);
  state = act(state, "maneuver_grey_leader_take_true_rush", 1);
  return act(state, "go_north");
}

function finishStakeLine(state: GameState): GameState {
  state = act(state, "maneuver_flank_wolf_wrench_brace_stake", 1, 6);
  if (!state.flags.flank_wolf_down) state = act(state, "attack_flank_wolf", 1);
  state = act(state, "go_north");
  state = act(state, "maneuver_grey_leader_crossbrace_saved_stake", 1, 6);
  state = act(state, "maneuver_grey_leader_turn_over_crossbrace", 1);
  return act(state, "go_north");
}

describe("bug_0501 — Wolf-Winter cross-encounter tactical agency", () => {
  it("offers two legible funnel children and grants the risky branch exactly once", () => {
    const state = reachFunnel(1);
    const pinId = "maneuver_flank_wolf_pin_at_rail";
    const stakeId = "maneuver_flank_wolf_wrench_brace_stake";
    expect(optionIds(state)).toEqual(expect.arrayContaining([pinId, stakeId]));
    expect(optionIds(state)).not.toContain("attack_flank_wolf");
    expect(options(state).find((option) => option.id === pinId)?.resources).toBeUndefined();
    expect(options(state).find((option) => option.id === stakeId)).toMatchObject({
      combat: { attack_bonus: 0, defense_bonus: 2, phase: "follow_through" },
      resources: { gains: ["saved_brace_stake"], costs: [] },
    });
    expect(
      buildRpgObservation(index, state).available_actions.find((option) => option.id === stakeId)
        ?.resources,
    ).toEqual({ gains: ["saved_brace_stake"], costs: [] });
    expect(buildRpgObservation(index, state).description).toContain("decisive stroke");
    expect(buildRpgObservation(index, state).description).toContain("portable cross-piece");

    const committed = act(state, stakeId, 1, 6);
    expect(committed.flags.flank_brace_stake_saved).toBe(true);
    expect(committed.flags.flank_pinned_at_rail).not.toBe(true);
    expect(committed.inventory).toContain("saved_brace_stake");
    expect(committed.vars[enemyHpVar("flank_wolf")]).toBe(1);
    expect(optionIds(committed)).toContain("attack_flank_wolf");
    expect(optionIds(committed)).not.toContain(pinId);
    expect(optionIds(committed)).not.toContain(stakeId);
    expect(() => assertRpgStateReferences(index, committed)).not.toThrow();

    const replay = makeStep(buildRpgRules(index, () => rolls(6)))(committed, {
      type: "MANEUVER",
      enemy: "flank_wolf",
      maneuver: "wrench_brace_stake",
    } satisfies RpgAction);
    expect(replay.ok).toBe(false);
    expect(replay.state).toEqual(committed);

    const forged = structuredClone(committed);
    forged.flags.flank_pinned_at_rail = true;
    expect(() => assertRpgStateReferences(index, forged)).toThrow(/multiple follow-through/i);
  });

  it("carries the stake into a third leader line, spends it, and remembers the route", () => {
    let state = reachFunnel(3);
    state = act(state, "maneuver_flank_wolf_wrench_brace_stake", 1);
    expect(state.flags.flank_wolf_down).toBe(true);
    expect(state.inventory).toContain("saved_brace_stake");
    state = act(state, "go_north");

    const rootId = "maneuver_grey_leader_crossbrace_saved_stake";
    expect(optionIds(state)).toEqual(
      expect.arrayContaining([
        rootId,
        "maneuver_grey_leader_wait_out_feint",
        "maneuver_grey_leader_close_on_feint",
      ]),
    );
    expect(buildRpgObservation(index, state).description).toContain("saved paling-stake");

    state = act(state, rootId, 1, 6);
    const childId = "maneuver_grey_leader_turn_over_crossbrace";
    expect(options(state).find((option) => option.id === childId)).toMatchObject({
      combat: { attack_bonus: 1, defense_bonus: 0, phase: "follow_through" },
      resources: { gains: [], costs: ["saved_brace_stake"] },
    });
    expect(state.inventory).toContain("saved_brace_stake");

    state = act(state, childId, 1);
    expect(state.flags.leader_turned_over_crossbrace).toBe(true);
    expect(state.inventory).not.toContain("saved_brace_stake");
    expect(state.flags.leader_down).toBe(true);
    expect(() => assertRpgStateReferences(index, state)).not.toThrow();

    state = act(state, "go_north");
    const ending = buildRpgObservation(index, state);
    expect(ending.ending_id).toBe("ending_held");
    expect(ending.ending?.text).toContain("traded the quick pin");
    expect(ending.ending?.text).toContain("spent");
    expect(ending.ending?.text).toContain("*** You have won. ***");
    expect(ending.score).toBe(55);
  });

  it("makes each branch win a fixed roll comparison, so neither dominates", () => {
    // A middling funnel strike lets both children finish immediately; the saved
    // crossbrace then prevents two more HP of leader damage.
    const favorableSafe = finishSafeLine(reachFunnel(3));
    const favorableStake = finishStakeLine(reachFunnel(3));
    expect(favorableStake.vars.hp).toBeGreaterThan(favorableSafe.vars.hp!);
    expect(favorableStake.vars.hp).toBe(25);
    expect(favorableSafe.vars.hp).toBe(23);

    // On the lowest funnel strike, wrenching the stake leaves one HP on the
    // flank-wolf and invites a four-damage reply. The later two-HP saving does
    // not repay it, so the immediate pin wins this outcome.
    const unfavorableSafe = finishSafeLine(reachFunnel(1));
    const unfavorableStake = finishStakeLine(reachFunnel(1));
    expect(unfavorableSafe.vars.hp).toBeGreaterThan(unfavorableStake.vars.hp!);
    expect(unfavorableSafe.vars.hp).toBe(23);
    expect(unfavorableStake.vars.hp).toBe(21);

    for (const ending of [favorableSafe, favorableStake, unfavorableSafe, unfavorableStake]) {
      expect(ending.endingId).toBe("ending_held");
      expect(ending.vars.score).toBe(55);
    }

    // The complete all-worst route includes the yearling's five damage, the
    // stake branch's seven, and the crossbraced leader's two: 14 total.
    const allWorstSafe = finishSafeLine(reachFunnel(1, 1));
    const allWorstStake = finishStakeLine(reachFunnel(1, 1));
    expect(allWorstSafe.vars.hp).toBe(18);
    expect(allWorstStake.vars.hp).toBe(16);
  });
});
