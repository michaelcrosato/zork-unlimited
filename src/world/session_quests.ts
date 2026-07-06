import type { OverworldArea, OverworldNode, OverworldQuest } from "./overworld.js";
import { questView, type OverworldQuestView } from "./session_local_discovery.js";
import type { OverworldJournalEntry } from "./session_snapshot.js";

export type OverworldQuestCompletionOutcome = {
  endingId: string;
  endingTitle: string;
  death: boolean;
};

export type OverworldQuestStartState = {
  questId: string;
  questsById: ReadonlyMap<string, OverworldQuest>;
  areasById: ReadonlyMap<string, OverworldArea>;
  currentTownId: string;
  currentTownName: string;
  currentAreaId: string | null;
  discoveredQuestIds: ReadonlySet<string>;
  startedQuestIds: ReadonlySet<string>;
};

export type OverworldQuestCompletionState = {
  questId: string;
  outcome: OverworldQuestCompletionOutcome;
  questsById: ReadonlyMap<string, OverworldQuest>;
  nodesById: ReadonlyMap<string, OverworldNode>;
  startedQuestIds: ReadonlySet<string>;
};

export type OverworldQuestStartPlan = {
  minutes: number;
  quest: OverworldQuestView;
  entryDraft: Omit<OverworldJournalEntry, "recordedAt">;
};

export type OverworldQuestCompletionPlan = {
  minutes: number;
  quest: OverworldQuestView;
  endingId: string;
  endingTitle: string;
  entryDraft: Omit<OverworldJournalEntry, "recordedAt">;
};

export type OverworldQuestStartApplicationState = {
  startedQuestIds: Set<string>;
};

export type OverworldQuestCompletionApplicationState = {
  completedQuestIds: Set<string>;
};

export type OverworldAppliedQuestLifecycle = {
  questId: string;
};

export type OverworldQuestCompletionResult = {
  minutes: number;
  alreadyKnown: boolean;
  quest: OverworldQuestView;
  endingId: string;
  endingTitle: string;
  entry: OverworldJournalEntry;
};

function questAreaName(
  quest: OverworldQuest,
  areasById: ReadonlyMap<string, OverworldArea>,
): string {
  return areasById.get(quest.area)?.name ?? quest.area;
}

export function planOverworldQuestStart(state: OverworldQuestStartState): OverworldQuestStartPlan {
  const quest = state.questsById.get(state.questId);
  if (!quest || quest.home !== state.currentTownId) {
    throw new Error("That quest lead is not in this town.");
  }
  if (!state.discoveredQuestIds.has(quest.id)) {
    throw new Error("Discover that local quest lead before starting it.");
  }
  if (state.startedQuestIds.has(quest.id)) {
    throw new Error(`Quest ${quest.title} has already been started from this overworld session.`);
  }
  if (state.currentAreaId !== quest.area) {
    throw new Error(
      `Move to ${questAreaName(quest, state.areasById)} before starting ${quest.title}.`,
    );
  }
  return {
    minutes: 0,
    quest: questView(quest),
    entryDraft: {
      id: `quest:${quest.id}`,
      kind: "quest",
      town: state.currentTownName,
      title: `Started ${quest.title}`,
      text: `You turn the local lead "${quest.discovery}" into an active quest.`,
    },
  };
}

export function planOverworldQuestCompletion(
  state: OverworldQuestCompletionState,
): OverworldQuestCompletionPlan {
  const quest = state.questsById.get(state.questId);
  if (!quest) throw new Error(`Unknown overworld quest "${state.questId}".`);
  if (!state.startedQuestIds.has(quest.id)) {
    throw new Error("Start that local quest lead before completing it.");
  }
  if (state.outcome.death) {
    throw new Error("A death ending does not complete the overworld quest.");
  }
  return {
    minutes: 0,
    quest: questView(quest),
    endingId: state.outcome.endingId,
    endingTitle: state.outcome.endingTitle,
    entryDraft: {
      id: `quest_done:${quest.id}`,
      kind: "quest_done",
      town: state.nodesById.get(quest.home)?.name ?? quest.home,
      title: `Completed ${quest.title}`,
      text: `The quest closed at ${state.outcome.endingTitle}.`,
    },
  };
}

export function applyOverworldQuestStart(
  state: OverworldQuestStartApplicationState,
  plan: OverworldQuestStartPlan,
): OverworldAppliedQuestLifecycle {
  state.startedQuestIds.add(plan.quest.id);
  return { questId: plan.quest.id };
}

export function applyOverworldQuestCompletion(
  state: OverworldQuestCompletionApplicationState,
  plan: OverworldQuestCompletionPlan,
): OverworldAppliedQuestLifecycle {
  state.completedQuestIds.add(plan.quest.id);
  return { questId: plan.quest.id };
}
