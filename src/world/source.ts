import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import { SaveIntegrityError } from "../persist/save_load.js";
import type { Trace } from "../trace/record.js";
import {
  assertOverworldIntegrity,
  parseOverworldManifest,
  type OverworldManifest,
} from "./overworld.js";
import {
  CANONICAL_HUB_CITY,
  CANONICAL_WORLD_ID,
  CANONICAL_WORLD_NAME,
  WorldManifestSchema,
  type WorldGraphNode,
  type WorldManifest,
} from "./schema.js";
import { normalizePackPath, worldQuestNodeById, worldQuestNodeForPack } from "./graph.js";

export type WorldQuestPackSource = {
  world: WorldManifest;
  node: WorldGraphNode;
  packPath: string;
};

export type TraceSourceArgs = {
  pack_path?: string;
  world_quest_id?: string;
};

export type PackSourceArgs = TraceSourceArgs;
export type SaveSourceArgs = TraceSourceArgs;

export type GameSourceArgs = PackSourceArgs & {
  generate_rpg_seed?: number;
};

export type SaveWorldSource = {
  worldQuestId?: unknown;
};

export type TracePackSource = {
  packPath: string;
  worldQuestId: string | null;
};

export type GamePackSource =
  | {
      kind: "pack";
      packPath: string;
      worldQuestId: string | null;
      generateRpgSeed: null;
    }
  | {
      kind: "generated";
      packPath: null;
      worldQuestId: null;
      generateRpgSeed: number;
    };

const worldManifestCache = new Map<string, WorldManifest>();
const overworldManifestCache = new Map<string, OverworldManifest>();

export function fallbackWorldManifest(): WorldManifest {
  return {
    id: CANONICAL_WORLD_ID,
    name: CANONICAL_WORLD_NAME,
    hub: CANONICAL_HUB_CITY,
    graph: {
      hub: "charterhaven",
      nodes: [
        {
          id: "charterhaven",
          name: CANONICAL_HUB_CITY,
          kind: "hub",
        },
      ],
      edges: [],
    },
  };
}

export function loadWorldManifest(root: string): WorldManifest {
  const cached = worldManifestCache.get(root);
  if (cached) return cached;

  let world: WorldManifest;
  try {
    const raw = parseYaml(
      readFileSync(join(root, "content", "world", "charter_marches.yaml"), "utf8"),
    );
    world = WorldManifestSchema.parse(raw);
  } catch {
    world = fallbackWorldManifest();
  }
  worldManifestCache.set(root, world);
  return world;
}

export function resolveWorldQuestPackPath(
  root: string,
  worldQuestId: string,
): WorldQuestPackSource {
  const world = loadWorldManifest(root);
  const node = worldQuestNodeById(world, worldQuestId);
  if (!node?.pack) {
    throw new Error(`Unknown Charter Marches quest "${worldQuestId}".`);
  }
  return { world, node, packPath: normalizePackPath(node.pack) };
}

export function worldQuestIdForPackPath(root: string, packPath: string): string | null {
  return worldQuestNodeForPack(loadWorldManifest(root), packPath)?.id ?? null;
}

export function assertOverworldQuestSourceBindings(
  world: WorldManifest,
  overworld: OverworldManifest,
): void {
  for (const quest of overworld.quests) {
    const node = worldQuestNodeById(world, quest.id);
    if (!node?.pack) {
      throw new Error(`Overworld quest "${quest.id}" is missing from the canonical world graph.`);
    }
    const actualPack = normalizePackPath(quest.pack);
    const expectedPack = normalizePackPath(node.pack);
    if (actualPack !== expectedPack) {
      throw new Error(
        `Overworld quest "${quest.id}" pack ${JSON.stringify(
          actualPack,
        )} does not match canonical world graph pack ${JSON.stringify(expectedPack)}.`,
      );
    }
  }
}

export function loadOverworldManifest(root: string): OverworldManifest {
  const cached = overworldManifestCache.get(root);
  if (cached) return cached;

  const raw = JSON.parse(
    readFileSync(join(root, "content", "world", "new_york_overworld.json"), "utf8"),
  );
  const overworld = parseOverworldManifest(raw);
  assertOverworldIntegrity(overworld);
  assertOverworldQuestSourceBindings(loadWorldManifest(root), overworld);
  overworldManifestCache.set(root, overworld);
  return overworld;
}

