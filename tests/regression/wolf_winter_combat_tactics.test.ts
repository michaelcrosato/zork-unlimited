/**
 * Regression for the Wolf-Winter tactical pass. The three wolves now have
 * authored, one-shot opening rounds whose temporary arithmetic and aftermath
 * match Cade's advice. The paling rail is a consequential, one-attempt setup:
 * success earns the flank-wolf's guarded opening; failure destroys that line.
 *
 * Opening maneuvers replace ATTACK while one is available. A prepared player
 * therefore makes one real tactical commitment, rather than collecting a free
 * buff beside the ordinary round. If the target survives, ATTACK returns as the
 * honest fallback. A route that earned no opening always retains ATTACK.
 */
import { describe, expect, it } from "vitest";
import type { RpgAction, StepResult } from "../../src/api/types.js";
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

function hearCounsel(state: GameState): GameState {
  return play(state, ["go_north", "talk_houndsman", "ask_wolves", "ask_leave"]);
}

function hearBoth(state: GameState): GameState {
  return play(state, ["go_north", "talk_houndsman", "ask_wolves", "ask_byre", "ask_leave"]);
}

/** Reach the leader with both of Cade's lessons and both prior wolves down. */
function reachLeader(): GameState {
  let state = hearBoth(start());
  state = act(state, "go_north").state;
  state = act(state, "use_paling_rail", "best").state;
  state = act(state, "maneuver_yearling_wolf_set_spear", "best").state;
  state = act(state, "go_north").state;
  state = act(state, "maneuver_flank_wolf_offside_cut", "best").state;
  return act(state, "go_north").state;
}

function finishLeader(state: GameState): GameState {
  state = act(state, "attack_grey_leader", "best").state;
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

  it("teaches a mandatory one-shot yearling opening, then restores ATTACK", () => {
    let state = play(start(), ["go_north", "go_north"]);
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
      combat: { attack_bonus: 2, defense_bonus: 0, one_shot: true },
    });
    expect(optionIds(state)).not.toContain("attack_yearling_wolf");

    const round = act(state, "maneuver_yearling_wolf_set_spear", "worst");
    state = round.state;
    // d6 1 + (5 + 2) - 2 = 6; reply d6 6 + 4 - 3 = 7.
    expect(state.vars[enemyHpVar("yearling_wolf")]).toBe(5);
    expect(state.vars.hp).toBe(23);
    expect(state.vars.attack).toBe(5);
    expect(state.vars.defense).toBe(3);
    expect(state.flags.yearling_spear_set).toBe(true);
    expect(optionIds(state)).not.toContain("maneuver_yearling_wolf_set_spear");
    expect(optionIds(state)).toContain("attack_yearling_wolf");
    expect(buildRpgObservation(index, state).description).toContain("recoils alive");

    const replay = makeStep(buildRpgRules(index, () => outcomeRng("best")))(state, {
      type: "MANEUVER",
      enemy: "yearling_wolf",
      maneuver: "set_spear",
    });
    expect(replay.ok).toBe(false);
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
      combat: { attack_bonus: -1, defense_bonus: 3, one_shot: true },
    });
    expect(
      options(state).find((option) => option.id === "maneuver_flank_wolf_offside_cut"),
    ).toMatchObject({
      combat: { attack_bonus: 3, defense_bonus: -3, one_shot: true },
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
    expect(optionIds(state)).toContain("attack_flank_wolf");
    expect(buildRpgObservation(index, state).description).toContain("guarded line");

    state = act(state, "attack_flank_wolf", "best").state;
    expect(state.flags.flank_wolf_down).toBe(true);
    expect(state.journal).toContain(
      "You put the flank-wolf down across the byre threshold; the dark of the byre runs on north.",
    );
    expect(state.journal.join(" ")).not.toContain("as it cuts for your off side");
  });

  it("makes a failed wedge final: the funnel is lost, but counsel or ATTACK still works", () => {
    let counselRoute = hearCounsel(start());
    counselRoute = act(counselRoute, "go_north").state;
    counselRoute = act(counselRoute, "use_paling_rail", "worst").state;
    expect(counselRoute.flags.rail_attempted).toBe(true);
    expect(counselRoute.flags.breach_braced).not.toBe(true);
    expect(counselRoute.inventory).not.toContain("paling_rail");
    expect(optionIds(counselRoute)).not.toContain("use_paling_rail");
    expect(optionIds(counselRoute)).not.toContain("take_paling_rail");
    expect(buildRpgObservation(index, counselRoute).description).toContain("split in the snow");

    counselRoute = act(counselRoute, "maneuver_yearling_wolf_set_spear", "best").state;
    counselRoute = act(counselRoute, "go_north").state;
    expect(optionIds(counselRoute)).toContain("maneuver_flank_wolf_offside_cut");
    expect(optionIds(counselRoute)).not.toContain("maneuver_flank_wolf_funnel_thrust");
    expect(optionIds(counselRoute)).not.toContain("attack_flank_wolf");

    // Without either preparation, the same failed rail leaves the honest fallback.
    let fallbackRoute = play(start(), ["go_north", "go_north"]);
    fallbackRoute = act(fallbackRoute, "use_paling_rail", "worst").state;
    fallbackRoute = act(fallbackRoute, "maneuver_yearling_wolf_set_spear", "best").state;
    fallbackRoute = act(fallbackRoute, "go_north").state;
    expect(optionIds(fallbackRoute)).toContain("attack_flank_wolf");
    expect(optionIds(fallbackRoute).some((id) => id.startsWith("maneuver_flank_wolf_"))).toBe(
      false,
    );
  });

  it("makes the leader's guarded wait and violent close distinct, exclusive endings", () => {
    const before = reachLeader();
    const waitId = "maneuver_grey_leader_wait_out_feint";
    const closeId = "maneuver_grey_leader_close_on_feint";
    expect(optionIds(before)).toEqual(expect.arrayContaining([waitId, closeId]));
    expect(optionIds(before)).not.toContain("attack_grey_leader");
    expect(options(before).find((option) => option.id === waitId)?.combat).toEqual({
      attack_bonus: 0,
      defense_bonus: 3,
      one_shot: true,
    });
    expect(options(before).find((option) => option.id === closeId)?.combat).toEqual({
      attack_bonus: 4,
      defense_bonus: -3,
      one_shot: true,
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
    expect(waited.vars).toMatchObject({ attack: 7, defense: 3 });
    expect(closed.vars).toMatchObject({ attack: 7, defense: 3 });
    for (const committed of [waited, closed]) {
      expect(optionIds(committed)).toContain("attack_grey_leader");
      expect(optionIds(committed)).not.toContain(waitId);
      expect(optionIds(committed)).not.toContain(closeId);
    }
    expect(buildRpgObservation(index, waited).description).toContain("square guard");
    expect(buildRpgObservation(index, closed).description).toContain("violent close");

    const guardedState = finishLeader(waited);
    const violentState = finishLeader(closed);
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
    expect(guardedEnding.ending?.text).toContain("patience broke");
    expect(violentEnding.ending?.text).toContain("violence of your close");
    expect(guardedEnding.score).toBe(violentEnding.score);
    expect(guardedEnding.score).toBe(50);
    expect(guardedEnding.max_score).toBe(60);
  });
});
