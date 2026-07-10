import { describe, expect, it } from "vitest";
import {
  assertSnapshotDiscoveredAreaCountReplay,
  assertSnapshotDiscoveredLocalSourceCountReplay,
  assertSnapshotDiscoveryLocality,
  assertSnapshotLocalActionDiscoveryChronology,
  assertSnapshotLocalActionJournalReachability,
  localActionJournalReplayIndex,
  type OverworldDiscoveryLocalityIndex,
  type OverworldLocalActionJournalReachabilityIndex,
  type OverworldLocalActionJournalReplayIndex,
} from "../../src/world/session_local_action_journal.js";
import { timeLabel } from "../../src/world/session_journal_codec.js";
import type { OverworldJournalTimelineIndex } from "../../src/world/session_journal_timeline.js";
import type { OverworldJournalEntry } from "../../src/world/session_snapshot.js";
import type {
  OverworldArea,
  OverworldCharacter,
  OverworldExplorationSite,
  OverworldLocalEvent,
  OverworldLocalJob,
  OverworldPoi,
  OverworldQuest,
} from "../../src/world/overworld.js";

function area(id: string, travelMinutes: number): OverworldArea {
  return {
    id,
    home: "town_b",
    name: id,
    kind: "civic_core",
    summary: `${id} summary`,
    discovery: `${id} discovery`,
    travel_minutes: travelMinutes,
    services: [],
  };
}

function character(id: string): OverworldCharacter {
  return {
    id,
    home: "town_b",
    area: "area_a",
    name: id,
    role: "guide",
    faction: "Civic League",
    summary: `${id} summary`,
    agenda: `${id} agenda`,
  };
}

function event(id: string): OverworldLocalEvent {
  return {
    id,
    home: "town_b",
    area: "area_a",
    title: id,
    pressure: "hazard",
    intensity: 2,
    summary: `${id} summary`,
  };
}

function job(id: string, areaId = "area_a"): OverworldLocalJob {
  return {
    id,
    home: "town_b",
    area: areaId,
    kind: "courier",
    title: id,
    summary: `${id} summary`,
    objective: `${id} objective`,
    reward: `${id} reward`,
    minutes: 30,
    difficulty: 2,
    visibility: "local_job_board",
  };
}

function poi(id: string): OverworldPoi {
  return {
    id,
    home: "town_b",
    area: "area_a",
    kind: "landmark",
    title: id,
    summary: `${id} summary`,
  };
}

function site(id: string): OverworldExplorationSite {
  return {
    id,
    region: "North",
    nearest_town: "town_b",
    area: "area_a",
    kind: "civic",
    title: id,
    summary: `${id} summary`,
    discovery: `${id} discovery`,
    danger: 2,
    reward: `${id} reward`,
  };
}

function quest(id: string): OverworldQuest {
  return {
    id,
    title: id,
    source: "source",
    home: "town_b",
    area: "area_a",
    discovery: `${id} discovery`,
    visibility: "local_notice_board",
  };
}

const areaA = area("area_a", 10);
const areaB = area("area_b", 20);
const characterA = character("char_a");
const eventA = event("event_a");
const jobA = job("job_a");
const jobB = job("job_b");
const poiA = poi("poi_a");
const questA = quest("quest_a");
const siteA = site("site_a");

function journal(
  id: string,
  kind: OverworldJournalEntry["kind"],
  recordedAt = 600,
): OverworldJournalEntry {
  return {
    id,
    kind,
    town: "Town B",
    title: id,
    text: `${id} entry`,
    recordedAt: timeLabel(recordedAt),
  };
}

