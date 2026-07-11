/**
 * Regression for Wolf-Winter's tactical follow-through. Every taught opening has
 * an authored child beat when the target survives; the braced funnel additionally
 * exposes a persistent resource trade pinned in bug_0501's dedicated suite. The
 * paling wedge remains a consequential one-attempt setup, but failure is recoverable
 * as a weaker real split-rail guard and a distinct flank-wolf route.
 *
 * ATTACK is suppressed while either an opening or its required child is available.
 * It returns only after the full line if an underpowered target still survives.
 * Roots and children are one-shot and reject when replayed stale.
 */
import { describe, expect, it } from "vitest";
import type { RpgAction, StepResult } from "../../src/api/types.js";
import { makeStep } from "../../src/core/engine.js";
import type { Rng } from "../../src/core/rng.js";
import type { GameState } from "../../src/core/state.js";
import { rpgStepEvents } from "../../src/mcp/transcript_projection.js";
import { buildRpgObservation } from "../../src/rpg/observation.js";
import {
  buildRpgRules,
  enumerateRpgActions,
  indexRpgPack,
  initStateForRpgPack,
} from "../../src/rpg/runner.js";
import { enemyHpVar } from "../../src/rpg/schema.js";
import { loadRpgSourceFile } from "../../src/rpg/source.js";

const loaded = loadRpgSourceFile("content/rpg/quests/wolf_winter.yaml");
if (!loaded.ok) throw new Error("wolf_winter must compile");
const pack = loaded.compiled.pack;
const index = indexRpgPack(pack);

type Outcome = "best" | "worst";

/**
 * BEST: win a d20 check, or roll player d6=6 then enemy d6=1.
 * WORST: fail a d20 check, or roll player d6=1 then enemy d6=6.
 * A fresh stream is supplied for each resolved action.
 */
function outcomeRng(outcome: Outcome): Rng {
  let roll = 0;
  return {
    next: () => (outcome === "best" ? 0.999999 : 0),
    int: (min: number, max: number) => {
      const first = roll++ === 0;
      if (outcome === "best") return first ? max : min;
      return first ? min : max;
    },
  };
}

function options(state: GameState) {
  return enumerateRpgActions(index, state);
}

function optionIds(state: GameState): string[] {
  return options(state).map((option) => option.id);
}

function act(state: GameState, id: string, outcome: Outcome = "best"): StepResult {
  const available = options(state);
  const selected = available.find((option) => option.id === id);
  expect(
    selected,
    `expected ${id} in ${state.current}; available: ${available.map((option) => option.id).join(", ")}`,
  ).toBeDefined();
  if (!selected) throw new Error(`missing action ${id}`);
  const step = makeStep(buildRpgRules(index, () => outcomeRng(outcome)));
  const result = step(state, selected.action);
  expect(result.ok, result.rejectionReason).toBe(true);
  return result;
}

function play(state: GameState, ids: readonly string[], outcome: Outcome = "best"): GameState {
  for (const id of ids) state = act(state, id, outcome).state;
  return state;
}

function start(): GameState {
  return initStateForRpgPack(index, 497);
}

function hearBoth(state: GameState): GameState {
  return play(state, ["go_north", "talk_houndsman", "ask_wolves", "ask_byre", "ask_leave"]);
}

function fullyPrepared(): GameState {
  return play(hearBoth(start()), ["go_west", "take_byre_jerkin", "use_byre_jerkin", "go_east"]);
}

/** Reach the leader with both lessons, armor, and both prior two-beat lines complete. */
function reachLeader(): GameState {
  let state = fullyPrepared();
  state = act(state, "go_north").state;
  state = act(state, "use_paling_rail", "best").state;
  state = act(state, "maneuver_yearling_wolf_set_spear", "worst").state;
  state = act(state, "maneuver_yearling_wolf_drive_set_spear", "worst").state;
  state = act(state, "go_north").state;
  state = act(state, "maneuver_flank_wolf_offside_cut", "worst").state;
  state = act(state, "maneuver_flank_wolf_turn_through_return", "worst").state;
  return act(state, "go_north").state;
}

