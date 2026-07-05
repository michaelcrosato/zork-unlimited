import type { GameState } from "../core/state.js";
import { cloneGameState } from "../core/state.js";
import { SAVE_MODE, save } from "../persist/save_load.js";
import {
  legalActionRowsFor,
  rpgViewField,
  type RpgLegalActionRows,
  type RpgLegalActionsArgs as RpgViewLegalActionsArgs,
  type RpgViewField,
  type RpgViewOptions,
} from "./rpg_view_projection.js";
import { rpgSourceFields, type RpgMcpSessionRuntime } from "./rpg_session_runtime.js";
import {
  rpgStateHashRejection,
  rpgStateUnchanged,
  type RpgStateHashRejection,
  type RpgStateUnchanged,
} from "./rpg_state_guards.js";
import type { Session, SessionStore, TranscriptSummary } from "./sessions.js";
import {
  TRANSCRIPT_SUMMARY_PROJECTION_COMPACT,
  cloneTranscriptSummary,
  compactTranscriptSummary,
  hashTranscript,
  transcriptEventVersion,
  transcriptTurnsFor,
  transcriptTurnsOmitted,
  transcriptUnchanged,
  type TranscriptArgs,
  type TranscriptResponse,
} from "./transcript_projection.js";

export type RpgGetObservationToolArgs = {
  session_id: string;
  hide_graph?: boolean;
  if_state_hash?: string;
} & RpgViewOptions;

type RpgObservationToolPayload<Args extends RpgViewOptions> = {
  state_hash: string;
} & RpgViewField<Args>;

export type RpgObservationToolResponse<Args extends RpgGetObservationToolArgs> = Args extends {
  if_state_hash: string;
}
  ? RpgObservationToolPayload<Args> | RpgStateUnchanged
  : RpgObservationToolPayload<Args>;

export type RpgLegalActionsToolArgs = {
  session_id: string;
  if_state_hash?: string;
} & RpgViewLegalActionsArgs;

type RpgLegalActionsToolPayload<Args extends RpgLegalActionsToolArgs> = {
  actions: RpgLegalActionRows<Args>;
  state_hash: string;
};

export type RpgLegalActionsToolResponse<Args extends RpgLegalActionsToolArgs> = Args extends {
  if_state_hash: string;
}
  ? RpgLegalActionsToolPayload<Args> | RpgStateUnchanged
  : RpgLegalActionsToolPayload<Args>;

export type RpgGetStateToolArgs = {
  session_id: string;
  include_state?: boolean;
};

type RpgStateHashToolPayload = {
  state_hash: string;
};

type RpgStateToolPayload = RpgStateHashToolPayload & {
  state: GameState;
};

export type RpgStateToolResponse<Args extends RpgGetStateToolArgs> = Args extends {
  include_state: true;
}
  ? RpgStateToolPayload
  : RpgStateHashToolPayload;

export type RpgSaveToolArgs = {
  session_id: string;
  expected_state_hash?: string;
};

type RpgSaveToolSuccess = {
  ok: true;
  save: string;
  content_hash: string;
  state_hash: string;
  world_quest_id?: string;
  generated_rpg_seed?: number;
};

export type RpgSaveToolResponse<Args extends RpgSaveToolArgs> = Args extends {
  expected_state_hash: string;
}
  ? RpgSaveToolSuccess | RpgStateHashRejection
  : RpgSaveToolSuccess;

type RpgSessionToolDeps = {
  sessions: SessionStore;
  rpgRuntime: RpgMcpSessionRuntime;
};

function visibleTranscriptFlags(state: GameState): string[] {
  return Object.keys(state.flags)
    .filter((flag) => state.flags[flag] === true && !flag.startsWith("__"))
    .sort();
}

function fullTranscriptSummary(session: Session): TranscriptSummary {
  return {
    steps: session.transcriptStats.actionTurns,
    scenes: [...session.transcriptStats.scenes].sort(),
    ended: session.state.ended,
    ending_id: session.state.endingId,
    inventory: [...session.state.inventory],
    flags: visibleTranscriptFlags(session.state),
    journal: [...session.state.journal],
  };
}

function compactTranscriptSummaryForSession(session: Session) {
  return compactTranscriptSummary({
    steps: session.transcriptStats.actionTurns,
    scenes: [...session.transcriptStats.scenes].sort(),
    ended: session.state.ended,
    ending_id: session.state.endingId,
    inventory: session.state.inventory,
    flags: visibleTranscriptFlags(session.state),
    journal: session.state.journal,
  });
}

