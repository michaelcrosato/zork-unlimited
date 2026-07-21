/**
 * SS-F12 paired counterfactual: hold the full Wolf-Winter run and ending
 * constant, vary only Albany's dawn dispatch, and prove a later named-NPC
 * service changes in a different district.
 */
import { describe, expect, it } from "vitest";

import { makeStep } from "../../src/core/engine.js";
import type { Rng } from "../../src/core/rng.js";
import type { GameState } from "../../src/core/state.js";
import { createToolApi } from "../../src/mcp/tools.js";
import {
  buildRpgRules,
  enumerateRpgActions,
  indexRpgPack,
  initStateForRpgPack,
} from "../../src/rpg/runner.js";
import { loadRpgSourceFile } from "../../src/rpg/source.js";
import { OverworldSession } from "../../src/world/session.js";
import { loadOverworldManifest } from "../../src/world/source.js";

const WORLD = loadOverworldManifest(process.cwd());
const loaded = loadRpgSourceFile("content/rpg/quests/wolf_winter.yaml");
if (!loaded.ok) throw new Error("wolf_winter must compile");
const RPG_INDEX = indexRpgPack(loaded.compiled.pack);
const FULL = { compact_context: false, compact_result: false } as const;
const STATION_AREA_ID = "albany_city__transport_hub";
const MARKET_AREA_ID = "albany_city__market";
const GREENWAY_AREA_ID = "albany_city__greenway";
// The run uses the sheltered approach, so exposed-ridge fodder cannot alter
// either the fixed quest result or the Market service being compared here.
const NEUTRAL_RELIEF_ALLOCATION = "albany:relief_cade_fodder";
const WAGON_RULE_ID = "albany:dawn_wagon_solo_packet_resupply";
const WARDENS_RULE_ID = "albany:dawn_wardens_greenway_rest";

type ToolApi = ReturnType<typeof createToolApi>;
type DawnChoice = "send_wagon_to_cade" | "send_wardens_north";
type CompletedReturn = Readonly<{
  api: ToolApi;
  sessionId: string;
  choice: DawnChoice;
}>;

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

function act(state: GameState, actionId: string, ...fixedRolls: number[]): GameState {
  const available = enumerateRpgActions(RPG_INDEX, state);
  const chosen = available.find((option) => option.id === actionId);
  expect(
    chosen,
    `expected ${actionId} in ${state.current}; available: ${available.map((option) => option.id).join(", ")}`,
  ).toBeDefined();
  if (!chosen) throw new Error(`missing ${actionId}`);
  const result = makeStep(buildRpgRules(RPG_INDEX, () => rolls(...fixedRolls)))(
    state,
    chosen.action,
  );
  expect(result.ok, result.rejectionReason).toBe(true);
  return result.state;
}

