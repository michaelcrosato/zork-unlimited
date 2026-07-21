import { describe, expect, it } from "vitest";
import type {
  OverworldArea,
  OverworldExplorationSite,
  OverworldLocalJob,
  OverworldQuest,
} from "../../src/world/overworld.js";
import {
  applyOverworldLocalDiscovery,
  emptyOverworldLocalDiscovery,
  planOverworldLocalDiscovery,
  questView,
} from "../../src/world/session_local_discovery.js";
import {
  applyOverworldSessionLocalDiscoveryForTown,
  type MutableOverworldSessionLocalState,
} from "../../src/world/session_local_state.js";
import { loadOverworldManifest } from "../../src/world/source.js";

const WORLD = loadOverworldManifest(process.cwd());

function area(id: string, home = "town_a"): OverworldArea {
  return {
    id,
    home,
    name: `${id} name`,
    kind: "civic_core",
    summary: `${id} summary`,
    discovery: `${id} discovery`,
    travel_minutes: 20,
    services: [],
  };
}

function job(id: string, areaId: string, home = "town_a"): OverworldLocalJob {
  return {
    id,
    home,
    area: areaId,
    kind: "courier",
    title: `${id} title`,
    summary: `${id} summary`,
    objective: `${id} objective`,
    reward: `${id} reward`,
    minutes: 30,
    difficulty: 2,
    visibility: "local_job_board",
  };
}

function site(id: string, areaId: string, nearestTown = "town_a"): OverworldExplorationSite {
  return {
    id,
    region: "Test Region",
    nearest_town: nearestTown,
    area: areaId,
    kind: "civic",
    title: `${id} title`,
    summary: `${id} summary`,
    discovery: `${id} discovery`,
    danger: 2,
    reward: `${id} reward`,
  };
}

function quest(id: string, areaId: string, home = "town_a"): OverworldQuest {
  return {
    id,
    title: `${id} title`,
    source: `${id}_source`,
    home,
    area: areaId,
    discovery: `${id} discovery`,
    visibility: "local_notice_board",
  };
}

