import type {
  JourneyLeadSourceStoryChoiceOptions,
  JourneyStoryChoicePrompt,
} from "./journey_contract.js";
import type { CampaignCharacterState } from "./campaign_character_state.js";
import {
  formatOpeningLeadSourceCost,
  openingLeadSourceTerms,
  parseOpeningLeadSource,
  type OpeningLeadSource,
} from "./opening_lead_source.js";

/** Project the Albany evidence packets onto the generic journey-choice surface. */
export function presentOpeningLeadSource(
  scene: OpeningLeadSource,
  character: CampaignCharacterState,
): JourneyStoryChoicePrompt {
  const parsed = parseOpeningLeadSource(scene);
  return Object.freeze({
    id: parsed.id,
    kind: "lead_source" as const,
    message: `${parsed.title}. ${parsed.message}`,
    options: Object.freeze(
      parsed.options.map((option) => {
        const terms = openingLeadSourceTerms(option, character);
        const sponsorship = terms.sponsorNote ? ` ${terms.sponsorNote}` : "";
        return Object.freeze({
          id: option.id,
          label: option.title,
          consequence: `${option.summary} ${option.preview} Actual cost: ${formatOpeningLeadSourceCost(terms)}.${sponsorship} ${option.consequence}`,
        });
      }),
    ) as JourneyLeadSourceStoryChoiceOptions,
  });
}
