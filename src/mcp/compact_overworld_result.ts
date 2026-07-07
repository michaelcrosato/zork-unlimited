import type {
  OverworldActionResult,
  OverworldAreaTravelResult,
  OverworldQuestCompletionResult,
  OverworldRoadEncounterResult,
  OverworldRoadEncounterStrategy,
  OverworldServiceResult,
} from "../world/session.js";
import {
  compactOverworldJournalEntries,
  compactOverworldLabel,
  compactOverworldQuestRef,
  compactOverworldQuestRefs,
  compactOverworldRefs,
  compactOverworldTitle,
  compactOverworldTitleRefs,
  compactPendingRoad,
  type OverworldCompactJournalEntry,
  type OverworldCompactQuestRef,
  type OverworldCompactRef,
  type OverworldCompactRoadEncounter,
} from "../world/compact_view.js";

export type OverworldCompactDiscoveryKey = "areas" | "jobs" | "sites" | "quests";

export type OverworldCompactActionResult = {
  m: number;
  known?: true;
  entry: OverworldCompactJournalEntry;
  areas?: OverworldCompactRef[];
  jobs?: OverworldCompactRef[];
  sites?: OverworldCompactRef[];
  quests?: OverworldCompactQuestRef[];
  discovered_truncated?: OverworldCompactDiscoveryKey[];
};

export type OverworldCompactQuestCompletionResult = {
  m: number;
  known?: true;
  quest: OverworldCompactQuestRef;
  ending: readonly [id: string, title: string];
  renown: readonly [region: string, gained: number, after: number];
  entry: OverworldCompactJournalEntry;
};

export type OverworldCompactServiceResult = {
  action: OverworldServiceResult["action"];
  m: number;
  changed: boolean;
  supplies: readonly [before: number, after: number];
  fatigue: readonly [before: number, after: number];
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
};

export type OverworldCompactAreaTravelResult = {
  from: OverworldCompactRef;
  to: OverworldCompactRef;
  route: string;
  m: number;
  at: string;
};

function compactOverworldJournalEntry(entry: {
  kind: string;
  title: string;
  recordedAt: string;
}): OverworldCompactJournalEntry {
  return compactOverworldJournalEntries([entry])[0]!;
}

export function compactOverworldActionResult(
  result: OverworldActionResult,
): OverworldCompactActionResult {
  const compact: OverworldCompactActionResult = {
    m: result.minutes,
    entry: compactOverworldJournalEntry(result.entry),
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
