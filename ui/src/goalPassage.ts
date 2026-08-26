import type { OverworldSession } from "./overworld.js";

type GoalPassageResult = ReturnType<OverworldSession["followGoalPassage"]>;

function routeMontage(result: GoalPassageResult): string {
  const first = result.legs[0];
  if (!first) return `You remain at ${result.stoppedAt}.`;

  const arrivals = result.legs.map((leg) => leg.to);
  const last = arrivals.at(-1)!;
  const between = arrivals.slice(0, -1);
  return between.length === 0
    ? `You travel from ${first.from} to ${last}.`
    : `You travel from ${first.from}, through ${between.join(", ")}, to ${last}.`;
}

function passageStopText(stopReason: GoalPassageResult["stopReason"]): string {
  switch (stopReason) {
    case "objective":
      return "You have reached the objective town.";
    case "road_encounter":
      return "A road encounter stops you. Choose a response.";
    case "resource_boundary":
      return "You stop before another road would cause a supply shortage or worsen your condition.";
  }
}

/**
 * Human-facing passage history derived only from the accepted result. Future
 * route nodes and manifest road-event data never enter this formatter.
 */
export function formatGoalPassageLog(result: GoalPassageResult): string {
  const roadCount = result.legs.length;
  const delay = result.delayMinutes > 0 ? `, +${result.delayMinutes} min delay` : "";
  return `${routeMontage(result)} Roads: ${roadCount}. Time: ${result.baseMinutes} min${delay}. Supplies -${result.suppliesUsed}, ${result.suppliesAfter} left. Fatigue +${result.fatigueGained} to ${result.fatigueAfter}; condition ${result.travelConditionAfter}. ${passageStopText(result.stopReason)}`;
}
