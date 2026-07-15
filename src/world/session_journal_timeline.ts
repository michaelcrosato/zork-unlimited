import type { OverworldCharacter, OverworldLocalEvent, OverworldPoi } from "./overworld.js";
import {
  openingAllyLegacyJournalDraft,
  openingAllyLegacySourceWorldHash,
  type OpeningAllyJournalDraft,
} from "./opening_ally_journal.js";
import type { OverworldContactPresentation } from "./session_contact_presentation.js";
import {
  openingLeadSourceLegacyJournalDraft,
  openingLeadSourceLegacySourceWorldHash,
  type OpeningLeadSourceJournalDraft,
} from "./opening_lead_source_journal.js";
import {
  openingPreparationLegacyJournalDraft,
  openingPreparationLegacySourceWorldHash,
  type OpeningPreparationJournalDraft,
} from "./opening_preparation_journal.js";
import {
  openingReliefAllocationLegacyJournalDraft,
  openingReliefAllocationLegacySourceWorldHash,
  type OpeningReliefAllocationJournalDraft,
} from "./opening_relief_allocation_journal.js";
import {
  openingRegistrationLegacyJournalDraft,
  openingRegistrationLegacySourceWorldHash,
  type OpeningRegistrationJournalDraft,
} from "./opening_registration_journal.js";
import {
  parseRoadJournalId,
  parseServiceJournalId,
  parseTimeLabel,
} from "./session_journal_codec.js";
import { describeOverworldContactAction } from "./local_actions.js";
import {
  emptyProgressJournalSourceIndex,
  recordProgressJournalSource,
  type OverworldProgressJournalSourceIndex,
} from "./session_progress_journal.js";
import {
  recordRoadJournalResolution,
  recordServiceJournalReplay,
  type OverworldRoadJournalResolutionEntry,
  type OverworldServiceJournalReplayEntry,
  type OverworldServiceJournalReplayIndex,
} from "./session_resource_replay.js";
import type { OverworldJournalEntry, OverworldSessionSnapshot } from "./session_snapshot.js";

export type OverworldJournalSourceIndex = {
  arcIds: ReadonlySet<string>;
  arcRegionNames: ReadonlyMap<string, string>;
  areaIds: ReadonlySet<string>;
  areaTownNames: ReadonlyMap<string, string>;
  characterIds: ReadonlySet<string>;
  characterTownNames: ReadonlyMap<string, string>;
  contactPresentationsByJournalId: ReadonlyMap<string, OverworldContactPresentation>;
  edgeIds: ReadonlySet<string>;
  eventIds: ReadonlySet<string>;
  eventTownNames: ReadonlyMap<string, string>;
  jobIds: ReadonlySet<string>;
  jobTownNames: ReadonlyMap<string, string>;
  openingLeadSourceJournalIds?: ReadonlySet<string>;
  openingLeadSourceOfferDraft?: OpeningLeadSourceJournalDraft | null;
  openingLeadSourceTownName?: string | null;
  openingAllyJournalIds?: ReadonlySet<string>;
  openingAllyOfferDraft?: OpeningAllyJournalDraft | null;
  openingAllyTownName?: string | null;
  openingPreparationJournalIds?: ReadonlySet<string>;
  openingPreparationOfferDraft?: OpeningPreparationJournalDraft | null;
  openingPreparationTownName?: string | null;
  openingReliefAllocationJournalIds?: ReadonlySet<string>;
  openingReliefAllocationOfferDraft?: OpeningReliefAllocationJournalDraft | null;
  openingReliefAllocationTownName?: string | null;
  openingRegistrationJournalDraftsById: ReadonlyMap<string, OpeningRegistrationJournalDraft>;
  openingRegistrationTownName: string | null;
  poiIds: ReadonlySet<string>;
  poiTownNames: ReadonlyMap<string, string>;
  questIds: ReadonlySet<string>;
  questTownNames: ReadonlyMap<string, string>;
  regionNames: ReadonlySet<string>;
  siteIds: ReadonlySet<string>;
  siteTownNames: ReadonlyMap<string, string>;
  townNames: ReadonlySet<string>;
  travelLogArrivals: ReadonlySet<string>;
  travelLogTownByArrival: ReadonlyMap<string, string>;
};

