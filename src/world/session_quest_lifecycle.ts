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
  nodesById: ReadonlyMap<string, OverworldNode>;
  startedQuestIds: ReadonlySet<string>;
};

export type MutableOverworldSessionQuestStartState = OverworldActionJournalState & {
  startedQuestIds: Set<string>;
};

export type MutableOverworldSessionQuestCompletionState = OverworldActionJournalState & {
  completedQuestIds: Set<string>;
};

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

export function applyOverworldSessionQuestCompletion(
  state: MutableOverworldSessionQuestCompletionState,
  plan: OverworldQuestCompletionPlan,
): OverworldAppliedSessionQuestCompletion {
  const applied = recordOverworldSessionAction(state, plan.entryDraft, plan.minutes);
  if (!applied.result.alreadyKnown) {
    applyOverworldQuestCompletion({ completedQuestIds: state.completedQuestIds }, plan);
  }
  return {
    result: {
      minutes: applied.result.minutes,
      alreadyKnown: applied.result.alreadyKnown,
      quest: plan.quest,
      endingId: plan.endingId,
      endingTitle: plan.endingTitle,
      entry: applied.result.entry,
    },
    minutesAfter: applied.minutesAfter,
    stateChanged: applied.stateChanged,
  };
}
