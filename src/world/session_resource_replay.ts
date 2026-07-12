import type { OverworldEdge, OverworldRoadEvent } from "./overworld.js";
import {
  parseRoadJournalId,
  parseServiceJournalId,
  roadResolutionKey,
  type RoadJournalIdParts,
  type ServiceJournalIdParts,
} from "./session_journal_codec.js";
import type {
  OverworldJournalEntry,
  OverworldPendingRoadEncounterSnapshot,
  OverworldSessionSnapshot,
  TravelLogEntrySnapshot,
} from "./session_snapshot.js";
import { roadEventForTravelLogSnapshot } from "./session_travel_log.js";
import {
  travelResourceKey,
  type OverworldTravelTimelineIndex,
} from "./session_snapshot_timeline.js";
import {
  OVERWORLD_MAX_FATIGUE as MAX_FATIGUE,
  OVERWORLD_MAX_SUPPLIES as MAX_SUPPLIES,
  OVERWORLD_STARTING_MINUTES as STARTING_MINUTES,
  OVERWORLD_STARTING_SUPPLIES as STARTING_SUPPLIES,
  roadEncounterOptionFor,
  travelDelayMinutes,
  travelFatigueGain,
  travelSupplyCost,
} from "./travel_mechanics.js";

export type OverworldResourceReplaySourceIndex = {
  edgesById: ReadonlyMap<string, OverworldEdge>;
  roadEventsByEdgeId: ReadonlyMap<string, OverworldRoadEvent>;
};

export type OverworldRoadJournalResolutionEntry = {
  entry: OverworldJournalEntry;
  key: string;
  parsed: RoadJournalIdParts;
  recordedAt: number;
};

export type OverworldRoadJournalResolutionIndex = {
  byKey: ReadonlyMap<string, OverworldRoadJournalResolutionEntry>;
  entries: readonly OverworldRoadJournalResolutionEntry[];
  requiredKeys: ReadonlySet<string>;
};

export type OverworldServiceJournalReplayEntry = {
  entry: OverworldJournalEntry;
  parsed: ServiceJournalIdParts;
  recordedAt: number;
};

export type OverworldServiceJournalReplayIndex = {
  entries: readonly OverworldServiceJournalReplayEntry[];
};

export type OverworldResourceReplayJournalTimeline = {
  roadJournalEntries: readonly OverworldRoadJournalResolutionEntry[];
};

export type OverworldResourceReplayLocalActionIndex = {
  entries: readonly {
    entry: OverworldJournalEntry;
    recordedAt: number;
    duration: number | null;
  }[];
};

type OverworldReplayState = {
  minimumClock: number;
  supplies: number;
  fatigue: number;
};

type OverworldResourceReplayEvent =
  | { kind: "travel"; recordedAt: number; entry: TravelLogEntrySnapshot }
  | { kind: "road"; recordedAt: number; resolution: OverworldRoadJournalResolutionEntry }
  | { kind: "service"; recordedAt: number; service: OverworldServiceJournalReplayEntry }
  | {
      kind: "local";
      recordedAt: number;
      duration: number;
      entry: OverworldJournalEntry;
    };

export function recordServiceJournalReplay(
  entries: OverworldServiceJournalReplayEntry[],
  entry: OverworldJournalEntry,
  recordedAt: number,
): void {
  if (entry.kind !== "service") return;
  entries.push({
    entry,
    parsed: parseServiceJournalId(entry.id),
    recordedAt,
  });
}

export function recordRoadJournalResolution(
  entries: OverworldRoadJournalResolutionEntry[],
  entry: OverworldJournalEntry,
  recordedAt: number,
): void {
  if (entry.kind !== "road") return;
  const parsed = parseRoadJournalId(entry.id);
  entries.push({
    entry,
    key: roadResolutionKey(parsed),
    parsed,
    recordedAt,
  });
}

function assertReplayClock(
  sourceLabel: string,
  recordedAt: number,
  duration: number,
  state: OverworldReplayState,
): void {
  const earliestCompletion = state.minimumClock + duration;
  if (recordedAt < earliestCompletion) {
    throw new Error(
      `Overworld session snapshot ${sourceLabel} was recorded before enough clock time elapsed.`,
    );
  }
  state.minimumClock = Math.max(state.minimumClock, recordedAt);
}

