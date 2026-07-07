import { SAVE_MODE, assertSaveContentHash, load } from "../persist/save_load.js";
import { resolveGameSource, resolveSaveGameSource } from "../world/source.js";
import {
  rpgObservationNeedsActions,
  rpgViewField,
  type RpgViewOptions,
} from "./rpg_view_projection.js";
import {
  rpgSourceFields,
  type RpgMcpSessionRuntime,
  type RpgSessionPayload,
} from "./rpg_session_runtime.js";
import { publicRpgStateHash } from "./rpg_state_guards.js";
import type { RpgSourceRuntime } from "./rpg_source_runtime.js";
import type { SessionStore } from "./sessions.js";
import { RPG_COMPACT_LEGEND } from "./compact_rpg_observation.js";

export type RpgNewGameToolArgs = {
  generate_rpg_seed?: number;
  seed?: number;
  hide_graph?: boolean;
  include_world_intro?: boolean;
} & RpgViewOptions;

export type RpgStartWorldQuestToolArgs = {
  world_quest_id: string;
  seed?: number;
  hide_graph?: boolean;
  include_world_intro?: boolean;
  /** Internal bridge binding for RPG sessions launched from an overworld session. */
  overworldSessionId?: string;
} & RpgViewOptions;

export type RpgLoadGameToolArgs = {
  world_quest_id?: string;
  generate_rpg_seed?: number;
  save: string;
  hide_graph?: boolean;
  include_world_intro?: boolean;
} & RpgViewOptions;

export type RpgWorldQuestStartPayload<Args extends RpgStartWorldQuestToolArgs> =
  RpgSessionPayload<Args>;

type RpgLifecycleDeps = {
  root: string;
  sessions: SessionStore;
  rpgRuntime: RpgMcpSessionRuntime;
  rpgSources: RpgSourceRuntime;
};

export function runRpgNewGame<Args extends RpgNewGameToolArgs>(
  deps: Pick<RpgLifecycleDeps, "root" | "rpgRuntime" | "rpgSources">,
  args: Args,
): RpgSessionPayload<Args> {
  const source = resolveGameSource(deps.root, args, "new_game");
  const compiled = deps.rpgSources.requireGeneratedRpgPlayable(source.generateRpgSeed);
  return deps.rpgRuntime.startRpgSession(compiled, args, {
    generatedRpgSeed: source.generateRpgSeed,
  });
}

export function runRpgStartWorldQuest<Args extends RpgStartWorldQuestToolArgs>(
  deps: Pick<RpgLifecycleDeps, "rpgRuntime" | "rpgSources">,
  args: Args,
): RpgWorldQuestStartPayload<Args> {
  if ((args as { quest_id?: unknown }).quest_id !== undefined) {
    throw new Error("start_world_quest accepts world_quest_id, not quest_id.");
  }
  if ((args as { world_quest_id?: unknown }).world_quest_id === undefined) {
    throw new Error("start_world_quest requires world_quest_id.");
  }
  const source = deps.rpgSources.requireWorldQuestPlayable(args.world_quest_id);
  const started = deps.rpgRuntime.startRpgSession(source.compiled, args, {
    worldQuestId: source.questId,
    ...(args.overworldSessionId ? { overworldSessionId: args.overworldSessionId } : {}),
  });
  return started as RpgWorldQuestStartPayload<Args>;
}

export function runRpgLoadGame<Args extends RpgLoadGameToolArgs>(
  deps: RpgLifecycleDeps,
  args: Args,
): RpgSessionPayload<Args> {
  const bundle = load(args.save, undefined, SAVE_MODE);
  const source = resolveSaveGameSource(deps.root, args, bundle, "load_game");
  const compiled = deps.rpgSources.requireGameSourcePlayable(source);
  assertSaveContentHash(bundle, compiled.contentHash);
  const session = deps.rpgRuntime.startSession(compiled, bundle.state, {
    ...(source.worldQuestId ? { worldQuestId: source.worldQuestId } : {}),
    ...(source.generateRpgSeed !== null ? { generatedRpgSeed: source.generateRpgSeed } : {}),
    ...(args.hide_graph ? { hideGraph: true } : {}),
  });
  const openingOpts = deps.rpgRuntime.openingObservationOptions(session, {
    includeWorldIntro: args.compact_observation !== true || args.include_world_intro === true,
  });
  openingOpts.includeAvailableActions = rpgObservationNeedsActions(args);
  return {
    session_id: session.id,
    // Session-creating response: carry the compact-context legend once, like
    // new_game/start_world_quest do via RpgMcpSessionRuntime.startRpgSession.
    ...(args.compact_observation === true ? { legend: RPG_COMPACT_LEGEND } : {}),
    ...rpgViewField(
      deps.sessions,
      session,
      () =>
        deps.rpgRuntime.openingObservationOf(
          session,
          openingOpts,
          args.compact_observation !== true,
        ),
      args,
      openingOpts,
    ),
    ...rpgSourceFields(session),
    state_hash: publicRpgStateHash(session.stateHash),
  } as RpgSessionPayload<Args>;
}
