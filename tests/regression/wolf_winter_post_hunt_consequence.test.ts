/**
 * Regression for bug_0505: preserving the split guard or brace-stake once changed HP
 * and prose, but the quest ignored the surviving material at the terminal boundary.
 * Saved wood now creates a final, equal-score choice: bar the herd's inner gate now or
 * carry the cross-piece into dawn for repairing the broken paling.
 */
import { describe, expect, it } from "vitest";
import { makeStep } from "../../src/core/engine.js";
import type { Rng } from "../../src/core/rng.js";
import type { GameState } from "../../src/core/state.js";
import { overworldQuestCompletionFromRpgSession } from "../../src/mcp/overworld_quest_bridge.js";
import { createToolApi } from "../../src/mcp/tools.js";
import { buildRpgObservation } from "../../src/rpg/observation.js";
import {
  buildRpgRules,
  enumerateRpgActions,
  indexRpgPack,
  initStateForRpgPack,
} from "../../src/rpg/runner.js";
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

function act(state: GameState, id: string, ...fixedRolls: number[]): GameState {
  const available = options(state);
  const chosen = available.find((option) => option.id === id);
  expect(
    chosen,
    `expected ${id} in ${state.current}; available: ${available.map((option) => option.id).join(", ")}`,
  ).toBeDefined();
  if (!chosen) throw new Error(`missing ${id}`);
  const result = makeStep(buildRpgRules(index, () => rolls(...fixedRolls)))(state, chosen.action);
  expect(result.ok, result.rejectionReason).toBe(true);
  return result.state;
}

