import { z } from "zod";
import {
  CampaignCharacterStateSchema,
  cloneCampaignCharacterState,
  createInitialCampaignCharacterState,
} from "./campaign_character_state.js";
import {
  JourneyContractSnapshotSchema,
  JourneyDecisionProofLastSchema,
  cloneJourneyContractSnapshot,
  type JourneyDecisionProofLast,
} from "./journey_contract.js";
import type { OverworldRoadEvent } from "./overworld.js";
import {
  OVERWORLD_MAX_FATIGUE as MAX_FATIGUE,
  OVERWORLD_MAX_SUPPLIES as MAX_SUPPLIES,
  type OverworldRoadEncounterOption,
} from "./travel_mechanics.js";

export const OVERWORLD_SESSION_LEGACY_SAVE_VERSION = 8 as const;
export const OVERWORLD_SESSION_SAVE_VERSION = 9 as const;

export type TravelLogEntry = {
  edgeId: string;
  fromId: string;
  toId: string;
  from: string;
  to: string;
  route: string;
  distanceMi: number;
  baseMinutes: number;
  delayMinutes: number;
  minutes: number;
  arrivedAt: number;
  suppliesUsed: number;
  suppliesAfter: number;
  fatigueGained: number;
  fatigueAfter: number;
  roadEvent: OverworldRoadEvent | null;
};

export type TravelLogEntrySnapshot = {
  edgeId: string;
  fromId: string;
  toId: string;
  roadEventId?: string | null | undefined;
  delayMinutes: number;
  minutes: number;
  arrivedAt: number;
  suppliesUsed: number;
  suppliesAfter: number;
  fatigueGained: number;
  fatigueAfter: number;
};

const TravelLogEntrySnapshotSchema = z
  .object({
    edgeId: z.string().min(1),
    fromId: z.string().min(1),
    toId: z.string().min(1),
    roadEventId: z.string().min(1).nullable().optional(),
    delayMinutes: z.number().int().nonnegative(),
    minutes: z.number().int().nonnegative(),
    arrivedAt: z.number().int().nonnegative(),
    suppliesUsed: z.number().int().min(0).max(MAX_SUPPLIES),
    suppliesAfter: z.number().int().min(0).max(MAX_SUPPLIES),
    fatigueGained: z.number().int().nonnegative(),
    fatigueAfter: z.number().int().min(0).max(MAX_FATIGUE),
  })
  .strict();

export type OverworldPendingRoadEncounter = {
  id: string;
  edgeId: string;
  from: string;
  to: string;
  route: string;
  arrivedAt: string;
  timing: string;
  event: OverworldRoadEvent;
  options: OverworldRoadEncounterOption[];
};

export type OverworldPendingRoadEncounterSnapshot = {
  edgeId: string;
};

const OverworldPendingRoadEncounterSnapshotSchema = z
  .object({
    edgeId: z.string().min(1),
  })
  .strict();

export type OverworldJournalDecisionBoundary = {
  acceptedDecisions: number;
  decisionProofHash: string;
  townId: string;
  areaId: string;
  minutes: number;
};

/**
 * Replayable suffix from the source offer (or a trusted migration marker) to
 * the current journey proof. This makes the chosen source part of every later
 * save's causal history instead of trusting a detached journal entry.
 */
export type OverworldOpeningLeadSourceDecisionTrail = {
  anchorId: string;
  baseAcceptedDecisions: number;
  baseDecisionProofHash: string;
  decisions: JourneyDecisionProofLast[];
};

export function cloneOpeningLeadSourceDecisionTrail(
  trail: OverworldOpeningLeadSourceDecisionTrail,
): OverworldOpeningLeadSourceDecisionTrail {
  return {
    ...trail,
    decisions: trail.decisions.map((decision) => ({ ...decision })),
  };
}

