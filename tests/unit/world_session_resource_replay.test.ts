import { describe, expect, it } from "vitest";
import type { OverworldEdge, OverworldRoadEvent } from "../../src/world/overworld.js";
import {
  assertSnapshotResourceReplay,
  recordRoadJournalResolution,
  recordServiceJournalReplay,
  roadJournalResolutionIndex,
  type OverworldRoadJournalResolutionEntry,
  type OverworldServiceJournalReplayEntry,
} from "../../src/world/session_resource_replay.js";
import {
  OVERWORLD_SESSION_SAVE_VERSION,
  type OverworldJournalEntry,
  type OverworldSessionSnapshot,
  type TravelLogEntrySnapshot,
} from "../../src/world/session_snapshot.js";
import { snapshotTravelTimelineIndex } from "../../src/world/session_snapshot_timeline.js";

function edge(overrides: Partial<OverworldEdge> = {}): OverworldEdge {
  return {
    id: "road:a-b",
    from: "town_a",
    to: "town_b",
    route: "Test Road",
    road_class: "state_route",
    distance_mi: 10,
    travel_minutes: 60,
    ...overrides,
  };
}

function roadEvent(overrides: Partial<OverworldRoadEvent> = {}): OverworldRoadEvent {
  return {
    id: "road_event:a-b",
    edge: "road:a-b",
    title: "Blocked road",
    risk: "medium",
    summary: "A test road event.",
    ...overrides,
  };
}

function travelEntry(overrides: Partial<TravelLogEntrySnapshot> = {}): TravelLogEntrySnapshot {
  return {
    edgeId: "road:a-b",
    fromId: "town_a",
    toId: "town_b",
    delayMinutes: 0,
    minutes: 60,
    arrivedAt: 540,
    suppliesUsed: 1,
    suppliesAfter: 5,
    fatigueGained: 2,
    fatigueAfter: 2,
    ...overrides,
  };
}

function journalEntry(
  kind: OverworldJournalEntry["kind"],
  id: string,
  recordedAt = "Day 1, 08:00",
): OverworldJournalEntry {
  return {
    id,
    kind,
    town: "Town",
    title: "Title",
    text: "Text",
    recordedAt,
  };
}

function snapshot(
  travelLog: TravelLogEntrySnapshot[],
  overrides: Partial<OverworldSessionSnapshot> = {},
): OverworldSessionSnapshot {
  return {
    version: OVERWORLD_SESSION_SAVE_VERSION,
    worldId: "new_york_overworld",
    worldHash: "a".repeat(64),
    currentId: "town_b",
    currentAreaId: null,
    minutes: 540,
    supplies: 5,
    fatigue: 2,
    discoveredIds: ["town_a", "town_b"],
    visitedIds: ["town_a", "town_b"],
    currentAreaByTown: [],
    travelLog,
    journalEntries: [],
    resolvedEventIds: [],
    discoveredAreaIds: [],
    visitedAreaIds: [],
    discoveredJobIds: [],
    completedJobIds: [],
    discoveredSiteIds: [],
    discoveredQuestIds: [],
    startedQuestIds: [],
    completedQuestIds: [],
    exploredSiteIds: [],
    regionRenown: [],
    completedRegionalArcIds: [],
    pendingRoadEncounter: null,
    ...overrides,
  };
}

function timeline(snapshotValue: OverworldSessionSnapshot) {
  return snapshotTravelTimelineIndex(snapshotValue, (townId) => townId, "town_a");
}

function sources(roadEvents: readonly OverworldRoadEvent[] = []) {
  return {
    edgesById: new Map([["road:a-b", edge()]]),
    roadEventsByEdgeId: new Map(roadEvents.map((event) => [event.edge, event])),
  };
}

