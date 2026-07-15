import type {
  OverworldJournalDecisionBoundary,
  OverworldJournalEntry,
  OverworldOpeningLeadSourceDecisionTrail,
  OverworldPendingRoadEncounter,
  OverworldSessionSnapshot,
  TravelLogEntry,
  TravelLogEntrySnapshot,
} from "./session_snapshot.js";
import type { OverworldQuest } from "./overworld.js";
import { cloneOpeningLeadSourceDecisionTrail } from "./session_snapshot.js";
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
  type OverworldCampaignBoundaryReplayIndex,
  type OverworldCampaignBoundaryReplayProof,
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
import {
  cloneJourneyContractSnapshot,
  type JourneyContractSnapshot,
  type JourneyDecisionProofLast,
} from "./journey_contract.js";
import {
  assertJourneyCampaignGoalCompletionProof,
  assertJourneyCampaignJournalProof,
  assertJourneyCampaignQuestOutcome,
  journeyCampaignGoalDefinition,
  journeyCampaignSelectedStoryChoiceRefs,
} from "./journey_campaign.js";
import { campaignStoryChoiceRefKey } from "./campaign_story_choices.js";
import { describeOverworldContactAction } from "./local_actions.js";
import {
  questCampaignExportForEnding,
  questCompletionJournalEntryDraft,
  questCompletionMinutes,
  replayQuestCampaignConsequences,
} from "./session_quests.js";
import {
  openingAllyJournalDraft,
  openingAllyOfferJournalDraft,
  proveOpeningAllyJournal,
  type OpeningAllyJournalProof,
} from "./opening_ally_journal.js";
import {
  openingLeadSourceOfferJournalEntry,
  openingLeadSourceOfferJournalId,
  proveOpeningLeadSourceJournal,
  type OpeningLeadSourceJournalProof,
} from "./opening_lead_source_journal.js";
import {
  openingPreparationLegacyJournalEntry,
  openingPreparationLegacySourceWorldHash,
  openingPreparationOfferJournalEntry,
  proveOpeningPreparationJournal,
  type OpeningPreparationJournalProof,
} from "./opening_preparation_journal.js";
import {
  openingReliefAllocationLegacyJournalEntry,
  openingReliefAllocationLegacySourceWorldHash,
  proveOpeningReliefAllocationJournal,
  type OpeningReliefAllocationJournalProof,
} from "./opening_relief_allocation_journal.js";
import { applyOpeningReliefAllocationOption } from "./opening_relief_allocation.js";
import {
  openingRegistrationLegacyJournalDraft,
  openingRegistrationLegacySourceWorldHash,
  proveOpeningRegistrationJournal,
  type OpeningRegistrationJournalProof,
} from "./opening_registration_journal.js";
import { parseTimeLabel, timeLabel } from "./session_journal_codec.js";
import { parseGoalPassageJourneyActionId } from "./session_goal_passage.js";

export const OVERWORLD_PRE_CAMPAIGN_EXPORTS_WORLD_HASH =
  "39d32c027d2e826f476dd299bb95cc3911994ec92b4fbf297be8d1216e5b6151";
export const OVERWORLD_CAMPAIGN_EXPORTS_WORLD_HASH =
  "b9416e3c43d9d54085ed9465b4d875811daebaf9834793d3f4a1ffca93b486c4";
export const OVERWORLD_CAMPAIGN_IMPORTS_WORLD_HASH =
  "cad75dafc291709f1d5c756dd70dd1002260bb06ca87d8e1e90aaf905f5f05c7";
export const OVERWORLD_OPENING_REGISTRATION_WORLD_HASH =
  "1d12330f65743a8a2c124f9dae3cf145e6fdcbca9ec59a4c699ecd8757e8e47b";
export const OVERWORLD_OPENING_LEAD_SOURCE_WORLD_HASH =
  "07c2864bcad6eaadbd32e8ecff4460ddb7b63e6ed36b0316f4264aa866c1aa44";
/** @deprecated Historical name retained for callers that identify the exports-era manifest. */
export const OVERWORLD_CAMPAIGN_EXPORTS_MIGRATION_TARGET_WORLD_HASH =
  OVERWORLD_CAMPAIGN_EXPORTS_WORLD_HASH;
// Updated whenever the trusted manifest changes. Prior hashes are accepted only
// when they migrate directly into this exact manifest revision.
export const OVERWORLD_CAMPAIGN_SERVICE_WORLD_HASH =
  "2dbc97e2de8063be7b3a49fe3cb9108e8f80270d7d118efd781381659dba97c4";
const OVERWORLD_CAMPAIGN_SERVICE_WORLD_RULE_IDS: ReadonlySet<string> = new Set([
  "albany:wolf_saved_timber_quick_resupply",
  "albany:wolf_barred_gate_quick_rest",
  "albany:dawn_wagon_solo_packet_resupply",
  "albany:dawn_wardens_greenway_rest",
]);
const OVERWORLD_CAMPAIGN_SERVICE_WORLD_WOLF_OUTCOME_IDS: ReadonlySet<string> = new Set([
  "ending_held_gate_barred",
  "ending_held_timber_saved",
  "ending_held",
]);
export const OVERWORLD_CAMPAIGN_SERVICE_MIGRATION_TARGET_WORLD_HASH =
  "742aa205a254b6f4382749fb63742caf1606024a1f6c044c2f433fda8dac6090";
export const OVERWORLD_OPENING_PREPARATION_PREDECESSOR_WORLD_HASH =
  OVERWORLD_CAMPAIGN_SERVICE_MIGRATION_TARGET_WORLD_HASH;
const OVERWORLD_OPENING_PREPARATION_WORLD_RULE_IDS: ReadonlySet<string> = new Set([
  "albany:wolf_live_pack_greenway_resupply",
  "albany:wolf_works_fortification_return_resupply",
  "albany:wolf_drover_route_return_rest",
  "albany:wolf_relief_protocol_return_resupply",
  "albany:wolf_saved_timber_quick_resupply",
  "albany:wolf_barred_gate_quick_rest",
  "albany:dawn_wagon_solo_packet_resupply",
  "albany:dawn_wardens_greenway_rest",
]);
const OVERWORLD_OPENING_PREPARATION_WORLD_WOLF_OUTCOME_IDS: ReadonlySet<string> = new Set([
  "ending_pack_diverted_after_blood",
  "ending_pack_diverted_cattle_scattered",
  "ending_pack_diverted",
  "ending_held_gate_barred",
  "ending_held_timber_saved",
  "ending_held",
]);
export const OVERWORLD_OPENING_ALLY_PREDECESSOR_WORLD_HASH =
  "f5835e15e6ccf5432ea6b39b87edf957ebc3ffb8a2518b48b46098f09aa92572";
// Exact F04 manifest. Keep this historical value pinned: the current manifest
// accepts it only through the bounded crisis-priority migration below.
export const OVERWORLD_OPENING_ALLY_WORLD_HASH =
  "2d10f959279a12166d521a774779acc46481fb6ff40d5982f9c955a30677a7b6";
export const OVERWORLD_CRISIS_PRIORITY_PREDECESSOR_WORLD_HASH = OVERWORLD_OPENING_ALLY_WORLD_HASH;
const OVERWORLD_CRISIS_PRIORITY_PREDECESSOR_JUNE_BASE_CONTACT = Object.freeze({
  id: "talk:albany_city__transport_hub__june_pike",
  kind: "contact" as const,
  title: "Talked to June Pike",
  text: "June Pike checks a cattle rope, hooded lantern, and one empty field seat beside Hayden Hale's Wolf-Winter packet. June will ride only with cattle-first authority of her own. She offers one herd-pressure intervention after a bloodless recovery, not another spear, and remains in Albany if that condition is refused.",
});
const OVERWORLD_CRISIS_PRIORITY_PREDECESSOR_ALLY_OFFER = Object.freeze({
  id: "ally_offer:albany:wolf_ally_commitment",
  kind: "ally_offer" as const,
  title: "Choose the Wolf-Winter Field Team",
  text: "June Pike has one Road-Warden field seat beside Hayden's outgoing packet. She can ride with you, but only under a named division of authority; leaving without that agreement sends the relief rider alone and does not delay the dispatch. Capability: After a failed living-pack lure is recovered without blood, June can leave the wolf line at the final byre threshold and take the cattle line, lowering cattle alarm by 1. Condition: June keeps cattle-first authority. She will not become an extra hunter, and the first wolf killed ends her place on the field team.",
});
const OVERWORLD_CRISIS_PRIORITY_PREDECESSOR_JUNE_SELECTION = Object.freeze({
  id: "ally:albany:wolf_ally_commitment:albany:ally_june_cattle_first",
  kind: "ally" as const,
  title: "Field team: Grant June Cattle-First Authority",
  text: "Ask June Pike to ride as an independent Road-Warden ally. The briefing takes 15 minutes. June joins the field team and records your promise that she chooses the cattle line if the recovered lure still leaves the herd pressing. Her help is one pressure intervention, never a combat bonus; any wolf death ends the agreement. Actual cost: 15 minutes. June signs beside your name, takes the second field seat, and remembers that you granted rather than merely borrowed her authority.",
});
const OVERWORLD_CRISIS_PRIORITY_PREDECESSOR_JUNE_JOINED_CONTACT = Object.freeze({
  id: "talk:albany_city__transport_hub__june_pike@joined_wolf_cattle_first",
  kind: "contact" as const,
  title: "Talked to June Pike",
  text: "June has signed the Wolf-Winter field line beside your name and remembers that cattle-first authority was granted explicitly. She will take the cattle line after a failed lure is recovered alive, but the first wolf killed ends her place on the team.",
});
const OVERWORLD_CRISIS_PRIORITY_PREDECESSOR_JUNE_LEFT_CONTACT = Object.freeze({
  id: "talk:albany_city__transport_hub__june_pike@left_after_blood",
  kind: "contact" as const,
  title: "Talked to June Pike",
  text: "June's field seat is empty. Her separate return says first blood broke the cattle-first line before she could take the lower rail. The promise is recorded broken, June has left the party, and no ally return claim is available; the completed Wolf-Winter result still stands.",
});
const OVERWORLD_CRISIS_PRIORITY_PREDECESSOR_WORLD_RULE_IDS: ReadonlySet<string> = new Set([
  "albany:wolf_live_pack_greenway_resupply",
  "albany:wolf_works_fortification_return_resupply",
  "albany:wolf_drover_route_return_rest",
  "albany:wolf_relief_protocol_return_resupply",
  "albany:june_kept_line_station_resupply",
  "albany:june_relay_refusal_station_rest",
  "albany:wolf_saved_timber_quick_resupply",
  "albany:wolf_barred_gate_quick_rest",
  "albany:dawn_wagon_solo_packet_resupply",
  "albany:dawn_wardens_greenway_rest",
]);
const OVERWORLD_CRISIS_PRIORITY_PREDECESSOR_WOLF_OUTCOME_IDS: ReadonlySet<string> = new Set([
  "ending_pack_diverted_after_blood",
  "ending_pack_diverted_cattle_scattered",
  "ending_pack_diverted",
  "ending_held_gate_barred",
  "ending_held_timber_saved",
  "ending_held",
]);
export const OVERWORLD_CRISIS_PRIORITY_WORLD_HASH =
  "1e74d32c28c3d563f6e8103034768506e25f13ff1f8e410b190cbb344589add8";
export const OVERWORLD_FORTIFY_OUTLAST_PREDECESSOR_WORLD_HASH =
  OVERWORLD_CRISIS_PRIORITY_WORLD_HASH;
const OVERWORLD_FORTIFY_OUTLAST_PREDECESSOR_JUNE_BASE_CONTACT = Object.freeze({
  id: "talk:albany_city__transport_hub__june_pike",
  kind: "contact" as const,
  title: "Talked to June Pike",
  text: "June Pike checks a cattle rope, hooded lantern, and one empty field seat beside Hayden Hale's Wolf-Winter packet. June will ride only with cattle-first authority of her own. She offers one herd-pressure intervention after a bloodless recovery, not another spear, and remains in Albany if that condition is refused.",
});
const OVERWORLD_FORTIFY_OUTLAST_PREDECESSOR_ALLY_OFFER = Object.freeze({
  id: "ally_offer:albany:wolf_ally_commitment",
  kind: "ally_offer" as const,
  title: "Choose the Wolf-Winter Field Team",
  text: "June Pike has one Road-Warden field seat beside Hayden's outgoing packet. She can ride with you, but only under a named division of authority; leaving without that agreement sends the relief rider alone and does not delay the dispatch. Capability: On a bloodless living-pack line, June can leave the wolf line at the final byre threshold and take the cattle line once: she lowers cattle alarm after a recovered lure or opens the lower swing gate during a committed drive. Condition: June keeps cattle-first authority. She will not become an extra hunter, and the first wolf killed ends her place on the field team.",
});
const OVERWORLD_FORTIFY_OUTLAST_PREDECESSOR_JUNE_SELECTION = Object.freeze({
  id: "ally:albany:wolf_ally_commitment:albany:ally_june_cattle_first",
  kind: "ally" as const,
  title: "Field team: Grant June Cattle-First Authority",
  text: "Ask June Pike to ride as an independent Road-Warden ally. The briefing takes 15 minutes. June joins the field team and records your promise that she chooses the cattle line if a recovered lure leaves the herd pressing or a committed drive reaches the final threshold. Her help is one pressure intervention, never a combat bonus; any wolf death ends the agreement. Actual cost: 15 minutes. June signs beside your name, takes the second field seat, and remembers that you granted rather than merely borrowed her authority.",
});
const OVERWORLD_FORTIFY_OUTLAST_PREDECESSOR_JUNE_JOINED_CONTACT = Object.freeze({
  id: "talk:albany_city__transport_hub__june_pike@joined_wolf_cattle_first",
  kind: "contact" as const,
  title: "Talked to June Pike",
  text: "June has signed the Wolf-Winter field line beside your name and remembers that cattle-first authority was granted explicitly. She will take the cattle line once after a failed lure is recovered alive or when a committed drive reaches its final threshold, but the first wolf killed ends her place on the team.",
});
const OVERWORLD_FORTIFY_OUTLAST_PREDECESSOR_WORLD_RULE_IDS: ReadonlySet<string> = new Set([
  "albany:wolf_works_fortification_return_resupply",
  "albany:wolf_drover_route_return_rest",
  "albany:wolf_relief_protocol_return_resupply",
  "albany:wolf_live_pack_greenway_resupply",
  "albany:wolf_drive_reserve_returned_station_rest",
  "albany:wolf_drive_whole_herd_greenway_resupply",
  "albany:june_kept_line_station_resupply",
  "albany:june_relay_refusal_station_rest",
  "albany:wolf_saved_timber_quick_resupply",
  "albany:wolf_barred_gate_quick_rest",
  "albany:dawn_wagon_solo_packet_resupply",
  "albany:dawn_wardens_greenway_rest",
]);
const OVERWORLD_FORTIFY_OUTLAST_PREDECESSOR_DAWN_WAGON_SERVICE = Object.freeze({
  id: "albany:dawn_wagon_solo_packet_resupply",
  summary:
    "Because you assigned the dawn wagon to rebuild Cade's outer line, Jamie Tanner holds a one-time Market road-store credit for carrying Hedrick's packet alone.",
});
const OVERWORLD_FORTIFY_OUTLAST_PREDECESSOR_WOLF_OUTCOME_IDS: ReadonlySet<string> = new Set([
  "ending_pack_diverted_after_blood",
  "ending_pack_diverted_cattle_scattered",
  "ending_pack_diverted",
  "ending_drive_cattle_wounded",
  "ending_drive_person_cattle_lost",
  "ending_drive_reserve_spent",
  "ending_held_gate_barred",
  "ending_held_timber_saved",
  "ending_held",
]);
export const OVERWORLD_FORTIFY_OUTLAST_WORLD_HASH =
  "abd3b623a502b688a501bceae68994a4eb0e591d450420b5093532b5dae22179";
