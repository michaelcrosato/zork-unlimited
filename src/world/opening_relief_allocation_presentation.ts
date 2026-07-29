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

const CURRENT_RELIEF_ALLOCATION_FIELD_CATEGORIES: Readonly<Record<string, string>> = Object.freeze({
  "Clean exposed-ridge lure: prevent its ordinary cattle-alarm increase.": "Opening herd support",
  "Byre-held return: a 15-minute Market fatigue recovery.": "Return fatigue recovery",
  "Recovered failed fortification; byre-held return: Campus resupply.":
    "Field-failure and return reserve",
});

function reliefAllocationFieldCategory(
  option: ReturnType<typeof parseOpeningReliefAllocation>["options"][number],
): string | undefined {
  if (option.trigger_category === undefined) return undefined;
  return (
    CURRENT_RELIEF_ALLOCATION_FIELD_CATEGORIES[option.trigger_category] ?? option.trigger_category
  );
}

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
        const fieldCategory = reliefAllocationFieldCategory(option);
        const cost = formatOpeningReliefAllocationCost(option.terms);
        return Object.freeze({
          id: option.id,
          label: option.title,
          summary: Object.freeze({
            commitment: option.summary,
            fieldTrigger: fieldCategory ?? option.preview,
            ...(fieldCategory ? { fieldTriggerScope: "category" as const } : {}),
            immediateCost: cost,
            tradeoff: `Leaves exposed: ${option.leaves_exposed}`,
          }),
          consequence: fieldCategory
            ? `${option.summary} ${fieldCategory} Full field terms: ${option.preview} Protects: ${option.protects} ` +
              `Leaves exposed: ${option.leaves_exposed} Actual cost: ${cost}. ${option.consequence}`
            : `${option.summary} ${option.preview} Protects: ${option.protects} ` +
              `Leaves exposed: ${option.leaves_exposed} Actual cost: ${cost}. ${option.consequence}`,
        });
      }),
    ) as JourneyReliefAllocationStoryChoiceOptions,
  });
}
