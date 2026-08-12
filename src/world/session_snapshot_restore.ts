/**
 * Structural validation and application for overworld snapshots.
 *
 * Save compatibility is governed by the snapshot/world schema version parsed in
 * session_snapshot.ts. The world content hash remains useful provenance, but a
 * content-only mismatch is not a migration trigger and never rewrites history.
 */
import { hashState } from "../core/hash.js";
import {
  cloneCampaignCharacterState,
  createInitialCampaignCharacterState,
  serializeCampaignCharacterState,
  type CampaignCharacterState,
} from "./campaign_character_state.js";
import {
  applyCampaignConsequences,
  type CampaignConsequenceEffect,
} from "./campaign_consequences.js";
import { campaignServiceLocalJobOptionKey } from "./campaign_service_rules.js";
import { campaignStoryChoiceRefKey } from "./campaign_story_choices.js";
import {
  assertJourneyCampaignGoalCompletionProof,
  assertJourneyCampaignJournalProof,
  assertJourneyCampaignQuestOutcome,
  journeyCampaignGoalDefinition,
  journeyCampaignSelectedStoryChoiceRefs,
  journeyCampaignStoryChoiceRefForGoal,
} from "./journey_campaign.js";
import {
  cloneJourneyContractSnapshot,
  INITIAL_JOURNEY_GOAL,
  type JourneyContractSnapshot,
} from "./journey_contract.js";
import { assertKnownIds, assertUniqueTupleMap, replaceStringSet } from "./session_collections.js";
import {
  assertSnapshotEventResolutionProofs,
  assertSnapshotRegionalArcCompletionProofs,
} from "./session_event_resolution.js";
import { assertSnapshotTimeline } from "./session_journal_timeline.js";
import { replaceOverworldJournalEntries } from "./session_journal_store.js";
import {
  assertSnapshotDiscoveredAreaCountReplay,
  assertSnapshotDiscoveredLocalSourceCountReplay,
  assertSnapshotContactPresentationProofs,
  assertSnapshotDiscoveryLocality,
  assertSnapshotLocalActionDiscoveryChronology,
  assertSnapshotLocalActionJournalReachability,
  localActionJournalReplayIndex,
} from "./session_local_action_journal.js";
import {
  localJobSceneOptionRequirementsMet,
  localJobSceneRequirementsMet,
  resolveLocalJobSceneOption,
} from "./local_job_scene.js";
import {
  localEventSceneOptionRequirementsMet,
  localEventSceneRequirementsMet,
  resolveLocalEventSceneOption,
} from "./local_event_scene.js";
import {
  replayOpeningDispatchChoices,
  type OpeningDispatchReplayChoice,
} from "./opening_dispatch_choice_replay.js";
import { formatOpeningAllyCost } from "./opening_ally.js";
import {
  openingAllyJournalDraft,
  proveOpeningAllyJournal,
  type OpeningAllyJournalProof,
} from "./opening_ally_journal.js";
import {
  openingLeadSourceOfferJournalId,
  proveOpeningLeadSourceJournal,
  type OpeningLeadSourceJournalProof,
} from "./opening_lead_source_journal.js";
import {
  proveOpeningPreparationJournal,
  type OpeningPreparationJournalProof,
} from "./opening_preparation_journal.js";
import {
  proveOpeningRegistrationJournal,
  type OpeningRegistrationJournalProof,
} from "./opening_registration_journal.js";
import {
  proveOpeningReliefAllocationJournal,
  type OpeningReliefAllocationJournalProof,
} from "./opening_relief_allocation_journal.js";
import {
  proveOpeningReliefOathJournal,
  type OpeningReliefOathJournalProof,
} from "./opening_relief_oath_journal.js";
import type { OverworldQuest } from "./overworld.js";
import { overworldQuestCampaignEffectsForCharacter } from "./overworld.js";
import { parseGoalPassageJourneyActionId } from "./session_goal_passage.js";
import { parseTimeLabel } from "./session_journal_codec.js";
import type { OverworldSnapshotManifestIndex } from "./session_manifest_index.js";
import {
  assertSnapshotProgressJournalBindings,
  assertStringSetSubset,
  type OverworldProgressJournalSourceIndex,
} from "./session_progress_journal.js";
import { assertSnapshotRegionRenown } from "./session_region_renown.js";
import {
  assertSnapshotResourceReplay,
  campaignStoryChoiceKeysProvenBeforeDecision,
  campaignWorldFactsProvenBeforeDecision,
  roadJournalResolutionIndex,
  type OverworldCampaignBoundaryReplayIndex,
  type OverworldCampaignBoundaryReplayProof,
} from "./session_resource_replay.js";
import { restoreOverworldPendingRoadEncounter } from "./session_road_encounters.js";
import {
  type OverworldJournalEntry,
  type OverworldJournalDecisionBoundary,
  type OverworldOpeningLeadSourceDecisionTrail,
  type OverworldPendingRoadEncounter,
  type OverworldSessionSnapshot,
  type TravelLogEntry,
  type TravelLogEntrySnapshot,
  cloneOpeningLeadSourceDecisionTrail,
} from "./session_snapshot.js";
import {
  assertSnapshotCurrentAreaMapBindings,
  assertSnapshotCurrentAreaMapExact,
  assertSnapshotCurrentAreaReachability,
  assertSnapshotCurrentLocationManifestBinding,
  assertSnapshotCurrentTownReachability,
  assertSnapshotDiscoveredAreaPrefix,
  assertSnapshotDiscoveredLocalSourcePrefixes,
  assertSnapshotDiscoveredTownFrontier,
  assertSnapshotTravelPathContinuity,
  assertSnapshotVisitedTownTravelProof,
} from "./session_snapshot_proofs.js";
import { snapshotTravelTimelineIndex } from "./session_snapshot_timeline.js";
import { restoreOverworldTravelLogEntries } from "./session_travel_log.js";
import {
  assertQuestDispatchLaunchSeal,
  deriveQuestDispatchWindow,
} from "./quest_dispatch_window.js";
import { questCampaignExportForEnding } from "./session_quests.js";
import type { JourneyDecisionProofLast } from "./journey_contract.js";

export const OVERWORLD_CONTENT_HASH_MISMATCH_WARNING =
  "This save was created from different authored world content; its prior journal is preserved, and current authored content governs future play.";

function proveOpeningDecisionTrail(args: {
  leadSourceProof: OpeningLeadSourceJournalProof;
  snapshot: OverworldSessionSnapshot;
  sourceSceneId: string | null;
}): OverworldOpeningLeadSourceDecisionTrail | null {
  const trail = args.snapshot.openingLeadSourceDecisionTrail;
  if (!args.leadSourceProof.offered) {
    if (trail) {
      throw new Error(
        "Overworld session snapshot has a lead-source decision trail without a matching source boundary.",
      );
    }
    return null;
  }
  if (!trail) {
    throw new Error(
      "Overworld session snapshot opening lead-source evidence has no replayable decision trail.",
    );
  }

  const boundary = args.leadSourceProof.offerBoundary;
  const expectedAnchorId =
    args.sourceSceneId === null ? null : openingLeadSourceOfferJournalId(args.sourceSceneId);
  if (
    !boundary ||
    expectedAnchorId === null ||
    trail.anchorId !== expectedAnchorId ||
    trail.baseAcceptedDecisions !== boundary.acceptedDecisions ||
    trail.baseDecisionProofHash !== boundary.decisionProofHash
  ) {
    throw new Error(
      "Overworld session snapshot lead-source decision trail does not match its journal boundary.",
    );
  }

  const decisionCount = args.snapshot.journey.acceptedDecisions - trail.baseAcceptedDecisions;
  if (decisionCount < 0 || trail.decisions.length !== decisionCount) {
    throw new Error(
      "Overworld session snapshot lead-source decision trail does not span the current journey decision count.",
    );
  }

  let proofHash = trail.baseDecisionProofHash;
  for (const [index, decision] of trail.decisions.entries()) {
    if (decision.number !== trail.baseAcceptedDecisions + index + 1) {
      throw new Error(
        "Overworld session snapshot lead-source decision trail is not a contiguous journey suffix.",
      );
    }
    proofHash = hashState({ previous: proofHash, ...decision });
  }
  const finalDecision = trail.decisions.at(-1) ?? null;
  if (
    proofHash !== args.snapshot.journey.decisionProof.hash ||
    (finalDecision !== null &&
      JSON.stringify(finalDecision) !== JSON.stringify(args.snapshot.journey.decisionProof.last))
  ) {
    throw new Error(
      "Overworld session snapshot lead-source decision trail does not reach the current journey proof.",
    );
  }

  if (args.leadSourceProof.option === null) {
    if (trail.decisions.length !== 0) {
      throw new Error(
        "Overworld session snapshot pending lead-source offer has decisions beyond its offer boundary.",
      );
    }
  } else {
    const firstDecision = trail.decisions[0];
    const expectedFirstDecision = {
      number: boundary.acceptedDecisions + 1,
      surface: "overworld" as const,
      actionId: `campaign_story:${args.sourceSceneId!}:${args.leadSourceProof.option.id}`,
      reason: "situation_changed" as const,
    };
    const firstDecisionHash = firstDecision
      ? hashState({ previous: trail.baseDecisionProofHash, ...firstDecision })
      : null;
    if (
      !firstDecision ||
      JSON.stringify(firstDecision) !== JSON.stringify(expectedFirstDecision) ||
      firstDecisionHash !== args.leadSourceProof.selectionBoundary?.decisionProofHash
    ) {
      throw new Error(
        "Overworld session snapshot selected lead source is not the first decision after its offer.",
      );
    }
  }

  return cloneOpeningLeadSourceDecisionTrail(trail);
}

