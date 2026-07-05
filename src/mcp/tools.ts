/**
 * MCP tool handlers as PURE functions (spec §9.4).
 *
 * Each handler is a thin wrapper over engine/validator/runner code we already
 * built — the engine stays the source of truth. These are unit-tested directly,
 * without a live MCP client (a §9.4 rule); server.ts only adapts them to stdio.
 *
 * The public world catalog, quest loading path, and live session dispatch are all
 * RPG-only. Legacy content files may still exist as data during migration, but MCP
 * never indexes, observes, starts, or validates them as playable sessions. Content
 * and traces are data only — no handler runs shell or code (§16).
 */
import { readFileSync, statSync } from "node:fs";
import { parse as parseYaml } from "yaml";
import { hashState } from "../core/hash.js";
import type { RpgAction } from "../api/types.js";
import type { GameState } from "../core/state.js";

import { compileRpgPack, loadRpgPackFile, type CompiledRpgPack } from "../rpg/pack.js";
import { generateRpgPack } from "../gen/rpg_generator.js";
import { validateRpg } from "../validate/rpg_validator.js";
import { assertRpgStateReferences } from "../rpg/state_integrity.js";

import {
  makeReport,
  formatReport,
  type Finding,
  type ValidationReport,
} from "../validate/report.js";
import {
  SAVE_MODE,
  save,
  load,
  assertSaveContentHash,
  assertWellFormedState,
} from "../persist/save_load.js";
import { assertTraceMode, replayTrace } from "../trace/replay.js";
import type { Trace } from "../trace/record.js";
import { safeResolve } from "./paths.js";
import { SessionStore, type Session, type TranscriptSummary } from "./sessions.js";
import { isRpgPackShape, type McpActionOption, type McpObservation } from "./types.js";
import { RPG_COMPACT_EVENT_VERSION, type RpgCompactEvent } from "./compact_rpg_event.js";
import type { RpgCompactObservation } from "./compact_rpg_observation.js";
import {
  hashTranscript,
  transcriptEventVersion,
  transcriptSummaryFor,
  transcriptTurnsFor,
  transcriptUnchanged,
} from "./transcript_projection.js";
import { legalActionRowsFor, rpgViewField } from "./rpg_view_projection.js";
import { RpgMcpSessionRuntime, rpgSourceFields } from "./rpg_session_runtime.js";
import {
  runRpgStepAction,
  type RpgStepActionResponse as RpgRuntimeStepActionResponse,
} from "./rpg_step_action.js";
import {
  rpgStateHashRejection,
  rpgStateUnchanged,
  type RpgStateHashRejection,
  type RpgStateUnchanged,
} from "./rpg_state_guards.js";
import {
  isOverworldMcpRejectedSessionPayload,
  OverworldMcpSessionStore,
  type OverworldMcpContextResponse,
  type OverworldMcpExportArgs,
  type OverworldMcpExportResponse,
  type OverworldMcpReadArgs,
  type OverworldMcpReadResponse,
  type OverworldMcpRejectedSessionPayload,
  type OverworldMcpResponseOptions,
  type OverworldMcpRestoreResponse,
  type OverworldMcpSessionResponse,
  type OverworldMcpStartResponse,
  type OverworldMcpViewField,
} from "./overworld_sessions.js";
import {
  overworldQuestCompletionFromRpgSession,
  startOverworldQuestThroughRpg,
} from "./overworld_quest_bridge.js";
import type { WorldBinding, WorldManifest } from "../world/schema.js";
import {
  normalizePackPath,
  worldMapBounds,
  worldMapEdges,
  worldNodeAtCoord,
  worldQuestNodeById,
  worldQuestNodeForPack,
  worldRouteFromHub,
  type WorldCoord,
  type WorldMapBounds,
  type WorldMapEdge,
  type WorldRouteStep,
} from "../world/graph.js";
import {
  loadOverworldManifest as loadOverworldManifestFromRoot,
  loadWorldManifest as loadWorldManifestFromRoot,
  resolveGameSource,
  resolvePackSource,
  resolveSaveGameSource,
  resolveTracePackSource,
  resolveWorldQuestPackPath as resolveWorldQuestPackPathFromRoot,
} from "../world/source.js";
import { loadWorldQuestReport, validateWorldQuestReport } from "./world_quest_reports.js";
import { type OverworldManifest, type OverworldNode } from "../world/overworld.js";
import {
  type OverworldActionResult,
  type OverworldAreaTravelResult,
  type OverworldQuestCompletionResult,
  type OverworldRoadEncounterResult,
  type OverworldRoadEncounterStrategy,
  type OverworldSessionRoutePlan,
  type OverworldServiceResult,
  type OverworldQuestView,
  type TravelLogEntry,
} from "../world/session.js";
import {
  compactOverworldQuestRef,
  compactRouteOption,
  compactTravelLogEntry,
  type OverworldCompactQuestRef,
  type OverworldCompactRouteOption,
  type OverworldCompactTravelLogEntry,
} from "../world/compact_view.js";
import {
  compactOverworldActionResult,
  compactOverworldAreaTravelResult,
  compactOverworldQuestCompletionResult,
  compactOverworldRoadEncounterResult,
  compactOverworldServiceResult,
  type OverworldCompactActionResult,
  type OverworldCompactAreaTravelResult,
  type OverworldCompactQuestCompletionResult,
  type OverworldCompactRoadEncounterResult,
  type OverworldCompactServiceResult,
} from "./compact_overworld_result.js";
import { MockAuthorProvider } from "../../agents/authoring/mock_author.js";
import { resolveProvider } from "../../agents/llm/providers.js";
import { loadEngineContract, runWriter } from "../../agents/authoring/writer.js";
import { runRpgAdapter } from "../../agents/authoring/adapter.js";
import { diagnose } from "../../agents/debugger.js";
import {
  applyContentPatch,
  ContentPatchProposalSchema,
  type ContentPatchProposal,
} from "../../agents/fixer.js";

export type ToolApi = ReturnType<typeof createToolApi>;

type LoadResult =
  | { ok: true; compiled: CompiledRpgPack; report: ValidationReport }
  | { ok: false; report: ValidationReport };

type PackLoadCacheEntry = {
  mtimeMs: number;
  size: number;
  result: LoadResult;
};

type GeneratedRpgCacheEntry = {
  compiled: CompiledRpgPack;
  report: ValidationReport;
};