describe("overworld local discovery planning", () => {
  it("plans one reveal per category and lets a new area unlock local boards", () => {
    const knownArea = area("area_a");
    const nextArea = area("area_b");
    const nextJob = job("job_b", nextArea.id);
    const nextSite = site("site_a", knownArea.id);
    const nextQuest = quest("quest_b", nextArea.id);
    const discoveredAreaIds = new Set([knownArea.id]);

    const discovery = planOverworldLocalDiscovery({
      townId: "town_a",
      currentTownId: "town_a",
      areasByTown: new Map([["town_a", [knownArea, nextArea]]]),
      jobsByTown: new Map([["town_a", [nextJob]]]),
      currentAreaSites: [nextSite],
      questsByTown: new Map([["town_a", [nextQuest]]]),
      discoveredAreaIds,
      discoveredJobIds: new Set(),
      discoveredSiteIds: new Set(),
      discoveredQuestIds: new Set(),
    });

    expect(discovery.discoveredAreas).toEqual([nextArea]);
    expect(discovery.discoveredJobs).toEqual([nextJob]);
    expect(discovery.discoveredSites).toEqual([nextSite]);
    expect(discovery.discoveredQuests).toEqual([questView(nextQuest)]);
    expect([...discoveredAreaIds]).toEqual([knownArea.id]);
  });

  it("does not reveal jobs, quests, or remote sites before their local gates are met", () => {
    const knownArea = area("area_a");
    const hiddenArea = area("area_b");
    const gatedJob = job("job_b", hiddenArea.id);
    const gatedQuest = quest("quest_b", hiddenArea.id);
    const remoteCurrentAreaSite = site("site_remote", knownArea.id, "town_b");

    expect(
      planOverworldLocalDiscovery({
        townId: "town_b",
        currentTownId: "town_a",
        areasByTown: new Map([["town_b", []]]),
        jobsByTown: new Map([["town_b", [gatedJob]]]),
        currentAreaSites: [remoteCurrentAreaSite],
        questsByTown: new Map([["town_b", [gatedQuest]]]),
        discoveredAreaIds: new Set([knownArea.id]),
        discoveredJobIds: new Set(),
        discoveredSiteIds: new Set(),
        discoveredQuestIds: new Set(),
      }),
    ).toEqual(emptyOverworldLocalDiscovery());
  });

  it("projects quest views without leaking pack implementation details", () => {
    expect(questView(quest("quest_a", "area_a"))).toEqual({
      id: "quest_a",
      title: "quest_a title",
      home: "town_a",
      area: "area_a",
      discovery: "quest_a discovery",
      visibility: "local_notice_board",
    });
  });

  it("applies all discovered ids and reports idempotent replays", () => {
    const nextArea = area("area_b");
    const nextJob = job("job_b", nextArea.id);
    const nextSite = site("site_b", nextArea.id);
    const nextQuest = questView(quest("quest_b", nextArea.id));
    const state = {
      discoveredAreaIds: new Set<string>(),
      discoveredJobIds: new Set<string>(),
      discoveredSiteIds: new Set<string>(),
      discoveredQuestIds: new Set<string>(),
    };
    const discovery = {
      discoveredAreas: [nextArea],
      discoveredJobs: [nextJob],
      discoveredSites: [nextSite],
      discoveredQuests: [nextQuest],
    };

    expect(applyOverworldLocalDiscovery(state, discovery)).toBe(true);
    expect([...state.discoveredAreaIds]).toEqual([nextArea.id]);
    expect([...state.discoveredJobIds]).toEqual([nextJob.id]);
    expect([...state.discoveredSiteIds]).toEqual([nextSite.id]);
    expect([...state.discoveredQuestIds]).toEqual([nextQuest.id]);
    expect(applyOverworldLocalDiscovery(state, discovery)).toBe(false);
  });

  it.each([
    [
      "albany_city__market__job",
      "albany_city__market__event",
      "hold_household_kitchen_prices",
      ["release_price_hold_operational", "audit_price_hold_household_chain"],
    ],
    [
      "albany_city__market__job",
      "albany_city__market__event",
      "publish_open_bid_ceiling",
      ["release_open_bid_operational", "audit_open_bid_public_chain"],
    ],
    [
      "albany_city__greenway__job",
      "albany_city__greenway__event",
      "post_accessible_public_detour",
      ["stake_shortest_accessible_detour", "map_all_weather_public_loop"],
    ],
    [
      "albany_city__greenway__job",
      "albany_city__greenway__event",
      "place_quiet_corridor_markers",
      ["reset_steward_markers", "trace_winter_wildlife_corridor_with_witness_points"],
    ],
  ] as const)(
    "projects only the policy-bound authored options when discovering %s after %s",
    (jobId, eventId, eventOptionId, expectedOptionIds) => {
      const sourceJob = WORLD.local_jobs.find((candidate) => candidate.id === jobId);
      const sourceEvent = WORLD.local_events.find((candidate) => candidate.id === eventId);
      const sourceArea = WORLD.areas.find((candidate) => candidate.id === sourceJob?.area);
      if (!sourceJob?.authored_scene || !sourceEvent?.authored_scene || !sourceArea) {
        throw new Error("Expected an authored Albany policy pair fixture.");
      }
      const authoredOptions = sourceJob.authored_scene.options.map((option) => ({ ...option }));
      const state: MutableOverworldSessionLocalState = {
        currentTownId: sourceJob.home,
        currentAreaId: sourceArea.id,
        areasById: new Map([[sourceArea.id, sourceArea]]),
        areasByTown: new Map([[sourceJob.home, [sourceArea]]]),
        currentAreaByTown: new Map([[sourceJob.home, sourceArea.id]]),
        areaExitsByArea: new Map(),
        poisByArea: new Map(),
        charactersByArea: new Map(),
        eventsByArea: new Map(),
        sitesByArea: new Map(),
        jobsByTown: new Map([[sourceJob.home, [sourceJob]]]),
        questsByTown: new Map(),
        discoveredAreaIds: new Set([sourceArea.id]),
        discoveredJobIds: new Set(),
        completedJobIds: new Set(),
        discoveredSiteIds: new Set(),
        discoveredQuestIds: new Set(),
        completedQuestIds: new Set(["wolf_winter"]),
        resolvedEventIds: new Set([eventId]),
        campaignWorldFactIds: new Set(),
        journalEntries: new Map([
          [
            `resolve:${eventId}`,
            {
              id: `resolve:${eventId}`,
              kind: "event",
              town: sourceJob.home,
              title: sourceEvent.title,
              text: sourceEvent.summary,
              recordedAt: "Day 1, 08:00",
              localSceneProof: {
                sceneId: sourceEvent.authored_scene.id,
                optionId: eventOptionId,
              },
            },
          ],
        ]),
      };

      const applied = applyOverworldSessionLocalDiscoveryForTown(state, sourceJob.home);
      const discovered = applied.discovery.discoveredJobs[0];

      expect(discovered).toMatchObject({ id: jobId, title: sourceJob.title });
      expect(discovered?.authored_scene?.options.map((option) => option.id)).toEqual(
        expectedOptionIds,
      );
      const serialized = JSON.stringify(discovered);
      for (const option of authoredOptions) {
        if (expectedOptionIds.some((expectedOptionId) => expectedOptionId === option.id)) continue;
        expect(serialized).not.toContain(option.id);
        expect(serialized).not.toContain(option.title);
        expect(serialized).not.toContain(option.preview);
      }
      expect(sourceJob.authored_scene.options).toEqual(authoredOptions);
    },
  );
});
