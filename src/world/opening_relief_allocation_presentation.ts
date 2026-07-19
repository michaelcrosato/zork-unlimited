import type { CampaignCharacterState } from "./campaign_character_state.js";
import type {
  JourneyReliefAllocationStoryChoiceOptions,
  JourneyStoryChoicePrompt,
} from "./journey_contract.js";
import {
  formatOpeningReliefAllocationCost,
  parseOpeningReliefAllocation,
  type OpeningReliefAllocation,
} from "./opening_relief_allocation.js";

/** Project the finite public packet onto the generic journey story-choice surface. */
export function presentOpeningReliefAllocation(
  scene: OpeningReliefAllocation,
  _character: CampaignCharacterState,
): JourneyStoryChoicePrompt {
  const parsed = parseOpeningReliefAllocation(scene);
  return Object.freeze({
    id: parsed.id,
    kind: "relief_allocation" as const,
    message: `${parsed.title}. ${parsed.message}`,
    options: Object.freeze(
      parsed.options.map((option) =>
        Object.freeze({
          id: option.id,
          label: option.title,
          summary: Object.freeze({
            commitment: option.summary,
            fieldTrigger: option.preview,
            immediateCost: formatOpeningReliefAllocationCost(option.terms),
          }),
          consequence:
            `${option.summary} ${option.preview} Protects: ${option.protects} ` +
            `Leaves exposed: ${option.leaves_exposed} Actual cost: ${formatOpeningReliefAllocationCost(option.terms)}. ${option.consequence}`,
        }),
      ),
    ) as JourneyReliefAllocationStoryChoiceOptions,
  });
}
