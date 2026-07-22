import {
  resolveActiveCampaignServiceRules,
  type CampaignServiceRule,
} from "./campaign_service_rules.js";
import type { OverworldNode } from "./overworld.js";
import type { CampaignCharacterState } from "./campaign_character_state.js";
import type { CampaignStoryChoiceRef } from "./campaign_story_choices.js";
import type { CampaignServiceLocalJobOption } from "./campaign_service_rules.js";
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
  completedLocalJobOptions?: readonly CampaignServiceLocalJobOption[];
  campaignCharacter?: CampaignCharacterState;
  regionRenown?: ReadonlyMap<string, number>;
  supplies: number;
  fatigue: number;
};

export type OverworldSessionTownServiceState = OverworldSessionTownServicePlanState &
  OverworldActionJournalState;

export function resolveOverworldSessionTownServiceRules(
  state: OverworldSessionTownServicePlanState,
): CampaignServiceRule[] {
  return state.currentAreaId === undefined || state.campaignServiceRules === undefined
    ? []
    : resolveActiveCampaignServiceRules({
        rules: state.campaignServiceRules,
        currentTownId: state.currentTown.id,
        currentAreaId: state.currentAreaId,
        worldFactIds: state.campaignWorldFactIds ?? [],
        selectedStoryChoices: state.campaignStoryChoiceRefs ?? [],
        consumedRuleIds: state.consumedCampaignServiceRuleIds ?? [],
        ...(state.completedLocalJobOptions
          ? { completedLocalJobOptions: state.completedLocalJobOptions }
          : {}),
        ...(state.campaignCharacter ? { character: state.campaignCharacter } : {}),
        ...(state.regionRenown ? { regionRenown: state.regionRenown } : {}),
      });
}

function overworldSessionTownServiceState(
  state: OverworldSessionTownServicePlanState,
): OverworldServiceState {
  return {
    townName: state.currentTown.name,
    services: state.currentTown.services,
    activeCampaignServiceRules: resolveOverworldSessionTownServiceRules(state),
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
