import type { OverworldQuestCompletionOutcome } from "../world/session_quests.js";
import type { Session } from "./sessions.js";

export type OverworldQuestCompletionSync = {
  questId: string;
  outcome: OverworldQuestCompletionOutcome;
};

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
