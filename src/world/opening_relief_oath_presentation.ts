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

/** Project Albany's disclosed access-and-duty terms onto the journey choice surface. */
export function presentOpeningReliefOath(
  scene: OpeningReliefOath,
  _character: CampaignCharacterState,
): JourneyStoryChoicePrompt {
  const parsed = parseOpeningReliefOath(scene);
  const options = Object.freeze(
    parsed.options.map((option) =>
      Object.freeze({
        id: option.id,
        label: option.title,
        summary: Object.freeze({
          commitment: option.summary,
          fieldTrigger: option.preview,
          immediateCost: formatOpeningReliefOathCost(option.terms),
        }),
        consequence:
          `${option.summary} ${option.preview} Access: ${option.access} Duty: ${option.duty} ` +
          `Actual cost: ${formatOpeningReliefOathCost(option.terms)}. ${option.consequence}`,
      }),
    ),
  ) as JourneyReliefOathStoryChoiceOptions;

  return Object.freeze({
    id: parsed.id,
    kind: "relief_oath" as const,
    message: `${parsed.title}. ${parsed.message}`,
    options,
  });
}