export type OverworldResolutionProofIndex = {
  charactersById: ReadonlyMap<string, OverworldCharacter>;
  contactPresentationsByJournalId: ReadonlyMap<string, OverworldContactPresentation>;
  eventsById: ReadonlyMap<string, OverworldLocalEvent>;
  poisById: ReadonlyMap<string, OverworldPoi>;
};

export type OverworldJournalTimelineSourceIndex = OverworldJournalSourceIndex &
  OverworldResolutionProofIndex;

export type OverworldEventResolutionJournalIndex = {
  contactTimeByArea: ReadonlyMap<string, number>;
  recordedAtById: ReadonlyMap<string, number>;
  resolutionTimeByTown: ReadonlyMap<string, number>;
  scoutTimeByArea: ReadonlyMap<string, number>;
};

type MutableOverworldEventResolutionJournalIndex = {
  contactTimeByArea: Map<string, number>;
  recordedAtById: ReadonlyMap<string, number>;
  resolutionTimeByTown: Map<string, number>;
  scoutTimeByArea: Map<string, number>;
};

export type OverworldLocalActionJournalTimelineEntry = {
  entry: OverworldJournalEntry;
  recordedAt: number;
};

export type OverworldJournalTimelineIndex = {
  eventResolutionProofs: OverworldEventResolutionJournalIndex;
  localActionEntries: readonly OverworldLocalActionJournalTimelineEntry[];
  progressSources: OverworldProgressJournalSourceIndex;
  roadJournalEntries: readonly OverworldRoadJournalResolutionEntry[];
  serviceJournal: OverworldServiceJournalReplayIndex;
};

function assertKnownJournalSource(
  entry: OverworldJournalEntry,
  prefix: string,
  known: ReadonlySet<string>,
  sourceLabel: string,
  sourcePlaces?: ReadonlyMap<string, string>,
  placeLabel = "town",
): void {
  if (!entry.id.startsWith(prefix)) {
    throw new Error(
      `Overworld session snapshot journal ${entry.kind} entry id "${entry.id}" must start with "${prefix}".`,
    );
  }
  const sourceId = entry.id.slice(prefix.length);
  if (!sourceId) {
    throw new Error(
      `Overworld session snapshot journal ${entry.kind} entry has an empty ${sourceLabel} id.`,
    );
  }
  if (!known.has(sourceId)) {
    throw new Error(
      `Overworld session snapshot journal ${entry.kind} entry references unknown ${sourceLabel} "${sourceId}".`,
    );
  }
  const expectedPlace = sourcePlaces?.get(sourceId);
  if (expectedPlace && entry.town !== expectedPlace) {
    throw new Error(
      `Overworld session snapshot journal ${entry.kind} entry "${entry.id}" is bound to ${placeLabel} "${entry.town}", expected "${expectedPlace}".`,
    );
  }
}

function contactPresentationForJournalEntry(
  entry: OverworldJournalEntry,
  sources: Pick<OverworldJournalSourceIndex, "contactPresentationsByJournalId">,
): OverworldContactPresentation | null {
  const exact = sources.contactPresentationsByJournalId.get(entry.id);
  if (exact) return exact;
  const repeated = /^(.*):(\d+)$/.exec(entry.id);
  if (!repeated || Number(repeated[2]) !== parseTimeLabel(entry.recordedAt)) return null;
  return sources.contactPresentationsByJournalId.get(repeated[1]!) ?? null;
}

function assertKnownContactPresentation(
  entry: OverworldJournalEntry,
  sources: OverworldJournalSourceIndex,
): void {
  const presentation = contactPresentationForJournalEntry(entry, sources);
  if (!presentation) {
    throw new Error(
      `Overworld session snapshot journal contact entry references unknown contact presentation "${entry.id}".`,
    );
  }
  const expected = describeOverworldContactAction(
    presentation.contact,
    presentation.presentationId,
  );
  if (
    entry.id !== expected.id &&
    (entry.title !== expected.title || entry.text !== expected.text)
  ) {
    throw new Error(
      `Overworld session snapshot journal contact entry "${entry.id}" does not match its authored copy.`,
    );
  }
  const expectedTown = sources.characterTownNames.get(presentation.character.id);
  if (expectedTown && entry.town !== expectedTown) {
    throw new Error(
      `Overworld session snapshot journal contact entry "${entry.id}" is bound to town "${entry.town}", expected "${expectedTown}".`,
    );
  }
}

