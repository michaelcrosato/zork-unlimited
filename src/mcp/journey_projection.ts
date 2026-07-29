import type {
  JourneyPresentation,
  JourneyStoryChoiceDispatchImpact,
  JourneyStoryChoiceDispatchForecast,
  JourneyStoryChoiceOption,
  JourneyStoryChoicePrompt,
  JourneyStoryChoicePresentationKind,
  JourneyStoryChoiceSummary,
} from "../world/journey_contract.js";
import {
  INSPECT_OVERWORLD_SESSION_STORY_TOOL,
  OVERWORLD_DEPARTURE_CHOICE_VALUES_FROM,
  type OverworldDepartureInteractionArguments,
} from "../world/session_departure_interactions.js";
import type { RpgCompactMore, RpgCompactObservation } from "./compact_rpg_observation.js";
import { compactTrailingOmissionCounts } from "./compact_truncation.js";
import type { McpObservation } from "./types.js";

const COMPACT_MORE_ACTIONS_INDEX = 4;
const COMPACT_MORE_UNAVAILABLE_INDEX = 10;
const COMPACT_MORE_CHOICES_INDEX = 12;
export const JOURNEY_STORY_CHOICE_COMPARISON_VERSION = 6 as const;
export const JOURNEY_STORY_CHOICE_STAGED_CONSEQUENCE =
  "Complete terms are staged; inspect this exact option before choosing if you need them." as const;

export type JourneyStoryChoiceComparisonOption = Readonly<{
  id: string;
  label: string;
  group?: JourneyStoryChoiceOption["group"];
  summary?: JourneyStoryChoiceSummary;
  dispatchForecast?: JourneyStoryChoiceDispatchForecast;
  dispatchImpact?: JourneyStoryChoiceDispatchImpact;
}>;

export type JourneyStoryChoiceDetailOption = Readonly<{
  id: string;
  label: string;
  group?: JourneyStoryChoiceOption["group"];
  consequence: string;
}>;

export type JourneyStoryChoiceReviewAffordance = Readonly<{
  tool: typeof INSPECT_OVERWORLD_SESSION_STORY_TOOL;
  storyChoiceId: string;
  arguments: OverworldDepartureInteractionArguments;
  argument: "option_id";
  valuesFrom: typeof OVERWORLD_DEPARTURE_CHOICE_VALUES_FROM;
  readOnly: true;
}>;

/**
 * Compact, read-only story inspection. The first response is deliberately only
 * a comparison surface; one exact option can be expanded without exposing the
 * other options' full terms.
 */
type JourneyStoryChoiceProjectionBase = Readonly<{
  comparisonVersion: typeof JOURNEY_STORY_CHOICE_COMPARISON_VERSION;
  id: string;
  kind?: JourneyStoryChoicePresentationKind;
}>;

export type JourneyStoryChoiceSummaryComparison = JourneyStoryChoiceProjectionBase &
  Readonly<{
    message: string;
    options: readonly JourneyStoryChoiceComparisonOption[];
    reviewOption: JourneyStoryChoiceReviewAffordance;
    inspectedOption: null;
  }>;

export type JourneyStoryChoiceDetail = JourneyStoryChoiceProjectionBase &
  Readonly<{
    inspectedOption: JourneyStoryChoiceDetailOption;
  }>;

export type JourneyStoryChoiceComparison =
  | JourneyStoryChoiceSummaryComparison
  | JourneyStoryChoiceDetail;

export type EmbeddedJourneyField = {
  journey: JourneyPresentation;
  overworld_snapshot_hash: string;
};

export function journeyBlocksGameplay(journey: JourneyPresentation): boolean {
  return (
    journey.pendingChoice !== null || journey.storyChoice !== null || journey.status === "ended"
  );
}

function countExactOccurrences(value: string, exact: string): number {
  let count = 0;
  let offset = 0;
  while (offset <= value.length - exact.length) {
    const match = value.indexOf(exact, offset);
    if (match === -1) break;
    count += 1;
    offset = match + exact.length;
  }
  return count;
}

function compactJourneyStoryChoiceOption(
  option: JourneyStoryChoiceOption,
): JourneyStoryChoiceOption {
  const { summary } = option;
  if (!summary?.fieldTrigger) return option;

  const repeatedLead = `${summary.commitment} ${summary.fieldTrigger} `;
  if (!option.consequence.startsWith(repeatedLead)) return option;

  const withoutRepeatedLead = option.consequence.slice(repeatedLead.length);
  const repeatedCost = `Actual cost: ${summary.immediateCost}.`;
  const repeatedCostCount = countExactOccurrences(withoutRepeatedLead, repeatedCost);
  if (repeatedCostCount === 0) {
    return Object.freeze({ ...option, consequence: withoutRepeatedLead });
  }
  if (repeatedCostCount !== 1) return option;

  const costIndex = withoutRepeatedLead.indexOf(repeatedCost);
  if (costIndex === -1) return option;
  const beforeCost = withoutRepeatedLead.slice(0, costIndex).trimEnd();
  const afterCost = withoutRepeatedLead.slice(costIndex + repeatedCost.length).trimStart();
  const consequence = [beforeCost, afterCost].filter((part) => part.length > 0).join(" ");
  return Object.freeze({ ...option, consequence });
}