export type OverworldJournalEntry = {
  id: string;
  kind:
    | "area"
    | "campaign"
    | "contact"
    | "event"
    | "job"
    | "lead_source"
    | "lead_source_legacy"
    | "lead_source_offer"
    | "poi"
    | "quest"
    | "quest_done"
    | "registration"
    | "registration_legacy"
    | "registration_offer"
    | "regional_arc"
    | "resolution"
    | "road"
    | "service"
    | "site";
  town: string;
  title: string;
  text: string;
  recordedAt: string;
  questCompletionBoundary?: OverworldJournalDecisionBoundary | undefined;
  registrationBoundary?: OverworldJournalDecisionBoundary | undefined;
  serviceBoundary?: OverworldJournalDecisionBoundary | undefined;
  serviceRuleId?: string | undefined;
  serviceAreaId?: string | undefined;
  storyChoiceBoundary?: OverworldJournalDecisionBoundary | undefined;
};

const OverworldJournalRegistrationBoundarySchema = z
  .object({
    acceptedDecisions: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    decisionProofHash: z.string().regex(/^[0-9a-f]{64}$/),
    townId: z.string().min(1),
    areaId: z.string().min(1),
    minutes: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  })
  .strict();

const OverworldOpeningLeadSourceDecisionTrailSchema = z
  .object({
    anchorId: z.string().min(1),
    baseAcceptedDecisions: z.number().int().nonnegative().safe(),
    baseDecisionProofHash: z.string().regex(/^[0-9a-f]{64}$/),
    decisions: z.array(JourneyDecisionProofLastSchema),
  })
  .strict();

const OverworldJournalEntrySchema = z
  .object({
    id: z.string().min(1),
    kind: z.enum([
      "area",
      "campaign",
      "contact",
      "event",
      "job",
      "lead_source",
      "lead_source_legacy",
      "lead_source_offer",
      "poi",
      "quest",
      "quest_done",
      "registration",
      "registration_legacy",
      "registration_offer",
      "regional_arc",
      "resolution",
      "road",
      "service",
      "site",
    ]),
    town: z.string().min(1),
    title: z.string().min(1),
    text: z.string().min(1),
    recordedAt: z.string().min(1),
    questCompletionBoundary: OverworldJournalRegistrationBoundarySchema.optional(),
    registrationBoundary: OverworldJournalRegistrationBoundarySchema.optional(),
    serviceBoundary: OverworldJournalRegistrationBoundarySchema.optional(),
    serviceRuleId: z.string().min(1).optional(),
    serviceAreaId: z.string().min(1).optional(),
    storyChoiceBoundary: OverworldJournalRegistrationBoundarySchema.optional(),
  })
  .strict()
  .superRefine((entry, ctx) => {
    const hasRuleId = entry.serviceRuleId !== undefined;
    const hasAreaId = entry.serviceAreaId !== undefined;
    if (hasRuleId !== hasAreaId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Service journal proof must include both serviceRuleId and serviceAreaId.",
      });
    }
    const hasServiceProof = hasRuleId || hasAreaId;
    if (hasServiceProof && entry.kind !== "service") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Service journal proof is only valid on service entries.",
      });
    }
    if (hasServiceProof !== (entry.serviceBoundary !== undefined)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Campaign service journal proof must include its serviceBoundary.",
      });
    }
    if (entry.questCompletionBoundary !== undefined && entry.kind !== "quest_done") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Quest completion boundaries are only valid on quest_done entries.",
      });
    }
  });

