import type { CampaignCharacterState } from "./campaign_character_state.js";
import type {
  JourneyReliefOathStoryChoiceOptions,
  JourneyStoryChoicePrompt,
} from "./journey_contract.js";
import {
  formatOpeningReliefOathCost,
  parseOpeningReliefOath,
  type OpeningReliefOath,
} from "./opening_relief_oath.js";

const CURRENT_RELIEF_OATH_FIELD_CATEGORIES: Readonly<Record<string, string>> = Object.freeze({
  "FORTIFY benefit: first Albany public-seal Repair check is 2 DC easier.": "FORTIFY support",
  "LURE benefit: final bloodless cast skips +1 alarm; Cade-terms FORTIFY fit.": "LURE support",
  "DRIVE benefit: first shutter signal is 2 DC easier.": "DRIVE support",
});

function reliefOathFieldCategory(
  option: ReturnType<typeof parseOpeningReliefOath>["options"][number],
): string | undefined {
  if (option.trigger_category === undefined) return undefined;
  return CURRENT_RELIEF_OATH_FIELD_CATEGORIES[option.trigger_category] ?? option.trigger_category;
}

/** Project Albany's disclosed access-and-duty terms onto the journey choice surface. */
export function presentOpeningReliefOath(
  scene: OpeningReliefOath,
  _character: CampaignCharacterState,
): JourneyStoryChoicePrompt {
  const parsed = parseOpeningReliefOath(scene);
  const options = Object.freeze(
    parsed.options.map((option) => {
      const fieldCategory = reliefOathFieldCategory(option);
      return Object.freeze({
        id: option.id,
        label: option.title,
        summary: Object.freeze({
          commitment: option.summary,
          fieldTrigger: fieldCategory ?? option.preview,
          ...(fieldCategory ? { fieldTriggerScope: "category" as const } : {}),
          immediateCost: formatOpeningReliefOathCost(option.terms),
          tradeoff: option.tradeoff,
        }),
        consequence: fieldCategory
          ? `${option.summary} ${fieldCategory} ${option.preview} Access: ${option.access} Duty: ${option.duty} ` +
            `Actual cost: ${formatOpeningReliefOathCost(option.terms)}. ${option.consequence}`
          : `${option.summary} ${option.preview} Access: ${option.access} Duty: ${option.duty} ` +
            `Actual cost: ${formatOpeningReliefOathCost(option.terms)}. ${option.consequence}`,
      });
    }),
  ) as JourneyReliefOathStoryChoiceOptions;

  return Object.freeze({
    id: parsed.id,
    kind: "relief_oath" as const,
    message: `${parsed.title}. ${parsed.message}`,
    options,
  });
}
