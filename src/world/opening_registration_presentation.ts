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

function registrationDefDistinction(consequence: string): string {
  const raisedFloor = consequence.match(
    /starting DEF floor from (?<before>\d+) to (?<after>\d+)/u,
  )?.groups;
  if (raisedFloor) {
    return `Starting DEF ${raisedFloor.before} → ${raisedFloor.after} when the authored campaign import applies.`;
  }
  if (consequence.includes("does not receive the Road-Warden's current Fieldcraft DEF import")) {
    return "No Road-Warden Fieldcraft import; the quest keeps its authored starting DEF.";
  }
  return "No additional starting-DEF distinction is stated on this role.";
}

function registrationExactConsequence(profile: OpeningRegistration["profiles"][number]): string {
  const fieldTrigger = profile.trigger_category?.replace(/\.$/u, "");
  return [
    profile.summary,
    profile.preview,
    ...(fieldTrigger ? [`Field trigger: ${fieldTrigger}.`] : []),
    profile.consequence,
  ].join(" ");
}

/** Project the manifest scene onto the existing generic journey-choice surface. */
export function presentOpeningRegistration(
  registration: OpeningRegistration,
): JourneyStoryChoicePrompt {
  const parsed = parseOpeningRegistration(registration);
  const profileOptions = parsed.profiles.map((profile) => {
    const immediateCost = `no time/fee; starts with $${String(profile.character.money)}`;
    const baseOption = Object.freeze({
      id: profile.id,
      label: profile.title,
      summary: Object.freeze({
        commitment: profile.summary,
        immediateCost,
        tradeoff: profile.tradeoff,
      }),
    });
    const skillEdge = labeledPreviewFact(profile.preview, "Skill edge");
    const kit = labeledPreviewFact(profile.preview, "Kit");
    const obligation = labeledPreviewFact(profile.preview, "Obligation");
    const starterPackage =
      skillEdge && kit ? `${skillEdge}; ${kit}` : (skillEdge ?? kit ?? profile.preview);
    const hasActiveObligation = profile.character.promises.some(
      (promise) => promise.status === "active",
    );
    return Object.freeze({
      ...baseOption,
      consequence: registrationExactConsequence(profile),
      summary: Object.freeze({
        ...baseOption.summary,
        fieldTrigger: starterPackage,
        fieldTriggerScope: "starter" as const,
        highlights: Object.freeze([
          Object.freeze({ label: "Permanent role", value: profile.title }),
          Object.freeze({ label: "Role experience", value: profile.summary }),
          Object.freeze({
            label: hasActiveObligation ? "Return obligation — ACTIVE" : "Return obligation",
            value:
              obligation ??
              (hasActiveObligation
                ? profile.tradeoff
                : "No active return obligation is included in this role."),
          }),
          Object.freeze({
            label: "Quest DEF",
            value: registrationDefDistinction(profile.consequence),
          }),
        ]),
      }),
    });
  });
  return Object.freeze({
    id: parsed.id,
    kind: "registration" as const,
    message:
      (parsed.doctrines?.length ?? 0) > 0
        ? `${parsed.title}. Choose your role now; Wolf-Winter duty and evidence follow. A role with an authored quick setup may bind both together at the next step. ${parsed.message}`
        : `${parsed.title}. ${parsed.message}`,
    options: Object.freeze(profileOptions) as JourneyRegistrationStoryChoiceOptions,
  });
}
