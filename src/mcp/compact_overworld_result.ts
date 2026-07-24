import type {
  OverworldActionResult,
  OverworldAreaTravelResult,
  OverworldJourneyGoalPassageResult,
  OverworldJourneyStoryChoiceResult,
  OverworldQuestCompletionResult,
  OverworldRoadEncounterResult,
  OverworldRoadEncounterStrategy,
  OverworldServiceResult,
  TravelLogEntry,
} from "../world/session.js";
import { compactText } from "../core/compact_text.js";
import {
  compactOverworldJournalEntries,
  compactOverworldLabel,
  compactOverworldQuestRef,
  compactOverworldQuestRefs,
  compactOverworldRefs,
  compactOverworldRisk,
  compactOverworldTitle,
  compactOverworldTitleRefs,
  compactPendingRoad,
  OVERWORLD_COMPACT_ROUTE_STEP_LIMIT,
  OVERWORLD_COMPACT_ROAD_EVENT_SUMMARY_CHAR_LIMIT,
  type OverworldCompactJournalEntry,
  type OverworldCompactQuestRef,
  type OverworldCompactRef,
  type OverworldCompactRoadEncounter,
} from "../world/compact_view.js";

export type OverworldCompactDiscoveryKey = "areas" | "jobs" | "sites" | "quests";

// Immediate local-action prose is the player's consequence, not rolling context.
// Keep enough room for every shipped contact line while bounding longer area/site copy.
export const OVERWORLD_COMPACT_ACTION_TEXT_CHAR_LIMIT = 512;
// Service prose states the authored cause as well as the resource delta. Keep
// it on the immediate compact response because a one-time offer disappears
// after acceptance.
export const OVERWORLD_COMPACT_SERVICE_TEXT_CHAR_LIMIT = 512;
// Road outcomes include the scene, chosen response, and arrival consequence.
// Every shipped composition fits; future growth remains transparently bounded.
export const OVERWORLD_COMPACT_ROAD_ENCOUNTER_TEXT_CHAR_LIMIT = 600;
// Quest completion prose is the durable foldback receipt. It includes the
// chosen launch return plus profile-specific campaign closure, so the compact
// MCP response must expose it immediately instead of leaving only a title tuple.
export const OVERWORLD_COMPACT_QUEST_COMPLETION_TEXT_CHAR_LIMIT = 1_200;

export type OverworldCompactActionResult = {
  m: number;
  known?: true;
  entry: OverworldCompactJournalEntry;
  text: string;
  areas?: OverworldCompactRef[];
  jobs?: OverworldCompactRef[];
  sites?: OverworldCompactRef[];
  quests?: OverworldCompactQuestRef[];
  discovered_truncated?: OverworldCompactDiscoveryKey[];
};

export type OverworldCompactJourneyStoryChoiceResult = {
  storyChoiceId: string;
  choiceId: string;
  consequence: string;
  goal: OverworldJourneyStoryChoiceResult["goal"];
  entry: OverworldCompactJournalEntry;
  entry_text?: string;
  journeyDecision: OverworldJourneyStoryChoiceResult["journeyDecision"];
};

export type OverworldCompactQuestCompletionResult = {
  m: number;
  known?: true;
  quest: OverworldCompactQuestRef;
  ending: readonly [id: string, title: string];
  renown: readonly [region: string, gained: number, after: number];
  entry: OverworldCompactJournalEntry;
  text: string;
};

export type OverworldCompactServiceResult = {
  action: OverworldServiceResult["action"];
  m: number;
  changed: boolean;
  supplies: readonly [before: number, after: number];
  fatigue: readonly [before: number, after: number];
  text: string;
  entry?: OverworldCompactJournalEntry;
};

export type OverworldCompactRoadEncounterResult = {
  strategy: OverworldRoadEncounterStrategy;
  m: number;
  supplies: number;
  fatigue: number;
  renown: number;
  encounter: OverworldCompactRoadEncounter;
  entry: OverworldCompactJournalEntry;
  text: string;
};

