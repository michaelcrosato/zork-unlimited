import { describe, expect, it } from "vitest";
import { createInitialJourneyContractSnapshot } from "../../src/world/journey_contract.js";
import { timeLabel } from "../../src/world/session_journal_codec.js";
import {
  assertSnapshotTimeline,
  journalSourceId,
  type OverworldJournalTimelineSourceIndex,
} from "../../src/world/session_journal_timeline.js";
import {
  OVERWORLD_SESSION_SAVE_VERSION,
  type OverworldJournalEntry,
  type OverworldSessionSnapshot,
} from "../../src/world/session_snapshot.js";
import type {
  OverworldCharacter,
  OverworldLocalEvent,
  OverworldPoi,
} from "../../src/world/overworld.js";

function character(id: string, home: string, area: string): OverworldCharacter {
  return {
    id,
    home,
    area,
    name: "Source Contact",
    role: "dispatcher",
    faction: "Civic League",
    summary: "Keeps local notes aligned.",
    agenda: "Validate the route.",
  };
}

function event(id: string, home: string, area: string): OverworldLocalEvent {
  return {
    id,
    home,
    area,
    title: "Signal Fault",
    pressure: "hazard",
    intensity: 2,
    summary: "A local hazard needs resolution.",
  };
}

function poi(id: string, home: string, area: string): OverworldPoi {
  return {
    id,
    home,
    area,
    kind: "landmark",
    title: "Switching Yard",
    summary: "A useful scouting point.",
  };
}

function journal(
  id: string,
  kind: OverworldJournalEntry["kind"],
  town: string,
  recordedAt: number,
): OverworldJournalEntry {
  return {
    id,
    kind,
    town,
    title: id,
    text: `${id} completed.`,
    recordedAt: timeLabel(recordedAt),
  };
}

function snapshot(
  journalEntries: OverworldJournalEntry[],
  minutes = 700,
): OverworldSessionSnapshot {
  return {
    version: OVERWORLD_SESSION_SAVE_VERSION,
    worldId: "new_york_overworld",
    worldHash: "a".repeat(64),
    currentId: "town_b",
    currentAreaId: null,
    minutes,
    supplies: 5,
    fatigue: 1,
    discoveredIds: ["town_a", "town_b"],
    visitedIds: ["town_a", "town_b"],
    currentAreaByTown: [],
    travelLog: [],
    journalEntries,
    resolvedEventIds: [],
    discoveredAreaIds: [],
    visitedAreaIds: [],
    discoveredJobIds: [],
    completedJobIds: [],
    discoveredSiteIds: [],
    discoveredQuestIds: [],
    startedQuestIds: [],
    completedQuestIds: [],
    questOutcomes: [],
    exploredSiteIds: [],
    regionRenown: [],
    completedRegionalArcIds: [],
    pendingRoadEncounter: null,
    journey: createInitialJourneyContractSnapshot(),
  };
}

function sources(
  overrides: Partial<OverworldJournalTimelineSourceIndex> = {},
): OverworldJournalTimelineSourceIndex {
  return {
    arcIds: new Set(["arc_north"]),
    arcRegionNames: new Map([["arc_north", "North"]]),
    areaIds: new Set(["area_b"]),
    areaTownNames: new Map([["area_b", "Town B"]]),
    characterIds: new Set(["char_1"]),
    characterTownNames: new Map([["char_1", "Town B"]]),
    charactersById: new Map([["char_1", character("char_1", "town_b", "area_b")]]),
    edgeIds: new Set(["road_a_b"]),
    eventIds: new Set(["event_1"]),
    eventTownNames: new Map([["event_1", "Town B"]]),
    eventsById: new Map([["event_1", event("event_1", "town_b", "area_b")]]),
    jobIds: new Set(),
    jobTownNames: new Map(),
    poiIds: new Set(["poi_1"]),
    poiTownNames: new Map([["poi_1", "Town B"]]),
    poisById: new Map([["poi_1", poi("poi_1", "town_b", "area_b")]]),
    questIds: new Set(),
    questTownNames: new Map(),
    regionNames: new Set(["North"]),
    siteIds: new Set(),
    siteTownNames: new Map(),
    townNames: new Set(["Town A", "Town B"]),
    travelLogArrivals: new Set(["road_a_b@620"]),
    travelLogTownByArrival: new Map([["road_a_b@620", "Town B"]]),
    ...overrides,
  };
}

