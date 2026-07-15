import type { CampaignCharacterState } from "./campaign_character_state.js";
import type {
  JourneyAllyStoryChoiceOptions,
  JourneyStoryChoicePrompt,
} from "./journey_contract.js";
import { formatOpeningAllyCost, parseOpeningAlly, type OpeningAlly } from "./opening_ally.js";

/** Project the departure bond onto the same honest journey-choice surface as other openings. */
export function presentOpeningAlly(
  scene: OpeningAlly,
  _character: CampaignCharacterState,
): JourneyStoryChoicePrompt {
  const parsed = parseOpeningAlly(scene);
  return Object.freeze({
    id: parsed.id,
    kind: "ally" as const,
    message: `${parsed.title}. ${parsed.message} Capability: ${parsed.capability} Condition: ${parsed.condition}`,
    options: Object.freeze(
      parsed.options.map((option) =>
        Object.freeze({
          id: option.id,
          label: option.title,
          consequence: `${option.summary} ${option.preview} Actual cost: ${formatOpeningAllyCost(option.terms)}. ${option.consequence}`,
        }),
      ),
    ) as JourneyAllyStoryChoiceOptions,
  });
}
