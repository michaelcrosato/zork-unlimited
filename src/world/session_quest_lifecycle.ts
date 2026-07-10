import type { OverworldArea, OverworldNode, OverworldQuest } from "./overworld.js";
import {
  recordOverworldSessionAction,
  type OverworldSessionActionApplication,
} from "./session_action_application.js";
import type { OverworldActionJournalState } from "./session_action_recording.js";
import type { OverworldQuestView } from "./session_local_discovery.js";
import {
  applyOverworldQuestCompletion,
  applyOverworldQuestStart,
  planOverworldQuestCompletion,
  planOverworldQuestStart,
  type OverworldQuestCompletionOutcome,
  type OverworldQuestCompletionPlan,
  type OverworldQuestCompletionResult,
  type OverworldQuestStartPlan,
} from "./session_quests.js";

export type OverworldSessionQuestStartPlanState = {
  questId: string;
  questsById: ReadonlyMap<string, OverworldQuest>;
  areasById: ReadonlyMap<string, OverworldArea>;
  currentTownId: string;
  currentTownName: string;
  currentAreaId: string | null;
  discoveredQuestIds: ReadonlySet<string>;
  startedQuestIds: ReadonlySet<string>;
};

export type OverworldSessionQuestCompletionPlanState = {
  questId: string;
  outcome: OverworldQuestCompletionOutcome;
  questsById: ReadonlyMap<string, OverworldQuest>;
  areasById: ReadonlyMap<string, OverworldArea>;
  nodesById: ReadonlyMap<string, OverworldNode>;
  startedQuestIds: ReadonlySet<string>;
};

export type MutableOverworldSessionQuestStartState = OverworldActionJournalState & {
  startedQuestIds: Set<string>;
};

export type MutableOverworldSessionQuestCompletionState = OverworldActionJournalState & {
  completedQuestIds: Set<string>;
  regionRenown: Map<string, number>;
};

export type OverworldSessionQuestStartState = OverworldSessionQuestStartPlanState &
  MutableOverworldSessionQuestStartState;

export type OverworldSessionQuestCompletionState = OverworldSessionQuestCompletionPlanState &
  MutableOverworldSessionQuestCompletionState;

export type OverworldAppliedSessionQuestStart = OverworldSessionActionApplication & {
  quest: OverworldQuestView;
};

export type OverworldAppliedSessionQuestCompletion = {
  result: OverworldQuestCompletionResult;
  minutesAfter: number;
  stateChanged: boolean;
};

export function planOverworldSessionQuestStart(
  state: OverworldSessionQuestStartPlanState,
): OverworldQuestStartPlan {
  return planOverworldQuestStart(state);
}

export function planOverworldSessionQuestCompletion(
  state: OverworldSessionQuestCompletionPlanState,
): OverworldQuestCompletionPlan {
  return planOverworldQuestCompletion(state);
}

export function previewOverworldSessionQuestStart(
  state: OverworldSessionQuestStartPlanState,
): OverworldQuestView {
  return planOverworldSessionQuestStart(state).quest;
}

export function applyOverworldSessionQuestStart(
  state: MutableOverworldSessionQuestStartState,
  plan: OverworldQuestStartPlan,
): OverworldAppliedSessionQuestStart {
  const applied = recordOverworldSessionAction(state, plan.entryDraft, plan.minutes);
  if (!applied.result.alreadyKnown) {
    applyOverworldQuestStart({ startedQuestIds: state.startedQuestIds }, plan);
  }
  return {
    ...applied,
    quest: plan.quest,
  };
}

export function applyOverworldSessionQuestStartFromState(
  state: OverworldSessionQuestStartState,
): OverworldAppliedSessionQuestStart {
  return applyOverworldSessionQuestStart(state, planOverworldSessionQuestStart(state));
}

export function applyOverworldSessionQuestCompletion(
  state: MutableOverworldSessionQuestCompletionState,
  plan: OverworldQuestCompletionPlan,
): OverworldAppliedSessionQuestCompletion {
  const applied = recordOverworldSessionAction(state, plan.entryDraft, plan.minutes);
  // Renown is awarded exactly once: a repeat completion (alreadyKnown) reports
  // zero gained and the standing total, never a double award.
  const award = applied.result.alreadyKnown
    ? {
        renownRegion: plan.renownRegion,
        renownGained: 0,
        renownAfter: state.regionRenown.get(plan.renownRegion) ?? 0,
      }
    : applyOverworldQuestCompletion(
        { completedQuestIds: state.completedQuestIds, regionRenown: state.regionRenown },
        plan,
      );
  return {
    result: {
      minutes: applied.result.minutes,
      alreadyKnown: applied.result.alreadyKnown,
      quest: plan.quest,
      endingId: plan.endingId,
      endingTitle: plan.endingTitle,
      renownRegion: award.renownRegion,
      renownGained: award.renownGained,
      renownAfter: award.renownAfter,
      entry: applied.result.entry,
    },
    minutesAfter: applied.minutesAfter,
    stateChanged: applied.stateChanged,
  };
}

export function applyOverworldSessionQuestCompletionFromState(
  state: OverworldSessionQuestCompletionState,
): OverworldAppliedSessionQuestCompletion {
  return applyOverworldSessionQuestCompletion(state, planOverworldSessionQuestCompletion(state));
}