export const OVERWORLD_HILL_APPROACH_PREDECESSOR_WORLD_HASH = OVERWORLD_FORTIFY_OUTLAST_WORLD_HASH;
const OVERWORLD_HILL_APPROACH_PREDECESSOR_WORLD_RULE_IDS: ReadonlySet<string> = new Set([
  "albany:dawn_wagon_solo_packet_resupply",
  "albany:dawn_wardens_greenway_rest",
  "albany:june_kept_line_station_resupply",
  "albany:june_relay_refusal_station_rest",
  "albany:wolf_barred_gate_quick_rest",
  "albany:wolf_drive_reserve_returned_station_rest",
  "albany:wolf_drive_whole_herd_greenway_resupply",
  "albany:wolf_drover_route_return_rest",
  "albany:wolf_fortified_albany_authority_station_rest",
  "albany:wolf_fortified_cade_terms_station_resupply",
  "albany:wolf_live_pack_greenway_resupply",
  "albany:wolf_relief_protocol_return_resupply",
  "albany:wolf_saved_timber_quick_resupply",
  "albany:wolf_works_fortification_return_resupply",
]);
const OVERWORLD_HILL_APPROACH_PREDECESSOR_WOLF_OUTCOME_IDS: ReadonlySet<string> = new Set([
  "ending_drive_cattle_wounded",
  "ending_drive_person_cattle_lost",
  "ending_drive_reserve_spent",
  "ending_fortified_albany_authority",
  "ending_fortified_cade_terms",
  "ending_held",
  "ending_held_gate_barred",
  "ending_held_timber_saved",
  "ending_pack_diverted",
  "ending_pack_diverted_after_blood",
  "ending_pack_diverted_cattle_scattered",
]);
export const OVERWORLD_HILL_APPROACH_WORLD_HASH =
  "634fd4e93143343fd813edd9c59d3a8c098c0d78b94497cf689988492de154e3";
export const OVERWORLD_RELIEF_ALLOCATION_PREDECESSOR_WORLD_HASH =
  OVERWORLD_HILL_APPROACH_WORLD_HASH;
export const OVERWORLD_RELIEF_ALLOCATION_WORLD_HASH =
  "50350884ebb7d118849fca040256a19c0c63ed4bfe3353d4cd202ee7a6ba8e7f";
const OVERWORLD_RELIEF_ALLOCATION_PREDECESSOR_WORLD_RULE_IDS =
  OVERWORLD_HILL_APPROACH_PREDECESSOR_WORLD_RULE_IDS;
const OVERWORLD_RELIEF_ALLOCATION_PREDECESSOR_WOLF_OUTCOME_IDS =
  OVERWORLD_HILL_APPROACH_PREDECESSOR_WOLF_OUTCOME_IDS;
const OVERWORLD_RELIEF_ALLOCATION_CHARACTER_IDS: ReadonlySet<string> = new Set([
  "albany:knowledge_relief_cade_fodder",
  "albany:knowledge_relief_resident_shelter",
  "albany:knowledge_relief_mobile_reserve",
  "albany:memory_emery_relief_cade_fodder_allocated",
  "albany:memory_jamie_relief_resident_shelter_allocated",
  "albany:memory_hayden_relief_mobile_reserve_allocated",
]);
const OVERWORLD_ALLY_ERA_WOLF_START = Object.freeze({
  id: "quest:wolf_winter",
  kind: "quest" as const,
  title: "Started The Wolf-Winter",
  text: "You turn the local lead \"A winter-relief tag moves from Albany's civic records to the Albany Station Quarter route desk: Old Cade's hill steading, a cattle byre, and a wolf pack coming down with the weather. The live dispatch has June Pike's optional second field seat, but starting without her cattle-first bond sends the relief rider alone on the established route.\" into an active quest.",
});
const OVERWORLD_PRE_ALLY_WOLF_START = Object.freeze({
  id: "quest:wolf_winter",
  kind: "quest" as const,
  title: "Started The Wolf-Winter",
  text: "You turn the local lead \"A winter-relief tag moves from Albany's civic records to the Albany Station Quarter route desk: Old Cade's hill steading, a cattle byre, and a wolf pack coming down with the weather. The Wolf-Winter lead is the live dispatch attached to that hill road.\" into an active quest.",
});
const OVERWORLD_HILL_APPROACH_ROUTE_CHARACTER_IDS: ReadonlySet<string> = new Set([
  "albany:knowledge_wolf_exposed_ridge",
  "albany:knowledge_wolf_sheltered_stockway",
  "albany:memory_hayden_dispatched_exposed_ridge",
  "albany:memory_hayden_dispatched_sheltered_stockway",
]);
/** @deprecated Preparation-era current-target name retained for callers. */
export const OVERWORLD_OPENING_PREPARATION_WORLD_HASH = OVERWORLD_RELIEF_ALLOCATION_WORLD_HASH;
export const OVERWORLD_OPENING_PREPARATION_MIGRATION_TARGET_WORLD_HASH =
  OVERWORLD_RELIEF_ALLOCATION_WORLD_HASH;
/** @deprecated Lead-source target name retained as the current-target alias. */
export const OVERWORLD_OPENING_LEAD_SOURCE_MIGRATION_TARGET_WORLD_HASH =
  OVERWORLD_OPENING_PREPARATION_MIGRATION_TARGET_WORLD_HASH;
/** @deprecated Registration-era target name retained as the current-target alias. */
export const OVERWORLD_OPENING_REGISTRATION_MIGRATION_TARGET_WORLD_HASH =
  OVERWORLD_OPENING_LEAD_SOURCE_MIGRATION_TARGET_WORLD_HASH;
/** @deprecated Current target alias retained for existing callers. */
export const OVERWORLD_CAMPAIGN_IMPORTS_MIGRATION_TARGET_WORLD_HASH =
  OVERWORLD_OPENING_REGISTRATION_MIGRATION_TARGET_WORLD_HASH;

const OVERWORLD_OPENING_REGISTRATION_TRUSTED_PREDECESSOR_WORLD_HASHES: ReadonlySet<string> =
  new Set([
    OVERWORLD_PRE_CAMPAIGN_EXPORTS_WORLD_HASH,
    OVERWORLD_CAMPAIGN_EXPORTS_WORLD_HASH,
    OVERWORLD_CAMPAIGN_IMPORTS_WORLD_HASH,
  ]);

const OVERWORLD_OPENING_PREPARATION_TRUSTED_LEGACY_WORLD_HASHES: ReadonlySet<string> = new Set([
  OVERWORLD_OPENING_LEAD_SOURCE_WORLD_HASH,
  OVERWORLD_CAMPAIGN_SERVICE_WORLD_HASH,
  OVERWORLD_OPENING_PREPARATION_PREDECESSOR_WORLD_HASH,
]);

const OVERWORLD_LEGACY_WOLF_START_BY_WORLD_HASH: ReadonlyMap<
  string,
  Readonly<{
    era: string;
    entry: Readonly<{ id: string; kind: "quest"; title: string; text: string }>;
  }>
> = new Map([
  [
    OVERWORLD_HILL_APPROACH_PREDECESSOR_WORLD_HASH,
    { era: "F11", entry: OVERWORLD_ALLY_ERA_WOLF_START },
  ],
  [
    OVERWORLD_FORTIFY_OUTLAST_PREDECESSOR_WORLD_HASH,
    { era: "F10", entry: OVERWORLD_ALLY_ERA_WOLF_START },
  ],
  [
    OVERWORLD_CRISIS_PRIORITY_PREDECESSOR_WORLD_HASH,
    { era: "F04", entry: OVERWORLD_ALLY_ERA_WOLF_START },
  ],
  [
    OVERWORLD_OPENING_ALLY_PREDECESSOR_WORLD_HASH,
    { era: "pre-ally", entry: OVERWORLD_PRE_ALLY_WOLF_START },
  ],
  [
    OVERWORLD_OPENING_PREPARATION_PREDECESSOR_WORLD_HASH,
    { era: "pre-preparation", entry: OVERWORLD_PRE_ALLY_WOLF_START },
  ],
  [
    OVERWORLD_CAMPAIGN_SERVICE_WORLD_HASH,
    { era: "campaign-service", entry: OVERWORLD_PRE_ALLY_WOLF_START },
  ],
  [
    OVERWORLD_OPENING_LEAD_SOURCE_WORLD_HASH,
    { era: "pre-lead-source", entry: OVERWORLD_PRE_ALLY_WOLF_START },
  ],
  [
    OVERWORLD_OPENING_REGISTRATION_WORLD_HASH,
    { era: "registration", entry: OVERWORLD_PRE_ALLY_WOLF_START },
  ],
  [
    OVERWORLD_PRE_CAMPAIGN_EXPORTS_WORLD_HASH,
    { era: "pre-campaign-exports", entry: OVERWORLD_PRE_ALLY_WOLF_START },
  ],
  [
    OVERWORLD_CAMPAIGN_EXPORTS_WORLD_HASH,
    { era: "campaign-exports", entry: OVERWORLD_PRE_ALLY_WOLF_START },
  ],
  [
    OVERWORLD_CAMPAIGN_IMPORTS_WORLD_HASH,
    { era: "campaign-imports", entry: OVERWORLD_PRE_ALLY_WOLF_START },
  ],
]);
const OVERWORLD_QUEST_START_TRUSTED_LEGACY_WORLD_HASHES: ReadonlySet<string> = new Set(
  OVERWORLD_LEGACY_WOLF_START_BY_WORLD_HASH.keys(),
);

type TrustedMigrationEra =
  | "relief_allocation"
  | "hill_approach"
  | "fortify_outlast"
  | "crisis_priority"
  | "opening_ally"
  | "opening_preparation"
  | "campaign_service"
  | "opening_lead_source"
  | "opening_registration"
  | "pre_registration"
  | null;

type OpeningRegistrationLegacyJournalProof = Readonly<{
  entry: OverworldJournalEntry;
  journalIndex: number;
  sourceWorldHash: string;
}>;

function normalizeCrisisPriorityPredecessorAllyJournalCopy(args: {
  currentContacts: ReadonlyMap<string, Readonly<{ id: string; text: string; title: string }>>;
  currentJuneSelection: Readonly<{ id: string; text: string; title: string }>;
  currentOffer: Readonly<{ id: string; text: string; title: string }>;
  journalEntries: readonly OverworldJournalEntry[];
}): OverworldJournalEntry[] {
  return args.journalEntries.map((entry) => {
    const repeatedContact = /^(.*):(\d+)$/.exec(entry.id);
    const canonicalEntryId =
      repeatedContact !== null && Number(repeatedContact[2]) === parseTimeLabel(entry.recordedAt)
        ? repeatedContact[1]!
        : entry.id;
    const predecessor =
      canonicalEntryId === OVERWORLD_CRISIS_PRIORITY_PREDECESSOR_JUNE_BASE_CONTACT.id
        ? OVERWORLD_CRISIS_PRIORITY_PREDECESSOR_JUNE_BASE_CONTACT
        : canonicalEntryId === OVERWORLD_CRISIS_PRIORITY_PREDECESSOR_ALLY_OFFER.id
          ? OVERWORLD_CRISIS_PRIORITY_PREDECESSOR_ALLY_OFFER
          : canonicalEntryId === OVERWORLD_CRISIS_PRIORITY_PREDECESSOR_JUNE_SELECTION.id
            ? OVERWORLD_CRISIS_PRIORITY_PREDECESSOR_JUNE_SELECTION
            : canonicalEntryId === OVERWORLD_CRISIS_PRIORITY_PREDECESSOR_JUNE_JOINED_CONTACT.id
              ? OVERWORLD_CRISIS_PRIORITY_PREDECESSOR_JUNE_JOINED_CONTACT
              : canonicalEntryId === OVERWORLD_CRISIS_PRIORITY_PREDECESSOR_JUNE_LEFT_CONTACT.id
                ? OVERWORLD_CRISIS_PRIORITY_PREDECESSOR_JUNE_LEFT_CONTACT
                : null;
    if (predecessor === null) return entry;
    if (
      entry.title !== predecessor.title ||
      entry.text !== predecessor.text ||
      entry.kind !== predecessor.kind
    ) {
      throw new Error(
        `Crisis-priority predecessor ally journal entry "${entry.id}" does not match its exact F04 authored copy.`,
      );
    }
    const current =
      canonicalEntryId === OVERWORLD_CRISIS_PRIORITY_PREDECESSOR_ALLY_OFFER.id
        ? args.currentOffer
        : canonicalEntryId === OVERWORLD_CRISIS_PRIORITY_PREDECESSOR_JUNE_SELECTION.id
          ? args.currentJuneSelection
          : args.currentContacts.get(canonicalEntryId);
    if (current?.id !== canonicalEntryId) {
      throw new Error(
        `Crisis-priority predecessor ally journal entry "${entry.id}" has no current authored counterpart.`,
      );
    }
    return Object.freeze({ ...entry, title: current.title, text: current.text });
  });
}