function assertTravelResourceTransition(
  entry: TravelLogEntrySnapshot,
  edge: OverworldEdge,
  roadEvent: OverworldRoadEvent | null,
  state: OverworldReplayState,
): void {
  const label = `${entry.edgeId}@${entry.arrivedAt}`;
  const supplyCost = travelSupplyCost(edge.travel_minutes);
  const expectedSuppliesUsed = Math.min(state.supplies, supplyCost);
  const supplyDeficit = supplyCost - expectedSuppliesUsed;
  const expectedDelayMinutes = travelDelayMinutes(
    edge.travel_minutes,
    state.fatigue,
    supplyDeficit,
  );
  const expectedMinutes = edge.travel_minutes + expectedDelayMinutes;
  const expectedSuppliesAfter = state.supplies - expectedSuppliesUsed;
  const expectedFatigueGained =
    travelFatigueGain(edge.travel_minutes, roadEvent) + supplyDeficit * 4;
  const expectedFatigueAfter = Math.min(MAX_FATIGUE, state.fatigue + expectedFatigueGained);

  if (entry.delayMinutes !== expectedDelayMinutes || entry.minutes !== expectedMinutes) {
    throw new Error(
      `Overworld session snapshot travel "${label}" does not match resource replay timing.`,
    );
  }
  if (entry.suppliesUsed !== expectedSuppliesUsed) {
    throw new Error(
      `Overworld session snapshot travel "${label}" supplies used does not match resource replay.`,
    );
  }
  if (entry.suppliesAfter !== expectedSuppliesAfter) {
    throw new Error(
      `Overworld session snapshot travel "${label}" supplies after does not match resource replay.`,
    );
  }
  if (entry.fatigueGained !== expectedFatigueGained) {
    throw new Error(
      `Overworld session snapshot travel "${label}" fatigue gained does not match resource replay.`,
    );
  }
  if (entry.fatigueAfter !== expectedFatigueAfter) {
    throw new Error(
      `Overworld session snapshot travel "${label}" fatigue after does not match resource replay.`,
    );
  }

  state.supplies = expectedSuppliesAfter;
  state.fatigue = expectedFatigueAfter;
}

export function roadJournalResolutionIndex(
  sources: OverworldResourceReplaySourceIndex,
  journalTimeline: OverworldResourceReplayJournalTimeline,
  travelTimeline: OverworldTravelTimelineIndex,
  pendingRoadEncounter: OverworldPendingRoadEncounterSnapshot | null,
): OverworldRoadJournalResolutionIndex {
  const byKey = new Map<string, OverworldRoadJournalResolutionEntry>();
  const nextTravelArrivalByKey = new Map<string, number>();
  const pendingRoadKey =
    pendingRoadEncounter &&
    travelTimeline.latest &&
    travelTimeline.latest.edgeId === pendingRoadEncounter.edgeId
      ? travelResourceKey(travelTimeline.latest)
      : null;
  const requiredRoadResolutionKeys = new Set<string>();
  const seenChoiceEventIds = new Set<string>();
  for (let index = 0; index < travelTimeline.oldestFirst.length; index += 1) {
    const current = travelTimeline.oldestFirst[index]!;
    const key = travelResourceKey(current);
    const next = travelTimeline.oldestFirst[index + 1];
    if (next) nextTravelArrivalByKey.set(key, next.arrivedAt);
    const roadEvent = roadEventForTravelLogSnapshot(current, sources);
    if (roadEvent?.requires_choice === true) {
      if (seenChoiceEventIds.has(roadEvent.id)) {
        throw new Error(
          `Overworld session snapshot repeats one-shot road encounter "${roadEvent.id}".`,
        );
      }
      seenChoiceEventIds.add(roadEvent.id);
    }
    if (roadEvent?.requires_choice === true && key !== pendingRoadKey) {
      requiredRoadResolutionKeys.add(key);
    }
  }

  for (const resolution of journalTimeline.roadJournalEntries) {
    if (!sources.roadEventsByEdgeId.has(resolution.parsed.edgeId)) {
      throw new Error(
        `Overworld session snapshot road journal "${resolution.entry.id}" has no matching road event.`,
      );
    }
    const travel = travelTimeline.byArrival.get(resolution.key);
    const travelRoadEvent = travel ? roadEventForTravelLogSnapshot(travel, sources) : null;
    if (travelRoadEvent?.requires_choice !== true) {
      throw new Error(
        `Overworld session snapshot road journal "${resolution.entry.id}" is not bound to a choice encounter.`,
      );
    }
    if (byKey.has(resolution.key)) {
      throw new Error(
        `Overworld session snapshot road encounter "${resolution.key}" has duplicate journal resolutions.`,
      );
    }
    const nextTravelArrival = nextTravelArrivalByKey.get(resolution.key);
    if (nextTravelArrival !== undefined && resolution.recordedAt > nextTravelArrival) {
      throw new Error(
        `Overworld session snapshot road encounter "${resolution.key}" was resolved after subsequent travel.`,
      );
    }
    byKey.set(resolution.key, resolution);
  }

  return {
    byKey,
    entries: journalTimeline.roadJournalEntries,
    requiredKeys: requiredRoadResolutionKeys,
  };
}

