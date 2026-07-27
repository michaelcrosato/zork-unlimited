/**
 * The route card must combine the already-selected Albany relief oath and
 * allocation with each Wolf-Winter hill road before the player commits to
 * quest start. Full, compact, browser, and CLI surfaces use the dedicated
 * exact field rather than a truncation of preview.
 */
import { createRequire } from "node:module";
import { resolve } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer, type ViteDevServer } from "vite";

import { renderQuestLaunch } from "../../bin/overworld_play.js";
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
import { deriveQuestDispatchPresentationWindow } from "../../src/world/quest_dispatch_window.js";
import { loadOverworldManifest } from "../../src/world/source.js";
import type { OverworldQuestView } from "../../src/world/session_local_discovery.js";
import { OverworldSession } from "../../src/world/session.js";
import {
  WOLF_HILL_ROUTE_TRADEOFF_SUMMARY_CHAR_LIMIT,
  wolfHillRoutePresentation,
} from "../../src/world/wolf_hill_route_presentation.js";

const ROOT = process.cwd();
const WORLD = loadOverworldManifest(ROOT);
const WOLF_ID = "wolf_winter";
const RIDGE_ID = "albany:wolf_approach_exposed_ridge";
const STOCKWAY_ID = "albany:wolf_approach_sheltered_stockway";
const WOLF_QUEST =
  WORLD.quests.find((quest) => quest.id === WOLF_ID) ??
  (() => {
    throw new Error("The Albany starting slice requires Wolf-Winter.");
  })();
const WOLF_IMPORTS =
  WOLF_QUEST.campaign_imports ??
  (() => {
    throw new Error("Wolf-Winter requires campaign imports.");
  })();
const WOLF_SOURCE = loadRpgSourceFile("content/rpg/quests/wolf_winter.yaml");
if (!WOLF_SOURCE.ok) throw new Error("Wolf-Winter must compile.");
const WOLF_INDEX = indexRpgPack(WOLF_SOURCE.compiled.pack);
const STALE_ABSOLUTE_RIDGE_RESULT =
  "A clean three-cast lure line therefore reaches alarm 4 (Breaking) and scatters cattle.";
const STALE_ABSOLUTE_STOCKWAY_RESULT =
  "A clean three-cast lure line reaches alarm 3 (Restless), keeps the whole herd, and remains below Breaking.";
const RIDGE_ENTRY_TIMING = "Hill lip 0; final descent 1";

const ROUTE_CARD_CASES = [
  {
    label: "under full duty without Cade fodder",
    oathId: "albany:oath_full_compact_duty",
    reliefId: "albany:relief_resident_shelter",
    expected: {
      ridge: {
        alarm: 4,
        summary:
          "Hill lip 0; final descent 1; first lure DC 10; a clean lure reaches alarm 4 and scatters two cattle.",
        preview: STALE_ABSOLUTE_RIDGE_RESULT,
      },
      stockway: {
        alarm: 3,
        summary:
          "Arrival alarm 0; first lure cast DC 12; a clean lure reaches alarm 3 and keeps the whole herd.",
        preview: STALE_ABSOLUTE_STOCKWAY_RESULT,
      },
    },
  },
  {
    label: "under full duty with Cade fodder",
    oathId: "albany:oath_full_compact_duty",
    reliefId: "albany:relief_cade_fodder",
    expected: {
      ridge: {
        alarm: 3,
        summary:
          "Hill lip 0; final descent 1; first lure DC 10; Cade fodder suppresses the clean first-cast alarm, so a clean lure reaches alarm 3 and keeps the herd.",
        preview:
          "Cade fodder suppresses the clean first-cast alarm; a clean lure reaches alarm 3 and keeps the whole herd.",
      },
      stockway: {
        alarm: 3,
        summary:
          "Arrival alarm 0; first lure cast DC 12; Cade fodder does not alter the sheltered route; a clean lure reaches alarm 3 and keeps the whole herd.",
        preview:
          "Cade fodder does not alter this route; a clean lure reaches alarm 3 and keeps the whole herd.",
      },
    },
  },
  {
    label: "under aid-only without Cade fodder",
    oathId: "albany:oath_limited_aid_only",
    reliefId: "albany:relief_resident_shelter",
    expected: {
      ridge: {
        alarm: 3,
        summary:
          "Hill lip 0; final descent 1; first lure DC 10; aid-only suppresses the final clean-cast alarm, so a clean lure reaches alarm 3 and keeps the herd.",
        preview:
          "Aid-only suppresses the final ordinary clean-cast alarm; a clean lure reaches alarm 3 and keeps the whole herd.",
      },
      stockway: {
        alarm: 2,
        summary:
          "Arrival alarm 0; first lure cast DC 12; aid-only suppresses the final clean-cast alarm, so a clean lure reaches alarm 2 and keeps the whole herd.",
        preview:
          "Aid-only suppresses the final ordinary clean-cast alarm; a clean lure reaches alarm 2 and keeps the whole herd.",
      },
    },
  },
  {
    label: "under aid-only with Cade fodder",
    oathId: "albany:oath_limited_aid_only",
    reliefId: "albany:relief_cade_fodder",
    expected: {
      ridge: {
        alarm: 2,
        summary:
          "Hill lip 0; final descent 1; first lure DC 10; Cade fodder and aid-only suppress the first and final clean-cast alarms: alarm 2, whole herd.",
        preview:
          "Cade fodder suppresses the first clean-cast alarm and aid-only suppresses the final one; a clean lure reaches alarm 2 and keeps the whole herd.",
      },
      stockway: {
        alarm: 2,
        summary:
          "Arrival alarm 0; first lure cast DC 12; Cade fodder does not alter this route; aid-only makes the clean-lure result alarm 2, whole herd.",
        preview:
          "Cade fodder does not alter this route, while aid-only suppresses the final ordinary clean-cast alarm; a clean lure reaches alarm 2 and keeps the whole herd.",
      },
    },
  },
] as const;