type MutableCampaignTrailLocation = {
  townId: string | null;
  areaId: string | null;
  areaByTown: Map<string, string>;
  travelEntries: readonly TravelLogEntrySnapshot[];
  travelIndex: number;
  travelProofOpaque: boolean;
};

function invalidateCampaignTrailLocation(location: MutableCampaignTrailLocation): void {
  location.townId = null;
  location.areaId = null;
}

function replayCampaignTrailRoad(
  edgeId: string,
  location: MutableCampaignTrailLocation,
  indexes: OverworldSnapshotManifestIndex,
  actionId: string,
): void {
  const edge = indexes.edgesById.get(edgeId);
  if (!edge) {
    throw new Error(
      `Overworld session snapshot lead-source decision trail references unknown road "${edgeId}" in "${actionId}".`,
    );
  }
  if (location.townId === null) return;
  const destinationId =
    location.townId === edge.from ? edge.to : location.townId === edge.to ? edge.from : null;
  if (destinationId === null) {
    throw new Error(
      `Overworld session snapshot lead-source decision trail road "${edgeId}" is not reachable from "${location.townId}".`,
    );
  }
  if (!location.travelProofOpaque) {
    const travel = location.travelEntries[location.travelIndex];
    if (
      !travel ||
      travel.edgeId !== edge.id ||
      travel.fromId !== location.townId ||
      travel.toId !== destinationId
    ) {
      throw new Error(
        `Overworld session snapshot lead-source decision trail road "${edgeId}" does not match its travel log position.`,
      );
    }
    location.travelIndex += 1;
  }
  location.townId = destinationId;
  location.areaId =
    location.areaByTown.get(destinationId) ??
    indexes.areasByTown.get(destinationId)?.[0]?.id ??
    null;
  if (location.areaId !== null) location.areaByTown.set(destinationId, location.areaId);
}

function replayCampaignTrailLocationDecision(
  decision: JourneyDecisionProofLast,
  location: MutableCampaignTrailLocation,
  indexes: OverworldSnapshotManifestIndex,
): void {
  if (decision.surface !== "overworld") return;
  const areaPrefix = "move_area:";
  if (decision.actionId.startsWith(areaPrefix)) {
    if (decision.reason !== "movement") {
      throw new Error(
        `Overworld session snapshot lead-source decision trail area movement "${decision.actionId}" has the wrong decision reason.`,
      );
    }
    const edgeId = decision.actionId.slice(areaPrefix.length);
    const edge = indexes.areaEdgesById.get(edgeId);
    if (!edge) {
      throw new Error(
        `Overworld session snapshot lead-source decision trail references unknown area route "${edgeId}".`,
      );
    }
    if (location.townId === null || location.areaId === null) return;
    if (edge.home !== location.townId) {
      throw new Error(
        `Overworld session snapshot lead-source decision trail area route "${edgeId}" is not in town "${location.townId}".`,
      );
    }
    const destinationAreaId =
      location.areaId === edge.from_area
        ? edge.to_area
        : location.areaId === edge.to_area
          ? edge.from_area
          : null;
    if (destinationAreaId === null) {
      throw new Error(
        `Overworld session snapshot lead-source decision trail area route "${edgeId}" is not reachable from "${location.areaId}".`,
      );
    }
    location.areaId = destinationAreaId;
    location.areaByTown.set(location.townId, destinationAreaId);
    return;
  }

  const travelPrefix = "travel:";
  if (decision.actionId.startsWith(travelPrefix)) {
    if (decision.reason !== "movement") {
      throw new Error(
        `Overworld session snapshot lead-source decision trail road movement "${decision.actionId}" has the wrong decision reason.`,
      );
    }
    replayCampaignTrailRoad(
      decision.actionId.slice(travelPrefix.length),
      location,
      indexes,
      decision.actionId,
    );
    return;
  }

  if (!decision.actionId.startsWith("follow_current_goal:")) return;
  if (decision.reason !== "movement") {
    throw new Error(
      `Overworld session snapshot lead-source decision trail goal passage "${decision.actionId}" has the wrong decision reason.`,
    );
  }
  if (!decision.actionId.includes(":via:")) {
    invalidateCampaignTrailLocation(location);
    location.travelProofOpaque = true;
    return;
  }
  const passage = parseGoalPassageJourneyActionId(decision.actionId);
  if (!passage) {
    throw new Error(
      `Overworld session snapshot lead-source decision trail has malformed goal passage "${decision.actionId}".`,
    );
  }
  for (const edgeId of passage.edgeIds) {
    replayCampaignTrailRoad(edgeId, location, indexes, decision.actionId);
  }
}

function replayCampaignBoundaries(args: {
  indexes: OverworldSnapshotManifestIndex;
  leadSourceProof: OpeningLeadSourceJournalProof;
  trail: OverworldOpeningLeadSourceDecisionTrail | null;
  travelEntries: readonly TravelLogEntrySnapshot[];
}): Map<number, OverworldCampaignBoundaryReplayProof> {
  const byAcceptedDecisions = new Map<number, OverworldCampaignBoundaryReplayProof>();
  const boundary = args.leadSourceProof.offerBoundary;
  if (!args.trail || !boundary) return byAcceptedDecisions;
  if (args.indexes.areaHomes.get(boundary.areaId) !== boundary.townId) {
    throw new Error(
      "Overworld session snapshot lead-source decision trail starts outside its boundary town and area.",
    );
  }

  const location: MutableCampaignTrailLocation = {
    townId: boundary.townId,
    areaId: boundary.areaId,
    areaByTown: new Map([[boundary.townId, boundary.areaId]]),
    travelEntries: args.travelEntries.filter((entry) => entry.arrivedAt > boundary.minutes),
    travelIndex: 0,
    travelProofOpaque: false,
  };
  let proofHash = args.trail.baseDecisionProofHash;
  byAcceptedDecisions.set(args.trail.baseAcceptedDecisions, {
    decision: null,
    decisionProofHash: proofHash,
    townId: location.townId,
    areaId: location.areaId,
  });
  for (const decision of args.trail.decisions) {
    replayCampaignTrailLocationDecision(decision, location, args.indexes);
    proofHash = hashState({ previous: proofHash, ...decision });
    byAcceptedDecisions.set(decision.number, {
      decision,
      decisionProofHash: proofHash,
      townId: location.townId,
      areaId: location.areaId,
    });
  }
  if (!location.travelProofOpaque && location.travelIndex !== location.travelEntries.length) {
    throw new Error(
      "Overworld session snapshot travel log is not fully represented by its lead-source decision trail.",
    );
  }
  return byAcceptedDecisions;
}

type CampaignReplayMutation =
  | Readonly<{
      kind: "effects";
      journalIndex: number;
      effects: readonly CampaignConsequenceEffect[];
    }>
  | Readonly<{
      kind: "quest_completion";
      journalIndex: number;
      quest: OverworldQuest;
      endingId: string;
    }>;

type CurrentCampaignSnapshotProof = Readonly<{
  campaignBoundaries: OverworldCampaignBoundaryReplayIndex;
  characterAfter: CampaignCharacterState;
  characterAt: (entry: OverworldJournalEntry, recordedAt: number) => CampaignCharacterState;
  directQuestAnchorActivationOrdinals: ReadonlyMap<string, number>;
  openingLeadSourceDecisionTrail: OverworldOpeningLeadSourceDecisionTrail | null;
  questLaunchCharacters: ReadonlyMap<string, CampaignCharacterState>;
}>;

