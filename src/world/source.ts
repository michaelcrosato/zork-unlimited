import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import { SaveIntegrityError, type SaveSourceRef } from "../persist/save_load.js";
import type { Trace, TraceSourceRef } from "../trace/record.js";
import { generatedRpgSeedValidationMessage, isGeneratedRpgSeed } from "../gen/seed.js";
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
import { normalizePackPath, worldQuestNodeById } from "./graph.js";
import {
  compactSourceRefLegacyConsistency,
  compactSourceRefValidationError,
} from "./source_ref.js";

export type WorldQuestPackSource = {
  world: WorldManifest;
  node: WorldGraphNode;
  packPath: string;
};

const SAVE_SOURCE_REF_CONSISTENCY_MESSAGES = {
  sourceConflict: "Save source cannot carry both worldQuestId and generatedRpgSeed.",
  worldQuestMismatch: (sourceRefWorldQuestId: string, worldQuestId: string) =>
    `Save source_ref world quest ${JSON.stringify(
      sourceRefWorldQuestId,
    )} does not match worldQuestId ${JSON.stringify(worldQuestId)}.`,
  generatedSeedMismatch: (sourceRefGeneratedSeed: number, generatedRpgSeed: number) =>
    `Save source_ref generated seed ${JSON.stringify(
      sourceRefGeneratedSeed,
    )} does not match generatedRpgSeed ${JSON.stringify(generatedRpgSeed)}.`,
  sourceRefConflictsWithGeneratedRpgSeed: "Save source_ref conflicts with generatedRpgSeed.",
  sourceRefConflictsWithWorldQuestId: "Save source_ref conflicts with worldQuestId.",
} as const;

const TRACE_SOURCE_REF_CONSISTENCY_MESSAGES = {
  sourceConflict: "Trace source cannot carry both worldQuestId and generatedRpgSeed.",
  worldQuestMismatch: (sourceRefWorldQuestId: string, worldQuestId: string) =>
    `Trace source_ref world quest ${JSON.stringify(
      sourceRefWorldQuestId,
    )} does not match worldQuestId ${JSON.stringify(worldQuestId)}.`,
  generatedSeedMismatch: (sourceRefGeneratedSeed: number, generatedRpgSeed: number) =>
    `Trace source_ref generated seed ${JSON.stringify(
      sourceRefGeneratedSeed,
    )} does not match generatedRpgSeed ${JSON.stringify(generatedRpgSeed)}.`,
  sourceRefConflictsWithGeneratedRpgSeed: "Trace source_ref conflicts with generatedRpgSeed.",
  sourceRefConflictsWithWorldQuestId: "Trace source_ref conflicts with worldQuestId.",
} as const;

export type TraceSourceArgs = {
  world_quest_id?: string;
  pack_path?: never;
  quest_id?: never;
  quest_path?: never;
};

export type PackSourceArgs = {
  world_quest_id?: string;
  pack_path?: never;
  quest_id?: never;
  quest_path?: never;
};
export type SaveSourceArgs = {
  world_quest_id?: string;
  generate_rpg_seed?: number;
  pack_path?: never;
  quest_id?: never;
  quest_path?: never;
};

export type GameSourceArgs = {
  generate_rpg_seed?: number;
  pack_path?: never;
  quest_id?: never;
  quest_path?: never;
};

export type SaveWorldSource = {
  worldQuestId?: unknown;
  generatedRpgSeed?: unknown;
  source_ref?: unknown;
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

export type GeneratedGameSource = Extract<GamePackSource, { kind: "generated" }>;
export type TraceGameSource = GamePackSource;

const worldManifestCache = new Map<string, WorldManifest>();
const overworldManifestCache = new Map<string, OverworldManifest>();

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  return Object.freeze(value);
}

function assertGenerateRpgSeed(seed: unknown, operation: string): asserts seed is number {
  if (!isGeneratedRpgSeed(seed)) {
    throw new Error(generatedRpgSeedValidationMessage(`${operation} generate_rpg_seed`, seed));
  }
}

