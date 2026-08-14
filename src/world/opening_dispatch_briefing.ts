import type { JourneyStoryChoicePrompt } from "./journey_contract.js";
import { openingAllyTotalTimingSummary } from "./opening_ally.js";
import type { OverworldManifest } from "./overworld.js";

const FIELD_CHECK_TIMING = "Field checks surface with their action before resolution.";
const REGISTRATION_COMPARISON_HEADER =
  "Compare background funds, starter edge, return promise, and tradeoff. No fee; checks appear before resolution.";
const RELIEF_OATH_COMPARISON_HEADER = `Compare promise, exact cost, and what each promise gives up. ${FIELD_CHECK_TIMING}`;
const STANDARD_PACKET_RELIEF_OATH_COMPARISON_HEADER =
  "Compare its exact cost and which promise/report alternatives close. Checks appear before resolution.";
const LEAD_SOURCE_COMPARISON_HEADER = `Other reports close. Compare field priority, exact cost, and tradeoff. ${FIELD_CHECK_TIMING}`;
const PREPARATION_COMPARISON_HEADER = `Compare field use, exact cost, and tradeoff. ${FIELD_CHECK_TIMING}`;
const RELIEF_ALLOCATION_COMPARISON_HEADER = `Compare who the relief wagon protects, exact cost, and what remains exposed. ${FIELD_CHECK_TIMING}`;
const ALLY_COMPARISON_HEADER = `Compare the second rider's promise, exact cost, and tradeoff. ${FIELD_CHECK_TIMING}`;

const OPENING_DISPATCH_SUPPORT_DISCOVERY_MARKER = " The live dispatch has ";

/** Split the authored crisis from Station support; ambiguous/missing boundaries fail closed. */
export function openingDispatchCrisisPreview(discovery: string): string | null {
  const parts = discovery.split(OPENING_DISPATCH_SUPPORT_DISCOVERY_MARKER);
  if (parts.length !== 2) return null;
  const preview = parts[0]!.trim();
  const deferredSupport = parts[1]!.trim();
  return preview.length > 0 && deferredSupport.length > 0 ? preview : null;
}

const OPENING_DISPATCH_PURPOSE: Readonly<
  Record<NonNullable<JourneyStoryChoicePrompt["kind"]>, string>
> = Object.freeze({
  registration: "Purpose: choose a background; all four field plans stay open.",
  relief_oath: "Purpose: choose a Wolf-Winter promise; every field plan stays open.",
  lead_source: "Purpose: choose a report; every field plan stays open.",
  preparation:
    "Purpose: optionally choose one field kit; the relief wagon and second rider stay separate.",
  relief_allocation:
    "Purpose: optionally send the relief wagon; the field kit and second rider stay separate.",
  ally: "Purpose: choose a second rider or ride alone; every Wolf-Winter route stays available.",
});

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
  questCrisisPreview: string;
  allyContactName: string | null;
  allyTimingSummary: string | null;
  civicStages: readonly OpeningDispatchStage[];
  departureChoices: readonly OpeningDispatchStage[];
  allyChoice: OpeningDispatchStage | null;
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
    reliefAllocation.target_quest !== targetQuestId ||
    reliefAllocation.home !== preparation.home ||
    reliefAllocation.area !== preparation.area
  ) {
    return null;
  }
  const quest = world.quests.find((candidate) => candidate.id === targetQuestId);
  if (!quest) return null;
  const authoredAlly = world.opening_ally;
  const ally =
    authoredAlly?.target_quest === targetQuestId &&
    authoredAlly.after_preparation === preparation.id &&
    authoredAlly.home === preparation.home &&
    authoredAlly.area === preparation.area &&
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
 * content source. The briefing deliberately reuses only the crisis sentence
 * from quest discovery, leaving Station support for the departure board.
 */
