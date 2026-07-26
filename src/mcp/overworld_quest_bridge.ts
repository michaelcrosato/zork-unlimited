import {
  assertAuthenticatedQuestStartPreparation,
  type OverworldJourneyQuestStartResult,
  type OverworldSession,
} from "../world/session.js";
import type { CampaignCharacterState } from "../world/campaign_character_state.js";
import type { OverworldQuestCompletionOutcome } from "../world/session_quests.js";
import {
  QUEST_DISPATCH_WINDOW_SCHEMA_VERSION,
  type QuestDispatchWindow,
} from "../world/quest_dispatch_window.js";
import type { Session } from "./sessions.js";
import { hashState } from "../core/hash.js";
import {
  EMBEDDED_LAUNCH_OVERLAY_RECEIPT_VERSION,
  WOLF_WINTER_DISPATCH_DELAY_FLAG,
  WOLF_WINTER_DISPATCH_ON_TIME_MAX_MINUTES,
  cloneEmbeddedLaunchOverlay,
  type EmbeddedLaunchOverlay,
} from "../core/embedded_launch_overlay_receipt.js";

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
  /**
   * Private, quest-local opening state derived from the accepted parent launch
   * plan. It is not character continuity or a durable overworld fact.
   */
  launchOverlay?: EmbeddedLaunchOverlay;
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

type QuestStartPlanWithDispatchWindow = {
  quest: { id: string };
  dispatchWindow: QuestDispatchWindow;
};

function embeddedLaunchOverlayForPlan(
  plan: QuestStartPlanWithDispatchWindow,
  overworldSessionId: string,
): EmbeddedLaunchOverlay | undefined {
  const dispatchWindow = plan.dispatchWindow;
  const ledgerMinutes = dispatchWindow.ledgerMinutes;
  // Current plans always carry the dispatch field. A missing or legacy-neutral
  // proof is deliberately neutral; only a complete, self-verifying delayed
  // receipt can change this child opening.
  if (dispatchWindow.status !== "delayed") return undefined;
  if (
    dispatchWindow.schemaVersion !== QUEST_DISPATCH_WINDOW_SCHEMA_VERSION ||
    dispatchWindow.questId !== plan.quest.id ||
    typeof ledgerMinutes !== "number" ||
    !Number.isSafeInteger(ledgerMinutes) ||
    ledgerMinutes <= WOLF_WINTER_DISPATCH_ON_TIME_MAX_MINUTES ||
    dispatchWindow.receipt === undefined ||
    dispatchWindow.proofHash !==
      hashState({
        schemaVersion: dispatchWindow.schemaVersion,
        questId: dispatchWindow.questId,
        status: dispatchWindow.status,
        ledgerMinutes: dispatchWindow.ledgerMinutes,
        receipt: dispatchWindow.receipt,
      })
  ) {
    throw new Error("Quest dispatch window is incomplete or lacks current provenance.");
  }
  // This is a launch-local Wolf-Winter condition. Other quests retain their
  // authored fresh state even when the parent carries dispatch timing data.
  if (plan.quest.id !== "wolf_winter") return undefined;

  return cloneEmbeddedLaunchOverlay({
    receipt: {
      version: EMBEDDED_LAUNCH_OVERLAY_RECEIPT_VERSION,
      kind: "overworld_dispatch_opening",
      world_quest_id: "wolf_winter",
      overworld_session_id: overworldSessionId,
      dispatch_window_version: dispatchWindow.schemaVersion,
      status: "delayed",
      ledger_minutes: ledgerMinutes,
      provenance_hash: dispatchWindow.proofHash,
      applied_flag: WOLF_WINTER_DISPATCH_DELAY_FLAG,
    },
  });
}

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
  assertAuthenticatedQuestStartPreparation(args.session, plan);
  const launchOverlay = embeddedLaunchOverlayForPlan(plan, args.overworldSessionId);
  const rpgSession = args.startEmbeddedWorldQuest(
    rpgStartArgsForOverworldQuest(plan.quest.id, args.startOptions),
    {
      overworldSessionId: args.overworldSessionId,
      character: plan.characterAfter,
      ...(launchOverlay !== undefined ? { launchOverlay } : {}),
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
