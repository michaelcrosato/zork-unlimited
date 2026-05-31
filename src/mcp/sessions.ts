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
import type { CyoaIndex } from "../cyoa/runner.js";
import type { GameEvent } from "../core/events.js";

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
  index: CyoaIndex;
  rules: Rules;
  state: GameState;
  transcript: TranscriptTurn[];
};

export class SessionStore {
  private counter = 0;
  private readonly sessions = new Map<string, Session>();

  create(init: Omit<Session, "id">): Session {
    const id = `sess_${++this.counter}`;
    const session: Session = { id, ...init };
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
}