function assertCurrentOpeningStoryBoundary(args: {
  label: string;
  offered: boolean;
  offerBoundary: OverworldJournalDecisionBoundary | null;
  optionId: string | null;
  sceneId: string | null;
  selectionBoundary: OverworldJournalDecisionBoundary | null;
  snapshot: OverworldSessionSnapshot;
}): void {
  if (!args.offered) return;
  const offerBoundary = args.offerBoundary;
  if (!offerBoundary) {
    throw new Error(`Overworld session snapshot ${args.label} offer has no decision boundary.`);
  }
  if (args.selectionBoundary === null) {
    if (
      args.snapshot.currentId !== offerBoundary.townId ||
      args.snapshot.currentAreaId !== offerBoundary.areaId ||
      args.snapshot.minutes !== offerBoundary.minutes ||
      args.snapshot.journey.acceptedDecisions !== offerBoundary.acceptedDecisions ||
      args.snapshot.journey.decisionProof.hash !== offerBoundary.decisionProofHash
    ) {
      throw new Error(
        `Overworld session snapshot pending ${args.label} no longer matches its offered world and journey boundary.`,
      );
    }
    return;
  }
  const selectionBoundary = args.selectionBoundary;
  if (args.snapshot.journey.acceptedDecisions < selectionBoundary.acceptedDecisions) {
    throw new Error(
      `Overworld session snapshot ${args.label} selection is ahead of its journey decision count.`,
    );
  }
  if (args.snapshot.journey.acceptedDecisions !== selectionBoundary.acceptedDecisions) return;
  const expectedLast =
    args.sceneId === null || args.optionId === null
      ? null
      : {
          number: selectionBoundary.acceptedDecisions,
          surface: "overworld" as const,
          actionId: `campaign_story:${args.sceneId}:${args.optionId}`,
          reason: "situation_changed" as const,
        };
  if (
    expectedLast === null ||
    args.snapshot.journey.decisionProof.hash !== selectionBoundary.decisionProofHash ||
    JSON.stringify(args.snapshot.journey.decisionProof.last) !== JSON.stringify(expectedLast)
  ) {
    throw new Error(
      `Overworld session snapshot ${args.label} selection does not match the current journey proof.`,
    );
  }
}

function assertCurrentQuestStartJournal(args: {
  boundaryProofs: ReadonlyMap<number, OverworldCampaignBoundaryReplayProof>;
  entry: OverworldJournalEntry;
  indexes: OverworldSnapshotManifestIndex;
  journey: OverworldSessionSnapshot["journey"];
  quest: OverworldQuest;
}): readonly CampaignConsequenceEffect[] {
  const proof = args.entry.questStartProof;
  if (!proof || proof.kind !== "approach" || !args.quest.launch) {
    throw new Error(
      `Overworld session snapshot quest launch "${args.quest.id}" lacks a persisted approach or legacy proof.`,
    );
  }
  const option = args.quest.launch.options.find((candidate) => candidate.id === proof.approachId);
  if (!option) {
    throw new Error(
      `Overworld session snapshot quest launch "${args.quest.id}" references unknown approach "${proof.approachId}".`,
    );
  }
  const expectedTown = args.indexes.questTownNames.get(args.quest.id) ?? args.quest.home;
  if (
    args.entry.id !== `quest:${args.quest.id}` ||
    args.entry.kind !== "quest" ||
    args.entry.town !== expectedTown
  ) {
    throw new Error(
      `Overworld session snapshot quest launch "${args.quest.id}" is not bound to its journal identity and town.`,
    );
  }
  if (
    proof.boundary.townId !== args.quest.home ||
    proof.boundary.areaId !== args.quest.area ||
    proof.boundary.minutes !== parseTimeLabel(args.entry.recordedAt)
  ) {
    throw new Error(
      `Overworld session snapshot quest launch "${args.quest.id}" is not anchored at its authored location and timestamp.`,
    );
  }
  const expectedActionId = `quest_start:${args.quest.id}:${option.id}`;
  const replayed = args.boundaryProofs.get(proof.boundary.acceptedDecisions);
  if (
    replayed &&
    (replayed.decision?.surface !== "overworld" ||
      replayed.decision.reason !== "situation_changed" ||
      replayed.decision.actionId !== expectedActionId ||
      replayed.decisionProofHash !== proof.boundary.decisionProofHash ||
      replayed.townId !== proof.boundary.townId ||
      replayed.areaId !== proof.boundary.areaId)
  ) {
    throw new Error(
      `Overworld session snapshot quest launch "${args.quest.id}" does not match its selected approach decision.`,
    );
  }
  if (
    proof.boundary.acceptedDecisions === args.journey.acceptedDecisions &&
    (args.journey.decisionProof.hash !== proof.boundary.decisionProofHash ||
      args.journey.decisionProof.last?.actionId !== expectedActionId)
  ) {
    throw new Error(
      `Overworld session snapshot quest launch "${args.quest.id}" does not match the current journey proof.`,
    );
  }

  return option.effects;
}

function storyChoiceProofOrdinals(
  boundaryProofs: ReadonlyMap<number, OverworldCampaignBoundaryReplayProof>,
  indexes: OverworldSnapshotManifestIndex,
  journey: OverworldSessionSnapshot["journey"],
  reliefOathProof: OpeningReliefOathJournalProof,
): ReadonlyMap<string, number> {
  const result = new Map<string, number>();
  const scenes = [
    indexes.openingRegistration
      ? {
          id: indexes.openingRegistration.id,
          optionIds: indexes.openingRegistration.profiles.map((option) => option.id),
        }
      : null,
    indexes.openingReliefOath
      ? {
          id: indexes.openingReliefOath.id,
          optionIds: indexes.openingReliefOath.options.map((option) => option.id),
        }
      : null,
    indexes.openingLeadSource
      ? {
          id: indexes.openingLeadSource.id,
          optionIds: indexes.openingLeadSource.options.map((option) => option.id),
        }
      : null,
    indexes.openingPreparation
      ? {
          id: indexes.openingPreparation.id,
          optionIds: indexes.openingPreparation.profiles.map((option) => option.id),
        }
      : null,
    indexes.openingReliefAllocation
      ? {
          id: indexes.openingReliefAllocation.id,
          optionIds: indexes.openingReliefAllocation.options.map((option) => option.id),
        }
      : null,
    indexes.openingAlly
      ? {
          id: indexes.openingAlly.id,
          optionIds: indexes.openingAlly.options.map((option) => option.id),
        }
      : null,
  ].filter((scene): scene is { id: string; optionIds: string[] } => scene !== null);
  for (const [ordinal, proof] of boundaryProofs) {
    for (const scene of scenes) {
      for (const optionId of scene.optionIds) {
        if (proof.decision?.actionId !== `campaign_story:${scene.id}:${optionId}`) continue;
        result.set(
          campaignStoryChoiceRefKey({ story_choice_id: scene.id, choice_id: optionId }),
          ordinal,
        );
      }
    }
  }
  if (
    indexes.openingReliefOath !== null &&
    reliefOathProof.option !== null &&
    reliefOathProof.selectionBoundary !== null
  ) {
    const boundary = reliefOathProof.selectionBoundary;
    const replayed = boundaryProofs.get(boundary.acceptedDecisions);
    if (
      !replayed ||
      replayed.decisionProofHash !== boundary.decisionProofHash ||
      replayed.townId !== boundary.townId ||
      replayed.areaId !== boundary.areaId
    ) {
      throw new Error(
        "Overworld session snapshot relief-oath selection does not anchor the lead-source campaign replay boundary.",
      );
    }
    result.set(
      campaignStoryChoiceRefKey({
        story_choice_id: indexes.openingReliefOath.id,
        choice_id: reliefOathProof.option.id,
      }),
      boundary.acceptedDecisions,
    );
  }
  for (const ref of journeyCampaignSelectedStoryChoiceRefs(journey)) {
    const actionId = `campaign_story:${ref.story_choice_id}:${ref.choice_id}`;
    const matches = [...boundaryProofs].filter(
      ([, proof]) => proof.decision?.actionId === actionId,
    );
    if (matches.length !== 1) {
      throw new Error(
        `Overworld session snapshot story choice ${campaignStoryChoiceRefKey(ref)} does not have exactly one canonical journey decision proof.`,
      );
    }
    result.set(campaignStoryChoiceRefKey(ref), matches[0]![0]);
  }
  return result;
}

