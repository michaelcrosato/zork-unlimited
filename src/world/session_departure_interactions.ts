import type { JourneyStoryChoicePresentationKind } from "./journey_contract.js";

export const INSPECT_OVERWORLD_SESSION_STORY_TOOL = "inspect_overworld_session_story" as const;
export const CHOOSE_OVERWORLD_SESSION_STORY_TOOL = "choose_overworld_session_story" as const;
export const OVERWORLD_DEPARTURE_CHOICE_VALUES_FROM = "story.options[*].id" as const;

export type OverworldDepartureInteractionArguments = Readonly<{
  story_choice_id: string;
}>;

export type OverworldDepartureInteractionKind = Extract<
  JourneyStoryChoicePresentationKind,
  "preparation" | "relief_allocation"
>;

export type OverworldDepartureInteraction = Readonly<{
  id: string;
  kind: OverworldDepartureInteractionKind;
  title: string;
  inspect: Readonly<{
    tool: typeof INSPECT_OVERWORLD_SESSION_STORY_TOOL;
    storyChoiceId: string;
    arguments: OverworldDepartureInteractionArguments;
  }>;
  choose: Readonly<{
    tool: typeof CHOOSE_OVERWORLD_SESSION_STORY_TOOL;
    storyChoiceId: string;
    arguments: OverworldDepartureInteractionArguments;
    argument: "choice";
    valuesFrom: typeof OVERWORLD_DEPARTURE_CHOICE_VALUES_FROM;
  }>;
}>;

export type OverworldCompactDepartureInteraction = readonly [
  id: string,
  kind: OverworldDepartureInteractionKind,
  title: string,
];

export function overworldDepartureInteraction(args: {
  id: string;
  kind: OverworldDepartureInteractionKind;
  title: string;
}): OverworldDepartureInteraction {
  return Object.freeze({
    id: args.id,
    kind: args.kind,
    title: args.title,
    inspect: Object.freeze({
      tool: INSPECT_OVERWORLD_SESSION_STORY_TOOL,
      storyChoiceId: args.id,
      arguments: Object.freeze({ story_choice_id: args.id }),
    }),
    choose: Object.freeze({
      tool: CHOOSE_OVERWORLD_SESSION_STORY_TOOL,
      storyChoiceId: args.id,
      arguments: Object.freeze({ story_choice_id: args.id }),
      argument: "choice" as const,
      valuesFrom: OVERWORLD_DEPARTURE_CHOICE_VALUES_FROM,
    }),
  });
}

export function cloneOverworldDepartureInteraction(
  interaction: OverworldDepartureInteraction,
): OverworldDepartureInteraction {
  return {
    ...interaction,
    inspect: {
      ...interaction.inspect,
      arguments: { ...interaction.inspect.arguments },
    },
    choose: {
      ...interaction.choose,
      arguments: { ...interaction.choose.arguments },
    },
  };
}

export function compactOverworldDepartureInteractions(
  interactions: readonly OverworldDepartureInteraction[],
): OverworldCompactDepartureInteraction[] {
  return interactions.map((interaction) => [interaction.id, interaction.kind, interaction.title]);
}