type WorldQuestSourceEntry = {
  path: string;
  id: string;
  title: string;
  playable: boolean;
  world: WorldBinding | null;
  world_quest_id: string | null;
};

type PublicWorldGraphNode = Omit<WorldManifest["graph"]["nodes"][number], "pack">;

type PublicWorldGraph = Omit<WorldManifest["graph"], "nodes" | "edges"> & {
  bounds?: WorldMapBounds;
  nodes: PublicWorldGraphNode[];
  edges: WorldMapEdge[];
};

type PublicWorldSummary = Pick<WorldManifest, "id" | "name" | "hub">;

type WorldListOptions = {
  include_graph?: boolean;
  include_routes?: boolean;
};

type WorldQuestCatalogEntry = {
  id: string;
  title: string;
  playable: boolean;
  world_quest_id: string | null;
  district: string;
  quest: string;
  role: string;
  connection: string;
  graph_node: string | null;
};

type WorldQuestRouteDetails = {
  path_from_hub: WorldRouteStep[];
};

type WorldListQuest<Args extends WorldListOptions> = WorldQuestCatalogEntry &
  (Args extends { include_routes: true } ? WorldQuestRouteDetails : Record<string, never>);

type WorldListResponse<Args extends WorldListOptions> = {
  world: PublicWorldSummary;
  hub: string;
  quest_count: number;
  quests: WorldListQuest<Args>[];
} & (Args extends { include_graph: true } ? { graph: PublicWorldGraph } : Record<string, never>);

type OverworldResponseOptions = OverworldMcpResponseOptions;

type OverworldListOptions = {
  include_design_notes?: boolean;
};

type RpgViewOptions = {
  compact_actions?: boolean;
  compact_observation?: boolean;
};

type RpgEventOptions = {
  compact_events?: boolean;
};
type OverworldViewField<Args extends OverworldResponseOptions> = OverworldMcpViewField<Args>;

type OverworldResultValue<
  Args extends OverworldResponseOptions,
  Value,
  CompactValue,
> = Args extends { compact_result: true } ? CompactValue : Value;

type OverworldRejectedSessionPayload = OverworldMcpRejectedSessionPayload;

type OverworldGuardedRejection<Args extends OverworldResponseOptions> = Args extends {
  expected_snapshot_hash: string;
}
  ? OverworldRejectedSessionPayload
  : never;

type OverworldStartResponse<Args extends OverworldResponseOptions> =
  OverworldMcpStartResponse<Args>;

type OverworldRestoreResponse<Args extends OverworldResponseOptions> =
  OverworldMcpRestoreResponse<Args>;

type OverworldExportArgs = OverworldMcpExportArgs;

type OverworldExportResponse<Args extends OverworldExportArgs> = OverworldMcpExportResponse<Args>;

type OverworldListSummary = {
  world: Pick<OverworldManifest, "id" | "name" | "start" | "premise">;
  town_count: number;
  road_count: number;
  region_count: number;
  regional_arc_count: number;
  area_count: number;
  area_route_count: number;
  character_count: number;
  local_event_count: number;
  local_job_count: number;
  road_event_count: number;
  exploration_site_count: number;
  quest_count: number;
  start: OverworldNode;
};

type OverworldDesignNotes = {
  sources: OverworldManifest["sources"];
  design_rules: string[];
};

type OverworldListResponse<Args extends OverworldListOptions> = OverworldListSummary &
  (Args extends { include_design_notes: true } ? OverworldDesignNotes : Record<string, never>);

type RpgViewField<Args extends RpgViewOptions> = Args extends {
  compact_observation: true;
}
  ? { context: RpgCompactObservation }
  : { observation: McpObservation };

type RpgSourceFields = {
  world_quest_id?: string;
  generated_rpg_seed?: number;
};

type RpgSessionPayload<Args extends RpgViewOptions = RpgViewOptions> = {
  session_id: string;
  state_hash: string;
} & RpgSourceFields &
  RpgViewField<Args>;

type RpgObservationPayload<Args extends RpgViewOptions> = {
  state_hash: string;
} & RpgViewField<Args>;

type RpgObservationUnchanged = RpgStateUnchanged;

type RpgObservationResponse<Args extends RpgViewOptions> = Args extends {
  if_state_hash: string;
}
  ? RpgObservationPayload<Args> | RpgObservationUnchanged
  : RpgObservationPayload<Args>;

type RpgLegalActionsArgs = {
  session_id: string;
  compact_actions?: boolean;
  if_state_hash?: string;
};

type RpgLegalActionRows<Args extends RpgLegalActionsArgs> = Args extends {
  compact_actions: true;
}
  ? string[]
  : McpActionOption[];

type RpgLegalActionsPayload<Args extends RpgLegalActionsArgs> = {
  actions: RpgLegalActionRows<Args>;
  state_hash: string;
};

type RpgLegalActionsUnchanged = RpgStateUnchanged;

type RpgLegalActionsResponse<Args extends RpgLegalActionsArgs> = Args extends {
  if_state_hash: string;
}
  ? RpgLegalActionsPayload<Args> | RpgLegalActionsUnchanged
  : RpgLegalActionsPayload<Args>;

type RpgNewGameArgs = {
  generate_rpg_seed?: number;
  seed?: number;
  hide_graph?: boolean;
} & RpgViewOptions;

type RpgStartWorldQuestArgs = {
  world_quest_id: string;
  seed?: number;
  hide_graph?: boolean;
} & RpgViewOptions;

type RpgGetObservationArgs = {
  session_id: string;
  hide_graph?: boolean;
  if_state_hash?: string;
} & RpgViewOptions;

type RpgStepActionArgs = {
  session_id: string;
  action_id: string;
  expected_state_hash?: string;
  hide_graph?: boolean;
} & RpgViewOptions &
  RpgEventOptions;

type RpgStepActionResponse<Args extends RpgStepActionArgs> = RpgRuntimeStepActionResponse<Args>;

type RpgLoadGameArgs = {
  world_quest_id?: string;
  generate_rpg_seed?: number;
  pack_path?: never;
  save: string;
  hide_graph?: boolean;
} & RpgViewOptions;

type RpgWorldQuestStartPayload<Args extends RpgViewOptions> = {
  world: { id: string; name: string; hub: string };
  quest: {
    id: string;
    name: string;
    path_from_hub: WorldRouteStep[];
  };
} & RpgSessionPayload<Args>;

