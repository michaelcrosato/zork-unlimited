import type {
  OverworldJournalEntry,
  OverworldPendingRoadEncounter,
  OverworldSessionSnapshot,
  TravelLogEntry,
} from "./session_snapshot.js";
import {
  cloneCampaignCharacterState,
  createInitialCampaignCharacterState,
  serializeCampaignCharacterState,
  type CampaignCharacterState,
} from "./campaign_character_state.js";
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
import {
  questCampaignExportForEnding,
  questCompletionJournalEntryDraft,
  questCompletionMinutes,
  replayQuestCampaignConsequences,
} from "./session_quests.js";
import {
  openingRegistrationLegacyJournalDraft,
  openingRegistrationLegacyJournalEntry,
  openingRegistrationLegacySourceWorldHash,
  proveOpeningRegistrationJournal,
  type OpeningRegistrationJournalProof,
} from "./opening_registration_journal.js";
import { parseTimeLabel, timeLabel } from "./session_journal_codec.js";

export const OVERWORLD_PRE_CAMPAIGN_EXPORTS_WORLD_HASH =
  "39d32c027d2e826f476dd299bb95cc3911994ec92b4fbf297be8d1216e5b6151";
export const OVERWORLD_CAMPAIGN_EXPORTS_WORLD_HASH =
  "b9416e3c43d9d54085ed9465b4d875811daebaf9834793d3f4a1ffca93b486c4";
export const OVERWORLD_CAMPAIGN_IMPORTS_WORLD_HASH =
  "cad75dafc291709f1d5c756dd70dd1002260bb06ca87d8e1e90aaf905f5f05c7";
/** @deprecated Historical name retained for callers that identify the exports-era manifest. */
export const OVERWORLD_CAMPAIGN_EXPORTS_MIGRATION_TARGET_WORLD_HASH =
  OVERWORLD_CAMPAIGN_EXPORTS_WORLD_HASH;
// Updated whenever the trusted manifest changes. Prior hashes are accepted only
// when they migrate directly into this exact manifest revision.
export const OVERWORLD_OPENING_REGISTRATION_MIGRATION_TARGET_WORLD_HASH =
  "1d12330f65743a8a2c124f9dae3cf145e6fdcbca9ec59a4c699ecd8757e8e47b";
/** @deprecated Current target alias retained for existing callers. */
export const OVERWORLD_CAMPAIGN_IMPORTS_MIGRATION_TARGET_WORLD_HASH =
  OVERWORLD_OPENING_REGISTRATION_MIGRATION_TARGET_WORLD_HASH;

const OVERWORLD_OPENING_REGISTRATION_TRUSTED_PREDECESSOR_WORLD_HASHES: ReadonlySet<string> =
  new Set([
    OVERWORLD_PRE_CAMPAIGN_EXPORTS_WORLD_HASH,
    OVERWORLD_CAMPAIGN_EXPORTS_WORLD_HASH,
    OVERWORLD_CAMPAIGN_IMPORTS_WORLD_HASH,
  ]);

type OpeningRegistrationLegacyJournalProof = Readonly<{
  entry: OverworldJournalEntry;
  journalIndex: number;
  sourceWorldHash: string;
}>;