function areaPath(from: string, to: string): string[] {
  const queue: Array<{ area: string; routeIds: string[] }> = [{ area: from, routeIds: [] }];
  const seen = new Set([from]);
  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index]!;
    if (current.area === to) return current.routeIds;
    for (const edge of WORLD.area_edges.filter(
      (candidate) => candidate.from_area === current.area || candidate.to_area === current.area,
    )) {
      const next = edge.from_area === current.area ? edge.to_area : edge.from_area;
      if (seen.has(next)) continue;
      seen.add(next);
      queue.push({ area: next, routeIds: [...current.routeIds, edge.id] });
    }
  }
  throw new Error(`No Albany area path from ${from} to ${to}.`);
}

function moveToArea(session: OverworldSession, areaId: string): void {
  const currentAreaId = session.view().currentArea?.id;
  if (!currentAreaId || currentAreaId === areaId) return;
  for (const routeId of areaPath(currentAreaId, areaId)) {
    let view = session.view();
    let route = view.areaExits.find((candidate) => candidate.id === routeId);
    if (!route || !view.discoveredAreaIds.includes(route.destination.id)) {
      session.exploreArea(view.currentArea!.id);
      view = session.view();
      route = view.areaExits.find((candidate) => candidate.id === routeId);
    }
    if (!route || !view.discoveredAreaIds.includes(route.destination.id)) {
      throw new Error(`Expected a visible mapped route to ${areaId}.`);
    }
    session.moveArea(route.id);
  }
}

function routeCard(
  oathChoiceId: string,
  reliefChoiceId: string,
  choices: Readonly<{
    registrationId?: string;
    sourceId?: string;
    preparationId?: string;
    allyId?: string;
  }> = {},
): {
  session: OverworldSession;
  quest: OverworldQuestView;
} {
  const session = new OverworldSession(WORLD);
  const opening = session.view();
  session.scoutPoi(opening.pois[0]!.id);
  session.talkToCharacter(WORLD.opening_registration!.contact);
  session.chooseJourneyStory(choices.registrationId ?? "albany:ledger_advocate");
  session.chooseJourneyStory(oathChoiceId);
  session.chooseJourneyStory(choices.sourceId ?? "albany:source_rowan_civic_docket");
  moveToArea(session, WORLD.opening_preparation!.area);
  session.chooseJourneyStory(choices.preparationId ?? "albany:prep_works_fortification");
  session.chooseJourneyStory(reliefChoiceId);
  if (choices.allyId) {
    session.talkToCharacter(WORLD.opening_ally!.contact);
    session.chooseJourneyStory(choices.allyId);
  }

  const quest = session.view().quests.find((candidate) => candidate.id === WOLF_ID);
  if (!quest?.launch) throw new Error("Expected the pre-commitment Wolf-Winter route card.");
  return { session, quest };
}