function timeline(
  localActionEntries: OverworldJournalTimelineIndex["localActionEntries"],
): OverworldJournalTimelineIndex {
  return {
    eventResolutionProofs: {
      contactTimeByArea: new Map(),
      recordedAtById: new Map(),
      resolutionTimeByTown: new Map(),
      scoutTimeByArea: new Map(),
    },
    localActionEntries,
    progressSources: {
      completedJobIds: new Set(),
      completedQuestIds: new Set(),
      completedRegionalArcIds: new Set(),
      exploredSiteIds: new Set(),
      resolvedEventIds: new Set(),
      startedQuestIds: new Set(),
      visitedAreaIds: new Set(),
    },
    roadJournalEntries: [],
    serviceJournal: { entries: [] },
  };
}

function reachability(
  overrides: Partial<OverworldLocalActionJournalReachabilityIndex> = {},
): OverworldLocalActionJournalReachabilityIndex {
  return {
    areasById: new Map([
      [areaA.id, areaA],
      [areaB.id, areaB],
    ]),
    areasByTown: new Map([["town_b", [areaA, areaB]]]),
    charactersById: new Map([[characterA.id, characterA]]),
    discoveredAreaIds: new Set([areaA.id]),
    discoveredJobIds: new Set(),
    discoveredQuestIds: new Set(),
    discoveredSiteIds: new Set(),
    eventsById: new Map([[eventA.id, eventA]]),
    jobsById: new Map([
      [jobA.id, jobA],
      [jobB.id, jobB],
    ]),
    jobsByTown: new Map([["town_b", [jobA, jobB]]]),
    poisById: new Map([[poiA.id, poiA]]),
    questsById: new Map([[questA.id, questA]]),
    questsByTown: new Map([["town_b", [questA]]]),
    sitesByArea: new Map([[areaA.id, [siteA]]]),
    sitesById: new Map([[siteA.id, siteA]]),
    townVisitMinutes: new Map([["town_b", 500]]),
    visitedTownIds: new Set(["town_b"]),
    ...overrides,
  };
}

function locality(
  overrides: Partial<OverworldDiscoveryLocalityIndex> = {},
): OverworldDiscoveryLocalityIndex {
  return {
    areaHomes: new Map([
      [areaA.id, "town_b"],
      [areaB.id, "town_b"],
    ]),
    completedQuestIds: new Set(),
    discoveredAreaIds: new Set([areaA.id]),
    discoveredJobIds: new Set(),
    discoveredQuestIds: new Set(),
    discoveredSiteIds: new Set(),
    eventsById: new Map([[eventA.id, eventA]]),
    jobsById: new Map([[jobA.id, jobA]]),
    questsById: new Map([[questA.id, questA]]),
    resolvedEventIds: new Set(),
    sitesById: new Map([[siteA.id, siteA]]),
    startedQuestIds: new Set(),
    visitedAreaIds: new Set(),
    visitedTownIds: new Set(["town_b"]),
    ...overrides,
  };
}

function replayIndex(
  overrides: Partial<OverworldLocalActionJournalReplayIndex> = {},
): OverworldLocalActionJournalReplayIndex {
  return {
    entries: [],
    localActionCountByArea: new Map(),
    localActionCountByTown: new Map(),
    ...overrides,
  };
}

