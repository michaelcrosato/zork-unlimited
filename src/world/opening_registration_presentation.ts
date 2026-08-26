import type {
  JourneyRegistrationStoryChoiceOptions,
  JourneyStoryChoicePrompt,
} from "./journey_contract.js";
import { parseOpeningRegistration, type OpeningRegistration } from "./opening_registration.js";

function labeledPreviewFact(preview: string, label: string): string | null {
  const prefix = `${label}: `;
  const fact = preview
    .split(". ")
    .map((part) => part.replace(/\.$/u, ""))
    .find((part) => part.startsWith(prefix));
  return fact?.slice(prefix.length) ?? null;
}

function sentenceCase(value: string): string {
  return `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;
}

function registrationExactConsequence(profile: OpeningRegistration["profiles"][number]): string {
  const bestFor = profile.trigger_category?.replace(/\.$/u, "");
  return [profile.preview, ...(bestFor ? [`Best for: ${bestFor}.`] : []), profile.consequence].join(
    " ",
  );
}

/** Project the manifest scene onto the existing generic journey-choice surface. */
export function presentOpeningRegistration(
  registration: OpeningRegistration,
): JourneyStoryChoicePrompt {
  const parsed = parseOpeningRegistration(registration);
  const profileOptions = parsed.profiles.map((profile) => {
    const immediateCost = `no fee or delay; start with $${String(profile.character.money)}`;
    const skillEdge = labeledPreviewFact(profile.preview, "Skill edge");
    const kit = labeledPreviewFact(profile.preview, "Kit");
    const obligation = labeledPreviewFact(profile.preview, "Obligation");
    const hasActiveObligation = profile.character.promises.some(
      (promise) => promise.status === "active",
    );
    const starterPackage = skillEdge && kit ? `${skillEdge}; ${kit}` : (skillEdge ?? kit);
    const giveUp = obligation
      ? sentenceCase(obligation)
      : hasActiveObligation
        ? "Carry this background's stated return promise."
        : profile.tradeoff;
    return Object.freeze({
      id: profile.id,
      label: profile.title,
      consequence: registrationExactConsequence(profile),
      summary: Object.freeze({
        commitment: `Permanent background — ${profile.summary}`,
        ...(starterPackage
          ? {
              highlights: Object.freeze([
                Object.freeze({ label: "Starts with", value: starterPackage }),
              ]) as readonly [Readonly<{ label: string; value: string }>],
            }
          : {}),
        immediateCost,
        tradeoff: giveUp,
      }),
    });
  });
  const [first, second, third, fourth, ...remaining] = profileOptions;
  if (!first || !second || !third || !fourth) {
    throw new Error("Opening registration presentation requires at least four backgrounds.");
  }
  const options: JourneyRegistrationStoryChoiceOptions = Object.freeze([
    first,
    second,
    third,
    fourth,
    ...remaining,
  ]);
  return Object.freeze({
    id: parsed.id,
    kind: "registration" as const,
    message: `${parsed.title}. ${parsed.message}`,
    options,
  });
}