export type OverworldCompactAreaTravelResult = {
  from: OverworldCompactRef;
  to: OverworldCompactRef;
  route: string;
  m: number;
  at: string;
};

/**
 * The accepted travel decision plus its immediate road scene. The first seven
 * positions intentionally match the rolling travel-log tuple; only this
 * immediate result carries the bounded risk/title/summary needed to experience
 * ambient and blocking scenes without another context read.
 */
export type OverworldCompactTravelResult = readonly [
  edgeId: string,
  fromId: string,
  toId: string,
  minutes: number,
  suppliesUsed: number,
  fatigueGained: number,
  roadEventId: string | null,
  roadEventRisk: string | null,
  roadEventTitle: string | null,
  roadEventSummary: string | null,
];

/**
 * One game-native commitment to the current goal passage. The aggregates stay
 * self-describing, while each traversed leg reuses the bounded immediate-travel
 * tuple. A capped response can omit only already-traversed history; it never
 * substitutes planned roads or future road scenes.
 */
export type OverworldCompactGoalPassageResult = {
  goal_id: string;
  destination: string;
  stopped_at: string;
  stop_reason: OverworldJourneyGoalPassageResult["stopReason"];
  minutes: readonly [base: number, delay: number, total: number];
  supplies: readonly [used: number, after: number];
  fatigue: readonly [gained: number, after: number];
  travel_condition: string;
  legs: OverworldCompactTravelResult[];
  legs_truncated?: true;
};

function compactOverworldJournalEntry(entry: {
  kind: string;
  title: string;
  recordedAt: string;
}): OverworldCompactJournalEntry {
  return compactOverworldJournalEntries([entry])[0]!;
}

/**
 * Keep the selected consequence as the one authoritative receipt while reducing
 * its journal record to the same tuple used by rolling compact context. Opening
 * setup entries deliberately repeat the consequence byte-for-byte, so their prose
 * appears once. Campaign follow-through can journal different prose; preserve that
 * distinct text explicitly rather than silently dropping it.
 */
export function compactOverworldJourneyStoryChoiceResult(
  result: OverworldJourneyStoryChoiceResult,
): OverworldCompactJourneyStoryChoiceResult {
  return {
    storyChoiceId: result.storyChoiceId,
    choiceId: result.choiceId,
    consequence: result.consequence,
    goal: result.goal,
    entry: compactOverworldJournalEntry(result.entry),
    ...(result.entry.text !== result.consequence ? { entry_text: result.entry.text } : {}),
    journeyDecision: result.journeyDecision,
  };
}

export function compactOverworldActionResult(
  result: OverworldActionResult,
): OverworldCompactActionResult {
  const compact: OverworldCompactActionResult = {
    m: result.minutes,
    entry: compactOverworldJournalEntry(result.entry),
    text: compactText(result.entry.text, OVERWORLD_COMPACT_ACTION_TEXT_CHAR_LIMIT),
  };
  if (result.alreadyKnown) compact.known = true;
  const areas = result.discoveredAreas ? compactOverworldRefs(result.discoveredAreas) : [];
  const jobs = result.discoveredJobs ? compactOverworldTitleRefs(result.discoveredJobs) : [];
  const sites = result.discoveredSites ? compactOverworldTitleRefs(result.discoveredSites) : [];
  const quests = result.discoveredQuests ? compactOverworldQuestRefs(result.discoveredQuests) : [];
  const discoveredTruncated: OverworldCompactDiscoveryKey[] = [];
  if ((result.discoveredAreas?.length ?? 0) > areas.length) discoveredTruncated.push("areas");
  if ((result.discoveredJobs?.length ?? 0) > jobs.length) discoveredTruncated.push("jobs");
  if ((result.discoveredSites?.length ?? 0) > sites.length) discoveredTruncated.push("sites");
  if ((result.discoveredQuests?.length ?? 0) > quests.length) discoveredTruncated.push("quests");
  if (areas.length > 0) compact.areas = areas;
  if (jobs.length > 0) compact.jobs = jobs;
  if (sites.length > 0) compact.sites = sites;
  if (quests.length > 0) compact.quests = quests;
  if (discoveredTruncated.length > 0) compact.discovered_truncated = discoveredTruncated;
  return compact;
}

