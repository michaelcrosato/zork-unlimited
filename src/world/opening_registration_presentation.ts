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
  const doctrines = parsed.doctrines ?? [];
  const doctrineOptions = doctrines.map((doctrine) =>
    Object.freeze({
      ...presentOpeningChoiceOption({
        id: doctrine.id,
        label: doctrine.title,
        commitment: doctrine.summary,
        exactBenefit: doctrine.trigger_category,
        immediateCost: doctrine.immediate_cost,
        giveUp: doctrine.tradeoff,
      }),
      group: "doctrine" as const,
    }),
  );
  const profileOptions = parsed.profiles.map((profile) => {
    const triggerCategory = profile.trigger_category;
    const group = doctrines.length > 0 ? { group: "custom_role" as const } : {};
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
        ...group,
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
      ...group,
    });
  });
  return Object.freeze({
    id: parsed.id,
    kind: "registration" as const,
    message:
      doctrines.length === 0
        ? `${parsed.title}. ${parsed.message}`
        : `${parsed.title}. Start with a doctrine to commit a role, Wolf-Winter duty, and source packet together. Or build a custom role below. ${parsed.message}`,
    options: Object.freeze([
      ...doctrineOptions,
      ...profileOptions,
    ]) as JourneyRegistrationStoryChoiceOptions,
  });
}
