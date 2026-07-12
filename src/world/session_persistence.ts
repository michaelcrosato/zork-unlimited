import { buildOverworldSessionSnapshot } from "./session_snapshot_builder.js";
import type { JourneyContractSnapshot } from "./journey_contract.js";
import {
  applyOverworldSessionSnapshotRestore,
  planOverworldSessionSnapshotRestore,
  type OverworldAppliedSessionSnapshotRestore,
  type OverworldSessionSnapshotRestoreState,
} from "./session_snapshot_restore.js";
import type { OverworldSnapshotManifestIndex } from "./session_manifest_index.js";
import type {
  OverworldJournalEntry,
  OverworldPendingRoadEncounter,
  OverworldSessionSnapshot,
  TravelLogEntry,
} from "./session_snapshot.js";

export type OverworldSessionPersistenceState = OverworldSessionSnapshotRestoreState & {
  worldId: string;
  worldHash: string;
  currentId: string;
  currentAreaId: string | null;
  minutes: number;
  supplies: number;
  fatigue: number;
  pendingRoadEncounter: OverworldPendingRoadEncounter | null;
  journey: JourneyContractSnapshot;
  discoveredIds: Set<string>;
  visitedIds: Set<string>;
  currentAreaByTown: Map<string, string>;
  travelLog: TravelLogEntry[];
  journalEntries: OverworldJournalEntry[];
  resolvedEventIds: Set<string>;
};

export function buildOverworldSessionSnapshotFromState(
  state: OverworldSessionPersistenceState,
): OverworldSessionSnapshot {
  return buildOverworldSessionSnapshot({
    worldId: state.worldId,
    worldHash: state.worldHash,
    currentId: state.currentId,
    currentAreaId: state.currentAreaId,
    minutes: state.minutes,
    supplies: state.supplies,
    fatigue: state.fatigue,
    discoveredIds: state.discoveredIds,
    visitedIds: state.visitedIds,
    currentAreaByTown: state.currentAreaByTown,
    travelLog: state.travelLog,
    journalEntries: state.journalEntries,
    resolvedEventIds: state.resolvedEventIds,
    discoveredAreaIds: state.discoveredAreaIds,
    visitedAreaIds: state.visitedAreaIds,
    discoveredJobIds: state.discoveredJobIds,
    completedJobIds: state.completedJobIds,
    discoveredSiteIds: state.discoveredSiteIds,
    discoveredQuestIds: state.discoveredQuestIds,
    startedQuestIds: state.startedQuestIds,
    completedQuestIds: state.completedQuestIds,
    questOutcomes: state.questOutcomeIds,
    exploredSiteIds: state.exploredSiteIds,
    regionRenown: state.regionRenown,
    completedRegionalArcIds: state.completedRegionalArcIds,
    pendingRoadEncounter: state.pendingRoadEncounter,
    journey: state.journey,
  });
}

export function restoreOverworldSessionSnapshotIntoState(args: {
  indexes: OverworldSnapshotManifestIndex;
  snapshot: OverworldSessionSnapshot;
  startTownId: string;
  state: OverworldSessionSnapshotRestoreState;
  worldHash: string;
  worldId: string;
}): OverworldAppliedSessionSnapshotRestore {
  const restorePlan = planOverworldSessionSnapshotRestore({
    indexes: args.indexes,
    snapshot: args.snapshot,
    startTownId: args.startTownId,
    worldHash: args.worldHash,
    worldId: args.worldId,
  });

  return applyOverworldSessionSnapshotRestore(args.state, args.snapshot, restorePlan);
}
