import type {
  OverworldArea,
  OverworldAreaExit,
  OverworldCharacter,
  OverworldCharacterView,
  OverworldEdge,
  OverworldExit,
  OverworldExplorationSite,
  OverworldLocalEvent,
  OverworldLocalJob,
  OverworldNode,
  OverworldPoi,
  OverworldRoadEvent,
} from "./overworld.js";

export function cloneOverworldNode(node: OverworldNode): OverworldNode {
  return {
    ...node,
    services: [...node.services],
  };
}

export function cloneOverworldArea(area: OverworldArea): OverworldArea {
  return {
    ...area,
    services: [...area.services],
  };
}

export function cloneOverworldEdge(edge: OverworldEdge): OverworldEdge {
  return { ...edge };
}

export function cloneOverworldExit(exit: OverworldExit): OverworldExit {
  return {
    ...exit,
    destination: cloneOverworldNode(exit.destination),
  };
}

export function cloneOverworldAreaExit(exit: OverworldAreaExit): OverworldAreaExit {
  return {
    ...exit,
    destination: cloneOverworldArea(exit.destination),
  };
}

export function cloneOverworldPoi(poi: OverworldPoi): OverworldPoi {
  return { ...poi };
}

export function cloneOverworldCharacter(character: OverworldCharacter): OverworldCharacter {
  return {
    ...character,
    ...(character.variants
      ? {
          variants: character.variants.map((variant) => ({
            ...variant,
            after_quests: [...variant.after_quests],
          })),
        }
      : {}),
  };
}

export function cloneOverworldCharacterView(
  character: OverworldCharacterView,
): OverworldCharacterView {
  return { ...character };
}

export function cloneOverworldLocalEvent(event: OverworldLocalEvent): OverworldLocalEvent {
  return { ...event };
}

export function cloneOverworldLocalJob(job: OverworldLocalJob): OverworldLocalJob {
  return { ...job };
}

export function cloneOverworldExplorationSite(
  site: OverworldExplorationSite,
): OverworldExplorationSite {
  return { ...site };
}

export function cloneOverworldRoadEvent(event: OverworldRoadEvent): OverworldRoadEvent {
  return {
    ...event,
    ...(event.active_goal_ids ? { active_goal_ids: [...event.active_goal_ids] } : {}),
    ...(event.responses
      ? {
          responses: {
            cautious_scout: { ...event.responses.cautious_scout },
            assist_travelers: { ...event.responses.assist_travelers },
            press_on: { ...event.responses.press_on },
          },
        }
      : {}),
  };
}
