import type { JourneyStoryChoicePrompt } from "./journey_contract.js";
import type { OverworldManifest } from "./overworld.js";

const FIELD_CHECK_TIMING = "Field checks surface with their action before resolution.";
const REGISTRATION_COMPARISON_HEADER = `Choose who you were and the promise you carry. Compare exact cost and what each role gives up. ${FIELD_CHECK_TIMING}`;
const DOCTRINE_REGISTRATION_COMPARISON_HEADER = `Choose a doctrine or custom role. Compare its promise, exact cost, what it gives up, and what remains open. ${FIELD_CHECK_TIMING}`;
const RELIEF_OATH_COMPARISON_HEADER = `Choose whose authority you accept and the promise you make. Compare exact cost and what each duty gives up. ${FIELD_CHECK_TIMING}`;
const LEAD_SOURCE_COMPARISON_HEADER = `Certify one account; the other two close. Compare its priority, exact cost, and what it gives up. ${FIELD_CHECK_TIMING}`;
const PREPARATION_COMPARISON_HEADER = `Choose one optional field priority, or leave without one. Compare exact cost and what it gives up. ${FIELD_CHECK_TIMING}`;
const RELIEF_ALLOCATION_COMPARISON_HEADER = `Choose whom Albany protects, or leave capacity unassigned. Compare each priority's exact cost and what remains exposed. ${FIELD_CHECK_TIMING}`;

type OpeningDispatchStage = Readonly<{
  id: string;
  kind: NonNullable<JourneyStoryChoicePrompt["kind"]>;
  label: string;
}>;

export type OpeningDispatchManifestChain = Readonly<{
  quest: OverworldManifest["quests"][number];
  registration: NonNullable<OverworldManifest["opening_registration"]>;
  reliefOath: NonNullable<OverworldManifest["opening_relief_oath"]>;
  leadSource: NonNullable<OverworldManifest["opening_lead_source"]>;
  preparation: NonNullable<OverworldManifest["opening_preparation"]>;
  reliefAllocation: NonNullable<OverworldManifest["opening_relief_allocation"]>;
  ally: NonNullable<OverworldManifest["opening_ally"]> | null;
}>;

type OpeningDispatchPlan = Readonly<{
  questTitle: string;
  questDiscovery: string;
  allyContactName: string | null;
  civicStages: readonly OpeningDispatchStage[];
  departureChoices: readonly OpeningDispatchStage[];
}>;

/** Resolve the one authored Albany dispatch chain shared by its read-only projections. */
export function resolveOpeningDispatchManifestChain(
  world: OverworldManifest,
): OpeningDispatchManifestChain | null {
  const registration = world.opening_registration;
  const reliefOath = world.opening_relief_oath;
  const leadSource = world.opening_lead_source;
  const preparation = world.opening_preparation;
  const reliefAllocation = world.opening_relief_allocation;
  if (!registration || !reliefOath || !leadSource || !preparation || !reliefAllocation) {
    return null;
  }
  const targetQuestId = leadSource.target_quest;
  if (
    reliefOath.after_registration !== registration.id ||
    reliefOath.target_quest !== targetQuestId ||
    leadSource.after_registration !== registration.id ||
    preparation.after_lead_source !== leadSource.id ||
    preparation.target_quest !== targetQuestId ||
    reliefAllocation.after_preparation !== preparation.id ||
    reliefAllocation.target_quest !== targetQuestId
  ) {
    return null;
  }
  const quest = world.quests.find((candidate) => candidate.id === targetQuestId);
  if (!quest) return null;
  const authoredAlly = world.opening_ally;
  const ally =
    authoredAlly?.target_quest === targetQuestId &&
    authoredAlly.after_preparation === preparation.id &&
    world.characters.some((candidate) => candidate.id === authoredAlly.contact)
      ? authoredAlly
      : null;
  return {
    quest,
    registration,
    reliefOath,
    leadSource,
    preparation,
    reliefAllocation,
    ally,
  };
}

/**
 * Resolve the authored five-card Albany dispatch without adding a second
 * content source. The briefing deliberately reuses the quest's discovery copy
 * so the player learns the actual crisis before making a permanent choice.
 */
function openingDispatchPlan(world: OverworldManifest): OpeningDispatchPlan | null {
  const chain = resolveOpeningDispatchManifestChain(world);
  if (!chain) return null;
  const { quest, registration, reliefOath, leadSource, preparation, reliefAllocation, ally } =
    chain;
  const allyContact = ally
    ? world.characters.find((candidate) => candidate.id === ally.contact)
    : null;
  return {
    questTitle: quest.title,
    questDiscovery: quest.discovery,
    allyContactName: ally && allyContact ? allyContact.name : null,
    civicStages: Object.freeze([
      Object.freeze({
        id: registration.id,
        kind: "registration",
        label: "role",
      }),
      Object.freeze({
        id: reliefOath.id,
        kind: "relief_oath",
        label: "duty",
      }),
      Object.freeze({ id: leadSource.id, kind: "lead_source", label: "evidence" }),
    ]),
    departureChoices: Object.freeze([
      Object.freeze({
        id: preparation.id,
        kind: "preparation",
        label: "preparation",
      }),
      Object.freeze({
        id: reliefAllocation.id,
        kind: "relief_allocation",
        label: "relief allocation",
      }),
    ]),
  };
}

