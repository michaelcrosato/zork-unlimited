import type { JourneyStoryChoicePresentationKind } from "./journey_contract.js";

export const INSPECT_OVERWORLD_SESSION_STORY_TOOL = "inspect_overworld_session_story" as const;
export const CHOOSE_OVERWORLD_SESSION_STORY_TOOL = "choose_overworld_session_story" as const;
export const TALK_OVERWORLD_SESSION_CONTACT_TOOL = "talk_overworld_session_contact" as const;
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

export type OverworldDepartureContactLeadStatus = "requires_preparation" | "ready";

type OverworldDepartureContactLeadBase = Readonly<{
  id: string;
  kind: "ally";
  title: string;
  contactId: string;
  contactName: string;
  questId: string;
  questTitle: string;
  guidance: string;
}>;

export type OverworldDepartureContactLead = OverworldDepartureContactLeadBase &
  Readonly<
    | {
        status: "requires_preparation";
        action: null;
      }
    | {
        status: "ready";
        action: Readonly<{
          tool: typeof TALK_OVERWORLD_SESSION_CONTACT_TOOL;
          characterId: string;
          arguments: Readonly<{ character_id: string }>;
        }>;
      }
  >;

export type OverworldCompactDepartureContactLead = readonly [
  id: string,
  kind: "ally",
  title: string,
  status: OverworldDepartureContactLeadStatus,
  contactId: string,
  contactName: string,
  questId: string,
  questTitle: string,
  guidance: string,
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

/** Derive one optional contact lead without creating its contact-bound offer. */
export function overworldDepartureContactLead(args: {
  id: string;
  title: string;
  contactId: string;
  contactName: string;
  questId: string;
  questTitle: string;
  status: OverworldDepartureContactLeadStatus;
}): OverworldDepartureContactLead {
  const guidance =
    args.status === "ready"
      ? `Optional field team: talk to ${args.contactName} to review the terms. You may start ${args.questTitle} now as a solo rider without this choice.`
      : `Optional field team: choose a Station preparation first, then talk to ${args.contactName} to review the terms. You may start ${args.questTitle} now as a solo rider without this choice.`;
  const base: OverworldDepartureContactLeadBase = Object.freeze({
    id: args.id,
    kind: "ally",
    title: args.title,
    contactId: args.contactId,
    contactName: args.contactName,
    questId: args.questId,
    questTitle: args.questTitle,
    guidance,
  });
  return args.status === "ready"
    ? Object.freeze({
        ...base,
        status: "ready" as const,
        action: Object.freeze({
          tool: TALK_OVERWORLD_SESSION_CONTACT_TOOL,
          characterId: args.contactId,
          arguments: Object.freeze({ character_id: args.contactId }),
        }),
      })
    : Object.freeze({
        ...base,
        status: "requires_preparation" as const,
        action: null,
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

export function cloneOverworldDepartureContactLead(
  lead: OverworldDepartureContactLead,
): OverworldDepartureContactLead {
  return lead.status === "ready"
    ? {
        ...lead,
        action: {
          ...lead.action,
          arguments: { ...lead.action.arguments },
        },
      }
    : { ...lead, action: null };
}

export function compactOverworldDepartureInteractions(
  interactions: readonly OverworldDepartureInteraction[],
): OverworldCompactDepartureInteraction[] {
  return interactions.map((interaction) => [interaction.id, interaction.kind, interaction.title]);
}

export function compactOverworldDepartureContactLeads(
  leads: readonly OverworldDepartureContactLead[],
): OverworldCompactDepartureContactLead[] {
  return leads.map((lead) => [
    lead.id,
    lead.kind,
    lead.title,
    lead.status,
    lead.contactId,
    lead.contactName,
    lead.questId,
    lead.questTitle,
    lead.guidance,
  ]);
}
