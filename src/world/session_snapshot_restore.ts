import type {
  OverworldJournalEntry,
  OverworldPendingRoadEncounter,
  OverworldSessionSnapshot,
  TravelLogEntry,
} from "./session_snapshot.js";
import { assertKnownIds, assertUniqueTupleMap, replaceStringSet } from "./session_collections.js";
import { assertSnapshotTimeline } from "./session_journal_timeline.js";
import { replaceOverworldJournalEntries } from "./session_journal_store.js";
import {
  assertSnapshotEventResolutionProofs,
  assertSnapshotRegionalArcCompletionProofs,
} from "./session_event_resolution.js";
import {
  assertSnapshotContactPresentationProofs,
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
import { cloneJourneyContractSnapshot, type JourneyContractSnapshot } from "./journey_contract.js";
import {
  assertJourneyCampaignGoalCompletionProof,
  assertJourneyCampaignJournalProof,
  assertJourneyCampaignQuestOutcome,
} from "./journey_campaign.js";

export type OverworldSessionSnapshotRestorePlan = {
  currentAreaByTown: ReadonlyMap<string, string>;
  pendingRoadEncounter: OverworldPendingRoadEncounter | null;
  questOutcomeIds: ReadonlyMap<string, string>;
  regionRenown: ReadonlyMap<string, number>;
  resolvedEventHomeIds: ReadonlySet<string>;
  travelLog: readonly TravelLogEntry[];
};

export type OverworldSessionSnapshotRestoreState = {
  completedJobIds: Set<string>;
  completedQuestIds: Set<string>;
  completedRegionalArcIds: Set<string>;
  currentAreaByTown: Map<string, string>;
  discoveredAreaIds: Set<string>;
  discoveredIds: Set<string>;
  discoveredJobIds: Set<string>;
  discoveredQuestIds: Set<string>;
  discoveredSiteIds: Set<string>;
  exploredSiteIds: Set<string>;
  journalEntries: OverworldJournalEntry[];
  journalEntriesById: Map<string, OverworldJournalEntry>;
  questOutcomeIds: Map<string, string>;
  regionRenown: Map<string, number>;
  resolvedEventIds: Set<string>;
  resolvedEventHomeIds: Set<string>;
  startedQuestIds: Set<string>;
  travelLog: TravelLogEntry[];
  visitedAreaIds: Set<string>;
  visitedIds: Set<string>;
};

export type OverworldAppliedSessionSnapshotRestore = {
  currentIdAfter: string;
  currentAreaIdAfter: string | null;
  minutesAfter: number;
  suppliesAfter: number;
  fatigueAfter: number;
  pendingRoadEncounterAfter: OverworldPendingRoadEncounter | null;
  journeyAfter: JourneyContractSnapshot;
};

function replaceStringMap(target: Map<string, string>, source: ReadonlyMap<string, string>): void {
  target.clear();
  for (const [key, value] of source) target.set(key, value);
}

function replaceNumberMap(target: Map<string, number>, source: ReadonlyMap<string, number>): void {
  target.clear();
  for (const [key, value] of source) target.set(key, value);
}

function replaceTravelLog(target: TravelLogEntry[], source: readonly TravelLogEntry[]): void {
  target.length = 0;
  for (const entry of source) target.push(entry);
}

export function applyOverworldSessionSnapshotRestore(
  state: OverworldSessionSnapshotRestoreState,
  snapshot: OverworldSessionSnapshot,
  plan: OverworldSessionSnapshotRestorePlan,
): OverworldAppliedSessionSnapshotRestore {
  replaceStringSet(state.discoveredIds, snapshot.discoveredIds);
  replaceStringSet(state.visitedIds, snapshot.visitedIds);
  replaceStringMap(state.currentAreaByTown, plan.currentAreaByTown);
  replaceTravelLog(state.travelLog, plan.travelLog);
  replaceOverworldJournalEntries(
    state.journalEntries,
    state.journalEntriesById,
    snapshot.journalEntries,
  );
  replaceStringSet(state.resolvedEventIds, snapshot.resolvedEventIds);
  replaceStringSet(state.discoveredAreaIds, snapshot.discoveredAreaIds);
  replaceStringSet(state.visitedAreaIds, snapshot.visitedAreaIds);
  replaceStringSet(state.discoveredJobIds, snapshot.discoveredJobIds);
  replaceStringSet(state.completedJobIds, snapshot.completedJobIds);
  replaceStringSet(state.discoveredSiteIds, snapshot.discoveredSiteIds);
  replaceStringSet(state.discoveredQuestIds, snapshot.discoveredQuestIds);
  replaceStringSet(state.startedQuestIds, snapshot.startedQuestIds);
  replaceStringSet(state.completedQuestIds, snapshot.completedQuestIds);
  replaceStringMap(state.questOutcomeIds, plan.questOutcomeIds);
  replaceStringSet(state.exploredSiteIds, snapshot.exploredSiteIds);
  replaceNumberMap(state.regionRenown, plan.regionRenown);
  replaceStringSet(state.completedRegionalArcIds, snapshot.completedRegionalArcIds);
  replaceStringSet(state.resolvedEventHomeIds, [...plan.resolvedEventHomeIds]);

  return {
    currentIdAfter: snapshot.currentId,
    currentAreaIdAfter: snapshot.currentAreaId,
    minutesAfter: snapshot.minutes,
    suppliesAfter: snapshot.supplies,
    fatigueAfter: snapshot.fatigue,
    pendingRoadEncounterAfter: plan.pendingRoadEncounter,
    journeyAfter: cloneJourneyContractSnapshot(snapshot.journey),
  };
}

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
  const questOutcomeIds = assertUniqueTupleMap("quest outcome", snapshot.questOutcomes);
  for (const [questId, endingId] of questOutcomeIds) {
    if (!indexes.questIds.has(questId)) {
      throw new Error(`Overworld session snapshot has outcome for unknown quest "${questId}".`);
    }
    if (!completedQuestIds.has(questId)) {
      throw new Error(
        `Overworld session snapshot quest outcome "${questId}" has no completed quest id.`,
      );
    }
    assertJourneyCampaignQuestOutcome(questId, endingId);
  }
  for (const questId of completedQuestIds) {
    if (!questOutcomeIds.has(questId)) {
      throw new Error(`Overworld session snapshot completed quest "${questId}" has no outcome.`);
    }
  }
  assertJourneyCampaignGoalCompletionProof({
    journey: snapshot.journey,
    completedQuestIds,
    startTownId,
  });
  const resolvedEventIds = assertKnownIds(
    "resolved event id",
    snapshot.resolvedEventIds,
    indexes.eventIds,
  );
  const resolvedEventHomeIds = resolvedOverworldEventHomeIds(resolvedEventIds, indexes.eventsById);
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
  assertJourneyCampaignJournalProof({
    journey: snapshot.journey,
    questOutcomeIds,
    journalEntries: snapshot.journalEntries,
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
  assertSnapshotContactPresentationProofs(localActionJournalSources, journalTimeline);
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
    activeGoalId: snapshot.journey.goal.id,
    completedQuestIds,
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
    questOutcomeIds,
    regionRenown,
    resolvedEventHomeIds,
    travelLog: restoreOverworldTravelLogEntries(snapshot.travelLog, {
      edgesById: indexes.edgesById,
      nodesById: indexes.nodesById,
      roadEventsByEdgeId: indexes.roadEventsByEdgeId,
    }),
  };
}

function resolvedOverworldEventHomeIds(
  resolvedEventIds: ReadonlySet<string>,
  eventsById: ReadonlyMap<string, { home: string }>,
): ReadonlySet<string> {
  const homeIds = new Set<string>();
  for (const eventId of resolvedEventIds) {
    const event = eventsById.get(eventId);
    if (!event) throw new Error(`Overworld session snapshot has unknown event "${eventId}".`);
    homeIds.add(event.home);
  }
  return homeIds;
}
