/**
 * In-memory session store for the MCP server.
 *
 * A session binds a compiled pack (its index + rule set + content hash) to a live
 * GameState. The engine stays pure; the session just holds the latest state so an
 * agent can play across multiple tool calls. Session ids are a deterministic
 * counter (no clock/RNG), which keeps handler tests reproducible.
 */
import type { GameState } from "../core/state.js";
import { cloneGameState } from "../core/state.js";
import type { Rules } from "../core/engine.js";
import type { GameEvent } from "../core/events.js";
import type { RpgAction, StepResult } from "../api/types.js";
import type { RpgActionOption } from "../rpg/legal_actions.js";
import type { ObservationOptions, RpgObservation } from "../rpg/observation.js";
import type { RpgIndex } from "../rpg/runner.js";
import { hashState } from "../core/hash.js";
import {
  cachedSessionProjection,
  invalidateSessionStateCaches,
  invalidateSessionTranscriptCaches,
  type SessionRuntimeCaches,
  type StateProjectionCacheEntry,
  type StateTranscriptProjectionCacheEntry,
  type TranscriptProjectionCacheEntry,
} from "./session_cache.js";

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

export type TranscriptSummary = {
  steps: number;
  scenes: string[];
  ended: boolean;
  ending_id: string | null;
  inventory: string[];
  flags: string[];
  journal: string[];
};

export type RpgStep = (state: GameState, action: RpgAction) => StepResult;

export const MCP_SESSION_STORE_LIMIT = 64;
export const MCP_SESSION_TRANSCRIPT_TURN_LIMIT = 128;

export type TranscriptStats = {
  turns: number;
  actionTurns: number;
  scenes: string[];
};

function assertSessionStoreLimit(maxSessions: number): number {
  if (!Number.isInteger(maxSessions) || maxSessions < 1) {
    throw new Error("MCP session store limit must be a positive integer.");
  }
  return maxSessions;
}

function assertTranscriptTurnLimit(maxTurns: number): number {
  if (!Number.isInteger(maxTurns) || maxTurns < 1) {
    throw new Error("MCP session transcript turn limit must be a positive integer.");
  }
  return maxTurns;
}

function refreshSessionEntry<Key, Entry>(sessions: Map<Key, Entry>, key: Key): Entry | undefined {
  const session = sessions.get(key);
  if (session === undefined) return undefined;
  sessions.delete(key);
  sessions.set(key, session);
  return session;
}

function rememberSessionEntry<Key, Entry>(
  sessions: Map<Key, Entry>,
  key: Key,
  entry: Entry,
  maxEntries: number,
): void {
  sessions.delete(key);
  sessions.set(key, entry);
  while (sessions.size > maxEntries) {
    const oldest = sessions.keys().next();
    if (oldest.done) break;
    sessions.delete(oldest.value);
  }
}

function emptyTranscriptStats(): TranscriptStats {
  return {
    turns: 0,
    actionTurns: 0,
    scenes: [],
  };
}

function recordTranscriptTurn(stats: TranscriptStats, turn: TranscriptTurn): void {
  stats.turns += 1;
  if (turn.action_id !== null) stats.actionTurns += 1;
  for (const scene of [turn.scene_id, turn.result_scene_id]) {
    if (!stats.scenes.includes(scene)) stats.scenes.push(scene);
  }
}

function transcriptStatsFor(transcript: readonly TranscriptTurn[]): TranscriptStats {
  const stats = emptyTranscriptStats();
  for (const turn of transcript) recordTranscriptTurn(stats, turn);
  return stats;
}

function retainedTranscript(transcript: TranscriptTurn[], maxTurns: number): TranscriptTurn[] {
  return transcript.length > maxTurns ? transcript.slice(transcript.length - maxTurns) : transcript;
}

function cloneEventValue<T>(value: T): T {
  if (Array.isArray(value)) return value.map(cloneEventValue) as T;
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [key, cloneEventValue(nested)]),
    ) as T;
  }
  return value;
}