function dispatchBriefing(session: OverworldSession): string {
  const ridge = session.prepareQuestStart(WOLF_ID, RIDGE_ID).dispatchWindow;
  const stockway = session.prepareQuestStart(WOLF_ID, STOCKWAY_ID).dispatchWindow;
  expect(stockway).toEqual(ridge);
  if (ridge.status === "delayed" && ridge.ledgerMinutes !== undefined) {
    return (
      `Dispatch ${String(ridge.ledgerMinutes)}m—delayed; roads change arrival, not delay. ` +
      "First failure: lure/drive/hunt alarm +1; fortify +1."
    );
  }
  if (ridge.status === "on_time" && ridge.ledgerMinutes !== undefined) {
    return (
      `Dispatch ${String(ridge.ledgerMinutes)}m—on time; roads change arrival, not dispatch. ` +
      "No opening-delay failure pressure."
    );
  }
  return (
    "Dispatch unverified—neutral; roads change arrival, not dispatch. " +
    "No opening-delay failure pressure."
  );
}

function expectedFirstCastFailureForecast(alarm: number, delayed: boolean): string {
  return (
    `Fouled first cast: cattle alarm ${String(alarm)}` +
    `${delayed ? " (includes delayed +1)" : ""}; ` +
    "feed spent, no retry; recovery remains."
  );
}

function fullSummaries(quest: OverworldQuestView): Record<string, string | undefined> {
  return Object.fromEntries(
    quest.launch?.options.map((option) => [option.id, option.tradeoffSummary]) ?? [],
  );
}

function compactSummaries(session: OverworldSession): Record<string, string | null> {
  const compactQuest = (session.compactView().quests ?? []).find(
    ([questId]) => questId === WOLF_ID,
  );
  const launch = compactQuest?.[3];
  if (!launch) throw new Error("Expected the compact Wolf-Winter route card.");
  return Object.fromEntries(launch[2].map((option) => [option[0], option[13]]));
}

function compactPreview(session: OverworldSession, optionId: string): string {
  const compactQuest = (session.compactView().quests ?? []).find(
    ([questId]) => questId === WOLF_ID,
  );
  const option = compactQuest?.[3]?.[2].find(([id]) => id === optionId);
  if (!option) throw new Error(`Expected compact route option ${optionId}.`);
  return option[11];
}

