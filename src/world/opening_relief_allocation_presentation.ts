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
import { presentOpeningChoiceOption } from "./opening_choice_receipt.js";

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
        const cost = formatOpeningReliefAllocationCost(option.terms);
        return presentOpeningChoiceOption({
          id: option.id,
          label: option.title,
          commitment: option.summary,
          exactBenefit: option.trigger_category ?? option.protects,
          immediateCost: cost,
          giveUp: `Leaves exposed: ${option.leaves_exposed}`,
        });
      }),
    ) as JourneyReliefAllocationStoryChoiceOptions,
  });
}
