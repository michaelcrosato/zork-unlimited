import type { JourneyPresentation } from "../../src/world/journey_contract.js";

type JourneyCheckpointStatus = Pick<
  JourneyPresentation,
  "status" | "acceptedDecisions" | "nextCheckpoint"
>;

/** Human-facing checkpoint timing without promising a mid-scene interruption. */
export function journeyNextPauseText(journey: JourneyCheckpointStatus): string {
  if (journey.status === "awaiting_choice") return "A choice is ready now.";
  if (journey.status === "ended") return "No further checkpoint";
  const checkpoint = journey.nextCheckpoint;
  if (checkpoint === null) return "No further checkpoint";
  if (journey.acceptedDecisions < checkpoint) {
    return `Checkpoint threshold ${String(checkpoint)}; choice appears at the first safe break at or after it.`;
  }
  return `Checkpoint ${String(checkpoint)} is due; choice appears at the first safe break.`;
}
