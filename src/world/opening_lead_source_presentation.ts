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

const CURRENT_LEAD_SOURCE_FIELD_CATEGORIES: Readonly<Record<string, string>> = Object.freeze({
  "First use: public routes and split-rail recovery.": "Public routes and rail recovery",
  "First use: the post-yearling fodder-loft route.": "Post-yearling loft approach",
  "First use: the ordinary-hunt split rail.": "Ordinary-hunt split rail",
});

function leadSourceFieldCategory(
  option: ReturnType<typeof parseOpeningLeadSource>["options"][number],
): string | undefined {
  if (option.trigger_category === undefined) return undefined;
  return CURRENT_LEAD_SOURCE_FIELD_CATEGORIES[option.trigger_category] ?? option.trigger_category;
}

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
        const fieldCategory = leadSourceFieldCategory(option);
        const sponsorship = terms.sponsorNote ? ` ${terms.sponsorNote}` : "";
        return Object.freeze({
          id: option.id,
          label: option.title,
          summary: Object.freeze({
            commitment: option.summary,
            fieldTrigger: fieldCategory ?? option.preview,
            ...(fieldCategory ? { fieldTriggerScope: "category" as const } : {}),
            immediateCost: formatOpeningLeadSourceCost(terms),
            tradeoff: option.tradeoff,
          }),
          consequence: fieldCategory
            ? `${option.summary} ${fieldCategory} ${option.preview} Actual cost: ${formatOpeningLeadSourceCost(terms)}.${sponsorship} ${option.consequence}`
            : `${option.summary} ${option.preview} Actual cost: ${formatOpeningLeadSourceCost(terms)}.${sponsorship} ${option.consequence}`,
        });
      }),
    ) as JourneyLeadSourceStoryChoiceOptions,
  });
}
