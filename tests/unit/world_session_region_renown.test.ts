import { describe, expect, it } from "vitest";
import type {
  OverworldExplorationSite,
  OverworldLocalEvent,
  OverworldLocalJob,
  OverworldNode,
  OverworldRoadEvent,
} from "../../src/world/overworld.js";
import type { OverworldProgressJournalSourceIndex } from "../../src/world/session_progress_journal.js";
import {
  assertSnapshotRegionRenown,
  expectedSnapshotRegionRenown,
  type OverworldRegionRenownRoadJournalIndex,
  type OverworldRegionRenownSourceIndex,
} from "../../src/world/session_region_renown.js";
import type { TravelLogEntrySnapshot } from "../../src/world/session_snapshot.js";

function progressIndex(
  overrides: Partial<Record<keyof OverworldProgressJournalSourceIndex, readonly string[]>> = {},
): OverworldProgressJournalSourceIndex {
  return {
    completedJobIds: new Set(overrides.completedJobIds ?? []),
    completedQuestIds: new Set(overrides.completedQuestIds ?? []),
    completedRegionalArcIds: new Set(overrides.completedRegionalArcIds ?? []),
    exploredSiteIds: new Set(overrides.exploredSiteIds ?? []),
    resolvedEventIds: new Set(overrides.resolvedEventIds ?? []),
    startedQuestIds: new Set(overrides.startedQuestIds ?? []),
    visitedAreaIds: new Set(overrides.visitedAreaIds ?? []),
  };
}

function node(id: string, region: string): OverworldNode {
  return {
    id,
    name: id,
    kind: "city",
    source_geography: "incorporated_place",
    geoid: id,
    county_fips: "001",
    population_2025: 10_000,
    lat: 0,
    lon: 0,
    region,
    services: ["market"],
    description: "A test node.",
  };
}

function job(id: string, home: string, difficulty: number): OverworldLocalJob {
  return {
    id,
    home,
    area: `${home}:area`,
    kind: "courier",
    title: id,
    summary: "Summary",
    objective: "Objective",
    reward: "Reward",
    minutes: 30,
    difficulty,
    visibility: "local_job_board",
  };
}

function event(id: string, home: string, intensity: number): OverworldLocalEvent {
  return {
    id,
    home,
    area: `${home}:area`,
    title: id,
    pressure: "hazard",
    intensity,
    summary: "Summary",
  };
}

function site(id: string, region: string, danger: number): OverworldExplorationSite {
  return {
    id,
    region,
    nearest_town: "town_a",
    area: "town_a:area",
    kind: "ruin",
    title: id,
    summary: "Summary",
    discovery: "Discovery",
    danger,
    reward: "Reward",
  };
}

function roadEvent(edge: string, risk: OverworldRoadEvent["risk"]): OverworldRoadEvent {
  return {
    id: `${edge}:event`,
    edge,
    title: "Road event",
    risk,
    summary: "Summary",
  };
}

function travelEntry(toId: string): TravelLogEntrySnapshot {
  return {
    edgeId: "road:a-b",
    fromId: "town_a",
    toId,
    delayMinutes: 0,
    minutes: 60,
    arrivedAt: 540,
    suppliesUsed: 1,
    suppliesAfter: 5,
    fatigueGained: 1,
    fatigueAfter: 1,
  };
}

function sources(): OverworldRegionRenownSourceIndex {
  return {
    eventsById: new Map([["event_a", event("event_a", "town_a", 4)]]),
    jobsById: new Map([["job_a", job("job_a", "town_a", 3)]]),
    nodesById: new Map([
      ["town_a", node("town_a", "North")],
      ["town_b", node("town_b", "South")],
    ]),
    roadEventsByEdgeId: new Map([["road:a-b", roadEvent("road:a-b", "medium")]]),
    sitesById: new Map([["site_a", site("site_a", "South", 2)]]),
    travelLogByArrival: new Map([["road:a-b@540", travelEntry("town_b")]]),
  };
}

const roadJournal: OverworldRegionRenownRoadJournalIndex = {
  entries: [
    {
      entry: { id: "road:road:a-b:540:assist_travelers" },
      key: "road:a-b@540",
      parsed: {
        edgeId: "road:a-b",
        strategy: "assist_travelers",
      },
    },
  ],
};

describe("overworld snapshot region renown replay", () => {
  it("replays renown from completed jobs, explored sites, resolved events, and roads", () => {
    const expected = expectedSnapshotRegionRenown(
      progressIndex({
        completedJobIds: ["job_a"],
        exploredSiteIds: ["site_a"],
        resolvedEventIds: ["event_a"],
      }),
      sources(),
      roadJournal,
    );

    expect(Object.fromEntries(expected)).toEqual({
      North: 7,
      South: 5,
    });
  });

  it("accepts saved region renown that matches replayed accounting", () => {
    expect(() =>
      assertSnapshotRegionRenown(
        new Map([
          ["North", 7],
          ["South", 5],
        ]),
        progressIndex({
          completedJobIds: ["job_a"],
          exploredSiteIds: ["site_a"],
          resolvedEventIds: ["event_a"],
        }),
        sources(),
        roadJournal,
      ),
    ).not.toThrow();
  });

  it("rejects missing earned region renown", () => {
    expect(() =>
      assertSnapshotRegionRenown(
        new Map([["North", 7]]),
        progressIndex({
          completedJobIds: ["job_a"],
          exploredSiteIds: ["site_a"],
          resolvedEventIds: ["event_a"],
        }),
        sources(),
        roadJournal,
      ),
    ).toThrow(/region renown for "South" is 0, expected 5/);
  });

  it("rejects unexpected saved region renown", () => {
    expect(() =>
      assertSnapshotRegionRenown(new Map([["Ghost", 1]]), progressIndex(), sources(), {
        entries: [],
      }),
    ).toThrow(/unexpected region renown for "Ghost"/);
  });

  it("rejects progress whose home town is missing from the world index", () => {
    const badSources = {
      ...sources(),
      jobsById: new Map([["job_a", job("job_a", "missing_town", 3)]]),
    };

    expect(() =>
      expectedSnapshotRegionRenown(progressIndex({ completedJobIds: ["job_a"] }), badSources, {
        entries: [],
      }),
    ).toThrow(/completed job "job_a" references unknown town/);
  });
});