export function resolvePackSource(
  root: string,
  args: PackSourceArgs,
  operation: string,
): TracePackSource {
  const sourceCount = [args.world_quest_id !== undefined, args.pack_path !== undefined].filter(
    Boolean,
  ).length;
  if (sourceCount === 0) {
    throw new Error(`${operation} requires world_quest_id or pack_path.`);
  }
  if (sourceCount > 1) {
    throw new Error(`${operation} accepts exactly one of world_quest_id or pack_path.`);
  }
  if (args.world_quest_id !== undefined) {
    const resolved = resolveWorldQuestPackPath(root, args.world_quest_id);
    return { packPath: resolved.packPath, worldQuestId: resolved.node.id };
  }
  const packPath = args.pack_path!;
  return { packPath, worldQuestId: worldQuestIdForPackPath(root, packPath) };
}

export function resolveGameSource(
  root: string,
  args: GameSourceArgs,
  operation: string,
): GamePackSource {
  const sourceCount = [
    args.world_quest_id !== undefined,
    args.pack_path !== undefined,
    args.generate_rpg_seed !== undefined,
  ].filter(Boolean).length;
  if (sourceCount === 0) {
    throw new Error(`${operation} requires world_quest_id, pack_path, or generate_rpg_seed.`);
  }
  if (sourceCount > 1) {
    throw new Error(
      `${operation} accepts exactly one of world_quest_id, pack_path, or generate_rpg_seed.`,
    );
  }
  if (args.generate_rpg_seed !== undefined) {
    return {
      kind: "generated",
      packPath: null,
      worldQuestId: null,
      generateRpgSeed: args.generate_rpg_seed,
    };
  }
  const source = resolvePackSource(root, args, operation);
  return { kind: "pack", ...source, generateRpgSeed: null };
}

export function traceWorldQuestId(trace: Trace, operation: string): string | undefined {
  const raw = (trace as { worldQuestId?: unknown }).worldQuestId;
  if (raw === undefined) return undefined;
  if (typeof raw !== "string") {
    throw new SaveIntegrityError(
      `${operation} trace worldQuestId must be a string when present, got ${JSON.stringify(raw)}.`,
    );
  }
  return raw;
}

export function saveWorldQuestId(bundle: SaveWorldSource, operation: string): string | undefined {
  const raw = bundle.worldQuestId;
  if (raw === undefined) return undefined;
  if (typeof raw !== "string") {
    throw new SaveIntegrityError(
      `${operation} save worldQuestId must be a string when present, got ${JSON.stringify(raw)}.`,
    );
  }
  return raw;
}

function resolveEmbeddedPackSource(
  root: string,
  args: TraceSourceArgs,
  embeddedWorldQuestId: string | undefined,
  operation: string,
  sourceLabel: "save" | "trace",
): TracePackSource {
  const sourceCount = [args.world_quest_id !== undefined, args.pack_path !== undefined].filter(
    Boolean,
  ).length;
  if (sourceCount > 1) {
    throw new Error(`${operation} accepts exactly one of world_quest_id or pack_path.`);
  }

  let packPath: string;
  let worldQuestId: string | null;
  if (args.world_quest_id !== undefined) {
    const resolved = resolveWorldQuestPackPath(root, args.world_quest_id);
    packPath = resolved.packPath;
    worldQuestId = resolved.node.id;
  } else if (args.pack_path !== undefined) {
    packPath = args.pack_path;
    worldQuestId = worldQuestIdForPackPath(root, packPath);
  } else if (embeddedWorldQuestId !== undefined) {
    const resolved = resolveWorldQuestPackPath(root, embeddedWorldQuestId);
    packPath = resolved.packPath;
    worldQuestId = resolved.node.id;
  } else {
    throw new Error(
      `${operation} requires world_quest_id, pack_path, or a ${sourceLabel} with worldQuestId.`,
    );
  }

  if (embeddedWorldQuestId !== undefined && embeddedWorldQuestId !== worldQuestId) {
    const sourceName = sourceLabel === "save" ? "Save" : "Trace";
    throw new SaveIntegrityError(
      `${sourceName} worldQuestId ${JSON.stringify(
        embeddedWorldQuestId,
      )} does not match requested source ${JSON.stringify(worldQuestId)}.`,
    );
  }
  return { packPath, worldQuestId };
}

export function resolveSavePackSource(
  root: string,
  args: SaveSourceArgs,
  bundle: SaveWorldSource,
  operation: string,
): TracePackSource {
  return resolveEmbeddedPackSource(
    root,
    args,
    saveWorldQuestId(bundle, operation),
    operation,
    "save",
  );
}

export function resolveTracePackSource(
  root: string,
  args: TraceSourceArgs,
  trace: Trace,
  operation: string,
): TracePackSource {
  return resolveEmbeddedPackSource(
    root,
    args,
    traceWorldQuestId(trace, operation),
    operation,
    "trace",
  );
}
