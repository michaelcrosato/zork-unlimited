import { describe, expect, it } from "vitest";
import type {
  OverworldJournalEntry,
  OverworldSessionSnapshot,
  TravelLogEntry,
} from "../../src/world/session_snapshot.js";
import { OVERWORLD_SESSION_SAVE_VERSION } from "../../src/world/session_snapshot.js";
import {
  applyOverworldSessionSnapshotRestore,
  type OverworldSessionSnapshotRestorePlan,
  type OverworldSessionSnapshotRestoreState,
} from "../../src/world/session_snapshot_restore.js";

function snapshot(overrides: Partial<OverworldSessionSnapshot> = {}): OverworldSessionSnapshot {
  return {
    version: OVERWORLD_SESSION_SAVE_VERSION,
    worldId: "world",
    worldHash: "0".repeat(64),
    currentId: "town_b",
    currentAreaId: "area_b",
    minutes: 620,
    supplies: 4,
    fatigue: 7,
    discoveredIds: ["town_a", "town_b"],
    visitedIds: ["town_b"],
    currentAreaByTown: [["town_b", "area_b"]],
    travelLog: [],
    journalEntries: [
      {
        id: "area:area_b",
        kind: "area",
        town: "Town B",
        title: "Mapped Town B",
        text: "Mapped the local area.",
        recordedAt: "Day 1, 10:20",
      },
    ],
    resolvedEventIds: ["event_b"],
    discoveredAreaIds: ["area_b"],
    visitedAreaIds: ["area_b"],
    discoveredJobIds: ["job_b"],
    completedJobIds: ["job_b"],
    discoveredSiteIds: ["site_b"],
    discoveredQuestIds: ["quest_b"],
    startedQuestIds: ["quest_b"],
    completedQuestIds: ["quest_b"],
    exploredSiteIds: ["site_b"],
    regionRenown: [["Region", 3]],
    completedRegionalArcIds: ["arc_b"],
    pendingRoadEncounter: null,
    ...overrides,
  };
}

function travelEntry(overrides: Partial<TravelLogEntry> = {}): TravelLogEntry {
  return {
    edgeId: "road:a-b",
    fromId: "town_a",
    toId: "town_b",
    from: "Town A",
    to: "Town B",
    route: "Test Road",
    distanceMi: 12,
    baseMinutes: 60,
    delayMinutes: 0,
    minutes: 60,
    arrivedAt: 620,
    suppliesUsed: 1,
    suppliesAfter: 4,
    fatigueGained: 2,
    fatigueAfter: 7,
    roadEvent: null,
    ...overrides,
  };
}

function restorePlan(
  overrides: Partial<OverworldSessionSnapshotRestorePlan> = {},
): OverworldSessionSnapshotRestorePlan {
  return {
    currentAreaByTown: new Map([["town_b", "area_b"]]),
    pendingRoadEncounter: null,
    regionRenown: new Map([["Region", 3]]),
    travelLog: [travelEntry()],
    ...overrides,
  };
}

function restoreState(
  overrides: Partial<OverworldSessionSnapshotRestoreState> = {},
): OverworldSessionSnapshotRestoreState {
  const staleJournalEntry: OverworldJournalEntry = {
    id: "stale",
    kind: "area",
    town: "Old Town",
    title: "Stale",
    text: "Old entry.",
    recordedAt: "Day 1, 08:00",
  };
  return {
    completedJobIds: new Set(["old_job"]),
    completedQuestIds: new Set(["old_quest"]),
    completedRegionalArcIds: new Set(["old_arc"]),
    currentAreaByTown: new Map([["old_town", "old_area"]]),
    discoveredAreaIds: new Set(["old_area"]),
    discoveredIds: new Set(["old_town"]),
    discoveredJobIds: new Set(["old_job"]),
    discoveredQuestIds: new Set(["old_quest"]),
    discoveredSiteIds: new Set(["old_site"]),
    exploredSiteIds: new Set(["old_site"]),
    journalEntries: [staleJournalEntry],
    journalEntriesById: new Map([[staleJournalEntry.id, staleJournalEntry]]),
    regionRenown: new Map([["Old Region", 99]]),
    resolvedEventIds: new Set(["old_event"]),
    startedQuestIds: new Set(["old_quest"]),
    travelLog: [travelEntry({ edgeId: "old_road" })],
    visitedAreaIds: new Set(["old_area"]),
    visitedIds: new Set(["old_town"]),
    ...overrides,
  };
}

describe("overworld session snapshot restore application", () => {
  it("replaces mutable runtime state from a validated restore plan", () => {
    const sourceSnapshot = snapshot();
    const plan = restorePlan();
    const state = restoreState();

    const applied = applyOverworldSessionSnapshotRestore(state, sourceSnapshot, plan);

    expect(applied).toEqual({
      currentIdAfter: "town_b",
      currentAreaIdAfter: "area_b",
      minutesAfter: 620,
      suppliesAfter: 4,
      fatigueAfter: 7,
      pendingRoadEncounterAfter: null,
    });
    expect([...state.discoveredIds]).toEqual(["town_a", "town_b"]);
    expect([...state.visitedIds]).toEqual(["town_b"]);
    expect([...state.currentAreaByTown]).toEqual([["town_b", "area_b"]]);
    expect(state.travelLog.map((entry) => entry.edgeId)).toEqual(["road:a-b"]);
    expect([...state.resolvedEventIds]).toEqual(["event_b"]);
    expect([...state.discoveredAreaIds]).toEqual(["area_b"]);
    expect([...state.visitedAreaIds]).toEqual(["area_b"]);
    expect([...state.discoveredJobIds]).toEqual(["job_b"]);
    expect([...state.completedJobIds]).toEqual(["job_b"]);
    expect([...state.discoveredSiteIds]).toEqual(["site_b"]);
    expect([...state.discoveredQuestIds]).toEqual(["quest_b"]);
    expect([...state.startedQuestIds]).toEqual(["quest_b"]);
    expect([...state.completedQuestIds]).toEqual(["quest_b"]);
    expect([...state.exploredSiteIds]).toEqual(["site_b"]);
    expect([...state.regionRenown]).toEqual([["Region", 3]]);
    expect([...state.completedRegionalArcIds]).toEqual(["arc_b"]);
    expect(state.journalEntries).toEqual(sourceSnapshot.journalEntries);
    expect(state.journalEntries[0]).not.toBe(sourceSnapshot.journalEntries[0]);
    expect(state.journalEntriesById.get("area:area_b")).toEqual(sourceSnapshot.journalEntries[0]);
    expect(state.journalEntriesById.has("stale")).toBe(false);
  });
});