type OverworldQuestStartResponse<Args extends OverworldResponseOptions & RpgViewOptions> =
  | ({
      ok: true;
      session_id: string;
      snapshot_hash: string;
      quest: OverworldResultValue<Args, OverworldQuestView, OverworldCompactQuestRef>;
      rpg_session_id: string;
      rpg_session: RpgSessionPayload<Args>;
    } & OverworldViewField<Args>)
  | OverworldGuardedRejection<Args>;

type TranscriptFullTurn = Session["transcript"][number];
type TranscriptCompactEventTurn = Omit<TranscriptFullTurn, "events"> & {
  events: RpgCompactEvent[];
};
type TranscriptCompactTurn = readonly [
  step: number,
  scene_id: string,
  action_id: string | null,
  result_scene_id: string,
];
type TranscriptCompactMore = readonly [
  scenes: number,
  inventory?: number,
  flags?: number,
  journal?: number,
];
type TranscriptCompactSummary = Omit<
  TranscriptSummary,
  "ending_id" | "inventory" | "flags" | "journal"
> & {
  ending_id?: string;
  inventory?: string[];
  flags?: string[];
  journal?: string[];
  more?: TranscriptCompactMore;
};
type TranscriptSummaryFor<Args extends TranscriptArgs> = Args extends { compact_summary: true }
  ? TranscriptCompactSummary
  : TranscriptSummary;
type TranscriptPayloadBase<Args extends TranscriptArgs> = {
  session_id: string;
  state_hash: string;
  transcript_hash: string;
  summary: TranscriptSummaryFor<Args>;
} & RpgSourceFields;
type TranscriptArgs = {
  session_id: string;
  summary_only?: boolean;
  compact_turns?: boolean;
  compact_events?: boolean;
  compact_summary?: boolean;
  if_transcript_hash?: string;
};
type TranscriptTurnFor<Args extends TranscriptArgs> = Args extends { compact_turns: true }
  ? TranscriptCompactTurn
  : Args extends { compact_events: true }
    ? TranscriptCompactEventTurn
    : TranscriptFullTurn;
type TranscriptEventVersion<Args extends TranscriptArgs> = Args extends { summary_only: true }
  ? Record<string, never>
  : Args extends { compact_turns: true }
    ? Record<string, never>
    : Args extends { compact_events: true }
      ? { event_v: typeof RPG_COMPACT_EVENT_VERSION }
      : Record<string, never>;
type TranscriptPayload<Args extends TranscriptArgs> = TranscriptPayloadBase<Args> &
  TranscriptEventVersion<Args> &
  (Args extends { summary_only: true }
    ? Record<string, never>
    : { turns: TranscriptTurnFor<Args>[] });
type TranscriptUnchanged = {
  state_hash: string;
  transcript_hash: string;
  unchanged: true;
};
type TranscriptResponse<Args extends TranscriptArgs> = Args extends { if_transcript_hash: string }
  ? TranscriptPayload<Args> | TranscriptUnchanged
  : TranscriptPayload<Args>;

type RpgGetStateArgs = {
  session_id: string;
  include_state?: boolean;
};
type RpgStateHashPayload = {
  state_hash: string;
};
type RpgStatePayload = RpgStateHashPayload & {
  state: GameState;
};
type RpgStateResponse<Args extends RpgGetStateArgs> = Args extends { include_state: true }
  ? RpgStatePayload
  : RpgStateHashPayload;

type RpgSaveArgs = {
  session_id: string;
  expected_state_hash?: string;
};

type RpgSaveSuccess = {
  ok: true;
  save: string;
  content_hash: string;
  state_hash: string;
} & RpgSourceFields;

type RpgSaveRejection = RpgStateHashRejection;

type RpgSaveResponse<Args extends RpgSaveArgs> = Args extends { expected_state_hash: string }
  ? RpgSaveSuccess | RpgSaveRejection
  : RpgSaveSuccess;

type OverworldSessionResponse<
  Key extends string,
  Value,
  Args extends OverworldResponseOptions,
  CompactValue = Value,
> = OverworldMcpSessionResponse<Key, Value, Args, CompactValue>;

type OverworldReadArgs = OverworldMcpReadArgs;

type OverworldReadResponse<Args extends OverworldReadArgs> = OverworldMcpReadResponse<Args>;

type OverworldContextResponse<Args extends OverworldReadArgs> = OverworldMcpContextResponse<Args>;

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

