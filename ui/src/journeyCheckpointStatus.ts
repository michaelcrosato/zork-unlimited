import type { JourneyPresentation } from "../../src/world/journey_contract.js";

type JourneyCheckpointStatus = Pick<
  JourneyPresentation,
  "status" | "acceptedDecisions" | "nextCheckpoint"
>;

/** Human-facing checkpoint timing without promising a mid-scene interruption. */
export function journeyNextPauseText(journey: JourneyCheckpointStatus): string {
  if (journey.status === "awaiting_choice") return "A journey choice is ready now.";
  if (journey.status === "ended") return "No further journey pause";
  const checkpoint = journey.nextCheckpoint;
  if (checkpoint === null) return "No further journey pause";
  if (journey.acceptedDecisions < checkpoint) {
    return `First safe journey break on or after decision ${String(checkpoint)}.`;
  }
  return `Decision ${String(checkpoint)} has passed; the choice appears at the next safe journey break.`;
}