describe("overworld local action journal replay", () => {
  it("indexes local journal actions oldest-first with replay durations and counts", () => {
    const replay = localActionJournalReplayIndex(
      reachability({ discoveredAreaIds: new Set([areaA.id, areaB.id]) }),
      timeline([
        { entry: journal("talk:char_a", "contact", 620), recordedAt: 620 },
        { entry: journal("area:area_b", "area", 600), recordedAt: 600 },
        { entry: journal("job:job_a", "job", 610), recordedAt: 610 },
      ]),
    );

    expect(replay.entries.map(({ entry }) => entry.id)).toEqual([
      "area:area_b",
      "job:job_a",
      "talk:char_a",
    ]);
    expect(replay.entries.map(({ duration }) => duration)).toEqual([20, 30, 15]);
    expect(replay.localActionCountByTown.get("town_b")).toBe(3);
    expect(replay.localActionCountByArea.get("area_a")).toBe(2);
    expect(replay.localActionCountByArea.get("area_b")).toBe(1);
  });

  it("indexes completed quest journals for clock replay without inflating discovery counts", () => {
    const replay = localActionJournalReplayIndex(
      reachability({ discoveredQuestIds: new Set([questA.id]) }),
      timeline([{ entry: journal("quest_done:quest_a", "quest_done", 630), recordedAt: 630 }]),
    );

    expect(replay.entries).toHaveLength(1);
    expect(replay.entries[0]).toMatchObject({
      entry: { id: "quest_done:quest_a", kind: "quest_done" },
      recordedAt: 630,
      duration: 130,
    });
    expect(replay.localActionCountByTown.get("town_b")).toBeUndefined();
    expect(replay.localActionCountByArea.get("area_a")).toBeUndefined();
  });

  it("rejects local journal actions before town visit or area discovery", () => {
    const beforeVisit = localActionJournalReplayIndex(
      reachability(),
      timeline([{ entry: journal("area:area_a", "area", 490), recordedAt: 490 }]),
    );
    expect(() => assertSnapshotLocalActionJournalReachability(beforeVisit, reachability())).toThrow(
      /before visiting town/,
    );

    const undiscoveredArea = localActionJournalReplayIndex(
      reachability({ discoveredAreaIds: new Set() }),
      timeline([{ entry: journal("area:area_a", "area", 600), recordedAt: 600 }]),
    );
    expect(() =>
      assertSnapshotLocalActionJournalReachability(
        undiscoveredArea,
        reachability({ discoveredAreaIds: new Set() }),
      ),
    ).toThrow(/undiscovered area/);
  });

  it("rejects local actions recorded before replayed discovery prerequisites", () => {
    const skippedArea = localActionJournalReplayIndex(
      reachability({ discoveredAreaIds: new Set([areaA.id, areaB.id]) }),
      timeline([{ entry: journal("area:area_b", "area", 600), recordedAt: 600 }]),
    );
    expect(() =>
      assertSnapshotLocalActionDiscoveryChronology(
        skippedArea,
        reachability({ discoveredAreaIds: new Set([areaA.id, areaB.id]) }),
      ),
    ).toThrow(/before discovering area/);

    const skippedJob = localActionJournalReplayIndex(
      reachability({ discoveredJobIds: new Set([jobA.id]) }),
      timeline([{ entry: journal("job:job_a", "job", 600), recordedAt: 600 }]),
    );
    expect(() =>
      assertSnapshotLocalActionDiscoveryChronology(
        skippedJob,
        reachability({ discoveredJobIds: new Set([jobA.id]) }),
      ),
    ).toThrow(/before discovering job/);
  });

  it("checks saved discovery locality for quests, jobs, sites, and events", () => {
    expect(() =>
      assertSnapshotDiscoveryLocality(
        locality({
          discoveredAreaIds: new Set(),
          discoveredJobIds: new Set([jobA.id]),
        }),
      ),
    ).toThrow(/discovered job "job_a" is in undiscovered area/);

    expect(() =>
      assertSnapshotDiscoveryLocality(locality({ startedQuestIds: new Set([questA.id]) })),
    ).toThrow(/started quest "quest_a" is not discovered/);
  });

  it("rejects forged discovered area and local source counts", () => {
    expect(() =>
      assertSnapshotDiscoveredAreaCountReplay(
        reachability({ discoveredAreaIds: new Set([areaA.id, areaB.id]) }),
        replayIndex(),
      ),
    ).toThrow(/discovered area count/);

    expect(() =>
      assertSnapshotDiscoveredLocalSourceCountReplay(
        reachability({
          discoveredAreaIds: new Set([areaA.id]),
          discoveredJobIds: new Set([jobA.id, jobB.id]),
        }),
        replayIndex({ localActionCountByTown: new Map([["town_b", 1]]) }),
      ),
    ).toThrow(/discovered job count/);
  });
});
