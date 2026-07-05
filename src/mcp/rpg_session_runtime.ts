import type { RpgAction } from "../api/types.js";
import { makeStep, type Rules } from "../core/engine.js";
import type { GameState } from "../core/state.js";
import {
  buildRpgObservation,
  type ObservationOptions,
  type RpgObservation,
} from "../rpg/observation.js";
import type { CompiledRpgPack } from "../rpg/pack.js";
import type { RpgPack } from "../rpg/schema.js";
import { assertRpgStateReferences } from "../rpg/state_integrity.js";
import {
  buildRpgRules,
  enumerateRpgActions,
  indexRpgPack,
  initStateForRpgPack,
  type RpgIndex,
} from "../rpg/runner.js";
import {
  rpgViewField,
  type RpgObservationViewOptions,
  type RpgViewField,
  type RpgViewOptions,
} from "./rpg_view_projection.js";
import { SessionStore, type RpgStep, type Session } from "./sessions.js";

export type RpgRuntimeCacheEntry = {
  readonly index: RpgIndex;
  readonly rules: Rules<RpgAction>;
  readonly step: RpgStep;
};

export type RpgSourceFields = {
  world_quest_id?: string;
  generated_rpg_seed?: number;
};

export type RpgSessionPayload<Args extends RpgViewOptions = RpgViewOptions> = {
  session_id: string;
  state_hash: string;
} & RpgSourceFields &
  RpgViewField<Args>;

export type RpgSessionSource = {
  packPath?: string;
  worldQuestId?: string | null;
  overworldSessionId?: string | null;
  generatedRpgSeed?: number | null;
};

export type RpgSessionStartOptions = RpgSessionSource & {
  hideGraph?: boolean;
  seed?: number;
};

export function rpgSourceFields(source: {
  worldQuestId?: string | null;
  generatedRpgSeed?: number | null;
}): RpgSourceFields {
  return {
    ...(source.worldQuestId ? { world_quest_id: source.worldQuestId } : {}),
    ...(source.generatedRpgSeed !== undefined && source.generatedRpgSeed !== null
      ? { generated_rpg_seed: source.generatedRpgSeed }
      : {}),
  };
}

export function rpgRoomTitle(index: RpgIndex, state: GameState): string {
  return index.rooms.get(state.current)?.name ?? state.current;
}

export function rpgStateTitle(index: RpgIndex, state: GameState): string {
  if (state.ended && state.endingId) {
    return (
      index.pack.endings.find((ending) => ending.id === state.endingId)?.title ?? state.endingId
    );
  }
  return rpgRoomTitle(index, state);
}

function rejectRuntimeGraphMutation(): never {
  throw new TypeError("RPG runtime graph indexes are immutable.");
}

function deepFreezeRuntimeGraph<T>(value: T, seen = new WeakSet<object>()): T {
  if (value === null || (typeof value !== "object" && typeof value !== "function")) return value;
  const object = value as object;
  if (seen.has(object) || Object.isFrozen(object)) return value;
  seen.add(object);

  if (value instanceof Map) {
    for (const [key, child] of value.entries()) {
      deepFreezeRuntimeGraph(key, seen);
      deepFreezeRuntimeGraph(child, seen);
    }
    Object.defineProperties(value, {
      set: { value: rejectRuntimeGraphMutation, writable: false, configurable: false },
      delete: { value: rejectRuntimeGraphMutation, writable: false, configurable: false },
      clear: { value: rejectRuntimeGraphMutation, writable: false, configurable: false },
    });
    return Object.freeze(value);
  }

  for (const child of Object.values(value as Record<string, unknown>)) {
    deepFreezeRuntimeGraph(child, seen);
  }
  return Object.freeze(value);
}

function freezeRuntimeCacheEntry(entry: RpgRuntimeCacheEntry): RpgRuntimeCacheEntry {
  return deepFreezeRuntimeGraph(entry);
}

export class RpgMcpSessionRuntime {
  private readonly runtimeCache = new WeakMap<RpgPack, RpgRuntimeCacheEntry>();

  constructor(private readonly sessions: SessionStore) {}