export const OverworldSessionSnapshotV8Schema = z
  .object({
    version: z.literal(OVERWORLD_SESSION_LEGACY_SAVE_VERSION),
    worldId: z.string().min(1),
    worldHash: z.string().regex(/^[0-9a-f]{64}$/),
    currentId: z.string().min(1),
    currentAreaId: z.string().min(1).nullable(),
    minutes: z.number().int().nonnegative(),
    supplies: z.number().int().min(0).max(MAX_SUPPLIES),
    fatigue: z.number().int().min(0).max(MAX_FATIGUE),
    discoveredIds: z.array(z.string().min(1)),
    visitedIds: z.array(z.string().min(1)),
    currentAreaByTown: z.array(z.tuple([z.string().min(1), z.string().min(1)])),
    travelLog: z.array(TravelLogEntrySnapshotSchema),
    journalEntries: z.array(OverworldJournalEntrySchema),
    resolvedEventIds: z.array(z.string().min(1)),
    discoveredAreaIds: z.array(z.string().min(1)),
    visitedAreaIds: z.array(z.string().min(1)),
    discoveredJobIds: z.array(z.string().min(1)),
    completedJobIds: z.array(z.string().min(1)),
    discoveredSiteIds: z.array(z.string().min(1)),
    discoveredQuestIds: z.array(z.string().min(1)),
    startedQuestIds: z.array(z.string().min(1)),
    completedQuestIds: z.array(z.string().min(1)),
    questOutcomes: z.array(z.tuple([z.string().min(1), z.string().min(1)])),
    exploredSiteIds: z.array(z.string().min(1)),
    regionRenown: z.array(z.tuple([z.string().min(1), z.number().int().nonnegative()])),
    completedRegionalArcIds: z.array(z.string().min(1)),
    pendingRoadEncounter: OverworldPendingRoadEncounterSnapshotSchema.nullable(),
    journey: JourneyContractSnapshotSchema,
  })
  .strict();

export const OverworldSessionSnapshotSchema = OverworldSessionSnapshotV8Schema.extend({
  version: z.literal(OVERWORLD_SESSION_SAVE_VERSION),
  character: CampaignCharacterStateSchema,
  openingLeadSourceDecisionTrail: OverworldOpeningLeadSourceDecisionTrailSchema.optional(),
}).strict();

export type OverworldSessionSnapshotV8 = z.infer<typeof OverworldSessionSnapshotV8Schema>;
export type OverworldSessionSnapshot = z.infer<typeof OverworldSessionSnapshotSchema>;

const OverworldSessionSnapshotVersionSchema = z.object({ version: z.number().int() }).passthrough();

/** Parse current saves and migrate the one explicitly supported legacy shape. */
export function parseOverworldSessionSnapshot(raw: unknown): OverworldSessionSnapshot {
  const { version } = OverworldSessionSnapshotVersionSchema.parse(raw);
  if (version === OVERWORLD_SESSION_LEGACY_SAVE_VERSION) {
    const legacy = OverworldSessionSnapshotV8Schema.parse(raw);
    return OverworldSessionSnapshotSchema.parse({
      ...legacy,
      version: OVERWORLD_SESSION_SAVE_VERSION,
      character: createInitialCampaignCharacterState(),
    });
  }
  if (version === OVERWORLD_SESSION_SAVE_VERSION) {
    return OverworldSessionSnapshotSchema.parse(raw);
  }
  throw new Error(
    `Unsupported overworld session snapshot version ${String(version)}; expected ${String(OVERWORLD_SESSION_LEGACY_SAVE_VERSION)} or ${String(OVERWORLD_SESSION_SAVE_VERSION)}.`,
  );
}

export function cloneJournalEntries(
  entries: readonly OverworldJournalEntry[],
): OverworldJournalEntry[] {
  const clones: OverworldJournalEntry[] = [];
  for (const entry of entries) clones.push(cloneOverworldJournalEntry(entry));
  return clones;
}

export function cloneOverworldJournalEntry(entry: OverworldJournalEntry): OverworldJournalEntry {
  return {
    ...entry,
    ...(entry.questCompletionBoundary
      ? { questCompletionBoundary: { ...entry.questCompletionBoundary } }
      : {}),
    ...(entry.registrationBoundary
      ? { registrationBoundary: { ...entry.registrationBoundary } }
      : {}),
    ...(entry.serviceBoundary ? { serviceBoundary: { ...entry.serviceBoundary } } : {}),
    ...(entry.storyChoiceBoundary ? { storyChoiceBoundary: { ...entry.storyChoiceBoundary } } : {}),
  };
}

