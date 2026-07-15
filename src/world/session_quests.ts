import {
  overworldQuestCampaignEffectsForCharacter,
  overworldQuestCampaignExportForEnding,
  type OverworldArea,
  type OverworldNode,
  type OverworldQuest,
  type OverworldQuestCampaignExport,
} from "./overworld.js";
import {
  applyCampaignConsequences,
  deriveCampaignWorldFactIds,
  type CampaignConsequenceApplication,
  type CampaignConsequenceEffect,
} from "./campaign_consequences.js";
import {
  cloneCampaignCharacterState,
  type CampaignCharacterState,
} from "./campaign_character_state.js";
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
  character: CampaignCharacterState;
  questsById: ReadonlyMap<string, OverworldQuest>;
  areasById: ReadonlyMap<string, OverworldArea>;
  nodesById: ReadonlyMap<string, OverworldNode>;
  questOutcomeIds: ReadonlyMap<string, string>;
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
  characterAfter: CampaignCharacterState;
  worldFactIds: readonly string[];
  renownRegion: string;
  renown: number;
  entryDraft: Omit<OverworldJournalEntry, "recordedAt">;
};

export type OverworldQuestStartApplicationState = {
  startedQuestIds: Set<string>;
};

export type OverworldQuestCompletionApplicationState = {
  completedQuestIds: Set<string>;
  regionRenown: Map<string, number>;
};

export type OverworldAppliedQuestLifecycle = {
  questId: string;
};

export type OverworldAppliedQuestCompletion = OverworldAppliedQuestLifecycle & {
  renownRegion: string;
  renownGained: number;
  renownAfter: number;
};

export type OverworldQuestCompletionResult = {
  minutes: number;
  alreadyKnown: boolean;
  quest: OverworldQuestView;
  endingId: string;
  endingTitle: string;
  renownRegion: string;
  renownGained: number;
  renownAfter: number;
  entry: OverworldJournalEntry;
};

// Completing a quest is the marquee accomplishment of a region's opening
// experience: local jobs award their difficulty (1–5), exploration sites their
// danger (1–5), road assists 2 — so a completed quest must visibly TOP any
// single errand or the reward hierarchy reads inverted (S1 from the 2026-07-07
// overworld blind run: a 50/60 quest ending awarded nothing while a ledger run
// paid 3).
export const QUEST_COMPLETION_RENOWN = 8;

export function questCompletionMinutes(
  quest: OverworldQuest,
  areasById: ReadonlyMap<string, OverworldArea>,
): number {
  const localApproachMinutes = areasById.get(quest.area)?.travel_minutes ?? 30;
  return localApproachMinutes + QUEST_COMPLETION_RENOWN * 15;
}

/**
 * A non-empty catalog is an opt-in strict boundary. Legacy quests without one
 * keep their existing ending behavior until their exports are authored.
 */
export function questCampaignExportForEnding(
  quest: OverworldQuest,
  endingId: string,
): OverworldQuestCampaignExport | null {
  const campaignExport = overworldQuestCampaignExportForEnding(quest, endingId);
  if (quest.campaign_exports !== undefined && campaignExport === null) {
    throw new Error(
      `Overworld quest "${quest.id}" has no declared campaign export for ending "${endingId}".`,
    );
  }
  return campaignExport;
}

export function questCampaignEffectGroupsForOutcomes(
  questsById: ReadonlyMap<string, OverworldQuest>,
  questOutcomeIds: ReadonlyMap<string, string>,
): readonly (readonly CampaignConsequenceEffect[])[] {
  return [...questOutcomeIds]
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .flatMap(([questId, endingId]) => {
      const quest = questsById.get(questId);
      if (!quest) throw new Error(`Unknown overworld quest "${questId}".`);
      const campaignExport = questCampaignExportForEnding(quest, endingId);
      return campaignExport ? [campaignExport.effects] : [];
    });
}

