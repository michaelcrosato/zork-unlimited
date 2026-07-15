import type { OverworldJourneyQuestStartResult, OverworldSession } from "../world/session.js";
import type { CampaignCharacterState } from "../world/campaign_character_state.js";
import type { OverworldQuestCompletionOutcome } from "../world/session_quests.js";
import type { Session } from "./sessions.js";

export type OverworldQuestRpgStartOptions = {
  seed?: number;
  hide_graph?: boolean;
  compact_actions?: boolean;
  compact_observation?: boolean;
  include_actions?: boolean;
};

export type OverworldQuestRpgStartArgs = {
  world_quest_id: string;
} & OverworldQuestRpgStartOptions;

/**
 * Closure-private authority for an embedded launch. It is deliberately a
 * separate parameter from the public RPG start arguments so no caller can
 * smuggle a parent binding or a forged character through start_world_quest.
 */
export type EmbeddedOverworldQuestStartContext = {
  overworldSessionId: string;
  character: CampaignCharacterState;
};

export type OverworldStartedRpgSession = {
  session_id: string;
};

export type OverworldQuestStartSync<Payload extends OverworldStartedRpgSession> = {
  quest: OverworldJourneyQuestStartResult;
  rpgSession: Payload;
};

export type OverworldQuestCompletionSync = {
  questId: string;
  outcome: OverworldQuestCompletionOutcome;
};

function rpgStartArgsForOverworldQuest(
  questId: string,
  options: OverworldQuestRpgStartOptions,
): OverworldQuestRpgStartArgs {
  return {
    world_quest_id: questId,
    ...(options.seed !== undefined ? { seed: options.seed } : {}),
    ...(options.hide_graph ? { hide_graph: true } : {}),
    ...(options.compact_actions !== undefined ? { compact_actions: options.compact_actions } : {}),
    ...(options.compact_observation !== undefined
      ? { compact_observation: options.compact_observation }
      : {}),
    ...(options.include_actions !== undefined ? { include_actions: options.include_actions } : {}),
  };
}

export function startOverworldQuestThroughRpg<Payload extends OverworldStartedRpgSession>(args: {
  session: OverworldSession;
  overworldSessionId: string;
  questId: string;
  approachId?: string;
  startOptions: OverworldQuestRpgStartOptions;
  startEmbeddedWorldQuest: (
    startArgs: OverworldQuestRpgStartArgs,
    context: EmbeddedOverworldQuestStartContext,
  ) => Payload;
}): OverworldQuestStartSync<Payload> {
  const plan = args.session.prepareQuestStart(args.questId, args.approachId);
  const rpgSession = args.startEmbeddedWorldQuest(
    rpgStartArgsForOverworldQuest(plan.quest.id, args.startOptions),
    {
      overworldSessionId: args.overworldSessionId,
      character: plan.characterAfter,
    },
  );
  const startedQuest = args.session.commitQuestStart(plan);
  return { quest: startedQuest, rpgSession };
}

export function overworldQuestCompletionFromRpgSession(
  rpgSession: Session,
  overworldSessionId: string,
): OverworldQuestCompletionSync {
  if (!rpgSession.worldQuestId) {
    throw new Error("Only shipped world quest RPG sessions can complete overworld quests.");
  }
  if (rpgSession.overworldSessionId !== overworldSessionId) {
    throw new Error("RPG quest session was not started from this overworld session.");
  }
  if (!rpgSession.state.ended || !rpgSession.state.endingId) {
    throw new Error("RPG quest session has not ended yet.");
  }
  const ending = rpgSession.index.pack.endings.find(
    (candidate) => candidate.id === rpgSession.state.endingId,
  );
  if (!ending) {
    throw new Error(`RPG quest ended at unknown ending "${rpgSession.state.endingId}".`);
  }
  return {
    questId: rpgSession.worldQuestId,
    outcome: {
      endingId: ending.id,
      endingTitle: ending.title,
      death: ending.death,
    },
  };
}