function localJobOptionProofOrdinals(
  indexes: OverworldSnapshotManifestIndex,
  journalEntries: readonly OverworldJournalEntry[],
): ReadonlyMap<string, number> {
  const result = new Map<string, number>();
  for (const entry of journalEntries) {
    if (entry.kind !== "job" || !entry.id.startsWith("job:")) continue;
    const job = indexes.jobsById.get(entry.id.slice("job:".length));
    const proof = entry.localSceneProof;
    if (!job?.authored_scene || !proof?.boundary || proof.sceneId !== job.authored_scene.id) {
      continue;
    }
    resolveLocalJobSceneOption(job.authored_scene, proof.optionId);
    const key = campaignServiceLocalJobOptionKey({ job_id: job.id, option_id: proof.optionId });
    if (result.has(key)) {
      throw new Error(
        `Overworld session snapshot repeats authored local-job option proof "${job.id}:${proof.optionId}".`,
      );
    }
    result.set(key, proof.boundary.acceptedDecisions);
  }
  return result;
}

function worldFactProofOrdinals(args: {
  boundaryProofs: ReadonlyMap<number, OverworldCampaignBoundaryReplayProof>;
  indexes: OverworldSnapshotManifestIndex;
  journalEntries: readonly OverworldJournalEntry[];
  journey: JourneyContractSnapshot;
  questOutcomeIds: ReadonlyMap<string, string>;
}): ReadonlyMap<string, number | null> {
  const result = new Map<string, number | null>();
  const entriesById = new Map(args.journalEntries.map((entry) => [entry.id, entry]));
  const completionOrdinalByQuestId = new Map<string, number>();
  for (const goal of [...args.journey.goalHistory, args.journey.goal]) {
    if (goal.status !== "completed" || goal.completedAtDecision === null) continue;
    const definition = journeyCampaignGoalDefinition(goal);
    if (definition) {
      completionOrdinalByQuestId.set(definition.targetQuestId, goal.completedAtDecision);
    }
  }
  for (const [questId, endingId] of args.questOutcomeIds) {
    const quest = args.indexes.questsById.get(questId);
    if (!quest) continue;
    const campaignExport = questCampaignExportForEnding(quest, endingId);
    if (!campaignExport) continue;
    const entry = entriesById.get(`quest_done:${questId}`);
    const boundary = entry?.questCompletionBoundary;
    let ordinal: number | null = null;
    if (entry && boundary) {
      const expectedCompletionOrdinal = completionOrdinalByQuestId.get(questId);
      if (
        expectedCompletionOrdinal !== undefined &&
        boundary.acceptedDecisions !== expectedCompletionOrdinal
      ) {
        throw new Error(
          `Overworld session snapshot quest completion journal "${entry.id}" does not match its completed journey goal decision.`,
        );
      }
      const replayed = args.boundaryProofs.get(boundary.acceptedDecisions);
      if (
        !replayed ||
        replayed.decision === null ||
        replayed.decisionProofHash !== boundary.decisionProofHash ||
        replayed.townId !== boundary.townId ||
        replayed.areaId !== boundary.areaId ||
        boundary.minutes !== parseTimeLabel(entry.recordedAt)
      ) {
        throw new Error(
          `Overworld session snapshot quest completion journal "${entry.id}" does not match its replayed decision boundary.`,
        );
      }
      ordinal = boundary.acceptedDecisions;
    }
    for (const effect of campaignExport.effects) {
      if (effect.type !== "set_world_fact") continue;
      const previous = result.get(effect.fact_id);
      if (previous === undefined) {
        result.set(effect.fact_id, ordinal);
      } else if (previous === null || ordinal === null) {
        result.set(effect.fact_id, null);
      } else {
        result.set(effect.fact_id, Math.min(previous, ordinal));
      }
    }
  }
  return result;
}

function assertCurrentLocalJobSceneProofs(args: {
  campaignBoundaries: OverworldCampaignBoundaryReplayIndex;
  characterAt: (entry: OverworldJournalEntry, recordedAt: number) => CampaignCharacterState;
  indexes: OverworldSnapshotManifestIndex;
  journalEntries: readonly OverworldJournalEntry[];
}): void {
  args.journalEntries.forEach((entry, entryIndex) => {
    if (entry.kind !== "job") return;
    const jobId = entry.id.startsWith("job:") ? entry.id.slice("job:".length) : "";
    const job = args.indexes.jobsById.get(jobId);
    if (!job) return;
    const scene = job.authored_scene;
    const proof = entry.localSceneProof;
    if (!scene) {
      if (proof) {
        throw new Error(
          `Overworld session snapshot generic job "${job.id}" cannot carry local-scene proof.`,
        );
      }
      return;
    }
    if (!proof || proof.sceneId !== scene.id) {
      throw new Error(
        `Overworld session snapshot authored job "${job.id}" is missing its exact local-scene proof.`,
      );
    }
    const selectedOption = resolveLocalJobSceneOption(scene, proof.optionId);
    if (!proof.boundary) {
      throw new Error(
        `Overworld session snapshot authored job "${job.id}" is missing its accepted decision boundary.`,
      );
    }
    const boundary = proof.boundary;
    const replayed = args.campaignBoundaries.byAcceptedDecisions.get(boundary.acceptedDecisions);
    if (
      !replayed ||
      replayed.decision === null ||
      replayed.decisionProofHash !== boundary.decisionProofHash ||
      replayed.decision.surface !== "overworld" ||
      replayed.decision.reason !== "situation_changed" ||
      replayed.decision.actionId !== `work_job:${job.id}:${proof.optionId}`
    ) {
      throw new Error(
        `Overworld session snapshot authored job "${job.id}" does not match its accepted decision proof.`,
      );
    }
    if (
      boundary.townId !== job.home ||
      boundary.areaId !== job.area ||
      replayed.townId !== boundary.townId ||
      replayed.areaId !== boundary.areaId ||
      boundary.minutes !== parseTimeLabel(entry.recordedAt)
    ) {
      throw new Error(
        `Overworld session snapshot authored job "${job.id}" does not match its location and clock boundary.`,
      );
    }

    const earlierEntries = args.journalEntries.slice(entryIndex + 1);
    const hasEarlierPoi = earlierEntries.some(
      (candidate) => candidate.id === `scout:${scene.required_poi_id}`,
    );
    const contactPrefix = `talk:${scene.required_contact_id}`;
    const hasEarlierContact = earlierEntries.some(
      (candidate) => candidate.id === contactPrefix || candidate.id.startsWith(`${contactPrefix}@`),
    );
    if (!hasEarlierPoi || !hasEarlierContact) {
      throw new Error(
        `Overworld session snapshot authored job "${job.id}" lacks its earlier scene setup.`,
      );
    }
    for (const questId of scene.requires_completed_quests) {
      if (!earlierEntries.some((candidate) => candidate.id === `quest_done:${questId}`)) {
        throw new Error(
          `Overworld session snapshot authored job "${job.id}" lacks earlier quest "${questId}".`,
        );
      }
    }
    const earlierResolvedEventIds = new Set(
      earlierEntries.flatMap((candidate) =>
        candidate.kind === "resolution" && candidate.id.startsWith("resolve:")
          ? [candidate.id.slice("resolve:".length)]
          : [],
      ),
    );
    const earlierCompletedQuestIds = new Set(
      earlierEntries.flatMap((candidate) =>
        candidate.kind === "quest_done" && candidate.id.startsWith("quest_done:")
          ? [candidate.id.slice("quest_done:".length)]
          : [],
      ),
    );
    const conditionState = {
      completedQuestIds: earlierCompletedQuestIds,
      resolvedEventIds: earlierResolvedEventIds,
      worldFactIds: campaignWorldFactsProvenBeforeDecision(
        args.campaignBoundaries,
        boundary.acceptedDecisions,
      ),
      storyChoiceKeys: campaignStoryChoiceKeysProvenBeforeDecision(
        args.campaignBoundaries,
        boundary.acceptedDecisions,
      ),
      character: args.characterAt(entry, parseTimeLabel(entry.recordedAt)),
      eventOptionIdFor: (eventId: string) =>
        earlierEntries.find((candidate) => candidate.id === `resolve:${eventId}`)?.localSceneProof
          ?.optionId ?? null,
    };
    if (
      !localJobSceneRequirementsMet(scene, conditionState) ||
      !localJobSceneOptionRequirementsMet(selectedOption, conditionState)
    ) {
      throw new Error(
        `Overworld session snapshot authored job "${job.id}" violates its earlier event, world-fact, or story-choice requirements.`,
      );
    }
  });
}

