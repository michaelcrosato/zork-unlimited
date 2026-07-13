import type {
  OverworldCharacter,
  OverworldLocalEvent,
  OverworldPoi,
  OverworldRegionalArc,
} from "./overworld.js";
import { allOverworldContactPresentations } from "./session_contact_presentation.js";
import {
  type OverworldEventResolutionJournalIndex,
  type OverworldResolutionProofIndex,
} from "./session_journal_timeline.js";
import type { OverworldJournalEntry } from "./session_snapshot.js";
import { OVERWORLD_STARTING_MINUTES as STARTING_MINUTES } from "./travel_mechanics.js";

export type OverworldRegionalArcCompletionIndex = {
  eventsById: ReadonlyMap<string, OverworldLocalEvent>;
  regionalArcs: readonly OverworldRegionalArc[];
};

export const OVERWORLD_EVENT_RESOLUTION_PREREQUISITES = [
  {
    id: "scout_poi",
    label: "scout a local point of interest",
  },
  {
    id: "talk_contact",
    label: "talk to a local contact",
  },
  {
    id: "investigate_event",
    label: "investigate the event",
  },
] as const;

export type OverworldEventResolutionPrerequisite =
  (typeof OVERWORLD_EVENT_RESOLUTION_PREREQUISITES)[number]["id"];

export type OverworldJournalEntryPresence = {
  has(id: string): boolean;
};

export type OverworldEventResolutionReadinessIndex = {
  event: Pick<OverworldLocalEvent, "area" | "id">;
  poisByArea: ReadonlyMap<string, readonly Pick<OverworldPoi, "id">[]>;
  charactersByArea: ReadonlyMap<string, readonly OverworldCharacter[]>;
  journalEntryIds: OverworldJournalEntryPresence;
};

export type OverworldEventResolutionReadiness = {
  scoutedPoi: boolean;
  talkedContact: boolean;
  investigatedEvent: boolean;
  missing: OverworldEventResolutionPrerequisite[];
};

export type OverworldJournalEntryReadIndex = OverworldJournalEntryPresence & {
  get(id: string): OverworldJournalEntry | undefined;
};

export type OverworldEventResolutionPlanState = {
  eventId: string;
  eventsById: ReadonlyMap<string, OverworldLocalEvent>;
  currentTownId: string;
  currentTownName: string;
  currentRegion: string;
  currentAreaId: string | null;
  resolvedEventIds: ReadonlySet<string>;
  journalEntries: OverworldJournalEntryReadIndex;
  poisByArea: ReadonlyMap<string, readonly Pick<OverworldPoi, "id">[]>;
  charactersByArea: ReadonlyMap<string, readonly OverworldCharacter[]>;
};

export type OverworldEventResolutionActionPlan = {
  alreadyKnown: false;
  event: OverworldLocalEvent;
  minutes: number;
  renown: number;
  region: string;
  entryDraft: Omit<OverworldJournalEntry, "recordedAt">;
};

export type OverworldEventResolutionAlreadyKnownPlan = {
  alreadyKnown: true;
  event: OverworldLocalEvent;
  minutes: 0;
  entry: OverworldJournalEntry;
};

export type OverworldEventResolutionPlan =
  | OverworldEventResolutionActionPlan
  | OverworldEventResolutionAlreadyKnownPlan;

export type OverworldPlannedEventResolution = Extract<
  OverworldEventResolutionPlan,
  { alreadyKnown: false }
>;

export type OverworldEventResolutionApplicationState = {
  resolvedEventIds: Set<string>;
  resolvedEventHomeIds: Set<string>;
  regionRenown: Map<string, number>;
};

export type OverworldAppliedEventResolution = {
  eventId: string;
  eventHome: string;
  renownRegion: string;
  renownGained: number;
  renownAfter: number;
};

function prerequisiteLabel(prerequisite: OverworldEventResolutionPrerequisite): string {
  return OVERWORLD_EVENT_RESOLUTION_PREREQUISITES.find((entry) => entry.id === prerequisite)!.label;
}

export function overworldEventResolutionReadiness(
  sources: OverworldEventResolutionReadinessIndex,
): OverworldEventResolutionReadiness {
  const scoutedPoi = (sources.poisByArea.get(sources.event.area) ?? []).some((poi) =>
    sources.journalEntryIds.has(`scout:${poi.id}`),
  );
  const talkedContact = (sources.charactersByArea.get(sources.event.area) ?? []).some((character) =>
    allOverworldContactPresentations(character).some((presentation) =>
      sources.journalEntryIds.has(presentation.journalId),
    ),
  );
  const investigatedEvent = sources.journalEntryIds.has(`investigate:${sources.event.id}`);
  const missing: OverworldEventResolutionPrerequisite[] = [];
  if (!scoutedPoi) missing.push("scout_poi");
  if (!talkedContact) missing.push("talk_contact");
  if (!investigatedEvent) missing.push("investigate_event");
  return {
    scoutedPoi,
    talkedContact,
    investigatedEvent,
    missing,
  };
}

export function missingOverworldEventResolutionStepLabels(
  missing: readonly OverworldEventResolutionPrerequisite[],
): string[] {
  return missing.map((prerequisite) => prerequisiteLabel(prerequisite));
}

export function assertOverworldEventResolutionReady(
  sources: OverworldEventResolutionReadinessIndex,
): void {
  const readiness = overworldEventResolutionReadiness(sources);
  if (readiness.missing.length === 0) return;
  throw new Error(
    `Before resolving this event, ${missingOverworldEventResolutionStepLabels(readiness.missing).join(", ")}.`,
  );
}