function fullyPrepared(): GameState {
  let state = initStateForRpgPack(RPG_INDEX, 512);
  for (const actionId of [
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
    state = act(state, actionId);
  }
  return state;
}

/** Reach old grey's corpse with the failed paling rail still bound to the spear. */
function savedTimberFork(): GameState {
  let state = act(fullyPrepared(), "go_north");
  state = act(state, "use_paling_rail", 1);
  state = act(state, "use_paling_rail");
  state = act(state, "maneuver_yearling_wolf_set_spear", 6);
  state = act(state, "go_north");
  state = act(state, "maneuver_flank_wolf_offside_cut", 6);
  if (!state.flags.flank_wolf_down) {
    state = act(state, "maneuver_flank_wolf_turn_through_return", 6);
  }
  state = act(state, "go_north");
  state = act(state, "maneuver_grey_leader_wait_out_feint", 6, 1);
  if (!state.flags.leader_down) {
    state = act(state, "maneuver_grey_leader_take_true_rush", 6);
  }
  expect(state.current).toBe("byre_mouth");
  expect(state.inventory).toContain("split_rail_guard");
  return state;
}

function launchAlbanyWolf(api: ToolApi): { overworldSessionId: string; rpgSessionId: string } {
  const started = api.start_overworld({ compact_context: false });
  const overworldSessionId = started.session_id;
  let view = started.observation;
  const civicPoi = view.pois[0];
  const registrationContact = view.characters.find(
    (character) => character.id === WORLD.opening_registration?.contact,
  );
  if (!civicPoi || !registrationContact) {
    throw new Error("expected Albany's civic registration scene");
  }

  api.scout_overworld_session_poi({
    ...FULL,
    session_id: overworldSessionId,
    poi_id: civicPoi.id,
  });
  api.talk_overworld_session_contact({
    ...FULL,
    session_id: overworldSessionId,
    character_id: registrationContact.id,
  });
  api.choose_overworld_session_story({
    ...FULL,
    session_id: overworldSessionId,
    choice: "albany:ledger_advocate",
  });
  api.choose_overworld_session_story({
    ...FULL,
    session_id: overworldSessionId,
    choice: "albany:oath_full_compact_duty",
  });
  const sourced = api.choose_overworld_session_story({
    ...FULL,
    session_id: overworldSessionId,
    choice: "albany:source_rowan_civic_docket",
  });
  const preparationRoute = sourced.observation.areaExits.find(
    (candidate) => candidate.destination.id === WORLD.opening_preparation?.area,
  );
  if (!preparationRoute) throw new Error("expected a route to the opening preparation board");
  const stationed = api.move_overworld_session_area({
    ...FULL,
    session_id: overworldSessionId,
    area_route_id: preparationRoute.id,
  });
  expect(stationed.observation.departureInteractions[0]?.kind).toBe("preparation");
  expect(stationed.observation.quests.map((candidate) => candidate.id)).toContain("wolf_winter");
  api.choose_overworld_session_story({
    ...FULL,
    session_id: overworldSessionId,
    story_choice_id: "albany:wolf_preparation",
    choice: "albany:prep_works_fortification",
  });
  api.choose_overworld_session_story({
    ...FULL,
    session_id: overworldSessionId,
    story_choice_id: "albany:wolf_relief_allocation",
    choice: NEUTRAL_RELIEF_ALLOCATION,
  });

  view = api.get_overworld_session({
    session_id: overworldSessionId,
    include_observation: true,
  }).observation;
  const marketRoute = view.areaExits.find((route) => route.destination.id === MARKET_AREA_ID);
  if (!marketRoute) throw new Error("expected the Albany market route");
  api.move_overworld_session_area({
    ...FULL,
    session_id: overworldSessionId,
    area_route_id: marketRoute.id,
  });

  view = api.get_overworld_session({
    session_id: overworldSessionId,
    include_observation: true,
  }).observation;
  const marketPoi = view.pois[0];
  if (!marketPoi) throw new Error("expected an Albany market lead");
  let local = api.scout_overworld_session_poi({
    ...FULL,
    session_id: overworldSessionId,
    poi_id: marketPoi.id,
  });
  const quest = local.observation.quests.find((candidate) => candidate.id === "wolf_winter");
  const marketContact = local.observation.characters.find(
    (character) => character.id === "albany_city__market__contact",
  );
  if (!quest || !marketContact) throw new Error("expected the certified Wolf-Winter market lead");
  local = api.talk_overworld_session_contact({
    ...FULL,
    session_id: overworldSessionId,
    character_id: marketContact.id,
  });
  const marketSite = local.observation.sites.find((site) => site.area === MARKET_AREA_ID);
  if (!marketSite) throw new Error("expected the discovered Albany market site");
  const explored = api.explore_overworld_session_site({
    ...FULL,
    session_id: overworldSessionId,
    site_id: marketSite.id,
  });
  expect(explored.observation.discoveredAreaIds).toHaveLength(6);

  if (explored.observation.currentArea?.id !== STATION_AREA_ID) {
    const stationRoute = explored.observation.areaExits.find(
      (route) => route.destination.id === STATION_AREA_ID,
    );
    if (!stationRoute) throw new Error("expected the route to Albany Station Quarter");
    api.move_overworld_session_area({
      ...FULL,
      session_id: overworldSessionId,
      area_route_id: stationRoute.id,
    });
  }

  const launched = api.start_overworld_session_quest({
    ...FULL,
    compact_observation: false,
    session_id: overworldSessionId,
    quest_id: quest.id,
    approach_id: "albany:wolf_approach_sheltered_stockway",
    seed: 512,
  });
  return { overworldSessionId, rpgSessionId: launched.rpg_session_id };
}

function completeReturn(choice: DawnChoice): CompletedReturn {
  const api = createToolApi({ root: process.cwd() });
  const launched = launchAlbanyWolf(api);
  api.sessions.update(launched.rpgSessionId, savedTimberFork());
  const final = api.step_action({
    session_id: launched.rpgSessionId,
    action_id: "go_north",
    compact_observation: false,
    compact_events: false,
  });
  expect(final.ok).toBe(true);
  expect(final.questCompletion?.endingId).toBe("ending_held_timber_saved");

  const continued = api.choose_overworld_session_journey({
    session_id: launched.overworldSessionId,
    choice: "continue",
    ...FULL,
  });
  const dispatch = continued.journey.storyChoice;
  expect(dispatch?.id).toBe("albany_dawn_dispatch");
  expect(
    dispatch?.options.find((option) => option.id === "send_wagon_to_cade")?.consequence,
  ).toMatch(/Jamie Tanner.*one-time Market.*15-minute resupply.*whenever you claim it/i);
  expect(
    dispatch?.options.find((option) => option.id === "send_wardens_north")?.consequence,
  ).toMatch(/Emery Sloane.*one-time Greenway.*15-minute rest.*whenever you claim it/i);

  const selected = api.choose_overworld_session_story({
    session_id: launched.overworldSessionId,
    choice,
    ...FULL,
  });
  expect(selected.journey.acceptedDecisions).toBeLessThanOrEqual(45);
  expect(selected.journey.storyChoice).toBeNull();
  const view = selected.observation;
  expect(view.current.id).toBe("albany_city");
  expect(view.currentArea?.id).toBe(STATION_AREA_ID);
  expect(view.completedQuestIds).toContain("wolf_winter");
  expect(view.discoveredAreaIds).toHaveLength(6);
  return { api, sessionId: launched.overworldSessionId, choice };
}

function fullView(completed: CompletedReturn) {
  return completed.api.get_overworld_session({
    session_id: completed.sessionId,
    include_observation: true,
  }).observation;
}

function compactContext(completed: CompletedReturn) {
  return completed.api.get_overworld_session_context({
    session_id: completed.sessionId,
    compact_context: true,
  }).context;
}

function moveToArea(completed: CompletedReturn, areaId: string): void {
  const route = fullView(completed).areaExits.find(
    (candidate) => candidate.destination.id === areaId,
  );
  if (!route) throw new Error(`expected a visible route to ${areaId}`);
  completed.api.move_overworld_session_area({
    ...FULL,
    session_id: completed.sessionId,
    area_route_id: route.id,
  });
}

function addIdenticalRoadStrain(completed: CompletedReturn): void {
  let view = fullView(completed);
  const outbound = view.exits.find((road) => road.destination.id === "colonie_town");
  if (!outbound) throw new Error("expected the Albany-Colonie road");
  completed.api.travel_overworld_session({
    ...FULL,
    session_id: completed.sessionId,
    road_id: outbound.id,
  });
  view = fullView(completed);
  if (view.pendingRoadEncounter) {
    completed.api.resolve_overworld_session_road_encounter({
      ...FULL,
      session_id: completed.sessionId,
      strategy: "press_on",
    });
  }

  view = fullView(completed);
  const inbound = view.exits.find((road) => road.destination.id === "albany_city");
  if (!inbound) throw new Error("expected the Colonie-Albany road");
  completed.api.travel_overworld_session({
    ...FULL,
    session_id: completed.sessionId,
    road_id: inbound.id,
  });
  view = fullView(completed);
  if (view.pendingRoadEncounter) {
    completed.api.resolve_overworld_session_road_encounter({
      ...FULL,
      session_id: completed.sessionId,
      strategy: "press_on",
    });
  }
  expect(fullView(completed).currentArea?.id).toBe(STATION_AREA_ID);
}

describe("SS-F12 — Albany's dawn dispatch changes a named district service", () => {
  it("makes Cade's wagon best for a Market resupply and survives consumption and restore", () => {
    const wagon = completeReturn("send_wagon_to_cade");
    const wardens = completeReturn("send_wardens_north");
    moveToArea(wagon, MARKET_AREA_ID);
    moveToArea(wardens, MARKET_AREA_ID);
    const wagonBefore = fullView(wagon);
    const wardensBefore = fullView(wardens);

    expect(wagonBefore.supplies).toBe(wardensBefore.supplies);
    expect(wagonBefore.fatigue).toBe(wardensBefore.fatigue);
    expect(wagonBefore.supplies).toBeLessThan(wagonBefore.maxSupplies);
    expect(wagonBefore.serviceOffers).toEqual([
      {
        id: WAGON_RULE_ID,
        action: "resupply",
        title: "Claim Jamie's Solo-Packet Road Stores",
        summary:
          "Because you sent the dawn wagon back to Cade and carried Hedrick's packet north alone, Jamie Tanner holds a one-time Market road-store credit.",
        minutes: 15,
        providerId: "albany_city__market__contact",
        providerName: "Jamie Tanner",
      },
    ]);
    expect(wardensBefore.serviceOffers).toEqual([]);
    expect(compactContext(wagon).service_offers).toEqual([
      [
        WAGON_RULE_ID,
        "resupply",
        "Claim Jamie's Solo-Packet Road Stores",
        wagonBefore.serviceOffers[0]!.summary,
        15,
      ],
    ]);
    expect(compactContext(wardens).service_offers).toBeUndefined();

    for (const completed of [wagon, wardens]) {
      const snapshot = completed.api.export_overworld_session({
        session_id: completed.sessionId,
      }).snapshot;
      expect(OverworldSession.restore(WORLD, snapshot).view().serviceOffers).toEqual(
        fullView(completed).serviceOffers,
      );
    }

    const quick = wagon.api.resupply_overworld_session({ session_id: wagon.sessionId });
    const ordinary = wardens.api.resupply_overworld_session({
      ...FULL,
      session_id: wardens.sessionId,
    });
    expect(quick.result).toMatchObject({
      action: "resupply",
      changed: true,
      m: 15,
      supplies: [wagonBefore.supplies, wagonBefore.maxSupplies],
      text: expect.stringContaining("Jamie Tanner holds a one-time Market road-store credit"),
    });
    expect(ordinary.result).toMatchObject({
      action: "resupply",
      changed: true,
      minutes: 45,
      suppliesBefore: wardensBefore.supplies,
      suppliesAfter: wardensBefore.maxSupplies,
    });
    expect(fullView(wagon).serviceOffers).toEqual([]);

    const consumed = wagon.api.export_overworld_session({ session_id: wagon.sessionId }).snapshot;
    expect(consumed.journalEntries).toContainEqual(
      expect.objectContaining({
        kind: "service",
        serviceRuleId: WAGON_RULE_ID,
        serviceAreaId: MARKET_AREA_ID,
        serviceBoundary: expect.objectContaining({ areaId: MARKET_AREA_ID }),
      }),
    );
    const restored = OverworldSession.restore(WORLD, consumed);
    expect(restored.view().serviceOffers).toEqual([]);
    expect(restored.snapshot()).toEqual(consumed);
  });

  it("reverses the advantage for a Greenway rest after identical road strain", () => {
    const wagon = completeReturn("send_wagon_to_cade");
    const wardens = completeReturn("send_wardens_north");
    addIdenticalRoadStrain(wagon);
    addIdenticalRoadStrain(wardens);
    moveToArea(wagon, GREENWAY_AREA_ID);
    moveToArea(wardens, GREENWAY_AREA_ID);
    const wagonBefore = fullView(wagon);
    const wardensBefore = fullView(wardens);

    expect(wagonBefore.supplies).toBe(wardensBefore.supplies);
    expect(wagonBefore.fatigue).toBe(wardensBefore.fatigue);
    expect(wagonBefore.fatigue).toBeGreaterThan(0);
    expect(wagonBefore.serviceOffers).toEqual([]);
    expect(wardensBefore.serviceOffers).toEqual([
      {
        id: WARDENS_RULE_ID,
        action: "rest",
        title: "Claim Emery's Greenway Watch Shelter",
        summary:
          "Because you assigned the dawn wagon and wardens north, Emery Sloane holds a one-time Greenway watch-shelter claim for your part in their dispatch.",
        minutes: 15,
        providerId: "albany_city__greenway__contact",
        providerName: "Emery Sloane",
      },
    ]);
    expect(compactContext(wagon).service_offers).toBeUndefined();
    expect(compactContext(wardens).service_offers).toEqual([
      [
        WARDENS_RULE_ID,
        "rest",
        "Claim Emery's Greenway Watch Shelter",
        wardensBefore.serviceOffers[0]!.summary,
        15,
      ],
    ]);

    for (const completed of [wagon, wardens]) {
      const snapshot = completed.api.export_overworld_session({
        session_id: completed.sessionId,
      }).snapshot;
      expect(OverworldSession.restore(WORLD, snapshot).view().serviceOffers).toEqual(
        fullView(completed).serviceOffers,
      );
    }

    const ordinary = wagon.api.rest_overworld_session({
      ...FULL,
      session_id: wagon.sessionId,
    });
    const quick = wardens.api.rest_overworld_session({ session_id: wardens.sessionId });
    expect(ordinary.result).toMatchObject({
      action: "rest",
      changed: true,
      minutes: 180,
      fatigueBefore: wagonBefore.fatigue,
      fatigueAfter: 0,
    });
    expect(quick.result).toMatchObject({
      action: "rest",
      changed: true,
      m: 15,
      fatigue: [wardensBefore.fatigue, 0],
      text: expect.stringContaining("Emery Sloane holds a one-time Greenway watch-shelter claim"),
    });
    expect(fullView(wardens).serviceOffers).toEqual([]);

    const consumed = wardens.api.export_overworld_session({
      session_id: wardens.sessionId,
    }).snapshot;
    expect(consumed.journalEntries).toContainEqual(
      expect.objectContaining({
        kind: "service",
        serviceRuleId: WARDENS_RULE_ID,
        serviceAreaId: GREENWAY_AREA_ID,
        serviceBoundary: expect.objectContaining({ areaId: GREENWAY_AREA_ID }),
      }),
    );
    expect(OverworldSession.restore(WORLD, consumed).view().serviceOffers).toEqual([]);
  });
});