export function createToolApi(opts: { root: string }) {
  const root = opts.root;
  const sessions = new SessionStore();
  const packLoadCache = new Map<string, PackLoadCacheEntry>();
  const generatedRpgCache = new Map<number, GeneratedRpgCacheEntry>();
  const rpgRuntime = new RpgMcpSessionRuntime(sessions);
  const overworldSessions = new OverworldMcpSessionStore(() => loadOverworldManifestFromRoot(root));

  /** Read an RPG pack, compile, and validate it with the single runtime loader. */
  function loadAndReport(packPath: string): LoadResult {
    const abs = safeResolve(root, packPath);
    const stat = statSync(abs);
    const cached = packLoadCache.get(abs);
    if (cached && cached.mtimeMs === stat.mtimeMs && cached.size === stat.size) {
      return cached.result;
    }

    const source = readFileSync(abs, "utf8");
    let result: LoadResult;
    if (!isRpgPackShape(parseYaml(source) as unknown)) {
      result = {
        ok: false,
        report: makeReport(packPath, [
          {
            severity: "error",
            code: "UNSUPPORTED_LEGACY_PACK",
            message: "MCP pack loading is RPG-only; legacy pack shapes are migration data.",
            where: [packPath],
          },
        ]),
      };
      packLoadCache.set(abs, { mtimeMs: stat.mtimeMs, size: stat.size, result });
      return result;
    }
    const compileRes = compileRpgPack(source);
    if (!compileRes.ok) {
      result = {
        ok: false,
        report: makeReport(packPath, schemaFindings(packPath, compileRes.error)),
      };
      packLoadCache.set(abs, { mtimeMs: stat.mtimeMs, size: stat.size, result });
      return result;
    }
    const pack = compileRes.compiled.pack;
    const report = validateRpg(pack);
    result = { ok: true, compiled: compileRes.compiled, report };
    packLoadCache.set(abs, { mtimeMs: stat.mtimeMs, size: stat.size, result });
    return result;
  }

  /** Compile + validate, refusing to play an invalid pack (§0, §10). */
  function requirePlayable(packPath: string): CompiledRpgPack {
    const lr = loadAndReport(packPath);
    if (!lr.ok || !lr.report.ok) {
      throw new Error(`Pack is not playable:\n${formatReport(lr.ok ? lr.report : lr.report)}`);
    }
    return lr.compiled;
  }

  function generatedRpg(seed: number): GeneratedRpgCacheEntry {
    const cached = generatedRpgCache.get(seed);
    if (cached) return cached;
    const pack = generateRpgPack(seed); // mints + schema self-check (throws on malformed emission)
    const report = validateRpg(pack);
    const entry = { compiled: { pack, contentHash: hashState(pack) }, report };
    generatedRpgCache.set(seed, entry);
    return entry;
  }

  /**
   * Mint a fresh RPG pack from a seed and refuse to play it unless it clears the SAME
   * `validateRpg` gate the curated RPG packs clear. This is the only public MCP
   * generation route.
   */
  function requireGeneratedRpgPlayable(seed: number): CompiledRpgPack {
    const { compiled, report } = generatedRpg(seed);
    if (!report.ok) {
      throw new Error(
        `Generated RPG pack (seed ${seed}) is not playable:\n${formatReport(report)}`,
      );
    }
    return compiled;
  }

  function worldQuestPackPaths(world: WorldManifest): string[] {
    return world.graph.nodes
      .filter((node) => node.kind === "quest" && node.pack)
      .map((node) => normalizePackPath(node.pack ?? ""));
  }

  function discoverWorldQuestSources(world = loadWorldManifest()): WorldQuestSourceEntry[] {
    return worldQuestPackPaths(world).map((path) => {
      const lr = loadAndReport(path);
      const node = worldQuestNodeForPack(world, path);
      return {
        path,
        id: lr.ok ? lr.compiled.pack.meta.id : path,
        title: lr.ok ? lr.compiled.pack.meta.title : path,
        playable: lr.ok && lr.report.ok,
        world: lr.ok ? (lr.compiled.pack.meta.world ?? null) : null,
        world_quest_id: node?.id ?? null,
      };
    });
  }

  function publicWorldGraph(world: WorldManifest): PublicWorldGraph {
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

  function resolveWorldQuestPackPath(worldQuestId: string): {
    world: WorldManifest;
    node: NonNullable<ReturnType<typeof worldQuestNodeById>>;
    packPath: string;
  } {
    return resolveWorldQuestPackPathFromRoot(root, worldQuestId);
  }

  function resolveTraceSource(
    args: { world_quest_id?: string; pack_path?: never },
    trace: Trace<RpgAction>,
    operation: string,
  ): { packPath: string; worldQuestId: string | null; compiled: CompiledRpgPack } {
    if ((args as { pack_path?: unknown }).pack_path !== undefined) {
      throw new Error(
        `${operation} accepts world_quest_id or embedded trace worldQuestId, not pack_path.`,
      );
    }
    const source = resolveTracePackSource(root, args, trace, operation);
    return { ...source, compiled: requirePlayable(source.packPath) };
  }

  function loadWorldManifest(): WorldManifest {
    return loadWorldManifestFromRoot(root);
  }

  return {
    sessions,

    list_world<Args extends WorldListOptions = Record<string, never>>(
      args?: Args,
    ): WorldListResponse<Args> {
      const world = loadWorldManifest();
      const quests = discoverWorldQuestSources(world)
        .filter((s) => s.world?.id === world.id)
        .map((s) => {
          const node = s.world_quest_id ? worldQuestNodeById(world, s.world_quest_id) : null;
          const quest: WorldQuestCatalogEntry = {
            id: s.id,
            title: s.title,
            playable: s.playable,
            world_quest_id: node?.id ?? null,
            district: s.world?.district ?? "",
            quest: s.world?.quest ?? "",
            role: s.world?.role ?? "",
            connection: s.world?.connection ?? "",
            graph_node: node?.id ?? null,
          };
          if (args?.include_routes === true) {
            return {
              ...quest,
              path_from_hub: node ? (worldRouteFromHub(world, node.id) ?? []) : [],
            } as unknown as WorldListQuest<Args>;
          }
          return quest as WorldListQuest<Args>;
        });
      const catalog = {
        world: {
          id: world.id,
          name: world.name,
          hub: world.hub,
        },
        hub: world.hub,
        quest_count: quests.length,
        quests,
      };
      if (args?.include_graph === true) {
        return {
          ...catalog,
          graph: publicWorldGraph(world),
        } as unknown as WorldListResponse<Args>;
      }
      return catalog as WorldListResponse<Args>;
    },

    world_path(args: { world_quest_id?: string; coord?: WorldCoord }): {
      world: Pick<WorldManifest, "id" | "name" | "hub">;
      world_quest_id: string | null;
      graph_node: string | null;
      path_from_hub: WorldRouteStep[];
    } {
      if ((args as { quest_path?: unknown }).quest_path !== undefined) {
        throw new Error("world_path accepts world_quest_id, not quest_path.");
      }
      if (args.world_quest_id !== undefined && args.coord !== undefined) {
        throw new Error("world_path accepts either world_quest_id or coord, not both.");
      }
      if (args.world_quest_id === undefined && args.coord === undefined) {
        throw new Error("world_path requires world_quest_id or coord.");
      }
      const world = loadWorldManifest();
      const node =
        args.world_quest_id === undefined
          ? worldNodeAtCoord(world, args.coord!)
          : worldQuestNodeById(world, args.world_quest_id);
      if (!node) {
        const source =
          args.world_quest_id === undefined
            ? `coord ${JSON.stringify(args.coord)}`
            : `world quest "${args.world_quest_id}"`;
        throw new Error(`Unknown world graph ${source}.`);
      }
      return {
        world: {
          id: world.id,
          name: world.name,
          hub: world.hub,
        },
        world_quest_id: node.kind === "quest" ? node.id : null,
        graph_node: node.id,
        path_from_hub: worldRouteFromHub(world, node.id) ?? [],
      };
    },

    list_overworld<Args extends OverworldListOptions = Record<string, never>>(
      args?: Args,
    ): OverworldListResponse<Args> {
      const world = loadOverworldManifestFromRoot(root);
      const start = world.nodes.find((node) => node.id === world.start);
      if (!start) throw new Error(`Overworld start node "${world.start}" is missing.`);
      const summary: OverworldListSummary = {
        world: {
          id: world.id,
          name: world.name,
          start: world.start,
          premise: world.premise,
        },
        town_count: world.nodes.length,
        road_count: world.edges.length,
        region_count: world.regions.length,
        regional_arc_count: world.regional_arcs.length,
        area_count: world.areas.length,
        area_route_count: world.area_edges.length,
        character_count: world.characters.length,
        local_event_count: world.local_events.length,
        local_job_count: world.local_jobs.length,
        road_event_count: world.road_events.length,
        exploration_site_count: world.exploration_sites.length,
        quest_count: world.quests.length,
        start,
      };
      if (args?.include_design_notes === true) {
        return {
          ...summary,
          sources: world.sources,
          design_rules: world.design_rules,
        } as unknown as OverworldListResponse<Args>;
      }
      return summary as OverworldListResponse<Args>;
    },

    start_overworld<Args extends OverworldResponseOptions = Record<string, never>>(
      args?: Args,
    ): OverworldStartResponse<Args> {
      const responseOptions = (args ?? {}) as Args;
      return overworldSessions.startResponse(responseOptions);
    },

    get_overworld_session<Args extends OverworldReadArgs>(args: Args): OverworldReadResponse<Args> {
      return overworldSessions.read(args);
    },

    get_overworld_session_context<Args extends OverworldReadArgs>(
      args: Args,
    ): OverworldContextResponse<Args> {
      return overworldSessions.readContext(args);
    },

    export_overworld_session<Args extends OverworldExportArgs>(
      args: Args,
    ): OverworldExportResponse<Args> {
      return overworldSessions.exportSnapshot(args);
    },

    restore_overworld_session<Args extends { snapshot: unknown } & OverworldResponseOptions>(
      args: Args,
    ): OverworldRestoreResponse<Args> {
      return overworldSessions.restoreResponse(args, args.snapshot);
    },

    plan_overworld_session_route<
      Args extends {
        session_id: string;
        destination_town_id: string;
      } & OverworldResponseOptions,
    >(
      args: Args,
    ): OverworldSessionResponse<
      "route",
      OverworldSessionRoutePlan,
      Args,
      OverworldCompactRouteOption
    > {
      return overworldSessions.run(
        args,
        args.session_id,
        "route",
        (session) => session.planRoute(args.destination_town_id),
        compactRouteOption,
      );
    },

    travel_overworld_session<
      Args extends { session_id: string; road_id: string } & OverworldResponseOptions,
    >(
      args: Args,
    ): OverworldSessionResponse<"travel", TravelLogEntry, Args, OverworldCompactTravelLogEntry> {
      return overworldSessions.run(
        args,
        args.session_id,
        "travel",
        (session) => session.travel(args.road_id),
        compactTravelLogEntry,
      );
    },

    resolve_overworld_session_road_encounter<
      Args extends {
        session_id: string;
        strategy: OverworldRoadEncounterStrategy;
      } & OverworldResponseOptions,
    >(
      args: Args,
    ): OverworldSessionResponse<
      "result",
      OverworldRoadEncounterResult,
      Args,
      OverworldCompactRoadEncounterResult
    > {
      return overworldSessions.run(
        args,
        args.session_id,
        "result",
        (session) => session.resolveRoadEncounter(args.strategy),
        compactOverworldRoadEncounterResult,
      );
    },

    resupply_overworld_session<Args extends { session_id: string } & OverworldResponseOptions>(
      args: Args,
    ): OverworldSessionResponse<
      "result",
      OverworldServiceResult,
      Args,
      OverworldCompactServiceResult
    > {
      return overworldSessions.run(
        args,
        args.session_id,
        "result",
        (session) => session.resupplyAtTown(),
        compactOverworldServiceResult,
      );
    },

    rest_overworld_session<Args extends { session_id: string } & OverworldResponseOptions>(
      args: Args,
    ): OverworldSessionResponse<
      "result",
      OverworldServiceResult,
      Args,
      OverworldCompactServiceResult
    > {
      return overworldSessions.run(
        args,
        args.session_id,
        "result",
        (session) => session.restAtTown(),
        compactOverworldServiceResult,
      );
    },

    scout_overworld_session_poi<
      Args extends { session_id: string; poi_id: string } & OverworldResponseOptions,
    >(
      args: Args,
    ): OverworldSessionResponse<
      "result",
      OverworldActionResult,
      Args,
      OverworldCompactActionResult
    > {
      return overworldSessions.run(
        args,
        args.session_id,
        "result",
        (session) => session.scoutPoi(args.poi_id),
        compactOverworldActionResult,
      );
    },

    talk_overworld_session_contact<
      Args extends { session_id: string; character_id: string } & OverworldResponseOptions,
    >(
      args: Args,
    ): OverworldSessionResponse<
      "result",
      OverworldActionResult,
      Args,
      OverworldCompactActionResult
    > {
      return overworldSessions.run(
        args,
        args.session_id,
        "result",
        (session) => session.talkToCharacter(args.character_id),
        compactOverworldActionResult,
      );
    },

    investigate_overworld_session_event<
      Args extends { session_id: string; event_id: string } & OverworldResponseOptions,
    >(
      args: Args,
    ): OverworldSessionResponse<
      "result",
      OverworldActionResult,
      Args,
      OverworldCompactActionResult
    > {
      return overworldSessions.run(
        args,
        args.session_id,
        "result",
        (session) => session.investigateEvent(args.event_id),
        compactOverworldActionResult,
      );
    },

    resolve_overworld_session_event<
      Args extends { session_id: string; event_id: string } & OverworldResponseOptions,
    >(
      args: Args,
    ): OverworldSessionResponse<
      "result",
      OverworldActionResult,
      Args,
      OverworldCompactActionResult
    > {
      return overworldSessions.run(
        args,
        args.session_id,
        "result",
        (session) => session.resolveEvent(args.event_id),
        compactOverworldActionResult,
      );
    },

    explore_overworld_session_site<
      Args extends { session_id: string; site_id: string } & OverworldResponseOptions,
    >(
      args: Args,
    ): OverworldSessionResponse<
      "result",
      OverworldActionResult,
      Args,
      OverworldCompactActionResult
    > {
      return overworldSessions.run(
        args,
        args.session_id,
        "result",
        (session) => session.exploreSite(args.site_id),
        compactOverworldActionResult,
      );
    },

    explore_overworld_session_area<
      Args extends { session_id: string; area_id: string } & OverworldResponseOptions,
    >(
      args: Args,
    ): OverworldSessionResponse<
      "result",
      OverworldActionResult,
      Args,
      OverworldCompactActionResult
    > {
      return overworldSessions.run(
        args,
        args.session_id,
        "result",
        (session) => session.exploreArea(args.area_id),
        compactOverworldActionResult,
      );
    },

    work_overworld_session_job<
      Args extends { session_id: string; job_id: string } & OverworldResponseOptions,
    >(
      args: Args,
    ): OverworldSessionResponse<
      "result",
      OverworldActionResult,
      Args,
      OverworldCompactActionResult
    > {
      return overworldSessions.run(
        args,
        args.session_id,
        "result",
        (session) => session.workLocalJob(args.job_id),
        compactOverworldActionResult,
      );
    },

    start_overworld_session_quest<
      Args extends {
        session_id: string;
        quest_id: string;
        seed?: number;
        hide_graph?: boolean;
        compact_actions?: boolean;
        compact_observation?: boolean;
      } & OverworldResponseOptions,
    >(args: Args): OverworldQuestStartResponse<Args> {
      const guarded = overworldSessions.guardedSession(args, args.session_id);
      if (isOverworldMcpRejectedSessionPayload(guarded)) {
        return guarded as OverworldQuestStartResponse<Args>;
      }
      const { session } = guarded;
      const started = startOverworldQuestThroughRpg({
        session,
        overworldSessionId: args.session_id,
        questId: args.quest_id,
        startOptions: args,
        sessions,
        startWorldQuest: (startArgs) =>
          this.start_world_quest(startArgs as RpgStartWorldQuestArgs & Args),
      });
      const questResult =
        args.compact_result === true ? compactOverworldQuestRef(started.quest) : started.quest;
      return {
        ok: true,
        session_id: args.session_id,
        snapshot_hash: overworldSessions.snapshotHash(session),
        quest: questResult,
        rpg_session_id: started.rpgSession.session_id,
        rpg_session: started.rpgSession,
        ...overworldSessions.viewField(args, session),
      } as unknown as OverworldQuestStartResponse<Args>;
    },

    complete_overworld_session_quest<
      Args extends { session_id: string; rpg_session_id: string } & OverworldResponseOptions,
    >(
      args: Args,
    ): OverworldSessionResponse<
      "result",
      OverworldQuestCompletionResult,
      Args,
      OverworldCompactQuestCompletionResult
    > {
      return overworldSessions.run(
        args,
        args.session_id,
        "result",
        (session) => {
          const completion = overworldQuestCompletionFromRpgSession(
            sessions.get(args.rpg_session_id),
            args.session_id,
          );
          return session.completeQuest(completion.questId, completion.outcome);
        },
        compactOverworldQuestCompletionResult,
      );
    },

    move_overworld_session_area<
      Args extends { session_id: string; area_route_id: string } & OverworldResponseOptions,
    >(
      args: Args,
    ): OverworldSessionResponse<
      "result",
      OverworldAreaTravelResult,
      Args,
      OverworldCompactAreaTravelResult
    > {
      return overworldSessions.run(
        args,
        args.session_id,
        "result",
        (session) => session.moveArea(args.area_route_id),
        compactOverworldAreaTravelResult,
      );
    },

    validate_quest(args: { world_quest_id?: string }): {
      ok: boolean;
      world_quest_id: string | null;
      report: ValidationReport;
    } {
      return validateWorldQuestReport(root, args, "validate_quest", loadAndReport);
    },

    load_quest(args: { world_quest_id?: string }): {
      ok: boolean;
      world_quest_id: string | null;
      meta?: CompiledRpgPack["pack"]["meta"];
      content_hash?: string;
      report: ValidationReport;
    } {
      return loadWorldQuestReport(root, args, "load_quest", loadAndReport);
    },

    /**
     * Mint a fresh RPG pack from a seed and validate it against the SAME `validateRpg` gate
     * the curated RPG packs clear. This is the single public MCP generation surface.
     * Pure + deterministic (same seed ⇒ identical pack) and read-only — nothing is
     * written to disk. To PLAY the minted pack, pass the same value to `new_game`'s
     * `generate_rpg_seed`.
     */
    generate_rpg_pack(args: { seed: number }): {
      ok: boolean;
      content_hash: string;
      seed: number;
      meta: CompiledRpgPack["pack"]["meta"];
      room_count: number;
      enemy_count: number;
      ending_count: number;
      report: ValidationReport;
    } {
      const {
        compiled: { pack, contentHash },
        report,
      } = generatedRpg(args.seed);
      return {
        ok: report.ok,
        content_hash: contentHash,
        seed: args.seed,
        meta: pack.meta,
        room_count: pack.rooms.length,
        enemy_count: pack.enemies.length,
        ending_count: pack.endings.length,
        report,
      };
    },

    new_game<Args extends RpgNewGameArgs>(args: Args): RpgSessionPayload<Args> {
      // Mint a fresh RPG pack in-memory from `generate_rpg_seed`. The generation seed selects
      // the minted pack's theme/structure; `seed` still seeds runtime state.
      const source = resolveGameSource(root, args, "new_game");
      const compiled = requireGeneratedRpgPlayable(source.generateRpgSeed);
      return rpgRuntime.startRpgSession(compiled, args, {
        generatedRpgSeed: source.generateRpgSeed,
      });
    },

    start_world_quest<Args extends RpgStartWorldQuestArgs>(
      args: Args,
    ): RpgWorldQuestStartPayload<Args> {
      if ((args as { quest_id?: unknown }).quest_id !== undefined) {
        throw new Error("start_world_quest accepts world_quest_id, not quest_id.");
      }
      if ((args as { world_quest_id?: unknown }).world_quest_id === undefined) {
        throw new Error("start_world_quest requires world_quest_id.");
      }
      const resolved = resolveWorldQuestPackPath(args.world_quest_id);
      const started = rpgRuntime.startRpgSession(requirePlayable(resolved.packPath), args, {
        packPath: resolved.packPath,
        worldQuestId: resolved.node.id,
      });
      return {
        world: { id: resolved.world.id, name: resolved.world.name, hub: resolved.world.hub },
        quest: {
          id: resolved.node.id,
          name: resolved.node.name,
          path_from_hub: worldRouteFromHub(resolved.world, resolved.node.id) ?? [],
        },
        ...started,
      } as RpgWorldQuestStartPayload<Args>;
    },

    get_observation<Args extends RpgGetObservationArgs>(args: Args): RpgObservationResponse<Args> {
      const s = sessions.get(args.session_id);
      const stateHash = s.stateHash;
      if (args.if_state_hash !== undefined && args.if_state_hash === stateHash) {
        return rpgStateUnchanged(stateHash) as RpgObservationResponse<Args>;
      }
      const obsOpts = {
        hideGraph: args.hide_graph ?? s.hideGraph ?? false,
      };
      const obs = rpgRuntime.observationOf(s, obsOpts);
      return {
        ...rpgViewField(sessions, s, obs, args, obsOpts),
        state_hash: stateHash,
      } as RpgObservationResponse<Args>;
    },

    list_legal_actions<Args extends RpgLegalActionsArgs>(
      args: Args,
    ): RpgLegalActionsResponse<Args> {
      const s = sessions.get(args.session_id);
      const stateHash = s.stateHash;
      if (args.if_state_hash !== undefined && args.if_state_hash === stateHash) {
        return rpgStateUnchanged(stateHash) as RpgLegalActionsResponse<Args>;
      }
      const actions = rpgRuntime.legalActionsFor(s);
      return {
        actions: legalActionRowsFor(sessions, s, actions, args),
        state_hash: stateHash,
      } as RpgLegalActionsResponse<Args>;
    },

    step_action<Args extends RpgStepActionArgs>(args: Args): RpgStepActionResponse<Args> {
      return runRpgStepAction({ sessions, rpgRuntime }, args);
    },

    get_state<Args extends RpgGetStateArgs>(args: Args): RpgStateResponse<Args> {
      const s = sessions.get(args.session_id);
      const stateHash = s.stateHash;
      if (args.include_state === true) {
        return { state: s.state, state_hash: stateHash } as RpgStateResponse<Args>;
      }
      return { state_hash: stateHash } as RpgStateResponse<Args>;
    },

    get_transcript<Args extends TranscriptArgs>(args: Args): TranscriptResponse<Args> {
      const s = sessions.get(args.session_id);
      const stateHash = s.stateHash;
      const currentTranscriptHash = hashTranscript(s, stateHash);
      if (
        args.if_transcript_hash !== undefined &&
        args.if_transcript_hash === currentTranscriptHash
      ) {
        return transcriptUnchanged(stateHash, currentTranscriptHash) as TranscriptResponse<Args>;
      }
      const summary = sessions.transcriptSummary(s.id, () => ({
        steps: s.transcript.filter((t) => t.action_id !== null).length,
        scenes: [...new Set(s.transcript.flatMap((t) => [t.scene_id, t.result_scene_id]))].sort(),
        ended: s.state.ended,
        ending_id: s.state.endingId,
        inventory: [...s.state.inventory],
        flags: Object.keys(s.state.flags)
          .filter((f) => s.state.flags[f] === true && !f.startsWith("__"))
          .sort(),
        journal: [...s.state.journal],
      }));
      const response = {
        session_id: s.id,
        ...rpgSourceFields(s),
        state_hash: stateHash,
        transcript_hash: currentTranscriptHash,
        ...transcriptEventVersion(args),
        // Filter internal-bookkeeping events the same way step_action does, so the
        // transcript a player reads never surfaces `__`-prefixed vars/flags (bug_0260).
        ...(args.summary_only
          ? {}
          : {
              turns: transcriptTurnsFor(sessions, s, args),
            }),
        summary: transcriptSummaryFor(sessions, s, args, summary),
      };
      return response as unknown as TranscriptResponse<Args>;
    },

    save_game<Args extends RpgSaveArgs>(args: Args): RpgSaveResponse<Args> {
      const s = sessions.get(args.session_id);
      const stateHash = s.stateHash;
      if (args.expected_state_hash !== undefined && args.expected_state_hash !== stateHash) {
        return rpgStateHashRejection(stateHash) as RpgSaveResponse<Args>;
      }
      // The save records the pack mode so load can refuse a mode mismatch (§8.7).
      const saveMetadata = {
        ...(s.worldQuestId ? { worldQuestId: s.worldQuestId } : {}),
        ...(s.generatedRpgSeed !== undefined ? { generatedRpgSeed: s.generatedRpgSeed } : {}),
      };
      return {
        ok: true,
        save: save(s.state, s.packId, s.contentHash, SAVE_MODE, saveMetadata),
        ...rpgSourceFields(s),
        content_hash: s.contentHash,
        state_hash: stateHash,
      } as RpgSaveResponse<Args>;
    },

    load_game<Args extends RpgLoadGameArgs>(args: Args): RpgSessionPayload<Args> {
      const bundle = load(args.save, undefined, SAVE_MODE);
      const source = resolveSaveGameSource(root, args, bundle, "load_game");
      const compiled =
        source.kind === "generated"
          ? requireGeneratedRpgPlayable(source.generateRpgSeed)
          : requirePlayable(source.packPath);
      // The save was already parsed and state-gated above; bind those bytes to the
      // resolved pack hash here without reparsing the same blob.
      assertSaveContentHash(bundle, compiled.contentHash);
      const session = rpgRuntime.startSession(compiled, bundle.state, {
        ...(source.packPath ? { packPath: source.packPath } : {}),
        ...(source.worldQuestId ? { worldQuestId: source.worldQuestId } : {}),
        ...(source.generateRpgSeed !== null ? { generatedRpgSeed: source.generateRpgSeed } : {}),
        ...(args.hide_graph ? { hideGraph: true } : {}),
      });
      const openingOpts = rpgRuntime.openingObservationOptions(session);
      return {
        session_id: session.id,
        ...rpgViewField(
          sessions,
          session,
          rpgRuntime.openingObservationOf(session, openingOpts),
          args,
          openingOpts,
        ),
        ...rpgSourceFields(session),
        state_hash: session.stateHash,
      } as RpgSessionPayload<Args>;
    },

    async adapt_story(args: { premise: string }) {
      // Author a pack from a premise via the writer → adapter → validator loop
      // (§12.1–3). Uses a REAL frontier model when a provider key is present
      // (ANTHROPIC/OPENAI/GOOGLE, or AF_LLM_PROVIDER), falling back to the
      // deterministic MockAuthorProvider when none is set — so CI and key-less runs
      // stay green and offline while a keyed run exercises the genuine §1 author.
      // Mirrors bin/author.ts. Returns the story, the green/red pack, the validation
      // report, and the per-beat classification (§11). Never writes files.
      if ((args as { mode?: unknown }).mode !== undefined) {
        throw new Error("adapt_story is RPG-only; mode is no longer supported.");
      }
      const provider = resolveProvider({ mock: new MockAuthorProvider() });
      const contract = loadEngineContract();
      const story = await runWriter(provider, { premise: args.premise, contract });
      const result = await runRpgAdapter(provider, { story, contract });
      return {
        ok: result.ok,
        rounds: result.rounds,
        story: { title: story.title, beats: story.beats.map((b) => b.id) },
        classifications: result.classifications,
        pack: result.ok ? result.pack : undefined,
        report: result.report,
      };
    },

    replay_trace(args: { trace_path: string; world_quest_id?: string; pack_path?: never }) {
      const traceAbs = safeResolve(root, args.trace_path);
      const trace = JSON.parse(readFileSync(traceAbs, "utf8")) as Trace<RpgAction>;
      assertTraceMode(trace);
      const { compiled } = resolveTraceSource(args, trace, "replay_trace");
      if (trace.content_hash !== compiled.contentHash) {
        return {
          ok: false,
          message: `Trace was recorded against content ${trace.content_hash}, but the pack is ${compiled.contentHash}.`,
        };
      }
      // §16 integrity at load: trace.initial_state came off an UNTRUSTED file (the
      // content-hash check above guards WHICH pack, not WHETHER the state is well-
      // formed). Gate it the same way a loaded save is gated, BEFORE any engine call.
      assertWellFormedState(trace.initial_state);
      const { index, rules } = rpgRuntime.runtimeFor(compiled.pack);
      assertRpgStateReferences(index, trace.initial_state);
      // Replay asserts the recorded final hash, and — for a Trace-v2 trace that
      // also carries `per_step_hashes` — localizes the FIRST divergent action via
      // `divergedAtStep` (returned straight through). A v1 trace (final hash only)
      // surfaces ok/final/expected as before.
      return replayTrace(trace, rules);
    },

    inspect_trace(args: { trace_path: string; world_quest_id?: string; pack_path?: never }) {
      // Summarize a recorded trace and surface suspected bugs (§9.4). Replays the
      // actions through the engine for a per-step location/event summary, asserts
      // the recorded final hash, localizes the first divergent step when the trace
      // carries a Trace-v2 per-step baseline (§8.8), and runs the debugger's
      // classifier (§12.5).
      const traceAbs = safeResolve(root, args.trace_path);
      const trace = JSON.parse(readFileSync(traceAbs, "utf8")) as Trace<RpgAction>;
      assertTraceMode(trace);
      const source = resolveTraceSource(args, trace, "inspect_trace");
      const { compiled } = source;
      if (trace.content_hash !== compiled.contentHash) {
        return {
          ok: false,
          message: `Trace content ${trace.content_hash} ≠ pack ${compiled.contentHash}.`,
        };
      }
      // §16 integrity at load: same untrusted-file gate as replay_trace — the state
      // is fed RAW into the per-step loop (let state = trace.initial_state) and into
      // diagnose() below, so it must be well-formed + referentially sound first.
      assertWellFormedState(trace.initial_state);
      const { index, rules, step } = rpgRuntime.runtimeFor(compiled.pack);
      assertRpgStateReferences(index, trace.initial_state);
      let state = trace.initial_state;
      const steps: {
        i: number;
        action: RpgAction;
        ok: boolean;
        location: string;
        ended: boolean;
        ending_id: string | null;
      }[] = [];
      trace.actions.forEach((action, i) => {
        const r = step(state, action);
        state = r.state;
        steps.push({
          i,
          action,
          ok: r.ok,
          location: state.current,
          ended: state.ended,
          ending_id: state.endingId,
        });
      });
      const replay = replayTrace(trace, rules);
      const d = diagnose(rules, trace.initial_state, trace.actions);
      return {
        ok: true,
        world_quest_id: source.worldQuestId,
        content_hash: trace.content_hash,
        seed: trace.seed,
        steps: trace.actions.length,
        hash_ok: replay.ok,
        final_hash: replay.finalHash,
        expected_final_hash: replay.expectedFinalHash ?? null,
        // The first action whose post-state diverged from the trace's Trace-v2
        // per-step baseline (index into step_summary / actions), or null when the
        // trace is faithful or carries no per-step baseline (v1). This catches a
        // mid-trace divergence that a self-correcting final hash would miss.
        diverged_at_step: replay.divergedAtStep ?? null,
        diagnosis: d,
        step_summary: steps,
      };
    },

    apply_content_patch(args: {
      world_quest_id?: string;
      pack_path?: never;
      proposal: ContentPatchProposal;
    }) {
      // Apply a structured patch with deterministic code and return the modified
      // pack + validation report (§9.4, §12.5). The model never writes files: a
      // patch is data, validated before it can be played (§16). The fixer is RPG-only,
      // matching the public catalog and runtime.
      const source = resolvePackSource(root, args, "apply_content_patch");
      const proposal = ContentPatchProposalSchema.parse(args.proposal);
      const abs = safeResolve(root, source.packPath);
      const loaded = loadRpgPackFile(abs);
      if (!loaded.ok) {
        return {
          ok: false,
          world_quest_id: source.worldQuestId,
          report: makeReport(source.packPath, [
            {
              severity: "error" as const,
              code: "SCHEMA",
              message: "pack failed to compile",
              where: [source.packPath],
            },
          ]),
        };
      }
      const result = applyContentPatch(loaded.compiled.pack, proposal);
      return result.ok
        ? {
            ok: true,
            world_quest_id: source.worldQuestId,
            applied: result.applied,
            report: result.report,
            pack: result.pack,
          }
        : {
            ok: false,
            world_quest_id: source.worldQuestId,
            report: result.report,
          };
    },
  };
}