function assertCurrentLocalEventSceneProofs(args: {
  campaignBoundaries: OverworldCampaignBoundaryReplayIndex;
  indexes: OverworldSnapshotManifestIndex;
  journalEntries: readonly OverworldJournalEntry[];
}): void {
  for (const investigation of args.journalEntries) {
    if (investigation.kind !== "event" || !investigation.id.startsWith("investigate:")) continue;
    const eventId = investigation.id.slice("investigate:".length);
    const event = args.indexes.eventsById.get(eventId);
    const scene = event?.authored_scene;
    if (!scene) continue;
    for (const questId of scene.requires_completed_quests ?? []) {
      const questCompletion = args.journalEntries.find(
        (candidate) => candidate.id === `quest_done:${questId}`,
      );
      if (
        !questCompletion ||
        parseTimeLabel(questCompletion.recordedAt) >= parseTimeLabel(investigation.recordedAt)
      ) {
        throw new Error(
          `Overworld session snapshot authored event "${eventId}" investigation does not strictly follow required quest "${questId}".`,
        );
      }
    }
  }

  args.journalEntries.forEach((entry, entryIndex) => {
    if (entry.kind !== "resolution") return;
    const eventId = entry.id.startsWith("resolve:") ? entry.id.slice("resolve:".length) : "";
    const event = args.indexes.eventsById.get(eventId);
    if (!event) return;
    const scene = event.authored_scene;
    const proof = entry.localSceneProof;
    if (!scene) {
      if (proof) {
        throw new Error(
          `Overworld session snapshot generic event "${event.id}" cannot carry local-scene proof.`,
        );
      }
      return;
    }
    if (!proof || proof.sceneId !== scene.id) {
      throw new Error(
        `Overworld session snapshot authored event "${event.id}" is missing its exact local-scene proof.`,
      );
    }
    const option = resolveLocalEventSceneOption(scene, proof.optionId);
    const earlierEntries = args.journalEntries.slice(entryIndex + 1);
    const earlierCompletedQuestIds = new Set(
      earlierEntries.flatMap((candidate) =>
        candidate.kind === "quest_done" && candidate.id.startsWith("quest_done:")
          ? [candidate.id.slice("quest_done:".length)]
          : [],
      ),
    );
    const earlierCompletedJobIds = new Set(
      earlierEntries.flatMap((candidate) =>
        candidate.kind === "job" && candidate.id.startsWith("job:")
          ? [candidate.id.slice("job:".length)]
          : [],
      ),
    );
    if (
      !localEventSceneRequirementsMet(scene, {
        completedQuestIds: earlierCompletedQuestIds,
        completedJobIds: earlierCompletedJobIds,
      })
    ) {
      throw new Error(
        `Overworld session snapshot authored event "${event.id}" violates its required quest or forbidden job chronology.`,
      );
    }
    if (entry.town !== args.indexes.townNameForSource(event.home)) {
      throw new Error(
        `Overworld session snapshot authored event "${event.id}" is bound to the wrong town.`,
      );
    }
    if (!proof.boundary) {
      throw new Error(
        `Overworld session snapshot authored event "${event.id}" is missing its accepted decision boundary.`,
      );
    }
    const boundary = proof.boundary;
    const replayed = args.campaignBoundaries.byAcceptedDecisions.get(boundary.acceptedDecisions);
    if (
      !replayed ||
      replayed.decision === null ||
      replayed.decisionProofHash !== boundary.decisionProofHash ||
      replayed.decision.surface !== "overworld" ||
      replayed.decision.reason !== "situation_changed" ||
      replayed.decision.actionId !== `resolve_event:${event.id}:${proof.optionId}`
    ) {
      throw new Error(
        `Overworld session snapshot authored event "${event.id}" does not match its accepted decision proof.`,
      );
    }
    if (
      boundary.townId !== event.home ||
      boundary.areaId !== event.area ||
      replayed.townId !== boundary.townId ||
      replayed.areaId !== boundary.areaId ||
      boundary.minutes !== parseTimeLabel(entry.recordedAt)
    ) {
      throw new Error(
        `Overworld session snapshot authored event "${event.id}" does not match its location and clock boundary.`,
      );
    }
    if (
      !localEventSceneOptionRequirementsMet(option, {
        worldFactIds: campaignWorldFactsProvenBeforeDecision(
          args.campaignBoundaries,
          boundary.acceptedDecisions,
        ),
      })
    ) {
      throw new Error(
        `Overworld session snapshot authored event "${event.id}" violates its earlier world-fact requirements.`,
      );
    }
  });
}

