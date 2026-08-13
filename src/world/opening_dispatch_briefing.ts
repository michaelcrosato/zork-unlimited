import type { JourneyStoryChoicePrompt } from "./journey_contract.js";
import { openingAllyTotalTimingSummary } from "./opening_ally.js";
import type { OverworldManifest } from "./overworld.js";

const FIELD_CHECK_TIMING = "Field checks surface with their action before resolution.";
const REGISTRATION_COMPARISON_HEADER = `Compare starting resources, first field edge, exact cost, and tradeoff. ${FIELD_CHECK_TIMING}`;
const RELIEF_OATH_COMPARISON_HEADER = `Compare promise, exact cost, and what each duty gives up. ${FIELD_CHECK_TIMING}`;
const STANDARD_PACKET_RELIEF_OATH_COMPARISON_HEADER = `Compare promise, exact cost, and tradeoff. ${FIELD_CHECK_TIMING}`;
const LEAD_SOURCE_COMPARISON_HEADER = `Other accounts close. Compare field priority, exact cost, and tradeoff. ${FIELD_CHECK_TIMING}`;
const PREPARATION_COMPARISON_HEADER = `Compare field priority, exact cost, and tradeoff. ${FIELD_CHECK_TIMING}`;
const RELIEF_ALLOCATION_COMPARISON_HEADER = `Compare who is protected, exact cost, and what remains exposed. ${FIELD_CHECK_TIMING}`;
const ALLY_COMPARISON_HEADER = `Compare field-team promise, exact cost, and tradeoff. ${FIELD_CHECK_TIMING}`;

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
  registration:
    "Purpose: choose your role and promise. Order is neutral; HUNT, LURE, DRIVE, and FORTIFY stay open.",
  relief_oath: "Purpose: choose duty; every field plan stays open.",
  lead_source: "Purpose: choose evidence; every field plan stays open.",
  preparation:
    "Purpose: optionally choose one preparation; relief priority and field team stay separate.",
  relief_allocation:
    "Purpose: optionally choose one relief priority; preparation and field team stay separate.",
  ally: "Purpose: choose June's field-team terms or the solo team; every Wolf-Winter route stays available.",
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
    allyChoice: ally
      ? Object.freeze({
          id: ally.id,
          kind: "ally",
          label: "field team",
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
      ? `${registration.title}. ${REGISTRATION_COMPARISON_HEADER}`
      : reliefOath && prompt.id === reliefOath.id && prompt.kind === "relief_oath"
        ? `${reliefOath.title}. ${
            offersStandardPacket
              ? STANDARD_PACKET_RELIEF_OATH_COMPARISON_HEADER
              : RELIEF_OATH_COMPARISON_HEADER
          }`
        : leadSource && prompt.id === leadSource.id && prompt.kind === "lead_source"
          ? `${leadSource.title}. ${LEAD_SOURCE_COMPARISON_HEADER}`
          : preparation && prompt.id === preparation.id && prompt.kind === "preparation"
            ? `${preparation.title}. ${PREPARATION_COMPARISON_HEADER}`
            : reliefAllocation &&
                prompt.id === reliefAllocation.id &&
                prompt.kind === "relief_allocation"
              ? `${reliefAllocation.title}. ${RELIEF_ALLOCATION_COMPARISON_HEADER}`
              : ally && prompt.id === ally.id && prompt.kind === "ally"
                ? `${ally.title}. ${ALLY_COMPARISON_HEADER}`
                : prompt.message;
  const purpose = offersStandardPacket
    ? "Purpose: bind duty and evidence or customize; every field plan stays open."
    : OPENING_DISPATCH_PURPOSE[prompt.kind];
  if (civicStageIndex >= 0) {
    const stage = plan.civicStages[civicStageIndex]!;
    const progress =
      civicStageIndex === 0
        ? `${plan.questTitle} Civic docket · role.`
        : offersStandardPacket
          ? `${plan.questTitle} Civic docket · matched duty + evidence.`
          : `${plan.questTitle} Civic docket · ${civicStageIndex + 1}/${plan.civicStages.length} — ${stage.label}.`;
    const planningContext =
      civicStageIndex === 0
        ? `Mission preview — ${plan.questCrisisPreview} Next, bind duty and evidence or customize.`
        : civicStageIndex === 1 && offersStandardPacket
          ? "Quick setup binds both; custom duty leaves evidence next."
          : civicStageIndex === 2
            ? "Hayden's Station launch board follows."
            : "Evidence follows.";
    return {
      ...prompt,
      message: `${progress} ${purpose} ${planningContext} ${displayMessage}`,
    };
  }
  if (allyChoice) {
    const progress = `${plan.questTitle} · optional ${allyChoice.label}.`;
    const missionCard = `Route costs and tactics remain on ${plan.questTitle}'s launch card.`;
    const planningContext = 'Choose "Leave with a Solo Field Team" to keep the one-rider launch.';
    return {
      ...prompt,
      message: `${progress} ${purpose} ${missionCard} ${planningContext} ${displayMessage}`,
    };
  }
  const choice = departureChoice!;
  const progress =
    choice.kind === "preparation"
      ? `${plan.questTitle} · optional ${choice.label}.`
      : `${plan.questTitle} · optional relief priority.`;
  const planningContext =
    choice.kind === "preparation"
      ? plan.allyContactName
        ? `${plan.allyContactName}'s field-team conversation is separate. ${plan.allyTimingSummary ?? ""}`
        : ""
      : plan.allyContactName
        ? `${plan.allyContactName}'s field-team conversation is separate; launching now keeps the solo route legal. ${plan.allyTimingSummary ?? ""}`
        : "";
  const missionCard = `Route costs and tactics remain on ${plan.questTitle}'s launch card.`;
  return {
    ...prompt,
    message: `${progress} ${purpose} ${missionCard} ${planningContext} ${displayMessage}`,
  };
}