function fullyPrepared(): GameState {
  let state = initStateForRpgPack(index, 505);
  for (const id of [
    "go_north",
    "read_day_book",
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

function finishLeaderWithoutResource(state: GameState): GameState {
  state = act(state, "go_north");
  state = act(state, "maneuver_grey_leader_wait_out_feint", 6, 1);
  if (!state.flags.leader_down) {
    state = act(state, "maneuver_grey_leader_take_true_rush", 6);
  }
  expect(state.flags.leader_down).toBe(true);
  expect(state.current).toBe("byre_mouth");
  return state;
}

/** Reach old grey's corpse with the failed rail still bound across the spear. */
function retainSplitGuard(): GameState {
  let state = act(fullyPrepared(), "go_north");
  state = act(state, "use_paling_rail", 1);
  state = act(state, "use_paling_rail");
  state = act(state, "maneuver_yearling_wolf_set_spear", 6);
  state = act(state, "go_north");
  state = act(state, "maneuver_flank_wolf_offside_cut", 6);
  if (!state.flags.flank_wolf_down) {
    state = act(state, "maneuver_flank_wolf_turn_through_return", 6);
  }
  expect(state.inventory).toContain("split_rail_guard");
  return finishLeaderWithoutResource(state);
}

/** Reach old grey's corpse with the funnel's brace-stake still sound and unspent. */
function retainBraceStake(): GameState {
  let state = act(fullyPrepared(), "go_north");
  state = act(state, "use_paling_rail", 20);
  state = act(state, "maneuver_yearling_wolf_set_spear", 6);
  state = act(state, "go_north");
  state = act(state, "maneuver_flank_wolf_funnel_thrust", 3, 6);
  state = act(state, "maneuver_flank_wolf_wrench_brace_stake", 1);
  if (!state.flags.flank_wolf_down) state = act(state, "attack_flank_wolf", 6);
  expect(state.inventory).toContain("saved_brace_stake");
  return finishLeaderWithoutResource(state);
}

type ResourceCase = {
  item: "split_rail_guard" | "saved_brace_stake";
  barredFlag: "cattle_gate_barred_with_split_guard" | "cattle_gate_barred_with_brace_stake";
  reach: () => GameState;
};

const RESOURCE_CASES: readonly ResourceCase[] = [
  {
    item: "split_rail_guard",
    barredFlag: "cattle_gate_barred_with_split_guard",
    reach: retainSplitGuard,
  },
  {
    item: "saved_brace_stake",
    barredFlag: "cattle_gate_barred_with_brace_stake",
    reach: retainBraceStake,
  },
];

function barActionId(state: GameState, item: ResourceCase["item"]): string {
  const action = options(state).find(
    (option) =>
      option.action.type === "USE" &&
      option.action.item === item &&
      option.action.target === "inner_cattle_gate",
  );
  expect(action?.command).toMatch(/^bar .*inner cattle-gate.* with /i);
  if (!action) throw new Error(`missing ${item} gate-bar action`);
  return action.id;
}

describe("bug_0505 — Wolf-Winter saved wood has a post-hunt consequence", () => {
  it("offers retain-versus-bar only after old grey falls with sound wood in hand", () => {
    const gate = pack.objects.find((object) => object.id === "inner_cattle_gate");
    expect(gate?.visible_when).toEqual([{ has_flag: "leader_down" }]);

    for (const route of RESOURCE_CASES) {
      const state = route.reach();
      const observation = buildRpgObservation(index, state);
      expect(observation.visible_objects).toContainEqual({
        id: "inner_cattle_gate",
        name: "inner cattle-gate",
      });
      expect(options(state).map((option) => option.id)).toContain("go_north");
      expect(barActionId(state, route.item)).toBeTruthy();
      expect(observation.description).toMatch(/bar their inner gate[^]*carry it into dawn/i);
    }
  });

  it("makes both resource choices terminal, equal-score, and mechanically distinct", () => {
    for (const route of RESOURCE_CASES) {
      const fork = route.reach();

      const retained = act(structuredClone(fork), "go_north");
      expect(retained).toMatchObject({ ended: true, endingId: "ending_held_timber_saved" });
      expect(retained.inventory).toContain(route.item);
      expect(retained.flags[route.barredFlag]).not.toBe(true);
      expect(retained.vars.score).toBe(60);
      expect(buildRpgObservation(index, retained).ending?.title).toBe(
        "The Byre Held, Paling Timber Saved",
      );

      const barred = act(structuredClone(fork), barActionId(fork, route.item));
      expect(barred).toMatchObject({ ended: true, endingId: "ending_held_gate_barred" });
      expect(barred.inventory).not.toContain(route.item);
      expect(barred.flags[route.barredFlag]).toBe(true);
      expect(barred.vars.score).toBe(60);
      expect(buildRpgObservation(index, barred).ending?.title).toBe(
        "The Byre Held, Inner Gate Barred",
      );

      expect(retained.vars.hp).toBe(barred.vars.hp);
      expect(() => assertRpgStateReferences(index, retained)).not.toThrow();
      expect(() => assertRpgStateReferences(index, barred)).not.toThrow();
      expect(enumerateRpgActions(index, retained)).toEqual([]);
      expect(enumerateRpgActions(index, barred)).toEqual([]);
    }
  });

  it("keeps ordinary spent-resource victories on the established generic ending", () => {
    const generic = pack.win_conditions.at(-1);
    expect(generic).toMatchObject({ id: "hold_the_byre", ending: "ending_held" });
    expect(generic?.conditions).toEqual([{ visited: "cattle_stand" }]);

    const special = pack.win_conditions.slice(0, -1).map((condition) => condition.ending);
    expect(special).toEqual([
      "ending_held_gate_barred",
      "ending_held_gate_barred",
      "ending_held_timber_saved",
      "ending_held_timber_saved",
    ]);
  });

  it("exports both consequence identities through the RPG-to-overworld bridge", () => {
    const fork = retainSplitGuard();
    const outcomes = [
      {
        state: act(structuredClone(fork), "go_north"),
        id: "ending_held_timber_saved",
        title: "The Byre Held, Paling Timber Saved",
      },
      {
        state: act(structuredClone(fork), barActionId(fork, "split_rail_guard")),
        id: "ending_held_gate_barred",
        title: "The Byre Held, Inner Gate Barred",
      },
    ] as const;

    for (const expected of outcomes) {
      const api = createToolApi({ root: process.cwd() });
      const started = api.start_world_quest({
        world_quest_id: "wolf_winter",
        seed: 505,
        overworldSessionId: "ow-consequence-proof",
      });
      api.sessions.update(started.session_id, expected.state);
      const completion = overworldQuestCompletionFromRpgSession(
        api.sessions.get(started.session_id),
        "ow-consequence-proof",
      );
      expect(completion).toEqual({
        questId: "wolf_winter",
        outcome: { endingId: expected.id, endingTitle: expected.title, death: false },
      });
    }
  });
});
