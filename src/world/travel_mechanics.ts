import type { OverworldRoadEvent } from "./overworld.js";

export const OVERWORLD_MAX_SUPPLIES = 8;
export const OVERWORLD_STARTING_SUPPLIES = 6;
export const OVERWORLD_MAX_FATIGUE = 100;
export const OVERWORLD_STARTING_MINUTES = 8 * 60;

export type OverworldRoadEncounterStrategy = "assist_travelers" | "cautious_scout" | "press_on";

const ROAD_ENCOUNTER_STRATEGIES = new Set<string>([
  "assist_travelers",
  "cautious_scout",
  "press_on",
]);

export type OverworldRoadEncounterOption = {
  strategy: OverworldRoadEncounterStrategy;
  label: string;
  minutes: number;
  suppliesCost: number;
  fatigueGained: number;
  renownGained: number;
  /**
   * Consequence prose applied on resolution. Present on the session's live encounter;
   * withheld from every outward projection until the strategy is chosen.
   */
  outcome?: string;
};

export type OverworldTravelResourceState = {
  supplies: number;
  fatigue: number;
};

export type OverworldTravelLegResult = {
  baseMinutes: number;
  delayMinutes: number;
  elapsedMinutes: number;
  suppliesNeeded: number;
  suppliesUsed: number;
  supplyDeficit: number;
  suppliesAfter: number;
  fatigueGained: number;
  fatigueAfter: number;
  travelConditionAfter: string;
};

export function isOverworldRoadEncounterStrategy(
  value: string,
): value is OverworldRoadEncounterStrategy {
  return ROAD_ENCOUNTER_STRATEGIES.has(value);
}

function roadEncounterRisk(roadEvent: OverworldRoadEvent): number {
  return roadEvent.risk === "high" ? 3 : roadEvent.risk === "medium" ? 2 : 1;
}

export function roadEncounterOptionsFor(
  roadEvent: OverworldRoadEvent,
): OverworldRoadEncounterOption[] {
  const risk = roadEncounterRisk(roadEvent);
  const authored = roadEvent.responses;
  return [
    {
      strategy: "cautious_scout",
      label: authored?.cautious_scout.label ?? "Scout the road problem",
      minutes: 15 + risk * 10,
      suppliesCost: 0,
      fatigueGained: 0,
      renownGained: 1,
      outcome:
        authored?.cautious_scout.outcome ??
        "You slow down, read the situation, and leave a useful warning for the next traveler.",
    },
    {
      strategy: "assist_travelers",
      label: authored?.assist_travelers.label ?? "Help resolve it",
      minutes: 25 + risk * 15,
      suppliesCost: risk >= 3 ? 2 : 1,
      fatigueGained: risk,
      renownGained: risk + 1,
      outcome:
        authored?.assist_travelers.outcome ??
        "You spend supplies and effort stabilizing the road trouble instead of merely passing it.",
    },
    {
      strategy: "press_on",
      label: authored?.press_on.label ?? "Press on",
      minutes: 0,
      suppliesCost: 0,
      fatigueGained: risk,
      renownGained: 0,
      outcome:
        authored?.press_on.outcome ??
        "You keep moving and accept the extra strain rather than spending daylight on the encounter.",
    },
  ];
}

export function roadEncounterOptionFor(
  roadEvent: OverworldRoadEvent,
  strategy: OverworldRoadEncounterStrategy,
): OverworldRoadEncounterOption {
  const option = roadEncounterOptionsFor(roadEvent).find(
    (candidate) => candidate.strategy === strategy,
  );
  if (!option) throw new Error(`Unknown road encounter strategy "${strategy}".`);
  return option;
}

export function travelSupplyCost(minutes: number): number {
  return Math.max(1, Math.ceil(minutes / 180));
}

export function travelFatigueGain(minutes: number, roadEvent: OverworldRoadEvent | null): number {
  const riskExtra = roadEvent?.risk === "high" ? 3 : roadEvent?.risk === "medium" ? 1 : 0;
  return Math.max(1, Math.ceil(minutes / 45)) + riskExtra;
}

export function travelDelayMinutes(
  minutes: number,
  fatigue: number,
  supplyDeficit: number,
): number {
  const fatigueRate = fatigue >= 80 ? 0.35 : fatigue >= 50 ? 0.2 : fatigue >= 25 ? 0.1 : 0;
  const fatigueDelay = Math.ceil(minutes * fatigueRate);
  const supplyDelay = supplyDeficit * 30;
  return fatigueDelay + supplyDelay;
}

export function travelCondition(fatigue: number, supplies: number): string {
  if (fatigue >= 80) return supplies === 0 ? "exhausted and out of supplies" : "exhausted";
  if (fatigue >= 50) return supplies === 0 ? "worn down and out of supplies" : "worn down";
  if (supplies === 0) return "out of supplies";
  if (fatigue >= 25) return "tired";
  return "ready";
}

export function resolveOverworldTravelLeg(
  minutes: number,
  roadEvent: OverworldRoadEvent | null,
  resources: OverworldTravelResourceState,
): OverworldTravelLegResult {
  const suppliesNeeded = travelSupplyCost(minutes);
  const suppliesUsed = Math.min(resources.supplies, suppliesNeeded);
  const supplyDeficit = suppliesNeeded - suppliesUsed;
  const delayMinutes = travelDelayMinutes(minutes, resources.fatigue, supplyDeficit);
  const fatigueGained = travelFatigueGain(minutes, roadEvent) + supplyDeficit * 4;
  const suppliesAfter = resources.supplies - suppliesUsed;
  const fatigueAfter = Math.min(OVERWORLD_MAX_FATIGUE, resources.fatigue + fatigueGained);

  return {
    baseMinutes: minutes,
    delayMinutes,
    elapsedMinutes: minutes + delayMinutes,
    suppliesNeeded,
    suppliesUsed,
    supplyDeficit,
    suppliesAfter,
    fatigueGained,
    fatigueAfter,
    travelConditionAfter: travelCondition(fatigueAfter, suppliesAfter),
  };
}