export function journeyStoryChoiceOptionById(
  prompt: JourneyStoryChoicePrompt,
  optionId: string,
): JourneyStoryChoiceOption {
  const option = prompt.options.find((candidate) => candidate.id === optionId);
  if (!option) {
    throw new Error(`Story choice "${prompt.id}" does not offer option "${optionId}".`);
  }
  return option;
}

/** Stage active compact consequences behind exact, read-only option inspection. */
export function compactJourneyStoryChoicePrompt(
  prompt: JourneyStoryChoicePrompt,
): JourneyStoryChoicePrompt {
  const options = prompt.options.map((option) =>
    option.consequence === JOURNEY_STORY_CHOICE_STAGED_CONSEQUENCE
      ? option
      : Object.freeze({
          ...option,
          consequence: JOURNEY_STORY_CHOICE_STAGED_CONSEQUENCE,
        }),
  );
  if (options.every((option, index) => option === prompt.options[index])) return prompt;
  return Object.freeze({
    ...prompt,
    options: Object.freeze(options),
  }) as JourneyStoryChoicePrompt;
}

/** Build the staged compact inspection without changing the canonical prompt. */
export function compactJourneyStoryChoiceComparison(
  prompt: JourneyStoryChoicePrompt,
): JourneyStoryChoiceSummaryComparison;
export function compactJourneyStoryChoiceComparison(
  prompt: JourneyStoryChoicePrompt,
  optionId: string,
): JourneyStoryChoiceDetail;
export function compactJourneyStoryChoiceComparison(
  prompt: JourneyStoryChoicePrompt,
  optionId?: string,
): JourneyStoryChoiceComparison {
  const base = Object.freeze({
    comparisonVersion: JOURNEY_STORY_CHOICE_COMPARISON_VERSION,
    id: prompt.id,
    ...(prompt.kind === undefined ? {} : { kind: prompt.kind }),
  });
  if (optionId !== undefined) {
    const inspectedSource = compactJourneyStoryChoiceOption(
      journeyStoryChoiceOptionById(prompt, optionId),
    );
    return Object.freeze({
      ...base,
      inspectedOption: Object.freeze({
        id: inspectedSource.id,
        label: inspectedSource.label,
        ...(inspectedSource.group === undefined ? {} : { group: inspectedSource.group }),
        consequence: inspectedSource.consequence,
      }),
    });
  }
  const options = prompt.options.map((option) =>
    Object.freeze({
      id: option.id,
      label: option.label,
      ...(option.group === undefined ? {} : { group: option.group }),
      ...(option.summary ? { summary: Object.freeze({ ...option.summary }) } : {}),
      ...(option.dispatchForecast
        ? {
            dispatchForecast: Object.freeze({
              ...option.dispatchForecast,
              finalMinutes: Object.freeze({ ...option.dispatchForecast.finalMinutes }),
            }),
          }
        : {}),
      ...(option.dispatchImpact
        ? { dispatchImpact: Object.freeze({ ...option.dispatchImpact }) }
        : {}),
    }),
  );
  return Object.freeze({
    ...base,
    message: prompt.message,
    options: Object.freeze(options),
    reviewOption: Object.freeze({
      tool: INSPECT_OVERWORLD_SESSION_STORY_TOOL,
      storyChoiceId: prompt.id,
      arguments: Object.freeze({ story_choice_id: prompt.id }),
      argument: "option_id",
      valuesFrom: OVERWORLD_DEPARTURE_CHOICE_VALUES_FROM,
      readOnly: true,
    }),
    inspectedOption: null,
  });
}

/** Compact MCP projection; the canonical journey and all non-story fields remain shared. */
export function compactJourneyPresentation(journey: JourneyPresentation): JourneyPresentation {
  if (!journey.storyChoice) return journey;
  const storyChoice = compactJourneyStoryChoicePrompt(journey.storyChoice);
  if (storyChoice === journey.storyChoice) return journey;
  return Object.freeze({ ...journey, storyChoice });
}

function suppressCompactGameplayOmissions(
  more: RpgCompactMore | undefined,
): RpgCompactMore | undefined {
  if (!more) return undefined;
  const counts = more.map((count) => count ?? 0);
  if (counts.length > COMPACT_MORE_ACTIONS_INDEX) counts[COMPACT_MORE_ACTIONS_INDEX] = 0;
  if (counts.length > COMPACT_MORE_UNAVAILABLE_INDEX) {
    counts[COMPACT_MORE_UNAVAILABLE_INDEX] = 0;
  }
  if (counts.length > COMPACT_MORE_CHOICES_INDEX) counts[COMPACT_MORE_CHOICES_INDEX] = 0;
  return compactTrailingOmissionCounts(counts) as RpgCompactMore | undefined;
}

/** Hide RPG decisions while the parent journey choice is the only legal move. */
export function suppressRpgGameplayActions<
  Payload extends {
    context?: RpgCompactObservation;
    observation?: McpObservation;
  },
>(payload: Payload): Payload {
  const context = payload.context
    ? (() => {
        const {
          actions: _actions,
          unavailable: _unavailable,
          choices: _choices,
          more,
          ...withoutActions
        } = payload.context;
        const visibleMore = suppressCompactGameplayOmissions(more);
        return {
          ...withoutActions,
          ...(visibleMore ? { more: visibleMore } : {}),
        } as RpgCompactObservation;
      })()
    : undefined;
  const observation = payload.observation
    ? { ...payload.observation, available_actions: [], blocked_actions: [] }
    : undefined;
  return {
    ...payload,
    ...(context ? { context } : {}),
    ...(observation ? { observation } : {}),
  };
}
