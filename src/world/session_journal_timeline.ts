import type { OverworldCharacter, OverworldLocalEvent, OverworldPoi } from "./overworld.js";
import type { OverworldContactPresentation } from "./session_contact_presentation.js";
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

function assertKnownContactPresentation(
  entry: OverworldJournalEntry,
  sources: OverworldJournalSourceIndex,
): void {
  const presentation = sources.contactPresentationsByJournalId.get(entry.id);
  if (!presentation) {
    throw new Error(
      `Overworld session snapshot journal contact entry references unknown contact presentation "${entry.id}".`,
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

  switch (entry.kind) {
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
    case "poi":
      assertKnownJournalSource(
        entry,
        "scout:",
        sources.poiIds,
        "point of interest",
        sources.poiTownNames,
      );
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
      const presentation = sources.contactPresentationsByJournalId.get(entry.id);
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
