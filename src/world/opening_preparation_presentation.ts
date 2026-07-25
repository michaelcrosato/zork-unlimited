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
  type OpeningPreparationCheckDisclosure,
} from "./opening_preparation.js";

function preparationCheckDisclosure(
  check: OpeningPreparationCheckDisclosure | undefined,
  character: CampaignCharacterState,
): string {
  if (!check) return "";
  const modifier = character.skills.find((skill) => skill.skillId === check.skill_id)?.rank ?? 0;
  const minimumRoll = check.difficulty - modifier;
  const successCount = Math.max(0, Math.min(20, 21 - minimumRoll));
  const chance = (successCount / 20) * 100;
  const signedModifier = modifier >= 0 ? `+${String(modifier)}` : String(modifier);
  const odds =
    successCount === 0
      ? "has no successful natural roll (0%)"
      : `succeeds on ${successCount === 20 ? "1" : String(minimumRoll)}-20 (${String(chance)}%)`;
  return ` Current ${check.skill_label} modifier: ${signedModifier}. This d20 + ${String(modifier)} vs DC ${String(check.difficulty)} check ${odds}.`;
}

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
        const checkDisclosure = preparationCheckDisclosure(profile.check_disclosure, character);
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
            ? `${profile.summary} ${triggerCategory} Full field terms: ${profile.preview}${checkDisclosure} Actual cost: ${cost}.${sponsorship} ${profile.consequence}`
            : `${profile.summary} ${profile.preview}${checkDisclosure} Actual cost: ${cost}.${sponsorship} ${profile.consequence}`,
        });
      }),
    ) as JourneyPreparationStoryChoiceOptions,
  });
}
