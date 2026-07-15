import type {
  JourneyRegistrationStoryChoiceOptions,
  JourneyStoryChoicePrompt,
} from "./journey_contract.js";
import { parseOpeningRegistration, type OpeningRegistration } from "./opening_registration.js";

/** Project the manifest scene onto the existing generic journey-choice surface. */
export function presentOpeningRegistration(
  registration: OpeningRegistration,
): JourneyStoryChoicePrompt {
  const parsed = parseOpeningRegistration(registration);
  return Object.freeze({
    id: parsed.id,
    kind: "registration" as const,
    message: `${parsed.title}. ${parsed.message}`,
    options: Object.freeze(
      parsed.profiles.map((profile) =>
        Object.freeze({
          id: profile.id,
          label: profile.title,
          consequence: `${profile.summary} ${profile.preview} ${profile.consequence}`,
        }),
      ),
    ) as JourneyRegistrationStoryChoiceOptions,
  });
}
