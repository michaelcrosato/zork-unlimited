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
import type { OverworldRoadEncounterOption } from "./travel_mechanics.js";

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
            ...(variant.after_quests ? { after_quests: [...variant.after_quests] } : {}),
            ...(variant.after_relationship_memories
              ? {
                  after_relationship_memories: [...variant.after_relationship_memories],
                }
              : {}),
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
  return {
    ...event,
    ...(event.authored_scene
      ? {
          authored_scene: {
            ...event.authored_scene,
            ...(event.authored_scene.requires_completed_quests
              ? {
                  requires_completed_quests: [...event.authored_scene.requires_completed_quests],
                }
              : {}),
            ...(event.authored_scene.forbids_completed_quests
              ? {
                  forbids_completed_quests: [...event.authored_scene.forbids_completed_quests],
                }
              : {}),
            options: event.authored_scene.options.map((option) => ({
              ...option,
              terms: { ...option.terms },
            })),
          },
        }
      : {}),
  };
}

export function cloneOverworldLocalJob(job: OverworldLocalJob): OverworldLocalJob {
  return {
    ...job,
    ...(job.authored_scene
      ? {
          authored_scene: {
            ...job.authored_scene,
            ...(job.authored_scene.requires_completed_quests
              ? {
                  requires_completed_quests: [...job.authored_scene.requires_completed_quests],
                }
              : {}),
            ...(job.authored_scene.requires_resolved_events
              ? {
                  requires_resolved_events: [...job.authored_scene.requires_resolved_events],
                }
              : {}),
            ...(job.authored_scene.requires_all_world_facts
              ? {
                  requires_all_world_facts: [...job.authored_scene.requires_all_world_facts],
                }
              : {}),
            ...(job.authored_scene.forbids_any_world_facts
              ? {
                  forbids_any_world_facts: [...job.authored_scene.forbids_any_world_facts],
                }
              : {}),
            options: job.authored_scene.options.map((option) => ({
              ...option,
              terms: { ...option.terms },
              ...(option.requires_event_options
                ? {
                    requires_event_options: option.requires_event_options.map((requirement) => ({
                      ...requirement,
                    })),
                  }
                : {}),
              ...(option.requires_all_world_facts
                ? { requires_all_world_facts: [...option.requires_all_world_facts] }
                : {}),
              ...(option.forbids_any_world_facts
                ? { forbids_any_world_facts: [...option.forbids_any_world_facts] }
                : {}),
              ...(option.requires_all_story_choices
                ? {
                    requires_all_story_choices: option.requires_all_story_choices.map((ref) => ({
                      ...ref,
                    })),
                  }
                : {}),
              ...(option.forbids_any_story_choices
                ? {
                    forbids_any_story_choices: option.forbids_any_story_choices.map((ref) => ({
                      ...ref,
                    })),
                  }
                : {}),
            })),
          },
        }
      : {}),
  };
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

/**
 * Outward projection of a road event. Authored response outcomes stay hidden until a
 * strategy is chosen — matching the UI and compact surfaces — so no pre-choice player
 * projection may carry `responses`; the resolution result alone narrates the outcome.
 */
export function redactOverworldRoadEventForPresentation(
  event: OverworldRoadEvent,
): OverworldRoadEvent {
  const clone = cloneOverworldRoadEvent(event);
  if (clone.responses) delete clone.responses;
  return clone;
}

/** Outward projection of an encounter option: label and visible costs, no outcome. */
export function redactOverworldRoadEncounterOptionForPresentation(
  option: OverworldRoadEncounterOption,
): OverworldRoadEncounterOption {
  const clone = { ...option };
  if (clone.outcome !== undefined) delete clone.outcome;
  return clone;
}
