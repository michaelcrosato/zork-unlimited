import {
  recordOverworldRepeatableEntry,
  type OverworldActionJournalState,
} from "./session_action_recording.js";
import type { CampaignServiceAction, CampaignServiceRule } from "./campaign_service_rules.js";
import type { OverworldJournalEntry } from "./session_snapshot.js";
import { OVERWORLD_MAX_SUPPLIES as MAX_SUPPLIES } from "./travel_mechanics.js";

export type OverworldServiceAction = CampaignServiceAction;

export type OverworldServiceResult = {
  action: OverworldServiceAction;
  minutes: number;
  changed: boolean;
  suppliesBefore: number;
  suppliesAfter: number;
  fatigueBefore: number;
  fatigueAfter: number;
  message: string;
  entry: OverworldJournalEntry | null;
};

export type OverworldServiceJournalEntryDraft = Omit<OverworldJournalEntry, "recordedAt"> & {
  serviceRuleId?: string;
  serviceAreaId?: string;
};

export type OverworldServicePlan = Omit<OverworldServiceResult, "entry"> & {
  entryDraft: OverworldServiceJournalEntryDraft | null;
};

export type OverworldAppliedServicePlan = OverworldServiceResult & {
  minutesAfter: number;
  stateChanged: boolean;
};

export type OverworldServiceState = {
  townName: string;
  services: readonly string[];
  activeCampaignServiceRules?: readonly CampaignServiceRule[];
  supplies: number;
  fatigue: number;
};

export const OVERWORLD_REST_UNAVAILABLE_MESSAGE = "There is no inn or healer here to rest safely.";
export const OVERWORLD_RESUPPLY_UNAVAILABLE_MESSAGE =
  "There is no market, inn, or stable here to resupply.";

function campaignServiceRule(
  state: OverworldServiceState,
  action: OverworldServiceAction,
): CampaignServiceRule | null {
  const rules = (state.activeCampaignServiceRules ?? []).filter((rule) => rule.action === action);
  if (rules.length > 1) {
    throw new Error(`Multiple active campaign service rules resolve for action "${action}".`);
  }
  return rules[0] ?? null;
}

function authoredServiceText(summary: string, consequence: string): string {
  return `${summary.trim()} ${consequence}`;
}

export type CampaignServiceJournalCopy = Readonly<{
  title: string;
  text: string;
}>;

export function campaignServiceJourneyActionId(
  ruleId: string,
  action: CampaignServiceAction,
): string {
  return `campaign_service:${ruleId}:${action}`;
}

/** Canonical player-facing copy shared by live planning and snapshot replay. */
export function campaignServiceJournalCopy(
  rule: CampaignServiceRule,
  resources: Pick<OverworldServiceState, "supplies" | "fatigue">,
): CampaignServiceJournalCopy {
  const consequence =
    rule.action === "rest"
      ? `The service takes ${rule.minutes} minutes; fatigue falls from ${resources.fatigue} to 0.`
      : `The service takes ${rule.minutes} minutes; supplies rise from ${resources.supplies} to ${MAX_SUPPLIES}.`;
  return {
    title: rule.title,
    text: authoredServiceText(rule.summary, consequence),
  };
}

export function canRestAtOverworldTown(services: readonly string[]): boolean {
  return services.includes("inn") || services.includes("healer");
}

export function canResupplyAtOverworldTown(services: readonly string[]): boolean {
  return services.includes("market") || services.includes("inn") || services.includes("stable");
}

export function applyOverworldServicePlan(
  state: OverworldActionJournalState,
  plan: OverworldServicePlan,
): OverworldAppliedServicePlan {
  const { entryDraft, ...result } = plan;
  if (!result.changed) {
    return {
      ...result,
      entry: null,
      minutesAfter: state.minutes,
      stateChanged: false,
    };
  }
  if (!entryDraft) {
    throw new Error("Changed overworld service plan is missing a journal entry.");
  }
  const recorded = recordOverworldRepeatableEntry(state, entryDraft, plan.minutes);
  return {
    ...result,
    message: recorded.entry.text,
    entry: recorded.entry,
    minutesAfter: recorded.minutesAfter,
    stateChanged: true,
  };
}

export function planOverworldTownRest(state: OverworldServiceState): OverworldServicePlan {
  const rule = campaignServiceRule(state, "rest");
  if (!rule && !canRestAtOverworldTown(state.services)) {
    throw new Error(OVERWORLD_REST_UNAVAILABLE_MESSAGE);
  }
  if (state.fatigue === 0) {
    return {
      action: "rest",
      minutes: 0,
      changed: false,
      suppliesBefore: state.supplies,
      suppliesAfter: state.supplies,
      fatigueBefore: state.fatigue,
      fatigueAfter: state.fatigue,
      message: "You are already rested.",
      entryDraft: null,
    };
  }

  const minutes = rule?.minutes ?? Math.max(180, Math.ceil(state.fatigue / 20) * 60);
  const ordinaryText = `You spend ${minutes} minutes recovering at a safe local service. Fatigue falls from ${state.fatigue} to 0.`;
  const authoredCopy = rule ? campaignServiceJournalCopy(rule, state) : null;
  const text = authoredCopy?.text ?? ordinaryText;
  return {
    action: "rest",
    minutes,
    changed: true,
    suppliesBefore: state.supplies,
    suppliesAfter: state.supplies,
    fatigueBefore: state.fatigue,
    fatigueAfter: 0,
    message: text,
    entryDraft: {
      id: "service:rest",
      kind: "service",
      town: state.townName,
      title: authoredCopy?.title ?? `Rested in ${state.townName}`,
      text,
      ...(rule ? { serviceRuleId: rule.id, serviceAreaId: rule.area } : {}),
    },
  };
}

export function planOverworldTownResupply(state: OverworldServiceState): OverworldServicePlan {
  const rule = campaignServiceRule(state, "resupply");
  if (!rule && !canResupplyAtOverworldTown(state.services)) {
    throw new Error(OVERWORLD_RESUPPLY_UNAVAILABLE_MESSAGE);
  }
  if (state.supplies >= MAX_SUPPLIES) {
    return {
      action: "resupply",
      minutes: 0,
      changed: false,
      suppliesBefore: state.supplies,
      suppliesAfter: state.supplies,
      fatigueBefore: state.fatigue,
      fatigueAfter: state.fatigue,
      message: "Your supplies are already full.",
      entryDraft: null,
    };
  }

  const minutes = rule?.minutes ?? 45;
  const ordinaryText = `You spend ${minutes} minutes buying food, lamp oil, and road gear. Supplies rise from ${state.supplies} to ${MAX_SUPPLIES}.`;
  const authoredCopy = rule ? campaignServiceJournalCopy(rule, state) : null;
  const text = authoredCopy?.text ?? ordinaryText;
  return {
    action: "resupply",
    minutes,
    changed: true,
    suppliesBefore: state.supplies,
    suppliesAfter: MAX_SUPPLIES,
    fatigueBefore: state.fatigue,
    fatigueAfter: state.fatigue,
    message: text,
    entryDraft: {
      id: "service:resupply",
      kind: "service",
      town: state.townName,
      title: authoredCopy?.title ?? `Resupplied in ${state.townName}`,
      text,
      ...(rule ? { serviceRuleId: rule.id, serviceAreaId: rule.area } : {}),
    },
  };
}
