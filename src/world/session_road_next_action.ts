export const OVERWORLD_ROAD_ENCOUNTER_RESOLUTION_TOOL =
  "resolve_overworld_session_road_encounter" as const;

export type OverworldRoadEncounterNextAction = Readonly<{
  tool: typeof OVERWORLD_ROAD_ENCOUNTER_RESOLUTION_TOOL;
  argument: "strategy";
  valuesFrom: "options[*].strategy";
}>;

export type OverworldCompactRoadEncounterNextAction = Readonly<{
  tool: typeof OVERWORLD_ROAD_ENCOUNTER_RESOLUTION_TOOL;
  argument: "strategy";
  values_from: "options[*][0]";
}>;

export function overworldRoadEncounterNextAction(): OverworldRoadEncounterNextAction {
  return {
    tool: OVERWORLD_ROAD_ENCOUNTER_RESOLUTION_TOOL,
    argument: "strategy",
    valuesFrom: "options[*].strategy",
  };
}

export function compactOverworldRoadEncounterNextAction(): OverworldCompactRoadEncounterNextAction {
  return {
    tool: OVERWORLD_ROAD_ENCOUNTER_RESOLUTION_TOOL,
    argument: "strategy",
    values_from: "options[*][0]",
  };
}
