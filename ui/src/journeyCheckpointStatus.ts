import type { JourneyPresentation } from "../../src/world/journey_contract.js";

type JourneyCheckpointStatus = Pick<
  JourneyPresentation,
  "status" | "acceptedDecisions" | "nextCheckpoint"
>;

/** Human-facing checkpoint timing without promising a mid-scene interruption. */
export function journeyNextPauseText(journey: JourneyCheckpointStatus): string {
  if (journey.status === "awaiting_choice") return "Journey choice ready now";
  if (journey.status === "ended") return "No further journey pause";
  const checkpoint = journey.nextCheckpoint;
  if (checkpoint === null) return "No further journey pause";
  if (journey.acceptedDecisions < checkpoint) {
    return `First safe break on or after decision ${String(checkpoint)}`;
  }
  return `Decision ${String(checkpoint)} passed. Choice at next safe break.`;
}
