import type { JourneyStoryChoicePrompt } from "./journey_contract.js";
import type { OverworldManifest } from "./overworld.js";

type OpeningDispatchStage = Readonly<{
  id: string;
  kind: NonNullable<JourneyStoryChoicePrompt["kind"]>;
  label: string;
}>;

type OpeningDispatchPlan = Readonly<{
  questTitle: string;
  questDiscovery: string;
  launchBriefing: string | null;
  optionalFollowup: string | null;
  stages: readonly OpeningDispatchStage[];
}>;

/**
 * Resolve the authored five-card Albany dispatch without adding a second
 * content source. The briefing deliberately reuses the quest's discovery copy
 * so the player learns the actual crisis before making a permanent choice.
 */
function openingDispatchPlan(world: OverworldManifest): OpeningDispatchPlan | null {
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
  const ally = world.opening_ally;
  return {
    questTitle: quest.title,
    questDiscovery: quest.discovery,
    launchBriefing: quest.launch
      ? quest.launch.options
          .map((option) => {
            const supplies = `${option.terms.supplies} ${
              option.terms.supplies === 1 ? "supply" : "supplies"
            }`;
            return `${option.title} (${option.terms.minutes} min, ${supplies}, fatigue +${option.terms.fatigue}): ${option.summary}`;
          })
          .join(" Or: ")
      : null,
    optionalFollowup:
      ally?.target_quest === targetQuestId && ally.after_preparation === preparation.id
        ? `Optional field-team choice follows: ${listLabels(
            ally.options.map((option) => option.title),
          )}.`
        : null,
    stages: Object.freeze([
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
  const stageIndex = plan.stages.findIndex(
    (stage) => stage.id === prompt.id && stage.kind === prompt.kind,
  );
  if (stageIndex < 0) return prompt;
  const stage = plan.stages[stageIndex]!;
  const completed = plan.stages.slice(0, stageIndex).map((candidate) => candidate.label);
  const remaining = plan.stages.slice(stageIndex + 1).map((candidate) => candidate.label);
  const roadmap = plan.stages.map((candidate) => candidate.label).join(" → ");
  const progress = `${plan.questTitle} dispatch · ${stageIndex + 1}/${plan.stages.length} — ${stage.label}.`;
  const planningContext =
    stageIndex === 0
      ? `Mission preview — ${plan.questDiscovery} Before departure: ${roadmap}. Choose only your ${stage.label} now; four decisions stay open. Each changes field conditions or consequences; none locks your solution.`
      : `Chosen: ${listLabels(completed)}. Now choose: ${stage.label}. Still ahead: ${listLabels(remaining)}.${remaining.length === 0 && plan.optionalFollowup ? ` ${plan.optionalFollowup}` : ""}`;
  const missionCard =
    stageIndex >= 3
      ? `Mission — ${plan.questDiscovery}${plan.launchBriefing ? ` Route preview — ${plan.launchBriefing}` : ""}`
      : null;
  return {
    ...prompt,
    message: `${progress} ${missionCard ? `${missionCard} ` : ""}${planningContext} ${prompt.message}`,
  };
}
