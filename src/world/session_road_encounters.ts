import type { OverworldEdge, OverworldNode, OverworldRoadEvent } from "./overworld.js";
import { timeLabel } from "./session_journal_codec.js";
import type { OverworldJournalEntry, OverworldPendingRoadEncounter } from "./session_snapshot.js";
import {
  OVERWORLD_MAX_FATIGUE as MAX_FATIGUE,
  roadEncounterOptionsFor,
  type OverworldRoadEncounterStrategy,
} from "./travel_mechanics.js";

export type OverworldRoadEncounterResult = {
  strategy: OverworldRoadEncounterStrategy;
  minutes: number;
  suppliesUsed: number;
  fatigueGained: number;
  renownGained: number;
  encounter: OverworldPendingRoadEncounter;
  entry: OverworldJournalEntry;
};

export type OverworldRoadEncounterResourceState = {
  supplies: number;
  fatigue: number;
  minutes: number;
  townName: string;
};

export type OverworldRoadEncounterResolution = {
  result: OverworldRoadEncounterResult;
  suppliesAfter: number;
  fatigueAfter: number;
  minutesAfter: number;
};

export function buildOverworldPendingRoadEncounter(
  from: OverworldNode,
  to: OverworldNode,
  edge: OverworldEdge,
  roadEvent: OverworldRoadEvent,
  arrivedAtMinutes: number,
): OverworldPendingRoadEncounter {
  return {
    id: `road:${edge.id}:${arrivedAtMinutes}`,
    edgeId: edge.id,
    from: from.name,
    to: to.name,
    route: edge.route,
    arrivedAt: timeLabel(arrivedAtMinutes),
    event: roadEvent,
    options: roadEncounterOptionsFor(roadEvent),
  };
}

export function resolveOverworldRoadEncounter(
  encounter: OverworldPendingRoadEncounter,
  strategy: OverworldRoadEncounterStrategy,
  state: OverworldRoadEncounterResourceState,
): OverworldRoadEncounterResolution {
  const option = encounter.options.find((candidate) => candidate.strategy === strategy);
  if (!option) throw new Error(`Unknown road encounter strategy "${strategy}".`);

  const suppliesUsed = Math.min(state.supplies, option.suppliesCost);
  const supplyDeficit = option.suppliesCost - suppliesUsed;
  const fatigueGained = option.fatigueGained + supplyDeficit * 3;
  const suppliesAfter = state.supplies - suppliesUsed;
  const fatigueAfter = Math.min(MAX_FATIGUE, state.fatigue + fatigueGained);
  const minutesAfter = state.minutes + option.minutes;
  const entry: OverworldJournalEntry = {
    id: `${encounter.id}:${strategy}`,
    kind: "road",
    town: state.townName,
    title: `${option.label}: ${encounter.event.title}`,
    text: `${encounter.event.summary} ${option.outcome}${supplyDeficit > 0 ? " Lacking supplies made the work more exhausting." : ""}`,
    recordedAt: timeLabel(minutesAfter),
  };

  return {
    result: {
      strategy,
      minutes: option.minutes,
      suppliesUsed,
      fatigueGained,
      renownGained: option.renownGained,
      encounter,
      entry,
    },
    suppliesAfter,
    fatigueAfter,
    minutesAfter,
  };
}
