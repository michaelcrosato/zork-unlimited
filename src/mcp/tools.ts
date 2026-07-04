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
import { makeStep, type Rules } from "../core/engine.js";
import type { RpgAction } from "../api/types.js";
import type { GameState } from "../core/state.js";

import { compileRpgPack, loadRpgPackFile, type CompiledRpgPack } from "../rpg/pack.js";
import { generateRpgPack } from "../gen/rpg_generator.js";
import type { RpgPack } from "../rpg/schema.js";
import {
  indexRpgPack,
  buildRpgRules,
  initStateForRpgPack,
  enumerateRpgActions,
  type RpgIndex,
} from "../rpg/runner.js";
import type { RpgActionOption } from "../rpg/legal_actions.js";
import {
  buildRpgObservation,
  type ObservationOptions,
  type RpgObservation,
} from "../rpg/observation.js";
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
import { SessionStore, type RpgStep, type Session, type TranscriptSummary } from "./sessions.js";
import { isRpgPackShape, type McpActionOption, type McpObservation } from "./types.js";
import { RPG_COMPACT_EVENT_VERSION, type RpgCompactEvent } from "./compact_rpg_event.js";
import type { RpgCompactObservation } from "./compact_rpg_observation.js";
import {
  hashTranscript,
  rpgStepEventVersion,
  rpgStepEvents,
  transcriptEventVersion,
  transcriptSummaryFor,
  transcriptTurnsFor,
  transcriptUnchanged,
  type RpgStepEvents,
  type RpgStepEventVersion,
} from "./transcript_projection.js";
import {
  legalActionRowsFor,
  rpgViewField,
  type RpgObservationViewOptions,
} from "./rpg_view_projection.js";
import {
  OverworldMcpSessionStore,
  overworldReadUnchanged,
  overworldSnapshotHashRejection,
  type OverworldMcpReadUnchanged,
  type OverworldMcpRejectedSessionPayload,
  type OverworldMcpResponseOptions,
  type OverworldMcpSessionResponse,
  type OverworldMcpViewField,
} from "./overworld_sessions.js";
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
import { type OverworldManifest, type OverworldNode } from "../world/overworld.js";
import {
  type OverworldActionResult,
  type OverworldAreaTravelResult,
  type OverworldQuestCompletionResult,
  type OverworldRoadEncounterResult,
  type OverworldRoadEncounterStrategy,
  type OverworldSessionSnapshot,
  type OverworldSessionRoutePlan,
  type OverworldServiceResult,
  type OverworldQuestView,
  type OverworldView,
  type TravelLogEntry,
} from "../world/session.js";
import {
  compactOverworldQuestRef,
  compactRouteOption,
  compactTravelLogEntry,
  type OverworldCompactQuestRef,
  type OverworldCompactRouteOption,
  type OverworldCompactTravelLogEntry,
  type OverworldCompactView,
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

type RpgRuntimeCacheEntry = {
  index: RpgIndex;
  rules: Rules<RpgAction>;
  step: RpgStep;
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

type OverworldStartResponse<Args extends OverworldResponseOptions> = {
  session_id: string;
  snapshot_hash: string;
} & OverworldViewField<Args>;

type OverworldRestoreResponse<Args extends OverworldResponseOptions> = {
  ok: true;
  session_id: string;
  snapshot_hash: string;
} & OverworldViewField<Args>;

type OverworldExportArgs = {
  session_id: string;
  expected_snapshot_hash?: string;
};

type OverworldExportSuccess = {
  ok: true;
  session_id: string;
  snapshot_hash: string;
  snapshot: OverworldSessionSnapshot;
};

type OverworldExportRejection = {
  ok: false;
  snapshot_hash: string;
  rejection_reason: string;
};

type OverworldExportResponse<Args extends OverworldExportArgs> = Args extends {
  expected_snapshot_hash: string;
}
  ? OverworldExportSuccess | OverworldExportRejection
  : OverworldExportSuccess;

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

type RpgStateUnchanged = {
  state_hash: string;
  unchanged: true;
};
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

type RpgStepActionBase<Args extends RpgViewOptions & RpgEventOptions> = {
  events: RpgStepEvents<Args>;
  state_hash: string;
} & RpgStepEventVersion<Args> &
  RpgViewField<Args>;

type RpgStateHashRejection = {
  ok: false;
  state_hash: string;
  rejection_reason: string;
};
type RpgStepGuardRejection = RpgStateHashRejection;

type RpgStepResponseOptions = RpgViewOptions & RpgEventOptions & { expected_state_hash?: string };

type RpgStepActionResponse<Args extends RpgStepResponseOptions> =
  | ({ ok: true } & RpgStepActionBase<Args>)
  | ({ ok: false; rejection_reason: string } & RpgStepActionBase<Args>)
  | (Args extends { expected_state_hash: string } ? RpgStepGuardRejection : never);

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

const RPG_STATE_HASH_MISMATCH_REASON =
  "State hash mismatch; refresh the current observation or action menu.";

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

type OverworldContextPayload = {
  ok: true;
  session_id: string;
  snapshot_hash: string;
  context: OverworldCompactView;
};

type OverworldReadArgs = {
  session_id: string;
  if_snapshot_hash?: string;
};

type OverworldReadUnchanged = OverworldMcpReadUnchanged;

type OverworldFullReadPayload = {
  session_id: string;
  snapshot_hash: string;
  observation: OverworldView;
};

type OverworldReadResponse<Args extends OverworldReadArgs> = Args extends {
  if_snapshot_hash: string;
}
  ? OverworldFullReadPayload | OverworldReadUnchanged
  : OverworldFullReadPayload;

type OverworldContextResponse<Args extends OverworldReadArgs> = Args extends {
  if_snapshot_hash: string;
}
  ? OverworldContextPayload | OverworldReadUnchanged
  : OverworldContextPayload;

function rpgStateUnchanged(stateHash: string): RpgStateUnchanged {
  return {
    state_hash: stateHash,
    unchanged: true,
  };
}

function rpgStateHashRejection(stateHash: string): RpgStateHashRejection {
  return {
    ok: false,
    state_hash: stateHash,
    rejection_reason: RPG_STATE_HASH_MISMATCH_REASON,
  };
}

function indexFor(pack: CompiledRpgPack["pack"]): RpgIndex {
  return indexRpgPack(pack);
}

function rulesFor(index: RpgIndex): Rules<RpgAction> {
  return buildRpgRules(index);
}

function initStateFor(index: RpgIndex, seed: number): GameState {
  return initStateForRpgPack(index, seed);
}

function buildObsFor(
  index: RpgIndex,
  state: GameState,
  opts: ObservationOptions = {},
): RpgObservation {
  return buildRpgObservation(index, state, opts);
}

/** The current RPG room id. */
function obsLocation(obs: RpgObservation): string {
  return obs.room;
}

function rpgRoomTitle(index: RpgIndex, state: GameState): string {
  return index.rooms.get(state.current)?.name ?? state.current;
}

function rpgStateTitle(index: RpgIndex, state: GameState): string {
  if (state.ended && state.endingId) {
    return (
      index.pack.endings.find((ending) => ending.id === state.endingId)?.title ?? state.endingId
    );
  }
  return rpgRoomTitle(index, state);
}

/**
 * Map an action id from the RPG runner's legal set to a structured Action.
 * Unknown ids are rejected before they reach the reducer, preserving the illegal
 * action / no state-change path.
 */
function actionOptionForId(
  actions: readonly RpgActionOption[],
  id: string,
): RpgActionOption | null {
  return actions.find((action) => action.id === id) ?? null;
}

function rpgSourceFields(source: {
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
  const rpgRuntimeCache = new WeakMap<RpgPack, RpgRuntimeCacheEntry>();
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

  function runtimeFor(pack: RpgPack): RpgRuntimeCacheEntry {
    const cached = rpgRuntimeCache.get(pack);
    if (cached) return cached;
    const index = indexFor(pack);
    const rules = rulesFor(index);
    const entry = { index, rules, step: makeStep(rules) };
    rpgRuntimeCache.set(pack, entry);
    return entry;
  }

  function legalActionsFor(s: Session): RpgActionOption[] {
    return sessions.legalActions(s.id, () => enumerateRpgActions(s.index, s.state));
  }

  function sessionObsOf(s: Session, opts: ObservationOptions = {}): RpgObservation {
    return sessions.observation(s.id, opts, () =>
      buildObsFor(s.index, s.state, {
        ...opts,
        availableActions: legalActionsFor(s),
      }),
    );
  }

  function startSession(
    compiled: CompiledRpgPack,
    state?: GameState,
    opts: {
      hideGraph?: boolean;
      packPath?: string;
      worldQuestId?: string | null;
      generatedRpgSeed?: number | null;
      seed?: number;
    } = {},
  ): Session {
    const { index, rules, step } = runtimeFor(compiled.pack);
    const st = state ?? initStateFor(index, opts.seed ?? 1);
    // §16 integrity at load: a PROVIDED state is untrusted (it came off a save
    // file via load_game), so its `current`/`endingId` must name symbols that
    // exist in THIS pack before it is handed to the engine. A freshly-built init
    // state (state === undefined) is trusted and skipped. Rejects, never coerces.
    if (state !== undefined) assertRpgStateReferences(index, st);
    const session = sessions.create({
      packId: compiled.pack.meta.id,
      contentHash: compiled.contentHash,
      ...(opts.packPath ? { packPath: opts.packPath } : {}),
      ...(opts.worldQuestId ? { worldQuestId: opts.worldQuestId } : {}),
      ...(opts.generatedRpgSeed !== undefined && opts.generatedRpgSeed !== null
        ? { generatedRpgSeed: opts.generatedRpgSeed }
        : {}),
      index,
      rules,
      step,
      state: st,
      transcript: [],
      ...(opts.hideGraph ? { hideGraph: true } : {}),
    });
    sessions.appendTranscript(session.id, {
      step: st.step,
      scene_id: st.current,
      title: rpgStateTitle(index, st),
      action_id: null,
      action_text: null,
      events: [],
      result_scene_id: st.current,
      ended: st.ended,
      ending_id: st.endingId,
    });
    return session;
  }

  const openingObservationOptions = (s: Session): RpgObservationViewOptions => ({
    hideGraph: s.hideGraph ?? false,
    includeWorldIntro: true,
  });

  const openingObsOf = (s: Session, opts = openingObservationOptions(s)): RpgObservation =>
    sessionObsOf(s, opts);

  function startRpgSession<Args extends RpgViewOptions>(
    compiled: CompiledRpgPack,
    args: Args & { seed?: number; hide_graph?: boolean },
    source: { packPath?: string; worldQuestId?: string; generatedRpgSeed?: number | null },
  ): RpgSessionPayload<Args> {
    const session = startSession(compiled, undefined, {
      seed: args.seed ?? 1,
      ...(args.hide_graph ? { hideGraph: true } : {}),
      ...(source.packPath ? { packPath: source.packPath } : {}),
      ...(source.worldQuestId ? { worldQuestId: source.worldQuestId } : {}),
      ...(source.generatedRpgSeed !== undefined && source.generatedRpgSeed !== null
        ? { generatedRpgSeed: source.generatedRpgSeed }
        : {}),
    });
    const openingOpts = openingObservationOptions(session);
    return {
      session_id: session.id,
      ...rpgViewField(sessions, session, openingObsOf(session, openingOpts), args, openingOpts),
      ...rpgSourceFields(session),
      state_hash: session.stateHash,
    } as RpgSessionPayload<Args>;
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

  function resolveRequiredWorldQuestId(
    args: { world_quest_id?: string },
    operation: string,
  ): string {
    if ((args as { pack_path?: unknown }).pack_path !== undefined) {
      throw new Error(`${operation} accepts world_quest_id, not pack_path.`);
    }
    if ((args as { quest_path?: unknown }).quest_path !== undefined) {
      throw new Error(`${operation} accepts world_quest_id, not quest_path.`);
    }
    if ((args as { quest_id?: unknown }).quest_id !== undefined) {
      throw new Error(`${operation} accepts world_quest_id, not quest_id.`);
    }
    if (args.world_quest_id === undefined) {
      throw new Error(`${operation} requires world_quest_id.`);
    }
    return args.world_quest_id;
  }

  function validateWorldQuest(worldQuestId: string): {
    ok: boolean;
    world_quest_id: string | null;
    report: ValidationReport;
  } {
    const source = resolveWorldQuestPackPath(worldQuestId);
    const lr = loadAndReport(source.packPath);
    return {
      ok: lr.report.ok,
      world_quest_id: source.node.id,
      report: lr.report,
    };
  }

  function loadWorldQuest(worldQuestId: string): {
    ok: boolean;
    world_quest_id: string | null;
    meta?: CompiledRpgPack["pack"]["meta"];
    content_hash?: string;
    report: ValidationReport;
  } {
    const source = resolveWorldQuestPackPath(worldQuestId);
    const lr = loadAndReport(source.packPath);
    if (!lr.ok) {
      return {
        ok: false,
        world_quest_id: source.node.id,
        report: lr.report,
      };
    }
    return {
      ok: lr.report.ok,
      world_quest_id: source.node.id,
      meta: lr.compiled.pack.meta,
      content_hash: lr.compiled.contentHash,
      report: lr.report,
    };
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
      const created = overworldSessions.create();
      return {
        session_id: created.session_id,
        snapshot_hash: overworldSessions.snapshotHash(created.session),
        ...overworldSessions.viewField(responseOptions, created.session),
      } as OverworldStartResponse<Args>;
    },

    get_overworld_session<Args extends OverworldReadArgs>(args: Args): OverworldReadResponse<Args> {
      const session = overworldSessions.get(args.session_id);
      const snapshotHash = overworldSessions.snapshotHash(session);
      if (args.if_snapshot_hash !== undefined && args.if_snapshot_hash === snapshotHash) {
        return overworldReadUnchanged(snapshotHash) as OverworldReadResponse<Args>;
      }
      return {
        session_id: args.session_id,
        snapshot_hash: snapshotHash,
        observation: session.view(),
      } as OverworldReadResponse<Args>;
    },

    get_overworld_session_context<Args extends OverworldReadArgs>(
      args: Args,
    ): OverworldContextResponse<Args> {
      const session = overworldSessions.get(args.session_id);
      const snapshotHash = overworldSessions.snapshotHash(session);
      if (args.if_snapshot_hash !== undefined && args.if_snapshot_hash === snapshotHash) {
        return overworldReadUnchanged(snapshotHash) as OverworldContextResponse<Args>;
      }
      return {
        ok: true,
        session_id: args.session_id,
        snapshot_hash: snapshotHash,
        context: session.compactView(),
      } as OverworldContextResponse<Args>;
    },

    export_overworld_session<Args extends OverworldExportArgs>(
      args: Args,
    ): OverworldExportResponse<Args> {
      const session = overworldSessions.get(args.session_id);
      const snapshotHash = overworldSessions.snapshotHash(session);
      if (
        args.expected_snapshot_hash !== undefined &&
        args.expected_snapshot_hash !== snapshotHash
      ) {
        return overworldSnapshotHashRejection(snapshotHash) as OverworldExportResponse<Args>;
      }
      const snapshot = session.snapshot();
      return {
        ok: true,
        session_id: args.session_id,
        snapshot_hash: snapshotHash,
        snapshot,
      } as OverworldExportResponse<Args>;
    },

    restore_overworld_session<Args extends { snapshot: unknown } & OverworldResponseOptions>(
      args: Args,
    ): OverworldRestoreResponse<Args> {
      const restored = overworldSessions.restore(args.snapshot);
      return {
        ok: true,
        session_id: restored.session_id,
        snapshot_hash: overworldSessions.snapshotHash(restored.session),
        ...overworldSessions.viewField(args, restored.session),
      } as OverworldRestoreResponse<Args>;
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
      const session = overworldSessions.get(args.session_id);
      const currentSnapshotHash = overworldSessions.snapshotHash(session);
      if (
        args.expected_snapshot_hash !== undefined &&
        args.expected_snapshot_hash !== currentSnapshotHash
      ) {
        return overworldSnapshotHashRejection(
          currentSnapshotHash,
        ) as OverworldQuestStartResponse<Args>;
      }
      const quest = session.startQuest(args.quest_id);
      const rpgSession = this.start_world_quest({
        world_quest_id: quest.id,
        ...(args.seed !== undefined ? { seed: args.seed } : {}),
        ...(args.hide_graph ? { hide_graph: true } : {}),
        ...(args.compact_actions ? { compact_actions: true } : {}),
        ...(args.compact_observation ? { compact_observation: true } : {}),
      } as RpgStartWorldQuestArgs & Args);
      sessions.get(rpgSession.session_id).overworldSessionId = args.session_id;
      const questResult = args.compact_result === true ? compactOverworldQuestRef(quest) : quest;
      return {
        ok: true,
        session_id: args.session_id,
        snapshot_hash: overworldSessions.snapshotHash(session),
        quest: questResult,
        rpg_session_id: rpgSession.session_id,
        rpg_session: rpgSession,
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
          const rpgSession = sessions.get(args.rpg_session_id);
          if (!rpgSession.worldQuestId) {
            throw new Error("Only shipped world quest RPG sessions can complete overworld quests.");
          }
          if (rpgSession.overworldSessionId !== args.session_id) {
            throw new Error("RPG quest session was not started from this overworld session.");
          }
          if (!rpgSession.state.ended || !rpgSession.state.endingId) {
            throw new Error("RPG quest session has not ended yet.");
          }
          const ending = rpgSession.index.pack.endings.find(
            (candidate) => candidate.id === rpgSession.state.endingId,
          );
          if (!ending) {
            throw new Error(`RPG quest ended at unknown ending "${rpgSession.state.endingId}".`);
          }
          return session.completeQuest(rpgSession.worldQuestId, {
            endingId: ending.id,
            endingTitle: ending.title,
            death: ending.death,
          });
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
      return validateWorldQuest(resolveRequiredWorldQuestId(args, "validate_quest"));
    },

    load_quest(args: { world_quest_id?: string }): {
      ok: boolean;
      world_quest_id: string | null;
      meta?: CompiledRpgPack["pack"]["meta"];
      content_hash?: string;
      report: ValidationReport;
    } {
      return loadWorldQuest(resolveRequiredWorldQuestId(args, "load_quest"));
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
      meta: RpgPack["meta"];
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
      return startRpgSession(compiled, args, { generatedRpgSeed: source.generateRpgSeed });
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
      const started = startRpgSession(requirePlayable(resolved.packPath), args, {
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
      const obs = sessionObsOf(s, obsOpts);
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
      const actions = sessions.legalActions(s.id, () => enumerateRpgActions(s.index, s.state));
      return {
        actions: legalActionRowsFor(sessions, s, actions, args),
        state_hash: stateHash,
      } as RpgLegalActionsResponse<Args>;
    },

    step_action<Args extends RpgStepActionArgs>(args: Args): RpgStepActionResponse<Args> {
      const s = sessions.get(args.session_id);
      const currentStateHash = s.stateHash;
      if (args.expected_state_hash !== undefined && args.expected_state_hash !== currentStateHash) {
        return rpgStateHashRejection(currentStateHash) as RpgStepActionResponse<Args>;
      }
      const actionOptions = sessions.legalActions(s.id, () =>
        enumerateRpgActions(s.index, s.state),
      );
      const actionOption = actionOptionForId(actionOptions, args.action_id);
      const beforeStep = s.state.step;
      const beforeSceneId = s.state.current;
      const beforeTitle = rpgRoomTitle(s.index, s.state);
      if (actionOption === null) {
        const beforeObsOpts = {
          hideGraph: args.hide_graph ?? s.hideGraph ?? false,
        };
        const before = sessionObsOf(s, beforeObsOpts);
        // Unknown action ids never reach the engine.
        return {
          ok: false,
          rejection_reason: "That action is not available right now.",
          events: rpgStepEvents(
            [{ type: "rejected" as const, reason: "That action is not available right now." }],
            args,
          ),
          ...rpgStepEventVersion(args),
          ...rpgViewField(sessions, s, before, args, beforeObsOpts),
          state_hash: currentStateHash,
        } as RpgStepActionResponse<Args>;
      }
      const result = s.step(s.state, actionOption.action);
      sessions.update(s.id, result.state);
      const afterObsOpts = {
        hideGraph: args.hide_graph ?? s.hideGraph ?? false,
      };
      const after = sessionObsOf(s, afterObsOpts);
      sessions.appendTranscript(s.id, {
        step: beforeStep,
        scene_id: beforeSceneId,
        title: beforeTitle,
        action_id: args.action_id,
        action_text: actionOption.command,
        events: result.events,
        result_scene_id: obsLocation(after),
        ended: after.ended,
        ending_id: after.ending_id,
      });
      if (!result.ok) {
        return {
          ok: false,
          rejection_reason: result.rejectionReason ?? "Action rejected.",
          events: rpgStepEvents(result.events, args),
          ...rpgStepEventVersion(args),
          ...rpgViewField(sessions, s, after, args, afterObsOpts),
          state_hash: s.stateHash,
        } as RpgStepActionResponse<Args>;
      }
      return {
        ok: true,
        events: rpgStepEvents(result.events, args),
        ...rpgStepEventVersion(args),
        ...rpgViewField(sessions, s, after, args, afterObsOpts),
        state_hash: s.stateHash,
      } as RpgStepActionResponse<Args>;
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
      const session = startSession(compiled, bundle.state, {
        ...(source.packPath ? { packPath: source.packPath } : {}),
        ...(source.worldQuestId ? { worldQuestId: source.worldQuestId } : {}),
        ...(source.generateRpgSeed !== null ? { generatedRpgSeed: source.generateRpgSeed } : {}),
        ...(args.hide_graph ? { hideGraph: true } : {}),
      });
      const openingOpts = openingObservationOptions(session);
      return {
        session_id: session.id,
        ...rpgViewField(sessions, session, openingObsOf(session, openingOpts), args, openingOpts),
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
      const { index, rules } = runtimeFor(compiled.pack);
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
      const { index, rules } = runtimeFor(compiled.pack);
      assertRpgStateReferences(index, trace.initial_state);
      const step = makeStep(rules);
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