function proveOpeningRegistrationLegacyJournal(args: {
  completedQuestIds: ReadonlySet<string>;
  discoveredAreaIds: ReadonlySet<string>;
  indexes: OverworldSnapshotManifestIndex;
  journalEntries: readonly OverworldJournalEntry[];
  migratesTrustedWorldHash: boolean;
  registrationProof: OpeningRegistrationJournalProof;
  snapshot: OverworldSessionSnapshot;
  startedQuestIds: ReadonlySet<string>;
  visitedTownIds: ReadonlySet<string>;
}): OpeningRegistrationLegacyJournalProof | null {
  const markers = args.journalEntries
    .map((entry, journalIndex) => ({ entry, journalIndex }))
    .filter(({ entry }) => entry.kind === "registration_legacy");
  if (markers.length > 1) {
    throw new Error(
      "Overworld session snapshot must contain at most one legacy opening registration marker.",
    );
  }
  const marker = markers[0];
  if (!marker) return null;
  if (args.migratesTrustedWorldHash) {
    throw new Error(
      "Legacy overworld session snapshot has opening registration evidence from a later manifest.",
    );
  }
  if (args.registrationProof.offered) {
    throw new Error(
      "Overworld session snapshot cannot combine selected or pending registration with a legacy registration marker.",
    );
  }
  if (args.startedQuestIds.size === 0 && args.completedQuestIds.size === 0) {
    throw new Error(
      "Overworld session snapshot legacy registration marker has no earlier quest progress to grandfather.",
    );
  }

  const sourceWorldHash = openingRegistrationLegacySourceWorldHash(marker.entry.id);
  if (
    !sourceWorldHash ||
    !OVERWORLD_OPENING_REGISTRATION_TRUSTED_PREDECESSOR_WORLD_HASHES.has(sourceWorldHash)
  ) {
    throw new Error(
      `Overworld session snapshot legacy registration marker "${marker.entry.id}" has an untrusted source world hash.`,
    );
  }
  const expected = openingRegistrationLegacyJournalDraft(sourceWorldHash);
  if (marker.entry.title !== expected.title || marker.entry.text !== expected.text) {
    throw new Error(
      `Overworld session snapshot legacy registration marker "${marker.entry.id}" does not match its canonical copy.`,
    );
  }
  const boundary = marker.entry.registrationBoundary;
  if (!boundary) {
    throw new Error(
      "Overworld session snapshot legacy registration marker has no durable migration boundary.",
    );
  }
  if (
    !args.visitedTownIds.has(boundary.townId) ||
    marker.entry.town !== args.indexes.townNameForSource(boundary.townId) ||
    !args.discoveredAreaIds.has(boundary.areaId) ||
    args.indexes.areaHomes.get(boundary.areaId) !== boundary.townId ||
    boundary.minutes !== parseTimeLabel(marker.entry.recordedAt)
  ) {
    throw new Error(
      "Overworld session snapshot legacy registration marker does not match its migration location and time.",
    );
  }
  if (boundary.acceptedDecisions > args.snapshot.journey.acceptedDecisions) {
    throw new Error(
      "Overworld session snapshot legacy registration marker is ahead of its journey decision count.",
    );
  }
  if (
    boundary.acceptedDecisions === args.snapshot.journey.acceptedDecisions &&
    boundary.decisionProofHash !== args.snapshot.journey.decisionProof.hash
  ) {
    throw new Error(
      "Overworld session snapshot legacy registration marker does not match the current journey proof.",
    );
  }
  const hasOlderQuestEvidence = args.journalEntries.slice(marker.journalIndex + 1).some((entry) => {
    if (entry.kind === "quest") {
      return args.startedQuestIds.has(entry.id.slice("quest:".length));
    }
    if (entry.kind === "quest_done") {
      return args.completedQuestIds.has(entry.id.slice("quest_done:".length));
    }
    return false;
  });
  if (!hasOlderQuestEvidence) {
    throw new Error(
      "Overworld session snapshot legacy registration marker has no earlier quest journal evidence.",
    );
  }
  return Object.freeze({
    entry: marker.entry,
    journalIndex: marker.journalIndex,
    sourceWorldHash,
  });
}

