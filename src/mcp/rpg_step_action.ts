import type { RpgActionOption } from "../rpg/legal_actions.js";
import { rpgRoomTitle, type RpgMcpSessionRuntime } from "./rpg_session_runtime.js";
import type { SessionStore } from "./sessions.js";
import { rpgStateHashRejection, type RpgStateHashRejection } from "./rpg_state_guards.js";
import {
  rpgStepEventVersion,
  rpgStepEvents,
  type RpgEventOptions,
  type RpgStepEvents,
  type RpgStepEventVersion,
} from "./transcript_projection.js";
import { rpgViewField, type RpgViewField, type RpgViewOptions } from "./rpg_view_projection.js";

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
  if (args.expected_state_hash !== undefined && args.expected_state_hash !== currentStateHash) {
    return rpgStateHashRejection(currentStateHash) as RpgStepActionResponse<Args>;
  }
  const actionOptions = rpgRuntime.legalActionsFor(s);
  const actionOption = actionOptionForId(actionOptions, args.action_id);
  const beforeStep = s.state.step;
  const beforeSceneId = s.state.current;
  const beforeTitle = rpgRoomTitle(s.index, s.state);
  if (actionOption === null) {
    const beforeObsOpts = {
      hideGraph: args.hide_graph ?? s.hideGraph ?? false,
    };
    const before = rpgRuntime.observationOf(s, beforeObsOpts);
    return {
      ok: false,
      rejection_reason: "That action is not available right now.",
      events: rpgStepEvents(
        [{ type: "rejected" as const, reason: "That action is not available right now." }],
        args,
      ),
      ...rpgStepEventVersion(args),
      ...rpgViewField(sessions, s, before, args, beforeObsOpts),
      state_hash: currentStateHash,
    } as RpgStepActionResponse<Args>;
  }
  const result = s.step(s.state, actionOption.action);
  sessions.update(s.id, result.state);
  const afterObsOpts = {
    hideGraph: args.hide_graph ?? s.hideGraph ?? false,
  };
  const after = rpgRuntime.observationOf(s, afterObsOpts);
  sessions.appendTranscript(s.id, {
    step: beforeStep,
    scene_id: beforeSceneId,
    title: beforeTitle,
    action_id: args.action_id,
    action_text: actionOption.command,
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
      state_hash: s.stateHash,
    } as RpgStepActionResponse<Args>;
  }
  return {
    ok: true,
    events: rpgStepEvents(result.events, args),
    ...rpgStepEventVersion(args),
    ...rpgViewField(sessions, s, after, args, afterObsOpts),
    state_hash: s.stateHash,
  } as RpgStepActionResponse<Args>;
}