export function redactOverworldJournalEntryForPresentation(
  entry: OverworldJournalEntry,
): OverworldJournalEntry {
  const {
    questCompletionBoundary: _questCompletionBoundary,
    registrationBoundary: _registrationBoundary,
    serviceBoundary: _serviceBoundary,
    serviceRuleId: _serviceRuleId,
    serviceAreaId: _serviceAreaId,
    storyChoiceBoundary: _storyChoiceBoundary,
    ...presented
  } = entry;
  return presented;
}

function cloneTravelLogSnapshots(
  entries: readonly TravelLogEntrySnapshot[],
): TravelLogEntrySnapshot[] {
  const clones: TravelLogEntrySnapshot[] = [];
  for (const entry of entries) clones.push({ ...entry });
  return clones;
}

function cloneStringTuples(values: readonly (readonly [string, string])[]): [string, string][] {
  const clones: [string, string][] = [];
  for (const [left, right] of values) clones.push([left, right]);
  return clones;
}

function cloneNumberTuples(values: readonly (readonly [string, number])[]): [string, number][] {
  const clones: [string, number][] = [];
  for (const [left, right] of values) clones.push([left, right]);
  return clones;
}

export function cloneOverworldSessionSnapshot(
  snapshot: OverworldSessionSnapshot,
): OverworldSessionSnapshot {
  return {
    ...snapshot,
    character: cloneCampaignCharacterState(snapshot.character),
    discoveredIds: [...snapshot.discoveredIds],
    visitedIds: [...snapshot.visitedIds],
    currentAreaByTown: cloneStringTuples(snapshot.currentAreaByTown),
    travelLog: cloneTravelLogSnapshots(snapshot.travelLog),
    journalEntries: cloneJournalEntries(snapshot.journalEntries),
    resolvedEventIds: [...snapshot.resolvedEventIds],
    discoveredAreaIds: [...snapshot.discoveredAreaIds],
    visitedAreaIds: [...snapshot.visitedAreaIds],
    discoveredJobIds: [...snapshot.discoveredJobIds],
    completedJobIds: [...snapshot.completedJobIds],
    discoveredSiteIds: [...snapshot.discoveredSiteIds],
    discoveredQuestIds: [...snapshot.discoveredQuestIds],
    startedQuestIds: [...snapshot.startedQuestIds],
    completedQuestIds: [...snapshot.completedQuestIds],
    questOutcomes: cloneStringTuples(snapshot.questOutcomes),
    exploredSiteIds: [...snapshot.exploredSiteIds],
    regionRenown: cloneNumberTuples(snapshot.regionRenown),
    completedRegionalArcIds: [...snapshot.completedRegionalArcIds],
    pendingRoadEncounter: snapshot.pendingRoadEncounter
      ? { ...snapshot.pendingRoadEncounter }
      : null,
    ...(snapshot.openingLeadSourceDecisionTrail
      ? {
          openingLeadSourceDecisionTrail: cloneOpeningLeadSourceDecisionTrail(
            snapshot.openingLeadSourceDecisionTrail,
          ),
        }
      : {}),
    journey: cloneJourneyContractSnapshot(snapshot.journey),
  };
}

export function snapshotTravelLogEntry(entry: TravelLogEntry): TravelLogEntrySnapshot {
  return {
    edgeId: entry.edgeId,
    fromId: entry.fromId,
    toId: entry.toId,
    roadEventId: entry.roadEvent?.id ?? null,
    delayMinutes: entry.delayMinutes,
    minutes: entry.minutes,
    arrivedAt: entry.arrivedAt,
    suppliesUsed: entry.suppliesUsed,
    suppliesAfter: entry.suppliesAfter,
    fatigueGained: entry.fatigueGained,
    fatigueAfter: entry.fatigueAfter,
  };
}

export function snapshotTravelLogEntries(
  entries: readonly TravelLogEntry[],
): TravelLogEntrySnapshot[] {
  const snapshots: TravelLogEntrySnapshot[] = [];
  for (const entry of entries) snapshots.push(snapshotTravelLogEntry(entry));
  return snapshots;
}