function assertRoadJournalSource(
  entry: OverworldJournalEntry,
  recordedAt: number,
  sources: OverworldJournalSourceIndex,
): void {
  const parsed = parseRoadJournalId(entry.id);
  if (!sources.edgeIds.has(parsed.edgeId)) {
    throw new Error(
      `Overworld session snapshot journal road entry references unknown road "${parsed.edgeId}".`,
    );
  }
  if (parsed.arrivedAt > recordedAt) {
    throw new Error("Overworld session snapshot journal road entry predates its road arrival.");
  }
  if (!sources.travelLogArrivals.has(`${parsed.edgeId}@${parsed.arrivedAt}`)) {
    throw new Error(
      `Overworld session snapshot journal road entry has no matching travel log for "${parsed.edgeId}" at ${parsed.arrivedAt}.`,
    );
  }
  const expectedTown = sources.travelLogTownByArrival.get(`${parsed.edgeId}@${parsed.arrivedAt}`);
  if (expectedTown && entry.town !== expectedTown) {
    throw new Error(
      `Overworld session snapshot journal road entry "${entry.id}" is bound to town "${entry.town}", expected "${expectedTown}".`,
    );
  }
}

function assertServiceJournalSource(entry: OverworldJournalEntry, recordedAt: number): void {
  const service = parseServiceJournalId(entry.id);
  if (service.recordedAt !== recordedAt) {
    throw new Error(
      "Overworld session snapshot journal service entry time does not match its timestamp.",
    );
  }
}

function assertOpeningRegistrationJournalSource(
  entry: OverworldJournalEntry,
  sources: OverworldJournalSourceIndex,
): void {
  const draft = sources.openingRegistrationJournalDraftsById.get(entry.id);
  if (!draft || draft.kind !== entry.kind) {
    throw new Error(
      `Overworld session snapshot journal ${entry.kind} entry references unknown opening registration evidence "${entry.id}".`,
    );
  }
  if (entry.title !== draft.title || entry.text !== draft.text) {
    throw new Error(
      `Overworld session snapshot journal ${entry.kind} entry "${entry.id}" does not match its authored copy.`,
    );
  }
  if (
    sources.openingRegistrationTownName !== null &&
    entry.town !== sources.openingRegistrationTownName
  ) {
    throw new Error(
      `Overworld session snapshot journal ${entry.kind} entry "${entry.id}" is bound to town "${entry.town}", expected "${sources.openingRegistrationTownName}".`,
    );
  }
}

function assertOpeningRegistrationLegacyJournalSource(entry: OverworldJournalEntry): void {
  const sourceWorldHash = openingRegistrationLegacySourceWorldHash(entry.id);
  if (!sourceWorldHash) {
    throw new Error(
      `Overworld session snapshot journal registration_legacy entry id "${entry.id}" must contain a source world hash.`,
    );
  }
  const draft = openingRegistrationLegacyJournalDraft(sourceWorldHash);
  if (entry.title !== draft.title || entry.text !== draft.text) {
    throw new Error(
      `Overworld session snapshot journal registration_legacy entry "${entry.id}" does not match its canonical copy.`,
    );
  }
}

function assertOpeningLeadSourceJournalSource(
  entry: OverworldJournalEntry,
  sources: OverworldJournalSourceIndex,
): void {
  if (entry.kind === "lead_source_offer") {
    const draft = sources.openingLeadSourceOfferDraft;
    if (
      !draft ||
      entry.id !== draft.id ||
      entry.title !== draft.title ||
      entry.text !== draft.text
    ) {
      throw new Error(
        `Overworld session snapshot journal lead_source_offer entry "${entry.id}" does not match its authored copy.`,
      );
    }
  } else if (!sources.openingLeadSourceJournalIds?.has(entry.id)) {
    throw new Error(
      `Overworld session snapshot journal lead_source entry references unknown evidence "${entry.id}".`,
    );
  }
  if (
    sources.openingLeadSourceTownName != null &&
    entry.town !== sources.openingLeadSourceTownName
  ) {
    throw new Error(
      `Overworld session snapshot journal ${entry.kind} entry "${entry.id}" is bound to town "${entry.town}", expected "${sources.openingLeadSourceTownName}".`,
    );
  }
}