  runtimeFor(pack: RpgPack): RpgRuntimeCacheEntry {
    const cached = this.runtimeCache.get(pack);
    if (cached) return cached;
    const index = indexRpgPack(pack);
    const rules = buildRpgRules(index);
    const entry = freezeRuntimeCacheEntry({ index, rules, step: makeStep(rules) });
    this.runtimeCache.set(pack, entry);
    return entry;
  }

  legalActionsFor(session: Session) {
    return this.sessions.legalActions(session.id, () =>
      enumerateRpgActions(session.index, session.state),
    );
  }

  private buildObservation(session: Session, opts: ObservationOptions = {}): RpgObservation {
    return buildRpgObservation(session.index, session.state, {
      ...opts,
      availableActions: this.legalActionsFor(session),
    });
  }

  observationOf(
    session: Session,
    opts: ObservationOptions = {},
    cacheObservation = true,
  ): RpgObservation {
    if (!cacheObservation) return this.buildObservation(session, opts);
    return this.sessions.observation(session.id, opts, () => this.buildObservation(session, opts));
  }

  startSession(
    compiled: CompiledRpgPack,
    state?: GameState,
    opts: RpgSessionStartOptions = {},
  ): Session {
    const { index, rules, step } = this.runtimeFor(compiled.pack);
    const initialState = state ?? initStateForRpgPack(index, opts.seed ?? 1);
    if (state !== undefined) assertRpgStateReferences(index, initialState);
    const session = this.sessions.create({
      packId: compiled.pack.meta.id,
      contentHash: compiled.contentHash,
      ...(opts.packPath ? { packPath: opts.packPath } : {}),
      ...(opts.worldQuestId ? { worldQuestId: opts.worldQuestId } : {}),
      ...(opts.overworldSessionId ? { overworldSessionId: opts.overworldSessionId } : {}),
      ...(opts.generatedRpgSeed !== undefined && opts.generatedRpgSeed !== null
        ? { generatedRpgSeed: opts.generatedRpgSeed }
        : {}),
      index,
      rules,
      step,
      state: initialState,
      transcript: [],
      ...(opts.hideGraph ? { hideGraph: true } : {}),
    });
    this.sessions.appendTranscript(session.id, {
      step: initialState.step,
      scene_id: initialState.current,
      title: rpgStateTitle(index, initialState),
      action_id: null,
      action_text: null,
      events: [],
      result_scene_id: initialState.current,
      ended: initialState.ended,
      ending_id: initialState.endingId,
    });
    return session;
  }

  openingObservationOptions(session: Session): RpgObservationViewOptions {
    return {
      hideGraph: session.hideGraph ?? false,
      includeWorldIntro: true,
    };
  }

  openingObservationOf(
    session: Session,
    opts = this.openingObservationOptions(session),
    cacheObservation = true,
  ): RpgObservation {
    return this.observationOf(session, opts, cacheObservation);
  }

  startRpgSession<Args extends RpgViewOptions>(
    compiled: CompiledRpgPack,
    args: Args & { seed?: number; hide_graph?: boolean },
    source: RpgSessionSource,
  ): RpgSessionPayload<Args> {
    const session = this.startSession(compiled, undefined, {
      seed: args.seed ?? 1,
      ...(args.hide_graph ? { hideGraph: true } : {}),
      ...(source.packPath ? { packPath: source.packPath } : {}),
      ...(source.worldQuestId ? { worldQuestId: source.worldQuestId } : {}),
      ...(source.overworldSessionId ? { overworldSessionId: source.overworldSessionId } : {}),
      ...(source.generatedRpgSeed !== undefined && source.generatedRpgSeed !== null
        ? { generatedRpgSeed: source.generatedRpgSeed }
        : {}),
    });
    const openingOpts = this.openingObservationOptions(session);
    return {
      session_id: session.id,
      ...rpgViewField(
        this.sessions,
        session,
        () => this.openingObservationOf(session, openingOpts, args.compact_observation !== true),
        args,
        openingOpts,
      ),
      ...rpgSourceFields(session),
      state_hash: session.stateHash,
    } as RpgSessionPayload<Args>;
  }
}
