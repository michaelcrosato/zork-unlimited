import type {
  JourneyRegistrationStoryChoiceOptions,
  JourneyStoryChoicePrompt,
} from "./journey_contract.js";
import { presentOpeningChoiceOption } from "./opening_choice_receipt.js";
import { parseOpeningRegistration, type OpeningRegistration } from "./opening_registration.js";

/** Project the manifest scene onto the existing generic journey-choice surface. */
export function presentOpeningRegistration(
  registration: OpeningRegistration,
): JourneyStoryChoicePrompt {
  const parsed = parseOpeningRegistration(registration);
  const profileOptions = parsed.profiles.map((profile) => {
    const triggerCategory = profile.trigger_category;
    if (triggerCategory === undefined) {
      return Object.freeze({
        id: profile.id,
        label: profile.title,
        summary: Object.freeze({
          commitment: profile.summary,
          fieldTrigger: profile.preview,
          immediateCost: `No added time or fee; starting funds $${String(profile.character.money)}`,
          tradeoff: profile.tradeoff,
        }),
        consequence: `${profile.summary} ${profile.preview} ${profile.consequence}`,
      });
    }
    const immediateCost = `no time/fee; starts with $${String(profile.character.money)}`;
    return Object.freeze({
      ...presentOpeningChoiceOption({
        id: profile.id,
        label: profile.title,
        commitment: profile.summary,
        exactBenefit: triggerCategory,
        immediateCost,
        giveUp: profile.tradeoff,
      }),
    });
  });
  return Object.freeze({
    id: parsed.id,
    kind: "registration" as const,
    message:
      (parsed.doctrines?.length ?? 0) > 0
        ? `${parsed.title}. Choose your role now; Wolf-Winter duty and evidence follow. A role with an authored standard packet may bind both together at the next step. ${parsed.message}`
        : `${parsed.title}. ${parsed.message}`,
    options: Object.freeze(profileOptions) as JourneyRegistrationStoryChoiceOptions,
  });
}
