/**
 * SS-F11 paired counterfactual: the equal-score saved-wood fork must survive the
 * quest boundary and make a later Albany service mechanically different. Each
 * side is advantageous under a different reachable overworld resource need.
 */
import { describe, expect, it } from "vitest";

import { makeStep } from "../../src/core/engine.js";
import { hashState } from "../../src/core/hash.js";
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
const SAVED_RULE_ID = "albany:wolf_saved_timber_quick_resupply";
const BARRED_RULE_ID = "albany:wolf_barred_gate_quick_rest";
const STATION_AREA_ID = "albany_city__transport_hub";
const NEUTRAL_RELIEF_ALLOCATION = "albany:relief_resident_shelter";

type ToolApi = ReturnType<typeof createToolApi>;

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
  let state = initStateForRpgPack(RPG_INDEX, 511);
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

/** Reach old grey's corpse with the failed paling rail still bound across the spear. */
function savedGuardFork(): GameState {
  let state = act(fullyPrepared(), "go_north");
  state = act(state, "wedge_paling_rail", 1);
  state = act(state, "bind_split_paling_rail");
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

function barGuardActionId(state: GameState): string {
  const action = enumerateRpgActions(RPG_INDEX, state).find(
    (option) =>
      option.action.type === "USE" &&
      option.action.item === "split_rail_guard" &&
      option.action.target === "inner_cattle_gate",
  );
  if (!action) throw new Error("expected the split-rail inner-gate action");
  return action.id;
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
  const atPreparation = api.move_overworld_session_area({
    ...FULL,
    session_id: overworldSessionId,
    area_route_id: preparationRoute.id,
  });
  expect(atPreparation.observation.departureInteractions[0]?.kind).toBe("preparation");
  expect(atPreparation.observation.quests.map((candidate) => candidate.id)).toContain(
    "wolf_winter",
  );
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
  const marketRoute = view.areaExits.find(
    (route) => route.destination.id === "albany_city__market",
  );
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
  const revealed = api.scout_overworld_session_poi({
    ...FULL,
    session_id: overworldSessionId,
    poi_id: marketPoi.id,
  });
  const quest = revealed.observation.quests.find((candidate) => candidate.id === "wolf_winter");
  if (!quest) throw new Error("expected the certified Wolf-Winter lead");
  if (revealed.observation.currentArea?.id !== quest.area) {
    const stationRoute = revealed.observation.areaExits.find(
      (route) => route.destination.id === quest.area,
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
    seed: 511,
  });
  return { overworldSessionId, rpgSessionId: launched.rpg_session_id };
}

type CompletedReturn = {
  api: ToolApi;
  sessionId: string;
};

function completeReturn(choice: "saved" | "barred"): CompletedReturn {
  const api = createToolApi({ root: process.cwd() });
  const launched = launchAlbanyWolf(api);
  const fork = savedGuardFork();
  api.sessions.update(launched.rpgSessionId, fork);
  const finalActionId = choice === "saved" ? "go_north" : barGuardActionId(fork);
  const final = api.step_action({
    session_id: launched.rpgSessionId,
    action_id: finalActionId,
    compact_observation: false,
    compact_events: false,
  });
  expect(final.ok).toBe(true);
  expect(final.questCompletion?.endingId).toBe(
    choice === "saved" ? "ending_held_timber_saved" : "ending_held_gate_barred",
  );
  expect(final.questCompletion?.entry).not.toHaveProperty("questCompletionBoundary");

  const continued = api.choose_overworld_session_journey({
    session_id: launched.overworldSessionId,
    choice: "continue",
    ...FULL,
  });
  expect(continued.journey.storyChoice?.id).toBe("albany_dawn_dispatch");
  api.choose_overworld_session_story({
    session_id: launched.overworldSessionId,
    choice: "send_wagon_to_cade",
    ...FULL,
  });
  const view = api.get_overworld_session({
    session_id: launched.overworldSessionId,
    include_observation: true,
  }).observation;
  expect(view.current.id).toBe("albany_city");
  expect(view.currentArea?.id).toBe(STATION_AREA_ID);
  return { api, sessionId: launched.overworldSessionId };
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

function addIdenticalRoadStrain(completed: CompletedReturn): void {
  let view = fullView(completed);
  const outbound =
    view.exits.find((road) => road.destination.id === "colonie_town") ?? view.exits[0];
  if (!outbound) throw new Error("expected a road out of Albany");
  completed.api.travel_overworld_session({
    session_id: completed.sessionId,
    road_id: outbound.id,
    ...FULL,
  });
  view = fullView(completed);
  if (view.pendingRoadEncounter) {
    completed.api.resolve_overworld_session_road_encounter({
      session_id: completed.sessionId,
      strategy: "press_on",
      ...FULL,
    });
  }

  view = fullView(completed);
  const returnRoad = view.exits.find((road) => road.destination.id === "albany_city");
  if (!returnRoad) throw new Error("expected the return road to Albany");
  completed.api.travel_overworld_session({
    session_id: completed.sessionId,
    road_id: returnRoad.id,
    ...FULL,
  });
  view = fullView(completed);
  if (view.pendingRoadEncounter) {
    completed.api.resolve_overworld_session_road_encounter({
      session_id: completed.sessionId,
      strategy: "press_on",
      ...FULL,
    });
  }
  view = fullView(completed);
  expect(view.current.id).toBe("albany_city");
  expect(view.currentArea?.id).toBe(STATION_AREA_ID);
}

describe("SS-F11 — saved Wolf-Winter wood changes Albany's one-time service", () => {
  it("makes retained timber best for an immediate resupply and binds consumption across restore", () => {
    const saved = completeReturn("saved");
    const barred = completeReturn("barred");
    const savedBefore = fullView(saved);
    const barredBefore = fullView(barred);

    expect(savedBefore.supplies).toBe(barredBefore.supplies);
    expect(savedBefore.fatigue).toBe(barredBefore.fatigue);
    expect(savedBefore.supplies).toBeLessThan(savedBefore.maxSupplies);
    expect(savedBefore.serviceOffers).toEqual([
      {
        id: SAVED_RULE_ID,
        action: "resupply",
        title: "Reclaim the Unused Repair-Wagon Stores",
        summary:
          "Because Cade already has sound timber for the broken paling, Hayden returns the repair wagon's food, lamp oil, and road gear to the Station Quarter relief tag.",
        minutes: 15,
      },
    ]);
    expect(barredBefore.serviceOffers).toEqual([
      {
        id: BARRED_RULE_ID,
        action: "rest",
        title: "Take the Released Night-Watch Cot",
        summary:
          "Because the inner cattle gate held behind the committed guard wood, Hayden closes the overnight watch request and releases a warmed Road Warden cot at the Station Quarter.",
        minutes: 15,
      },
    ]);
    expect(Object.keys(savedBefore.serviceOffers[0]!).sort()).toEqual([
      "action",
      "id",
      "minutes",
      "summary",
      "title",
    ]);
    expect(compactContext(saved).service_offers).toEqual([
      [
        SAVED_RULE_ID,
        "resupply",
        "Reclaim the Unused Repair-Wagon Stores",
        savedBefore.serviceOffers[0]!.summary,
        15,
      ],
    ]);
    expect(compactContext(barred).service_offers).toEqual([
      [
        BARRED_RULE_ID,
        "rest",
        "Take the Released Night-Watch Cot",
        barredBefore.serviceOffers[0]!.summary,
        15,
      ],
    ]);

    for (const completed of [saved, barred]) {
      const snapshot = completed.api.export_overworld_session({
        session_id: completed.sessionId,
      }).snapshot;
      expect(OverworldSession.restore(WORLD, snapshot).view().serviceOffers).toEqual(
        fullView(completed).serviceOffers,
      );
    }

    const quick = saved.api.resupply_overworld_session({ session_id: saved.sessionId, ...FULL });
    const ordinary = barred.api.resupply_overworld_session({
      session_id: barred.sessionId,
      ...FULL,
    });
    expect(quick.result).toMatchObject({
      action: "resupply",
      changed: true,
      minutes: 15,
      suppliesBefore: savedBefore.supplies,
      suppliesAfter: savedBefore.maxSupplies,
    });
    expect(ordinary.result).toMatchObject({
      action: "resupply",
      changed: true,
      minutes: 45,
      suppliesBefore: barredBefore.supplies,
      suppliesAfter: barredBefore.maxSupplies,
    });
    expect(quick.result.message).toContain("Cade already has sound timber");
    expect(ordinary.result.message).not.toContain("Cade already has sound timber");
    expect(quick.result.entry).not.toHaveProperty("serviceRuleId");
    expect(quick.result.entry).not.toHaveProperty("serviceAreaId");
    expect(quick.result.entry).not.toHaveProperty("serviceBoundary");
    expect(quick.observation.serviceOffers).toEqual([]);
    expect(ordinary.observation.serviceOffers.map((offer) => offer.id)).toEqual([BARRED_RULE_ID]);
    expect(compactContext(saved).service_offers).toBeUndefined();
    expect(compactContext(barred).service_offers?.map(([id]) => id)).toEqual([BARRED_RULE_ID]);

    const consumed = saved.api.export_overworld_session({ session_id: saved.sessionId }).snapshot;
    expect(consumed.journalEntries).toContainEqual(
      expect.objectContaining({
        kind: "service",
        serviceRuleId: SAVED_RULE_ID,
        serviceAreaId: STATION_AREA_ID,
      }),
    );
    const restored = OverworldSession.restore(WORLD, consumed);
    expect(restored.view().serviceOffers).toEqual([]);
    expect(restored.snapshot()).toEqual(consumed);
  });

  it("reverses the advantage when identical road travel creates a need for rest", () => {
    const saved = completeReturn("saved");
    const barred = completeReturn("barred");
    addIdenticalRoadStrain(saved);
    addIdenticalRoadStrain(barred);
    const savedBefore = fullView(saved);
    const barredBefore = fullView(barred);

    expect(savedBefore.supplies).toBe(barredBefore.supplies);
    expect(savedBefore.fatigue).toBe(barredBefore.fatigue);
    expect(savedBefore.fatigue).toBeGreaterThan(0);
    expect(savedBefore.serviceOffers.map((offer) => offer.id)).toEqual([SAVED_RULE_ID]);
    expect(barredBefore.serviceOffers.map((offer) => offer.id)).toEqual([BARRED_RULE_ID]);
    expect(compactContext(saved).service_offers?.map(([id]) => id)).toEqual([SAVED_RULE_ID]);
    expect(compactContext(barred).service_offers?.map(([id]) => id)).toEqual([BARRED_RULE_ID]);

    const ordinary = saved.api.rest_overworld_session({ session_id: saved.sessionId, ...FULL });
    const quick = barred.api.rest_overworld_session({ session_id: barred.sessionId, ...FULL });
    expect(ordinary.result).toMatchObject({
      action: "rest",
      changed: true,
      minutes: 180,
      fatigueBefore: savedBefore.fatigue,
      fatigueAfter: 0,
    });
    expect(quick.result).toMatchObject({
      action: "rest",
      changed: true,
      minutes: 15,
      fatigueBefore: barredBefore.fatigue,
      fatigueAfter: 0,
    });
    expect(quick.result.message).toContain("inner cattle gate held");
    expect(ordinary.result.message).not.toContain("inner cattle gate held");
    expect(quick.observation.serviceOffers).toEqual([]);
    expect(ordinary.observation.serviceOffers.map((offer) => offer.id)).toEqual([SAVED_RULE_ID]);
    expect(compactContext(barred).service_offers).toBeUndefined();
    expect(compactContext(saved).service_offers?.map(([id]) => id)).toEqual([SAVED_RULE_ID]);

    const consumed = barred.api.export_overworld_session({ session_id: barred.sessionId }).snapshot;
    expect(consumed.journalEntries).toContainEqual(
      expect.objectContaining({
        kind: "service",
        serviceRuleId: BARRED_RULE_ID,
        serviceAreaId: STATION_AREA_ID,
      }),
    );
    expect(OverworldSession.restore(WORLD, consumed).view().serviceOffers).toEqual([]);
  });

  it("binds the exported timber fact to the journey's actual quest-completion decision", () => {
    const saved = completeReturn("saved");
    const snapshot = saved.api.export_overworld_session({ session_id: saved.sessionId }).snapshot;
    const trail = snapshot.openingLeadSourceDecisionTrail;
    const questStart = trail?.decisions.find(
      (decision) =>
        decision.actionId === "quest_start:wolf_winter:albany:wolf_approach_sheltered_stockway",
    );
    const completion = snapshot.journalEntries.find(
      (entry) => entry.id === "quest_done:wolf_winter",
    );
    if (!trail || !questStart || !completion?.questCompletionBoundary) {
      throw new Error("expected Wolf-Winter journey and completion proofs");
    }
    expect(completion.questCompletionBoundary.acceptedDecisions).toBeGreaterThan(questStart.number);

    let questStartProofHash = trail.baseDecisionProofHash;
    for (const decision of trail.decisions) {
      questStartProofHash = hashState({ previous: questStartProofHash, ...decision });
      if (decision.number === questStart.number) break;
    }
    completion.questCompletionBoundary.acceptedDecisions = questStart.number;
    completion.questCompletionBoundary.decisionProofHash = questStartProofHash;

    expect(() => OverworldSession.restore(WORLD, snapshot)).toThrow(
      /quest completion journal "quest_done:wolf_winter" does not match its completed journey goal decision/i,
    );
  });

  it("keeps the authored timber cause in the default compact service response", () => {
    const saved = completeReturn("saved");
    const accepted = saved.api.resupply_overworld_session({ session_id: saved.sessionId });

    expect(accepted.result).toMatchObject({
      action: "resupply",
      changed: true,
      m: 15,
      supplies: [expect.any(Number), 8],
      text: expect.stringContaining("Cade already has sound timber"),
      entry: ["service", "Reclaim the Unused Repair-Wagon Stores", expect.any(String)],
    });
    expect(accepted.context.service_offers).toBeUndefined();
    expect(accepted).not.toHaveProperty("observation");
  });
});