describe("overworld snapshot journal timeline", () => {
  it("indexes journal proofs, resource entries, and local action entries", () => {
    const timeline = assertSnapshotTimeline(
      snapshot([
        journal("service:rest:630", "service", "Town B", 630),
        journal("road:road_a_b:620:press_on", "road", "Town B", 620),
        journal("resolve:event_1", "resolution", "Town B", 610),
        journal("investigate:event_1", "event", "Town B", 600),
        journal("talk:char_1", "contact", "Town B", 590),
        journal("scout:poi_1", "poi", "Town B", 580),
        journal("area:area_b", "area", "Town B", 570),
      ]),
      sources(),
    );

    expect([...timeline.localActionEntries.map(({ entry }) => entry.id)]).toEqual([
      "resolve:event_1",
      "investigate:event_1",
      "talk:char_1",
      "scout:poi_1",
      "area:area_b",
    ]);
    expect(timeline.progressSources.visitedAreaIds.has("area_b")).toBe(true);
    expect(timeline.progressSources.resolvedEventIds.has("event_1")).toBe(true);
    expect(timeline.roadJournalEntries[0]?.key).toBe("road_a_b@620");
    expect(timeline.serviceJournal.entries[0]?.parsed).toEqual({
      action: "rest",
      recordedAt: 630,
    });
    expect(timeline.eventResolutionProofs.scoutTimeByArea.get("area_b")).toBe(580);
    expect(timeline.eventResolutionProofs.contactTimeByArea.get("area_b")).toBe(590);
    expect(timeline.eventResolutionProofs.resolutionTimeByTown.get("town_b")).toBe(610);
    expect(timeline.eventResolutionProofs.recordedAtById.get("investigate:event_1")).toBe(600);
  });

  it("rejects duplicate and out-of-order journal entries", () => {
    expect(() =>
      assertSnapshotTimeline(
        snapshot([
          journal("resolve:event_1", "resolution", "Town B", 610),
          journal("resolve:event_1", "resolution", "Town B", 600),
        ]),
        sources(),
      ),
    ).toThrow(/duplicate journal entry/);

    expect(() =>
      assertSnapshotTimeline(
        snapshot([
          journal("scout:poi_1", "poi", "Town B", 580),
          journal("talk:char_1", "contact", "Town B", 590),
        ]),
        sources(),
      ),
    ).toThrow(/newest-first/);
  });

  it("rejects forged service time and detached road journal entries", () => {
    expect(() =>
      assertSnapshotTimeline(
        snapshot([journal("service:rest:630", "service", "Town B", 620)]),
        sources(),
      ),
    ).toThrow(/service entry time/);

    expect(() =>
      assertSnapshotTimeline(
        snapshot([journal("road:road_a_b:620:press_on", "road", "Town B", 620)]),
        sources({ travelLogArrivals: new Set() }),
      ),
    ).toThrow(/no matching travel log/);
  });

  it("rejects journal entries bound to the wrong source place", () => {
    expect(() =>
      assertSnapshotTimeline(snapshot([journal("area:area_b", "area", "Town A", 570)]), sources()),
    ).toThrow(/expected "Town B"/);
  });

  it("extracts journal source ids by kind prefix", () => {
    const entry = journal("resolve:event_1", "resolution", "Town B", 610);

    expect(journalSourceId(entry, "resolve:")).toBe("event_1");
    expect(journalSourceId(entry, "scout:")).toBeNull();
  });
});