function cloneTranscriptTurn(turn: TranscriptTurn): TranscriptTurn {
  return {
    ...turn,
    events: turn.events.map((event) => cloneEventValue(event) as GameEvent),
  };
}

function cloneTranscriptRows(transcript: readonly TranscriptTurn[]): TranscriptTurn[] {
  return transcript.map(cloneTranscriptTurn);
}

export type Session = SessionRuntimeCaches<TranscriptSummary> & {
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
  step: RpgStep;
  state: GameState;
  stateHash: string;
  transcript: TranscriptTurn[];
  transcriptLogHash: string;
  transcriptStats: TranscriptStats;
  /** Difficulty: when true, the agent-facing observation hides each exit's
   *  destination (`exit.to`) so the spatial graph must be reasoned out, not read
   *  off. Default false — full graph, the legacy behavior. */
  hideGraph?: boolean;
};

export type SessionInit = Omit<
  Session,
  | "id"
  | "stateHash"
  | "legalActionsCache"
  | "legalActionProjectionCaches"
  | "observationCache"
  | "observationProjectionCaches"
  | "transcriptLogHash"
  | "transcriptStats"
  | "transcriptSummaryCache"
  | "transcriptSummaryProjectionCaches"
  | "transcriptProjectionCaches"
>;

type ObservationCacheOptions = Pick<ObservationOptions, "hideGraph" | "includeWorldIntro">;

export class SessionStore {
  private counter = 0;
  private readonly sessions = new Map<string, Session>();

  constructor(
    private readonly maxSessions = MCP_SESSION_STORE_LIMIT,
    private readonly maxTranscriptTurns = MCP_SESSION_TRANSCRIPT_TURN_LIMIT,
  ) {
    assertSessionStoreLimit(maxSessions);
    assertTranscriptTurnLimit(maxTranscriptTurns);
  }

  create(init: SessionInit): Session {
    const id = `sess_${++this.counter}`;
    const state = cloneGameState(init.state);
    const transcript = cloneTranscriptRows(init.transcript);
    const session: Session = {
      id,
      ...init,
      state,
      stateHash: hashState(state),
      transcript: retainedTranscript(transcript, this.maxTranscriptTurns),
      transcriptLogHash: hashState(transcript),
      transcriptStats: transcriptStatsFor(transcript),
    };
    rememberSessionEntry(this.sessions, id, session, this.maxSessions);
    return session;
  }

  get(id: string): Session {
    const session = refreshSessionEntry(this.sessions, id);
    if (!session) throw new Error(`Unknown session "${id}".`);
    return session;
  }

  update(id: string, state: GameState): Session {
    const session = this.get(id);
    const stateHash = state === session.state ? session.stateHash : hashState(state);
    session.state = cloneGameState(state);
    if (stateHash === session.stateHash) {
      return session;
    }
    session.stateHash = stateHash;
    invalidateSessionStateCaches(session);
    return session;
  }

  legalActions(id: string, enumerate: () => RpgActionOption[]): RpgActionOption[] {
    const session = this.get(id);
    if (session.legalActionsCache?.stateHash === session.stateHash) {
      return session.legalActionsCache.actions;
    }
    const actions = enumerate();
    session.legalActionsCache = {
      stateHash: session.stateHash,
      actions,
    };
    return actions;
  }

  legalActionProjection<T>(id: string, key: string, build: () => T): T {
    const session = this.get(id);
    const cached = cachedSessionProjection<T, StateProjectionCacheEntry>(
      session.legalActionProjectionCaches,
      key,
      (entry) => entry.stateHash === session.stateHash,
      (projection) => ({
        stateHash: session.stateHash,
        projection,
      }),
      build,
    );
    session.legalActionProjectionCaches = cached.cacheMap;
    return cached.value;
  }

