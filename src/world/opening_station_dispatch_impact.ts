import type { JourneyStoryChoicePrompt } from "./journey_contract.js";

/**
 * Remove derived Station timing from a prompt that is no longer known to be
 * live. This is intentionally sanitization-only: only OverworldSession may
 * create a dispatch impact from its private current state.
 */
export function stripOpeningStationDispatchImpact(
  prompt: JourneyStoryChoicePrompt | null | undefined,
): JourneyStoryChoicePrompt | null | undefined {
  if (!prompt || !prompt.options.some((option) => option.dispatchImpact !== undefined)) {
    return prompt;
  }
  return Object.freeze({
    ...prompt,
    options: Object.freeze(
      prompt.options.map(({ dispatchImpact: _dispatchImpact, ...option }) => Object.freeze(option)),
    ),
  }) as JourneyStoryChoicePrompt;
}