/** Replay trusted exports in completion order so party removal and promise resolution stay causal. */
export function replayQuestCampaignConsequences(args: {
  character: CampaignCharacterState;
  questsById: ReadonlyMap<string, OverworldQuest>;
  questOutcomeIds: ReadonlyMap<string, string>;
  questOutcomeOrder?: readonly string[];
}): CampaignConsequenceApplication {
  const order = args.questOutcomeOrder ?? [...args.questOutcomeIds.keys()].sort();
  if (
    new Set(order).size !== order.length ||
    order.length !== args.questOutcomeIds.size ||
    order.some((questId) => !args.questOutcomeIds.has(questId))
  ) {
    throw new Error("Quest consequence replay order must name every completed quest exactly once.");
  }
  const effectGroups: CampaignConsequenceEffect[][] = [];
  let characterAfter = cloneCampaignCharacterState(args.character);
  for (const questId of order) {
    const quest = args.questsById.get(questId);
    if (!quest) throw new Error(`Unknown overworld quest "${questId}".`);
    const endingId = args.questOutcomeIds.get(questId)!;
    const campaignExport = questCampaignExportForEnding(quest, endingId);
    if (!campaignExport) continue;
    const effects = [...overworldQuestCampaignEffectsForCharacter(campaignExport, characterAfter)];
    effectGroups.push(effects);
    characterAfter = applyCampaignConsequences({
      character: characterAfter,
      effects,
    }).characterAfter;
  }
  return {
    characterAfter,
    worldFactIds: deriveCampaignWorldFactIds(effectGroups),
  };
}

export function questCompletionJournalEntryDraft(args: {
  quest: OverworldQuest;
  endingTitle: string;
  minutes: number;
  townName: string;
}): Omit<OverworldJournalEntry, "recordedAt"> {
  return {
    id: `quest_done:${args.quest.id}`,
    kind: "quest_done",
    town: args.townName,
    title: `Completed ${args.quest.title}`,
    text: `The quest closed at ${args.endingTitle} after ${args.minutes} minutes of local work.`,
  };
}

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
  const campaignExport = questCampaignExportForEnding(quest, state.outcome.endingId);
  if (campaignExport !== null && campaignExport.ending_title !== state.outcome.endingTitle) {
    throw new Error(
      `Overworld quest "${quest.id}" ending "${state.outcome.endingId}" has title ` +
        `"${state.outcome.endingTitle}", expected canonical title ` +
        `"${campaignExport.ending_title}".`,
    );
  }
  const recordedEndingId = state.questOutcomeIds.get(quest.id);
  if (recordedEndingId !== undefined && recordedEndingId !== state.outcome.endingId) {
    throw new Error(
      `Overworld quest "${quest.id}" already completed with ending "${recordedEndingId}"; ` +
        `cannot replace it with "${state.outcome.endingId}".`,
    );
  }
  const home = state.nodesById.get(quest.home);
  const minutes = questCompletionMinutes(quest, state.areasById);
  const endingTitle = campaignExport?.ending_title ?? state.outcome.endingTitle;
  const consequence = applyCampaignConsequences({
    character: state.character,
    effects: campaignExport
      ? overworldQuestCampaignEffectsForCharacter(campaignExport, state.character)
      : [],
  });
  return {
    minutes,
    quest: questView(quest),
    endingId: state.outcome.endingId,
    endingTitle,
    characterAfter: consequence.characterAfter,
    worldFactIds: consequence.worldFactIds,
    renownRegion: home?.region ?? quest.home,
    renown: QUEST_COMPLETION_RENOWN,
    entryDraft: questCompletionJournalEntryDraft({
      quest,
      endingTitle,
      minutes,
      townName: state.nodesById.get(quest.home)?.name ?? quest.home,
    }),
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
): OverworldAppliedQuestCompletion {
  state.completedQuestIds.add(plan.quest.id);
  state.regionRenown.set(
    plan.renownRegion,
    (state.regionRenown.get(plan.renownRegion) ?? 0) + plan.renown,
  );
  return {
    questId: plan.quest.id,
    renownRegion: plan.renownRegion,
    renownGained: plan.renown,
    renownAfter: state.regionRenown.get(plan.renownRegion) ?? 0,
  };
}
