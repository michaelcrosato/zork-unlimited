import type { RpgActionOption } from "../rpg/legal_actions.js";
import { activeDialogue } from "../rpg/model.js";
import { rpgRoomTitle, type RpgMcpSessionRuntime } from "./rpg_session_runtime.js";
import type { SessionStore } from "./sessions.js";
import {
  publicRpgStateHash,
  rpgStateHashMatches,
  rpgStateHashRejection,
  type RpgStateHashRejection,
} from "./rpg_state_guards.js";
import {
  rpgStepEventVersion,
  rpgStepEvents,
  type RpgEventOptions,
  type RpgStepEvents,
  type RpgStepEventVersion,
} from "./transcript_projection.js";
import {
  rpgObservationNeedsActions,
  rpgViewField,
  type RpgViewField,
  type RpgViewOptions,
} from "./rpg_view_projection.js";
import {
  compactMcpActionLabel,
  compactMcpTranscriptActionId,
  MCP_TRANSCRIPT_ACTION_ID_CHAR_LIMIT,
} from "./action_labels.js";

export const REJECTED_ACTION_ID_TRANSCRIPT_LIMIT = MCP_TRANSCRIPT_ACTION_ID_CHAR_LIMIT;

export type RpgStepActionArgs = {
  session_id: string;
  action_id: string;
  expected_state_hash?: string;
  hide_graph?: boolean;
} & RpgViewOptions &
  RpgEventOptions;

type RpgStepActionBase<Args extends RpgViewOptions & RpgEventOptions> = {
  events: RpgStepEvents<Args>;
  state_hash: string;
} & RpgStepEventVersion<Args> &
  RpgViewField<Args>;

type RpgStepResponseOptions = RpgViewOptions & RpgEventOptions & { expected_state_hash?: string };

export type RpgStepActionResponse<Args extends RpgStepResponseOptions> =
  | ({ ok: true } & RpgStepActionBase<Args>)
  | ({ ok: false; rejection_reason: string } & RpgStepActionBase<Args>)
  | (Args extends { expected_state_hash: string } ? RpgStateHashRejection : never);

function actionOptionForId(
  actions: readonly RpgActionOption[],
  id: string,
): RpgActionOption | null {
  return actions.find((action) => action.id === id) ?? null;
}

function obsLocation(obs: { room: string }): string {
  return obs.room;
}

export function runRpgStepAction<Args extends RpgStepActionArgs>(
  deps: {
    sessions: SessionStore;
    rpgRuntime: RpgMcpSessionRuntime;
  },
  args: Args,
): RpgStepActionResponse<Args> {
  const { sessions, rpgRuntime } = deps;
  const s = sessions.get(args.session_id);
  const currentStateHash = s.stateHash;
  if (
    args.expected_state_hash !== undefined &&
    !rpgStateHashMatches(args.expected_state_hash, currentStateHash)
  ) {
    return rpgStateHashRejection(currentStateHash) as RpgStepActionResponse<Args>;
  }
  const actionOptions = rpgRuntime.legalActionsFor(s);
  const actionOption = actionOptionForId(actionOptions, args.action_id);
  const beforeStep = s.state.step;
  const beforeSceneId = s.state.current;
  const beforeTitle = rpgRoomTitle(s.index, s.state);
  if (actionOption === null) {
    // Dialogue is modal, but that constraint was invisible at the exact moment it
    // bites: a player acting from a menu fetched BEFORE starting a conversation
    // gets a bare "not available" and has to guess why (bug_0494, found by an
    // overworld blind playtest). Name the modality only in that case — every
    // other unknown-id rejection keeps the terse default (rejections live in
    // transcripts, so idle words cost tokens on every future read).
    const inDialogue = activeDialogue(s.index, s.state) !== null;
    const rejectionReason = inDialogue
      ? "That action is not available right now: you are mid-conversation, and only the listed ask topics are legal until one of them ends the talk."
      : "That action is not available right now.";
    const rejectionEvents = [{ type: "rejected" as const, reason: rejectionReason }];
    const beforeObsOpts = {
      hideGraph: args.hide_graph ?? s.hideGraph ?? false,
      includeAvailableActions: rpgObservationNeedsActions(args),
    };
    sessions.appendTranscript(s.id, {
      step: beforeStep,
      scene_id: beforeSceneId,
      title: beforeTitle,
      action_id: compactMcpTranscriptActionId(args.action_id),
      action_text: null,
      events: rejectionEvents,
      result_scene_id: beforeSceneId,
      ended: s.state.ended,
      ending_id: s.state.endingId,
    });
    return {
      ok: false,
      rejection_reason: rejectionReason,
      events: rpgStepEvents(rejectionEvents, args),
      ...rpgStepEventVersion(args),
      ...rpgViewField(
        sessions,
        s,
        () => rpgRuntime.observationOf(s, beforeObsOpts, args.compact_observation !== true),
        args,
        beforeObsOpts,
      ),
      state_hash: publicRpgStateHash(currentStateHash),
    } as RpgStepActionResponse<Args>;
  }
  const result = s.step(s.state, actionOption.action);
  sessions.update(s.id, result.state);
  const afterObsOpts = {
    hideGraph: args.hide_graph ?? s.hideGraph ?? false,
    includeAvailableActions: rpgObservationNeedsActions(args),
  };
  const after = rpgRuntime.observationOf(s, afterObsOpts, args.compact_observation !== true);
  sessions.appendTranscript(s.id, {
    step: beforeStep,
    scene_id: beforeSceneId,
    title: beforeTitle,
    action_id: compactMcpTranscriptActionId(args.action_id),
    action_text: compactMcpActionLabel(actionOption.command),
    events: result.events,
    result_scene_id: obsLocation(after),
    ended: after.ended,
    ending_id: after.ending_id,
  });
  if (!result.ok) {
    return {
      ok: false,
      rejection_reason: result.rejectionReason ?? "Action rejected.",
      events: rpgStepEvents(result.events, args),
      ...rpgStepEventVersion(args),
      ...rpgViewField(sessions, s, after, args, afterObsOpts),
      state_hash: publicRpgStateHash(s.stateHash),
    } as RpgStepActionResponse<Args>;
  }
  return {
    ok: true,
    events: rpgStepEvents(result.events, args),
    ...rpgStepEventVersion(args),
    ...rpgViewField(sessions, s, after, args, afterObsOpts),
    state_hash: publicRpgStateHash(s.stateHash),
  } as RpgStepActionResponse<Args>;
}
