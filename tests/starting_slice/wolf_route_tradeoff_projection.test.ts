/**
 * The route card must combine the already-selected Albany relief allocation
 * with each Wolf-Winter hill road before the player commits to quest start.
 * Full, compact, browser, and CLI surfaces use the dedicated exact field
 * rather than a truncation of preview.
 */
import { createRequire } from "node:module";
import { resolve } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer, type ViteDevServer } from "vite";

import { renderQuestLaunch } from "../../bin/overworld_play.js";
import { createToolApi } from "../../src/mcp/tools.js";
import { loadOverworldManifest } from "../../src/world/source.js";
import type { OverworldQuestView } from "../../src/world/session_local_discovery.js";
import { OverworldSession } from "../../src/world/session.js";
import { WOLF_HILL_ROUTE_TRADEOFF_SUMMARY_CHAR_LIMIT } from "../../src/world/wolf_hill_route_presentation.js";

const ROOT = process.cwd();
const WORLD = loadOverworldManifest(ROOT);
const WOLF_ID = "wolf_winter";
const RIDGE_ID = "albany:wolf_approach_exposed_ridge";
const STOCKWAY_ID = "albany:wolf_approach_sheltered_stockway";
const STALE_ABSOLUTE_RIDGE_RESULT =
  "A clean three-cast lure line therefore reaches alarm 4 (Breaking) and scatters cattle.";
const RIDGE_ENTRY_TIMING = "Hill lip 0; final descent 1";

const WITHOUT_FODDER = {
  ridge:
    "Hill lip 0; final descent 1; first lure DC 10; a clean lure reaches alarm 4 and scatters two cattle.",
  stockway:
    "Arrival alarm 0; first lure cast DC 12; a clean lure reaches alarm 3 and keeps the whole herd.",
} as const;

const WITH_FODDER = {
  ridge:
    "Hill lip 0; final descent 1; first lure DC 10; Cade fodder suppresses the clean first-cast alarm, so a clean lure reaches alarm 3 and keeps the herd.",
  stockway:
    "Arrival alarm 0; first lure cast DC 12; Cade fodder does not alter the sheltered route; a clean lure reaches alarm 3 and keeps the whole herd.",
} as const;

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

function routeCard(reliefChoiceId: string): {
  session: OverworldSession;
  quest: OverworldQuestView;
} {
  const session = new OverworldSession(WORLD);
  const opening = session.view();
  session.scoutPoi(opening.pois[0]!.id);
  session.talkToCharacter(WORLD.opening_registration!.contact);
  session.chooseJourneyStory("albany:ledger_advocate");
  session.chooseJourneyStory("albany:oath_full_compact_duty");
  session.chooseJourneyStory("albany:source_rowan_civic_docket");
  moveToArea(session, WORLD.opening_preparation!.area);
  session.chooseJourneyStory("albany:prep_works_fortification");
  session.chooseJourneyStory(reliefChoiceId);

  const quest = session.view().quests.find((candidate) => candidate.id === WOLF_ID);
  if (!quest?.launch) throw new Error("Expected the pre-commitment Wolf-Winter route card.");
  return { session, quest };
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

  it.each([
    ["without Cade fodder", "albany:relief_resident_shelter", WITHOUT_FODDER],
    ["with Cade fodder", "albany:relief_cade_fodder", WITH_FODDER],
  ] as const)(
    "keeps decisive full, compact, UI, and CLI terms exact %s",
    (_, reliefId, expected) => {
      const { session, quest } = routeCard(reliefId);
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
        [RIDGE_ID]: expected.ridge,
        [STOCKWAY_ID]: expected.stockway,
      });
      expect(compact).toEqual({
        [RIDGE_ID]: expected.ridge,
        [STOCKWAY_ID]: expected.stockway,
      });
      expect(fullSummaries(mcpQuest)).toMatchObject({
        [RIDGE_ID]: expected.ridge,
        [STOCKWAY_ID]: expected.stockway,
      });
      for (const summary of [expected.ridge, expected.stockway]) {
        expect(summary.length).toBeLessThanOrEqual(WOLF_HILL_ROUTE_TRADEOFF_SUMMARY_CHAR_LIMIT);
      }

      const markup = renderQuestNotice(quest);
      expect(markup.match(/Route tradeoff:/g)).toHaveLength(2);
      expect(markup).toContain(expected.ridge);
      expect(markup).toContain(expected.stockway);
      expect(markup).not.toContain("...");

      const cli = renderQuestLaunch(quest);
      expect(cli.match(/Route tradeoff:/g)).toHaveLength(2);
      expect(cli).toContain(expected.ridge);
      expect(cli).toContain(expected.stockway);

      const ridgePreview = quest.launch?.options.find((option) => option.id === RIDGE_ID)?.preview;
      const mcpRidgePreview = mcpQuest.launch.options.find(
        (option) => option.id === RIDGE_ID,
      )?.preview;
      if (reliefId === "albany:relief_cade_fodder") {
        expect(ridgePreview).toContain("Cade fodder suppresses the clean first-cast alarm");
        expect(ridgePreview).not.toContain(STALE_ABSOLUTE_RIDGE_RESULT);
        expect(mcpRidgePreview).not.toContain(STALE_ABSOLUTE_RIDGE_RESULT);
        expect(compactPreview(session, RIDGE_ID)).toContain(
          "Cade fodder suppresses the clean first-cast alarm",
        );
        expect(compactPreview(session, RIDGE_ID)).not.toContain(STALE_ABSOLUTE_RIDGE_RESULT);
        expect(markup).not.toContain(STALE_ABSOLUTE_RIDGE_RESULT);
        expect(cli).not.toContain(STALE_ABSOLUTE_RIDGE_RESULT);
      } else {
        expect(ridgePreview).toContain(STALE_ABSOLUTE_RIDGE_RESULT);
        expect(mcpRidgePreview).toContain(STALE_ABSOLUTE_RIDGE_RESULT);
      }
      expect(full[RIDGE_ID]).toContain(RIDGE_ENTRY_TIMING);
      expect(compact[RIDGE_ID]).toContain(RIDGE_ENTRY_TIMING);
      expect(fullSummaries(mcpQuest)[RIDGE_ID]).toContain(RIDGE_ENTRY_TIMING);
      expect(markup).toContain(RIDGE_ENTRY_TIMING);
      expect(cli).toContain(RIDGE_ENTRY_TIMING);
      expect(session.snapshot()).toEqual(snapshotBeforeProjection);
    },
  );
});