function assertOpeningLeadSourceLegacyJournalSource(entry: OverworldJournalEntry): void {
  const sourceWorldHash = openingLeadSourceLegacySourceWorldHash(entry.id);
  if (!sourceWorldHash) {
    throw new Error(
      `Overworld session snapshot journal lead_source_legacy entry id "${entry.id}" must contain a source world hash.`,
    );
  }
  const draft = openingLeadSourceLegacyJournalDraft(sourceWorldHash);
  if (entry.title !== draft.title || entry.text !== draft.text) {
    throw new Error(
      `Overworld session snapshot journal lead_source_legacy entry "${entry.id}" does not match its canonical copy.`,
    );
  }
}

function assertOpeningPreparationJournalSource(
  entry: OverworldJournalEntry,
  sources: OverworldJournalSourceIndex,
): void {
  if (entry.kind === "preparation_offer") {
    const draft = sources.openingPreparationOfferDraft;
    if (
      !draft ||
      entry.id !== draft.id ||
      entry.title !== draft.title ||
      entry.text !== draft.text
    ) {
      throw new Error(
        `Overworld session snapshot journal preparation_offer entry "${entry.id}" does not match its authored copy.`,
      );
    }
  } else if (!sources.openingPreparationJournalIds?.has(entry.id)) {
    throw new Error(
      `Overworld session snapshot journal preparation entry references unknown evidence "${entry.id}".`,
    );
  }
  if (
    sources.openingPreparationTownName != null &&
    entry.town !== sources.openingPreparationTownName
  ) {
    throw new Error(
      `Overworld session snapshot journal ${entry.kind} entry "${entry.id}" is bound to town "${entry.town}", expected "${sources.openingPreparationTownName}".`,
    );
  }
}

function assertOpeningPreparationLegacyJournalSource(entry: OverworldJournalEntry): void {
  const sourceWorldHash = openingPreparationLegacySourceWorldHash(entry.id);
  if (!sourceWorldHash) {
    throw new Error(
      `Overworld session snapshot journal preparation_legacy entry id "${entry.id}" must contain a source world hash.`,
    );
  }
  const draft = openingPreparationLegacyJournalDraft(sourceWorldHash);
  if (entry.title !== draft.title || entry.text !== draft.text) {
    throw new Error(
      `Overworld session snapshot journal preparation_legacy entry "${entry.id}" does not match its canonical copy.`,
    );
  }
}

function assertOpeningReliefAllocationJournalSource(
  entry: OverworldJournalEntry,
  sources: OverworldJournalSourceIndex,
): void {
  if (entry.kind === "relief_allocation_offer") {
    const draft = sources.openingReliefAllocationOfferDraft;
    if (
      !draft ||
      entry.id !== draft.id ||
      entry.title !== draft.title ||
      entry.text !== draft.text
    ) {
      throw new Error(
        `Overworld session snapshot journal relief_allocation_offer entry "${entry.id}" does not match its authored copy.`,
      );
    }
  } else if (!sources.openingReliefAllocationJournalIds?.has(entry.id)) {
    throw new Error(
      `Overworld session snapshot journal relief_allocation entry references unknown evidence "${entry.id}".`,
    );
  }
  if (
    sources.openingReliefAllocationTownName != null &&
    entry.town !== sources.openingReliefAllocationTownName
  ) {
    throw new Error(
      `Overworld session snapshot journal ${entry.kind} entry "${entry.id}" is bound to town "${entry.town}", expected "${sources.openingReliefAllocationTownName}".`,
    );
  }
}

function assertOpeningReliefAllocationLegacyJournalSource(entry: OverworldJournalEntry): void {
  const sourceWorldHash = openingReliefAllocationLegacySourceWorldHash(entry.id);
  if (!sourceWorldHash) {
    throw new Error(
      `Overworld session snapshot journal relief_allocation_legacy entry id "${entry.id}" must contain a source world hash.`,
    );
  }
  const draft = openingReliefAllocationLegacyJournalDraft(sourceWorldHash);
  if (entry.title !== draft.title || entry.text !== draft.text) {
    throw new Error(
      `Overworld session snapshot journal relief_allocation_legacy entry "${entry.id}" does not match its canonical copy.`,
    );
  }
}

