import type { OverworldNode } from "./overworld.js";
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
  currentTown: Pick<OverworldNode, "name" | "services">;
  supplies: number;
  fatigue: number;
};

export type OverworldSessionTownServiceState = OverworldSessionTownServicePlanState &
  OverworldActionJournalState;

function overworldSessionTownServiceState(
  state: OverworldSessionTownServicePlanState,
): OverworldServiceState {
  return {
    townName: state.currentTown.name,
    services: state.currentTown.services,
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