describe("overworld snapshot resource replay", () => {
  it("accepts a coherent travel-only resource replay", () => {
    const snapshotValue = snapshot([travelEntry()]);
    const travelTimeline = timeline(snapshotValue);
    const roadJournal = roadJournalResolutionIndex(
      sources(),
      { roadJournalEntries: [] },
      travelTimeline,
      null,
    );

    expect(() =>
      assertSnapshotResourceReplay(
        snapshotValue,
        sources(),
        travelTimeline,
        roadJournal,
        { entries: [] },
        { entries: [] },
      ),
    ).not.toThrow();
  });

  it("rejects forged travel resource transitions", () => {
    const snapshotValue = snapshot(
      [
        travelEntry({
          suppliesAfter: 4,
        }),
      ],
      {
        supplies: 4,
      },
    );
    const travelTimeline = timeline(snapshotValue);
    const roadJournal = roadJournalResolutionIndex(
      sources(),
      { roadJournalEntries: [] },
      travelTimeline,
      null,
    );

    expect(() =>
      assertSnapshotResourceReplay(
        snapshotValue,
        sources(),
        travelTimeline,
        roadJournal,
        { entries: [] },
        { entries: [] },
      ),
    ).toThrow(/supplies after.*resource replay/);
  });

  it("requires road-event travel to have a road journal resolution unless still pending", () => {
    const snapshotValue = snapshot([travelEntry({ fatigueGained: 3, fatigueAfter: 3 })], {
      fatigue: 3,
    });
    const travelTimeline = timeline(snapshotValue);
    const missingResolution = roadJournalResolutionIndex(
      sources([roadEvent()]),
      { roadJournalEntries: [] },
      travelTimeline,
      null,
    );
    const pendingResolution = roadJournalResolutionIndex(
      sources([roadEvent()]),
      { roadJournalEntries: [] },
      travelTimeline,
      { edgeId: "road:a-b" },
    );

    expect([...missingResolution.requiredKeys]).toEqual(["road:a-b@540"]);
    expect(() =>
      assertSnapshotResourceReplay(
        snapshotValue,
        sources([roadEvent()]),
        travelTimeline,
        missingResolution,
        { entries: [] },
        { entries: [] },
      ),
    ).toThrow(/missing a journal resolution/);
    expect([...pendingResolution.requiredKeys]).toEqual([]);
  });

  it("treats explicit null road event ids as suppressed plain travel", () => {
    const snapshotValue = snapshot([travelEntry({ roadEventId: null })]);
    const travelTimeline = timeline(snapshotValue);
    const roadJournal = roadJournalResolutionIndex(
      sources([roadEvent()]),
      { roadJournalEntries: [] },
      travelTimeline,
      null,
    );

    expect([...roadJournal.requiredKeys]).toEqual([]);
    expect(() =>
      assertSnapshotResourceReplay(
        snapshotValue,
        sources([roadEvent()]),
        travelTimeline,
        roadJournal,
        { entries: [] },
        { entries: [] },
      ),
    ).not.toThrow();
  });

  it("replays road encounter and rest service costs in chronological order", () => {
    const snapshotValue = snapshot([travelEntry({ fatigueGained: 3, fatigueAfter: 3 })], {
      minutes: 770,
      fatigue: 0,
    });
    const travelTimeline = timeline(snapshotValue);
    const roadResolution: OverworldRoadJournalResolutionEntry = {
      entry: journalEntry("road", "road:road:a-b:540:cautious_scout"),
      key: "road:a-b@540",
      parsed: {
        edgeId: "road:a-b",
        arrivedAt: 540,
        strategy: "cautious_scout",
      },
      recordedAt: 590,
    };
    const roadJournal = roadJournalResolutionIndex(
      sources([roadEvent()]),
      { roadJournalEntries: [roadResolution] },
      travelTimeline,
      null,
    );
    const serviceJournal = {
      entries: [
        {
          entry: journalEntry("service", "service:rest:770"),
          parsed: { action: "rest" as const, recordedAt: 770 },
          recordedAt: 770,
        },
      ],
    };

    expect(() =>
      assertSnapshotResourceReplay(
        snapshotValue,
        sources([roadEvent()]),
        travelTimeline,
        roadJournal,
        serviceJournal,
        { entries: [] },
      ),
    ).not.toThrow();
  });

  it("rejects quest completion journals recorded before enough time elapsed", () => {
    const forgedEarlyCompletion = snapshot([], {
      minutes: 540,
      supplies: 6,
      fatigue: 0,
    });
    const travelTimeline = timeline(forgedEarlyCompletion);
    const roadJournal = roadJournalResolutionIndex(
      sources(),
      { roadJournalEntries: [] },
      travelTimeline,
      null,
    );
    const localActionJournal = {
      entries: [
        {
          entry: journalEntry("quest_done", "quest_done:quest_a", "Day 1, 09:00"),
          recordedAt: 540,
          duration: 140,
        },
      ],
    };

    expect(() =>
      assertSnapshotResourceReplay(
        forgedEarlyCompletion,
        sources(),
        travelTimeline,
        roadJournal,
        { entries: [] },
        localActionJournal,
      ),
    ).toThrow(/quest_done.*before enough clock time elapsed/);
  });

  it("records road and service replay entries from journal rows", () => {
    const roadEntries: OverworldRoadJournalResolutionEntry[] = [];
    const serviceEntries: OverworldServiceJournalReplayEntry[] = [];

    recordRoadJournalResolution(
      roadEntries,
      journalEntry("road", "road:road:a-b:540:press_on"),
      550,
    );
    recordServiceJournalReplay(
      serviceEntries,
      journalEntry("service", "service:resupply:600"),
      600,
    );

    expect(roadEntries[0]?.key).toBe("road:a-b@540");
    expect(roadEntries[0]?.parsed.strategy).toBe("press_on");
    expect(serviceEntries[0]?.parsed).toEqual({ action: "resupply", recordedAt: 600 });
  });
});
