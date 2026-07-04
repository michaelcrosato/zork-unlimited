import type {
  OverworldPendingRoadEncounter,
  OverworldSessionSnapshot,
  TravelLogEntry,
} from "./session_snapshot.js";
import { assertKnownIds, assertUniqueTupleMap } from "./session_collections.js";
import { assertSnapshotTimeline } from "./session_journal_timeline.js";
import {
  assertSnapshotEventResolutionProofs,
  assertSnapshotRegionalArcCompletionProofs,
} from "./session_event_resolution.js";
import {
  assertSnapshotDiscoveredAreaCountReplay,
  assertSnapshotDiscoveredLocalSourceCountReplay,
  assertSnapshotDiscoveryLocality,
  assertSnapshotLocalActionDiscoveryChronology,
  assertSnapshotLocalActionJournalReachability,
  localActionJournalReplayIndex,
} from "./session_local_action_journal.js";
import type { OverworldSnapshotManifestIndex } from "./session_manifest_index.js";
import {
  assertSnapshotProgressJournalBindings,
  assertStringSetSubset,
  type OverworldProgressJournalSourceIndex,
} from "./session_progress_journal.js";
import { assertSnapshotRegionRenown } from "./session_region_renown.js";
import {
  assertSnapshotResourceReplay,
  roadJournalResolutionIndex,
} from "./session_resource_replay.js";
import {
  assertSnapshotCurrentAreaReachability,
  assertSnapshotCurrentAreaMapBindings,
  assertSnapshotCurrentAreaMapExact,
  assertSnapshotCurrentLocationManifestBinding,
  assertSnapshotCurrentTownReachability,
  assertSnapshotDiscoveredAreaPrefix,
  assertSnapshotDiscoveredLocalSourcePrefixes,
  assertSnapshotDiscoveredTownFrontier,
  assertSnapshotTravelPathContinuity,
  assertSnapshotVisitedTownTravelProof,
} from "./session_snapshot_proofs.js";
import { snapshotTravelTimelineIndex } from "./session_snapshot_timeline.js";
import { restoreOverworldPendingRoadEncounter } from "./session_road_encounters.js";
import { restoreOverworldTravelLogEntries } from "./session_travel_log.js";

export type OverworldSessionSnapshotRestorePlan = {
  currentAreaByTown: ReadonlyMap<string, string>;
  pendingRoadEncounter: OverworldPendingRoadEncounter | null;
  regionRenown: ReadonlyMap<string, number>;
  travelLog: readonly TravelLogEntry[];
};