export type OverworldSessionSnapshotRestorePlan = {
  characterAfter: CampaignCharacterState;
  currentAreaByTown: ReadonlyMap<string, string>;
  journalEntriesAfter: readonly OverworldJournalEntry[];
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
  characterAfter: CampaignCharacterState;
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
    plan.journalEntriesAfter,
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
    characterAfter: cloneCampaignCharacterState(plan.characterAfter),
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
  const migratesPreCampaignExportsWorldHash =
    snapshot.worldHash === OVERWORLD_PRE_CAMPAIGN_EXPORTS_WORLD_HASH &&
    worldHash === OVERWORLD_OPENING_REGISTRATION_MIGRATION_TARGET_WORLD_HASH;
  const migratesCampaignExportsWorldHash =
    snapshot.worldHash === OVERWORLD_CAMPAIGN_EXPORTS_WORLD_HASH &&
    worldHash === OVERWORLD_OPENING_REGISTRATION_MIGRATION_TARGET_WORLD_HASH;
  const migratesCampaignImportsWorldHash =
    snapshot.worldHash === OVERWORLD_CAMPAIGN_IMPORTS_WORLD_HASH &&
    worldHash === OVERWORLD_OPENING_REGISTRATION_MIGRATION_TARGET_WORLD_HASH;
  const migratesTrustedWorldHash =
    migratesPreCampaignExportsWorldHash ||
    migratesCampaignExportsWorldHash ||
    migratesCampaignImportsWorldHash;
  if (snapshot.worldHash !== worldHash && !migratesTrustedWorldHash) {
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
    const quest = indexes.questsById.get(questId);
    if (!quest) {
      throw new Error(`Overworld session snapshot has outcome for unknown quest "${questId}".`);
    }
    if (!completedQuestIds.has(questId)) {
      throw new Error(
        `Overworld session snapshot quest outcome "${questId}" has no completed quest id.`,
      );
    }
    if (questCampaignExportForEnding(quest, endingId) === null) {
      assertJourneyCampaignQuestOutcome(questId, endingId);
    }
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
  const registrationProof = proveOpeningRegistrationJournal({
    registration: indexes.openingRegistration,
    journalEntries: snapshot.journalEntries,
    expectedTown: indexes.openingRegistrationTownName,
  });
  if (migratesTrustedWorldHash && registrationProof.offered) {
    throw new Error(
      "Legacy overworld session snapshot has opening registration evidence from a later manifest.",
    );
  }
  const legacyRegistrationProof = proveOpeningRegistrationLegacyJournal({
    completedQuestIds,
    discoveredAreaIds,
    indexes,
    journalEntries: snapshot.journalEntries,
    migratesTrustedWorldHash,
    registrationProof,
    snapshot,
    startedQuestIds,
    visitedTownIds,
  });
  if (
    (startedQuestIds.size > 0 || completedQuestIds.size > 0) &&
    registrationProof.profile === null &&
    legacyRegistrationProof === null &&
    !migratesTrustedWorldHash
  ) {
    throw new Error(
      "Overworld session snapshot has quest progress without selected opening registration or trusted legacy provenance.",
    );
  }
  if (registrationProof.offered) {
    const offerBoundary = registrationProof.offerBoundary!;
    const selectionBoundary = registrationProof.selectionBoundary;
    if (selectionBoundary === null) {
      if (
        snapshot.currentId !== offerBoundary.townId ||
        snapshot.currentAreaId !== offerBoundary.areaId ||
        snapshot.minutes !== offerBoundary.minutes ||
        snapshot.startedQuestIds.length > 0 ||
        snapshot.completedQuestIds.length > 0 ||
        snapshot.journey.acceptedDecisions !== offerBoundary.acceptedDecisions ||
        snapshot.journey.decisionProof.hash !== offerBoundary.decisionProofHash
      ) {
        throw new Error(
          "Overworld session snapshot pending registration no longer matches its offered world and journey boundary.",
        );
      }
    } else {
      if (snapshot.journey.acceptedDecisions < selectionBoundary.acceptedDecisions) {
        throw new Error(
          "Overworld session snapshot registration selection is ahead of its journey decision count.",
        );
      }
      if (snapshot.journey.acceptedDecisions === selectionBoundary.acceptedDecisions) {
        const expectedLast = {
          number: selectionBoundary.acceptedDecisions,
          surface: "overworld" as const,
          actionId: `campaign_story:${indexes.openingRegistration!.id}:${registrationProof.profile!.id}`,
          reason: "situation_changed" as const,
        };
        if (
          snapshot.journey.decisionProof.hash !== selectionBoundary.decisionProofHash ||
          JSON.stringify(snapshot.journey.decisionProof.last) !== JSON.stringify(expectedLast)
        ) {
          throw new Error(
            "Overworld session snapshot registration selection does not match the current journey proof.",
          );
        }
      }
    }
  }
  assertSnapshotQuestCompletionOutcomeJournalProof({
    indexes,
    journalEntries: snapshot.journalEntries,
    questOutcomeIds,
  });
  const neutralCharacter = createInitialCampaignCharacterState();
  const initialCharacter = registrationProof.characterAtRegistration;
  const consequenceReplay = replayQuestCampaignConsequences({
    character: initialCharacter,
    questsById: indexes.questsById,
    questOutcomeIds,
  });
  const journalIndexById = new Map(
    snapshot.journalEntries.map((entry, index) => [entry.id, index] as const),
  );
  const characterAtCache = new Map<string, CampaignCharacterState>();
  const characterAt = (
    entry: OverworldJournalEntry,
    _recordedAt: number,
  ): CampaignCharacterState => {
    const cached = characterAtCache.get(entry.id);
    if (cached) return cached;
    const contactIndex = journalIndexById.get(entry.id);
    if (contactIndex === undefined) {
      throw new Error(
        `Overworld session snapshot cannot replay character state for unknown journal entry "${entry.id}".`,
      );
    }
    const registrationActive =
      registrationProof.journalIndex !== null && registrationProof.journalIndex > contactIndex;
    const questOutcomeIdsAt = new Map<string, string>();
    for (const [questId, endingId] of questOutcomeIds) {
      const completedIndex = journalIndexById.get(`quest_done:${questId}`);
      if (completedIndex !== undefined && completedIndex > contactIndex) {
        questOutcomeIdsAt.set(questId, endingId);
      }
    }
    const replayed = replayQuestCampaignConsequences({
      character: registrationActive ? initialCharacter : neutralCharacter,
      questsById: indexes.questsById,
      questOutcomeIds: questOutcomeIdsAt,
    }).characterAfter;
    characterAtCache.set(entry.id, replayed);
    return replayed;
  };
  const storedCharacter = serializeCampaignCharacterState(snapshot.character);
  const expectedCharacter = serializeCampaignCharacterState(consequenceReplay.characterAfter);
  if (migratesPreCampaignExportsWorldHash) {
    if (storedCharacter !== serializeCampaignCharacterState(neutralCharacter)) {
      throw new Error(
        "Legacy overworld session snapshot has campaign character state without replayable consequence proof.",
      );
    }
  } else if (storedCharacter !== expectedCharacter) {
    throw new Error(
      "Overworld session snapshot campaign character does not match replayed quest consequences.",
    );
  }
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
  assertSnapshotContactPresentationProofs(localActionJournalSources, journalTimeline, characterAt);
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

  let journalEntriesAfter: readonly OverworldJournalEntry[] = snapshot.journalEntries;
  if (migratesTrustedWorldHash && (startedQuestIds.size > 0 || completedQuestIds.size > 0)) {
    if (snapshot.currentAreaId === null) {
      throw new Error(
        "Legacy overworld session snapshot with quest progress has no current area for its registration migration boundary.",
      );
    }
    const marker = openingRegistrationLegacyJournalEntry({
      sourceWorldHash: snapshot.worldHash,
      town: indexes.townNameForSource(snapshot.currentId),
      recordedAt: timeLabel(snapshot.minutes),
      registrationBoundary: {
        acceptedDecisions: snapshot.journey.acceptedDecisions,
        decisionProofHash: snapshot.journey.decisionProof.hash,
        townId: snapshot.currentId,
        areaId: snapshot.currentAreaId,
        minutes: snapshot.minutes,
      },
    });
    journalEntriesAfter = Object.freeze([marker, ...snapshot.journalEntries]);
  }

  return {
    characterAfter: consequenceReplay.characterAfter,
    currentAreaByTown,
    journalEntriesAfter,
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

function assertSnapshotQuestCompletionOutcomeJournalProof(args: {
  indexes: OverworldSnapshotManifestIndex;
  journalEntries: readonly OverworldJournalEntry[];
  questOutcomeIds: ReadonlyMap<string, string>;
}): void {
  const journalEntriesById = new Map(args.journalEntries.map((entry) => [entry.id, entry]));
  for (const [questId, endingId] of args.questOutcomeIds) {
    const quest = args.indexes.questsById.get(questId);
    if (!quest) continue;
    const campaignExport = questCampaignExportForEnding(quest, endingId);
    if (!campaignExport) continue;
    const minutes = questCompletionMinutes(quest, args.indexes.areasById);
    const expected = questCompletionJournalEntryDraft({
      quest,
      endingTitle: campaignExport.ending_title,
      minutes,
      townName: args.indexes.questTownNames.get(questId) ?? quest.home,
    });
    const stored = journalEntriesById.get(expected.id);
    if (
      !stored ||
      stored.kind !== expected.kind ||
      stored.town !== expected.town ||
      stored.title !== expected.title ||
      stored.text !== expected.text
    ) {
      throw new Error(
        `Overworld session snapshot quest outcome "${questId}" is not bound to its canonical completion journal.`,
      );
    }
  }
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
