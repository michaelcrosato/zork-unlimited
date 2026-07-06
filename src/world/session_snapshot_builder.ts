import { sortedNumberMap, sortedStringMap, sortedStringSet } from "./session_collections.js";
import {
  OVERWORLD_SESSION_SAVE_VERSION,
  cloneJournalEntries,
  snapshotTravelLogEntries,
  type OverworldJournalEntry,
  type OverworldPendingRoadEncounter,
  type OverworldSessionSnapshot,
  type TravelLogEntry,
} from "./session_snapshot.js";

export type OverworldSessionSnapshotBuildState = {
  worldId: string;
  worldHash: string;
  currentId: string;
  currentAreaId: string | null;
  minutes: number;
  supplies: number;
  fatigue: number;
  discoveredIds: ReadonlySet<string>;
  visitedIds: ReadonlySet<string>;
  currentAreaByTown: ReadonlyMap<string, string>;
  travelLog: readonly TravelLogEntry[];
  journalEntries: readonly OverworldJournalEntry[];
  resolvedEventIds: ReadonlySet<string>;
  discoveredAreaIds: ReadonlySet<string>;
  visitedAreaIds: ReadonlySet<string>;
  discoveredJobIds: ReadonlySet<string>;
  completedJobIds: ReadonlySet<string>;
  discoveredSiteIds: ReadonlySet<string>;
  discoveredQuestIds: ReadonlySet<string>;
  startedQuestIds: ReadonlySet<string>;
  completedQuestIds: ReadonlySet<string>;
  exploredSiteIds: ReadonlySet<string>;
  regionRenown: ReadonlyMap<string, number>;
  completedRegionalArcIds: ReadonlySet<string>;
  pendingRoadEncounter: OverworldPendingRoadEncounter | null;
};

export function buildOverworldSessionSnapshot(
  state: OverworldSessionSnapshotBuildState,
): OverworldSessionSnapshot {
  return {
    version: OVERWORLD_SESSION_SAVE_VERSION,
    worldId: state.worldId,
    worldHash: state.worldHash,
    currentId: state.currentId,
    currentAreaId: state.currentAreaId,
    minutes: state.minutes,
    supplies: state.supplies,
    fatigue: state.fatigue,
    discoveredIds: sortedStringSet(state.discoveredIds),
    visitedIds: sortedStringSet(state.visitedIds),
    currentAreaByTown: sortedStringMap(state.currentAreaByTown),
    travelLog: snapshotTravelLogEntries(state.travelLog),
    journalEntries: cloneJournalEntries(state.journalEntries),
    resolvedEventIds: sortedStringSet(state.resolvedEventIds),
    discoveredAreaIds: sortedStringSet(state.discoveredAreaIds),
    visitedAreaIds: sortedStringSet(state.visitedAreaIds),
    discoveredJobIds: sortedStringSet(state.discoveredJobIds),
    completedJobIds: sortedStringSet(state.completedJobIds),
    discoveredSiteIds: sortedStringSet(state.discoveredSiteIds),
    discoveredQuestIds: sortedStringSet(state.discoveredQuestIds),
    startedQuestIds: sortedStringSet(state.startedQuestIds),
    completedQuestIds: sortedStringSet(state.completedQuestIds),
    exploredSiteIds: sortedStringSet(state.exploredSiteIds),
    regionRenown: sortedNumberMap(state.regionRenown),
    completedRegionalArcIds: sortedStringSet(state.completedRegionalArcIds),
    pendingRoadEncounter: state.pendingRoadEncounter
      ? { edgeId: state.pendingRoadEncounter.edgeId }
      : null,
  };
}
