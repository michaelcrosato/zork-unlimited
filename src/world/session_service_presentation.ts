import type { CampaignServiceRule } from "./campaign_service_rules.js";
import {
  planOverworldSessionTownRest,
  planOverworldSessionTownResupply,
  resolveOverworldSessionTownServiceRules,
  type OverworldSessionTownServicePlanState,
} from "./session_service_lifecycle.js";
import {
  canRestAtOverworldTown,
  canResupplyAtOverworldTown,
  OVERWORLD_REST_UNAVAILABLE_MESSAGE,
  OVERWORLD_RESUPPLY_UNAVAILABLE_MESSAGE,
  type OverworldServiceAction,
  type OverworldServicePlan,
} from "./session_services.js";

export type OverworldServiceActionSource = "ordinary" | "campaign_override";

/**
 * Canonical current player choice for a town service. It is a read-only
 * projection of the same planners used by execution, including no-op results
 * and one-time campaign overrides.
 */
export type OverworldServiceActionPresentation = Readonly<{
  action: OverworldServiceAction;
  source: OverworldServiceActionSource;
  offerId: string | null;
  available: boolean;
  changed: boolean;
  minutes: number;
  suppliesBefore: number;
  suppliesAfter: number;
  fatigueBefore: number;
  fatigueAfter: number;
  message: string;
  blockedReason: string | null;
}>;

function unavailableServiceAction(
  action: OverworldServiceAction,
  state: Pick<OverworldSessionTownServicePlanState, "supplies" | "fatigue">,
  blockedReason: string,
): OverworldServiceActionPresentation {
  return {
    action,
    source: "ordinary",
    offerId: null,
    available: false,
    changed: false,
    minutes: 0,
    suppliesBefore: state.supplies,
    suppliesAfter: state.supplies,
    fatigueBefore: state.fatigue,
    fatigueAfter: state.fatigue,
    message: blockedReason,
    blockedReason,
  };
}

function plannedServiceAction(
  plan: OverworldServicePlan,
  rule: CampaignServiceRule | undefined,
): OverworldServiceActionPresentation {
  return {
    action: plan.action,
    source: rule ? "campaign_override" : "ordinary",
    offerId: rule?.id ?? null,
    available: true,
    changed: plan.changed,
    minutes: plan.minutes,
    suppliesBefore: plan.suppliesBefore,
    suppliesAfter: plan.suppliesAfter,
    fatigueBefore: plan.fatigueBefore,
    fatigueAfter: plan.fatigueAfter,
    message: plan.message,
    blockedReason: null,
  };
}

function ruleForAction(
  rules: readonly CampaignServiceRule[],
  action: OverworldServiceAction,
): CampaignServiceRule | undefined {
  const matches = rules.filter((rule) => rule.action === action);
  if (matches.length > 1) {
    throw new Error(`Multiple active campaign service rules resolve for action "${action}".`);
  }
  return matches[0];
}

/** Resupply stays first to preserve the human surface's established order. */
export function presentOverworldServiceActions(
  state: OverworldSessionTownServicePlanState,
): OverworldServiceActionPresentation[] {
  const rules = resolveOverworldSessionTownServiceRules(state);
  const resupplyRule = ruleForAction(rules, "resupply");
  const restRule = ruleForAction(rules, "rest");
  const resupply =
    resupplyRule || canResupplyAtOverworldTown(state.currentTown.services)
      ? plannedServiceAction(planOverworldSessionTownResupply(state), resupplyRule)
      : unavailableServiceAction("resupply", state, OVERWORLD_RESUPPLY_UNAVAILABLE_MESSAGE);
  const rest =
    restRule || canRestAtOverworldTown(state.currentTown.services)
      ? plannedServiceAction(planOverworldSessionTownRest(state), restRule)
      : unavailableServiceAction("rest", state, OVERWORLD_REST_UNAVAILABLE_MESSAGE);
  return [resupply, rest];
}

export function cloneOverworldServiceActionPresentation(
  action: OverworldServiceActionPresentation,
): OverworldServiceActionPresentation {
  return { ...action };
}
