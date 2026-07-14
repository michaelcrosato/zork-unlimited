import { readFileSync, statSync } from "node:fs";
import { parse as parseYaml } from "yaml";
import { hashState } from "../core/hash.js";
import type { RpgAction } from "../api/types.js";
import { compileRpgSource, type CompiledRpgSource } from "../rpg/source.js";
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
import type { WorldBinding } from "../world/schema.js";
import {
  normalizeSourcePath,
  overworldQuestById,
  type OverworldQuestCampaignExport,
} from "../world/overworld.js";
import { loadOverworldManifest, resolveTraceGameSource, type GameSource } from "../world/source.js";
import { safeResolve } from "./paths.js";
import { isRpgPackShape } from "./types.js";

export type RpgLoadResult =
  | { ok: true; compiled: CompiledRpgSource; report: ValidationReport }
  | { ok: false; report: ValidationReport };

type RpgSourceLoadCacheEntry = {
  ctimeMs: number;
  mtimeMs: number;
  size: number;
  result: RpgLoadResult;
};

export type GeneratedRpgCacheEntry = {
  compiled: CompiledRpgSource;
  report: ValidationReport;
};

export type WorldQuestSourceEntry = {
  title: string;
  playable: boolean;
  world: WorldBinding | null;
  world_quest_id: string;
};

export type RpgTraceSource =
  | {
      kind: "worldQuest";
      worldQuestId: string;
      generateRpgSeed: null;
      compiled: CompiledRpgSource;
    }
  | {
      kind: "generated";
      worldQuestId: null;
      generateRpgSeed: number;
      compiled: CompiledRpgSource;
    };

export type RpgWorldQuestPlayableSource = {
  questId: string;
  title: string;
  compiled: CompiledRpgSource;
};

export type RpgWorldQuestReportSource = {
  questId: string;
  title: string;
  result: RpgLoadResult;
};

