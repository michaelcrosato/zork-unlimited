import type { OverworldSession } from "./overworld.js";

type GoalPassageResult = ReturnType<OverworldSession["followGoalPassage"]>;

function routeMontage(result: GoalPassageResult): string {
  const first = result.legs[0];
  if (!first) return `The goal road holds at ${result.stoppedAt}.`;

  const arrivals = result.legs.map((leg) => leg.to);
  const last = arrivals.at(-1)!;
  const between = arrivals.slice(0, -1);
  return between.length === 0
    ? `The goal road carries you from ${first.from} to ${last}.`
    : `The goal road carries you from ${first.from}, through ${between.join(", ")}, to ${last}.`;
}

function passageStopText(stopReason: GoalPassageResult["stopReason"]): string {
  switch (stopReason) {
    case "objective":
      return "You have reached the objective town.";
    case "road_encounter":
      return "A road incident stops the passage for your decision.";
    case "resource_boundary":
      return "You halt before another road would worsen your travel condition.";
  }
}

/**
 * Human-facing passage history derived only from the accepted result. Future
 * route nodes and manifest road-event data never enter this formatter.
 */
export function formatGoalPassageLog(result: GoalPassageResult): string {
  const roadCount = result.legs.length;
  const delay = result.delayMinutes > 0 ? `, +${result.delayMinutes} min delay` : "";
  return `${routeMontage(result)} ${roadCount} ${roadCount === 1 ? "road" : "roads"}, ${result.baseMinutes} road min${delay}. Supplies -${result.suppliesUsed} to ${result.suppliesAfter}; fatigue +${result.fatigueGained} to ${result.fatigueAfter} (${result.travelConditionAfter}). ${passageStopText(result.stopReason)}`;
}
