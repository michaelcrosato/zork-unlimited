/**
 * SS-F07 isolated counterfactual proof. This initializes Wolf-Winter directly with
 * campaign knowledge, so the route import and quest-local consequences stay testable
 * without depending on the overworld quest-launch transport.
 */
import { describe, expect, it } from "vitest";

import { makeStep } from "../../src/core/engine.js";
import type { GameState } from "../../src/core/state.js";
import { buildRpgObservation } from "../../src/rpg/observation.js";
import {
  buildRpgRules,
  enumerateRpgActions,
  indexRpgPack,
  initStateForRpgPack,
} from "../../src/rpg/runner.js";
import { loadRpgSourceFile } from "../../src/rpg/source.js";
import { buildCampaignCharacterState } from "../../src/world/campaign_character_state.js";
import { loadOverworldManifest } from "../../src/world/source.js";

const world = loadOverworldManifest(process.cwd());
const wolf =
  world.quests.find((quest) => quest.id === "wolf_winter") ??
  (() => {
    throw new Error("the Albany starting slice requires Wolf-Winter");
  })();
const imports =
  wolf.campaign_imports ??
  (() => {
    throw new Error("Wolf-Winter requires campaign imports");
  })();
const launch =
  wolf.launch ??
  (() => {
    throw new Error("Wolf-Winter requires hill-approach launch options");
  })();

const loaded = loadRpgSourceFile("content/rpg/quests/wolf_winter.yaml");
if (!loaded.ok) throw new Error("Wolf-Winter must compile");
const index = indexRpgPack(loaded.compiled.pack);
const step = makeStep(buildRpgRules(index));

const routeSpecs = {
  ridge: {
    optionId: "albany:wolf_approach_exposed_ridge",
    title: "Take the Exposed Ridge Road",
    knowledge: "albany:knowledge_wolf_exposed_ridge",
    memory: "albany:memory_hayden_dispatched_exposed_ridge",
    flag: "approach_exposed_ridge",
    otherFlag: "approach_sheltered_stockway",
    action: "use_exposed_ridge_last_mile",
    otherAction: "use_sheltered_stockway_last_mile",
    importRule: "import:wolf_winter_approach_exposed_ridge",
    difficulty: 10,
    arrivalAlarm: 1,
    terms: { minutes: 30, supplies: 1, fatigue: 25 },
  },
  stockway: {
    optionId: "albany:wolf_approach_sheltered_stockway",
    title: "Take the Sheltered Stockway",
    knowledge: "albany:knowledge_wolf_sheltered_stockway",
    memory: "albany:memory_hayden_dispatched_sheltered_stockway",
    flag: "approach_sheltered_stockway",
    otherFlag: "approach_exposed_ridge",
    action: "use_sheltered_stockway_last_mile",
    otherAction: "use_exposed_ridge_last_mile",
    importRule: "import:wolf_winter_approach_sheltered_stockway",
    difficulty: 12,
    arrivalAlarm: 0,
    terms: { minutes: 75, supplies: 2, fatigue: 10 },
  },
} as const;

type RouteName = keyof typeof routeSpecs;

function actionIds(state: GameState): string[] {
  return enumerateRpgActions(index, state).map((option) => option.id);
}

function action(state: GameState, id: string) {
  const options = enumerateRpgActions(index, state);
  const found = options.find((candidate) => candidate.id === id);
  expect(
    found,
    `${id} must be legal in ${state.current}; legal: ${options
      .map((candidate) => candidate.id)
      .join(", ")}`,
  ).toBeDefined();
  if (!found) throw new Error(`Missing action ${id}.`);
  return found;
}

function act(state: GameState, id: string): GameState {
  const result = step(state, action(state, id).action);
  expect(result.ok, result.rejectionReason).toBe(true);
  return result.state;
}

function routeState(route: RouteName, seed: number, withJune = false): GameState {
  const spec = routeSpecs[route];
  const character = buildCampaignCharacterState({
    background: "albany:ledger_advocate",
    knowledge: [spec.knowledge],
    companions: withJune ? ["albany:june_pike"] : [],
  });
  return initStateForRpgPack(index, seed, { character, imports });
}

