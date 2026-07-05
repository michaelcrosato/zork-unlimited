import { SAVE_MODE, assertSaveContentHash, load } from "../persist/save_load.js";
import { worldRouteFromHub, type WorldRouteStep } from "../world/graph.js";
import { resolveGameSource, resolveSaveGameSource } from "../world/source.js";
import { rpgViewField, type RpgViewOptions } from "./rpg_view_projection.js";
import {
  rpgSourceFields,
  type RpgMcpSessionRuntime,
  type RpgSessionPayload,
} from "./rpg_session_runtime.js";
import type { RpgSourceRuntime } from "./rpg_source_runtime.js";
import type { SessionStore } from "./sessions.js";

export type RpgNewGameToolArgs = {
  generate_rpg_seed?: number;
  seed?: number;
  hide_graph?: boolean;
} & RpgViewOptions;

export type RpgStartWorldQuestToolArgs = {
  world_quest_id: string;
  seed?: number;
  hide_graph?: boolean;
} & RpgViewOptions;

export type RpgLoadGameToolArgs = {
  world_quest_id?: string;
  generate_rpg_seed?: number;
  pack_path?: never;
  save: string;
  hide_graph?: boolean;
} & RpgViewOptions;

export type RpgWorldQuestStartPayload<Args extends RpgViewOptions> = {
  world: { id: string; name: string; hub: string };
  quest: {
    id: string;
    name: string;
    path_from_hub: WorldRouteStep[];
  };
} & RpgSessionPayload<Args>;

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
  const resolved = deps.rpgSources.resolveWorldQuestPackPath(args.world_quest_id);
  const started = deps.rpgRuntime.startRpgSession(
    deps.rpgSources.requirePlayable(resolved.packPath),
    args,
    {
      packPath: resolved.packPath,
      worldQuestId: resolved.node.id,
    },
  );
  return {
    world: { id: resolved.world.id, name: resolved.world.name, hub: resolved.world.hub },
    quest: {
      id: resolved.node.id,
      name: resolved.node.name,
      path_from_hub: worldRouteFromHub(resolved.world, resolved.node.id) ?? [],
    },
    ...started,
  } as RpgWorldQuestStartPayload<Args>;
}

export function runRpgLoadGame<Args extends RpgLoadGameToolArgs>(
  deps: RpgLifecycleDeps,
  args: Args,
): RpgSessionPayload<Args> {
  const bundle = load(args.save, undefined, SAVE_MODE);
  const source = resolveSaveGameSource(deps.root, args, bundle, "load_game");
  const compiled =
    source.kind === "generated"
      ? deps.rpgSources.requireGeneratedRpgPlayable(source.generateRpgSeed)
      : deps.rpgSources.requirePlayable(source.packPath);
  assertSaveContentHash(bundle, compiled.contentHash);
  const session = deps.rpgRuntime.startSession(compiled, bundle.state, {
    ...(source.packPath ? { packPath: source.packPath } : {}),
    ...(source.worldQuestId ? { worldQuestId: source.worldQuestId } : {}),
    ...(source.generateRpgSeed !== null ? { generatedRpgSeed: source.generateRpgSeed } : {}),
    ...(args.hide_graph ? { hideGraph: true } : {}),
  });
  const openingOpts = deps.rpgRuntime.openingObservationOptions(session);
  return {
    session_id: session.id,
    ...rpgViewField(
      deps.sessions,
      session,
      deps.rpgRuntime.openingObservationOf(session, openingOpts),
      args,
      openingOpts,
    ),
    ...rpgSourceFields(session),
    state_hash: session.stateHash,
  } as RpgSessionPayload<Args>;
}