type RpgWorldQuestSource = {
  questId: string;
  title: string;
  sourcePath: string;
  campaignExports: readonly OverworldQuestCampaignExport[] | undefined;
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
  sourcePath: string,
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

function campaignExportParityFindings(
  source: RpgWorldQuestSource,
  compiled: CompiledRpgSource,
): Finding[] {
  if (source.campaignExports === undefined) return [];
  const endingsById = new Map(compiled.pack.endings.map((ending) => [ending.id, ending]));
  const exportedEndingIds = new Set(
    source.campaignExports.map((campaignExport) => campaignExport.ending_id),
  );
  const findings: Finding[] = [];

  source.campaignExports.forEach((campaignExport, index) => {
    const where = [source.questId, `campaign_exports.${index}`];
    const ending = endingsById.get(campaignExport.ending_id);
    if (!ending) {
      findings.push({
        severity: "error",
        code: "CAMPAIGN_EXPORT_ENDING_MISSING",
        message: `Campaign export ending "${campaignExport.ending_id}" does not exist in the compiled RPG.`,
        where,
      });
      return;
    }
    if (ending.title !== campaignExport.ending_title) {
      findings.push({
        severity: "error",
        code: "CAMPAIGN_EXPORT_TITLE_MISMATCH",
        message: `Campaign export title ${JSON.stringify(campaignExport.ending_title)} does not exactly match compiled ending title ${JSON.stringify(ending.title)}.`,
        where,
      });
    }
    if (ending.death) {
      findings.push({
        severity: "error",
        code: "CAMPAIGN_EXPORT_DEATH_ENDING",
        message: `Campaign export ending "${campaignExport.ending_id}" is a death ending and cannot grant persistent consequences.`,
        where,
      });
    }
  });

  for (const ending of compiled.pack.endings) {
    if (!ending.death && !exportedEndingIds.has(ending.id)) {
      findings.push({
        severity: "error",
        code: "CAMPAIGN_EXPORT_ENDING_UNDECLARED",
        message: `Compiled non-death ending "${ending.id}" has no campaign export.`,
        where: [source.questId, "campaign_exports"],
      });
    }
  }

  return findings;
}

function withCampaignExportParity(
  source: RpgWorldQuestSource,
  result: RpgLoadResult,
): RpgLoadResult {
  if (!result.ok) return result;
  const parityFindings = campaignExportParityFindings(source, result.compiled);
  if (parityFindings.length === 0) return result;
  return freezeLoadResult({
    ok: true,
    compiled: result.compiled,
    report: makeReport(source.sourcePath, [...result.report.findings, ...parityFindings]),
  });
}

export class RpgSourceRuntime {
  private readonly sourceLoadCache = new Map<string, RpgSourceLoadCacheEntry>();
  private readonly generatedRpgCache = new Map<number, GeneratedRpgCacheEntry>();

  constructor(private readonly root: string) {}

  /** Read an RPG source, compile, and validate it with the single runtime loader. */
  private loadSourceBackedReport(sourcePath: string): RpgLoadResult {
    const abs = safeResolve(this.root, sourcePath);
    // A manifest may name a source file that is missing or unreadable on disk.
    // Surface that as a normal not-ok load report instead of letting the raw fs
    // error escape: Node's message embeds the resolved ABSOLUTE path, which no
    // MCP client may see (bug_0492's class), and a throw here would also let one
    // broken quest row break the whole overworld quest catalog. Echo only the
    // manifest-relative source path the reports already use. Not cached: there
    // is no stat identity to key on, and the error path is cold.
    const unreadable = (): RpgLoadResult =>
      freezeLoadResult({
        ok: false,
        report: makeReport(sourcePath, [
          {
            severity: "error",
            code: "SOURCE_UNREADABLE",
            message: `RPG source "${sourcePath}" is missing or unreadable.`,
            where: [sourcePath],
          },
        ]),
      });
    let stat: ReturnType<typeof statSync>;
    try {
      stat = statSync(abs);
    } catch {
      return unreadable();
    }
    const cached = refreshSourceCacheEntry(this.sourceLoadCache, abs);
    if (
      cached &&
      cached.ctimeMs === stat.ctimeMs &&
      cached.mtimeMs === stat.mtimeMs &&
      cached.size === stat.size
    ) {
      return cached.result;
    }

    let source: string;
    try {
      source = readFileSync(abs, "utf8");
    } catch {
      return unreadable();
    }
    let result: RpgLoadResult;
    if (!isRpgPackShape(parseYaml(source) as unknown)) {
      result = freezeLoadResult({
        ok: false,
        report: makeReport(sourcePath, [
          {
            severity: "error",
            code: "UNSUPPORTED_LEGACY_PACK",
            message: "MCP source loading is RPG-only; legacy shapes are migration data.",
            where: [sourcePath],
          },
        ]),
      });
      rememberSourceCacheEntry(this.sourceLoadCache, abs, {
        ctimeMs: stat.ctimeMs,
        mtimeMs: stat.mtimeMs,
        size: stat.size,
        result,
      });
      return result;
    }
    const compileRes = compileRpgSource(source);
    if (!compileRes.ok) {
      result = freezeLoadResult({
        ok: false,
        report: makeReport(sourcePath, schemaFindings(sourcePath, compileRes.error)),
      });
      rememberSourceCacheEntry(this.sourceLoadCache, abs, {
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
    rememberSourceCacheEntry(this.sourceLoadCache, abs, {
      ctimeMs: stat.ctimeMs,
      mtimeMs: stat.mtimeMs,
      size: stat.size,
      result,
    });
    return result;
  }

  private loadWorldQuestSourceReport(source: RpgWorldQuestSource): RpgLoadResult {
    return withCampaignExportParity(source, this.loadSourceBackedReport(source.sourcePath));
  }

  /** Compile + validate the RPG and its trusted campaign-export catalog before play. */
  private requireWorldQuestSourcePlayable(source: RpgWorldQuestSource): CompiledRpgSource {
    const lr = this.loadWorldQuestSourceReport(source);
    if (!lr.ok || !lr.report.ok) {
      throw new Error(`RPG source is not playable:\n${formatReport(lr.report)}`);
    }
    return lr.compiled;
  }

  requireGameSourcePlayable(source: GameSource): CompiledRpgSource {
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
  requireGeneratedRpgPlayable(seed: number): CompiledRpgSource {
    const { compiled, report } = this.generatedRpg(seed);
    if (!report.ok) {
      throw new Error(
        `Generated RPG pack (seed ${seed}) is not playable:\n${formatReport(report)}`,
      );
    }
    return compiled;
  }

  /** Shipped quest ids, from the overworld quest registry (the single source of truth). */
  shippedWorldQuestIds(): string[] {
    return loadOverworldManifest(this.root)
      .quests.map((quest) => quest.id)
      .sort();
  }

  discoverWorldQuestSources(): WorldQuestSourceEntry[] {
    return this.shippedWorldQuestIds().map((worldQuestId) => {
      const source = this.loadWorldQuestReport(worldQuestId);
      const lr = source.result;
      return {
        title: lr.ok ? lr.compiled.pack.meta.title : source.title,
        playable: lr.ok && lr.report.ok,
        world: lr.ok ? (lr.compiled.pack.meta.world ?? null) : null,
        world_quest_id: source.questId,
      };
    });
  }

  private resolveWorldQuestRpgSource(worldQuestId: string): RpgWorldQuestSource {
    const overworld = loadOverworldManifest(this.root);
    const quest = overworldQuestById(overworld, worldQuestId);
    if (!quest) {
      throw new Error(`Unknown overworld quest "${worldQuestId}".`);
    }
    return {
      questId: quest.id,
      title: quest.title,
      sourcePath: normalizeSourcePath(quest.source),
      campaignExports: quest.campaign_exports,
    };
  }

  requireWorldQuestPlayable(worldQuestId: string): RpgWorldQuestPlayableSource {
    const source = this.resolveWorldQuestRpgSource(worldQuestId);
    return {
      questId: source.questId,
      title: source.title,
      compiled: this.requireWorldQuestSourcePlayable(source),
    };
  }

  loadWorldQuestReport(worldQuestId: string): RpgWorldQuestReportSource {
    const source = this.resolveWorldQuestRpgSource(worldQuestId);
    return {
      questId: source.questId,
      title: source.title,
      result: this.loadWorldQuestSourceReport(source),
    };
  }

  resolveTraceSource(
    args: { world_quest_id?: string },
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
}
