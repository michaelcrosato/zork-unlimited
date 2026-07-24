import type {
  JourneyPreparationStoryChoiceOptions,
  JourneyStoryChoicePrompt,
} from "./journey_contract.js";
import type { CampaignCharacterState } from "./campaign_character_state.js";
import {
  formatOpeningPreparationCost,
  openingPreparationTerms,
  parseOpeningPreparation,
  type OpeningPreparation,
} from "./opening_preparation.js";

/** Project the finite preparation catalog onto the generic journey-choice surface. */
export function presentOpeningPreparation(
  scene: OpeningPreparation,
  character: CampaignCharacterState,
): JourneyStoryChoicePrompt {
  const parsed = parseOpeningPreparation(scene);
  return Object.freeze({
    id: parsed.id,
    kind: "preparation" as const,
    message: `${parsed.title}. ${parsed.message}`,
    options: Object.freeze(
      parsed.profiles.map((profile) => {
        const terms = openingPreparationTerms(profile, character);
        const sponsorship = terms.sponsorNote ? ` ${terms.sponsorNote}` : "";
        const triggerCategory = profile.trigger_category;
        const cost = formatOpeningPreparationCost(terms);
        return Object.freeze({
          id: profile.id,
          label: profile.title,
          summary: Object.freeze({
            commitment: profile.summary,
            fieldTrigger: triggerCategory ?? profile.preview,
            ...(triggerCategory ? { fieldTriggerScope: "category" as const } : {}),
            immediateCost: cost,
          }),
          consequence: triggerCategory
            ? `${profile.summary} ${triggerCategory} Full field terms: ${profile.preview} Actual cost: ${cost}.${sponsorship} ${profile.consequence}`
            : `${profile.summary} ${profile.preview} Actual cost: ${cost}.${sponsorship} ${profile.consequence}`,
        });
      }),
    ) as JourneyPreparationStoryChoiceOptions,
  });
}
