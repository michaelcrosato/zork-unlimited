import type { CampaignCharacterState } from "./campaign_character_state.js";
import type {
  JourneyAllyStoryChoiceOptions,
  JourneyStoryChoicePrompt,
} from "./journey_contract.js";
import { formatOpeningAllyCost, parseOpeningAlly, type OpeningAlly } from "./opening_ally.js";

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
  return Object.freeze({
    commitment: option.summary,
    fieldTrigger: allyFieldCategory(scene, option),
    fieldTriggerScope: "category" as const,
    immediateCost: formatOpeningAllyCost(option.terms),
    tradeoff: option.tradeoff,
  });
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
        Object.freeze({
          id: option.id,
          label: option.title,
          summary: allySummary(parsed, option),
          consequence: `${option.summary} ${allyFieldCategory(parsed, option)} ${option.preview} Actual cost: ${formatOpeningAllyCost(option.terms)}. ${option.consequence}`,
        }),
      ),
    ) as JourneyAllyStoryChoiceOptions,
  });
}