function rejectRetiredWorldQuestSourceAliases(
  args: unknown,
  operation: string,
  accepted: string,
): void {
  const source = args as {
    pack_path?: unknown;
    quest_id?: unknown;
    quest_path?: unknown;
  };
  if (source.pack_path !== undefined) {
    throw new Error(`${operation} accepts ${accepted}, not pack_path.`);
  }
  if (source.quest_path !== undefined) {
    throw new Error(`${operation} accepts ${accepted}, not quest_path.`);
  }
  if (source.quest_id !== undefined) {
    throw new Error(`${operation} accepts ${accepted}, not quest_id.`);
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

function coordKey(coord: readonly [number, number]): string {
  return `${coord[0]},${coord[1]}`;
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

  const mappedNodes = world.graph.nodes.filter((node) => node.coord !== undefined);
  if (mappedNodes.length > 0 && mappedNodes.length !== world.graph.nodes.length) {
    const unmapped = world.graph.nodes
      .filter((node) => node.coord === undefined)
      .map((node) => node.id)
      .sort();
    throw new Error(
      `Canonical world graph coordinate map is incomplete; missing coordinate(s): ${unmapped.join(
        ", ",
      )}.`,
    );
  }
  const duplicateCoords = duplicateValues(mappedNodes.map((node) => coordKey(node.coord!)));
  if (duplicateCoords.length > 0) {
    throw new Error(
      `Canonical world graph has duplicate coordinate(s): ${duplicateCoords.join(", ")}.`,
    );
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
  deepFreeze(world);
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
  deepFreeze(overworld);
  overworldManifestCache.set(root, overworld);
  return overworld;
}

export function resolvePackSource(
  root: string,
  args: PackSourceArgs,
  operation: string,
): TracePackSource {
  rejectRetiredWorldQuestSourceAliases(args, operation, "world_quest_id");
  if (args.world_quest_id === undefined) {
    throw new Error(`${operation} requires world_quest_id.`);
  }
  const resolved = resolveWorldQuestPackPath(root, args.world_quest_id);
  return { packPath: resolved.packPath, worldQuestId: resolved.node.id };
}

export function resolveGameSource(
  _root: string,
  args: GameSourceArgs,
  operation: string,
): GeneratedGameSource {
  rejectRetiredWorldQuestSourceAliases(args, operation, "generate_rpg_seed");
  if ((args as { world_quest_id?: unknown }).world_quest_id !== undefined) {
    throw new Error(`${operation} starts generated RPG packs only; use start_world_quest.`);
  }
  if (args.generate_rpg_seed === undefined) {
    throw new Error(`${operation} requires generate_rpg_seed.`);
  }
  assertGenerateRpgSeed(args.generate_rpg_seed, operation);
  return {
    kind: "generated",
    packPath: null,
    worldQuestId: null,
    generateRpgSeed: args.generate_rpg_seed,
  };
}

export function traceWorldQuestId(trace: Trace, operation: string): string | undefined {
  return traceEmbeddedSource(trace, operation).worldQuestId;
}

export function traceGeneratedRpgSeed(trace: Trace, operation: string): number | undefined {
  return traceEmbeddedSource(trace, operation).generatedRpgSeed;
}

function traceEmbeddedSource(
  trace: Trace,
  operation: string,
): {
  worldQuestId?: string;
  generatedRpgSeed?: number;
} {
  const sourceRef = traceSourceRef(trace, operation);
  const raw = (trace as { worldQuestId?: unknown }).worldQuestId;
  let worldQuestId: string | undefined;
  if (raw !== undefined && typeof raw !== "string") {
    throw new SaveIntegrityError(
      `${operation} trace worldQuestId must be a string when present, got ${JSON.stringify(raw)}.`,
    );
  }
  if (typeof raw === "string") worldQuestId = raw;

  const rawGeneratedRpgSeed = (trace as { generatedRpgSeed?: unknown }).generatedRpgSeed;
  let generatedRpgSeed: number | undefined;
  if (rawGeneratedRpgSeed !== undefined && !isGeneratedRpgSeed(rawGeneratedRpgSeed)) {
    throw new SaveIntegrityError(
      generatedRpgSeedValidationMessage(`${operation} trace generatedRpgSeed`, rawGeneratedRpgSeed),
    );
  }
  if (typeof rawGeneratedRpgSeed === "number") generatedRpgSeed = rawGeneratedRpgSeed;

  const consistency = compactSourceRefLegacyConsistency(
    sourceRef,
    {
      ...(worldQuestId !== undefined ? { worldQuestId } : {}),
      ...(generatedRpgSeed !== undefined ? { generatedRpgSeed } : {}),
    },
    TRACE_SOURCE_REF_CONSISTENCY_MESSAGES,
  );
  if (!consistency.ok) throw new SaveIntegrityError(consistency.error);
  return consistency.metadata;
}

function traceSourceRef(trace: Trace, operation: string): TraceSourceRef | undefined {
  const sourceRef = (trace as { source_ref?: unknown }).source_ref;
  if (sourceRef === undefined) return undefined;
  const error = compactSourceRefValidationError(sourceRef, `${operation} trace source_ref`);
  if (error !== undefined) throw new SaveIntegrityError(error);
  return sourceRef as TraceSourceRef;
}

export function saveWorldQuestId(bundle: SaveWorldSource, operation: string): string | undefined {
  return saveEmbeddedSource(bundle, operation).worldQuestId;
}

export function saveGeneratedRpgSeed(
  bundle: SaveWorldSource,
  operation: string,
): number | undefined {
  return saveEmbeddedSource(bundle, operation).generatedRpgSeed;
}

function saveEmbeddedSource(
  bundle: SaveWorldSource,
  operation: string,
): {
  worldQuestId?: string;
  generatedRpgSeed?: number;
} {
  const sourceRef = saveSourceRef(bundle, operation);
  const rawWorldQuestId = bundle.worldQuestId;
  let worldQuestId: string | undefined;
  if (rawWorldQuestId !== undefined && typeof rawWorldQuestId !== "string") {
    throw new SaveIntegrityError(
      `${operation} save worldQuestId must be a string when present, got ${JSON.stringify(
        rawWorldQuestId,
      )}.`,
    );
  }
  if (typeof rawWorldQuestId === "string") worldQuestId = rawWorldQuestId;

  const rawGeneratedRpgSeed = bundle.generatedRpgSeed;
  let generatedRpgSeed: number | undefined;
  if (rawGeneratedRpgSeed !== undefined && !isGeneratedRpgSeed(rawGeneratedRpgSeed)) {
    throw new SaveIntegrityError(
      generatedRpgSeedValidationMessage(`${operation} save generatedRpgSeed`, rawGeneratedRpgSeed),
    );
  }
  if (typeof rawGeneratedRpgSeed === "number") generatedRpgSeed = rawGeneratedRpgSeed;

  const consistency = compactSourceRefLegacyConsistency(
    sourceRef,
    {
      ...(worldQuestId !== undefined ? { worldQuestId } : {}),
      ...(generatedRpgSeed !== undefined ? { generatedRpgSeed } : {}),
    },
    SAVE_SOURCE_REF_CONSISTENCY_MESSAGES,
  );
  if (!consistency.ok) throw new SaveIntegrityError(consistency.error);
  return consistency.metadata;
}

function saveSourceRef(bundle: SaveWorldSource, operation: string): SaveSourceRef | undefined {
  const sourceRef = bundle.source_ref;
  if (sourceRef === undefined) return undefined;
  const error = compactSourceRefValidationError(sourceRef, `${operation} save source_ref`);
  if (error !== undefined) throw new SaveIntegrityError(error);
  return sourceRef as SaveSourceRef;
}

export function resolveSaveGameSource(
  root: string,
  args: SaveSourceArgs,
  bundle: SaveWorldSource,
  operation: string,
): GamePackSource {
  rejectRetiredWorldQuestSourceAliases(args, operation, "world_quest_id or generate_rpg_seed");
  const embeddedSource = saveEmbeddedSource(bundle, operation);
  const embeddedWorldQuestId = embeddedSource.worldQuestId;
  const embeddedGeneratedRpgSeed = embeddedSource.generatedRpgSeed;

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
  const source = resolveTraceGameSource(root, args, trace, operation);
  if (source.kind !== "pack") {
    throw new Error(`${operation} requires a world quest trace source, not generatedRpgSeed.`);
  }
  return { packPath: source.packPath, worldQuestId: source.worldQuestId };
}

export function resolveTraceGameSource(
  root: string,
  args: TraceSourceArgs,
  trace: Trace,
  operation: string,
): TraceGameSource {
  rejectRetiredWorldQuestSourceAliases(
    args,
    operation,
    "world_quest_id or embedded trace worldQuestId/generatedRpgSeed",
  );
  const embeddedSource = traceEmbeddedSource(trace, operation);
  const embeddedWorldQuestId = embeddedSource.worldQuestId;
  const embeddedGeneratedRpgSeed = embeddedSource.generatedRpgSeed;

  let source: TraceGameSource;
  if (args.world_quest_id !== undefined) {
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
      `${operation} requires world_quest_id or a trace with worldQuestId/generatedRpgSeed.`,
    );
  }

  if (
    embeddedWorldQuestId !== undefined &&
    (source.kind !== "pack" || source.worldQuestId !== embeddedWorldQuestId)
  ) {
    throw new SaveIntegrityError(
      `Trace worldQuestId ${JSON.stringify(
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
      `Trace generatedRpgSeed ${JSON.stringify(
        embeddedGeneratedRpgSeed,
      )} does not match requested source ${JSON.stringify(
        source.kind === "generated" ? source.generateRpgSeed : source.worldQuestId,
      )}.`,
    );
  }
  return source;
}
