import type { JourneyGoalPassagePresentation } from "./journey_contract.js";
import type { OverworldSessionRoutePlan } from "./session_routes.js";
import type { TravelLogEntry } from "./session_snapshot.js";
import type { OverworldTravelLegResult } from "./travel_mechanics.js";

export type OverworldGoalPassageStopReason = "objective" | "road_encounter" | "resource_boundary";

export type OverworldGoalPassageResult = {
  goalId: string;
  destination: string;
  stoppedAt: string;
  stopReason: OverworldGoalPassageStopReason;
  legs: readonly TravelLogEntry[];
  baseMinutes: number;
  delayMinutes: number;
  minutes: number;
  suppliesUsed: number;
  suppliesAfter: number;
  fatigueGained: number;
  fatigueAfter: number;
  travelConditionAfter: string;
};

export function goalPassageJourneyActionId(goalId: string): string {
  if (goalId.length === 0) throw new Error("Goal passage requires a current goal id.");
  return `follow_current_goal:${goalId}`;
}

export function buildJourneyGoalPassagePresentation(
  route: OverworldSessionRoutePlan,
): JourneyGoalPassagePresentation {
  if (route.steps.length === 0) {
    throw new Error("A goal passage requires at least one road.");
  }
  const destination = route.destination.name;
  return {
    id: "follow_current_goal",
    label: `Follow the road to ${destination}`,
    destination,
    roadCount: route.steps.length,
    baseMinutes: route.estimate.baseMinutes,
    estimatedMinutes: route.estimate.elapsedMinutes,
    suppliesNeeded: route.estimate.suppliesNeeded,
    supplyDeficit: route.estimate.supplyDeficit,
    suppliesAfter: route.estimate.suppliesAfter,
    fatigueAfter: route.estimate.fatigueAfter,
    travelConditionAfter: route.estimate.travelConditionAfter,
    consequence: `Travel toward ${destination}, preserving every road's normal time, supplies, fatigue, discoveries, and encounters.`,
    stopRule:
      "The passage stops at the objective, at a road encounter, or before the next road would add a supply shortfall or a worse fatigue-delay tier; the first road always accepts your current condition.",
  };
}

/** The four starting-fatigue bands used by travelDelayMinutes. */
export function overworldTravelDelayTier(fatigue: number): 0 | 1 | 2 | 3 {
  if (fatigue >= 80) return 3;
  if (fatigue >= 50) return 2;
  if (fatigue >= 25) return 1;
  return 0;
}

/**
 * The first road is the condition the player explicitly accepts. Thereafter a
 * passage pauses before a road that would newly run short of supplies or would
 * begin in a worse fatigue-delay band than the selection began in. Starting
 * undersupplied explicitly accepts that existing condition.
 */
export function goalPassageHitsResourceBoundary(args: {
  traversedRoadCount: number;
  selectionDelayTier: 0 | 1 | 2 | 3;
  selectionSupplies: number;
  currentFatigue: number;
  preview: OverworldTravelLegResult;
}): boolean {
  if (args.traversedRoadCount === 0) return false;
  return (
    (args.selectionSupplies > 0 && args.preview.supplyDeficit > 0) ||
    overworldTravelDelayTier(args.currentFatigue) > args.selectionDelayTier
  );
}
