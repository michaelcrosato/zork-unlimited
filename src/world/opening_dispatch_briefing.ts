import type { JourneyStoryChoicePrompt } from "./journey_contract.js";
import type { OverworldManifest } from "./overworld.js";

const LEAD_SOURCE_COMPARISON_HEADER =
  "Certify one account; the other two close. Compare immediate cost, broad field fit, and what you give up. Inspect a card for exact conditions; they surface again when relevant.";
const PREPARATION_COMPARISON_HEADER =
  "Choose one optional specialist packet, or leave without one. Compare immediate cost, broad field fit, and tradeoff. Inspect a card for its exact check and recovery; they surface again in the field.";

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
  const leadSource = world.opening_lead_source;
  const preparation = world.opening_preparation;
  const displayMessage =
    leadSource && prompt.id === leadSource.id && prompt.kind === "lead_source"
      ? `${leadSource.title}. ${LEAD_SOURCE_COMPARISON_HEADER}`
      : preparation && prompt.id === preparation.id && prompt.kind === "preparation"
        ? `${preparation.title}. ${PREPARATION_COMPARISON_HEADER}`
        : prompt.message;
  if (civicStageIndex >= 0) {
    const stage = plan.civicStages[civicStageIndex]!;
    const completed = plan.civicStages
      .slice(0, civicStageIndex)
      .map((candidate) => candidate.label);
    const remaining = plan.civicStages
      .slice(civicStageIndex + 1)
      .map((candidate) => candidate.label);
    const progress = `${plan.questTitle} Civic docket · ${civicStageIndex + 1}/${plan.civicStages.length} — ${stage.label}.`;
    const planningContext =
      civicStageIndex === 0
        ? `Mission preview — ${plan.questDiscovery} At Civic: role → duty → evidence. Choose only your ${stage.label} now; two docket decisions stay open. Each sets a promise and broad field fit; none locks your solution.`
        : `Chosen at Civic: ${listLabels(completed)}. Now choose: ${stage.label}.${remaining.length > 0 ? ` Still ahead here: ${listLabels(remaining)}.` : " Next: take the certified packet to Hayden's Station board. Optional support is available there; inspect any card for detail that repeats in play."}`;
    return {
      ...prompt,
      message: `${progress} ${planningContext} ${displayMessage}`,
    };
  }
  const choice = departureChoice!;
  const progress =
    choice.kind === "preparation"
      ? `${plan.questTitle} Optional field packet — ${choice.label}.`
      : `${plan.questTitle} Optional relief capacity — ${choice.label}.`;
  const planningContext =
    choice.kind === "preparation"
      ? `This field-packet choice is optional: choose one preparation, or close it and launch ${plan.questTitle} now without one. Inspect a card for its exact check and recovery; the game repeats them if that field moment arrives.${plan.allyContactName ? ` ${plan.allyContactName}'s optional field-team conversation remains separate.` : ""}`
      : `This relief-capacity choice is separate and optional: choose one allocation, or close it to leave capacity unassigned.${plan.allyContactName ? ` After choosing or closing it, return to Station actions. ${plan.allyContactName}'s optional field-team conversation remains separate; launching ${plan.questTitle} without it keeps the solo route legal.` : ""}`;
  const missionCard = `Mission: ${plan.questTitle}. Last-mile route costs and field tradeoffs remain on its launch card.`;
  return {
    ...prompt,
    message: `${progress} ${missionCard} ${planningContext} ${displayMessage}`,
  };
}
