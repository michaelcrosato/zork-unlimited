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
import type {
  JourneyOpportunityExplanation,
  JourneyOpportunityNextAction,
} from "../world/journey_opportunity_explainer.js";
import type { JourneyChoiceResult } from "../world/journey_contract.js";
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

export type OverworldCompactJourneyChoiceResult = Omit<JourneyChoiceResult, "journey">;

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
  /** When present, lead with this player-language projection; consequence stays exact. */
  displaySummary?: string;
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
  supplies_used: number;
  fatigue_gained: number;
  renown_gained: number;
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

export type OverworldCompactOpportunityExplanation = {
  lead: readonly [
    kind: JourneyOpportunityExplanation["lead"]["kind"],
    id: string,
    title: string,
    area: string,
    access: JourneyOpportunityExplanation["lead"]["access"],
  ];
  next_action: readonly [
    tool: JourneyOpportunityNextAction["tool"],
    arguments: JourneyOpportunityNextAction["arguments"],
    command: string,
    label: string,
  ];
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

/**
 * Exact paths and positional schemas used only by immediate compact results.
 * Dotted keys name nested response paths, so blind clients can apply each
 * definition directly instead of inferring aliases from rolling context.
 */
export const OVERWORLD_COMPACT_RESULT_LEGEND = {
  route:
    "one route preview: [destination_town_id, estimated_minutes, supplies_needed, arrival_fatigue_0to100, [road_id, ...]]",
  travel:
    "one completed road step: [road_id, from_town_id, to_town_id, minutes, supplies_used, fatigue_gained, road_event_id|null, road_event_risk|null, road_event_title|null, road_event_summary|null]",
  "passage.minutes": "[base_minutes, delay_minutes, total_minutes]",
  "passage.supplies": "[supplies_used, supplies_after]",
  "passage.fatigue": "[fatigue_gained, fatigue_after]",
  "passage.legs":
    "completed road steps: [[road_id, from_town_id, to_town_id, minutes, supplies_used, fatigue_gained, road_event_id|null, road_event_risk|null, road_event_title|null, road_event_summary|null], ...]",
  "result.entry": "journal entry: [kind, title, 'Day N, HH:MM']",
  "result.areas": "areas found by this action: [[area_id, name], ...]",
  "result.jobs": "jobs found by this action: [[job_id, title], ...]",
  "result.sites": "sites found by this action: [[site_id, title], ...]",
  "result.quests":
    "quests found by this action: [[quest_id, title, anchor_area_id, [launch_id, prompt, [[approach_id, title, minutes, supplies_cost, fatigue_gained, available|null, minutes_after|null, supplies_after|null, fatigue_after|null, condition_after|null, blocked_reason|null, preview|null, consequence|null, strategic_comparison|null]], selected_approach_id|null]?], ...]",
  "result.supplies": "service supplies: [before, after]",
  "result.fatigue": "service fatigue: [before, after]",
  "result.encounter":
    "road encounter to resolve: {id, edge: road_id, route: route_name, where: [from_town, to_town, at_time], event: [road_event_id, risk_text, title, summary], options: [[strategy, label, minutes, supplies_cost, fatigue_gained, renown_gained], ...], next_action: {tool, argument, values_from}}",
  quest:
    "started quest: [quest_id, title, anchor_area_id, [launch_id, prompt, [[approach_id, title, minutes, supplies_cost, fatigue_gained, available|null, minutes_after|null, supplies_after|null, fatigue_after|null, condition_after|null, blocked_reason|null, preview|null, consequence|null, strategic_comparison|null]], selected_approach_id|null]?]",
  "result.quest": "completed quest: [quest_id, title, anchor_area_id]",
  "result.ending": "quest ending: [ending_id, ending_title]",
  "result.renown": "renown result: [region_name, gained, total_after]",
  "result.from": "area left: [area_id, area_name]",
  "result.to": "area reached: [area_id, area_name]",
  // `route` (bare) is plan_overworld_session_route's five-tuple; `result.route` is a
  // plain road name on an area-travel result. Two different shapes, so the dotted path
  // has to be defined separately — an agent merging "by exact field" would otherwise
  // decode a label string against the tuple definition.
  "result.route": "route taken, by name",
  "result.m": "in-game minutes this action spent",
  "result.at": "arrival clock: 'Day N, HH:MM'",
  "result.known": "true when this was already discovered, so nothing new was recorded",
  "explanation.lead": "[kind, lead_id, title, area_name, access]",
  "explanation.next_action": "[tool, arguments, command, label]",
} as const;

export type OverworldCompactResultLegendKey = keyof typeof OVERWORLD_COMPACT_RESULT_LEGEND;

export const OVERWORLD_COMPACT_RESULT_LEGEND_KEYS = {
  route: ["route"],
  travel: ["travel"],
  goal_passage: ["passage.minutes", "passage.supplies", "passage.fatigue", "passage.legs"],
  road_encounter: ["result.entry", "result.encounter", "result.m"],
  journey_story_choice: ["result.entry"],
  quest_start: ["quest"],
  opportunity_explanation: ["explanation.lead", "explanation.next_action"],
  area_travel: ["result.from", "result.to", "result.route", "result.m", "result.at"],
} as const satisfies Record<string, readonly OverworldCompactResultLegendKey[]>;

/**
 * Result fields whose own name IS the definition — plain English, no positional
 * schema and no abbreviation to decode. Enumerating them is what makes the
 * coverage check below fail closed: a NEW result field is either listed here as a
 * deliberate "needs no definition" call, or it needs a legend entry, and there is
 * no third option that compiles.
 *
 * `m`, `at`, `known` and `route` are deliberately NOT here. `m` in particular
 * shipped on action, service, road-encounter, quest-completion and area-travel
 * results with no entry anywhere in either legend, leaving a blind agent to infer
 * elapsed in-game time from an unlabelled integer.
 */
type SelfDescribingCompactResultField =
  | "action"
  | "changed"
  | "choiceId"
  | "consequence"
  | "destination"
  | "discovered_truncated"
  | "displaySummary"
  | "entry_text"
  | "exitReceipt"
  | "fatigue_gained"
  | "goal"
  | "goal_id"
  | "journeyDecision"
  | "legs_truncated"
  | "renown_gained"
  | "retentionEvent"
  | "stop_reason"
  | "stopped_at"
  | "storyChoiceId"
  | "strategy"
  | "supplies_used"
  | "text"
  | "travel_condition";

/** Every emitted path that still lacks an exact-path definition. */
type UndefinedCompactResultPath<Value, Prefix extends string> = Exclude<
  `${Prefix}.${Exclude<keyof Value & string, SelfDescribingCompactResultField>}`,
  OverworldCompactResultLegendKey
>;

/**
 * Fail-closed coverage for the RESULT legend, matching what
 * `OVERWORLD_COMPACT_LEGEND satisfies Record<keyof OverworldCompactView, string>`
 * already does for the context legend. Result keys had neither that tie nor the
 * runtime throw, so `m` (and area travel's colliding `route`) shipped undefined for
 * as long as they have existed. A missing path fails to compile here and the error
 * text names the exact path.
 */
type AssertEveryCompactResultPathDefined<Missing extends never> = Missing;

type _CompactResultLegendCoverage = [
  AssertEveryCompactResultPathDefined<
    UndefinedCompactResultPath<OverworldCompactJourneyChoiceResult, "result">
  >,
  AssertEveryCompactResultPathDefined<
    UndefinedCompactResultPath<OverworldCompactActionResult, "result">
  >,
  AssertEveryCompactResultPathDefined<
    UndefinedCompactResultPath<OverworldCompactJourneyStoryChoiceResult, "result">
  >,
  AssertEveryCompactResultPathDefined<
    UndefinedCompactResultPath<OverworldCompactQuestCompletionResult, "result">
  >,
  AssertEveryCompactResultPathDefined<
    UndefinedCompactResultPath<OverworldCompactServiceResult, "result">
  >,
  AssertEveryCompactResultPathDefined<
    UndefinedCompactResultPath<OverworldCompactRoadEncounterResult, "result">
  >,
  AssertEveryCompactResultPathDefined<
    UndefinedCompactResultPath<OverworldCompactAreaTravelResult, "result">
  >,
  AssertEveryCompactResultPathDefined<
    UndefinedCompactResultPath<OverworldCompactGoalPassageResult, "passage">
  >,
  AssertEveryCompactResultPathDefined<
    UndefinedCompactResultPath<OverworldCompactOpportunityExplanation, "explanation">
  >,
];

export function compactOverworldActionResultLegendKeys(
  result: OverworldCompactActionResult,
): OverworldCompactResultLegendKey[] {
  return [
    "result.entry",
    "result.m",
    ...(result.known ? (["result.known"] as const) : []),
    ...(result.areas ? (["result.areas"] as const) : []),
    ...(result.jobs ? (["result.jobs"] as const) : []),
    ...(result.sites ? (["result.sites"] as const) : []),
    ...(result.quests ? (["result.quests"] as const) : []),
  ];
}

export function compactOverworldServiceResultLegendKeys(
  result: OverworldCompactServiceResult,
): OverworldCompactResultLegendKey[] {
  return [
    "result.supplies",
    "result.fatigue",
    "result.m",
    ...(result.entry ? (["result.entry"] as const) : []),
  ];
}

/** Quest completion only carries `known` when the foldback was already recorded. */
export function compactOverworldQuestCompletionResultLegendKeys(
  result: OverworldCompactQuestCompletionResult,
): OverworldCompactResultLegendKey[] {
  return [
    "result.entry",
    "result.quest",
    "result.ending",
    "result.renown",
    "result.m",
    ...(result.known ? (["result.known"] as const) : []),
  ];
}

function compactOverworldJournalEntry(entry: {
  kind: string;
  title: string;
  recordedAt: string;
}): OverworldCompactJournalEntry {
  return compactOverworldJournalEntries([entry])[0]!;
}

/** The response envelope already carries the current journey. Keep the choice's
 * event and exact exit receipt here without repeating its full presentation. */
export function compactOverworldJourneyChoiceResult(
  result: JourneyChoiceResult,
): OverworldCompactJourneyChoiceResult {
  return {
    retentionEvent: result.retentionEvent,
    exitReceipt: result.exitReceipt,
  };
}

/**
 * Keep the selected consequence as the authoritative exact receipt. An optional
 * displaySummary leads with player-language context while preserving that receipt
 * separately and byte-for-byte. Reduce the presented journal record to the same
 * tuple used by rolling compact context.
 * Roleplay-first opening selections already project that receipt into the returned
 * entry while retaining fuller prose in persistent journal state. Other campaign
 * choices may return distinct journal prose; preserve that explicitly.
 */
export function compactOverworldJourneyStoryChoiceResult(
  result: OverworldJourneyStoryChoiceResult,
): OverworldCompactJourneyStoryChoiceResult {
  return {
    storyChoiceId: result.storyChoiceId,
    choiceId: result.choiceId,
    ...(result.displaySummary ? { displaySummary: result.displaySummary } : {}),
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
    supplies_used: result.suppliesUsed,
    fatigue_gained: result.fatigueGained,
    renown_gained: result.renownGained,
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

export function compactOverworldOpportunityExplanation(
  explanation: JourneyOpportunityExplanation,
): OverworldCompactOpportunityExplanation {
  return {
    lead: [
      explanation.lead.kind,
      explanation.lead.id,
      compactOverworldTitle(explanation.lead.title),
      compactOverworldLabel(explanation.lead.area),
      explanation.lead.access,
    ],
    next_action: [
      explanation.nextAction.tool,
      { ...explanation.nextAction.arguments },
      explanation.nextAction.command,
      compactOverworldLabel(explanation.nextAction.label),
    ],
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