export function planOverworldEventResolution(
  state: OverworldEventResolutionPlanState,
): OverworldEventResolutionPlan {
  const event = state.eventsById.get(state.eventId);
  if (!event || event.home !== state.currentTownId) {
    throw new Error("That event is not active in this town.");
  }
  if (event.area !== state.currentAreaId) {
    throw new Error("Move to that local area before resolving that event.");
  }

  const entryId = `resolve:${event.id}`;
  if (state.resolvedEventIds.has(event.id)) {
    const existing = state.journalEntries.get(entryId);
    if (existing) {
      return {
        alreadyKnown: true,
        event,
        minutes: 0,
        entry: existing,
      };
    }
  }

  assertOverworldEventResolutionReady({
    charactersByArea: state.charactersByArea,
    event,
    journalEntryIds: state.journalEntries,
    poisByArea: state.poisByArea,
  });

  return {
    alreadyKnown: false,
    event,
    minutes: 30 + event.intensity * 10,
    renown: event.intensity,
    region: state.currentRegion,
    entryDraft: {
      id: entryId,
      kind: "resolution",
      town: state.currentTownName,
      title: `Resolved ${event.title}`,
      text: `${state.currentTownName} stabilizes around ${event.title}. Your work reduces ${event.pressure} pressure and earns ${event.intensity} ${state.currentRegion} renown.`,
    },
  };
}

export function applyOverworldEventResolution(
  state: OverworldEventResolutionApplicationState,
  plan: OverworldPlannedEventResolution,
): OverworldAppliedEventResolution {
  state.resolvedEventIds.add(plan.event.id);
  state.resolvedEventHomeIds.add(plan.event.home);
  state.regionRenown.set(plan.region, (state.regionRenown.get(plan.region) ?? 0) + plan.renown);
  return {
    eventId: plan.event.id,
    eventHome: plan.event.home,
    renownRegion: plan.region,
    renownGained: plan.renown,
    renownAfter: state.regionRenown.get(plan.region) ?? 0,
  };
}

export function assertSnapshotEventResolutionProofs(
  resolvedEventIds: ReadonlySet<string>,
  sources: OverworldResolutionProofIndex,
  journal: OverworldEventResolutionJournalIndex,
): void {
  for (const eventId of resolvedEventIds) {
    const event = sources.eventsById.get(eventId);
    if (!event) continue;
    const resolvedAt = journal.recordedAtById.get(`resolve:${eventId}`);
    if (resolvedAt === undefined) continue;

    const scoutAt = journal.scoutTimeByArea.get(event.area);
    if (scoutAt === undefined || scoutAt > resolvedAt) {
      throw new Error(
        `Overworld session snapshot resolved event "${eventId}" is missing a local scout prerequisite.`,
      );
    }

    const contactAt = journal.contactTimeByArea.get(event.area);
    if (contactAt === undefined || contactAt > resolvedAt) {
      throw new Error(
        `Overworld session snapshot resolved event "${eventId}" is missing a local contact prerequisite.`,
      );
    }

    const investigationAt = journal.recordedAtById.get(`investigate:${eventId}`);
    if (investigationAt === undefined || investigationAt > resolvedAt) {
      throw new Error(
        `Overworld session snapshot resolved event "${eventId}" is missing an investigated event prerequisite.`,
      );
    }
  }
}

export type RegionalArcResolutionProof = {
  completionProofAt: number;
  resolvedCount: number;
};

export function regionalArcResolutionProof(
  arc: OverworldRegionalArc,
  resolutionTimesByTown: ReadonlyMap<string, number>,
): RegionalArcResolutionProof {
  const required = arc.required_resolutions;
  const requiredResolutionTimes: number[] = [];
  let resolvedCount = 0;

  for (const townId of arc.anchor_towns) {
    const resolvedAt = resolutionTimesByTown.get(townId);
    if (resolvedAt === undefined) continue;

    resolvedCount += 1;
    if (required <= 0) continue;

    let insertAt = requiredResolutionTimes.length;
    while (insertAt > 0 && requiredResolutionTimes[insertAt - 1]! > resolvedAt) {
      insertAt -= 1;
    }
    if (insertAt >= required) continue;

    requiredResolutionTimes.splice(insertAt, 0, resolvedAt);
    if (requiredResolutionTimes.length > required) requiredResolutionTimes.pop();
  }

  return {
    completionProofAt:
      required > 0 && requiredResolutionTimes.length >= required
        ? requiredResolutionTimes[required - 1]!
        : STARTING_MINUTES,
    resolvedCount,
  };
}

export function assertSnapshotRegionalArcCompletionProofs(
  sources: OverworldRegionalArcCompletionIndex,
  journal: OverworldEventResolutionJournalIndex,
  completedRegionalArcIds: ReadonlySet<string>,
): void {
  for (const arc of sources.regionalArcs) {
    const resolutionProof = regionalArcResolutionProof(arc, journal.resolutionTimeByTown);
    const hasRequiredResolutions = resolutionProof.resolvedCount >= arc.required_resolutions;
    const completed = completedRegionalArcIds.has(arc.id);

    if (completed && !hasRequiredResolutions) {
      throw new Error(
        `Overworld session snapshot completed regional arc "${arc.id}" lacks required resolved anchor towns.`,
      );
    }
    if (!completed && hasRequiredResolutions) {
      throw new Error(
        `Overworld session snapshot is missing completed regional arc "${arc.id}" earned by resolved anchor towns.`,
      );
    }
    if (!completed) continue;

    const arcRecordedAt = journal.recordedAtById.get(`arc:${arc.id}`);
    if (arcRecordedAt === undefined) continue;
    const completionProofAt = resolutionProof.completionProofAt;
    if (arcRecordedAt < completionProofAt) {
      throw new Error(
        `Overworld session snapshot completed regional arc "${arc.id}" was recorded before enough anchor resolutions.`,
      );
    }
  }
}