function malformedBothRouteState(seed: number): GameState {
  const character = buildCampaignCharacterState({
    background: "albany:ledger_advocate",
    knowledge: [routeSpecs.ridge.knowledge, routeSpecs.stockway.knowledge],
  });
  return initStateForRpgPack(index, seed, { character, imports });
}

function arrive(route: RouteName, seed: number): GameState {
  const spec = routeSpecs[route];
  const initial = routeState(route, seed);
  expect(initial.vars).toMatchObject({ fieldcraft: 0, defense: 3, cattle_alarm: 0 });
  expect(initial.flags[spec.flag]).toBe(true);
  expect(initial.flags[spec.otherFlag]).not.toBe(true);
  expect(initial.campaignImportReceipt?.applied_rules).toEqual([spec.importRule]);
  return act(initial, spec.action);
}

function commitLure(route: RouteName, seed: number): GameState {
  let state = arrive(route, seed);
  state = act(state, "talk_houndsman");
  state = act(state, "ask_lure");
  state = act(state, "ask_commit_lure");
  state = act(state, "ask_leave");
  state = act(state, "go_west");
  state = act(state, "take_winter_feed_sack");
  state = act(state, "go_east");
  return act(state, "go_north");
}

function firstFeedCast(route: RouteName, seed: number): GameState {
  const state = commitLure(route, seed);
  const cast = action(state, "use_winter_feed_sack_on_downwind_feed_line");
  expect(cast.skill_check).toEqual({
    skill: "fieldcraft",
    difficulty: routeSpecs[route].difficulty,
    die: "d20",
  });
  return act(state, cast.id);
}

function finishCleanLure(state: GameState): GameState {
  state = act(state, "go_south");
  state = act(state, "go_west");
  state = act(state, "go_up");
  state = act(state, "use_winter_feed_sack_on_loft_hatch");
  state = act(state, "go_east");
  state = act(state, "go_north");
  state = act(state, "use_winter_feed_sack_on_outer_scent_gate");
  return act(state, "go_north");
}