function assertOpeningAllyJournalSource(
  entry: OverworldJournalEntry,
  sources: OverworldJournalSourceIndex,
): void {
  if (entry.kind === "ally_offer") {
    const draft = sources.openingAllyOfferDraft;
    if (
      !draft ||
      entry.id !== draft.id ||
      entry.title !== draft.title ||
      entry.text !== draft.text
    ) {
      throw new Error(
        `Overworld session snapshot journal ally_offer entry "${entry.id}" does not match its authored copy.`,
      );
    }
  } else if (!sources.openingAllyJournalIds?.has(entry.id)) {
    throw new Error(
      `Overworld session snapshot journal ally entry references unknown evidence "${entry.id}".`,
    );
  }
  if (sources.openingAllyTownName != null && entry.town !== sources.openingAllyTownName) {
    throw new Error(
      `Overworld session snapshot journal ${entry.kind} entry "${entry.id}" is bound to town "${entry.town}", expected "${sources.openingAllyTownName}".`,
    );
  }
}

function assertOpeningAllyLegacyJournalSource(entry: OverworldJournalEntry): void {
  const sourceWorldHash = openingAllyLegacySourceWorldHash(entry.id);
  if (!sourceWorldHash) {
    throw new Error(
      `Overworld session snapshot journal ally_legacy entry id "${entry.id}" must contain a source world hash.`,
    );
  }
  const draft = openingAllyLegacyJournalDraft(sourceWorldHash);
  if (entry.title !== draft.title || entry.text !== draft.text) {
    throw new Error(
      `Overworld session snapshot journal ally_legacy entry "${entry.id}" does not match its canonical copy.`,
    );
  }
}

