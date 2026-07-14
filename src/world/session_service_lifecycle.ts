import {
  resolveActiveCampaignServiceRules,
  type CampaignServiceRule,
} from "./campaign_service_rules.js";
import type { OverworldNode } from "./overworld.js";
import type { CampaignStoryChoiceRef } from "./campaign_story_choices.js";
import type { OverworldActionJournalState } from "./session_action_recording.js";
import {
  applyOverworldSessionServicePlan,
  type OverworldSessionServiceApplication,
} from "./session_action_application.js";
import {
  planOverworldTownRest,
  planOverworldTownResupply,
  type OverworldServicePlan,
  type OverworldServiceResult,
  type OverworldServiceState,
} from "./session_services.js";

export type { OverworldServicePlan, OverworldServiceResult, OverworldSessionServiceApplication };

export type OverworldSessionTownServicePlanState = {
  currentTown: Pick<OverworldNode, "id" | "name" | "services">;
  currentAreaId?: string;
  campaignServiceRules?: readonly CampaignServiceRule[];
  campaignWorldFactIds?: readonly string[] | ReadonlySet<string>;
  campaignStoryChoiceRefs?: readonly CampaignStoryChoiceRef[];
  consumedCampaignServiceRuleIds?: readonly string[] | ReadonlySet<string>;
  supplies: number;
  fatigue: number;
};

export type OverworldSessionTownServiceState = OverworldSessionTownServicePlanState &
  OverworldActionJournalState;

function overworldSessionTownServiceState(
  state: OverworldSessionTownServicePlanState,
): OverworldServiceState {
  const activeCampaignServiceRules: CampaignServiceRule[] =
    state.currentAreaId === undefined || state.campaignServiceRules === undefined
      ? []
      : resolveActiveCampaignServiceRules({
          rules: state.campaignServiceRules,
          currentTownId: state.currentTown.id,
          currentAreaId: state.currentAreaId,
          worldFactIds: state.campaignWorldFactIds ?? [],
          selectedStoryChoices: state.campaignStoryChoiceRefs ?? [],
          consumedRuleIds: state.consumedCampaignServiceRuleIds ?? [],
        });
  return {
    townName: state.currentTown.name,
    services: state.currentTown.services,
    activeCampaignServiceRules,
    supplies: state.supplies,
    fatigue: state.fatigue,
  };
}

export function planOverworldSessionTownRest(
  state: OverworldSessionTownServicePlanState,
): OverworldServicePlan {
  return planOverworldTownRest(overworldSessionTownServiceState(state));
}

export function planOverworldSessionTownResupply(
  state: OverworldSessionTownServicePlanState,
): OverworldServicePlan {
  return planOverworldTownResupply(overworldSessionTownServiceState(state));
}

export function applyOverworldSessionTownServicePlan(
  state: OverworldActionJournalState,
  plan: OverworldServicePlan,
): OverworldSessionServiceApplication {
  return applyOverworldSessionServicePlan(state, plan);
}

export function applyOverworldSessionTownRestFromState(
  state: OverworldSessionTownServiceState,
): OverworldSessionServiceApplication {
  return applyOverworldSessionTownServicePlan(state, planOverworldSessionTownRest(state));
}

export function applyOverworldSessionTownResupplyFromState(
  state: OverworldSessionTownServiceState,
): OverworldSessionServiceApplication {
  return applyOverworldSessionTownServicePlan(state, planOverworldSessionTownResupply(state));
}