function proveCurrentCampaignSnapshot(args: {
  completedQuestIds: ReadonlySet<string>;
  indexes: OverworldSnapshotManifestIndex;
  questOutcomeIds: ReadonlyMap<string, string>;
  snapshot: OverworldSessionSnapshot;
  startedQuestIds: ReadonlySet<string>;
  travelEntries: readonly TravelLogEntrySnapshot[];
}): CurrentCampaignSnapshotProof {
  const registrationProof: OpeningRegistrationJournalProof = proveOpeningRegistrationJournal({
    registration: args.indexes.openingRegistration,
    journalEntries: args.snapshot.journalEntries,
    expectedTown: args.indexes.openingRegistrationTownName,
  });
  assertCurrentOpeningStoryBoundary({
    label: "registration",
    offered: registrationProof.offered,
    offerBoundary: registrationProof.offerBoundary,
    optionId: registrationProof.profile?.id ?? null,
    sceneId: args.indexes.openingRegistration?.id ?? null,
    selectionBoundary: registrationProof.selectionBoundary,
    snapshot: args.snapshot,
  });
  if (
    (args.startedQuestIds.size > 0 || args.completedQuestIds.size > 0) &&
    registrationProof.profile === null
  ) {
    throw new Error(
      "Overworld session snapshot has quest progress without selected opening registration.",
    );
  }

  const reliefOathProof: OpeningReliefOathJournalProof = proveOpeningReliefOathJournal({
    scene: args.indexes.openingReliefOath,
    registrationProof,
    journalEntries: args.snapshot.journalEntries,
    expectedTown: args.indexes.openingReliefOathTownName,
  });
  assertCurrentOpeningStoryBoundary({
    label: "relief-oath",
    offered: reliefOathProof.offered,
    offerBoundary: reliefOathProof.offerBoundary,
    optionId: reliefOathProof.option?.id ?? null,
    sceneId: args.indexes.openingReliefOath?.id ?? null,
    selectionBoundary: reliefOathProof.selectionBoundary,
    snapshot: args.snapshot,
  });
  if (
    args.indexes.openingReliefOath !== null &&
    registrationProof.profile !== null &&
    !reliefOathProof.offered
  ) {
    throw new Error(
      "Overworld session snapshot selected registration has no required relief-oath offer.",
    );
  }

  const leadSourceProof: OpeningLeadSourceJournalProof = proveOpeningLeadSourceJournal({
    scene: args.indexes.openingLeadSource,
    registrationProof,
    reliefOathProof,
    journalEntries: args.snapshot.journalEntries,
    expectedTown: args.indexes.openingLeadSourceTownName,
  });
  assertCurrentOpeningStoryBoundary({
    label: "lead-source",
    offered: leadSourceProof.offered,
    offerBoundary: leadSourceProof.offerBoundary,
    optionId: leadSourceProof.option?.id ?? null,
    sceneId: args.indexes.openingLeadSource?.id ?? null,
    selectionBoundary: leadSourceProof.selectionBoundary,
    snapshot: args.snapshot,
  });
  if (
    args.indexes.openingLeadSource !== null &&
    registrationProof.profile !== null &&
    !leadSourceProof.offered &&
    !(reliefOathProof.offered && reliefOathProof.option === null)
  ) {
    throw new Error(
      "Overworld session snapshot selected registration has no required opening lead-source offer.",
    );
  }
  const targetQuestId = args.indexes.openingLeadSource?.target_quest ?? null;
  if (
    targetQuestId !== null &&
    args.snapshot.discoveredQuestIds.includes(targetQuestId) &&
    leadSourceProof.option === null
  ) {
    throw new Error(
      "Overworld session snapshot discovered the opening lead-source target quest without a certified lead source.",
    );
  }
  if (
    targetQuestId !== null &&
    leadSourceProof.option !== null &&
    !args.snapshot.discoveredQuestIds.includes(targetQuestId)
  ) {
    throw new Error(
      "Overworld session snapshot selected lead source did not reveal its target quest.",
    );
  }

  const preparationProof: OpeningPreparationJournalProof = proveOpeningPreparationJournal({
    scene: args.indexes.openingPreparation,
    leadSourceProof,
    journalEntries: args.snapshot.journalEntries,
    expectedTown: args.indexes.openingPreparationTownName,
  });
  assertCurrentOpeningStoryBoundary({
    label: "preparation",
    offered: preparationProof.offered,
    offerBoundary: preparationProof.offerBoundary,
    optionId: preparationProof.profile?.id ?? null,
    sceneId: args.indexes.openingPreparation?.id ?? null,
    selectionBoundary: preparationProof.selectionBoundary,
    snapshot: args.snapshot,
  });
  const reliefAllocationProof: OpeningReliefAllocationJournalProof =
    proveOpeningReliefAllocationJournal({
      scene: args.indexes.openingReliefAllocation,
      preparationProof,
      leadSourceProof,
      preparationScene: args.indexes.openingPreparation,
      journalEntries: args.snapshot.journalEntries,
      expectedTown: args.indexes.openingReliefAllocationTownName,
    });
  assertCurrentOpeningStoryBoundary({
    label: "relief allocation",
    offered: reliefAllocationProof.offered,
    offerBoundary: reliefAllocationProof.offerBoundary,
    optionId: reliefAllocationProof.option?.id ?? null,
    sceneId: args.indexes.openingReliefAllocation?.id ?? null,
    selectionBoundary: reliefAllocationProof.selectionBoundary,
    snapshot: args.snapshot,
  });
  const allyProof: OpeningAllyJournalProof = proveOpeningAllyJournal({
    scene: args.indexes.openingAlly,
    preparationProof,
    reliefAllocationProof,
    leadSourceProof,
    preparationScene: args.indexes.openingPreparation,
    reliefAllocationScene: args.indexes.openingReliefAllocation,
    journalEntries: args.snapshot.journalEntries,
    expectedTown: args.indexes.openingAllyTownName,
  });
  assertCurrentOpeningStoryBoundary({
    label: "ally",
    offered: allyProof.offered,
    offerBoundary: allyProof.offerBoundary,
    optionId: allyProof.option?.id ?? null,
    sceneId: args.indexes.openingAlly?.id ?? null,
    selectionBoundary: allyProof.selectionBoundary,
    snapshot: args.snapshot,
  });

  const openingLeadSourceDecisionTrail = proveOpeningDecisionTrail({
    leadSourceProof,
    snapshot: args.snapshot,
    sourceSceneId: args.indexes.openingLeadSource?.id ?? null,
  });
  const boundaryProofs = replayCampaignBoundaries({
    indexes: args.indexes,
    leadSourceProof,
    trail: openingLeadSourceDecisionTrail,
    travelEntries: args.travelEntries,
  });

  const openingChoices: OpeningDispatchReplayChoice[] = [
    ...(preparationProof.profile &&
    preparationProof.journalIndex !== null &&
    args.indexes.openingPreparation
      ? [
          {
            kind: "preparation" as const,
            journalIndex: preparationProof.journalIndex,
            scene: args.indexes.openingPreparation,
            optionId: preparationProof.profile.id,
          },
        ]
      : []),
    ...(reliefAllocationProof.option &&
    reliefAllocationProof.journalIndex !== null &&
    args.indexes.openingReliefAllocation
      ? [
          {
            kind: "relief_allocation" as const,
            journalIndex: reliefAllocationProof.journalIndex,
            scene: args.indexes.openingReliefAllocation,
            optionId: reliefAllocationProof.option.id,
          },
        ]
      : []),
    ...(allyProof.option && allyProof.journalIndex !== null && args.indexes.openingAlly
      ? [
          {
            kind: "ally" as const,
            journalIndex: allyProof.journalIndex,
            scene: args.indexes.openingAlly,
            optionId: allyProof.option.id,
          },
        ]
      : []),
  ];
  const characterAfterOpening = replayOpeningDispatchChoices({
    characterAfterSource: leadSourceProof.characterAfterSource,
    choices: openingChoices,
  });

  const journalIndexById = new Map(
    args.snapshot.journalEntries.map((entry, index) => [entry.id, index] as const),
  );
  const mutations: CampaignReplayMutation[] = [];
  const questLaunchMutations = new Map<
    string,
    Readonly<{
      entry: OverworldJournalEntry;
      effects: readonly CampaignConsequenceEffect[];
    }>
  >();
  for (const entry of args.snapshot.journalEntries) {
    if (entry.questStartProof === undefined) continue;
    const questId = entry.id.startsWith("quest:") ? entry.id.slice("quest:".length) : "";
    const quest = args.indexes.questsById.get(questId);
    if (!quest?.launch || !args.startedQuestIds.has(questId)) {
      throw new Error(
        `Overworld session snapshot quest-start proof "${entry.id}" has no started authored launch.`,
      );
    }
  }
  for (const [questId, quest] of args.indexes.questsById) {
    if (!args.startedQuestIds.has(questId)) continue;
    const journalIndex = journalIndexById.get(`quest:${questId}`);
    const entry =
      journalIndex === undefined ? undefined : args.snapshot.journalEntries[journalIndex];
    if (journalIndex === undefined || !entry) {
      throw new Error(
        `Overworld session snapshot started quest "${questId}" has no canonical launch journal.`,
      );
    }
    if (!quest.launch) {
      const expectedTown = args.indexes.questTownNames.get(quest.id) ?? quest.home;
      if (
        entry.id !== `quest:${quest.id}` ||
        entry.kind !== "quest" ||
        entry.town !== expectedTown ||
        entry.questStartProof !== undefined
      ) {
        throw new Error(
          `Overworld session snapshot quest start "${quest.id}" is not bound to its canonical journal identity and town.`,
        );
      }
      questLaunchMutations.set(questId, { entry, effects: [] });
      continue;
    }
    const effects = assertCurrentQuestStartJournal({
      boundaryProofs,
      entry,
      indexes: args.indexes,
      journey: args.snapshot.journey,
      quest,
    });
    questLaunchMutations.set(questId, { entry, effects });
    const proof = entry.questStartProof;
    if (proof?.kind === "approach") {
      const expectedWindow = deriveQuestDispatchWindow({
        questId,
        journalEntries: args.snapshot.journalEntries.slice(journalIndex + 1),
        openingRegistration: args.indexes.openingRegistration,
        openingReliefOath: args.indexes.openingReliefOath,
        openingLeadSource: args.indexes.openingLeadSource,
        openingPreparation: args.indexes.openingPreparation,
        openingReliefAllocation: args.indexes.openingReliefAllocation,
        openingAlly: args.indexes.openingAlly,
      });
      if (expectedWindow.status !== "legacy_neutral" && !proof.dispatchSeal) {
        throw new Error(
          `Overworld session snapshot quest launch "${questId}" lacks its current dispatch seal.`,
        );
      }
      if (proof.dispatchSeal) {
        assertQuestDispatchLaunchSeal({
          seal: proof.dispatchSeal,
          expectedWindow,
          expectedApproachId: proof.approachId,
          expectedLaunchBoundary: proof.boundary,
        });
      }
    }
    if (effects.length > 0) mutations.push({ kind: "effects", journalIndex, effects });
  }

  for (const [questId, endingId] of args.questOutcomeIds) {
    const journalIndex = journalIndexById.get(`quest_done:${questId}`);
    const quest = args.indexes.questsById.get(questId);
    if (journalIndex !== undefined && quest && questCampaignExportForEnding(quest, endingId)) {
      mutations.push({ kind: "quest_completion", journalIndex, quest, endingId });
    }
  }
  args.snapshot.journalEntries.forEach((entry, journalIndex) => {
    if (entry.kind !== "service" || !entry.serviceRuleId) return;
    const rule = args.indexes.campaignServiceRulesById.get(entry.serviceRuleId);
    if (rule?.action !== "care") return;
    if (!rule.effects) {
      throw new Error(`Campaign care rule "${rule.id}" has no replayable treatment effect.`);
    }
    mutations.push({ kind: "effects", journalIndex, effects: rule.effects });
  });
  mutations.sort((left, right) => right.journalIndex - left.journalIndex);

  const openingCharacterBeforeJournalIndex = (journalIndex: number): CampaignCharacterState => {
    const registrationActive =
      registrationProof.journalIndex !== null && registrationProof.journalIndex > journalIndex;
    const reliefOathActive =
      reliefOathProof.journalIndex !== null && reliefOathProof.journalIndex > journalIndex;
    const leadSourceActive =
      leadSourceProof.journalIndex !== null && leadSourceProof.journalIndex > journalIndex;
    if (!registrationActive) return createInitialCampaignCharacterState();
    if (!leadSourceActive) {
      return reliefOathActive
        ? reliefOathProof.characterAfterOath
        : registrationProof.characterAtRegistration;
    }
    return replayOpeningDispatchChoices({
      characterAfterSource: leadSourceProof.characterAfterSource,
      choices: openingChoices,
      beforeJournalIndex: journalIndex,
    });
  };
  const replayCharacterBeforeJournalIndex = (journalIndex: number): CampaignCharacterState => {
    let character =
      journalIndex < 0
        ? cloneCampaignCharacterState(characterAfterOpening)
        : cloneCampaignCharacterState(openingCharacterBeforeJournalIndex(journalIndex));
    for (const mutation of mutations) {
      if (mutation.journalIndex <= journalIndex) continue;
      const effects =
        mutation.kind === "effects"
          ? mutation.effects
          : overworldQuestCampaignEffectsForCharacter(
              questCampaignExportForEnding(mutation.quest, mutation.endingId)!,
              character,
            );
      character = applyCampaignConsequences({ character, effects }).characterAfter;
    }
    return character;
  };
  const characterAtCache = new Map<string, CampaignCharacterState>();
  const characterAt = (entry: OverworldJournalEntry): CampaignCharacterState => {
    const cached = characterAtCache.get(entry.id);
    if (cached) return cached;
    const journalIndex = journalIndexById.get(entry.id);
    if (journalIndex === undefined) {
      throw new Error(
        `Overworld session snapshot cannot replay character state for unknown journal entry "${entry.id}".`,
      );
    }
    const replayed = replayCharacterBeforeJournalIndex(journalIndex);
    characterAtCache.set(entry.id, replayed);
    return replayed;
  };
  const characterAfter = replayCharacterBeforeJournalIndex(-1);
  if (
    serializeCampaignCharacterState(args.snapshot.character) !==
    serializeCampaignCharacterState(characterAfter)
  ) {
    throw new Error(
      "Overworld session snapshot campaign character does not match replayed quest consequences or care services.",
    );
  }
  const questLaunchCharacters = new Map<string, CampaignCharacterState>();
  for (const [questId, launch] of questLaunchMutations) {
    const characterBefore = characterAt(launch.entry);
    const characterAfterLaunch =
      launch.effects.length === 0
        ? characterBefore
        : applyCampaignConsequences({
            character: characterBefore,
            effects: launch.effects,
          }).characterAfter;
    questLaunchCharacters.set(questId, cloneCampaignCharacterState(characterAfterLaunch));
  }

  const storyChoiceProofOrdinalByKey = storyChoiceProofOrdinals(
    boundaryProofs,
    args.indexes,
    args.snapshot.journey,
    reliefOathProof,
  );
  const directQuestAnchorActivationOrdinals = new Map<string, number>();
  const bindDirectQuestAnchorActivation = (questId: string, acceptedDecisions: number): void => {
    const existing = directQuestAnchorActivationOrdinals.get(questId);
    if (existing === undefined || acceptedDecisions < existing) {
      directQuestAnchorActivationOrdinals.set(questId, acceptedDecisions);
    }
  };
  if (
    args.indexes.openingLeadSource !== null &&
    leadSourceProof.option !== null &&
    leadSourceProof.selectionBoundary !== null
  ) {
    bindDirectQuestAnchorActivation(
      args.indexes.openingLeadSource.target_quest,
      leadSourceProof.selectionBoundary.acceptedDecisions,
    );
  }
  for (const goal of [...args.snapshot.journey.goalHistory, args.snapshot.journey.goal]) {
    if (goal.version <= INITIAL_JOURNEY_GOAL.version) continue;
    const definition = journeyCampaignGoalDefinition(goal);
    if (!definition) continue; // The authenticated campaign proof reports unknown goals.
    const storyChoiceRef = journeyCampaignStoryChoiceRefForGoal(definition);
    if (storyChoiceRef) {
      const acceptedDecisions = storyChoiceProofOrdinalByKey.get(
        campaignStoryChoiceRefKey(storyChoiceRef),
      );
      if (acceptedDecisions === undefined) {
        throw new Error(
          `Overworld session snapshot campaign goal "${goal.id}" has no replayable activation decision.`,
        );
      }
      bindDirectQuestAnchorActivation(definition.targetQuestId, acceptedDecisions);
      continue;
    }

    const previousGoal = args.snapshot.journey.goalHistory[goal.version - 2];
    const retention = previousGoal
      ? args.snapshot.journey.retentionHistory.find(
          (event) =>
            event.choice === "continue" &&
            event.goalVersion === previousGoal.version &&
            event.goalId === previousGoal.id,
        )
      : undefined;
    const replayed = retention ? boundaryProofs.get(retention.atDecision) : undefined;
    if (!retention || !replayed || replayed.decisionProofHash !== retention.decisionProofHash) {
      throw new Error(
        `Overworld session snapshot campaign goal "${goal.id}" has no replayable continuation activation.`,
      );
    }
    bindDirectQuestAnchorActivation(definition.targetQuestId, retention.atDecision);
  }

  return {
    campaignBoundaries: {
      byAcceptedDecisions: boundaryProofs,
      storyChoiceProofOrdinalByKey,
      localJobOptionProofOrdinalByKey: localJobOptionProofOrdinals(
        args.indexes,
        args.snapshot.journalEntries,
      ),
      worldFactProofOrdinalById: worldFactProofOrdinals({
        boundaryProofs,
        indexes: args.indexes,
        journalEntries: args.snapshot.journalEntries,
        journey: args.snapshot.journey,
        questOutcomeIds: args.questOutcomeIds,
      }),
    },
    characterAfter,
    characterAt: (entry) => characterAt(entry),
    directQuestAnchorActivationOrdinals,
    openingLeadSourceDecisionTrail,
    questLaunchCharacters,
  };
}

