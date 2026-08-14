import type { CampaignCharacterState } from "./campaign_character_state.js";
import type {
  JourneyAllyStoryChoiceOptions,
  JourneyStoryChoicePrompt,
} from "./journey_contract.js";
import {
  formatOpeningAllyChoiceTiming,
  openingAllyOptionDisplayLabel,
  parseOpeningAlly,
  type OpeningAlly,
} from "./opening_ally.js";
import { presentOpeningChoiceOption } from "./opening_choice_receipt.js";

function allyFieldCategory(
  scene: ReturnType<typeof parseOpeningAlly>,
  option: ReturnType<typeof parseOpeningAlly>["options"][number],
): string {
  if (option.effects.some((effect) => effect.type === "add_companion")) {
    return "Independent cattle-pressure ally";
  }
  if (option.id === scene.solo_option_id) {
    return "Solo field team; no ally action";
  }
  return "No companion; relay terms refused";
}

function allySummary(
  scene: ReturnType<typeof parseOpeningAlly>,
  option: ReturnType<typeof parseOpeningAlly>["options"][number],
) {
  return {
    commitment: option.summary,
    exactBenefit: allyFieldCategory(scene, option),
    immediateCost: formatOpeningAllyChoiceTiming(option.terms),
    giveUp: option.tradeoff,
  };
}

/** Project the departure bond onto the same honest journey-choice surface as other openings. */
export function presentOpeningAlly(
  scene: OpeningAlly,
  _character: CampaignCharacterState,
): JourneyStoryChoicePrompt {
  const parsed = parseOpeningAlly(scene);
  return Object.freeze({
    id: parsed.id,
    kind: "ally" as const,
    message: `${parsed.title}. ${parsed.message}`,
    options: Object.freeze(
      parsed.options.map((option) =>
        presentOpeningChoiceOption({
          id: option.id,
          label: openingAllyOptionDisplayLabel(parsed, option),
          ...allySummary(parsed, option),
        }),
      ),
    ) as JourneyAllyStoryChoiceOptions,
  });
}
