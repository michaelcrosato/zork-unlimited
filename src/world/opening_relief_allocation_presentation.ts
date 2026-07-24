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
      parsed.options.map((option) => {
        const triggerCategory = option.trigger_category;
        const cost = formatOpeningReliefAllocationCost(option.terms);
        return Object.freeze({
          id: option.id,
          label: option.title,
          summary: Object.freeze({
            commitment: option.summary,
            fieldTrigger: triggerCategory ?? option.preview,
            ...(triggerCategory ? { fieldTriggerScope: "category" as const } : {}),
            immediateCost: cost,
          }),
          consequence: triggerCategory
            ? `${option.summary} ${triggerCategory} Full field terms: ${option.preview} Protects: ${option.protects} ` +
              `Leaves exposed: ${option.leaves_exposed} Actual cost: ${cost}. ${option.consequence}`
            : `${option.summary} ${option.preview} Protects: ${option.protects} ` +
              `Leaves exposed: ${option.leaves_exposed} Actual cost: ${cost}. ${option.consequence}`,
        });
      }),
    ) as JourneyReliefAllocationStoryChoiceOptions,
  });
}
