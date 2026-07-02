/**
 * In-memory session store for the MCP server.
 *
 * A session binds a compiled pack (its index + rule set + content hash) to a live
 * GameState. The engine stays pure; the session just holds the latest state so an
 * agent can play across multiple tool calls. Session ids are a deterministic
 * counter (no clock/RNG), which keeps handler tests reproducible.
 */
import type { GameState } from "../core/state.js";
import type { Rules } from "../core/engine.js";
import type { GameEvent } from "../core/events.js";
import type { RpgAction } from "../api/types.js";
import type { RpgIndex } from "../rpg/runner.js";
import { hashState } from "../core/hash.js";

export type TranscriptTurn = {
  step: number;
  scene_id: string;
  title: string;
  action_id: string | null;
  action_text: string | null;
  events: GameEvent[];
  result_scene_id: string;
  ended: boolean;
  ending_id: string | null;
};

export type Session = {
  id: string;
  packId: string;
  contentHash: string;
  /** Compatibility source path for disk-backed sessions. Generated sessions omit it. */
  packPath?: string;
  /** Canonical Charter Marches quest graph node id for shipped quest sessions. */
  worldQuestId?: string;
  /** Overworld session that launched this RPG quest, when started through the bridge. */
  overworldSessionId?: string;
  /** Procedural RPG generation seed for in-memory generated sessions. */
  generatedRpgSeed?: number;
  /** The compiled RPG index for this session. */
  index: RpgIndex;
  rules: Rules<RpgAction>;
  state: GameState;
  transcript: TranscriptTurn[];
  transcriptLogHash: string;
  /** Difficulty: when true, the agent-facing observation hides each exit's
   *  destination (`exit.to`) so the spatial graph must be reasoned out, not read
   *  off. Default false — full graph, the legacy behavior. */
  hideGraph?: boolean;
};

export type SessionInit = Omit<Session, "id" | "transcriptLogHash">;

export class SessionStore {
  private counter = 0;
  private readonly sessions = new Map<string, Session>();

  create(init: SessionInit): Session {
    const id = `sess_${++this.counter}`;
    const session: Session = {
      id,
      ...init,
      transcriptLogHash: hashState(init.transcript),
    };
    this.sessions.set(id, session);
    return session;
  }

  get(id: string): Session {
    const session = this.sessions.get(id);
    if (!session) throw new Error(`Unknown session "${id}".`);
    return session;
  }

  update(id: string, state: GameState): Session {
    const session = this.get(id);
    session.state = state;
    return session;
  }

  appendTranscript(id: string, turn: TranscriptTurn): Session {
    const session = this.get(id);
    session.transcript.push(turn);
    session.transcriptLogHash = hashState({
      previous: session.transcriptLogHash,
      turn,
    });
    return session;
  }

  replaceTranscript(id: string, transcript: TranscriptTurn[]): Session {
    const session = this.get(id);
    session.transcript = transcript;
    session.transcriptLogHash = hashState(transcript);
    return session;
  }
}
