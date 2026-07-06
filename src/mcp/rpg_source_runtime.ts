import { readFileSync, statSync } from "node:fs";
import { parse as parseYaml } from "yaml";
import { hashState } from "../core/hash.js";
import type { RpgAction } from "../api/types.js";
import { compileRpgPack, type CompiledRpgPack } from "../rpg/pack.js";
import { generateRpgPack } from "../gen/rpg_generator.js";
import { assertGeneratedRpgSeed } from "../gen/seed.js";
import { validateRpg } from "../validate/rpg_validator.js";
import {
  formatReport,
  makeReport,
  type Finding,
  type ValidationReport,
} from "../validate/report.js";
import type { Trace } from "../trace/record.js";
import type { WorldBinding, WorldManifest } from "../world/schema.js";
import {
  normalizePackPath,
  worldMapBounds,
  worldMapEdges,
  worldQuestNodeById,
  type WorldMapBounds,
  type WorldMapEdge,
} from "../world/graph.js";
import {
  loadWorldManifest as loadWorldManifestFromRoot,
  resolveTraceGameSource,
  type GameSource,
  type WorldQuestPackSource,
} from "../world/source.js";
import { safeResolve } from "./paths.js";
import { isRpgPackShape } from "./types.js";

export type RpgLoadResult =
  | { ok: true; compiled: CompiledRpgPack; report: ValidationReport }
  | { ok: false; report: ValidationReport };

type RpgPackLoadCacheEntry = {
  ctimeMs: number;
  mtimeMs: number;
  size: number;
  result: RpgLoadResult;
};

export type GeneratedRpgCacheEntry = {
  compiled: CompiledRpgPack;
  report: ValidationReport;
};

export type WorldQuestSourceEntry = {
  title: string;
  playable: boolean;
  world: WorldBinding | null;
  world_quest_id: string;
};

type PublicWorldGraphNode = Omit<WorldManifest["graph"]["nodes"][number], "pack">;

export type PublicWorldGraph = Omit<WorldManifest["graph"], "nodes" | "edges"> & {
  bounds?: WorldMapBounds;
  nodes: PublicWorldGraphNode[];
  edges: WorldMapEdge[];
};

export type RpgTraceSource =
  | {
      kind: "worldQuest";
      worldQuestId: string;
      generateRpgSeed: null;
      compiled: CompiledRpgPack;
    }
  | {
      kind: "generated";
      worldQuestId: null;
      generateRpgSeed: number;
      compiled: CompiledRpgPack;
    };

export type RpgWorldQuestPlayableSource = Omit<WorldQuestPackSource, "packPath"> & {
  compiled: CompiledRpgPack;
};

export type RpgWorldQuestReportSource = Omit<WorldQuestPackSource, "packPath"> & {
  result: RpgLoadResult;
};

export const RPG_SOURCE_RUNTIME_CACHE_LIMIT = 8;

function refreshSourceCacheEntry<Key, Entry>(cache: Map<Key, Entry>, key: Key): Entry | undefined {
  const cached = cache.get(key);
  if (cached === undefined) return undefined;
  cache.delete(key);
  cache.set(key, cached);
  return cached;
}

function rememberSourceCacheEntry<Key, Entry>(
  cache: Map<Key, Entry>,
  key: Key,
  entry: Entry,
  maxEntries = RPG_SOURCE_RUNTIME_CACHE_LIMIT,
): void {
  cache.delete(key);
  cache.set(key, entry);
  while (cache.size > maxEntries) {
    const oldest = cache.keys().next();
    if (oldest.done) break;
    cache.delete(oldest.value);
  }
}

function schemaFindings(
  packPath: string,
  error: { issues: { message: string; path: (string | number)[] }[] },
): Finding[] {
  return error.issues.map((i) => ({
    severity: "error" as const,
    code: "SCHEMA",
    message: `${i.message} (${i.path.join(".") || "<root>"})`,
    where: [i.path.join(".") || "<root>"],
  }));
}

function deepFreezeSourceResult<T>(value: T): T {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value as Record<string, unknown>)) {
    deepFreezeSourceResult(child);
  }
  return Object.freeze(value);
}

function freezeLoadResult(result: RpgLoadResult): RpgLoadResult {
  return deepFreezeSourceResult(result);
}

function freezeGeneratedEntry(entry: GeneratedRpgCacheEntry): GeneratedRpgCacheEntry {
  return deepFreezeSourceResult(entry);
}

export class RpgSourceRuntime {
  private readonly packLoadCache = new Map<string, RpgPackLoadCacheEntry>();
  private readonly generatedRpgCache = new Map<number, GeneratedRpgCacheEntry>();

  constructor(private readonly root: string) {}

  /** Read an RPG pack, compile, and validate it with the single runtime loader. */
  loadAndReport(packPath: string): RpgLoadResult {
    const abs = safeResolve(this.root, packPath);
    const stat = statSync(abs);
    const cached = refreshSourceCacheEntry(this.packLoadCache, abs);
    if (
      cached &&
      cached.ctimeMs === stat.ctimeMs &&
      cached.mtimeMs === stat.mtimeMs &&
      cached.size === stat.size
    ) {
      return cached.result;
    }

    const source = readFileSync(abs, "utf8");
    let result: RpgLoadResult;
    if (!isRpgPackShape(parseYaml(source) as unknown)) {
      result = freezeLoadResult({
        ok: false,
        report: makeReport(packPath, [
          {
            severity: "error",
            code: "UNSUPPORTED_LEGACY_PACK",
            message: "MCP pack loading is RPG-only; legacy pack shapes are migration data.",
            where: [packPath],
          },
        ]),
      });
      rememberSourceCacheEntry(this.packLoadCache, abs, {
        ctimeMs: stat.ctimeMs,
        mtimeMs: stat.mtimeMs,
        size: stat.size,
        result,
      });
      return result;
    }
    const compileRes = compileRpgPack(source);
    if (!compileRes.ok) {
      result = freezeLoadResult({
        ok: false,
        report: makeReport(packPath, schemaFindings(packPath, compileRes.error)),
      });
      rememberSourceCacheEntry(this.packLoadCache, abs, {
        ctimeMs: stat.ctimeMs,
        mtimeMs: stat.mtimeMs,
        size: stat.size,
        result,
      });
      return result;
    }
    const pack = compileRes.compiled.pack;
    const report = validateRpg(pack);
    result = freezeLoadResult({ ok: true, compiled: compileRes.compiled, report });
    rememberSourceCacheEntry(this.packLoadCache, abs, {
      ctimeMs: stat.ctimeMs,
      mtimeMs: stat.mtimeMs,
      size: stat.size,
      result,
    });
    return result;
  }