function assertSnapshotJournalSource(
  entry: OverworldJournalEntry,
  recordedAt: number,
  sources: OverworldJournalSourceIndex,
): void {
  const placeNames = entry.kind === "regional_arc" ? sources.regionNames : sources.townNames;
  const placeLabel = entry.kind === "regional_arc" ? "region" : "town";
  if (!placeNames.has(entry.town)) {
    throw new Error(
      `Overworld session snapshot journal ${entry.kind} references unknown ${placeLabel} "${entry.town}".`,
    );
  }
  const isRegistrationEvidence =
    entry.kind === "registration" ||
    entry.kind === "registration_legacy" ||
    entry.kind === "registration_offer";
  if (isRegistrationEvidence !== (entry.registrationBoundary !== undefined)) {
    throw new Error(
      `Overworld session snapshot journal ${entry.kind} entry has an invalid registration boundary.`,
    );
  }
  const isStoryChoiceEvidence =
    entry.kind === "ally" ||
    entry.kind === "ally_legacy" ||
    entry.kind === "ally_offer" ||
    entry.kind === "lead_source" ||
    entry.kind === "lead_source_legacy" ||
    entry.kind === "lead_source_offer" ||
    entry.kind === "preparation" ||
    entry.kind === "preparation_legacy" ||
    entry.kind === "preparation_offer" ||
    entry.kind === "relief_allocation" ||
    entry.kind === "relief_allocation_legacy" ||
    entry.kind === "relief_allocation_offer";
  if (isStoryChoiceEvidence !== (entry.storyChoiceBoundary !== undefined)) {
    throw new Error(
      `Overworld session snapshot journal ${entry.kind} entry has an invalid story-choice boundary.`,
    );
  }
  const decisionBoundaryCount = [
    entry.questStartProof?.boundary,
    entry.questCompletionBoundary,
    entry.registrationBoundary,
    entry.serviceBoundary,
    entry.storyChoiceBoundary,
  ].filter((boundary) => boundary !== undefined).length;
  if (decisionBoundaryCount > 1) {
    throw new Error(
      `Overworld session snapshot journal ${entry.kind} entry cannot carry multiple decision boundaries.`,
    );
  }
  const hasServiceRuleId = entry.serviceRuleId !== undefined;
  const hasServiceAreaId = entry.serviceAreaId !== undefined;
  if (hasServiceRuleId !== hasServiceAreaId) {
    throw new Error(
      `Overworld session snapshot journal ${entry.kind} entry has incomplete campaign service proof.`,
    );
  }
  if ((hasServiceRuleId || hasServiceAreaId) && entry.kind !== "service") {
    throw new Error(
      `Overworld session snapshot journal ${entry.kind} entry cannot carry campaign service proof.`,
    );
  }
  if (
    (hasServiceRuleId || hasServiceAreaId) !== (entry.serviceBoundary !== undefined) ||
    (entry.serviceBoundary !== undefined && entry.kind !== "service")
  ) {
    throw new Error(
      `Overworld session snapshot journal ${entry.kind} entry has an invalid campaign service boundary.`,
    );
  }
  if (entry.questCompletionBoundary !== undefined && entry.kind !== "quest_done") {
    throw new Error(
      `Overworld session snapshot journal ${entry.kind} entry has an invalid quest completion boundary.`,
    );
  }

  switch (entry.kind) {
    case "ally":
    case "ally_offer":
      assertOpeningAllyJournalSource(entry, sources);
      return;
    case "ally_legacy":
      assertOpeningAllyLegacyJournalSource(entry);
      return;
    case "area":
      assertKnownJournalSource(entry, "area:", sources.areaIds, "area", sources.areaTownNames);
      return;
    case "campaign":
      if (!/^campaign_goal:\d+:[a-z0-9_]+$/.test(entry.id)) {
        throw new Error(
          `Overworld session snapshot journal campaign entry id "${entry.id}" must match "campaign_goal:<version>:<goal_id>".`,
        );
      }
      return;
    case "contact":
      assertKnownContactPresentation(entry, sources);
      return;
    case "event":
      assertKnownJournalSource(
        entry,
        "investigate:",
        sources.eventIds,
        "event",
        sources.eventTownNames,
      );
      return;
    case "job":
      assertKnownJournalSource(entry, "job:", sources.jobIds, "job", sources.jobTownNames);
      return;
    case "lead_source":
    case "lead_source_offer":
      assertOpeningLeadSourceJournalSource(entry, sources);
      return;
    case "lead_source_legacy":
      assertOpeningLeadSourceLegacyJournalSource(entry);
      return;
    case "poi":
      assertKnownJournalSource(
        entry,
        "scout:",
        sources.poiIds,
        "point of interest",
        sources.poiTownNames,
      );
      return;
    case "preparation":
    case "preparation_offer":
      assertOpeningPreparationJournalSource(entry, sources);
      return;
    case "preparation_legacy":
      assertOpeningPreparationLegacyJournalSource(entry);
      return;
    case "relief_allocation":
    case "relief_allocation_offer":
      assertOpeningReliefAllocationJournalSource(entry, sources);
      return;
    case "relief_allocation_legacy":
      assertOpeningReliefAllocationLegacyJournalSource(entry);
      return;
    case "quest":
      assertKnownJournalSource(entry, "quest:", sources.questIds, "quest", sources.questTownNames);
      return;
    case "quest_done":
      assertKnownJournalSource(
        entry,
        "quest_done:",
        sources.questIds,
        "quest",
        sources.questTownNames,
      );
      return;
    case "registration":
    case "registration_offer":
      assertOpeningRegistrationJournalSource(entry, sources);
      return;
    case "registration_legacy":
      assertOpeningRegistrationLegacyJournalSource(entry);
      return;
    case "regional_arc":
      assertKnownJournalSource(
        entry,
        "arc:",
        sources.arcIds,
        "regional arc",
        sources.arcRegionNames,
        "region",
      );
      return;
    case "resolution":
      assertKnownJournalSource(
        entry,
        "resolve:",
        sources.eventIds,
        "event resolution",
        sources.eventTownNames,
      );
      return;
    case "road":
      assertRoadJournalSource(entry, recordedAt, sources);
      return;
    case "service":
      assertServiceJournalSource(entry, recordedAt);
      return;
    case "site":
      assertKnownJournalSource(entry, "site:", sources.siteIds, "site", sources.siteTownNames);
      return;
  }
}

function recordEarliestTime(times: Map<string, number>, key: string, recordedAt: number): void {
  const previous = times.get(key);
  if (previous === undefined || recordedAt < previous) times.set(key, recordedAt);
}

export function journalSourceId(entry: OverworldJournalEntry, prefix: string): string | null {
  return entry.id.startsWith(prefix) ? entry.id.slice(prefix.length) : null;
}

