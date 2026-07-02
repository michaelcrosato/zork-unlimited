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
import type { RpgActionOption } from "../rpg/legal_actions.js";
import type { ObservationOptions, RpgObservation } from "../rpg/observation.js";
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

export type TranscriptSummary = {
  steps: number;
  scenes: string[];
  ended: boolean;
  ending_id: string | null;
  inventory: string[];
  flags: string[];
  journal: string[];
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
  stateHash: string;
  legalActionsCache?: {
    stateHash: string;
    actions: RpgActionOption[];
  };
  observationCache?: {
    stateHash: string;
    hideGraph: boolean;
    includeWorldIntro: boolean;
    observation: RpgObservation;
  };
  transcript: TranscriptTurn[];
  transcriptLogHash: string;
  transcriptSummaryCache?: {
    stateHash: string;
    transcriptLogHash: string;
    summary: TranscriptSummary;
  };
  transcriptSummaryProjectionCaches?: Map<
    string,
    {
      stateHash: string;
      transcriptLogHash: string;
      projection: unknown;
    }
  >;
  transcriptProjectionCaches?: Map<
    string,
    {
      transcriptLogHash: string;
      projection: unknown;
    }
  >;
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
  | "observationCache"
  | "transcriptLogHash"
  | "transcriptSummaryCache"
  | "transcriptSummaryProjectionCaches"
  | "transcriptProjectionCaches"
>;

type ObservationCacheOptions = Pick<ObservationOptions, "hideGraph" | "includeWorldIntro">;

export class SessionStore {
  private counter = 0;
  private readonly sessions = new Map<string, Session>();

  create(init: SessionInit): Session {
    const id = `sess_${++this.counter}`;
    const session: Session = {
      id,
      ...init,
      stateHash: hashState(init.state),
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
    session.stateHash = hashState(state);
    delete session.legalActionsCache;
    delete session.observationCache;
    delete session.transcriptSummaryCache;
    delete session.transcriptSummaryProjectionCaches;
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
    const cache = session.transcriptSummaryProjectionCaches?.get(key);
    if (
      cache?.stateHash === session.stateHash &&
      cache.transcriptLogHash === session.transcriptLogHash
    ) {
      return cache.projection as T;
    }
    const projection = build();
    const caches = session.transcriptSummaryProjectionCaches ?? new Map();
    caches.set(key, {
      stateHash: session.stateHash,
      transcriptLogHash: session.transcriptLogHash,
      projection,
    });
    session.transcriptSummaryProjectionCaches = caches;
    return projection;
  }

  transcriptProjection<T>(id: string, key: string, build: () => T): T {
    const session = this.get(id);
    const cache = session.transcriptProjectionCaches?.get(key);
    if (cache?.transcriptLogHash === session.transcriptLogHash) {
      return cache.projection as T;
    }
    const projection = build();
    const caches = session.transcriptProjectionCaches ?? new Map();
    caches.set(key, {
      transcriptLogHash: session.transcriptLogHash,
      projection,
    });
    session.transcriptProjectionCaches = caches;
    return projection;
  }

  appendTranscript(id: string, turn: TranscriptTurn): Session {
    const session = this.get(id);
    session.transcript.push(turn);
    session.transcriptLogHash = hashState({
      previous: session.transcriptLogHash,
      turn,
    });
    delete session.transcriptSummaryCache;
    delete session.transcriptSummaryProjectionCaches;
    delete session.transcriptProjectionCaches;
    return session;
  }

  replaceTranscript(id: string, transcript: TranscriptTurn[]): Session {
    const session = this.get(id);
    session.transcript = transcript;
    session.transcriptLogHash = hashState(transcript);
    delete session.transcriptSummaryCache;
    delete session.transcriptSummaryProjectionCaches;
    delete session.transcriptProjectionCaches;
    return session;
  }
}