function openingDispatchPlan(world: OverworldManifest): OpeningDispatchPlan | null {
  const chain = resolveOpeningDispatchManifestChain(world);
  if (!chain) return null;
  const { quest, registration, reliefOath, leadSource, preparation, reliefAllocation, ally } =
    chain;
  const questCrisisPreview = openingDispatchCrisisPreview(quest.discovery);
  if (!questCrisisPreview) return null;
  const allyContact = ally
    ? world.characters.find((candidate) => candidate.id === ally.contact)
    : null;
  return {
    questTitle: quest.title,
    questCrisisPreview,
    allyContactName: ally && allyContact ? allyContact.name : null,
    allyTimingSummary: ally && allyContact ? openingAllyTotalTimingSummary(ally) : null,
    civicStages: Object.freeze([
      Object.freeze({
        id: registration.id,
        kind: "registration",
        label: "background",
      }),
      Object.freeze({
        id: reliefOath.id,
        kind: "relief_oath",
        label: "Wolf-Winter promise",
      }),
      Object.freeze({ id: leadSource.id, kind: "lead_source", label: "report" }),
    ]),
    departureChoices: Object.freeze([
      Object.freeze({
        id: preparation.id,
        kind: "preparation",
        label: "field kit",
      }),
      Object.freeze({
        id: reliefAllocation.id,
        kind: "relief_allocation",
        label: "relief wagon",
      }),
    ]),
    allyChoice: ally
      ? Object.freeze({
          id: ally.id,
          kind: "ally",
          label: "second rider",
        })
      : null,
  };
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
  const allyChoice =
    plan.allyChoice?.id === prompt.id && plan.allyChoice.kind === prompt.kind
      ? plan.allyChoice
      : null;
  if (civicStageIndex < 0 && !departureChoice && !allyChoice) return prompt;
  const registration = world.opening_registration;
  const reliefOath = world.opening_relief_oath;
  const leadSource = world.opening_lead_source;
  const preparation = world.opening_preparation;
  const reliefAllocation = world.opening_relief_allocation;
  const ally = world.opening_ally;
  const offersStandardPacket =
    prompt.kind === "relief_oath" &&
    (registration?.doctrines?.some((doctrine) =>
      prompt.options.some((option) => option.id === doctrine.id),
    ) ??
      false);
  const displayMessage =
    registration && prompt.id === registration.id && prompt.kind === "registration"
      ? `Choose a background. ${REGISTRATION_COMPARISON_HEADER}`
      : reliefOath && prompt.id === reliefOath.id && prompt.kind === "relief_oath"
        ? `Choose a Wolf-Winter promise. ${
            offersStandardPacket
              ? STANDARD_PACKET_RELIEF_OATH_COMPARISON_HEADER
              : RELIEF_OATH_COMPARISON_HEADER
          }`
        : leadSource && prompt.id === leadSource.id && prompt.kind === "lead_source"
          ? `Choose the Wolf-Winter report. ${LEAD_SOURCE_COMPARISON_HEADER}`
          : preparation && prompt.id === preparation.id && prompt.kind === "preparation"
            ? `Choose a field kit. ${PREPARATION_COMPARISON_HEADER}`
            : reliefAllocation &&
                prompt.id === reliefAllocation.id &&
                prompt.kind === "relief_allocation"
              ? `Send Albany's relief wagon. ${RELIEF_ALLOCATION_COMPARISON_HEADER}`
              : ally && prompt.id === ally.id && prompt.kind === "ally"
                ? `Choose a second rider or ride alone. ${ALLY_COMPARISON_HEADER}`
                : prompt.message;
  const purpose = offersStandardPacket
    ? "Quick setup: choose the ready-made dispatch or customize it; one Wolf-Winter promise, one report, and all four field plans stay open."
    : OPENING_DISPATCH_PURPOSE[prompt.kind];
  if (civicStageIndex >= 0) {
    const stage = plan.civicStages[civicStageIndex]!;
    const progress =
      civicStageIndex === 0
        ? `${plan.questTitle} · background.`
        : offersStandardPacket
          ? `${plan.questTitle} · ready-made dispatch.`
          : `${plan.questTitle} · ${stage.label}.`;
    const planningContext =
      civicStageIndex === 0
        ? `Mission — ${plan.questCrisisPreview} Next: ready-made promise/report pair or customize.`
        : civicStageIndex === 1 && offersStandardPacket
          ? ""
          : civicStageIndex === 2
            ? "Albany Station's launch board follows."
            : "A report follows.";
    return {
      ...prompt,
      message: [progress, purpose, planningContext, displayMessage].filter(Boolean).join(" "),
    };
  }
  if (allyChoice) {
    const progress = `${plan.questTitle} · optional ${allyChoice.label}.`;
    const missionCard = `Route costs and tactics remain on ${plan.questTitle}'s launch card.`;
    const planningContext = 'Choose "Ride alone" to keep the one-rider launch.';
    return {
      ...prompt,
      message: `${progress} ${purpose} ${missionCard} ${planningContext} ${displayMessage}`,
    };
  }
  const choice = departureChoice!;
  const progress =
    choice.kind === "preparation"
      ? `${plan.questTitle} · optional ${choice.label}.`
      : `${plan.questTitle} · optional relief wagon.`;
  const planningContext =
    choice.kind === "preparation"
      ? plan.allyContactName
        ? `${plan.allyContactName}'s second-rider conversation is separate. ${plan.allyTimingSummary ?? ""}`
        : ""
      : plan.allyContactName
        ? `${plan.allyContactName}'s second-rider conversation is separate; launching now keeps riding alone legal. ${plan.allyTimingSummary ?? ""}`
        : "";
  const missionCard = `Route costs and tactics remain on ${plan.questTitle}'s launch card.`;
  return {
    ...prompt,
    message: `${progress} ${purpose} ${missionCard} ${planningContext} ${displayMessage}`,
  };
}