export function compactOverworldServiceResult(
  result: OverworldServiceResult,
): OverworldCompactServiceResult {
  return {
    action: result.action,
    m: result.minutes,
    changed: result.changed,
    supplies: [result.suppliesBefore, result.suppliesAfter],
    fatigue: [result.fatigueBefore, result.fatigueAfter],
    text: compactText(result.message, OVERWORLD_COMPACT_SERVICE_TEXT_CHAR_LIMIT),
    ...(result.entry ? { entry: compactOverworldJournalEntry(result.entry) } : {}),
  };
}

export function compactOverworldRoadEncounterResult(
  result: OverworldRoadEncounterResult,
): OverworldCompactRoadEncounterResult {
  const encounter = compactPendingRoad(result.encounter);
  if (!encounter) throw new Error("Cannot compact missing overworld road encounter.");
  return {
    strategy: result.strategy,
    m: result.minutes,
    supplies: result.suppliesUsed,
    fatigue: result.fatigueGained,
    renown: result.renownGained,
    encounter,
    entry: compactOverworldJournalEntry(result.entry),
    text: compactText(result.entry.text, OVERWORLD_COMPACT_ROAD_ENCOUNTER_TEXT_CHAR_LIMIT),
  };
}

export function compactOverworldQuestCompletionResult(
  result: OverworldQuestCompletionResult,
): OverworldCompactQuestCompletionResult {
  return {
    m: result.minutes,
    ...(result.alreadyKnown ? { known: true as const } : {}),
    quest: compactOverworldQuestRef(result.quest),
    ending: [result.endingId, compactOverworldTitle(result.endingTitle)],
    renown: [result.renownRegion, result.renownGained, result.renownAfter],
    entry: compactOverworldJournalEntry(result.entry),
    text: compactText(result.entry.text, OVERWORLD_COMPACT_QUEST_COMPLETION_TEXT_CHAR_LIMIT),
  };
}

export function compactOverworldAreaTravelResult(
  result: OverworldAreaTravelResult,
): OverworldCompactAreaTravelResult {
  return {
    from: compactOverworldRefs([result.from])[0]!,
    to: compactOverworldRefs([result.to])[0]!,
    route: compactOverworldLabel(result.route),
    m: result.minutes,
    at: result.arrivedAt,
  };
}

export function compactOverworldTravelResult(result: TravelLogEntry): OverworldCompactTravelResult {
  const event = result.roadEvent;
  return [
    result.edgeId,
    result.fromId,
    result.toId,
    result.minutes,
    result.suppliesUsed,
    result.fatigueGained,
    event?.id ?? null,
    event ? compactOverworldRisk(event.risk) : null,
    event ? compactOverworldTitle(event.title) : null,
    event ? compactText(event.summary, OVERWORLD_COMPACT_ROAD_EVENT_SUMMARY_CHAR_LIMIT) : null,
  ];
}

export function compactOverworldGoalPassageResult(
  result: OverworldJourneyGoalPassageResult,
): OverworldCompactGoalPassageResult {
  // Keep the newest legs: the passage's end — the arrival, or the road scene the player
  // must now resolve — is the player-relevant part; only older traversed history drops.
  const legs = result.legs
    .slice(-OVERWORLD_COMPACT_ROUTE_STEP_LIMIT)
    .map(compactOverworldTravelResult);
  return {
    goal_id: result.goalId,
    destination: compactOverworldLabel(result.destination),
    stopped_at: compactOverworldLabel(result.stoppedAt),
    stop_reason: result.stopReason,
    minutes: [result.baseMinutes, result.delayMinutes, result.minutes],
    supplies: [result.suppliesUsed, result.suppliesAfter],
    fatigue: [result.fatigueGained, result.fatigueAfter],
    travel_condition: result.travelConditionAfter,
    legs,
    ...(result.legs.length > legs.length ? { legs_truncated: true as const } : {}),
  };
}