  observation(
    id: string,
    opts: ObservationCacheOptions,
    build: () => RpgObservation,
  ): RpgObservation {
    const session = this.get(id);
    const hideGraph = opts.hideGraph === true;
    const includeWorldIntro = opts.includeWorldIntro === true;
    if (
      session.observationCache?.stateHash === session.stateHash &&
      session.observationCache.hideGraph === hideGraph &&
      session.observationCache.includeWorldIntro === includeWorldIntro
    ) {
      return session.observationCache.observation;
    }
    const observation = build();
    session.observationCache = {
      stateHash: session.stateHash,
      hideGraph,
      includeWorldIntro,
      observation,
    };
    return observation;
  }

  observationProjection<T>(id: string, key: string, build: () => T): T {
    const session = this.get(id);
    const cached = cachedSessionProjection<T, StateProjectionCacheEntry>(
      session.observationProjectionCaches,
      key,
      (entry) => entry.stateHash === session.stateHash,
      (projection) => ({
        stateHash: session.stateHash,
        projection,
      }),
      build,
    );
    session.observationProjectionCaches = cached.cacheMap;
    return cached.value;
  }

  transcriptSummary(id: string, build: () => TranscriptSummary): TranscriptSummary {
    const session = this.get(id);
    if (
      session.transcriptSummaryCache?.stateHash === session.stateHash &&
      session.transcriptSummaryCache.transcriptLogHash === session.transcriptLogHash
    ) {
      return session.transcriptSummaryCache.summary;
    }
    const summary = build();
    session.transcriptSummaryCache = {
      stateHash: session.stateHash,
      transcriptLogHash: session.transcriptLogHash,
      summary,
    };
    return summary;
  }

  transcriptSummaryProjection<T>(id: string, key: string, build: () => T): T {
    const session = this.get(id);
    const cached = cachedSessionProjection<T, StateTranscriptProjectionCacheEntry>(
      session.transcriptSummaryProjectionCaches,
      key,
      (entry) =>
        entry.stateHash === session.stateHash &&
        entry.transcriptLogHash === session.transcriptLogHash,
      (projection) => ({
        stateHash: session.stateHash,
        transcriptLogHash: session.transcriptLogHash,
        projection,
      }),
      build,
    );
    session.transcriptSummaryProjectionCaches = cached.cacheMap;
    return cached.value;
  }

  transcriptProjection<T>(id: string, key: string, build: () => T): T {
    const session = this.get(id);
    const cached = cachedSessionProjection<T, TranscriptProjectionCacheEntry>(
      session.transcriptProjectionCaches,
      key,
      (entry) => entry.transcriptLogHash === session.transcriptLogHash,
      (projection) => ({
        transcriptLogHash: session.transcriptLogHash,
        projection,
      }),
      build,
    );
    session.transcriptProjectionCaches = cached.cacheMap;
    return cached.value;
  }

  appendTranscript(id: string, turn: TranscriptTurn): Session {
    const session = this.get(id);
    const storedTurn = cloneTranscriptTurn(turn);
    session.transcript.push(storedTurn);
    recordTranscriptTurn(session.transcriptStats, storedTurn);
    session.transcript = retainedTranscript(session.transcript, this.maxTranscriptTurns);
    session.transcriptLogHash = hashState({
      previous: session.transcriptLogHash,
      turn: storedTurn,
    });
    invalidateSessionTranscriptCaches(session);
    return session;
  }

  replaceTranscript(id: string, transcript: TranscriptTurn[]): Session {
    const session = this.get(id);
    const storedTranscript = cloneTranscriptRows(transcript);
    session.transcript = retainedTranscript(storedTranscript, this.maxTranscriptTurns);
    session.transcriptLogHash = hashState(storedTranscript);
    session.transcriptStats = transcriptStatsFor(storedTranscript);
    invalidateSessionTranscriptCaches(session);
    return session;
  }
}