function normalizeFortifyOutlastPredecessorAllyJournalCopy(args: {
  currentContacts: ReadonlyMap<string, Readonly<{ id: string; text: string; title: string }>>;
  currentJuneSelection: Readonly<{ id: string; text: string; title: string }>;
  currentOffer: Readonly<{ id: string; text: string; title: string }>;
  journalEntries: readonly OverworldJournalEntry[];
}): OverworldJournalEntry[] {
  return args.journalEntries.map((entry) => {
    const repeatedContact = /^(.*):(\d+)$/.exec(entry.id);
    const canonicalEntryId =
      repeatedContact !== null && Number(repeatedContact[2]) === parseTimeLabel(entry.recordedAt)
        ? repeatedContact[1]!
        : entry.id;
    const predecessor =
      canonicalEntryId === OVERWORLD_FORTIFY_OUTLAST_PREDECESSOR_JUNE_BASE_CONTACT.id
        ? OVERWORLD_FORTIFY_OUTLAST_PREDECESSOR_JUNE_BASE_CONTACT
        : canonicalEntryId === OVERWORLD_FORTIFY_OUTLAST_PREDECESSOR_ALLY_OFFER.id
          ? OVERWORLD_FORTIFY_OUTLAST_PREDECESSOR_ALLY_OFFER
          : canonicalEntryId === OVERWORLD_FORTIFY_OUTLAST_PREDECESSOR_JUNE_SELECTION.id
            ? OVERWORLD_FORTIFY_OUTLAST_PREDECESSOR_JUNE_SELECTION
            : canonicalEntryId === OVERWORLD_FORTIFY_OUTLAST_PREDECESSOR_JUNE_JOINED_CONTACT.id
              ? OVERWORLD_FORTIFY_OUTLAST_PREDECESSOR_JUNE_JOINED_CONTACT
              : null;
    if (predecessor === null) return entry;
    if (
      entry.title !== predecessor.title ||
      entry.text !== predecessor.text ||
      entry.kind !== predecessor.kind
    ) {
      throw new Error(
        `Fortify-outlast predecessor ally journal entry "${entry.id}" does not match its exact F10 authored copy.`,
      );
    }
    const current =
      canonicalEntryId === OVERWORLD_FORTIFY_OUTLAST_PREDECESSOR_ALLY_OFFER.id
        ? args.currentOffer
        : canonicalEntryId === OVERWORLD_FORTIFY_OUTLAST_PREDECESSOR_JUNE_SELECTION.id
          ? args.currentJuneSelection
          : args.currentContacts.get(canonicalEntryId);
    if (current?.id !== canonicalEntryId) {
      throw new Error(
        `Fortify-outlast predecessor ally journal entry "${entry.id}" has no current authored counterpart.`,
      );
    }
    return Object.freeze({ ...entry, title: current.title, text: current.text });
  });
}

function normalizePreFortifyAlbanyWagonJournalTitle(
  journalEntries: readonly OverworldJournalEntry[],
): OverworldJournalEntry[] {
  return journalEntries.map((entry) => {
    if (
      entry.kind !== "campaign" ||
      !/^campaign_goal:\d+:carry_hedricks_packet_north$/.test(entry.id)
    ) {
      return entry;
    }
    if (entry.title === "Send the wagon and wardens north") {
      return entry;
    }
    if (entry.title !== "Send the wagon to rebuild Cade's outer line") {
      throw new Error(
        `Fortify-outlast predecessor campaign journal entry "${entry.id}" does not match its exact pre-F11 authored title.`,
      );
    }
    return Object.freeze({ ...entry, title: "Send the wagon back to Cade" });
  });
}

function normalizePreFortifyDawnWagonServiceJournalCopy(args: {
  indexes: OverworldSnapshotManifestIndex;
  journalEntries: readonly OverworldJournalEntry[];
}): OverworldJournalEntry[] {
  const currentRule = args.indexes.campaignServiceRulesById.get(
    OVERWORLD_FORTIFY_OUTLAST_PREDECESSOR_DAWN_WAGON_SERVICE.id,
  );
  if (!currentRule) {
    throw new Error("Fortify-outlast migration target has no dawn-wagon campaign service.");
  }
  const predecessorPrefix = `${OVERWORLD_FORTIFY_OUTLAST_PREDECESSOR_DAWN_WAGON_SERVICE.summary} `;
  const currentPrefix = `${currentRule.summary.trim()} `;
  return args.journalEntries.map((entry) => {
    if (
      entry.kind !== "service" ||
      entry.serviceRuleId !== OVERWORLD_FORTIFY_OUTLAST_PREDECESSOR_DAWN_WAGON_SERVICE.id
    ) {
      return entry;
    }
    if (!entry.text.startsWith(predecessorPrefix)) {
      throw new Error(
        `Fortify-outlast predecessor service journal entry "${entry.id}" does not match its exact pre-F11 authored summary.`,
      );
    }
    return Object.freeze({
      ...entry,
      text: `${currentPrefix}${entry.text.slice(predecessorPrefix.length)}`,
    });
  });
}