function finishLeader(state: GameState, childId: string): GameState {
  state = act(state, childId, "worst").state;
  return act(state, "go_north").state;
}

describe("Wolf-Winter authored combat tactics", () => {
  it("starts with the real relief spear held, non-droppable, and stat-neutral", () => {
    const spear = pack.objects.find((object) => object.id === "relief_spear");
    expect(spear).toMatchObject({ id: "relief_spear", held: true });
    expect(spear?.takeable).not.toBe(true);

    const state = start();
    const observation = buildRpgObservation(index, state);
    expect(state.inventory).toContain("relief_spear");
    expect(observation.inventory).toContain("relief_spear");
    expect(observation.stats).toEqual({ hp: 30, attack: 5, defense: 3 });
    expect(optionIds(state)).not.toContain("take_relief_spear");
    expect(optionIds(state)).not.toContain("drop_relief_spear");
  });

  it("requires the yearling's drive after its set-spear opening, with no cleanup attack", () => {
    let state = act(fullyPrepared(), "go_north").state;
    const opening = options(state).find(
      (option) => option.id === "maneuver_yearling_wolf_set_spear",
    );
    expect(opening).toMatchObject({
      command: "set the Albany relief spear against the yearling's rush",
      action: {
        type: "MANEUVER",
        enemy: "yearling_wolf",
        maneuver: "set_spear",
      } satisfies RpgAction,
      combat: { attack_bonus: 2, defense_bonus: 0, one_shot: true, phase: "opening" },
    });
    expect(optionIds(state)).not.toContain("attack_yearling_wolf");

    const round = act(state, "maneuver_yearling_wolf_set_spear", "worst");
    state = round.state;
    // d6 1 + (7 + 2) - 2 = 8; reply d6 6 + 4 - 5 = 5.
    expect(state.vars[enemyHpVar("yearling_wolf")]).toBe(3);
    expect(state.vars.hp).toBe(25);
    expect(state.vars.attack).toBe(7);
    expect(state.vars.defense).toBe(5);
    expect(state.flags.yearling_spear_set).toBe(true);
    expect(optionIds(state)).not.toContain("maneuver_yearling_wolf_set_spear");
    expect(optionIds(state)).not.toContain("attack_yearling_wolf");
    const childId = "maneuver_yearling_wolf_drive_set_spear";
    expect(options(state).find((option) => option.id === childId)).toMatchObject({
      combat: { attack_bonus: 0, defense_bonus: 1, one_shot: true, phase: "follow_through" },
    });
    expect(buildRpgObservation(index, state).description).toContain("recoils alive");

    const staleRoot = makeStep(buildRpgRules(index, () => outcomeRng("best")))(state, {
      type: "MANEUVER",
      enemy: "yearling_wolf",
      maneuver: "set_spear",
    });
    expect(staleRoot.ok).toBe(false);

    state = act(state, childId, "worst").state;
    expect(state.flags.yearling_spear_driven).toBe(true);
    expect(state.flags.yearling_down).toBe(true);
    expect(state.vars.hp).toBe(25);
    expect(optionIds(state)).not.toContain("attack_yearling_wolf");
    const staleChild = makeStep(buildRpgRules(index, () => outcomeRng("best")))(state, {
      type: "MANEUVER",
      enemy: "yearling_wolf",
      maneuver: "drive_set_spear",
    });
    expect(staleChild.ok).toBe(false);
  });

  it("makes a successful target-only wedge earn two competing flank openings", () => {
    let state = hearBoth(start());
    state = act(state, "go_north").state;
    const wedge = options(state).find((option) => option.id === "use_paling_rail");
    expect(wedge).toMatchObject({
      command: "wedge fallen paling-rail",
      action: { type: "USE", target: "paling_rail" },
      skill_check: { skill: "defense", difficulty: 11, die: "d20" },
    });
    expect(optionIds(state)).not.toContain("take_paling_rail");

    state = act(state, "use_paling_rail", "best").state;
    expect(state.flags.rail_attempted).toBe(true);
    expect(state.flags.breach_braced).toBe(true);
    expect(state.inventory).not.toContain("paling_rail");
    expect(optionIds(state)).not.toContain("use_paling_rail");
    expect(buildRpgObservation(index, state).visible_objects).toContainEqual({
      id: "paling_rail",
      name: "braced paling-rail",
    });
    expect(optionIds(state)).toContain("examine_paling_rail");

    state = act(state, "maneuver_yearling_wolf_set_spear", "best").state;
    state = act(state, "go_north").state;
    expect(optionIds(state)).toEqual(
      expect.arrayContaining([
        "maneuver_flank_wolf_funnel_thrust",
        "maneuver_flank_wolf_offside_cut",
      ]),
    );
    expect(optionIds(state)).not.toContain("attack_flank_wolf");
    expect(
      options(state).find((option) => option.id === "maneuver_flank_wolf_funnel_thrust"),
    ).toMatchObject({
      combat: { attack_bonus: -1, defense_bonus: 3, one_shot: true, phase: "opening" },
    });
    expect(
      options(state).find((option) => option.id === "maneuver_flank_wolf_offside_cut"),
    ).toMatchObject({
      combat: { attack_bonus: 3, defense_bonus: -3, one_shot: true, phase: "opening" },
    });

    state = act(state, "maneuver_flank_wolf_funnel_thrust", "worst").state;
    expect(state.flags.flank_funneled).toBe(true);
    expect(state.flags.flank_offside_cut).not.toBe(true);
    expect(state.vars[enemyHpVar("flank_wolf")]).toBe(7);
    expect(state.vars.hp).toBe(25);
    expect(state.vars.attack).toBe(7);
    expect(state.vars.defense).toBe(3);
    expect(optionIds(state)).not.toContain("maneuver_flank_wolf_funnel_thrust");
    expect(optionIds(state)).not.toContain("maneuver_flank_wolf_offside_cut");
    expect(optionIds(state)).not.toContain("attack_flank_wolf");
    const childId = "maneuver_flank_wolf_pin_at_rail";
    expect(options(state).find((option) => option.id === childId)).toMatchObject({
      combat: { attack_bonus: 1, defense_bonus: 0, one_shot: true, phase: "follow_through" },
    });
    expect(buildRpgObservation(index, state).description).toContain("guarded line");

    const flankFinish = act(state, childId, "worst");
    state = flankFinish.state;
    expect(state.flags.flank_wolf_down).toBe(true);
    expect(state.flags.flank_pinned_at_rail).toBe(true);
    expect(state.vars.hp).toBe(25);
    expect(rpgStepEvents(flankFinish.events, { compact_events: true })).not.toContainEqual([
      "d",
      "split_rail_guard",
    ]);
    expect(buildRpgObservation(index, state).description).toContain("finishing thrust");
    expect(state.journal).toContain(
      "You put the flank-wolf down across the byre threshold; the dark of the byre runs on north.",
    );
    expect(state.journal.join(" ")).not.toContain("as it cuts for your off side");
  });

  it("turns a failed wedge into a same-id recovered guard and consumes it coherently", () => {
    let state = act(fullyPrepared(), "go_north").state;
    state = act(state, "use_paling_rail", "worst").state;
    expect(state.flags.rail_attempted).toBe(true);
    expect(state.flags.rail_split).toBe(true);
    expect(state.flags.breach_braced).not.toBe(true);
    expect(state.inventory).not.toContain("split_rail_guard");
    const recovery = options(state).find((option) => option.id === "use_paling_rail");
    expect(recovery).toMatchObject({
      id: "use_paling_rail",
      command: "bind split paling-rail",
      action: { type: "USE", target: "paling_rail" },
    });
    expect(recovery?.skill_check).toBeUndefined();
    expect(buildRpgObservation(index, state).description).toContain("use the rail again");

    state = act(state, "use_paling_rail").state;
    expect(state.flags.split_rail_guard_made).toBe(true);
    expect(state.inventory).toContain("split_rail_guard");
    expect(optionIds(state)).not.toContain("use_paling_rail");
    expect(optionIds(state)).not.toContain("drop_split_rail_guard");
    const carriedAtGap = buildRpgObservation(index, state);
    expect(carriedAtGap.description).toContain("ride in your hands");
    expect(carriedAtGap.description).toContain("rough guard for the byre door");
    expect(carriedAtGap.visible_objects.map((object) => object.id)).not.toContain("paling_rail");
    expect(optionIds(state)).not.toContain("examine_paling_rail");
    const staleCarriedLook = makeStep(buildRpgRules(index, () => outcomeRng("best")))(state, {
      type: "LOOK",
      target: "paling_rail",
    });
    expect(staleCarriedLook.ok).toBe(false);
    expect(staleCarriedLook.state).toEqual(state);

    state = act(state, "maneuver_yearling_wolf_set_spear", "best").state;
    state = act(state, "go_north").state;
    const rootId = "maneuver_flank_wolf_splinter_guard";
    expect(optionIds(state)).toContain(rootId);
    expect(optionIds(state)).not.toContain("maneuver_flank_wolf_funnel_thrust");
    expect(optionIds(state)).not.toContain("maneuver_flank_wolf_offside_cut");
    expect(options(state).find((option) => option.id === rootId)?.combat).toEqual({
      attack_bonus: 0,
      defense_bonus: 2,
      one_shot: true,
      phase: "opening",
    });

    state = act(state, rootId, "worst").state;
    expect(state.flags.flank_splinter_guarded).toBe(true);
    expect(state.vars[enemyHpVar("flank_wolf")]).toBe(6);
    expect(state.vars.hp).toBe(26);
    const childId = "maneuver_flank_wolf_hook_over_guard";
    expect(optionIds(state)).toContain(childId);
    expect(optionIds(state)).not.toContain("attack_flank_wolf");
    expect(options(state).find((option) => option.id === childId)?.combat).toEqual({
      attack_bonus: 0,
      defense_bonus: 1,
      one_shot: true,
      phase: "follow_through",
    });

    const guardFinish = act(state, childId, "worst");
    state = guardFinish.state;
    expect(state.flags.flank_hooked_over_guard).toBe(true);
    expect(state.flags.flank_wolf_down).toBe(true);
    expect(state.vars.hp).toBe(26);
    expect(state.inventory).not.toContain("split_rail_guard");
    expect(rpgStepEvents(guardFinish.events, { compact_events: true })).toContainEqual([
      "d",
      "split_rail_guard",
    ]);
    expect(buildRpgObservation(index, state).description).toContain("splinters");

    state = act(state, "go_south").state;
    const spentAtGap = buildRpgObservation(index, state);
    expect(spentAtGap.description).toContain("broke with the flank-wolf at the byre door");
    expect(spentAtGap.description).toContain("no guard remains");
    expect(spentAtGap.description).not.toContain("guard you carry");
    expect(spentAtGap.visible_objects.map((object) => object.id)).not.toContain("paling_rail");
    expect(optionIds(state)).not.toContain("examine_paling_rail");
    const staleSpentLook = makeStep(buildRpgRules(index, () => outcomeRng("best")))(state, {
      type: "LOOK",
      target: "paling_rail",
    });
    expect(staleSpentLook.ok).toBe(false);
    expect(staleSpentLook.state).toEqual(state);

    // Leaving the split rail unbound preserves Cade's off-side option instead.
    let unbound = act(fullyPrepared(), "go_north").state;
    unbound = act(unbound, "use_paling_rail", "worst").state;
    unbound = act(unbound, "maneuver_yearling_wolf_set_spear", "best").state;
    unbound = act(unbound, "go_north").state;
    expect(optionIds(unbound)).toContain("maneuver_flank_wolf_offside_cut");
    expect(optionIds(unbound)).not.toContain(rootId);
  });

  it("makes the leader's guarded wait and violent close distinct, exclusive endings", () => {
    const before = reachLeader();
    const waitId = "maneuver_grey_leader_wait_out_feint";
    const closeId = "maneuver_grey_leader_close_on_feint";
    const waitChildId = "maneuver_grey_leader_take_true_rush";
    const closeChildId = "maneuver_grey_leader_drive_before_recovery";
    expect(optionIds(before)).toEqual(expect.arrayContaining([waitId, closeId]));
    expect(optionIds(before)).not.toContain("attack_grey_leader");
    expect(options(before).find((option) => option.id === waitId)?.combat).toEqual({
      attack_bonus: 0,
      defense_bonus: 3,
      one_shot: true,
      phase: "opening",
    });
    expect(options(before).find((option) => option.id === closeId)?.combat).toEqual({
      attack_bonus: 4,
      defense_bonus: -3,
      one_shot: true,
      phase: "opening",
    });

    const waited = act(before, waitId, "worst").state;
    const closed = act(before, closeId, "worst").state;
    expect(waited.flags.leader_waited_out).toBe(true);
    expect(waited.flags.leader_closed_on).not.toBe(true);
    expect(closed.flags.leader_closed_on).toBe(true);
    expect(closed.flags.leader_waited_out).not.toBe(true);
    expect(closed.vars[enemyHpVar("grey_leader")]).toBeLessThan(
      waited.vars[enemyHpVar("grey_leader")]!,
    );
    expect(closed.vars.hp).toBeLessThan(waited.vars.hp!);
    expect(waited.vars).toMatchObject({ attack: 7, defense: 5 });
    expect(closed.vars).toMatchObject({ attack: 7, defense: 5 });
    expect(optionIds(waited)).toContain(waitChildId);
    expect(optionIds(waited)).not.toContain(closeChildId);
    expect(optionIds(closed)).toContain(closeChildId);
    expect(optionIds(closed)).not.toContain(waitChildId);
    for (const committed of [waited, closed]) {
      expect(optionIds(committed)).not.toContain("attack_grey_leader");
      expect(optionIds(committed)).not.toContain(waitId);
      expect(optionIds(committed)).not.toContain(closeId);
    }
    expect(options(waited).find((option) => option.id === waitChildId)?.combat).toEqual({
      attack_bonus: 1,
      defense_bonus: 0,
      one_shot: true,
      phase: "follow_through",
    });
    expect(options(closed).find((option) => option.id === closeChildId)?.combat).toEqual({
      attack_bonus: 0,
      defense_bonus: 1,
      one_shot: true,
      phase: "follow_through",
    });
    expect(buildRpgObservation(index, waited).description).toContain("true rush");
    expect(buildRpgObservation(index, closed).description).toContain("Drive again");

    const wrongChild = makeStep(buildRpgRules(index, () => outcomeRng("best")))(waited, {
      type: "MANEUVER",
      enemy: "grey_leader",
      maneuver: "drive_before_recovery",
    });
    expect(wrongChild.ok).toBe(false);

    const guardedState = finishLeader(waited, waitChildId);
    const violentState = finishLeader(closed, closeChildId);
    expect(guardedState.flags.leader_true_rush_taken).toBe(true);
    expect(violentState.flags.leader_driven_before_recovery).toBe(true);
    const leaderJournal =
      "The grey leader falls among the straw; beyond her the cattle stand unhurt.";
    expect(guardedState.journal).toContain(leaderJournal);
    expect(violentState.journal).toContain(leaderJournal);
    expect(guardedState.journal.join(" ")).not.toContain(
      "close on the grey leader before she can wait you out",
    );
    const guardedEnding = buildRpgObservation(index, guardedState);
    const violentEnding = buildRpgObservation(index, violentState);
    expect(guardedEnding.ending_id).toBe("ending_held");
    expect(violentEnding.ending_id).toBe("ending_held");
    expect(guardedEnding.ending?.text).toContain("off-side return");
    expect(guardedEnding.ending?.text).toContain("true rush");
    expect(violentEnding.ending?.text).toContain("flank-wolf's return");
    expect(violentEnding.ending?.text).toContain("before the old leader could recover");
    expect(guardedEnding.score).toBe(violentEnding.score);
    expect(guardedEnding.score).toBe(55);
    expect(guardedEnding.max_score).toBe(60);
  });
});
