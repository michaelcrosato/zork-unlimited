import {
  cloneOverworldArea,
  cloneOverworldExplorationSite,
  cloneOverworldLocalJob,
  redactOverworldRoadEncounterOptionForPresentation,
  redactOverworldRoadEventForPresentation,
} from "./overworld_clone.js";
import type { OverworldActionResult } from "./session_action_application.js";
import type { OverworldQuestView } from "./session_local_discovery.js";
import type { OverworldAreaTravelResult } from "./session_local_actions.js";
import type { OverworldQuestCompletionResult } from "./session_quests.js";
import type { OverworldRoadEncounterResult } from "./session_road_encounters.js";
import type { OverworldServiceResult } from "./session_services.js";
import type { OverworldGoalPassageResult } from "./session_goal_passage.js";
import type { OverworldPendingRoadEncounter, TravelLogEntry } from "./session_snapshot.js";
import { cloneOverworldJournalEntry } from "./session_snapshot.js";

export function cloneOverworldQuestView(quest: OverworldQuestView): OverworldQuestView {
  return { ...quest };
}

export function cloneOverworldPendingRoadEncounter(
  encounter: OverworldPendingRoadEncounter,
): OverworldPendingRoadEncounter {
  return {
    ...encounter,
    event: redactOverworldRoadEventForPresentation(encounter.event),
    options: encounter.options.map((option) =>
      redactOverworldRoadEncounterOptionForPresentation(option),
    ),
  };
}

export function cloneOverworldTravelLogEntry(entry: TravelLogEntry): TravelLogEntry {
  return {
    ...entry,
    roadEvent: entry.roadEvent ? redactOverworldRoadEventForPresentation(entry.roadEvent) : null,
  };
}

export function cloneOverworldGoalPassageResult(
  result: OverworldGoalPassageResult,
): OverworldGoalPassageResult {
  return {
    ...result,
    legs: result.legs.map(cloneOverworldTravelLogEntry),
  };
}

export function cloneOverworldAreaTravelResult(
  result: OverworldAreaTravelResult,
): OverworldAreaTravelResult {
  return {
    ...result,
    from: cloneOverworldArea(result.from),
    to: cloneOverworldArea(result.to),
  };
}

export function cloneOverworldActionResult(result: OverworldActionResult): OverworldActionResult {
  return {
    ...result,
    entry: cloneOverworldJournalEntry(result.entry),
    ...(result.discoveredAreas
      ? { discoveredAreas: result.discoveredAreas.map(cloneOverworldArea) }
      : {}),
    ...(result.discoveredJobs
      ? { discoveredJobs: result.discoveredJobs.map(cloneOverworldLocalJob) }
      : {}),
    ...(result.discoveredSites
      ? { discoveredSites: result.discoveredSites.map(cloneOverworldExplorationSite) }
      : {}),
    ...(result.discoveredQuests
      ? { discoveredQuests: result.discoveredQuests.map(cloneOverworldQuestView) }
      : {}),
  };
}

export function cloneOverworldServiceResult(
  result: OverworldServiceResult,
): OverworldServiceResult {
  return {
    ...result,
    entry: result.entry ? cloneOverworldJournalEntry(result.entry) : null,
  };
}

export function cloneOverworldRoadEncounterResult(
  result: OverworldRoadEncounterResult,
): OverworldRoadEncounterResult {
  return {
    ...result,
    encounter: cloneOverworldPendingRoadEncounter(result.encounter),
    entry: cloneOverworldJournalEntry(result.entry),
  };
}

export function cloneOverworldQuestCompletionResult(
  result: OverworldQuestCompletionResult,
): OverworldQuestCompletionResult {
  return {
    ...result,
    quest: cloneOverworldQuestView(result.quest),
    entry: cloneOverworldJournalEntry(result.entry),
  };
}