export type OverworldSessionSnapshotRestorePlan = {
  characterAfter: CampaignCharacterState;
  currentAreaByTown: ReadonlyMap<string, string>;
  discoveredAreaIdsAfter: readonly string[];
  discoveredQuestIdsAfter: readonly string[];
  journalEntriesAfter: readonly OverworldJournalEntry[];
  openingLeadSourceDecisionTrailAfter: OverworldOpeningLeadSourceDecisionTrail | null;
  pendingRoadEncounter: OverworldPendingRoadEncounter | null;
  questLaunchCharacters: ReadonlyMap<string, CampaignCharacterState>;
  questOutcomeIds: ReadonlyMap<string, string>;
  regionRenown: ReadonlyMap<string, number>;
  resolvedEventHomeIds: ReadonlySet<string>;
  restoreWarnings: readonly string[];
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
  questLaunchCharacters: Map<string, CampaignCharacterState>;
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
  openingLeadSourceDecisionTrailAfter: OverworldOpeningLeadSourceDecisionTrail | null;
  pendingRoadEncounterAfter: OverworldPendingRoadEncounter | null;
  restoreWarnings: readonly string[];
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

function replaceCampaignCharacterMap(
  target: Map<string, CampaignCharacterState>,
  source: ReadonlyMap<string, CampaignCharacterState>,
): void {
  target.clear();
  for (const [key, value] of source) target.set(key, cloneCampaignCharacterState(value));
}

function replaceTravelLog(target: TravelLogEntry[], source: readonly TravelLogEntry[]): void {
  target.length = 0;
  for (const entry of source) target.push(entry);
}

function resolvedOverworldEventHomeIds(
  resolvedEventIds: ReadonlySet<string>,
  indexes: OverworldSnapshotManifestIndex,
): ReadonlySet<string> {
  const homeIds = new Set<string>();
  for (const eventId of resolvedEventIds) {
    const event = indexes.eventsById.get(eventId);
    if (event) homeIds.add(event.home);
  }
  return homeIds;
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
  replaceStringSet(state.discoveredAreaIds, plan.discoveredAreaIdsAfter);
  replaceStringSet(state.visitedAreaIds, snapshot.visitedAreaIds);
  replaceStringSet(state.discoveredJobIds, snapshot.discoveredJobIds);
  replaceStringSet(state.completedJobIds, snapshot.completedJobIds);
  replaceStringSet(state.discoveredSiteIds, snapshot.discoveredSiteIds);
  replaceStringSet(state.discoveredQuestIds, plan.discoveredQuestIdsAfter);
  replaceStringSet(state.startedQuestIds, snapshot.startedQuestIds);
  replaceStringSet(state.completedQuestIds, snapshot.completedQuestIds);
  replaceCampaignCharacterMap(state.questLaunchCharacters, plan.questLaunchCharacters);
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
    openingLeadSourceDecisionTrailAfter: plan.openingLeadSourceDecisionTrailAfter
      ? cloneOpeningLeadSourceDecisionTrail(plan.openingLeadSourceDecisionTrailAfter)
      : null,
    pendingRoadEncounterAfter: plan.pendingRoadEncounter,
    restoreWarnings: plan.restoreWarnings,
    journeyAfter: cloneJourneyContractSnapshot(snapshot.journey),
  };
}