  /** Compile + validate, refusing to play an invalid pack (§0, §10). */
  requirePlayable(packPath: string): CompiledRpgPack {
    const lr = this.loadAndReport(packPath);
    if (!lr.ok || !lr.report.ok) {
      throw new Error(`Pack is not playable:\n${formatReport(lr.report)}`);
    }
    return lr.compiled;
  }

  requireGameSourcePlayable(source: GameSource): CompiledRpgPack {
    return source.kind === "generated"
      ? this.requireGeneratedRpgPlayable(source.generateRpgSeed)
      : this.requireWorldQuestPlayable(source.worldQuestId).compiled;
  }

  generatedRpg(seed: number): GeneratedRpgCacheEntry {
    assertGeneratedRpgSeed(seed, "Generated RPG seed");
    const cached = refreshSourceCacheEntry(this.generatedRpgCache, seed);
    if (cached) return cached;
    const pack = generateRpgPack(seed);
    const report = validateRpg(pack);
    const entry = freezeGeneratedEntry({
      compiled: { pack, contentHash: hashState(pack) },
      report,
    });
    rememberSourceCacheEntry(this.generatedRpgCache, seed, entry);
    return entry;
  }

  /**
   * Mint a fresh RPG pack from a seed and refuse to play it unless it clears the
   * same validator gate the curated RPG packs clear.
   */
  requireGeneratedRpgPlayable(seed: number): CompiledRpgPack {
    const { compiled, report } = this.generatedRpg(seed);
    if (!report.ok) {
      throw new Error(
        `Generated RPG pack (seed ${seed}) is not playable:\n${formatReport(report)}`,
      );
    }
    return compiled;
  }

  discoverWorldQuestSources(world = this.loadWorldManifest()): WorldQuestSourceEntry[] {
    return worldQuestIds(world).map((worldQuestId) => {
      const source = this.loadWorldQuestReport(worldQuestId, world);
      const lr = source.result;
      return {
        title: lr.ok ? lr.compiled.pack.meta.title : source.node.name,
        playable: lr.ok && lr.report.ok,
        world: lr.ok ? (lr.compiled.pack.meta.world ?? null) : null,
        world_quest_id: source.node.id,
      };
    });
  }

  publicWorldGraph(world: WorldManifest): PublicWorldGraph {
    const bounds = worldMapBounds(world);
    return {
      hub: world.graph.hub,
      ...(bounds === null ? {} : { bounds }),
      nodes: world.graph.nodes.map((node) => ({
        id: node.id,
        name: node.name,
        kind: node.kind,
        ...(node.district === undefined ? {} : { district: node.district }),
        ...(node.coord === undefined ? {} : { coord: node.coord }),
      })),
      edges: worldMapEdges(world),
    };
  }

  resolveWorldQuestPackPath(
    worldQuestId: string,
    world = this.loadWorldManifest(),
  ): WorldQuestPackSource {
    const node = worldQuestNodeById(world, worldQuestId);
    if (!node) {
      throw new Error(`Unknown Charter Marches quest "${worldQuestId}".`);
    }
    if (!node.pack) {
      throw new Error(`World quest "${worldQuestId}" does not declare an RPG source.`);
    }
    return { world, node, packPath: normalizePackPath(node.pack) };
  }

  requireWorldQuestPlayable(worldQuestId: string): RpgWorldQuestPlayableSource {
    const source = this.resolveWorldQuestPackPath(worldQuestId);
    return {
      world: source.world,
      node: source.node,
      compiled: this.requirePlayable(source.packPath),
    };
  }

  loadWorldQuestReport(
    worldQuestId: string,
    world = this.loadWorldManifest(),
  ): RpgWorldQuestReportSource {
    const source = this.resolveWorldQuestPackPath(worldQuestId, world);
    return {
      world: source.world,
      node: source.node,
      result: this.loadAndReport(source.packPath),
    };
  }

  resolveTraceSource(
    args: { world_quest_id?: string; pack_path?: never },
    trace: Trace<RpgAction>,
    operation: string,
  ): RpgTraceSource {
    const source = resolveTraceGameSource(this.root, args, trace, operation);
    const compiled = this.requireGameSourcePlayable(source);
    return source.kind === "generated"
      ? {
          kind: "generated",
          worldQuestId: null,
          generateRpgSeed: source.generateRpgSeed,
          compiled,
        }
      : {
          kind: "worldQuest",
          worldQuestId: source.worldQuestId,
          generateRpgSeed: null,
          compiled,
        };
  }

  loadWorldManifest(): WorldManifest {
    return loadWorldManifestFromRoot(this.root);
  }
}

function worldQuestIds(world: WorldManifest): string[] {
  return world.graph.nodes.filter((node) => node.kind === "quest").map((node) => node.id);
}
