/**
 * SS-F05 end-to-end proof. One same-origin Unaffiliated Courier carries Emery's
 * drover preparation through the generic overworld choice, trusted quest
 * import, a failed lure with successful failure-forward recovery, RPG
 * save/replay, the truthful Albany return, and its one-time Campus service.
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
const WOLF =
  WORLD.quests.find((quest) => quest.id === "wolf_winter") ??
  (() => {
    throw new Error("the Albany starting slice requires Wolf-Winter");
  })();
const WOLF_IMPORTS =
  WOLF.campaign_imports ??
  (() => {
    throw new Error("the Albany starting slice requires Wolf imports");
  })();
const REGISTRATION =
  WORLD.opening_registration ??
  (() => {
    throw new Error("the Albany starting slice requires registration");
  })();

const FULL = { compact_context: false, compact_result: false } as const;
const PROFILE = "albany:prep_drover_route";
const SERVICE_ID = "albany:wolf_drover_route_return_rest";
const CAMPUS_AREA = "albany_city__campus";
const ROUTE = [
  "go_north",
  "talk_houndsman",
  "ask_lure",
  "ask_commit_lure",
  "ask_leave",
  "go_west",
  "take_winter_feed_sack",
  "go_east",
  "go_north",
  "use_winter_feed_sack_on_downwind_feed_line",
  "use_drover_route_marks",
  "go_south",
  "go_west",
  "go_up",
  "use_winter_feed_sack_on_loft_hatch",
  "go_east",
  "go_north",
  "use_winter_feed_sack_on_outer_scent_gate",
  "go_north",
] as const;

type ToolApi = ReturnType<typeof createToolApi>;

function fullView(api: ToolApi, sessionId: string) {
  return api.get_overworld_session({
    session_id: sessionId,
    include_observation: true,
  }).observation;
}

function moveToVisibleArea(api: ToolApi, sessionId: string, destinationAreaId: string): void {
  const before = fullView(api, sessionId);
  if (before.currentArea?.id === destinationAreaId) return;
  const route = before.areaExits.find(
    (candidate) => candidate.destination.id === destinationAreaId,
  );
  if (!route) {
    throw new Error(
      `expected a visible route from ${before.currentArea?.id ?? "none"} to ${destinationAreaId}`,
    );
  }
  api.move_overworld_session_area({
    ...FULL,
    session_id: sessionId,
    area_route_id: route.id,
  });
}

function addRoadStrain(api: ToolApi, sessionId: string): void {
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
}

function launchPreparedWolf(api: ToolApi) {
  const started = api.start_overworld({ compact_context: false });
  const overworldSessionId = started.session_id;
  const civicPoi = started.observation.pois[0];
  const rowan = started.observation.characters.find(
    (character) => character.id === REGISTRATION.contact,
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
    choice: "albany:unaffiliated_courier",
  });
  const sourced = api.choose_overworld_session_story({
    ...FULL,
    session_id: overworldSessionId,
    choice: "albany:source_rowan_civic_docket",
  });
  expect(sourced.journey.storyChoice).toMatchObject({
    id: "albany:wolf_preparation",
    kind: "preparation",
  });
  expect(
    sourced.journey.storyChoice?.options.find((option) => option.id === PROFILE)?.consequence,
  ).toMatch(/actual cost: 5 minutes and \$0[^]*independent bond/i);

  const prepared = api.choose_overworld_session_story({
    ...FULL,
    session_id: overworldSessionId,
    choice: PROFILE,
  });
  expect(prepared.observation.character).toMatchObject({
    background: "albany:unaffiliated_courier",
    money: 18,
    knowledge: expect.arrayContaining(["albany:knowledge_wolf_drover_route"]),
  });
  expect(prepared.observation.quests.map((quest) => quest.id)).toContain(WOLF.id);
  const preparedSnapshot = api.export_overworld_session({
    session_id: overworldSessionId,
  }).snapshot;
  expect(UiOverworldSession.restore(WORLD, preparedSnapshot).view().character).toEqual(
    prepared.observation.character,
  );

  moveToVisibleArea(api, overworldSessionId, WOLF.area);
  const launched = api.start_overworld_session_quest({
    ...FULL,
    compact_observation: false,
    compact_actions: false,
    include_actions: true,
    session_id: overworldSessionId,
    quest_id: WOLF.id,
    seed: 5,
  });
  return { launched, overworldSessionId, preparedSnapshot };
}

describe("SS-F05 — preparation survives Wolf-Winter and the Albany return", () => {
  it("carries the drover profile through MCP/UI replay and consumes its truthful return service", () => {
    const api = createToolApi({ root: ROOT });
    const { launched, overworldSessionId, preparedSnapshot } = launchPreparedWolf(api);
    const rpgSessionId = launched.rpg_session_id;
    const initial = api.get_state({ session_id: rpgSessionId, include_state: true });
    expect(initial.state).toMatchObject({
      vars: { fieldcraft: 0, repair: 0, streetwise: 4, mediation: 0 },
      flags: { drover_route_prepared: true },
    });
    expect(initial.state.campaignImportReceipt?.applied_rules).toEqual([
      "import:wolf_winter_drover_route",
      "import:wolf_winter_drover_streetwise",
    ]);

    // The browser starts from the prepared persistent character, never the raw
    // registration profile. It and MCP therefore share one imported state hash.
    const ui = GameSession.startEmbedded(WOLF_SOURCE, preparedSnapshot.character, WOLF_IMPORTS, 5);
    expect(ui.view().stateHash).toBe(api.sessions.get(rpgSessionId).stateHash);

    let detachedSessionId: string | null = null;
    let finalStep: ReturnType<ToolApi["step_action"]> | null = null;
    for (const actionId of ROUTE) {
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

      if (actionId === "use_winter_feed_sack_on_downwind_feed_line") {
        expect(api.sessions.get(rpgSessionId).state).toMatchObject({
          vars: { cattle_alarm: 2 },
          flags: { lure_trail_fouled: true },
        });
        const save = api.save_game({
          session_id: rpgSessionId,
          include_source: true,
          include_content_hash: true,
        });
        const loaded = api.load_game({ save: save.save, compact_observation: false });
        detachedSessionId = loaded.session_id;
        expect(loaded.state_hash).toBe(primary.state_hash);
        expect(
          api.get_state({ session_id: detachedSessionId, include_state: true }).state
            .campaignImportReceipt,
        ).toEqual(initial.state.campaignImportReceipt);
      } else if (detachedSessionId) {
        const mirror = api.step_action({
          session_id: detachedSessionId,
          action_id: actionId,
          compact_observation: false,
          compact_events: false,
        });
        expect(mirror.ok, mirror.rejection_reason).toBe(true);
        expect(mirror.state_hash).toBe(primary.state_hash);
      }

      if (actionId === "use_drover_route_marks") {
        expect(api.sessions.get(rpgSessionId).state).toMatchObject({
          vars: { cattle_alarm: 1 },
          flags: { drover_route_attempted: true, yearling_redirected: true },
        });
        expect(primary.observation.description).toMatch(/yearling is alive[^]*high wood/i);
      }
    }

    if (!finalStep) throw new Error("the drover route must contain actions");
    expect(finalStep.questCompletion?.endingId).toBe("ending_pack_diverted");
    expect(api.sessions.get(rpgSessionId).state).toMatchObject({
      ended: true,
      endingId: "ending_pack_diverted",
      vars: { cattle_alarm: 3 },
      flags: {
        yearling_redirected: true,
        flank_redirected: true,
        leader_redirected: true,
      },
    });
    expect(ui.ending()?.id).toBe("ending_pack_diverted");
    expect(finalStep.journey.acceptedDecisions).toBeLessThanOrEqual(45);
    expect(
      api
        .get_transcript({
          session_id: rpgSessionId,
          summary_only: false,
          compact_events: false,
          compact_summary: false,
        })
        .turns.slice(1)
        .map((turn) => turn.action_id),
    ).toEqual(ROUTE);

    api.choose_overworld_session_journey({
      ...FULL,
      session_id: overworldSessionId,
      choice: "continue",
    });
    const returned = api.choose_overworld_session_story({
      ...FULL,
      session_id: overworldSessionId,
      choice: "send_wagon_to_cade",
    });
    expect(returned.observation.currentArea?.id).toBe("albany_city__transport_hub");
    const station = returned.observation;
    api.scout_overworld_session_poi({
      ...FULL,
      session_id: overworldSessionId,
      poi_id: station.pois[0]!.id,
    });
    api.talk_overworld_session_contact({
      ...FULL,
      session_id: overworldSessionId,
      character_id: station.characters[0]!.id,
    });
    api.investigate_overworld_session_event({
      ...FULL,
      session_id: overworldSessionId,
      event_id: station.events[0]!.id,
    });
    addRoadStrain(api, overworldSessionId);
    expect(fullView(api, overworldSessionId).fatigue).toBeGreaterThan(0);
    moveToVisibleArea(api, overworldSessionId, "albany_city__greenway");
    moveToVisibleArea(api, overworldSessionId, CAMPUS_AREA);

    const campus = fullView(api, overworldSessionId);
    expect(campus.serviceOffers).toEqual([
      {
        id: SERVICE_ID,
        action: "rest",
        title: "Take the Drover Recovery Cot",
        summary:
          "Because Emery allocated the drover route and your truthful return says Cade's byre held, the Campus stockyard clinic opens one reserved warmed cot and recovery watch.",
        minutes: 15,
        providerId: "albany_city__campus__contact",
        providerName: expect.any(String),
      },
    ]);
    expect(
      api.get_overworld_session_context({
        session_id: overworldSessionId,
        compact_context: true,
      }).context.service_offers,
    ).toEqual([
      [
        SERVICE_ID,
        "rest",
        "Take the Drover Recovery Cot",
        expect.stringContaining("Emery allocated the drover route"),
        15,
      ],
    ]);
    const offeredSnapshot = api.export_overworld_session({
      session_id: overworldSessionId,
    }).snapshot;
    expect(UiOverworldSession.restore(WORLD, offeredSnapshot).view().serviceOffers).toEqual(
      campus.serviceOffers,
    );

    const claimed = api.rest_overworld_session({
      ...FULL,
      session_id: overworldSessionId,
    });
    expect(claimed.result).toMatchObject({
      action: "rest",
      changed: true,
      minutes: 15,
      fatigueBefore: campus.fatigue,
      fatigueAfter: 0,
      message: expect.stringContaining("Emery allocated the drover route"),
    });
    expect(claimed.observation.serviceOffers).toEqual([]);
    expect(claimed.journey.acceptedDecisions).toBeLessThanOrEqual(45);

    const consumed = api.export_overworld_session({
      session_id: overworldSessionId,
    }).snapshot;
    expect(consumed.journalEntries).toContainEqual(
      expect.objectContaining({
        kind: "service",
        serviceRuleId: SERVICE_ID,
        serviceAreaId: CAMPUS_AREA,
      }),
    );
    expect(OverworldSession.restore(WORLD, consumed).view().serviceOffers).toEqual([]);
    expect(
      api.restore_overworld_session({
        snapshot: consumed,
        compact_context: false,
        compact_result: false,
      }).observation.serviceOffers,
    ).toEqual([]);
  });
});