const CLEAN_LURE_TAIL = [
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

function fixedRng(face: "best" | "worst"): Rng {
  return {
    next: () => (face === "best" ? 0.999999 : 0),
    int: (min, max) => (face === "best" ? max : min),
  };
}

function actRpg(state: GameState, actionId: string, face: "best" | "worst" = "best"): GameState {
  const actions = enumerateRpgActions(WOLF_INDEX, state);
  const option = actions.find((candidate) => candidate.id === actionId);
  expect(
    option,
    `${actionId} must be legal in ${state.current}; legal: ${actions
      .map((candidate) => candidate.id)
      .join(", ")}`,
  ).toBeDefined();
  if (!option) throw new Error(`Missing action ${actionId}.`);
  const result = makeStep(buildRpgRules(WOLF_INDEX, () => fixedRng(face)))(state, option.action);
  expect(result.ok, result.rejectionReason).toBe(true);
  return result.state;
}

function playForecastedFailedFirstCast(
  parent: OverworldSession,
  approachId: typeof RIDGE_ID | typeof STOCKWAY_ID,
): { alarm: number; recoveryAction: string | null } {
  const plan = parent.prepareQuestStart(WOLF_ID, approachId);
  let state = initStateForRpgPack(WOLF_INDEX, 72748, {
    character: plan.characterAfter,
    imports: WOLF_IMPORTS,
  });
  if (plan.dispatchWindow.status === "delayed") {
    state.flags.dispatch_opening_delayed = true;
  }
  const lastMile =
    approachId === RIDGE_ID ? "use_exposed_ridge_last_mile" : "use_sheltered_stockway_last_mile";
  for (const actionId of [
    lastMile,
    "talk_houndsman",
    "ask_lure",
    "ask_commit_lure",
    "ask_leave",
    "go_west",
    "take_winter_feed_sack",
    "go_east",
    "go_north",
  ]) {
    state = actRpg(state, actionId);
  }
  state = actRpg(state, "use_winter_feed_sack_on_downwind_feed_line", "worst");
  const recovery = enumerateRpgActions(WOLF_INDEX, state).find((option) =>
    ["set_paling_rail", "wedge_paling_rail"].includes(option.id),
  );
  return {
    alarm: state.vars.cattle_alarm ?? -1,
    recoveryAction: recovery?.id ?? null,
  };
}

function playForecastedCleanLure(
  parent: OverworldSession,
  approachId: typeof RIDGE_ID | typeof STOCKWAY_ID,
): { alarm: number; endingId: string | null } {
  const api = createToolApi({ root: ROOT });
  const restored = api.restore_overworld_session({
    compact_context: false,
    compact_result: false,
    snapshot: parent.snapshot(),
  });
  const launched = api.start_overworld_session_quest({
    compact_context: false,
    compact_result: false,
    compact_observation: false,
    compact_actions: false,
    include_actions: true,
    session_id: restored.session_id,
    quest_id: WOLF_ID,
    approach_id: approachId,
    seed: 26,
  });
  const lastMile =
    approachId === RIDGE_ID ? "use_exposed_ridge_last_mile" : "use_sheltered_stockway_last_mile";
  for (const actionId of [lastMile, ...CLEAN_LURE_TAIL]) {
    const step = api.step_action({
      session_id: launched.rpg_session_id,
      action_id: actionId,
      compact_observation: false,
      compact_events: false,
    });
    expect(step.ok, step.rejection_reason).toBe(true);
  }
  const state = api.get_state({
    session_id: launched.rpg_session_id,
    include_state: true,
  }).state;
  return {
    alarm: state.vars.cattle_alarm ?? -1,
    endingId: state.endingId,
  };
}

describe("Wolf-Winter conditional route tradeoff projection", () => {
  let server: ViteDevServer;
  let renderQuestNotice: (quest: OverworldQuestView) => string;

  beforeAll(async () => {
    const uiRoot = resolve(ROOT, "ui");
    server = await createServer({
      root: uiRoot,
      configFile: resolve(uiRoot, "vite.config.ts"),
      appType: "custom",
      logLevel: "silent",
      optimizeDeps: { noDiscovery: true },
      server: { middlewareMode: true },
    });
    const module = (await server.ssrLoadModule("/src/App.tsx")) as { QuestNotice: unknown };
    const requireFromUi = createRequire(resolve(uiRoot, "package.json"));
    const react = requireFromUi("react") as {
      createElement: (type: unknown, props: Record<string, unknown>) => unknown;
    };
    const reactDomServer = requireFromUi("react-dom/server") as {
      renderToStaticMarkup: (element: unknown) => string;
    };
    renderQuestNotice = (quest) =>
      reactDomServer.renderToStaticMarkup(
        react.createElement(module.QuestNotice, {
          quest,
          areaName: "Station Quarter",
          isCurrentArea: true,
          onStart: () => undefined,
        }),
      );
  }, 30_000);

  afterAll(async () => {
    await server.close();
  });

  it.each(ROUTE_CARD_CASES)(
    "keeps decisive full, compact, UI, and CLI terms exact $label",
    ({ oathId, reliefId, expected }) => {
      const { session, quest } = routeCard(oathId, reliefId);
      const briefing = dispatchBriefing(session);
      const ridgeFailure = playForecastedFailedFirstCast(session, RIDGE_ID);
      const stockwayFailure = playForecastedFailedFirstCast(session, STOCKWAY_ID);
      expect(ridgeFailure).toEqual({ alarm: 3, recoveryAction: "set_paling_rail" });
      expect(stockwayFailure).toEqual({ alarm: 2, recoveryAction: "set_paling_rail" });
      const expectedRidgeSummary =
        `${briefing} ${expected.ridge.summary} ` +
        expectedFirstCastFailureForecast(ridgeFailure.alarm, false);
      const expectedStockwaySummary =
        `${briefing} ${expected.stockway.summary} ` +
        expectedFirstCastFailureForecast(stockwayFailure.alarm, false);
      const snapshotBeforeProjection = session.snapshot();
      const full = fullSummaries(quest);
      const compact = compactSummaries(session);
      const api = createToolApi({ root: ROOT });
      const restored = api.restore_overworld_session({
        compact_context: false,
        compact_result: false,
        snapshot: snapshotBeforeProjection,
      });
      const mcpQuest = api
        .get_overworld_session({
          session_id: restored.session_id,
          include_observation: true,
        })
        .observation.quests.find((candidate) => candidate.id === WOLF_ID);
      if (!mcpQuest?.launch) throw new Error("Expected the full MCP Wolf-Winter route card.");

      expect(full).toMatchObject({
        [RIDGE_ID]: expectedRidgeSummary,
        [STOCKWAY_ID]: expectedStockwaySummary,
      });
      expect(compact).toEqual({
        [RIDGE_ID]: expectedRidgeSummary,
        [STOCKWAY_ID]: expectedStockwaySummary,
      });
      expect(fullSummaries(mcpQuest)).toMatchObject({
        [RIDGE_ID]: expectedRidgeSummary,
        [STOCKWAY_ID]: expectedStockwaySummary,
      });
      for (const summary of [expectedRidgeSummary, expectedStockwaySummary]) {
        expect(summary.length).toBeLessThanOrEqual(WOLF_HILL_ROUTE_TRADEOFF_SUMMARY_CHAR_LIMIT);
      }

      const markup = renderQuestNotice(quest);
      expect(markup.match(/Route tradeoff:/g)).toHaveLength(2);
      expect(markup).toContain(expectedRidgeSummary);
      expect(markup).toContain(expectedStockwaySummary);
      expect(markup).not.toContain("...");

      const cli = renderQuestLaunch(quest);
      expect(cli.match(/Route tradeoff:/g)).toHaveLength(2);
      expect(cli).toContain(expectedRidgeSummary);
      expect(cli).toContain(expectedStockwaySummary);

      const ridgePreview = quest.launch?.options.find((option) => option.id === RIDGE_ID)?.preview;
      const stockwayPreview = quest.launch?.options.find(
        (option) => option.id === STOCKWAY_ID,
      )?.preview;
      const mcpRidgePreview = mcpQuest.launch.options.find(
        (option) => option.id === RIDGE_ID,
      )?.preview;
      const mcpStockwayPreview = mcpQuest.launch.options.find(
        (option) => option.id === STOCKWAY_ID,
      )?.preview;
      for (const surface of [
        ridgePreview,
        mcpRidgePreview,
        compactPreview(session, RIDGE_ID),
        markup,
        cli,
      ]) {
        expect(surface).toContain(expected.ridge.preview);
      }
      for (const surface of [
        stockwayPreview,
        mcpStockwayPreview,
        compactPreview(session, STOCKWAY_ID),
        markup,
        cli,
      ]) {
        expect(surface).toContain(expected.stockway.preview);
      }
      if (oathId === "albany:oath_limited_aid_only") {
        expect(ridgePreview).not.toContain(STALE_ABSOLUTE_RIDGE_RESULT);
        expect(mcpRidgePreview).not.toContain(STALE_ABSOLUTE_RIDGE_RESULT);
        expect(compactPreview(session, RIDGE_ID)).not.toContain(STALE_ABSOLUTE_RIDGE_RESULT);
        expect(stockwayPreview).not.toContain(STALE_ABSOLUTE_STOCKWAY_RESULT);
        expect(mcpStockwayPreview).not.toContain(STALE_ABSOLUTE_STOCKWAY_RESULT);
        expect(compactPreview(session, STOCKWAY_ID)).not.toContain(STALE_ABSOLUTE_STOCKWAY_RESULT);
        expect(markup).not.toContain(STALE_ABSOLUTE_RIDGE_RESULT);
        expect(markup).not.toContain(STALE_ABSOLUTE_STOCKWAY_RESULT);
        expect(cli).not.toContain(STALE_ABSOLUTE_RIDGE_RESULT);
        expect(cli).not.toContain(STALE_ABSOLUTE_STOCKWAY_RESULT);
      }
      expect(full[RIDGE_ID]).toContain(RIDGE_ENTRY_TIMING);
      expect(compact[RIDGE_ID]).toContain(RIDGE_ENTRY_TIMING);
      expect(fullSummaries(mcpQuest)[RIDGE_ID]).toContain(RIDGE_ENTRY_TIMING);
      expect(markup).toContain(RIDGE_ENTRY_TIMING);
      expect(cli).toContain(RIDGE_ENTRY_TIMING);

      const ridgeRuntime = playForecastedCleanLure(session, RIDGE_ID);
      const stockwayRuntime = playForecastedCleanLure(session, STOCKWAY_ID);
      expect(ridgeRuntime).toEqual({
        alarm: expected.ridge.alarm,
        endingId:
          expected.ridge.alarm >= 4
            ? "ending_pack_diverted_cattle_scattered"
            : "ending_pack_diverted",
      });
      expect(stockwayRuntime).toEqual({
        alarm: expected.stockway.alarm,
        endingId:
          expected.stockway.alarm >= 4
            ? "ending_pack_diverted_cattle_scattered"
            : "ending_pack_diverted",
      });
      expect(full[RIDGE_ID]).toContain(`alarm ${ridgeRuntime.alarm}`);
      expect(full[STOCKWAY_ID]).toContain(`alarm ${stockwayRuntime.alarm}`);
      expect(session.snapshot()).toEqual(snapshotBeforeProjection);
    },
  );

  it("shows a delayed certified dispatch identically before either road commitment", () => {
    const { session, quest } = routeCard(
      "albany:oath_full_compact_duty",
      "albany:relief_resident_shelter",
      {
        registrationId: "albany:road_warden",
        sourceId: "albany:source_jamie_market_testimony",
        allyId: "albany:ally_june_cattle_first",
      },
    );
    const expectedBriefing =
      "Dispatch 90m—delayed; roads change arrival, not delay. " +
      "First failure: lure/drive/hunt alarm +1; fortify +1.";
    expect(dispatchBriefing(session)).toBe(expectedBriefing);

    const full = fullSummaries(quest);
    const compact = compactSummaries(session);
    const ridgeFailure = playForecastedFailedFirstCast(session, RIDGE_ID);
    const stockwayFailure = playForecastedFailedFirstCast(session, STOCKWAY_ID);
    expect(ridgeFailure).toEqual({ alarm: 4, recoveryAction: "set_paling_rail" });
    expect(stockwayFailure).toEqual({ alarm: 3, recoveryAction: "set_paling_rail" });
    expect(full[RIDGE_ID]).toContain(expectedFirstCastFailureForecast(ridgeFailure.alarm, true));
    expect(full[STOCKWAY_ID]).toContain(
      expectedFirstCastFailureForecast(stockwayFailure.alarm, true),
    );
    const delayedWindow = session.prepareQuestStart(WOLF_ID, RIDGE_ID).dispatchWindow;
    for (const knowledgeIds of [
      [],
      ["albany:knowledge_relief_cade_fodder"],
      ["albany:knowledge_wolf_limited_aid_only"],
      ["albany:knowledge_relief_cade_fodder", "albany:knowledge_wolf_limited_aid_only"],
    ]) {
      for (const [optionId, alarm] of [
        [RIDGE_ID, ridgeFailure.alarm],
        [STOCKWAY_ID, stockwayFailure.alarm],
      ] as const) {
        const projection = wolfHillRoutePresentation({
          launchId: "albany:wolf_hill_approach",
          optionId,
          knowledgeIds,
          dispatchWindow: delayedWindow,
        });
        expect(projection?.tradeoffSummary).toContain(
          expectedFirstCastFailureForecast(alarm, true),
        );
        expect(projection?.tradeoffSummary.length).toBeLessThanOrEqual(
          WOLF_HILL_ROUTE_TRADEOFF_SUMMARY_CHAR_LIMIT,
        );
      }
    }
    for (const optionId of [RIDGE_ID, STOCKWAY_ID]) {
      expect(full[optionId]?.startsWith(expectedBriefing)).toBe(true);
      expect(compact[optionId]).toBe(full[optionId]);
    }

    const api = createToolApi({ root: ROOT });
    const restored = api.restore_overworld_session({
      compact_context: false,
      compact_result: false,
      snapshot: session.snapshot(),
    });
    const mcpQuest = api
      .get_overworld_session({
        session_id: restored.session_id,
        include_observation: true,
      })
      .observation.quests.find((candidate) => candidate.id === WOLF_ID);
    if (!mcpQuest?.launch) throw new Error("Expected the full MCP Wolf-Winter route card.");
    expect(fullSummaries(mcpQuest)).toEqual(full);

    const launched = api.start_overworld_session_quest({
      compact_context: false,
      compact_result: false,
      compact_observation: false,
      compact_actions: false,
      include_actions: true,
      session_id: restored.session_id,
      quest_id: WOLF_ID,
      approach_id: RIDGE_ID,
      seed: 726,
    });
    const launchedState = api.get_state({
      session_id: launched.rpg_session_id,
      include_state: true,
    }).state;
    expect(launchedState.flags.dispatch_opening_delayed).toBe(true);
    expect(launchedState.embeddedLaunchOverlayReceipt).toMatchObject({
      world_quest_id: WOLF_ID,
      status: "delayed",
      ledger_minutes: 90,
      applied_flag: "dispatch_opening_delayed",
    });

    const markup = renderQuestNotice(quest);
    const cli = renderQuestLaunch(quest);
    expect(markup.split(expectedBriefing)).toHaveLength(3);
    expect(cli.split(expectedBriefing)).toHaveLength(3);
  });

  it("keeps the exact 65m → pending June → 80m dispatch trace truthful on every surface", () => {
    const { session, quest: beforeJune } = routeCard(
      "albany:oath_limited_aid_only",
      "albany:relief_resident_shelter",
      {
        registrationId: "albany:road_warden",
        sourceId: "albany:source_jamie_market_testimony",
        preparationId: "albany:prep_drover_route",
      },
    );
    const beforeBriefing =
      "Dispatch 65m—delayed; roads change arrival, not delay. " +
      "First failure: lure/drive/hunt alarm +1; fortify +1.";
    for (const summary of Object.values(fullSummaries(beforeJune))) {
      expect(summary?.startsWith(beforeBriefing)).toBe(true);
    }

    session.talkToCharacter(WORLD.opening_ally!.contact);
    expect(session.view().questStarts).toEqual([]);
    expect(session.compactView().quest_starts).toBeUndefined();
    const pendingQuest = session.view().quests.find((candidate) => candidate.id === WOLF_ID);
    if (!pendingQuest?.launch) throw new Error("Expected the pending-June Wolf route card.");
    const pendingBriefing =
      "Dispatch 65m committed; June's field team is pending (final 65–80m). " +
      "Delay is already certain; choose or decline to seal the final total and pressure.";
    const pendingFull = fullSummaries(pendingQuest);
    const pendingCompact = compactSummaries(session);
    for (const optionId of [RIDGE_ID, STOCKWAY_ID]) {
      expect(pendingFull[optionId]?.startsWith(pendingBriefing)).toBe(true);
      expect(pendingCompact[optionId]).toBe(pendingFull[optionId]);
      expect(pendingFull[optionId]).not.toMatch(
        /unverified|neutral|no opening-delay failure pressure|fouled first cast/i,
      );
      expect(pendingFull[optionId]?.length).toBeLessThanOrEqual(
        WOLF_HILL_ROUTE_TRADEOFF_SUMMARY_CHAR_LIMIT,
      );
    }

    const pendingWindow = deriveQuestDispatchPresentationWindow({
      questId: WOLF_ID,
      journalEntries: session.snapshot().journalEntries,
      openingRegistration: WORLD.opening_registration!,
      openingReliefOath: WORLD.opening_relief_oath!,
      openingLeadSource: WORLD.opening_lead_source!,
      openingPreparation: WORLD.opening_preparation!,
      openingReliefAllocation: WORLD.opening_relief_allocation!,
      openingAlly: WORLD.opening_ally!,
    });
    expect(pendingWindow).toMatchObject({
      status: "june_commitment_pending",
      committedMinutes: 65,
      finalMinutes: { minimum: 65, maximum: 80 },
    });
    for (const knowledgeIds of [
      [],
      ["albany:knowledge_relief_cade_fodder"],
      ["albany:knowledge_wolf_limited_aid_only"],
      ["albany:knowledge_relief_cade_fodder", "albany:knowledge_wolf_limited_aid_only"],
    ]) {
      for (const optionId of [RIDGE_ID, STOCKWAY_ID]) {
        const projection = wolfHillRoutePresentation({
          launchId: "albany:wolf_hill_approach",
          optionId,
          knowledgeIds,
          dispatchWindow: pendingWindow,
        });
        expect(projection?.tradeoffSummary.startsWith(pendingBriefing)).toBe(true);
        expect(projection?.tradeoffSummary).not.toMatch(/unverified|fouled first cast/i);
        expect(projection?.tradeoffSummary.length).toBeLessThanOrEqual(
          WOLF_HILL_ROUTE_TRADEOFF_SUMMARY_CHAR_LIMIT,
        );
      }
    }

    const pendingMarkup = renderQuestNotice(pendingQuest);
    const pendingCli = renderQuestLaunch(pendingQuest);
    expect(pendingMarkup.match(/Dispatch 65m committed; June/g)).toHaveLength(2);
    expect(pendingCli.split(pendingBriefing)).toHaveLength(3);
    const api = createToolApi({ root: ROOT });
    const restored = api.restore_overworld_session({
      compact_context: false,
      compact_result: false,
      snapshot: session.snapshot(),
    });
    const restoredQuest = api
      .get_overworld_session({
        session_id: restored.session_id,
        include_observation: true,
      })
      .observation.quests.find((candidate) => candidate.id === WOLF_ID);
    if (!restoredQuest?.launch) throw new Error("Expected restored pending-June route card.");
    expect(fullSummaries(restoredQuest)).toEqual(pendingFull);

    const strictWindow = session.prepareQuestStart(WOLF_ID, RIDGE_ID).dispatchWindow;
    expect(strictWindow).toMatchObject({ status: "legacy_neutral" });
    expect(strictWindow).not.toHaveProperty("ledgerMinutes");

    session.chooseJourneyStory("albany:ally_june_cattle_first");
    const afterJune = session.view().quests.find((candidate) => candidate.id === WOLF_ID);
    if (!afterJune?.launch) throw new Error("Expected the final June route card.");
    const afterBriefing =
      "Dispatch 80m—delayed; roads change arrival, not delay. " +
      "First failure: lure/drive/hunt alarm +1; fortify +1.";
    for (const summary of Object.values(fullSummaries(afterJune))) {
      expect(summary?.startsWith(afterBriefing)).toBe(true);
      expect(summary).not.toContain(pendingBriefing);
    }
  });

  it.each([
    {
      label: "guaranteed on time",
      oathId: "albany:oath_full_compact_duty",
      sourceId: "albany:source_rowan_civic_docket",
      preparationId: "albany:prep_works_fortification",
      committedMinutes: 40,
      maximumMinutes: 55,
      pressureCopy: "It stays on time; choose or decline to seal the final total.",
    },
    {
      label: "threshold crossing",
      oathId: "albany:oath_unaffiliated_personal_bond",
      sourceId: "albany:source_jamie_market_testimony",
      preparationId: "albany:prep_drover_route",
      committedMinutes: 60,
      maximumMinutes: 75,
      pressureCopy: "Choose or decline to set the final total and delay pressure.",
    },
    {
      label: "guaranteed delayed",
      oathId: "albany:oath_limited_aid_only",
      sourceId: "albany:source_jamie_market_testimony",
      preparationId: "albany:prep_drover_route",
      committedMinutes: 65,
      maximumMinutes: 80,
      pressureCopy:
        "Delay is already certain; choose or decline to seal the final total and pressure.",
    },
  ])(
    "classifies a pending field-team range that is $label without inventing a final forecast",
    ({ oathId, sourceId, preparationId, committedMinutes, maximumMinutes, pressureCopy }) => {
      const { session } = routeCard(oathId, "albany:relief_resident_shelter", {
        registrationId: "albany:road_warden",
        sourceId,
        preparationId,
      });
      session.talkToCharacter(WORLD.opening_ally!.contact);
      const pendingWindow = deriveQuestDispatchPresentationWindow({
        questId: WOLF_ID,
        journalEntries: session.snapshot().journalEntries,
        openingRegistration: WORLD.opening_registration!,
        openingReliefOath: WORLD.opening_relief_oath!,
        openingLeadSource: WORLD.opening_lead_source!,
        openingPreparation: WORLD.opening_preparation!,
        openingReliefAllocation: WORLD.opening_relief_allocation!,
        openingAlly: WORLD.opening_ally!,
      });
      expect(pendingWindow).toMatchObject({
        status: "june_commitment_pending",
        committedMinutes,
        finalMinutes: { minimum: committedMinutes, maximum: maximumMinutes },
      });
      for (const optionId of [RIDGE_ID, STOCKWAY_ID]) {
        const summary = wolfHillRoutePresentation({
          launchId: "albany:wolf_hill_approach",
          optionId,
          dispatchWindow: pendingWindow,
        })?.tradeoffSummary;
        expect(summary).toContain(pressureCopy);
        expect(summary).not.toMatch(/unverified|fouled first cast/i);
        expect(summary?.length).toBeLessThanOrEqual(WOLF_HILL_ROUTE_TRADEOFF_SUMMARY_CHAR_LIMIT);
      }
    },
  );
});