function listLabels(labels: readonly string[]): string {
  if (labels.length === 0) return "none";
  if (labels.length === 1) return labels[0]!;
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
  return `${labels.slice(0, -1).join(", ")}, and ${labels.at(-1)}`;
}

/** Add finite mission and planning context without changing the saved journal. */
export function withOpeningDispatchBriefing(
  world: OverworldManifest,
  prompt: JourneyStoryChoicePrompt | null | undefined,
): JourneyStoryChoicePrompt | null | undefined {
  if (!prompt?.kind) return prompt;
  const plan = openingDispatchPlan(world);
  if (!plan) return prompt;
  const civicStageIndex = plan.civicStages.findIndex(
    (stage) => stage.id === prompt.id && stage.kind === prompt.kind,
  );
  const departureChoice = plan.departureChoices.find(
    (stage) => stage.id === prompt.id && stage.kind === prompt.kind,
  );
  if (civicStageIndex < 0 && !departureChoice) return prompt;
  const registration = world.opening_registration;
  const reliefOath = world.opening_relief_oath;
  const leadSource = world.opening_lead_source;
  const preparation = world.opening_preparation;
  const reliefAllocation = world.opening_relief_allocation;
  const offersStartingDoctrines = (registration?.doctrines?.length ?? 0) > 0;
  const displayMessage =
    registration && prompt.id === registration.id && prompt.kind === "registration"
      ? `${registration.title}. ${
          offersStartingDoctrines
            ? DOCTRINE_REGISTRATION_COMPARISON_HEADER
            : REGISTRATION_COMPARISON_HEADER
        }`
      : reliefOath && prompt.id === reliefOath.id && prompt.kind === "relief_oath"
        ? `${reliefOath.title}. ${RELIEF_OATH_COMPARISON_HEADER}`
        : leadSource && prompt.id === leadSource.id && prompt.kind === "lead_source"
          ? `${leadSource.title}. ${LEAD_SOURCE_COMPARISON_HEADER}`
          : preparation && prompt.id === preparation.id && prompt.kind === "preparation"
            ? `${preparation.title}. ${PREPARATION_COMPARISON_HEADER}`
            : reliefAllocation &&
                prompt.id === reliefAllocation.id &&
                prompt.kind === "relief_allocation"
              ? `${reliefAllocation.title}. ${RELIEF_ALLOCATION_COMPARISON_HEADER}`
              : prompt.message;
  if (civicStageIndex >= 0) {
    const stage = plan.civicStages[civicStageIndex]!;
    const completed = plan.civicStages
      .slice(0, civicStageIndex)
      .map((candidate) => candidate.label);
    const remaining = plan.civicStages
      .slice(civicStageIndex + 1)
      .map((candidate) => candidate.label);
    const progress =
      civicStageIndex === 0 && offersStartingDoctrines
        ? `${plan.questTitle} Civic start — doctrine or custom role.`
        : `${plan.questTitle} Civic docket · ${civicStageIndex + 1}/${plan.civicStages.length} — ${stage.label}.`;
    const planningContext =
      civicStageIndex === 0
        ? offersStartingDoctrines
          ? `Mission preview — ${plan.questDiscovery} A doctrine commits role, duty, and evidence together. A custom role commits role; duty and evidence follow. Both leave solutions open.`
          : `Mission preview — ${plan.questDiscovery} At Civic: role → duty → evidence. Choose only your ${stage.label} now; duty and evidence follow. None locks your field solution.`
        : `Chosen at Civic: ${listLabels(completed)}. Now choose: ${stage.label}.${remaining.length > 0 ? ` Next: ${listLabels(remaining)}.` : " Next: take the certified packet to Hayden's Station launch board."}`;
    return {
      ...prompt,
      message: `${progress} ${planningContext} ${displayMessage}`,
    };
  }
  const choice = departureChoice!;
  const progress =
    choice.kind === "preparation"
      ? `${plan.questTitle} · optional ${choice.label}.`
      : `${plan.questTitle} · optional relief priority.`;
  const planningContext =
    choice.kind === "preparation"
      ? `Choose one preparation, or close this and launch ${plan.questTitle} without one.${plan.allyContactName ? ` ${plan.allyContactName}'s field-team conversation is separate.` : ""}`
      : `Choose one relief priority, or close this and leave capacity unassigned.${plan.allyContactName ? ` ${plan.allyContactName}'s field-team conversation is separate; launching now keeps the solo route legal.` : ""}`;
  const missionCard = `Mission: ${plan.questTitle}. Last-mile route costs and field tradeoffs remain on its launch card.`;
  return {
    ...prompt,
    message: `${progress} ${missionCard} ${planningContext} ${displayMessage}`,
  };
}