describe("SS-F07 — Wolf-Winter hill-approach gameplay", () => {
  it("authors the exact two launch choices and imports exactly one route flag from each knowledge", () => {
    expect(launch).toMatchObject({ version: 1, id: "albany:wolf_hill_approach" });
    expect(launch.options).toHaveLength(2);

    for (const spec of Object.values(routeSpecs)) {
      const option = launch.options.find((candidate) => candidate.id === spec.optionId);
      expect(option).toMatchObject({ title: spec.title, terms: spec.terms });
      expect(option?.preview).toMatch(/cattle|alarm|DC 1[02]|Breaking|whole herd/i);
      expect(option?.effects).toEqual([
        { type: "learn_knowledge", knowledge_id: spec.knowledge },
        {
          type: "remember_relationship",
          npc_id: "albany:hayden_hale",
          memory_id: spec.memory,
        },
      ]);

      const state = routeState(spec === routeSpecs.ridge ? "ridge" : "stockway", 9);
      const importedRouteFlags = Object.entries(state.flags)
        .filter(([id, enabled]) => id.startsWith("approach_") && enabled)
        .map(([id]) => id);
      expect(importedRouteFlags).toEqual([spec.flag]);
    }
  });

  it("makes each imported last mile one-shot, preserves direct starts, and fails closed on both flags", () => {
    for (const route of Object.keys(routeSpecs) as RouteName[]) {
      const spec = routeSpecs[route];
      let state = routeState(route, 9);
      expect(actionIds(state)).toContain(spec.action);
      expect(actionIds(state)).not.toContain(spec.otherAction);
      expect(actionIds(state)).not.toContain("go_north");

      state = act(state, spec.action);
      expect(state).toMatchObject({
        current: "byre_yard",
        vars: { cattle_alarm: spec.arrivalAlarm },
        visited: { byre_yard: true },
      });
      state = act(state, "go_south");
      expect(actionIds(state)).toContain("go_north");
      expect(actionIds(state)).not.toContain(spec.action);
      expect(actionIds(state)).not.toContain(spec.otherAction);
    }

    const direct = initStateForRpgPack(index, 9);
    expect(actionIds(direct)).toContain("go_north");
    expect(actionIds(direct)).not.toContain(routeSpecs.ridge.action);
    expect(actionIds(direct)).not.toContain(routeSpecs.stockway.action);

    const malformed = malformedBothRouteState(9);
    expect(malformed.flags).toMatchObject({
      approach_exposed_ridge: true,
      approach_sheltered_stockway: true,
    });
    expect(actionIds(malformed)).not.toContain("go_north");
    expect(actionIds(malformed)).not.toContain(routeSpecs.ridge.action);
    expect(actionIds(malformed)).not.toContain(routeSpecs.stockway.action);
  });

  it("puts route-and-June arrival prose ahead of the generic June arrival and leaves all four plans open", () => {
    for (const route of Object.keys(routeSpecs) as RouteName[]) {
      const spec = routeSpecs[route];
      const withJune = routeState(route, 9, true);
      const arrival = buildRpgObservation(index, withJune);
      expect(arrival.description).toMatch(/June Pike/i);
      expect(arrival.description).toMatch(
        route === "ridge"
          ? /exposed ridge[^]*plume[^]*crosswind/i
          : /sheltered stockway[^]*conceals/i,
      );
      expect(arrival.available_actions.map((candidate) => candidate.id)).toContain(spec.action);

      let state = arrive(route, 9);
      expect(actionIds(state)).toContain("go_north"); // ordinary spear/combat line
      state = act(state, "talk_houndsman");
      expect(actionIds(state)).toEqual(
        expect.arrayContaining(["ask_lure", "ask_drive", "ask_fortify", "ask_wolves"]),
      );
    }
  });

  it("uses seed 9 to separate the ridge DC 10 cast from the stockway DC 12 cast and rail recovery", () => {
    const ridge = firstFeedCast("ridge", 9);
    expect(ridge.flags).toMatchObject({ yearling_redirected: true });
    expect(ridge.flags.lure_trail_fouled).not.toBe(true);
    expect(ridge.vars.cattle_alarm).toBe(2);

    let stockway = firstFeedCast("stockway", 9);
    expect(stockway.flags).toMatchObject({ lure_trail_fouled: true });
    expect(stockway.flags.yearling_redirected).not.toBe(true);
    expect(stockway.vars.cattle_alarm).toBe(2);
    expect(actionIds(stockway)).not.toContain("use_winter_feed_sack_on_downwind_feed_line");

    stockway = act(stockway, "use_paling_rail");
    expect(stockway.flags.rail_split).toBe(true);
    stockway = act(stockway, "use_paling_rail");
    stockway = act(stockway, "use_split_rail_guard_on_downwind_feed_line");
    expect(stockway.flags).toMatchObject({
      yearling_redirected: true,
      yearling_redirected_with_split_guard: true,
    });
    expect(stockway.inventory).not.toContain("split_rail_guard");
  });

  it("uses seed 26 to make both casts pass while the ridge scatters cattle and the stockway keeps the herd whole", () => {
    const ridge = finishCleanLure(firstFeedCast("ridge", 26));
    const stockway = finishCleanLure(firstFeedCast("stockway", 26));

    expect(ridge).toMatchObject({
      ended: true,
      endingId: "ending_pack_diverted_cattle_scattered",
      vars: { cattle_alarm: 4 },
    });
    expect(stockway).toMatchObject({
      ended: true,
      endingId: "ending_pack_diverted",
      vars: { cattle_alarm: 3 },
    });
    expect(ridge.flags.lure_trail_fouled).not.toBe(true);
    expect(stockway.flags.lure_trail_fouled).not.toBe(true);
    const ridgeEnding = buildRpgObservation(index, ridge).ending?.text ?? "";
    expect(ridgeEnding).toMatch(/accumulated[^]*alarm[^]*two animals are missing/i);
    expect(ridgeEnding).not.toMatch(/fouled first cast/i);
    expect(buildRpgObservation(index, stockway).ending?.text).toMatch(/cattle whole/i);
  });
});
