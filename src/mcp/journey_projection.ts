import type {
  JourneyPresentation,
  JourneyStoryChoiceOption,
  JourneyStoryChoicePrompt,
  JourneyStoryChoicePresentationKind,
  JourneyStoryChoiceSummary,
} from "../world/journey_contract.js";
import type { RpgCompactMore, RpgCompactObservation } from "./compact_rpg_observation.js";
import { compactTrailingOmissionCounts } from "./compact_truncation.js";
import type { McpObservation } from "./types.js";

const COMPACT_MORE_ACTIONS_INDEX = 4;
const COMPACT_MORE_UNAVAILABLE_INDEX = 10;
export const JOURNEY_STORY_CHOICE_COMPARISON_VERSION = 1 as const;

export type JourneyStoryChoiceComparisonOption = Readonly<{
  id: string;
  label: string;
  summary?: JourneyStoryChoiceSummary;
}>;

/**
 * Compact, read-only story inspection. The first response is deliberately only
 * a comparison surface; one exact option can be expanded without exposing the
 * other options' full terms.
 */
export type JourneyStoryChoiceComparison = Readonly<{
  comparisonVersion: typeof JOURNEY_STORY_CHOICE_COMPARISON_VERSION;
  id: string;
  kind?: JourneyStoryChoicePresentationKind;
  message: string;
  options: readonly JourneyStoryChoiceComparisonOption[];
  inspectedOption: JourneyStoryChoiceOption | null;
}>;

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
  if (!summary) return option;

  const repeatedLead = `${summary.commitment} ${summary.fieldTrigger} `;
  if (!option.consequence.startsWith(repeatedLead)) return option;

  const withoutRepeatedLead = option.consequence.slice(repeatedLead.length);
  if (summary.immediateCost === undefined) {
    return Object.freeze({ ...option, consequence: withoutRepeatedLead });
  }

  const repeatedCost = `Actual cost: ${summary.immediateCost}.`;
  if (countExactOccurrences(withoutRepeatedLead, repeatedCost) !== 1) return option;

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

/**
 * Remove only setup-card prose already represented by the structured summary.
 * Authored text that does not match the exact expected shape is returned intact.
 */
export function compactJourneyStoryChoicePrompt(
  prompt: JourneyStoryChoicePrompt,
): JourneyStoryChoicePrompt {
  const options = prompt.options.map(compactJourneyStoryChoiceOption);
  if (options.every((option, index) => option === prompt.options[index])) return prompt;
  return Object.freeze({
    ...prompt,
    options: Object.freeze(options),
  }) as JourneyStoryChoicePrompt;
}

/** Build the staged compact inspection without changing the canonical prompt. */
export function compactJourneyStoryChoiceComparison(
  prompt: JourneyStoryChoicePrompt,
  optionId?: string,
): JourneyStoryChoiceComparison {
  const compactPrompt = compactJourneyStoryChoicePrompt(prompt);
  const inspectedSource =
    optionId === undefined ? null : journeyStoryChoiceOptionById(compactPrompt, optionId);
  const inspectedOption = inspectedSource
    ? Object.freeze({
        ...inspectedSource,
        ...(inspectedSource.summary
          ? { summary: Object.freeze({ ...inspectedSource.summary }) }
          : {}),
      })
    : null;
  const options = compactPrompt.options.map((option) =>
    Object.freeze({
      id: option.id,
      label: option.label,
      ...(option.summary ? { summary: Object.freeze({ ...option.summary }) } : {}),
    }),
  );
  return Object.freeze({
    comparisonVersion: JOURNEY_STORY_CHOICE_COMPARISON_VERSION,
    id: compactPrompt.id,
    ...(compactPrompt.kind === undefined ? {} : { kind: compactPrompt.kind }),
    message: compactPrompt.message,
    options: Object.freeze(options),
    inspectedOption,
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