export function runRpgGetObservation<Args extends RpgGetObservationToolArgs>(
  deps: RpgSessionToolDeps,
  args: Args,
): RpgObservationToolResponse<Args> {
  const { sessions, rpgRuntime } = deps;
  const s = sessions.get(args.session_id);
  const stateHash = s.stateHash;
  if (args.if_state_hash !== undefined && args.if_state_hash === stateHash) {
    return rpgStateUnchanged(stateHash) as RpgObservationToolResponse<Args>;
  }
  const obsOpts = {
    hideGraph: args.hide_graph ?? s.hideGraph ?? false,
  };
  return {
    ...rpgViewField(
      sessions,
      s,
      () => rpgRuntime.observationOf(s, obsOpts, args.compact_observation !== true),
      args,
      obsOpts,
    ),
    state_hash: stateHash,
  } as RpgObservationToolResponse<Args>;
}

export function runRpgListLegalActions<Args extends RpgLegalActionsToolArgs>(
  deps: RpgSessionToolDeps,
  args: Args,
): RpgLegalActionsToolResponse<Args> {
  const { sessions, rpgRuntime } = deps;
  const s = sessions.get(args.session_id);
  const stateHash = s.stateHash;
  if (args.if_state_hash !== undefined && args.if_state_hash === stateHash) {
    return rpgStateUnchanged(stateHash) as RpgLegalActionsToolResponse<Args>;
  }
  const actions = rpgRuntime.legalActionsFor(s);
  return {
    actions: legalActionRowsFor(sessions, s, actions, args),
    state_hash: stateHash,
  } as RpgLegalActionsToolResponse<Args>;
}

export function runRpgGetState<Args extends RpgGetStateToolArgs>(
  deps: Pick<RpgSessionToolDeps, "sessions">,
  args: Args,
): RpgStateToolResponse<Args> {
  const s = deps.sessions.get(args.session_id);
  const stateHash = s.stateHash;
  if (args.include_state === true) {
    return { state: cloneGameState(s.state), state_hash: stateHash } as RpgStateToolResponse<Args>;
  }
  return { state_hash: stateHash } as RpgStateToolResponse<Args>;
}

export function runRpgGetTranscript<Args extends TranscriptArgs>(
  deps: Pick<RpgSessionToolDeps, "sessions">,
  args: Args,
): TranscriptResponse<Args> {
  const { sessions } = deps;
  const s = sessions.get(args.session_id);
  const stateHash = s.stateHash;
  const currentTranscriptHash = hashTranscript(s, stateHash);
  if (args.if_transcript_hash !== undefined && args.if_transcript_hash === currentTranscriptHash) {
    return transcriptUnchanged(stateHash, currentTranscriptHash) as TranscriptResponse<Args>;
  }
  const summarySource =
    args.compact_summary === true
      ? sessions.transcriptSummaryProjection(s.id, TRANSCRIPT_SUMMARY_PROJECTION_COMPACT, () =>
          compactTranscriptSummaryForSession(s),
        )
      : sessions.transcriptSummary(s.id, () => fullTranscriptSummary(s));
  const summary = cloneTranscriptSummary(summarySource);
  const turnsOmitted = args.summary_only ? 0 : transcriptTurnsOmitted(s, args);
  const response = {
    session_id: s.id,
    ...rpgSourceFields(s),
    state_hash: stateHash,
    transcript_hash: currentTranscriptHash,
    ...transcriptEventVersion(args),
    ...(args.summary_only
      ? {}
      : {
          ...(turnsOmitted > 0 ? { turns_omitted: turnsOmitted } : {}),
          turns: transcriptTurnsFor(sessions, s, args),
        }),
    summary,
  };
  return response as unknown as TranscriptResponse<Args>;
}

export function runRpgSaveGame<Args extends RpgSaveToolArgs>(
  deps: Pick<RpgSessionToolDeps, "sessions">,
  args: Args,
): RpgSaveToolResponse<Args> {
  const s = deps.sessions.get(args.session_id);
  const stateHash = s.stateHash;
  if (args.expected_state_hash !== undefined && args.expected_state_hash !== stateHash) {
    return rpgStateHashRejection(stateHash) as RpgSaveToolResponse<Args>;
  }
  const saveMetadata = {
    ...(s.worldQuestId ? { worldQuestId: s.worldQuestId } : {}),
    ...(s.generatedRpgSeed !== undefined ? { generatedRpgSeed: s.generatedRpgSeed } : {}),
  };
  return {
    ok: true,
    save: save(s.state, s.packId, s.contentHash, SAVE_MODE, saveMetadata),
    ...rpgSourceFields(s),
    content_hash: s.contentHash,
    state_hash: stateHash,
  } as RpgSaveToolResponse<Args>;
}
