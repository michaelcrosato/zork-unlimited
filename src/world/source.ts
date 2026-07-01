import { existsSync, readdirSync, readFileSync } from "node:fs";
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

export type PackSourceArgs = {
  world_quest_id?: string;
  pack_path?: never;
};
export type SaveSourceArgs = {
  world_quest_id?: string;
  generate_rpg_seed?: number;
  pack_path?: never;
};

export type GameSourceArgs = {
  world_quest_id?: string;
  generate_rpg_seed?: number;
  pack_path?: never;
};

export type SaveWorldSource = {
  worldQuestId?: unknown;
  generatedRpgSeed?: unknown;
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

function assertGenerateRpgSeed(seed: unknown, operation: string): asserts seed is number {
  if (typeof seed !== "number" || !Number.isInteger(seed)) {
    throw new Error(
      `${operation} generate_rpg_seed must be an integer, got ${JSON.stringify(seed)}.`,
    );
  }
}

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

function duplicateValues(values: string[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }
  return [...duplicates].sort();
}

function discoverShippedRpgPackPaths(root: string): string[] {
  try {
    return readdirSync(join(root, "content", "rpg", "pack"))
      .filter((file) => file.endsWith(".yaml"))
      .map((file) => normalizePackPath(`content/rpg/pack/${file}`))
      .sort();
  } catch {
    return [];
  }
}

export function assertWorldQuestPackCoverage(
  world: WorldManifest,
  shippedPackPaths: string[],
): void {
  const shipped = [...new Set(shippedPackPaths.map(normalizePackPath))].sort();
  const questPacks = world.graph.nodes
    .filter((node) => node.kind === "quest")
    .map((node) => normalizePackPath(node.pack ?? ""));

  const duplicates = duplicateValues(questPacks);
  if (duplicates.length > 0) {
    throw new Error(
      `Canonical world graph binds the same shipped RPG pack more than once: ${duplicates.join(
        ", ",
      )}.`,
    );
  }

  const questPackSet = new Set(questPacks);
  const shippedSet = new Set(shipped);
  const missing = shipped.filter((path) => !questPackSet.has(path));
  const extra = questPacks.filter((path) => !shippedSet.has(path)).sort();

  if (missing.length > 0) {
    throw new Error(
      `Canonical world graph is missing shipped RPG pack binding(s): ${missing.join(", ")}.`,
    );
  }
  if (extra.length > 0) {
    throw new Error(
      `Canonical world graph references RPG pack(s) not shipped in content/rpg/pack: ${extra.join(
        ", ",
      )}.`,
    );
  }
}

export function assertWorldGraphIntegrity(world: WorldManifest): void {
  const nodeIds = world.graph.nodes.map((node) => node.id);
  const duplicateNodeIds = duplicateValues(nodeIds);
  if (duplicateNodeIds.length > 0) {
    throw new Error(
      `Canonical world graph has duplicate node id(s): ${duplicateNodeIds.join(", ")}.`,
    );
  }

  const nodes = new Map(world.graph.nodes.map((node) => [node.id, node]));
  const hub = nodes.get(world.graph.hub);
  if (!hub) {
    throw new Error(`Canonical world graph hub "${world.graph.hub}" is missing from nodes.`);
  }
  if (hub.kind !== "hub") {
    throw new Error(`Canonical world graph hub "${world.graph.hub}" must be a hub node.`);
  }

  const adjacency = new Map(world.graph.nodes.map((node) => [node.id, [] as string[]]));
  for (const edge of world.graph.edges) {
    const missing = [edge.from, edge.to].filter((id) => !nodes.has(id));
    if (missing.length > 0) {
      throw new Error(
        `Canonical world graph edge "${edge.route}" references missing node(s): ${missing.join(
          ", ",
        )}.`,
      );
    }
    if (edge.from === edge.to) {
      throw new Error(`Canonical world graph edge "${edge.route}" cannot loop to itself.`);
    }
    adjacency.get(edge.from)?.push(edge.to);
    adjacency.get(edge.to)?.push(edge.from);
  }

  const queue = [world.graph.hub];
  const reached = new Set(queue);
  for (let i = 0; i < queue.length; i += 1) {
    for (const next of adjacency.get(queue[i]!) ?? []) {
      if (reached.has(next)) continue;
      reached.add(next);
      queue.push(next);
    }
  }

  const unreachable = world.graph.nodes
    .filter((node) => !reached.has(node.id))
    .map((node) => node.id)
    .sort();
  if (unreachable.length > 0) {
    throw new Error(
      `Canonical world graph is disconnected from hub "${world.graph.hub}": ${unreachable.join(
        ", ",
      )}.`,
    );
  }
}

export function loadWorldManifest(root: string): WorldManifest {
  const cached = worldManifestCache.get(root);
  if (cached) return cached;

  let world: WorldManifest;
  let loadedFromDisk = false;
  const manifestPath = join(root, "content", "world", "charter_marches.yaml");
  if (existsSync(manifestPath)) {
    const raw = parseYaml(readFileSync(manifestPath, "utf8"));
    world = WorldManifestSchema.parse(raw);
    loadedFromDisk = true;
  } else {
    world = fallbackWorldManifest();
  }
  assertWorldGraphIntegrity(world);
  if (loadedFromDisk) {
    assertWorldQuestPackCoverage(world, discoverShippedRpgPackPaths(root));
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
  if ((args as { pack_path?: unknown }).pack_path !== undefined) {
    throw new Error(`${operation} accepts world_quest_id, not pack_path.`);
  }
  if (args.world_quest_id === undefined) {
    throw new Error(`${operation} requires world_quest_id.`);
  }
  const resolved = resolveWorldQuestPackPath(root, args.world_quest_id);
  return { packPath: resolved.packPath, worldQuestId: resolved.node.id };
}

export function resolveGameSource(
  root: string,
  args: GameSourceArgs,
  operation: string,
): GamePackSource {
  if ((args as { pack_path?: unknown }).pack_path !== undefined) {
    throw new Error(`${operation} accepts world_quest_id or generate_rpg_seed, not pack_path.`);
  }
  const sourceCount = [
    args.world_quest_id !== undefined,
    args.generate_rpg_seed !== undefined,
  ].filter(Boolean).length;
  if (sourceCount === 0) {
    throw new Error(`${operation} requires world_quest_id or generate_rpg_seed.`);
  }
  if (sourceCount > 1) {
    throw new Error(`${operation} accepts exactly one of world_quest_id or generate_rpg_seed.`);
  }
  if (args.generate_rpg_seed !== undefined) {
    assertGenerateRpgSeed(args.generate_rpg_seed, operation);
    return {
      kind: "generated",
      packPath: null,
      worldQuestId: null,
      generateRpgSeed: args.generate_rpg_seed,
    };
  }
  const resolved = resolveWorldQuestPackPath(root, args.world_quest_id!);
  return {
    kind: "pack",
    packPath: resolved.packPath,
    worldQuestId: resolved.node.id,
    generateRpgSeed: null,
  };
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

export function saveGeneratedRpgSeed(
  bundle: SaveWorldSource,
  operation: string,
): number | undefined {
  const raw = bundle.generatedRpgSeed;
  if (raw === undefined) return undefined;
  if (typeof raw !== "number" || !Number.isInteger(raw)) {
    throw new SaveIntegrityError(
      `${operation} save generatedRpgSeed must be an integer when present, got ${JSON.stringify(
        raw,
      )}.`,
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

export function resolveSaveGameSource(
  root: string,
  args: SaveSourceArgs,
  bundle: SaveWorldSource,
  operation: string,
): GamePackSource {
  if ((args as { pack_path?: unknown }).pack_path !== undefined) {
    throw new Error(`${operation} accepts world_quest_id or generate_rpg_seed, not pack_path.`);
  }
  const embeddedWorldQuestId = saveWorldQuestId(bundle, operation);
  const embeddedGeneratedRpgSeed = saveGeneratedRpgSeed(bundle, operation);
  if (embeddedWorldQuestId !== undefined && embeddedGeneratedRpgSeed !== undefined) {
    throw new SaveIntegrityError(
      "Save source cannot carry both worldQuestId and generatedRpgSeed.",
    );
  }

  const explicitCount = [
    args.world_quest_id !== undefined,
    args.generate_rpg_seed !== undefined,
  ].filter(Boolean).length;
  if (explicitCount > 1) {
    throw new Error(`${operation} accepts exactly one of world_quest_id or generate_rpg_seed.`);
  }

  let source: GamePackSource;
  if (args.generate_rpg_seed !== undefined) {
    assertGenerateRpgSeed(args.generate_rpg_seed, operation);
    source = {
      kind: "generated",
      packPath: null,
      worldQuestId: null,
      generateRpgSeed: args.generate_rpg_seed,
    };
  } else if (args.world_quest_id !== undefined) {
    const resolved = resolveWorldQuestPackPath(root, args.world_quest_id);
    source = {
      kind: "pack",
      packPath: resolved.packPath,
      worldQuestId: resolved.node.id,
      generateRpgSeed: null,
    };
  } else if (embeddedGeneratedRpgSeed !== undefined) {
    source = {
      kind: "generated",
      packPath: null,
      worldQuestId: null,
      generateRpgSeed: embeddedGeneratedRpgSeed,
    };
  } else if (embeddedWorldQuestId !== undefined) {
    const resolved = resolveWorldQuestPackPath(root, embeddedWorldQuestId);
    source = {
      kind: "pack",
      packPath: resolved.packPath,
      worldQuestId: resolved.node.id,
      generateRpgSeed: null,
    };
  } else {
    throw new Error(
      `${operation} requires world_quest_id, generate_rpg_seed, or a save with worldQuestId/generatedRpgSeed.`,
    );
  }

  if (
    embeddedWorldQuestId !== undefined &&
    (source.kind !== "pack" || source.worldQuestId !== embeddedWorldQuestId)
  ) {
    throw new SaveIntegrityError(
      `Save worldQuestId ${JSON.stringify(
        embeddedWorldQuestId,
      )} does not match requested source ${JSON.stringify(
        source.kind === "pack" ? source.worldQuestId : source.generateRpgSeed,
      )}.`,
    );
  }
  if (
    embeddedGeneratedRpgSeed !== undefined &&
    (source.kind !== "generated" || source.generateRpgSeed !== embeddedGeneratedRpgSeed)
  ) {
    throw new SaveIntegrityError(
      `Save generatedRpgSeed ${JSON.stringify(
        embeddedGeneratedRpgSeed,
      )} does not match requested source ${JSON.stringify(
        source.kind === "generated" ? source.generateRpgSeed : source.worldQuestId,
      )}.`,
    );
  }
  return source;
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