function proveOpeningRegistrationLegacyJournal(args: {
  completedQuestIds: ReadonlySet<string>;
  discoveredAreaIds: ReadonlySet<string>;
  indexes: OverworldSnapshotManifestIndex;
  journalEntries: readonly OverworldJournalEntry[];
  migratesFromPreRegistrationManifest: boolean;
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
  if (args.migratesFromPreRegistrationManifest) {
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

function proveOpeningLeadSourceDecisionTrail(args: {
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
    expectedAnchorId === undefined ||
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

  const sourceDecisionPrefix =
    args.sourceSceneId === null ? null : `campaign_story:${args.sourceSceneId}:`;
  let proofHash = trail.baseDecisionProofHash;
  for (const [index, decision] of trail.decisions.entries()) {
    const expectedNumber = trail.baseAcceptedDecisions + index + 1;
    if (decision.number !== expectedNumber) {
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
  } else if (args.leadSourceProof.option !== null) {
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
    if (
      sourceDecisionPrefix !== null &&
      trail.decisions
        .slice(1)
        .some((decision) => decision.actionId.startsWith(sourceDecisionPrefix))
    ) {
      throw new Error(
        "Overworld session snapshot lead-source decision trail contains more than one source selection.",
      );
    }
  }

  return cloneOpeningLeadSourceDecisionTrail(trail);
}

function assertOpeningPreparationDecisionTrail(args: {
  preparationProof: OpeningPreparationJournalProof;
  preparationSceneId: string | null;
  trail: OverworldOpeningLeadSourceDecisionTrail | null;
}): void {
  const prefix =
    args.preparationSceneId === null ? null : `campaign_story:${args.preparationSceneId}:`;
  const preparationDecisions =
    prefix === null
      ? []
      : (args.trail?.decisions.filter((decision) => decision.actionId.startsWith(prefix)) ?? []);

  if (args.preparationProof.legacy || !args.preparationProof.offered) {
    if (preparationDecisions.length > 0) {
      throw new Error(
        "Overworld session snapshot preparation decision trail conflicts with its legacy or absent preparation evidence.",
      );
    }
    return;
  }

  if (args.preparationProof.profile === null) {
    if (preparationDecisions.length > 0) {
      throw new Error(
        "Overworld session snapshot pending preparation offer has a preparation decision in its journey suffix.",
      );
    }
    return;
  }

  const boundary = args.preparationProof.selectionBoundary;
  const expectedDecision =
    boundary === null || args.preparationSceneId === null
      ? null
      : {
          number: boundary.acceptedDecisions,
          surface: "overworld" as const,
          actionId: `campaign_story:${args.preparationSceneId}:${args.preparationProof.profile.id}`,
          reason: "situation_changed" as const,
        };
  if (
    expectedDecision === null ||
    preparationDecisions.length !== 1 ||
    JSON.stringify(preparationDecisions[0]) !== JSON.stringify(expectedDecision)
  ) {
    throw new Error(
      "Overworld session snapshot selected preparation does not have exactly one canonical journey decision proof.",
    );
  }
}

function assertOpeningReliefAllocationDecisionTrail(args: {
  reliefAllocationProof: OpeningReliefAllocationJournalProof;
  reliefAllocationSceneId: string | null;
  trail: OverworldOpeningLeadSourceDecisionTrail | null;
}): void {
  const prefix =
    args.reliefAllocationSceneId === null
      ? null
      : `campaign_story:${args.reliefAllocationSceneId}:`;
  const allocationDecisions =
    prefix === null
      ? []
      : (args.trail?.decisions.filter((decision) => decision.actionId.startsWith(prefix)) ?? []);
  if (args.reliefAllocationProof.legacy || !args.reliefAllocationProof.offered) {
    if (allocationDecisions.length > 0) {
      throw new Error(
        "Overworld session snapshot relief allocation decision trail conflicts with absent or legacy evidence.",
      );
    }
    return;
  }
  if (args.reliefAllocationProof.option === null) {
    if (allocationDecisions.length > 0) {
      throw new Error(
        "Overworld session snapshot pending relief allocation has a selection decision in its journey suffix.",
      );
    }
    return;
  }
  const boundary = args.reliefAllocationProof.selectionBoundary;
  const expectedDecision =
    boundary === null || args.reliefAllocationSceneId === null
      ? null
      : {
          number: boundary.acceptedDecisions,
          surface: "overworld" as const,
          actionId: `campaign_story:${args.reliefAllocationSceneId}:${args.reliefAllocationProof.option.id}`,
          reason: "situation_changed" as const,
        };
  if (
    expectedDecision === null ||
    allocationDecisions.length !== 1 ||
    JSON.stringify(allocationDecisions[0]) !== JSON.stringify(expectedDecision)
  ) {
    throw new Error(
      "Overworld session snapshot selected relief allocation does not have exactly one canonical journey decision proof.",
    );
  }
}

function assertOpeningAllyDecisionTrail(args: {
  allyProof: OpeningAllyJournalProof;
  allySceneId: string | null;
  trail: OverworldOpeningLeadSourceDecisionTrail | null;
}): void {
  const prefix = args.allySceneId === null ? null : `campaign_story:${args.allySceneId}:`;
  const allyDecisions =
    prefix === null
      ? []
      : (args.trail?.decisions.filter((decision) => decision.actionId.startsWith(prefix)) ?? []);
  if (args.allyProof.legacy || !args.allyProof.offered) {
    if (allyDecisions.length > 0) {
      throw new Error(
        "Overworld session snapshot ally decision trail conflicts with absent or legacy ally evidence.",
      );
    }
    return;
  }
  if (args.allyProof.option === null) {
    if (allyDecisions.length > 0) {
      throw new Error(
        "Overworld session snapshot pending ally offer has an ally decision in its journey suffix.",
      );
    }
    return;
  }
  const boundary = args.allyProof.selectionBoundary;
  const expectedDecision =
    boundary === null || args.allySceneId === null
      ? null
      : {
          number: boundary.acceptedDecisions,
          surface: "overworld" as const,
          actionId: `campaign_story:${args.allySceneId}:${args.allyProof.option.id}`,
          reason: "situation_changed" as const,
        };
  if (
    expectedDecision === null ||
    allyDecisions.length !== 1 ||
    JSON.stringify(allyDecisions[0]) !== JSON.stringify(expectedDecision)
  ) {
    throw new Error(
      "Overworld session snapshot selected ally does not have exactly one canonical journey decision proof.",
    );
  }
}

function assertOpeningAllyCampaignBoundaryReplay(args: {
  allyProof: OpeningAllyJournalProof;
  allyContactId: string | null;
  campaignBoundaryReplay: OverworldCampaignBoundaryReplayIndex;
}): void {
  const boundaries = [
    ["offer", args.allyProof.offerBoundary],
    ["selection", args.allyProof.selectionBoundary],
  ] as const;
  for (const [label, boundary] of boundaries) {
    if (boundary === null) continue;
    const replayed = args.campaignBoundaryReplay.byAcceptedDecisions.get(
      boundary.acceptedDecisions,
    );
    if (
      !replayed ||
      replayed.decisionProofHash !== boundary.decisionProofHash ||
      replayed.townId !== boundary.townId ||
      replayed.areaId !== boundary.areaId ||
      (label === "offer" &&
        (args.allyContactId === null ||
          replayed.decision?.surface !== "overworld" ||
          replayed.decision.reason !== "substantive_dialogue" ||
          replayed.decision.actionId !== `talk:${args.allyContactId}`))
    ) {
      throw new Error(
        `Overworld session snapshot ally ${label} boundary does not match its replayed campaign decision proof and location.`,
      );
    }
  }
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
  const actionId = decision.actionId;
  const areaPrefix = "move_area:";
  if (actionId.startsWith(areaPrefix)) {
    if (decision.reason !== "movement") {
      throw new Error(
        `Overworld session snapshot lead-source decision trail area movement "${actionId}" has the wrong decision reason.`,
      );
    }
    const areaEdgeId = actionId.slice(areaPrefix.length);
    const edge = indexes.areaEdgesById.get(areaEdgeId);
    if (!edge) {
      throw new Error(
        `Overworld session snapshot lead-source decision trail references unknown area route "${areaEdgeId}".`,
      );
    }
    if (location.townId === null || location.areaId === null) return;
    if (edge.home !== location.townId) {
      throw new Error(
        `Overworld session snapshot lead-source decision trail area route "${areaEdgeId}" is not in town "${location.townId}".`,
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
        `Overworld session snapshot lead-source decision trail area route "${areaEdgeId}" is not reachable from "${location.areaId}".`,
      );
    }
    location.areaId = destinationAreaId;
    location.areaByTown.set(location.townId, destinationAreaId);
    return;
  }

  const travelPrefix = "travel:";
  if (actionId.startsWith(travelPrefix)) {
    if (decision.reason !== "movement") {
      throw new Error(
        `Overworld session snapshot lead-source decision trail road movement "${actionId}" has the wrong decision reason.`,
      );
    }
    replayCampaignTrailRoad(actionId.slice(travelPrefix.length), location, indexes, actionId);
    return;
  }

  const goalPassagePrefix = "follow_current_goal:";
  if (!actionId.startsWith(goalPassagePrefix)) return;
  if (decision.reason !== "movement") {
    throw new Error(
      `Overworld session snapshot lead-source decision trail goal passage "${actionId}" has the wrong decision reason.`,
    );
  }
  if (!actionId.includes(":via:")) {
    // F03 goal-passage decisions did not encode their traversed roads. They
    // remain loadable, but cannot establish a later campaign-service location.
    invalidateCampaignTrailLocation(location);
    location.travelProofOpaque = true;
    return;
  }
  const passage = parseGoalPassageJourneyActionId(actionId);
  if (!passage) {
    throw new Error(
      `Overworld session snapshot lead-source decision trail has malformed goal passage "${actionId}".`,
    );
  }
  for (const edgeId of passage.edgeIds) {
    replayCampaignTrailRoad(edgeId, location, indexes, actionId);
  }
}

function campaignBoundaryReplayIndex(args: {
  indexes: OverworldSnapshotManifestIndex;
  leadSourceProof: OpeningLeadSourceJournalProof;
  trail: OverworldOpeningLeadSourceDecisionTrail | null;
  travelEntries: readonly TravelLogEntrySnapshot[];
}): OverworldCampaignBoundaryReplayIndex {
  const byAcceptedDecisions = new Map<number, OverworldCampaignBoundaryReplayProof>();
  const boundary = args.leadSourceProof.offerBoundary;
  if (!args.trail || !boundary) {
    return {
      byAcceptedDecisions,
      worldFactProofOrdinalById: new Map(),
      storyChoiceProofOrdinalByKey: new Map(),
    };
  }
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
  return {
    byAcceptedDecisions,
    worldFactProofOrdinalById: new Map(),
    storyChoiceProofOrdinalByKey: new Map(),
  };
}

type ReplayedQuestStart = Readonly<{
  questId: string;
  journalIndex: number;
  effects: readonly CampaignConsequenceEffect[];
  returnSummary: string | null;
}>;

type ReplayedQuestStarts = Readonly<{
  characterAfter: CampaignCharacterState;
  journalEntries: readonly OverworldJournalEntry[];
  starts: readonly ReplayedQuestStart[];
}>;

function assertCanonicalQuestStartJournalCopy(args: {
  entry: OverworldJournalEntry;
  expectedTown: string;
  quest: OverworldQuest;
  approachId: string | null;
  sourceWorldHash: string | null;
}): void {
  const option =
    args.approachId === null
      ? null
      : (args.quest.launch?.options.find((candidate) => candidate.id === args.approachId) ?? null);
  if (args.approachId !== null && option === null) {
    throw new Error(
      `Overworld session snapshot quest launch "${args.entry.id}" references unknown approach "${args.approachId}".`,
    );
  }
  const canonicalIdentityMatches =
    args.entry.id === `quest:${args.quest.id}` &&
    args.entry.kind === "quest" &&
    args.entry.town === args.expectedTown &&
    args.entry.title === `Started ${args.quest.title}`;
  if (args.sourceWorldHash !== null) {
    if (!canonicalIdentityMatches) {
      throw new Error(
        `Overworld session snapshot legacy quest launch "${args.quest.id}" is not bound to its canonical identity.`,
      );
    }
    const trustedCopy =
      args.quest.id === "wolf_winter"
        ? OVERWORLD_LEGACY_WOLF_START_BY_WORLD_HASH.get(args.sourceWorldHash)
        : undefined;
    if (
      !trustedCopy ||
      args.entry.id !== trustedCopy.entry.id ||
      args.entry.kind !== trustedCopy.entry.kind ||
      args.entry.title !== trustedCopy.entry.title ||
      args.entry.text !== trustedCopy.entry.text
    ) {
      throw new Error(
        `Overworld session snapshot legacy quest launch "${args.quest.id}" does not match its exact ${trustedCopy?.era ?? "trusted-source"} authored copy.`,
      );
    }
    return;
  }
  const expectedText =
    `You turn the local lead "${args.quest.discovery}" into an active quest.` +
    (option === null ? "" : ` Approach: ${option.title}. ${option.consequence}`);
  if (!canonicalIdentityMatches || args.entry.text !== expectedText) {
    throw new Error(
      `Overworld session snapshot quest launch "${args.quest.id}" is not bound to its canonical journal copy.`,
    );
  }
}

function questStartDecisionBoundary(args: {
  boundary: OverworldJournalDecisionBoundary | undefined;
  campaignBoundaryReplay: OverworldCampaignBoundaryReplayIndex;
  entry: OverworldJournalEntry;
  expectedActionId: string;
  questId: string;
}): OverworldJournalDecisionBoundary {
  const actionPrefix = `quest_start:${args.questId}`;
  const decisions = [...args.campaignBoundaryReplay.byAcceptedDecisions.entries()].filter(
    ([, proof]) =>
      proof.decision?.actionId === actionPrefix ||
      proof.decision?.actionId.startsWith(`${actionPrefix}:`) === true,
  );
  if (decisions.length !== 1) {
    throw new Error(
      `Overworld session snapshot quest launch "${args.questId}" does not have exactly one canonical journey decision proof.`,
    );
  }
  const [acceptedDecisions, replay] = decisions[0]!;
  if (
    replay.decision?.surface !== "overworld" ||
    replay.decision.reason !== "situation_changed" ||
    replay.decision.actionId !== args.expectedActionId
  ) {
    throw new Error(
      `Overworld session snapshot quest launch "${args.questId}" does not match its selected approach decision.`,
    );
  }
  if (replay.townId === null || replay.areaId === null) {
    throw new Error(
      `Overworld session snapshot quest launch "${args.questId}" has no replayable town and area.`,
    );
  }
  const recordedAt = parseTimeLabel(args.entry.recordedAt);
  const boundary =
    args.boundary ??
    Object.freeze({
      acceptedDecisions,
      decisionProofHash: replay.decisionProofHash,
      townId: replay.townId,
      areaId: replay.areaId,
      minutes: recordedAt,
    });
  if (
    boundary.acceptedDecisions !== acceptedDecisions ||
    boundary.decisionProofHash !== replay.decisionProofHash ||
    boundary.townId !== replay.townId ||
    boundary.areaId !== replay.areaId ||
    boundary.minutes !== recordedAt
  ) {
    throw new Error(
      `Overworld session snapshot quest launch "${args.questId}" boundary does not match its accepted decision, location, and timestamp.`,
    );
  }
  return boundary;
}

function reliefAllocationLegacyBoundaryBeforeQuest(args: {
  campaignBoundaryReplay: OverworldCampaignBoundaryReplayIndex;
  entry: OverworldJournalEntry;
  quest: OverworldQuest;
}): OverworldJournalDecisionBoundary {
  const startProof = args.entry.questStartProof;
  if (!startProof) {
    throw new Error(
      "Relief-allocation legacy migration requires a replayed target-quest start proof.",
    );
  }
  const previousAcceptedDecisions = startProof.boundary.acceptedDecisions - 1;
  const previous = args.campaignBoundaryReplay.byAcceptedDecisions.get(previousAcceptedDecisions);
  if (!previous || previous.townId === null || previous.areaId === null) {
    throw new Error(
      "Relief-allocation legacy migration cannot recover the exact pre-start journey boundary.",
    );
  }
  const approachMinutes =
    startProof.kind === "approach"
      ? args.quest.launch?.options.find((option) => option.id === startProof.approachId)?.terms
          .minutes
      : 0;
  if (approachMinutes === undefined) {
    throw new Error(
      "Relief-allocation legacy migration references an unknown predecessor approach.",
    );
  }
  const minutes = startProof.boundary.minutes - approachMinutes;
  if (minutes < 0) {
    throw new Error(
      "Relief-allocation legacy migration produced an impossible pre-start timestamp.",
    );
  }
  return Object.freeze({
    acceptedDecisions: previousAcceptedDecisions,
    decisionProofHash: previous.decisionProofHash,
    townId: previous.townId,
    areaId: previous.areaId,
    minutes,
  });
}

function assertNoFortifyOutlastApproachEvidence(args: {
  campaignBoundaryReplay: OverworldCampaignBoundaryReplayIndex;
  character: CampaignCharacterState;
  journalEntries: readonly OverworldJournalEntry[];
}): void {
  if (args.journalEntries.some((entry) => entry.questStartProof !== undefined)) {
    throw new Error(
      "Fortify-outlast predecessor snapshot has quest-start proof evidence introduced by the hill-approach manifest.",
    );
  }
  if (
    [...args.campaignBoundaryReplay.byAcceptedDecisions.values()].some((proof) =>
      proof.decision?.actionId.startsWith("quest_start:wolf_winter:"),
    )
  ) {
    throw new Error(
      "Fortify-outlast predecessor snapshot has a route-labelled Wolf-Winter start decision introduced by the hill-approach manifest.",
    );
  }
  const hasRouteKnowledge = args.character.knowledge.some((id) =>
    OVERWORLD_HILL_APPROACH_ROUTE_CHARACTER_IDS.has(id),
  );
  const hasRouteMemory = args.character.relationships.some((relationship) =>
    relationship.memories.some((id) => OVERWORLD_HILL_APPROACH_ROUTE_CHARACTER_IDS.has(id)),
  );
  if (hasRouteKnowledge || hasRouteMemory) {
    throw new Error(
      "Fortify-outlast predecessor snapshot has route character evidence introduced by the hill-approach manifest.",
    );
  }
}

function replaySnapshotQuestStarts(args: {
  campaignBoundaryReplay: OverworldCampaignBoundaryReplayIndex;
  character: CampaignCharacterState;
  indexes: OverworldSnapshotManifestIndex;
  journalEntries: readonly OverworldJournalEntry[];
  migrationEra: TrustedMigrationEra;
  snapshotWorldHash: string;
  storedCharacter: CampaignCharacterState;
  startedQuestIds: ReadonlySet<string>;
}): ReplayedQuestStarts {
  if (args.migrationEra === "relief_allocation") {
    const hasAllocationJournal = args.journalEntries.some(
      (entry) =>
        entry.kind === "relief_allocation" ||
        entry.kind === "relief_allocation_legacy" ||
        entry.kind === "relief_allocation_offer",
    );
    const hasAllocationDecision = [
      ...args.campaignBoundaryReplay.byAcceptedDecisions.values(),
    ].some((proof) =>
      proof.decision?.actionId.startsWith("campaign_story:albany:wolf_relief_allocation:"),
    );
    const hasAllocationKnowledge = args.storedCharacter.knowledge.some((id) =>
      OVERWORLD_RELIEF_ALLOCATION_CHARACTER_IDS.has(id),
    );
    const hasAllocationMemory = args.storedCharacter.relationships.some((relationship) =>
      relationship.memories.some((id) => OVERWORLD_RELIEF_ALLOCATION_CHARACTER_IDS.has(id)),
    );
    if (
      hasAllocationJournal ||
      hasAllocationDecision ||
      hasAllocationKnowledge ||
      hasAllocationMemory
    ) {
      throw new Error(
        "Hill-approach predecessor snapshot has relief-allocation evidence introduced by the later manifest.",
      );
    }
  } else if (args.migrationEra === "hill_approach") {
    assertNoFortifyOutlastApproachEvidence({
      campaignBoundaryReplay: args.campaignBoundaryReplay,
      character: args.storedCharacter,
      journalEntries: args.journalEntries,
    });
  } else if (
    args.migrationEra !== null &&
    args.journalEntries.some((entry) => entry.questStartProof !== undefined)
  ) {
    throw new Error(
      "Trusted predecessor snapshot has quest-start proof evidence introduced by a later manifest.",
    );
  }

  const journalEntries = [...args.journalEntries];
  const journalIndexById = new Map(
    journalEntries.map((entry, index) => [entry.id, index] as const),
  );
  for (const entry of journalEntries) {
    if (entry.questStartProof === undefined) continue;
    const questId = entry.id.startsWith("quest:") ? entry.id.slice("quest:".length) : "";
    const quest = args.indexes.questsById.get(questId);
    if (!quest?.launch || !args.startedQuestIds.has(questId)) {
      throw new Error(
        `Overworld session snapshot quest-start proof "${entry.id}" has no started authored launch.`,
      );
    }
  }

  const starts: ReplayedQuestStart[] = [];
  for (const [questId, quest] of args.indexes.questsById) {
    if (!quest.launch || !args.startedQuestIds.has(questId)) continue;
    const journalIndex = journalIndexById.get(`quest:${questId}`);
    if (journalIndex === undefined) {
      throw new Error(
        `Overworld session snapshot started quest "${questId}" has no canonical launch journal.`,
      );
    }
    const entry = journalEntries[journalIndex];
    if (!entry || entry.kind !== "quest") {
      throw new Error(
        `Overworld session snapshot started quest "${questId}" has no canonical launch journal.`,
      );
    }

    if (args.migrationEra !== null && args.migrationEra !== "relief_allocation") {
      assertCanonicalQuestStartJournalCopy({
        entry,
        expectedTown: args.indexes.questTownNames.get(questId) ?? quest.home,
        quest,
        approachId: null,
        sourceWorldHash: args.snapshotWorldHash,
      });
      const boundary = questStartDecisionBoundary({
        boundary: undefined,
        campaignBoundaryReplay: args.campaignBoundaryReplay,
        entry,
        expectedActionId: `quest_start:${questId}`,
        questId,
      });
      journalEntries[journalIndex] = Object.freeze({
        ...entry,
        questStartProof: Object.freeze({
          kind: "legacy" as const,
          sourceWorldHash: args.snapshotWorldHash,
          boundary: Object.freeze({ ...boundary }),
        }),
      });
      starts.push({ questId, journalIndex, effects: [], returnSummary: null });
      continue;
    }

    const startProof = entry.questStartProof;
    if (!startProof) {
      throw new Error(
        `Overworld session snapshot quest launch "${questId}" lacks a persisted approach or legacy proof.`,
      );
    }
    if (startProof.kind === "legacy") {
      if (!OVERWORLD_QUEST_START_TRUSTED_LEGACY_WORLD_HASHES.has(startProof.sourceWorldHash)) {
        throw new Error(
          `Overworld session snapshot quest launch "${questId}" has an untrusted legacy source manifest.`,
        );
      }
      assertCanonicalQuestStartJournalCopy({
        entry,
        expectedTown: args.indexes.questTownNames.get(questId) ?? quest.home,
        quest,
        approachId: null,
        sourceWorldHash: startProof.sourceWorldHash,
      });
      questStartDecisionBoundary({
        boundary: startProof.boundary,
        campaignBoundaryReplay: args.campaignBoundaryReplay,
        entry,
        expectedActionId: `quest_start:${questId}`,
        questId,
      });
      starts.push({ questId, journalIndex, effects: [], returnSummary: null });
      continue;
    }

    const option = quest.launch.options.find((candidate) => candidate.id === startProof.approachId);
    if (!option) {
      throw new Error(
        `Overworld session snapshot quest launch "${questId}" references unknown approach "${startProof.approachId}".`,
      );
    }
    assertCanonicalQuestStartJournalCopy({
      entry,
      expectedTown: args.indexes.questTownNames.get(questId) ?? quest.home,
      quest,
      approachId: option.id,
      sourceWorldHash: null,
    });
    const boundary = questStartDecisionBoundary({
      boundary: startProof.boundary,
      campaignBoundaryReplay: args.campaignBoundaryReplay,
      entry,
      expectedActionId: `quest_start:${questId}:${option.id}`,
      questId,
    });
    if (boundary.townId !== quest.home || boundary.areaId !== quest.area) {
      throw new Error(
        `Overworld session snapshot quest launch "${questId}" is not anchored at its authored home and area.`,
      );
    }
    starts.push({
      questId,
      journalIndex,
      effects: option.effects,
      returnSummary: option.return_summary,
    });
  }

  starts.sort((left, right) => right.journalIndex - left.journalIndex);
  let characterAfter = cloneCampaignCharacterState(args.character);
  for (const start of starts) {
    if (start.effects.length === 0) continue;
    characterAfter = applyCampaignConsequences({
      character: characterAfter,
      effects: start.effects,
    }).characterAfter;
  }
  return Object.freeze({
    characterAfter,
    journalEntries: Object.freeze(journalEntries),
    starts: Object.freeze(starts),
  });
}

function deriveCampaignStoryChoiceProofOrdinals(args: {
  allyProof: OpeningAllyJournalProof;
  allySceneId: string | null;
  decisionProofsByOrdinal: ReadonlyMap<number, OverworldCampaignBoundaryReplayProof>;
  journey: JourneyContractSnapshot;
  preparationProof: OpeningPreparationJournalProof;
  preparationSceneId: string | null;
  reliefAllocationProof: OpeningReliefAllocationJournalProof;
  reliefAllocationSceneId: string | null;
}): ReadonlyMap<string, number> {
  const proofOrdinalByKey = new Map<string, number>();
  const selectedRefs = [...journeyCampaignSelectedStoryChoiceRefs(args.journey)];
  if (args.preparationProof.profile !== null && args.preparationSceneId !== null) {
    selectedRefs.push({
      story_choice_id: args.preparationSceneId,
      choice_id: args.preparationProof.profile.id,
    });
  }
  if (args.allyProof.offered && args.allyProof.option !== null && args.allySceneId !== null) {
    selectedRefs.push({
      story_choice_id: args.allySceneId,
      choice_id: args.allyProof.option.id,
    });
  }
  if (args.reliefAllocationProof.option !== null && args.reliefAllocationSceneId !== null) {
    selectedRefs.push({
      story_choice_id: args.reliefAllocationSceneId,
      choice_id: args.reliefAllocationProof.option.id,
    });
  }
  for (const ref of selectedRefs) {
    const key = campaignStoryChoiceRefKey(ref);
    const expectedActionId = `campaign_story:${ref.story_choice_id}:${ref.choice_id}`;
    const matches = [...args.decisionProofsByOrdinal.entries()].filter(
      ([, proof]) =>
        proof.decision?.surface === "overworld" &&
        proof.decision.reason === "situation_changed" &&
        proof.decision.actionId === expectedActionId,
    );
    if (matches.length !== 1) {
      throw new Error(
        `Overworld session snapshot story choice ${key} does not have exactly one canonical journey decision proof.`,
      );
    }
    proofOrdinalByKey.set(key, matches[0]![0]);
  }
  return proofOrdinalByKey;
}

export type OverworldSessionSnapshotRestorePlan = {
  characterAfter: CampaignCharacterState;
  currentAreaByTown: ReadonlyMap<string, string>;
  discoveredQuestIdsAfter: readonly string[];
  journalEntriesAfter: readonly OverworldJournalEntry[];
  openingLeadSourceDecisionTrailAfter: OverworldOpeningLeadSourceDecisionTrail | null;
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
  openingLeadSourceDecisionTrailAfter: OverworldOpeningLeadSourceDecisionTrail | null;
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
  replaceStringSet(state.discoveredQuestIds, plan.discoveredQuestIdsAfter);
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
    openingLeadSourceDecisionTrailAfter: plan.openingLeadSourceDecisionTrailAfter
      ? cloneOpeningLeadSourceDecisionTrail(plan.openingLeadSourceDecisionTrailAfter)
      : null,
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
  const { indexes, snapshot: sourceSnapshot, startTownId, worldHash, worldId } = args;
  if (sourceSnapshot.worldId !== worldId) {
    throw new Error(
      `Overworld session snapshot is for world "${sourceSnapshot.worldId}", not "${worldId}".`,
    );
  }
  const migrationTargetsCurrentManifest = worldHash === OVERWORLD_RELIEF_ALLOCATION_WORLD_HASH;
  const migrationEra: TrustedMigrationEra =
    !migrationTargetsCurrentManifest || sourceSnapshot.worldHash === worldHash
      ? null
      : sourceSnapshot.worldHash === OVERWORLD_RELIEF_ALLOCATION_PREDECESSOR_WORLD_HASH
        ? "relief_allocation"
        : sourceSnapshot.worldHash === OVERWORLD_HILL_APPROACH_PREDECESSOR_WORLD_HASH
          ? "hill_approach"
          : sourceSnapshot.worldHash === OVERWORLD_FORTIFY_OUTLAST_PREDECESSOR_WORLD_HASH
            ? "fortify_outlast"
            : sourceSnapshot.worldHash === OVERWORLD_CRISIS_PRIORITY_PREDECESSOR_WORLD_HASH
              ? "crisis_priority"
              : sourceSnapshot.worldHash === OVERWORLD_OPENING_ALLY_PREDECESSOR_WORLD_HASH
                ? "opening_ally"
                : sourceSnapshot.worldHash === OVERWORLD_OPENING_PREPARATION_PREDECESSOR_WORLD_HASH
                  ? "opening_preparation"
                  : sourceSnapshot.worldHash === OVERWORLD_CAMPAIGN_SERVICE_WORLD_HASH
                    ? "campaign_service"
                    : sourceSnapshot.worldHash === OVERWORLD_OPENING_LEAD_SOURCE_WORLD_HASH
                      ? "opening_lead_source"
                      : OVERWORLD_OPENING_REGISTRATION_TRUSTED_PREDECESSOR_WORLD_HASHES.has(
                            sourceSnapshot.worldHash,
                          )
                        ? "pre_registration"
                        : sourceSnapshot.worldHash === OVERWORLD_OPENING_REGISTRATION_WORLD_HASH
                          ? "opening_registration"
                          : null;
  if (sourceSnapshot.worldHash !== worldHash && migrationEra === null) {
    throw new Error("Overworld session snapshot was made against a different world manifest.");
  }
  const snapshotWithCampaignCopy =
    migrationEra === null ||
    migrationEra === "relief_allocation" ||
    migrationEra === "hill_approach"
      ? sourceSnapshot
      : Object.freeze({
          ...sourceSnapshot,
          journalEntries: normalizePreFortifyDawnWagonServiceJournalCopy({
            indexes,
            journalEntries: normalizePreFortifyAlbanyWagonJournalTitle(
              sourceSnapshot.journalEntries,
            ),
          }),
        });
  const snapshot =
    migrationEra === "fortify_outlast" || migrationEra === "crisis_priority"
      ? (() => {
          if (indexes.openingAlly === null) {
            throw new Error("Fortify-outlast migration target has no opening ally scene.");
          }
          const currentContacts = new Map(
            [
              ...new Set([
                OVERWORLD_CRISIS_PRIORITY_PREDECESSOR_JUNE_BASE_CONTACT.id,
                OVERWORLD_CRISIS_PRIORITY_PREDECESSOR_JUNE_JOINED_CONTACT.id,
                OVERWORLD_CRISIS_PRIORITY_PREDECESSOR_JUNE_LEFT_CONTACT.id,
                OVERWORLD_FORTIFY_OUTLAST_PREDECESSOR_JUNE_BASE_CONTACT.id,
                OVERWORLD_FORTIFY_OUTLAST_PREDECESSOR_JUNE_JOINED_CONTACT.id,
              ]),
            ].map((journalId) => {
              const presentation = indexes.contactPresentationsByJournalId.get(journalId);
              if (!presentation) {
                throw new Error(
                  `Fortify-outlast migration target has no contact presentation "${journalId}".`,
                );
              }
              return [
                journalId,
                describeOverworldContactAction(presentation.contact, presentation.presentationId),
              ] as const;
            }),
          );
          const normalizerArgs = {
            currentContacts,
            currentOffer: openingAllyOfferJournalDraft(indexes.openingAlly),
            currentJuneSelection: openingAllyJournalDraft({
              scene: indexes.openingAlly,
              character: createInitialCampaignCharacterState(),
              optionId: "albany:ally_june_cattle_first",
            }),
            journalEntries: snapshotWithCampaignCopy.journalEntries,
          };
          const journalEntries =
            migrationEra === "fortify_outlast"
              ? normalizeFortifyOutlastPredecessorAllyJournalCopy(normalizerArgs)
              : normalizeCrisisPriorityPredecessorAllyJournalCopy(normalizerArgs);
          return Object.freeze({ ...snapshotWithCampaignCopy, journalEntries });
        })()
      : snapshotWithCampaignCopy;
  const migratesPreCampaignExportsWorldHash =
    migrationEra === "pre_registration" &&
    snapshot.worldHash === OVERWORLD_PRE_CAMPAIGN_EXPORTS_WORLD_HASH;
  const migratesFromPreRegistrationManifest = migrationEra === "pre_registration";

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
  const trustedPredecessorWolfOutcomeIds =
    migrationEra === "relief_allocation"
      ? OVERWORLD_RELIEF_ALLOCATION_PREDECESSOR_WOLF_OUTCOME_IDS
      : migrationEra === "hill_approach"
        ? OVERWORLD_HILL_APPROACH_PREDECESSOR_WOLF_OUTCOME_IDS
        : migrationEra === "fortify_outlast"
          ? OVERWORLD_FORTIFY_OUTLAST_PREDECESSOR_WOLF_OUTCOME_IDS
          : migrationEra === "crisis_priority"
            ? OVERWORLD_CRISIS_PRIORITY_PREDECESSOR_WOLF_OUTCOME_IDS
            : migrationEra === "opening_ally" || migrationEra === "opening_preparation"
              ? OVERWORLD_OPENING_PREPARATION_WORLD_WOLF_OUTCOME_IDS
              : OVERWORLD_CAMPAIGN_SERVICE_WORLD_WOLF_OUTCOME_IDS;
  if (
    migrationEra !== null &&
    [...questOutcomeIds].some(
      ([questId, endingId]) =>
        questId === "wolf_winter" && !trustedPredecessorWolfOutcomeIds.has(endingId),
    )
  ) {
    throw new Error(
      "Trusted predecessor snapshot has a Wolf-Winter quest outcome introduced by a later manifest.",
    );
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
  const trustedPredecessorServiceRuleIds =
    migrationEra === "relief_allocation"
      ? OVERWORLD_RELIEF_ALLOCATION_PREDECESSOR_WORLD_RULE_IDS
      : migrationEra === "hill_approach"
        ? OVERWORLD_HILL_APPROACH_PREDECESSOR_WORLD_RULE_IDS
        : migrationEra === "fortify_outlast"
          ? OVERWORLD_FORTIFY_OUTLAST_PREDECESSOR_WORLD_RULE_IDS
          : migrationEra === "crisis_priority"
            ? OVERWORLD_CRISIS_PRIORITY_PREDECESSOR_WORLD_RULE_IDS
            : migrationEra === "opening_ally" || migrationEra === "opening_preparation"
              ? OVERWORLD_OPENING_PREPARATION_WORLD_RULE_IDS
              : migrationEra === "campaign_service"
                ? OVERWORLD_CAMPAIGN_SERVICE_WORLD_RULE_IDS
                : null;
  if (
    trustedPredecessorServiceRuleIds !== null &&
    snapshot.journalEntries.some(
      (entry) =>
        entry.serviceRuleId !== undefined &&
        !trustedPredecessorServiceRuleIds.has(entry.serviceRuleId),
    )
  ) {
    throw new Error(
      "Campaign-service predecessor snapshot has service evidence introduced by a later manifest.",
    );
  }
  if (
    migrationEra !== null &&
    migrationEra !== "relief_allocation" &&
    migrationEra !== "hill_approach" &&
    migrationEra !== "fortify_outlast" &&
    migrationEra !== "crisis_priority" &&
    migrationEra !== "opening_ally" &&
    migrationEra !== "opening_preparation" &&
    migrationEra !== "campaign_service" &&
    snapshot.journalEntries.some(
      (entry) => entry.serviceRuleId !== undefined || entry.serviceAreaId !== undefined,
    )
  ) {
    throw new Error(
      "Legacy overworld session snapshot has campaign service-rule evidence from a later manifest.",
    );
  }
  if (
    migrationEra !== null &&
    migrationEra !== "relief_allocation" &&
    migrationEra !== "hill_approach" &&
    migrationEra !== "fortify_outlast" &&
    migrationEra !== "crisis_priority" &&
    migrationEra !== "opening_ally" &&
    migrationEra !== "opening_preparation" &&
    migrationEra !== "campaign_service" &&
    snapshot.journalEntries.some(
      (entry) => entry.serviceBoundary !== undefined || entry.questCompletionBoundary !== undefined,
    )
  ) {
    throw new Error(
      "Legacy overworld session snapshot has campaign replay-boundary evidence from a later manifest.",
    );
  }
  const registrationProof = proveOpeningRegistrationJournal({
    registration: indexes.openingRegistration,
    journalEntries: snapshot.journalEntries,
    expectedTown: indexes.openingRegistrationTownName,
  });
  if (migratesFromPreRegistrationManifest && registrationProof.offered) {
    throw new Error(
      "Legacy overworld session snapshot has opening registration evidence from a later manifest.",
    );
  }
  const legacyRegistrationProof = proveOpeningRegistrationLegacyJournal({
    completedQuestIds,
    discoveredAreaIds,
    indexes,
    journalEntries: snapshot.journalEntries,
    migratesFromPreRegistrationManifest,
    registrationProof,
    snapshot,
    startedQuestIds,
    visitedTownIds,
  });
  if (
    (startedQuestIds.size > 0 || completedQuestIds.size > 0) &&
    registrationProof.profile === null &&
    legacyRegistrationProof === null &&
    !migratesFromPreRegistrationManifest
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
  const hasOpeningLeadSourceEvidence = snapshot.journalEntries.some(
    (entry) =>
      entry.kind === "lead_source" ||
      entry.kind === "lead_source_legacy" ||
      entry.kind === "lead_source_offer",
  );
  const openingLeadSourceDecisionPrefix = indexes.openingLeadSource
    ? `campaign_story:${indexes.openingLeadSource.id}:`
    : null;
  const hasOpeningLeadSourceDecisionEvidence =
    openingLeadSourceDecisionPrefix !== null &&
    snapshot.journey.decisionProof.last?.actionId.startsWith(openingLeadSourceDecisionPrefix) ===
      true;
  if (
    migrationEra !== null &&
    migrationEra !== "relief_allocation" &&
    migrationEra !== "hill_approach" &&
    migrationEra !== "fortify_outlast" &&
    migrationEra !== "crisis_priority" &&
    migrationEra !== "opening_ally" &&
    migrationEra !== "opening_preparation" &&
    migrationEra !== "opening_lead_source" &&
    migrationEra !== "campaign_service" &&
    (hasOpeningLeadSourceEvidence ||
      hasOpeningLeadSourceDecisionEvidence ||
      snapshot.openingLeadSourceDecisionTrail !== undefined)
  ) {
    throw new Error(
      "Legacy overworld session snapshot has opening lead-source evidence from a later manifest.",
    );
  }
  if (snapshot.journalEntries.some((entry) => entry.kind === "lead_source_legacy")) {
    throw new Error(
      "Overworld session snapshot legacy lead-source provenance cannot be trusted and is unsupported.",
    );
  }
  const leadSourceProof = proveOpeningLeadSourceJournal({
    scene: indexes.openingLeadSource,
    registrationProof,
    journalEntries: snapshot.journalEntries,
    expectedTown: indexes.openingLeadSourceTownName,
  });
  const targetLeadQuestId = indexes.openingLeadSource?.target_quest ?? null;
  const targetLeadQuestDiscovered =
    targetLeadQuestId !== null && discoveredQuestIds.has(targetLeadQuestId);
  const targetLeadQuestProgressed =
    targetLeadQuestId !== null &&
    (startedQuestIds.has(targetLeadQuestId) || completedQuestIds.has(targetLeadQuestId));
  const leadDiscoveryDeferredToPreparation =
    (migrationEra === null ||
      migrationEra === "relief_allocation" ||
      migrationEra === "hill_approach" ||
      migrationEra === "fortify_outlast" ||
      migrationEra === "crisis_priority") &&
    indexes.openingPreparation !== null &&
    indexes.openingPreparation.after_lead_source === indexes.openingLeadSource?.id &&
    indexes.openingPreparation.target_quest === targetLeadQuestId;
  const hasLeadSourceManifestEvidence =
    migrationEra === null ||
    migrationEra === "relief_allocation" ||
    migrationEra === "hill_approach" ||
    migrationEra === "fortify_outlast" ||
    migrationEra === "crisis_priority" ||
    migrationEra === "opening_ally" ||
    migrationEra === "opening_preparation" ||
    migrationEra === "campaign_service" ||
    migrationEra === "opening_lead_source";
  if (
    hasLeadSourceManifestEvidence &&
    legacyRegistrationProof !== null &&
    (startedQuestIds.size > 0 || completedQuestIds.size > 0) &&
    !leadSourceProof.offered
  ) {
    throw new Error(
      "Overworld session snapshot has opaque legacy registration progress without a replayable lead-source path.",
    );
  }
  if (
    hasLeadSourceManifestEvidence &&
    registrationProof.profile !== null &&
    !leadSourceProof.offered
  ) {
    throw new Error(
      "Overworld session snapshot selected registration has no required opening lead-source offer or trusted legacy provenance.",
    );
  }
  if (
    hasLeadSourceManifestEvidence &&
    targetLeadQuestDiscovered &&
    leadSourceProof.option === null
  ) {
    throw new Error(
      "Overworld session snapshot discovered the opening lead-source target quest without a certified lead source or trusted legacy provenance.",
    );
  }
  if (
    hasLeadSourceManifestEvidence &&
    targetLeadQuestProgressed &&
    leadSourceProof.option === null
  ) {
    throw new Error(
      "Overworld session snapshot has opening-quest progress without a certified lead source or trusted legacy provenance.",
    );
  }
  if (leadSourceProof.offered) {
    const offerBoundary = leadSourceProof.offerBoundary!;
    const selectionBoundary = leadSourceProof.selectionBoundary;
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
          "Overworld session snapshot pending lead source no longer matches its offered world and journey boundary.",
        );
      }
    } else {
      if (snapshot.journey.acceptedDecisions < selectionBoundary.acceptedDecisions) {
        throw new Error(
          "Overworld session snapshot lead-source selection is ahead of its journey decision count.",
        );
      }
      if (snapshot.journey.acceptedDecisions === selectionBoundary.acceptedDecisions) {
        const expectedLast = {
          number: selectionBoundary.acceptedDecisions,
          surface: "overworld" as const,
          actionId: `campaign_story:${indexes.openingLeadSource!.id}:${leadSourceProof.option!.id}`,
          reason: "situation_changed" as const,
        };
        if (
          snapshot.journey.decisionProof.hash !== selectionBoundary.decisionProofHash ||
          JSON.stringify(snapshot.journey.decisionProof.last) !== JSON.stringify(expectedLast)
        ) {
          throw new Error(
            "Overworld session snapshot lead-source selection does not match the current journey proof.",
          );
        }
      }
      if (
        targetLeadQuestId !== null &&
        !leadDiscoveryDeferredToPreparation &&
        !discoveredQuestIds.has(targetLeadQuestId)
      ) {
        throw new Error(
          "Overworld session snapshot selected lead source did not reveal its target quest.",
        );
      }
    }
  }
  const hasOpeningPreparationEvidence = snapshot.journalEntries.some(
    (entry) =>
      entry.kind === "preparation" ||
      entry.kind === "preparation_legacy" ||
      entry.kind === "preparation_offer",
  );
  const openingPreparationDecisionPrefix = indexes.openingPreparation
    ? `campaign_story:${indexes.openingPreparation.id}:`
    : null;
  const hasOpeningPreparationDecisionEvidence =
    openingPreparationDecisionPrefix !== null &&
    (snapshot.openingLeadSourceDecisionTrail?.decisions.some((decision) =>
      decision.actionId.startsWith(openingPreparationDecisionPrefix),
    ) === true ||
      snapshot.journey.decisionProof.last?.actionId.startsWith(openingPreparationDecisionPrefix) ===
        true);
  if (
    migrationEra !== null &&
    migrationEra !== "relief_allocation" &&
    migrationEra !== "hill_approach" &&
    migrationEra !== "fortify_outlast" &&
    migrationEra !== "crisis_priority" &&
    migrationEra !== "opening_ally" &&
    (hasOpeningPreparationEvidence || hasOpeningPreparationDecisionEvidence)
  ) {
    throw new Error(
      "Trusted predecessor snapshot has opening preparation evidence introduced by a later manifest.",
    );
  }
  const storedPreparationLegacySourceWorldHash = snapshot.journalEntries
    .filter((entry) => entry.kind === "preparation_legacy")
    .map((entry) => openingPreparationLegacySourceWorldHash(entry.id))
    .find(
      (sourceWorldHash): sourceWorldHash is string =>
        sourceWorldHash !== null &&
        OVERWORLD_OPENING_PREPARATION_TRUSTED_LEGACY_WORLD_HASHES.has(sourceWorldHash),
    );
  const preparationProof = proveOpeningPreparationJournal({
    scene: indexes.openingPreparation,
    leadSourceProof,
    journalEntries: snapshot.journalEntries,
    expectedTown: indexes.openingPreparationTownName,
    trustedLegacySourceWorldHash: storedPreparationLegacySourceWorldHash ?? null,
  });
  const preparationRequiredByCurrentManifest =
    indexes.openingPreparation !== null &&
    (migrationEra === null ||
      migrationEra === "relief_allocation" ||
      migrationEra === "hill_approach" ||
      migrationEra === "fortify_outlast" ||
      migrationEra === "crisis_priority");
  const targetPreparationQuestId = indexes.openingPreparation?.target_quest ?? null;
  const targetPreparationQuestProgressed =
    targetPreparationQuestId !== null &&
    (startedQuestIds.has(targetPreparationQuestId) ||
      completedQuestIds.has(targetPreparationQuestId));
  const targetPreparationQuestHasReplayableProgress =
    targetPreparationQuestProgressed &&
    targetPreparationQuestId !== null &&
    leadSourceProof.journalIndex !== null &&
    snapshot.journalEntries.some(
      (entry, index) =>
        index < leadSourceProof.journalIndex! &&
        ((entry.kind === "quest" && entry.id === `quest:${targetPreparationQuestId}`) ||
          (entry.kind === "quest_done" && entry.id === `quest_done:${targetPreparationQuestId}`)),
    );
  const targetPreparationQuestDiscovered =
    targetPreparationQuestId !== null && discoveredQuestIds.has(targetPreparationQuestId);
  if (preparationProof.legacy && !targetPreparationQuestHasReplayableProgress) {
    throw new Error(
      "Overworld session snapshot legacy opening preparation has no later replayable Wolf-Winter progress to grandfather.",
    );
  }
  if (
    preparationRequiredByCurrentManifest &&
    leadSourceProof.option !== null &&
    !preparationProof.offered &&
    !preparationProof.legacy
  ) {
    throw new Error(
      "Overworld session snapshot selected a lead source without its required opening preparation offer or trusted legacy marker.",
    );
  }
  if (
    preparationRequiredByCurrentManifest &&
    targetPreparationQuestProgressed &&
    preparationProof.profile === null &&
    !preparationProof.legacy
  ) {
    throw new Error(
      "Overworld session snapshot has opening-quest progress without a selected preparation profile or trusted legacy marker.",
    );
  }
  if (
    preparationRequiredByCurrentManifest &&
    preparationProof.offered &&
    preparationProof.profile === null &&
    targetPreparationQuestDiscovered
  ) {
    throw new Error(
      "Overworld session snapshot pending preparation revealed its target quest before a profile was committed.",
    );
  }
  if (
    preparationRequiredByCurrentManifest &&
    (preparationProof.profile !== null || preparationProof.legacy) &&
    !targetPreparationQuestDiscovered
  ) {
    throw new Error(
      "Overworld session snapshot resolved preparation did not reveal its target quest.",
    );
  }
  if (preparationProof.offered) {
    const offerBoundary = preparationProof.offerBoundary!;
    const selectionBoundary = preparationProof.selectionBoundary;
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
          "Overworld session snapshot pending preparation no longer matches its offered world and journey boundary.",
        );
      }
    } else {
      if (snapshot.journey.acceptedDecisions < selectionBoundary.acceptedDecisions) {
        throw new Error(
          "Overworld session snapshot preparation selection is ahead of its journey decision count.",
        );
      }
      if (snapshot.journey.acceptedDecisions === selectionBoundary.acceptedDecisions) {
        const expectedLast = {
          number: selectionBoundary.acceptedDecisions,
          surface: "overworld" as const,
          actionId: `campaign_story:${indexes.openingPreparation!.id}:${preparationProof.profile!.id}`,
          reason: "situation_changed" as const,
        };
        if (
          snapshot.journey.decisionProof.hash !== selectionBoundary.decisionProofHash ||
          JSON.stringify(snapshot.journey.decisionProof.last) !== JSON.stringify(expectedLast)
        ) {
          throw new Error(
            "Overworld session snapshot preparation selection does not match the current journey proof.",
          );
        }
      }
    }
  }
  const hasOpeningReliefAllocationEvidence = snapshot.journalEntries.some(
    (entry) =>
      entry.kind === "relief_allocation" ||
      entry.kind === "relief_allocation_legacy" ||
      entry.kind === "relief_allocation_offer",
  );
  const openingReliefAllocationDecisionPrefix = indexes.openingReliefAllocation
    ? `campaign_story:${indexes.openingReliefAllocation.id}:`
    : null;
  const hasOpeningReliefAllocationDecisionEvidence =
    openingReliefAllocationDecisionPrefix !== null &&
    (snapshot.openingLeadSourceDecisionTrail?.decisions.some((decision) =>
      decision.actionId.startsWith(openingReliefAllocationDecisionPrefix),
    ) === true ||
      snapshot.journey.decisionProof.last?.actionId.startsWith(
        openingReliefAllocationDecisionPrefix,
      ) === true);
  if (
    migrationEra !== null &&
    (hasOpeningReliefAllocationEvidence || hasOpeningReliefAllocationDecisionEvidence)
  ) {
    throw new Error(
      "Trusted predecessor snapshot has relief-allocation evidence introduced by the later manifest.",
    );
  }
  const storedReliefAllocationLegacySourceWorldHash = snapshot.journalEntries
    .filter((entry) => entry.kind === "relief_allocation_legacy")
    .map((entry) => openingReliefAllocationLegacySourceWorldHash(entry.id))
    .find(
      (sourceWorldHash): sourceWorldHash is string =>
        sourceWorldHash !== null &&
        (sourceWorldHash === OVERWORLD_RELIEF_ALLOCATION_PREDECESSOR_WORLD_HASH ||
          OVERWORLD_QUEST_START_TRUSTED_LEGACY_WORLD_HASHES.has(sourceWorldHash)),
    );
  const reliefAllocationProof = proveOpeningReliefAllocationJournal({
    scene: indexes.openingReliefAllocation,
    preparationProof,
    journalEntries: snapshot.journalEntries,
    expectedTown: indexes.openingReliefAllocationTownName,
    trustedLegacySourceWorldHash: storedReliefAllocationLegacySourceWorldHash ?? null,
  });
  const targetReliefAllocationQuestId = indexes.openingReliefAllocation?.target_quest ?? null;
  const targetReliefAllocationQuestProgressed =
    targetReliefAllocationQuestId !== null &&
    (startedQuestIds.has(targetReliefAllocationQuestId) ||
      completedQuestIds.has(targetReliefAllocationQuestId));
  if (
    migrationEra === null &&
    targetReliefAllocationQuestProgressed &&
    reliefAllocationProof.option === null &&
    !reliefAllocationProof.legacy
  ) {
    throw new Error(
      "Overworld session snapshot has opening-quest progress without a selected relief allocation or trusted legacy marker.",
    );
  }
  if (
    migrationEra === null &&
    indexes.openingReliefAllocation !== null &&
    (preparationProof.profile !== null || preparationProof.legacy) &&
    !targetReliefAllocationQuestProgressed &&
    snapshot.currentId === indexes.openingReliefAllocation.home &&
    snapshot.currentAreaId === indexes.openingReliefAllocation.area &&
    !reliefAllocationProof.offered &&
    !reliefAllocationProof.legacy
  ) {
    throw new Error(
      "Overworld session snapshot reached the departure area after preparation without its required relief-allocation offer.",
    );
  }
  if (reliefAllocationProof.offered) {
    const offerBoundary = reliefAllocationProof.offerBoundary!;
    const selectionBoundary = reliefAllocationProof.selectionBoundary;
    if (selectionBoundary === null) {
      if (
        snapshot.currentId !== offerBoundary.townId ||
        snapshot.currentAreaId !== offerBoundary.areaId ||
        snapshot.minutes !== offerBoundary.minutes ||
        (targetReliefAllocationQuestId !== null &&
          (startedQuestIds.has(targetReliefAllocationQuestId) ||
            completedQuestIds.has(targetReliefAllocationQuestId))) ||
        snapshot.journey.acceptedDecisions !== offerBoundary.acceptedDecisions ||
        snapshot.journey.decisionProof.hash !== offerBoundary.decisionProofHash
      ) {
        throw new Error(
          "Overworld session snapshot pending relief allocation no longer matches its offered departure boundary.",
        );
      }
    } else {
      if (snapshot.journey.acceptedDecisions < selectionBoundary.acceptedDecisions) {
        throw new Error(
          "Overworld session snapshot relief allocation is ahead of its journey decision count.",
        );
      }
      if (snapshot.journey.acceptedDecisions === selectionBoundary.acceptedDecisions) {
        const expectedLast = {
          number: selectionBoundary.acceptedDecisions,
          surface: "overworld" as const,
          actionId: `campaign_story:${indexes.openingReliefAllocation!.id}:${reliefAllocationProof.option!.id}`,
          reason: "situation_changed" as const,
        };
        if (
          snapshot.journey.decisionProof.hash !== selectionBoundary.decisionProofHash ||
          JSON.stringify(snapshot.journey.decisionProof.last) !== JSON.stringify(expectedLast)
        ) {
          throw new Error(
            "Overworld session snapshot relief allocation does not match the current journey proof.",
          );
        }
      }
    }
  }
  const hasOpeningAllyEvidence = snapshot.journalEntries.some(
    (entry) => entry.kind === "ally" || entry.kind === "ally_legacy" || entry.kind === "ally_offer",
  );
  const openingAllyDecisionPrefix = indexes.openingAlly
    ? `campaign_story:${indexes.openingAlly.id}:`
    : null;
  const hasOpeningAllyDecisionEvidence =
    openingAllyDecisionPrefix !== null &&
    (snapshot.openingLeadSourceDecisionTrail?.decisions.some((decision) =>
      decision.actionId.startsWith(openingAllyDecisionPrefix),
    ) === true ||
      snapshot.journey.decisionProof.last?.actionId.startsWith(openingAllyDecisionPrefix) === true);
  const openingAllyContact = indexes.openingAlly?.contact ?? null;
  if (
    migrationEra !== null &&
    migrationEra !== "relief_allocation" &&
    migrationEra !== "hill_approach" &&
    migrationEra !== "fortify_outlast" &&
    migrationEra !== "crisis_priority" &&
    (hasOpeningAllyEvidence ||
      hasOpeningAllyDecisionEvidence ||
      (openingAllyContact !== null &&
        snapshot.journalEntries.some((entry) => entry.id.startsWith(`talk:${openingAllyContact}`))))
  ) {
    throw new Error(
      "Trusted predecessor snapshot has opening ally evidence introduced by a later manifest.",
    );
  }
  if (snapshot.journalEntries.some((entry) => entry.kind === "ally_legacy")) {
    throw new Error(
      "Overworld session snapshot legacy ally provenance is unsupported; earlier departures remain truthful solo runs.",
    );
  }
  const allyProof = proveOpeningAllyJournal({
    scene: indexes.openingAlly,
    preparationProof,
    reliefAllocationProof,
    journalEntries: snapshot.journalEntries,
    expectedTown: indexes.openingAllyTownName,
  });
  if (allyProof.offered) {
    const offerBoundary = allyProof.offerBoundary!;
    const selectionBoundary = allyProof.selectionBoundary;
    if (selectionBoundary === null) {
      if (
        snapshot.currentId !== offerBoundary.townId ||
        snapshot.currentAreaId !== offerBoundary.areaId ||
        snapshot.minutes !== offerBoundary.minutes ||
        startedQuestIds.size > 0 ||
        completedQuestIds.size > 0 ||
        snapshot.journey.acceptedDecisions !== offerBoundary.acceptedDecisions ||
        snapshot.journey.decisionProof.hash !== offerBoundary.decisionProofHash
      ) {
        throw new Error(
          "Overworld session snapshot pending ally commitment no longer matches its offered departure boundary.",
        );
      }
    } else {
      if (snapshot.journey.acceptedDecisions < selectionBoundary.acceptedDecisions) {
        throw new Error(
          "Overworld session snapshot ally selection is ahead of its journey decision count.",
        );
      }
      if (snapshot.journey.acceptedDecisions === selectionBoundary.acceptedDecisions) {
        const expectedLast = {
          number: selectionBoundary.acceptedDecisions,
          surface: "overworld" as const,
          actionId: `campaign_story:${indexes.openingAlly!.id}:${allyProof.option!.id}`,
          reason: "situation_changed" as const,
        };
        if (
          snapshot.journey.decisionProof.hash !== selectionBoundary.decisionProofHash ||
          JSON.stringify(snapshot.journey.decisionProof.last) !== JSON.stringify(expectedLast)
        ) {
          throw new Error(
            "Overworld session snapshot ally selection does not match the current journey proof.",
          );
        }
      }
    }
  }
  const openingLeadSourceDecisionTrail = proveOpeningLeadSourceDecisionTrail({
    leadSourceProof,
    snapshot,
    sourceSceneId: indexes.openingLeadSource?.id ?? null,
  });
  assertOpeningPreparationDecisionTrail({
    preparationProof,
    preparationSceneId: indexes.openingPreparation?.id ?? null,
    trail: openingLeadSourceDecisionTrail,
  });
  assertOpeningReliefAllocationDecisionTrail({
    reliefAllocationProof,
    reliefAllocationSceneId: indexes.openingReliefAllocation?.id ?? null,
    trail: openingLeadSourceDecisionTrail,
  });
  assertOpeningAllyDecisionTrail({
    allyProof,
    allySceneId: indexes.openingAlly?.id ?? null,
    trail: openingLeadSourceDecisionTrail,
  });
  if (
    migrationEra === "opening_lead_source" &&
    openingLeadSourceDecisionTrail?.decisions.some(
      (decision) =>
        decision.actionId.startsWith("follow_current_goal:") &&
        !decision.actionId.includes(":via:"),
    )
  ) {
    throw new Error(
      "Legacy overworld session snapshot has a goal passage whose road suffix cannot anchor later campaign services.",
    );
  }
  const campaignBoundaryReplay = campaignBoundaryReplayIndex({
    indexes,
    leadSourceProof,
    trail: openingLeadSourceDecisionTrail,
    travelEntries: travelTimeline.oldestFirst,
  });
  assertOpeningAllyCampaignBoundaryReplay({
    allyProof,
    allyContactId: indexes.openingAlly?.contact ?? null,
    campaignBoundaryReplay,
  });
  const campaignBoundaries: OverworldCampaignBoundaryReplayIndex = {
    byAcceptedDecisions: campaignBoundaryReplay.byAcceptedDecisions,
    worldFactProofOrdinalById: deriveCampaignWorldFactProofOrdinals({
      decisionProofsByOrdinal: campaignBoundaryReplay.byAcceptedDecisions,
      indexes,
      journalEntries: snapshot.journalEntries,
      journey: snapshot.journey,
      questOutcomeIds,
      requireBoundServiceFacts:
        migrationEra === null ||
        migrationEra === "relief_allocation" ||
        migrationEra === "hill_approach" ||
        migrationEra === "fortify_outlast" ||
        migrationEra === "crisis_priority" ||
        migrationEra === "opening_ally" ||
        migrationEra === "opening_preparation" ||
        migrationEra === "campaign_service",
    }),
    storyChoiceProofOrdinalByKey: deriveCampaignStoryChoiceProofOrdinals({
      allyProof,
      allySceneId: indexes.openingAlly?.id ?? null,
      decisionProofsByOrdinal: campaignBoundaryReplay.byAcceptedDecisions,
      journey: snapshot.journey,
      preparationProof,
      preparationSceneId: indexes.openingPreparation?.id ?? null,
      reliefAllocationProof,
      reliefAllocationSceneId: indexes.openingReliefAllocation?.id ?? null,
    }),
  };
  const neutralCharacter = createInitialCampaignCharacterState();
  const initialCharacter = registrationProof.characterAtRegistration;
  const characterAfterSource = leadSourceProof.option
    ? leadSourceProof.characterAfterSource
    : initialCharacter;
  const characterAfterPreparation = preparationProof.profile
    ? preparationProof.characterAfterPreparation
    : characterAfterSource;
  const characterAfterReliefAllocation = reliefAllocationProof.option
    ? reliefAllocationProof.characterAfterAllocation
    : characterAfterPreparation;
  const characterAfterAlly = allyProof.option
    ? allyProof.characterAfterAlly
    : characterAfterReliefAllocation;
  const reliefAllocationSelectedAfterAlly =
    reliefAllocationProof.option !== null &&
    reliefAllocationProof.journalIndex !== null &&
    allyProof.option !== null &&
    allyProof.journalIndex !== null &&
    reliefAllocationProof.journalIndex < allyProof.journalIndex;
  const characterAfterOpeningChoices = reliefAllocationSelectedAfterAlly
    ? applyOpeningReliefAllocationOption({
        scene: indexes.openingReliefAllocation!,
        character: allyProof.characterAfterAlly,
        optionId: reliefAllocationProof.option!.id,
      }).characterAfter
    : characterAfterAlly;
  const questStartReplay = replaySnapshotQuestStarts({
    campaignBoundaryReplay,
    character: characterAfterOpeningChoices,
    indexes,
    journalEntries: snapshot.journalEntries,
    migrationEra,
    snapshotWorldHash: snapshot.worldHash,
    storedCharacter: snapshot.character,
    startedQuestIds,
  });
  if (reliefAllocationProof.legacy) {
    const markerIndex = questStartReplay.journalEntries.findIndex(
      (entry) => entry.kind === "relief_allocation_legacy",
    );
    const questEntry = questStartReplay.journalEntries[markerIndex - 1];
    const quest =
      questEntry?.kind === "quest"
        ? indexes.questsById.get(questEntry.id.slice("quest:".length))
        : undefined;
    if (!questEntry || !quest || markerIndex < 1) {
      throw new Error(
        "Overworld session snapshot legacy relief allocation has no adjacent target-quest start.",
      );
    }
    const expectedBoundary = reliefAllocationLegacyBoundaryBeforeQuest({
      campaignBoundaryReplay,
      entry: questEntry,
      quest,
    });
    if (JSON.stringify(reliefAllocationProof.legacyBoundary) !== JSON.stringify(expectedBoundary)) {
      throw new Error(
        "Overworld session snapshot legacy relief allocation does not match the exact pre-start decision, route time, or Station boundary.",
      );
    }
  }
  const questStartReturnSummaryByQuestId = new Map(
    questStartReplay.starts.flatMap((start) =>
      start.returnSummary === null ? [] : [[start.questId, start.returnSummary] as const],
    ),
  );
  assertSnapshotQuestCompletionOutcomeJournalProof({
    indexes,
    journalEntries: questStartReplay.journalEntries,
    questOutcomeIds,
    questStartReturnSummaryByQuestId,
  });
  const journalQuestOutcomeOrder = questStartReplay.journalEntries
    .filter((entry) => entry.kind === "quest_done")
    .map((entry) => entry.id.slice("quest_done:".length))
    .reverse();
  const journalQuestOutcomeIds = new Set(journalQuestOutcomeOrder);
  const questOutcomeOrder = [
    ...journalQuestOutcomeOrder,
    ...[...questOutcomeIds.keys()].filter((questId) => !journalQuestOutcomeIds.has(questId)).sort(),
  ];
  const consequenceReplay = replayQuestCampaignConsequences({
    character: questStartReplay.characterAfter,
    questsById: indexes.questsById,
    questOutcomeIds,
    questOutcomeOrder,
  });
  const journalIndexById = new Map(
    questStartReplay.journalEntries.map((entry, index) => [entry.id, index] as const),
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
    const leadSourceActive =
      leadSourceProof.journalIndex !== null && leadSourceProof.journalIndex > contactIndex;
    const preparationActive =
      preparationProof.profile !== null &&
      preparationProof.journalIndex !== null &&
      preparationProof.journalIndex > contactIndex;
    const reliefAllocationActive =
      reliefAllocationProof.option !== null &&
      reliefAllocationProof.journalIndex !== null &&
      reliefAllocationProof.journalIndex > contactIndex;
    const allyActive =
      allyProof.option !== null &&
      allyProof.journalIndex !== null &&
      allyProof.journalIndex > contactIndex;
    const questOutcomeIdsAt = new Map<string, string>();
    for (const [questId, endingId] of questOutcomeIds) {
      const completedIndex = journalIndexById.get(`quest_done:${questId}`);
      if (completedIndex !== undefined && completedIndex > contactIndex) {
        questOutcomeIdsAt.set(questId, endingId);
      }
    }
    let characterBeforeQuestOutcomes = registrationActive
      ? leadSourceActive
        ? preparationActive
          ? allyActive && reliefAllocationActive
            ? characterAfterOpeningChoices
            : allyActive
              ? allyProof.characterAfterAlly
              : reliefAllocationActive
                ? characterAfterReliefAllocation
                : characterAfterPreparation
          : characterAfterSource
        : initialCharacter
      : neutralCharacter;
    for (const start of questStartReplay.starts) {
      if (start.journalIndex <= contactIndex || start.effects.length === 0) continue;
      characterBeforeQuestOutcomes = applyCampaignConsequences({
        character: characterBeforeQuestOutcomes,
        effects: start.effects,
      }).characterAfter;
    }
    const replayed = replayQuestCampaignConsequences({
      character: characterBeforeQuestOutcomes,
      questsById: indexes.questsById,
      questOutcomeIds: questOutcomeIdsAt,
      questOutcomeOrder: questOutcomeOrder.filter((questId) => questOutcomeIdsAt.has(questId)),
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
    journalEntries: questStartReplay.journalEntries,
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
  const nonFifoQuestIds = new Set(
    indexes.openingLeadSource ? [indexes.openingLeadSource.target_quest] : [],
  );
  const localActionJournalSources = {
    ...indexes,
    discoveredAreaIds,
    discoveredJobIds,
    discoveredQuestIds,
    discoveredSiteIds,
    nonFifoQuestIds,
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
    questIdsAllowedOutsideDiscoveredArea: nonFifoQuestIds,
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
    { ...snapshot, journalEntries: [...questStartReplay.journalEntries] },
    indexes,
    travelTimeline,
    roadJournal,
    serviceJournal,
    localActionJournal,
    campaignBoundaries,
    characterAt,
  );

  const migratedJournalEntries: OverworldJournalEntry[] =
    migrationEra === "opening_lead_source"
      ? migrateOpeningLeadSourceQuestCompletionBoundaries({
          boundaryProofsByOrdinal: campaignBoundaryReplay.byAcceptedDecisions,
          indexes,
          journalEntries: questStartReplay.journalEntries,
          journey: snapshot.journey,
        })
      : [...questStartReplay.journalEntries];
  let openingLeadSourceDecisionTrailAfter = openingLeadSourceDecisionTrail;
  const hasQuestProgress = startedQuestIds.size > 0 || completedQuestIds.size > 0;
  if (migratesFromPreRegistrationManifest && hasQuestProgress) {
    throw new Error(
      "Legacy overworld session snapshot has opaque pre-registration quest progress without a replayable registration and lead-source path.",
    );
  }
  const registrationBoundary = registrationProof.selectionBoundary;
  const canOfferMigratedLeadSource =
    migrationEra === "opening_registration" &&
    indexes.openingLeadSource !== null &&
    registrationProof.profile !== null &&
    registrationProof.journalIndex === 0 &&
    registrationBoundary !== null &&
    snapshot.currentId === registrationBoundary.townId &&
    snapshot.currentAreaId === registrationBoundary.areaId &&
    snapshot.minutes === registrationBoundary.minutes &&
    snapshot.journey.acceptedDecisions === registrationBoundary.acceptedDecisions &&
    snapshot.journey.decisionProof.hash === registrationBoundary.decisionProofHash;
  if (canOfferMigratedLeadSource) {
    const offer = openingLeadSourceOfferJournalEntry({
      scene: indexes.openingLeadSource!,
      town: indexes.townNameForSource(snapshot.currentId),
      recordedAt: timeLabel(snapshot.minutes),
      storyChoiceBoundary: { ...registrationBoundary },
    });
    migratedJournalEntries.unshift(offer);
    openingLeadSourceDecisionTrailAfter = {
      anchorId: offer.id,
      baseAcceptedDecisions: registrationBoundary.acceptedDecisions,
      baseDecisionProofHash: registrationBoundary.decisionProofHash,
      decisions: [],
    };
  }
  if (
    migrationEra === "opening_registration" &&
    registrationProof.profile !== null &&
    !canOfferMigratedLeadSource
  ) {
    throw new Error(
      "Legacy overworld session snapshot selected registration has an opaque post-registration decision suffix; it cannot be certified as source-free safely.",
    );
  }
  const canGrandfatherOpeningPreparation =
    migrationEra !== null &&
    migrationEra !== "relief_allocation" &&
    migrationEra !== "hill_approach" &&
    migrationEra !== "fortify_outlast" &&
    migrationEra !== "crisis_priority" &&
    migrationEra !== "opening_ally" &&
    indexes.openingPreparation !== null &&
    leadSourceProof.option !== null &&
    leadSourceProof.journalIndex !== null &&
    leadSourceProof.selectionBoundary !== null &&
    targetPreparationQuestHasReplayableProgress &&
    OVERWORLD_OPENING_PREPARATION_TRUSTED_LEGACY_WORLD_HASHES.has(snapshot.worldHash);
  const canOfferMigratedPreparation =
    migrationEra !== null &&
    migrationEra !== "relief_allocation" &&
    migrationEra !== "hill_approach" &&
    migrationEra !== "fortify_outlast" &&
    migrationEra !== "crisis_priority" &&
    migrationEra !== "opening_ally" &&
    indexes.openingPreparation !== null &&
    leadSourceProof.option !== null &&
    leadSourceProof.journalIndex === 0 &&
    leadSourceProof.selectionBoundary !== null &&
    !targetPreparationQuestProgressed &&
    snapshot.journey.status === "active" &&
    snapshot.currentId === leadSourceProof.selectionBoundary.townId &&
    snapshot.currentAreaId === leadSourceProof.selectionBoundary.areaId &&
    snapshot.minutes === leadSourceProof.selectionBoundary.minutes &&
    snapshot.journey.acceptedDecisions === leadSourceProof.selectionBoundary.acceptedDecisions &&
    snapshot.journey.decisionProof.hash === leadSourceProof.selectionBoundary.decisionProofHash &&
    OVERWORLD_OPENING_PREPARATION_TRUSTED_LEGACY_WORLD_HASHES.has(snapshot.worldHash);
  if (canOfferMigratedPreparation) {
    const offer = openingPreparationOfferJournalEntry({
      scene: indexes.openingPreparation!,
      town: indexes.townNameForSource(snapshot.currentId),
      recordedAt: timeLabel(snapshot.minutes),
      storyChoiceBoundary: { ...leadSourceProof.selectionBoundary! },
    });
    migratedJournalEntries.unshift(offer);
  }
  if (canGrandfatherOpeningPreparation) {
    const leadSelectionEntry = migratedJournalEntries[leadSourceProof.journalIndex!];
    if (!leadSelectionEntry || leadSelectionEntry.kind !== "lead_source") {
      throw new Error(
        "Trusted predecessor snapshot cannot locate the lead selection to anchor its preparation migration.",
      );
    }
    const marker = openingPreparationLegacyJournalEntry({
      sourceWorldHash: snapshot.worldHash,
      town: leadSelectionEntry.town,
      recordedAt: leadSelectionEntry.recordedAt,
      storyChoiceBoundary: { ...leadSourceProof.selectionBoundary! },
    });
    migratedJournalEntries.splice(leadSourceProof.journalIndex!, 0, marker);
  }
  if (
    migrationEra !== null &&
    migrationEra !== "relief_allocation" &&
    migrationEra !== "hill_approach" &&
    migrationEra !== "fortify_outlast" &&
    migrationEra !== "crisis_priority" &&
    migrationEra !== "opening_ally" &&
    indexes.openingPreparation !== null &&
    leadSourceProof.option !== null &&
    !canOfferMigratedPreparation &&
    !canGrandfatherOpeningPreparation
  ) {
    throw new Error(
      "Trusted predecessor snapshot selected a lead source but has neither an exact preparation-offer boundary nor later replayable Wolf-Winter progress.",
    );
  }
  const canGrandfatherOpeningReliefAllocation =
    migrationEra !== null &&
    indexes.openingReliefAllocation !== null &&
    targetReliefAllocationQuestProgressed &&
    (preparationProof.profile !== null ||
      preparationProof.legacy ||
      canGrandfatherOpeningPreparation);
  if (canGrandfatherOpeningReliefAllocation) {
    const questJournalId = `quest:${indexes.openingReliefAllocation!.target_quest}`;
    const questIndex = migratedJournalEntries.findIndex(
      (entry) => entry.kind === "quest" && entry.id === questJournalId,
    );
    const questEntry = migratedJournalEntries[questIndex];
    const quest = indexes.questsById.get(indexes.openingReliefAllocation!.target_quest);
    if (questIndex < 0 || !questEntry || !quest) {
      throw new Error(
        "Trusted predecessor snapshot cannot locate the quest start for relief-allocation migration.",
      );
    }
    const boundary = reliefAllocationLegacyBoundaryBeforeQuest({
      campaignBoundaryReplay,
      entry: questEntry,
      quest,
    });
    const marker = openingReliefAllocationLegacyJournalEntry({
      sourceWorldHash: snapshot.worldHash,
      town:
        indexes.openingReliefAllocationTownName ??
        indexes.townNameForSource(indexes.openingReliefAllocation!.home),
      recordedAt: timeLabel(boundary.minutes),
      storyChoiceBoundary: boundary,
    });
    migratedJournalEntries.splice(questIndex + 1, 0, marker);
  }
  if (
    migrationEra !== null &&
    indexes.openingReliefAllocation !== null &&
    targetReliefAllocationQuestProgressed &&
    !canGrandfatherOpeningReliefAllocation
  ) {
    throw new Error(
      "Trusted predecessor snapshot has Wolf-Winter progress without a replayable preparation boundary for relief-allocation migration.",
    );
  }
  const discoveredQuestIdsAfter = Object.freeze(
    snapshot.discoveredQuestIds.filter(
      (questId) =>
        questId !== targetLeadQuestId ||
        (hasLeadSourceManifestEvidence && !canOfferMigratedPreparation),
    ),
  );
  const journalEntriesAfter = Object.freeze(migratedJournalEntries);

  return {
    characterAfter: consequenceReplay.characterAfter,
    currentAreaByTown,
    discoveredQuestIdsAfter,
    journalEntriesAfter,
    openingLeadSourceDecisionTrailAfter,
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
  questStartReturnSummaryByQuestId: ReadonlyMap<string, string>;
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
      ...(args.questStartReturnSummaryByQuestId.has(questId)
        ? { returnSummary: args.questStartReturnSummaryByQuestId.get(questId)! }
        : {}),
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

function questCompletionBoundaryOrdinal(
  entry: OverworldJournalEntry,
  decisionProofsByOrdinal: ReadonlyMap<number, OverworldCampaignBoundaryReplayProof>,
  args: {
    expectedCompletedAtDecision: number | null;
    questId: string;
    requireBound: boolean;
  },
): number | null {
  const boundary = entry.questCompletionBoundary;
  if (!boundary) {
    if (args.requireBound) {
      throw new Error(
        `Overworld session snapshot quest completion "${args.questId}" lacks the decision boundary required by a campaign service fact.`,
      );
    }
    return null;
  }
  if (args.expectedCompletedAtDecision === null) {
    if (args.requireBound) {
      throw new Error(
        `Overworld session snapshot quest completion "${args.questId}" has no completed journey goal to anchor its campaign service fact.`,
      );
    }
  } else if (boundary.acceptedDecisions !== args.expectedCompletedAtDecision) {
    throw new Error(
      `Overworld session snapshot quest completion journal "${entry.id}" does not match its completed journey goal decision.`,
    );
  }
  const proof = decisionProofsByOrdinal.get(boundary.acceptedDecisions);
  if (!proof || proof.decision === null || proof.decisionProofHash !== boundary.decisionProofHash) {
    throw new Error(
      `Overworld session snapshot quest completion journal "${entry.id}" does not match its accepted decision proof.`,
    );
  }
  if (boundary.minutes !== parseTimeLabel(entry.recordedAt)) {
    throw new Error(
      `Overworld session snapshot quest completion journal "${entry.id}" boundary time does not match its timestamp.`,
    );
  }
  if (
    proof.townId === null ||
    proof.areaId === null ||
    boundary.townId !== proof.townId ||
    boundary.areaId !== proof.areaId
  ) {
    throw new Error(
      `Overworld session snapshot quest completion journal "${entry.id}" boundary does not match its replayed location.`,
    );
  }
  return boundary.acceptedDecisions;
}

/**
 * The immediately preceding manifest already persisted the source-anchored
 * decision trail, but predates explicit quest-foldback boundaries. A completed
 * campaign goal gives us a narrow migration proof: its completion ordinal must
 * be the exact counted quest-start decision, whose prefix hash and location are
 * replayable from that trail. Materializing the boundary here prevents a
 * migrated save from becoming unloadable after it consumes a new fact-gated
 * campaign service.
 */
function migrateOpeningLeadSourceQuestCompletionBoundaries(args: {
  boundaryProofsByOrdinal: ReadonlyMap<number, OverworldCampaignBoundaryReplayProof>;
  indexes: OverworldSnapshotManifestIndex;
  journalEntries: readonly OverworldJournalEntry[];
  journey: JourneyContractSnapshot;
}): OverworldJournalEntry[] {
  const campaignGoals = [...args.journey.goalHistory, args.journey.goal];

  return args.journalEntries.map((entry) => {
    if (entry.kind !== "quest_done" || entry.questCompletionBoundary !== undefined) {
      return entry;
    }
    const questId = entry.id.slice("quest_done:".length);
    const goal = campaignGoals.find(
      (candidate) =>
        candidate.status === "completed" &&
        journeyCampaignGoalDefinition(candidate)?.targetQuestId === questId,
    );
    if (!goal || goal.completedAtDecision === null) return entry;

    const proof = args.boundaryProofsByOrdinal.get(goal.completedAtDecision);
    if (
      !proof ||
      proof.decision === null ||
      proof.decisionProofHash.length === 0 ||
      proof.decision.number !== goal.completedAtDecision ||
      proof.townId === null ||
      proof.areaId === null ||
      args.indexes.areaHomes.get(proof.areaId) !== proof.townId ||
      entry.town !== args.indexes.townNameForSource(proof.townId)
    ) {
      throw new Error(
        `Legacy overworld session snapshot quest completion "${questId}" has no replayable campaign boundary.`,
      );
    }

    return {
      ...entry,
      questCompletionBoundary: {
        acceptedDecisions: goal.completedAtDecision,
        decisionProofHash: proof.decisionProofHash,
        townId: proof.townId,
        areaId: proof.areaId,
        minutes: parseTimeLabel(entry.recordedAt),
      },
    };
  });
}

function deriveCampaignWorldFactProofOrdinals(args: {
  decisionProofsByOrdinal: ReadonlyMap<number, OverworldCampaignBoundaryReplayProof>;
  indexes: OverworldSnapshotManifestIndex;
  journalEntries: readonly OverworldJournalEntry[];
  journey: JourneyContractSnapshot;
  questOutcomeIds: ReadonlyMap<string, string>;
  requireBoundServiceFacts: boolean;
}): ReadonlyMap<string, number | null> {
  const proofOrdinals = new Map<string, number | null>();
  const entriesById = new Map(args.journalEntries.map((entry) => [entry.id, entry]));
  const serviceFactIds = new Set(
    [...args.indexes.campaignServiceRulesById.values()].flatMap((rule) => [
      ...(rule.requires_all_world_facts ?? []),
      ...(rule.forbids_any_world_facts ?? []),
    ]),
  );
  const completionOrdinalByQuestId = new Map<string, number>();
  for (const goal of [...args.journey.goalHistory, args.journey.goal]) {
    if (goal.status !== "completed" || goal.completedAtDecision === null) continue;
    const definition = journeyCampaignGoalDefinition(goal);
    if (definition)
      completionOrdinalByQuestId.set(definition.targetQuestId, goal.completedAtDecision);
  }
  for (const [questId, endingId] of args.questOutcomeIds) {
    const quest = args.indexes.questsById.get(questId);
    if (!quest) continue;
    const campaignExport = questCampaignExportForEnding(quest, endingId);
    if (!campaignExport) continue;
    const completionEntry = entriesById.get(`quest_done:${questId}`);
    if (!completionEntry) continue;
    const exportsServiceFact = campaignExport.effects.some(
      (effect) => effect.type === "set_world_fact" && serviceFactIds.has(effect.fact_id),
    );
    const proofOrdinal = questCompletionBoundaryOrdinal(
      completionEntry,
      args.decisionProofsByOrdinal,
      {
        expectedCompletedAtDecision: completionOrdinalByQuestId.get(questId) ?? null,
        questId,
        requireBound: args.requireBoundServiceFacts && exportsServiceFact,
      },
    );
    for (const effect of campaignExport.effects) {
      if (effect.type !== "set_world_fact") continue;
      if (!proofOrdinals.has(effect.fact_id)) {
        proofOrdinals.set(effect.fact_id, proofOrdinal);
        continue;
      }
      const previous = proofOrdinals.get(effect.fact_id) ?? null;
      if (previous === null || proofOrdinal === null) {
        proofOrdinals.set(effect.fact_id, null);
      } else if (proofOrdinal < previous) {
        proofOrdinals.set(effect.fact_id, proofOrdinal);
      }
    }
  }
  return proofOrdinals;
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
