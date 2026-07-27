export {
  OverworldSession,
  type OverworldAreaTravelResult,
  type OverworldActionResult,
  type OverworldJournalEntry,
  type OverworldPendingRoadEncounter,
  type OverworldRoadEncounterOption,
  type OverworldRoadEncounterResult,
  type OverworldRoadEncounterStrategy,
  type OverworldRouteEstimate,
  type OverworldSessionSnapshot,
  type OverworldSessionRoutePlan,
  type OverworldServiceResult,
  type OverworldView,
  type TravelLogEntry,
} from "../../src/world/session.js";
export type { CampaignCharacterView } from "../../src/world/campaign_character_view.js";

/** The UI must only disclose authored event terms once the engine marks one legal. */
export function hasLiveOverworldEventChoice(
  eventId: string,
  choices: readonly (readonly [eventId: string, optionId: string])[],
): boolean {
  return choices.some(([choiceEventId]) => choiceEventId === eventId);
}
