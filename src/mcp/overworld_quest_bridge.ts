import type { OverworldQuestView, OverworldSession } from "../world/session.js";
import type { OverworldQuestCompletionOutcome } from "../world/session_quests.js";
import type { Session } from "./sessions.js";

export type OverworldQuestRpgStartOptions = {
  seed?: number;
  hide_graph?: boolean;
  compact_actions?: boolean;
  compact_observation?: boolean;
};

export type OverworldQuestRpgStartArgs = {
  world_quest_id: string;
  overworldSessionId: string;
} & OverworldQuestRpgStartOptions;

export type OverworldStartedRpgSession = {
  session_id: string;
};

export type OverworldQuestStartSync<Payload extends OverworldStartedRpgSession> = {
  quest: OverworldQuestView;
  rpgSession: Payload;
};

export type OverworldQuestCompletionSync = {
  questId: string;
  outcome: OverworldQuestCompletionOutcome;
};

function rpgStartArgsForOverworldQuest(
  questId: string,
  overworldSessionId: string,
  options: OverworldQuestRpgStartOptions,
): OverworldQuestRpgStartArgs {
  return {
    world_quest_id: questId,
    overworldSessionId,
    ...(options.seed !== undefined ? { seed: options.seed } : {}),
    ...(options.hide_graph ? { hide_graph: true } : {}),
    ...(options.compact_actions !== undefined ? { compact_actions: options.compact_actions } : {}),
    ...(options.compact_observation !== undefined
      ? { compact_observation: options.compact_observation }
      : {}),
  };
}

export function startOverworldQuestThroughRpg<Payload extends OverworldStartedRpgSession>(args: {
  session: OverworldSession;
  overworldSessionId: string;
  questId: string;
  startOptions: OverworldQuestRpgStartOptions;
  startWorldQuest: (startArgs: OverworldQuestRpgStartArgs) => Payload;
}): OverworldQuestStartSync<Payload> {
  const quest = args.session.previewQuestStart(args.questId);
  const rpgSession = args.startWorldQuest(
    rpgStartArgsForOverworldQuest(quest.id, args.overworldSessionId, args.startOptions),
  );
  const startedQuest = args.session.startQuest(quest.id);
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