export function planOverworldSessionSnapshotRestore(args: {
  indexes: OverworldSnapshotManifestIndex;
  snapshot: OverworldSessionSnapshot;
  startTownId: string;
  worldHash: string;
  worldId: string;
}): OverworldSessionSnapshotRestorePlan {
  const { indexes, snapshot, startTownId, worldHash, worldId } = args;
  if (snapshot.worldId !== worldId) {
    throw new Error(
      `Overworld session snapshot is for world "${snapshot.worldId}", not "${worldId}".`,
    );
  }
  if (snapshot.worldHash !== worldHash) {
    throw new Error("Overworld session snapshot was made against a different world manifest.");
  }

  const travelTimeline = snapshotTravelTimelineIndex(
    snapshot,
    indexes.townNameForSource,
    startTownId,
  );

  assertSnapshotCurrentLocationManifestBinding(snapshot, indexes);

  const discoveredTownIds = assertKnownIds(
    "discovered town id",
    snapshot.discoveredIds,
    indexes.nodeIds,
  );
  const visitedTownIds = assertKnownIds("visited town id", snapshot.visitedIds, indexes.nodeIds);
  const discoveredAreaIds = assertKnownIds(
    "discovered area id",
    snapshot.discoveredAreaIds,
    indexes.areaIds,
  );
  const visitedAreaIds = assertKnownIds(
    "visited area id",
    snapshot.visitedAreaIds,
    indexes.areaIds,
  );
  const discoveredJobIds = assertKnownIds(
    "discovered job id",
    snapshot.discoveredJobIds,
    indexes.jobIds,
  );
  const completedJobIds = assertKnownIds(
    "completed job id",
    snapshot.completedJobIds,
    indexes.jobIds,
  );
  const discoveredSiteIds = assertKnownIds(
    "discovered site id",
    snapshot.discoveredSiteIds,
    indexes.siteIds,
  );
  const exploredSiteIds = assertKnownIds(
    "explored site id",
    snapshot.exploredSiteIds,
    indexes.siteIds,
  );
  const discoveredQuestIds = assertKnownIds(
    "discovered quest id",
    snapshot.discoveredQuestIds,
    indexes.questIds,
  );
  const startedQuestIds = assertKnownIds(
    "started quest id",
    snapshot.startedQuestIds,
    indexes.questIds,
  );
  const completedQuestIds = assertKnownIds(
    "completed quest id",
    snapshot.completedQuestIds,
    indexes.questIds,
  );
  const resolvedEventIds = assertKnownIds(
    "resolved event id",
    snapshot.resolvedEventIds,
    indexes.eventIds,
  );
  const completedRegionalArcIds = assertKnownIds(
    "completed regional arc id",
    snapshot.completedRegionalArcIds,
    indexes.arcIds,
  );
  const progressStateIds: OverworldProgressJournalSourceIndex = {
    completedJobIds,
    completedQuestIds,
    completedRegionalArcIds,
    exploredSiteIds,
    resolvedEventIds,
    startedQuestIds,
    visitedAreaIds,
  };
  const currentAreaByTown = assertUniqueTupleMap("area-map town", snapshot.currentAreaByTown);
  const regionRenown = assertUniqueTupleMap("renown region", snapshot.regionRenown);
  const journalTimeline = assertSnapshotTimeline(snapshot, {
    ...indexes,
    travelLogArrivals: travelTimeline.arrivals,
    travelLogTownByArrival: travelTimeline.townByArrival,
  });
  const roadJournal = roadJournalResolutionIndex(
    indexes,
    journalTimeline,
    travelTimeline,
    snapshot.pendingRoadEncounter,
  );
  const serviceJournal = journalTimeline.serviceJournal;

  assertSnapshotCurrentTownReachability(snapshot.currentId, discoveredTownIds, visitedTownIds);
  const townVisitMinutes = assertSnapshotVisitedTownTravelProof(visitedTownIds, travelTimeline);
  assertSnapshotTravelPathContinuity(snapshot.currentId, startTownId, travelTimeline);
  assertSnapshotDiscoveredTownFrontier(discoveredTownIds, indexes.roadExitsByTown, visitedTownIds);
  assertStringSetSubset(
    "visited town id",
    visitedTownIds,
    "discovered town ids",
    discoveredTownIds,
  );
  assertStringSetSubset(
    "visited area id",
    visitedAreaIds,
    "discovered area ids",
    discoveredAreaIds,
  );
  assertStringSetSubset(
    "completed job id",
    completedJobIds,
    "discovered job ids",
    discoveredJobIds,
  );
  assertStringSetSubset(
    "explored site id",
    exploredSiteIds,
    "discovered site ids",
    discoveredSiteIds,
  );
  assertSnapshotProgressJournalBindings(progressStateIds, journalTimeline.progressSources);
  assertSnapshotRegionRenown(
    regionRenown,
    progressStateIds,
    {
      ...indexes,
      travelLogByArrival: travelTimeline.byArrival,
    },
    roadJournal,
  );
  assertSnapshotCurrentAreaReachability(snapshot.currentAreaId, discoveredAreaIds);
  const localActionJournalSources = {
    ...indexes,
    discoveredAreaIds,
    discoveredJobIds,
    discoveredQuestIds,
    discoveredSiteIds,
    townVisitMinutes,
    visitedTownIds,
  };
  const localActionJournal = localActionJournalReplayIndex(
    localActionJournalSources,
    journalTimeline,
  );
  assertSnapshotDiscoveredAreaPrefix(indexes.areasByTown, discoveredAreaIds, visitedTownIds);
  assertSnapshotDiscoveredLocalSourcePrefixes(localActionJournalSources, visitedTownIds);
  assertSnapshotCurrentAreaMapExact(
    snapshot.currentId,
    snapshot.currentAreaId,
    currentAreaByTown,
    indexes.areasByTown,
    visitedTownIds,
  );
  assertSnapshotCurrentAreaMapBindings(
    currentAreaByTown,
    indexes,
    visitedTownIds,
    discoveredAreaIds,
  );
  assertSnapshotDiscoveryLocality({
    ...indexes,
    completedQuestIds,
    discoveredAreaIds,
    discoveredJobIds,
    discoveredQuestIds,
    discoveredSiteIds,
    resolvedEventIds,
    startedQuestIds,
    visitedAreaIds,
    visitedTownIds,
  });
  assertSnapshotLocalActionJournalReachability(localActionJournal, localActionJournalSources);
  assertSnapshotLocalActionDiscoveryChronology(localActionJournal, localActionJournalSources);
  const eventResolutionJournal = journalTimeline.eventResolutionProofs;
  assertSnapshotEventResolutionProofs(resolvedEventIds, indexes, eventResolutionJournal);
  assertSnapshotRegionalArcCompletionProofs(
    indexes,
    eventResolutionJournal,
    completedRegionalArcIds,
  );
  assertSnapshotDiscoveredLocalSourceCountReplay(localActionJournalSources, localActionJournal);
  assertSnapshotDiscoveredAreaCountReplay(localActionJournalSources, localActionJournal);
  for (const [region] of regionRenown) {
    if (!indexes.regionNames.has(region)) {
      throw new Error(`Overworld session snapshot has unknown renown region "${region}".`);
    }
  }
  const pendingRoadEncounter = restoreOverworldPendingRoadEncounter(snapshot.pendingRoadEncounter, {
    currentId: snapshot.currentId,
    edgeIds: indexes.edgeIds,
    edgesById: indexes.edgesById,
    latestTravel: travelTimeline.latest,
    minutes: snapshot.minutes,
    nodesById: indexes.nodesById,
    roadEventsByEdgeId: indexes.roadEventsByEdgeId,
    roadJournal,
  });
  assertSnapshotResourceReplay(
    snapshot,
    indexes,
    travelTimeline,
    roadJournal,
    serviceJournal,
    localActionJournal,
  );

  return {
    currentAreaByTown,
    pendingRoadEncounter,
    regionRenown,
    travelLog: restoreOverworldTravelLogEntries(snapshot.travelLog, {
      edgesById: indexes.edgesById,
      nodesById: indexes.nodesById,
      roadEventsByEdgeId: indexes.roadEventsByEdgeId,
    }),
  };
}