/**
 * Upgrade only the exact immediately prior code-owned ally journal copy. The
 * normal ally replay still owns the option, clock, chronology, and character
 * effects; near-matches and unrelated historical prose are left untouched.
 */
function normalizeOpeningAllyTimingDisclosurePredecessorJournal(args: {
  scene: NonNullable<OverworldSnapshotManifestIndex["openingAlly"]>;
  journalEntries: OverworldSessionSnapshot["journalEntries"];
}): OverworldSessionSnapshot["journalEntries"] {
  const character = createInitialCampaignCharacterState();
  const copiesById = new Map(
    args.scene.options.map((option) => {
      const current = openingAllyJournalDraft({
        scene: args.scene,
        character,
        optionId: option.id,
      });
      return [
        current.id,
        {
          current,
          predecessorText: `${option.summary} ${option.preview} Actual cost: ${formatOpeningAllyCost(option.terms)}. ${option.consequence}`,
        },
      ] as const;
    }),
  );
  let changed = false;
  const journalEntries = args.journalEntries.map((entry) => {
    const copies = copiesById.get(entry.id);
    if (
      !copies ||
      entry.kind !== "ally" ||
      entry.title !== copies.current.title ||
      entry.text !== copies.predecessorText
    ) {
      return entry;
    }
    changed = true;
    return Object.freeze({ ...entry, text: copies.current.text });
  });
  return changed ? journalEntries : args.journalEntries;
}

export function planOverworldSessionSnapshotRestore(args: {
  indexes: OverworldSnapshotManifestIndex;
  snapshot: OverworldSessionSnapshot;
  startTownId: string;
  worldHash: string;
  worldId: string;
}): OverworldSessionSnapshotRestorePlan {
  const { indexes, snapshot: sourceSnapshot, startTownId, worldHash, worldId } = args;
  const normalizedJournalEntries = indexes.openingAlly
    ? normalizeOpeningAllyTimingDisclosurePredecessorJournal({
        scene: indexes.openingAlly,
        journalEntries: sourceSnapshot.journalEntries,
      })
    : sourceSnapshot.journalEntries;
  const snapshot =
    normalizedJournalEntries === sourceSnapshot.journalEntries
      ? sourceSnapshot
      : Object.freeze({ ...sourceSnapshot, journalEntries: normalizedJournalEntries });
  if (snapshot.worldId !== worldId) {
    throw new Error(
      `Overworld session snapshot is for world "${snapshot.worldId}", not "${worldId}".`,
    );
  }
  const restoreWarnings =
    snapshot.worldHash === worldHash ? [] : [OVERWORLD_CONTENT_HASH_MISMATCH_WARNING];

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
  const campaignReplay = proveCurrentCampaignSnapshot({
    completedQuestIds,
    indexes,
    questOutcomeIds,
    snapshot,
    startedQuestIds,
    travelEntries: travelTimeline.oldestFirst,
  });
  assertJourneyCampaignJournalProof({
    journey: snapshot.journey,
    questOutcomeIds,
    journalEntries: snapshot.journalEntries,
  });
  assertCurrentLocalEventSceneProofs({
    campaignBoundaries: campaignReplay.campaignBoundaries,
    indexes,
    journalEntries: snapshot.journalEntries,
  });
  assertCurrentLocalJobSceneProofs({
    campaignBoundaries: campaignReplay.campaignBoundaries,
    characterAt: campaignReplay.characterAt,
    indexes,
    journalEntries: snapshot.journalEntries,
  });
  const roadJournal = roadJournalResolutionIndex(
    indexes,
    journalTimeline,
    travelTimeline,
    snapshot.pendingRoadEncounter,
  );

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
    { ...indexes, travelLogByArrival: travelTimeline.byArrival },
    roadJournal,
    snapshot.journalEntries,
  );
  assertSnapshotCurrentAreaReachability(snapshot.currentAreaId, discoveredAreaIds);

  // An authenticated current or historical campaign goal is a direct lead to
  // its canonical quest and district, even before that town has been visited.
  const campaignQuestAnchorIds = new Set(
    [...snapshot.journey.goalHistory, snapshot.journey.goal]
      .filter((goal) => goal.version > INITIAL_JOURNEY_GOAL.version)
      .map((goal) => journeyCampaignGoalDefinition(goal)?.targetQuestId)
      .filter((questId): questId is string => questId !== undefined),
  );
  const directQuestAnchorIds = new Set<string>(campaignQuestAnchorIds);
  const nonFifoQuestIds = new Set<string>(campaignQuestAnchorIds);
  if (indexes.openingLeadSource) {
    const targetQuestId = indexes.openingLeadSource.target_quest;
    nonFifoQuestIds.add(targetQuestId);
    if (discoveredQuestIds.has(targetQuestId)) directQuestAnchorIds.add(targetQuestId);
  }
  // Upgrade authenticated older saves that predate campaign-anchor discovery.
  for (const questId of campaignQuestAnchorIds) discoveredQuestIds.add(questId);
  const directAnchorAreaIds = new Set(
    [...directQuestAnchorIds].flatMap((questId) => {
      const areaId = indexes.questsById.get(questId)?.area;
      return areaId ? [areaId] : [];
    }),
  );
  for (const areaId of directAnchorAreaIds) discoveredAreaIds.add(areaId);
  const localActionJournalSources = {
    ...indexes,
    campaignDecisionProofsByOrdinal: campaignReplay.campaignBoundaries.byAcceptedDecisions,
    discoveredAreaIds,
    discoveredJobIds,
    discoveredQuestIds,
    discoveredSiteIds,
    directQuestAnchorIds,
    directQuestAnchorActivationOrdinals: campaignReplay.directQuestAnchorActivationOrdinals,
    nonFifoQuestIds,
    townVisitMinutes,
    visitedTownIds,
  };
  const localActionJournal = localActionJournalReplayIndex(
    localActionJournalSources,
    journalTimeline,
  );
  assertSnapshotDiscoveredAreaPrefix(
    indexes.areasByTown,
    discoveredAreaIds,
    visitedTownIds,
    directAnchorAreaIds,
  );
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
    directQuestAnchorIds,
    discoveredAreaIds,
    discoveredJobIds,
    discoveredQuestIds,
    discoveredSiteIds,
    questIdsAllowedOutsideDiscoveredArea: nonFifoQuestIds,
    resolvedEventIds,
    startedQuestIds,
    visitedAreaIds,
    visitedTownIds,
  });
  assertSnapshotLocalActionJournalReachability(localActionJournal, localActionJournalSources);
  assertSnapshotLocalActionDiscoveryChronology(localActionJournal, localActionJournalSources);
  assertSnapshotContactPresentationProofs(
    localActionJournalSources,
    journalTimeline,
    campaignReplay.characterAt,
  );
  assertSnapshotEventResolutionProofs(
    resolvedEventIds,
    indexes,
    journalTimeline.eventResolutionProofs,
  );
  assertSnapshotRegionalArcCompletionProofs(
    indexes,
    journalTimeline.eventResolutionProofs,
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
    journalTimeline.serviceJournal,
    localActionJournal,
    campaignReplay.campaignBoundaries,
    campaignReplay.characterAt,
  );

  return {
    characterAfter: campaignReplay.characterAfter,
    currentAreaByTown,
    discoveredAreaIdsAfter: Object.freeze([...discoveredAreaIds].sort()),
    discoveredQuestIdsAfter: Object.freeze([...discoveredQuestIds].sort()),
    journalEntriesAfter: Object.freeze([...snapshot.journalEntries]),
    openingLeadSourceDecisionTrailAfter: campaignReplay.openingLeadSourceDecisionTrail,
    pendingRoadEncounter,
    questLaunchCharacters: campaignReplay.questLaunchCharacters,
    questOutcomeIds,
    regionRenown,
    resolvedEventHomeIds: resolvedOverworldEventHomeIds(resolvedEventIds, indexes),
    restoreWarnings: Object.freeze(restoreWarnings),
    travelLog: restoreOverworldTravelLogEntries(snapshot.travelLog, {
      edgesById: indexes.edgesById,
      nodesById: indexes.nodesById,
      roadEventsByEdgeId: indexes.roadEventsByEdgeId,
    }),
  };
}
