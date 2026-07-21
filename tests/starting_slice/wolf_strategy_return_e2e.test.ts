/**
 * SS-F09 end-to-end paired proof. The same Albany character, lead, seed, and
 * dawn dispatch choose either a bloodless pressure route or the established
 * combat route. The fork must survive RPG save/replay, the quest boundary,
 * Albany campaign exports, named-NPC reactivity, service consumption, and all
 * MCP/core/browser projections.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { createToolApi } from "../../src/mcp/tools.js";
import { OverworldSession } from "../../src/world/session.js";
import { loadOverworldManifest } from "../../src/world/source.js";
import { GameSession } from "../../ui/src/engine.js";
import { OverworldSession as UiOverworldSession } from "../../ui/src/overworld.js";

const ROOT = process.cwd();
const WORLD = loadOverworldManifest(ROOT);
const WOLF_SOURCE = readFileSync("content/rpg/quests/wolf_winter.yaml", "utf8");
const WOLF_QUEST =
  WORLD.quests.find((quest) => quest.id === "wolf_winter") ??
  (() => {
    throw new Error("the Albany starting slice requires Wolf-Winter");
  })();
const WOLF_IMPORTS =
  WOLF_QUEST.campaign_imports ??
  (() => {
    throw new Error("the Albany starting slice requires Wolf imports");
  })();
const ROAD_WARDEN =
  WORLD.opening_registration?.profiles.find((profile) => profile.id === "albany:road_warden") ??
  (() => {
    throw new Error("the Albany starting slice requires the Road Warden");
  })();

const FULL = { compact_context: false, compact_result: false } as const;
const GREENWAY_AREA_ID = "albany_city__greenway";
const GREENWAY_CONTACT_ID = "albany_city__greenway__contact";
const LIVE_PACK_RULE_ID = "albany:wolf_live_pack_greenway_resupply";
const NEUTRAL_RELIEF_ALLOCATION = "albany:relief_resident_shelter";
const LIVE_PACK_SUMMARY =
  "Because you returned a living corridor pack to the high wood while keeping Cade's herd whole, Emery Sloane releases a one-time Greenway cache of food, lamp oil, and wildlife flares for your next road.";

const CLEAN_ROUTE = [
  "use_sheltered_stockway_last_mile",
  "talk_houndsman",
  "ask_lure",
  "ask_commit_lure",
  "ask_leave",
  "go_west",
  "take_winter_feed_sack",
  "go_east",
  "go_north",
  "use_winter_feed_sack_on_downwind_feed_line",
  "go_south",
  "go_west",
  "go_up",
  "use_winter_feed_sack_on_loft_hatch",
  "go_east",
  "go_north",
  "use_winter_feed_sack_on_outer_scent_gate",
  "go_north",
] as const;

const COMBAT_ROUTE = [
  "use_sheltered_stockway_last_mile",
  "talk_houndsman",
  "ask_wolves",
  "ask_byre",
  "ask_leave",
  "read_day_book",
  "go_west",
  "take_byre_jerkin",
  "use_byre_jerkin",
  "go_east",
  "go_north",
  "maneuver_yearling_wolf_set_spear",
  "maneuver_yearling_wolf_drive_set_spear",
  "go_north",
  "maneuver_flank_wolf_offside_cut",
  "go_north",
  "maneuver_grey_leader_wait_out_feint",
  "maneuver_grey_leader_take_true_rush",
  "go_north",
] as const;

type ToolApi = ReturnType<typeof createToolApi>;
type Strategy = "clean" | "combat";

function fullView(api: ToolApi, sessionId: string) {
  return api.get_overworld_session({
    session_id: sessionId,
    include_observation: true,
  }).observation;
}

function moveToArea(api: ToolApi, sessionId: string, areaId: string): void {
  const before = fullView(api, sessionId);
  if (before.currentArea?.id === areaId) return;
  const route = before.areaExits.find((candidate) => candidate.destination.id === areaId);
  if (!route) {
    const view = fullView(api, sessionId);
    throw new Error(
      `expected a visible Albany route from ${view.currentArea?.id ?? "none"} to ${areaId}; visible: ${view.areaExits
        .map((candidate) => candidate.destination.id)
        .join(", ")}`,
    );
  }
  api.move_overworld_session_area({
    ...FULL,
    session_id: sessionId,
    area_route_id: route.id,
  });
}

function launchAlbanyWolf(api: ToolApi) {
  const started = api.start_overworld({ compact_context: false });
  const overworldSessionId = started.session_id;
  const civicPoi = started.observation.pois[0];
  const rowan = started.observation.characters.find(
    (character) => character.id === WORLD.opening_registration?.contact,
  );
  if (!civicPoi || !rowan) throw new Error("expected Albany's civic opening");

  api.scout_overworld_session_poi({
    ...FULL,
    session_id: overworldSessionId,
    poi_id: civicPoi.id,
  });
  api.talk_overworld_session_contact({
    ...FULL,
    session_id: overworldSessionId,
    character_id: rowan.id,
  });
  api.choose_overworld_session_story({
    ...FULL,
    session_id: overworldSessionId,
    choice: ROAD_WARDEN.id,
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
  const preparationArea = WORLD.opening_preparation?.area;
  if (!preparationArea) throw new Error("the Albany starting slice requires opening preparation");
  const preparationRoute = sourced.observation.areaExits.find(
    (candidate) => candidate.destination.id === preparationArea,
  );
  if (!preparationRoute) throw new Error("expected a route to the opening preparation board");
  const atPreparation = api.move_overworld_session_area({
    ...FULL,
    session_id: overworldSessionId,
    area_route_id: preparationRoute.id,
  });
  expect(atPreparation.observation.departureInteractions[0]?.kind).toBe("preparation");
  expect(atPreparation.observation.quests.map((candidate) => candidate.id)).toContain(
    WOLF_QUEST.id,
  );
  const prepared = api.choose_overworld_session_story({
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
  const quest = prepared.observation.quests.find((candidate) => candidate.id === WOLF_QUEST.id);
  if (!quest) throw new Error("Albany preparation must reveal Wolf-Winter");

  moveToArea(api, overworldSessionId, "albany_city__market");
  let market = fullView(api, overworldSessionId);
  const marketPoi = market.pois[0];
  if (!marketPoi) throw new Error("expected the Market lead source");
  api.scout_overworld_session_poi({
    ...FULL,
    session_id: overworldSessionId,
    poi_id: marketPoi.id,
  });
  api.talk_overworld_session_contact({
    ...FULL,
    session_id: overworldSessionId,
    character_id: "albany_city__market__contact",
  });
  market = fullView(api, overworldSessionId);
  const site = market.sites.find((candidate) => candidate.area === "albany_city__market");
  if (!site) throw new Error("expected Jamie's discovered Market site");
  const explored = api.explore_overworld_session_site({
    ...FULL,
    session_id: overworldSessionId,
    site_id: site.id,
  });
  expect(explored.observation.discoveredAreaIds).toHaveLength(6);

  moveToArea(api, overworldSessionId, quest.area);
  const launched = api.start_overworld_session_quest({
    ...FULL,
    compact_observation: false,
    compact_actions: false,
    include_actions: true,
    session_id: overworldSessionId,
    quest_id: quest.id,
    approach_id: "albany:wolf_approach_sheltered_stockway",
    seed: 901,
  });
  return { launched, overworldSessionId };
}

function playStrategy(strategy: Strategy) {
  const api = createToolApi({ root: ROOT });
  const { launched, overworldSessionId } = launchAlbanyWolf(api);
  const rpgSessionId = launched.rpg_session_id;
  const route = strategy === "clean" ? CLEAN_ROUTE : COMBAT_ROUTE;
  const initial = api.get_state({ session_id: rpgSessionId, include_state: true });

  expect(initial.state.vars).toMatchObject({
    hp: 30,
    attack: 5,
    defense: 4,
    fieldcraft: 4,
    cattle_alarm: 0,
  });
  expect(initial.state.campaignImportReceipt?.applied_rules).toEqual([
    "import:wolf_winter_approach_sheltered_stockway",
    "import:wolf_winter_fieldcraft",
    "import:wolf_winter_full_compact_duty",
    "import:wolf_winter_lure_fieldcraft",
    "import:wolf_winter_relief_resident_shelter",
    "import:wolf_winter_works_fortification",
  ]);

  const character = api.export_overworld_session({
    session_id: overworldSessionId,
  }).snapshot.character;
  const ui = GameSession.startEmbedded(WOLF_SOURCE, character, WOLF_IMPORTS, 901);
  expect(ui.view().stateHash).toBe(api.sessions.get(rpgSessionId).stateHash);

  let detachedSessionId: string | null = null;
  let finalStep: ReturnType<ToolApi["step_action"]> | null = null;
  for (const actionId of route) {
    const primary = api.step_action({
      session_id: rpgSessionId,
      action_id: actionId,
      compact_observation: false,
      compact_events: false,
    });
    expect(primary.ok, primary.rejection_reason).toBe(true);
    const uiStep = ui.choose(actionId);
    expect(uiStep.ok, uiStep.rejection ?? undefined).toBe(true);
    expect(ui.view().stateHash).toBe(api.sessions.get(rpgSessionId).stateHash);
    finalStep = primary;

    if (strategy === "clean" && actionId === "take_winter_feed_sack") {
      const saved = api.save_game({
        session_id: rpgSessionId,
        include_source: true,
        include_content_hash: true,
      });
      const loaded = api.load_game({
        save: saved.save,
        compact_observation: false,
      });
      detachedSessionId = loaded.session_id;
      expect(loaded.state_hash).toBe(primary.state_hash);
      expect(
        api.get_state({ session_id: detachedSessionId, include_state: true }).state
          .campaignImportReceipt,
      ).toEqual(
        api.get_state({ session_id: rpgSessionId, include_state: true }).state
          .campaignImportReceipt,
      );
    } else if (detachedSessionId) {
      if (actionId === "use_winter_feed_sack_on_loft_hatch") {
        const mirror = api.step_action({
          session_id: detachedSessionId,
          action_id: actionId,
          compact_observation: true,
          compact_events: true,
        });
        expect(mirror.ok).toBe(true);
        expect(mirror.state_hash).toBe(primary.state_hash);
        expect(mirror.context.pressure?.[0]).toEqual([
          "cattle_alarm",
          "Cattle alarm",
          2,
          2,
          "Restless",
          4,
          "Breaking",
        ]);
        expect(primary.observation.pressure_tracks?.[0]).toMatchObject({
          value: 2,
          band: { min: 2, label: "Restless" },
          next: { min: 4, label: "Breaking" },
        });
        expect(ui.view().facts).toContain(
          "pressure: Cattle alarm — Restless (2; next Breaking at 4) — The herd is strained but remains below the loss threshold.",
        );
      } else {
        const mirror = api.step_action({
          session_id: detachedSessionId,
          action_id: actionId,
          compact_observation: false,
          compact_events: false,
        });
        expect(mirror.ok).toBe(true);
        expect(mirror.state_hash).toBe(primary.state_hash);
        expect(mirror.questCompletion).toBeUndefined();
      }
    }
  }

  if (!finalStep) throw new Error("strategy route must contain actions");
  const expectedEnding = strategy === "clean" ? "ending_pack_diverted" : "ending_held";
  expect(finalStep.questCompletion?.endingId).toBe(expectedEnding);
  expect(ui.ending()?.id).toBe(expectedEnding);
  expect(finalStep.journey.pendingChoice?.message).toMatch(
    strategy === "clean"
      ? /cattle are whole and all three wolves remain alive/i
      : /guard wood was spent in the fighting/i,
  );
  expect(finalStep.journey.acceptedDecisions).toBeLessThanOrEqual(45);

  if (detachedSessionId) {
    expect(api.get_state({ session_id: detachedSessionId }).state_hash).toBe(finalStep.state_hash);
  }
  const transcript = api.get_transcript({
    session_id: rpgSessionId,
    summary_only: false,
    compact_events: false,
    compact_summary: false,
  });
  expect(transcript.turns.slice(1).map((turn) => turn.action_id)).toEqual(route);
  expect(transcript.summary.ending_id).toBe(expectedEnding);

  const continued = api.choose_overworld_session_journey({
    ...FULL,
    session_id: overworldSessionId,
    choice: "continue",
  });
  expect(continued.journey.storyChoice?.id).toBe("albany_dawn_dispatch");
  const returned = api.choose_overworld_session_story({
    ...FULL,
    session_id: overworldSessionId,
    choice: "send_wagon_to_cade",
  });
  expect(returned.journey.acceptedDecisions).toBeLessThanOrEqual(45);
  expect(returned.observation.currentArea?.id).toBe("albany_city__transport_hub");
  moveToArea(api, overworldSessionId, GREENWAY_AREA_ID);

  return {
    api,
    overworldSessionId,
    rpgSessionId,
    route,
    state: api.get_state({ session_id: rpgSessionId, include_state: true }).state,
  };
}

function addRoadStrainAndReturnToGreenway(api: ToolApi, sessionId: string): void {
  let view = fullView(api, sessionId);
  const outbound = view.exits.find((road) => road.destination.id === "colonie_town");
  if (!outbound) throw new Error("expected Albany's Colonie road");
  api.travel_overworld_session({ ...FULL, session_id: sessionId, road_id: outbound.id });
  view = fullView(api, sessionId);
  if (view.pendingRoadEncounter) {
    api.resolve_overworld_session_road_encounter({
      ...FULL,
      session_id: sessionId,
      strategy: "press_on",
    });
  }
  view = fullView(api, sessionId);
  const inbound = view.exits.find((road) => road.destination.id === "albany_city");
  if (!inbound) throw new Error("expected Colonie's Albany road");
  api.travel_overworld_session({ ...FULL, session_id: sessionId, road_id: inbound.id });
  view = fullView(api, sessionId);
  if (view.pendingRoadEncounter) {
    api.resolve_overworld_session_road_encounter({
      ...FULL,
      session_id: sessionId,
      strategy: "press_on",
    });
  }
  moveToArea(api, sessionId, GREENWAY_AREA_ID);
}

describe("SS-F09 — Wolf strategy survives the full Albany return", () => {
  it("makes the living-pack strategy alter Emery and a later service under the same origin", () => {
    const clean = playStrategy("clean");
    const combat = playStrategy("combat");
    const cleanView = fullView(clean.api, clean.overworldSessionId);
    const combatView = fullView(combat.api, combat.overworldSessionId);

    expect(clean.route.slice(0, 2)).toEqual(combat.route.slice(0, 2));
    expect(clean.state).toMatchObject({
      ended: true,
      endingId: "ending_pack_diverted",
      vars: { hp: 30, score: 45, cattle_alarm: 3 },
      flags: {
        yearling_redirected: true,
        flank_redirected: true,
        leader_redirected: true,
      },
    });
    expect(clean.route.some((id) => id.startsWith("attack_") || id.startsWith("maneuver_"))).toBe(
      false,
    );
    expect(combat.state).toMatchObject({
      ended: true,
      endingId: "ending_held",
      vars: { hp: 28, score: 60 },
      flags: { yearling_down: true, flank_wolf_down: true, leader_down: true },
    });

    expect(cleanView.serviceOffers).toEqual([
      {
        id: LIVE_PACK_RULE_ID,
        action: "resupply",
        title: "Claim Emery's Nonlethal Response Cache",
        summary: LIVE_PACK_SUMMARY,
        minutes: 15,
        providerId: GREENWAY_CONTACT_ID,
        providerName: "Emery Sloane",
      },
    ]);
    expect(combatView.serviceOffers).toEqual([]);
    expect(
      cleanView.characters.find((character) => character.id === GREENWAY_CONTACT_ID)?.summary,
    ).toMatch(/whole-herd tally[^]*unbloodied relief report[^]*living pack/i);
    expect(
      combatView.characters.find((character) => character.id === GREENWAY_CONTACT_ID)?.summary,
    ).not.toMatch(/whole-herd tally[^]*living pack/i);
    expect(
      clean.api.get_overworld_session_context({
        session_id: clean.overworldSessionId,
        compact_context: true,
      }).context.service_offers,
    ).toEqual([
      [
        LIVE_PACK_RULE_ID,
        "resupply",
        "Claim Emery's Nonlethal Response Cache",
        LIVE_PACK_SUMMARY,
        15,
      ],
    ]);
    expect(
      combat.api.get_overworld_session_context({
        session_id: combat.overworldSessionId,
        compact_context: true,
      }).context.service_offers,
    ).toBeUndefined();

    const cleanSnapshot = clean.api.export_overworld_session({
      session_id: clean.overworldSessionId,
    }).snapshot;
    const restored = OverworldSession.restore(WORLD, cleanSnapshot);
    expect(cleanSnapshot.questOutcomes).toContainEqual(["wolf_winter", "ending_pack_diverted"]);
    expect(restored.campaignWorldFactIds()).toEqual([
      "fact:wolf_winter_byre_held",
      "fact:wolf_winter_cattle_whole",
      "fact:wolf_winter_outer_paling_broken",
      "fact:wolf_winter_pack_diverted_alive",
      "fact:wolf_winter_winter_feed_spent",
    ]);
    expect(cleanSnapshot.character.relationships).toContainEqual({
      npcId: "npc:old_cade",
      trust: 12,
      regard: 12,
      owesPlayer: 1,
      playerOwes: 0,
      memories: ["memory:wolf_winter_pack_diverted_alive"],
    });
    expect(cleanSnapshot.character.relationships).toContainEqual({
      npcId: "albany:emery_sloane",
      trust: 6,
      regard: 8,
      owesPlayer: 1,
      playerOwes: 0,
      memories: ["albany:memory_emery_wolf_pack_diverted_alive"],
    });
    expect(restored.view().serviceOffers).toEqual(cleanView.serviceOffers);
    expect(UiOverworldSession.restore(WORLD, cleanSnapshot).view().serviceOffers).toEqual(
      cleanView.serviceOffers,
    );
    const mcpRestored = clean.api.restore_overworld_session({
      ...FULL,
      snapshot: cleanSnapshot,
    });
    expect(mcpRestored.observation.serviceOffers).toEqual(cleanView.serviceOffers);

    addRoadStrainAndReturnToGreenway(clean.api, mcpRestored.session_id);
    const beforeClaim = fullView(clean.api, mcpRestored.session_id);
    expect(beforeClaim.supplies).toBeLessThan(beforeClaim.maxSupplies);
    const claimed = clean.api.resupply_overworld_session({
      ...FULL,
      session_id: mcpRestored.session_id,
    });
    expect(claimed.result).toMatchObject({
      action: "resupply",
      changed: true,
      minutes: 15,
      suppliesBefore: beforeClaim.supplies,
      suppliesAfter: beforeClaim.maxSupplies,
      message: expect.stringContaining("living corridor pack"),
    });
    expect(claimed.observation.serviceOffers).toEqual([]);

    const consumed = clean.api.export_overworld_session({
      session_id: mcpRestored.session_id,
    }).snapshot;
    expect(consumed.journalEntries).toContainEqual(
      expect.objectContaining({
        kind: "service",
        serviceRuleId: LIVE_PACK_RULE_ID,
        serviceAreaId: GREENWAY_AREA_ID,
        serviceBoundary: expect.objectContaining({ areaId: GREENWAY_AREA_ID }),
      }),
    );
    expect(OverworldSession.restore(WORLD, consumed).view().serviceOffers).toEqual([]);
    expect(UiOverworldSession.restore(WORLD, consumed).view().serviceOffers).toEqual([]);
    expect(
      clean.api.restore_overworld_session({ ...FULL, snapshot: consumed }).observation
        .serviceOffers,
    ).toEqual([]);
  });
});