function recordEventResolutionJournalProof(
  proofs: MutableOverworldEventResolutionJournalIndex,
  sources: OverworldResolutionProofIndex,
  entry: OverworldJournalEntry,
  recordedAt: number,
): void {
  switch (entry.kind) {
    case "poi": {
      const sourceId = journalSourceId(entry, "scout:");
      const poi = sourceId ? sources.poisById.get(sourceId) : undefined;
      if (poi) recordEarliestTime(proofs.scoutTimeByArea, poi.area, recordedAt);
      return;
    }
    case "resolution": {
      const sourceId = journalSourceId(entry, "resolve:");
      const event = sourceId ? sources.eventsById.get(sourceId) : undefined;
      if (event) recordEarliestTime(proofs.resolutionTimeByTown, event.home, recordedAt);
      return;
    }
    case "contact": {
      const presentation = contactPresentationForJournalEntry(entry, sources);
      if (presentation) {
        recordEarliestTime(proofs.contactTimeByArea, presentation.character.area, recordedAt);
      }
      return;
    }
    default:
      return;
  }
}

function recordLocalActionJournalEntry(
  entries: OverworldLocalActionJournalTimelineEntry[],
  entry: OverworldJournalEntry,
  recordedAt: number,
): void {
  switch (entry.kind) {
    case "area":
    case "contact":
    case "event":
    case "job":
    case "poi":
    case "quest_done":
    case "resolution":
    case "site":
      entries.push({ entry, recordedAt });
      return;
    default:
      return;
  }
}

export function assertSnapshotTimeline(
  snapshot: OverworldSessionSnapshot,
  sources: OverworldJournalTimelineSourceIndex,
): OverworldJournalTimelineIndex {
  let previousRecordedAt = Number.POSITIVE_INFINITY;
  let previousBoundaryDecision = Number.POSITIVE_INFINITY;
  const progressSources = emptyProgressJournalSourceIndex();
  const localActionEntries: OverworldLocalActionJournalTimelineEntry[] = [];
  const recordedAtById = new Map<string, number>();
  const roadJournalEntries: OverworldRoadJournalResolutionEntry[] = [];
  const serviceReplayEntries: OverworldServiceJournalReplayEntry[] = [];
  const eventResolutionProofs: MutableOverworldEventResolutionJournalIndex = {
    contactTimeByArea: new Map<string, number>(),
    recordedAtById,
    resolutionTimeByTown: new Map<string, number>(),
    scoutTimeByArea: new Map<string, number>(),
  };
  for (const entry of snapshot.journalEntries) {
    if (recordedAtById.has(entry.id)) {
      throw new Error(`Overworld session snapshot has duplicate journal entry id "${entry.id}".`);
    }
    const recordedAt = parseTimeLabel(entry.recordedAt);
    assertSnapshotJournalSource(entry, recordedAt, sources);
    const decisionBoundary =
      entry.questStartProof?.boundary ??
      entry.questCompletionBoundary ??
      entry.registrationBoundary ??
      entry.serviceBoundary ??
      entry.storyChoiceBoundary;
    if (decisionBoundary) {
      if (decisionBoundary.minutes !== recordedAt) {
        throw new Error(
          `Overworld session snapshot journal ${entry.kind} entry boundary time does not match its timestamp.`,
        );
      }
      if (decisionBoundary.acceptedDecisions > previousBoundaryDecision) {
        throw new Error(
          "Overworld session snapshot journal decision boundaries must be newest-first.",
        );
      }
      previousBoundaryDecision = decisionBoundary.acceptedDecisions;
    }
    if (recordedAt > snapshot.minutes) {
      throw new Error("Overworld session snapshot journal contains a future entry.");
    }
    if (recordedAt > previousRecordedAt) {
      throw new Error("Overworld session snapshot journal must be newest-first.");
    }
    recordedAtById.set(entry.id, recordedAt);
    recordProgressJournalSource(progressSources, entry);
    recordEventResolutionJournalProof(eventResolutionProofs, sources, entry, recordedAt);
    recordLocalActionJournalEntry(localActionEntries, entry, recordedAt);
    recordRoadJournalResolution(roadJournalEntries, entry, recordedAt);
    recordServiceJournalReplay(serviceReplayEntries, entry, recordedAt);
    previousRecordedAt = recordedAt;
  }

  return {
    eventResolutionProofs,
    localActionEntries,
    progressSources,
    roadJournalEntries,
    serviceJournal: { entries: serviceReplayEntries },
  };
}
