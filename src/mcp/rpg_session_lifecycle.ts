import { SAVE_MODE, assertSaveContentHash, load } from "../persist/save_load.js";
import { worldRouteFromHub, type WorldRouteStep } from "../world/graph.js";
import { resolveGameSource, resolveSaveGameSource } from "../world/source.js";
import { rpgViewField, type RpgViewOptions } from "./rpg_view_projection.js";
import {
  rpgSourceFields,
  type RpgMcpSessionRuntime,
  type RpgSessionPayload,
} from "./rpg_session_runtime.js";
import { publicRpgStateHash } from "./rpg_state_guards.js";
import type { RpgSourceRuntime } from "./rpg_source_runtime.js";
import type { SessionStore } from "./sessions.js";

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
  include_world_context?: boolean;
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

type RpgWorldQuestStartContextFields = {
  world: { id: string; name: string; hub: string };
  quest: {
    id: string;
    name: string;
    path_from_hub: WorldRouteStep[];
  };
};

type RpgWorldQuestStartContext<Args extends RpgStartWorldQuestToolArgs> = Args extends {
  include_world_context: true;
}
  ? RpgWorldQuestStartContextFields
  : Record<string, never>;

export type RpgWorldQuestStartPayload<Args extends RpgStartWorldQuestToolArgs> =
  RpgSessionPayload<Args> & RpgWorldQuestStartContext<Args>;

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
    worldQuestId: source.node.id,
    ...(args.overworldSessionId ? { overworldSessionId: args.overworldSessionId } : {}),
  });
  if (args.include_world_context === true) {
    return {
      world: { id: source.world.id, name: source.world.name, hub: source.world.hub },
      quest: {
        id: source.node.id,
        name: source.node.name,
        path_from_hub: worldRouteFromHub(source.world, source.node.id) ?? [],
      },
      ...started,
    } as unknown as RpgWorldQuestStartPayload<Args>;
  }
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
  return {
    session_id: session.id,
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