function assertSnapshotRoadResolutionCoverage(
  roadJournal: OverworldRoadJournalResolutionIndex,
): void {
  for (const key of roadJournal.requiredKeys) {
    if (!roadJournal.byKey.has(key)) {
      throw new Error(
        `Overworld session snapshot road encounter "${key}" is missing a journal resolution.`,
      );
    }
  }
}

function replayEventOrder(kind: OverworldResourceReplayEvent["kind"]): number {
  return kind === "travel" ? 0 : kind === "road" ? 1 : 2;
}

export function assertSnapshotResourceReplay(
  snapshot: OverworldSessionSnapshot,
  sources: OverworldResourceReplaySourceIndex,
  travelTimeline: OverworldTravelTimelineIndex,
  roadJournal: OverworldRoadJournalResolutionIndex,
  serviceJournal: OverworldServiceJournalReplayIndex,
  localActionJournal: OverworldResourceReplayLocalActionIndex,
): void {
  assertSnapshotRoadResolutionCoverage(roadJournal);
  const replayEvents: OverworldResourceReplayEvent[] = [];
  for (const entry of travelTimeline.oldestFirst) {
    replayEvents.push({ kind: "travel", recordedAt: entry.arrivedAt, entry });
  }
  for (const resolution of roadJournal.entries) {
    replayEvents.push({ kind: "road", recordedAt: resolution.recordedAt, resolution });
  }
  for (const service of serviceJournal.entries) {
    replayEvents.push({ kind: "service", recordedAt: service.recordedAt, service });
  }
  for (const { entry, recordedAt, duration } of localActionJournal.entries) {
    if (duration !== null) {
      replayEvents.push({
        kind: "local",
        recordedAt,
        duration,
        entry,
      });
    }
  }
  replayEvents.sort(
    (left, right) =>
      left.recordedAt - right.recordedAt ||
      replayEventOrder(left.kind) - replayEventOrder(right.kind),
  );

  const state: OverworldReplayState = {
    minimumClock: STARTING_MINUTES,
    supplies: STARTING_SUPPLIES,
    fatigue: 0,
  };
  for (const event of replayEvents) {
    if (event.kind === "travel") {
      const edge = sources.edgesById.get(event.entry.edgeId);
      if (!edge) {
        throw new Error(
          `Overworld session snapshot has unknown travel road "${event.entry.edgeId}".`,
        );
      }
      const roadEvent = roadEventForTravelLogSnapshot(event.entry, sources);
      assertTravelResourceTransition(event.entry, edge, roadEvent, state);
      assertReplayClock(
        `travel "${travelResourceKey(event.entry)}"`,
        event.recordedAt,
        event.entry.minutes,
        state,
      );
      continue;
    }

    if (event.kind === "road") {
      const roadEvent = sources.roadEventsByEdgeId.get(event.resolution.parsed.edgeId);
      if (!roadEvent) continue;
      const option = roadEncounterOptionFor(roadEvent, event.resolution.parsed.strategy);
      assertReplayClock(
        `road journal "${event.resolution.entry.id}"`,
        event.recordedAt,
        option.minutes,
        state,
      );
      const suppliesUsed = Math.min(state.supplies, option.suppliesCost);
      const supplyDeficit = option.suppliesCost - suppliesUsed;
      state.supplies -= suppliesUsed;
      state.fatigue = Math.min(
        MAX_FATIGUE,
        state.fatigue + option.fatigueGained + supplyDeficit * 3,
      );
      continue;
    }

    if (event.kind === "local") {
      assertReplayClock(
        `journal ${event.entry.kind} entry "${event.entry.id}"`,
        event.recordedAt,
        event.duration,
        state,
      );
      continue;
    }

    if (event.service.parsed.action === "rest") {
      if (state.fatigue === 0) {
        throw new Error(
          `Overworld session snapshot service journal "${event.service.entry.id}" rests with no fatigue to recover.`,
        );
      }
      assertReplayClock(
        `service journal "${event.service.entry.id}"`,
        event.recordedAt,
        Math.max(180, Math.ceil(state.fatigue / 20) * 60),
        state,
      );
      state.fatigue = 0;
    } else {
      if (state.supplies >= MAX_SUPPLIES) {
        throw new Error(
          `Overworld session snapshot service journal "${event.service.entry.id}" resupplies with full supplies.`,
        );
      }
      assertReplayClock(`service journal "${event.service.entry.id}"`, event.recordedAt, 45, state);
      state.supplies = MAX_SUPPLIES;
    }
  }

  if (snapshot.minutes < state.minimumClock) {
    throw new Error("Overworld session snapshot minutes do not match clock replay.");
  }
  if (snapshot.supplies !== state.supplies) {
    throw new Error("Overworld session snapshot supplies do not match resource replay.");
  }
  if (snapshot.fatigue !== state.fatigue) {
    throw new Error("Overworld session snapshot fatigue does not match resource replay.");
  }
}
