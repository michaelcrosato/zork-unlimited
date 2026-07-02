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
import type { GameEvent } from "../core/events.js";

import { compileRpgPack, loadRpgPackFile, type CompiledRpgPack } from "../rpg/pack.js";
import { generateRpgPack } from "../gen/rpg_generator.js";
import type { RpgPack } from "../rpg/schema.js";
import { indexRpgPack, buildRpgRules, initStateForRpgPack, type RpgIndex } from "../rpg/runner.js";
import { buildRpgObservation, type RpgObservation } from "../rpg/observation.js";
import { validateRpg } from "../validate/rpg_validator.js";
import { assertRpgStateReferences } from "../rpg/state_integrity.js";

import {
  makeReport,
  formatReport,
  type Finding,
  type ValidationReport,
} from "../validate/report.js";
import { SAVE_MODE, save, load, assertWellFormedState } from "../persist/save_load.js";
import { assertTraceMode, replayTrace } from "../trace/replay.js";
import type { Trace } from "../trace/record.js";
import { safeResolve } from "./paths.js";
import { SessionStore, type Session } from "./sessions.js";
import {
  isRpgPackShape,
  type PackMode,
  type McpActionOption,
  type McpObservation,
} from "./types.js";
import { compactRpgObservation, type RpgCompactObservation } from "./compact_rpg_observation.js";
import type { WorldBinding, WorldManifest } from "../world/schema.js";
import {
  normalizePackPath,
  worldQuestNodeById,
  worldQuestNodeForPack,
  worldRouteFromHub,
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
  OverworldSession,
  type OverworldActionResult,
  type OverworldAreaTravelResult,
  type OverworldRoadEncounterResult,
  type OverworldRoadEncounterStrategy,
  type OverworldSessionSnapshot,
  type OverworldSessionRoutePlan,
  type OverworldServiceResult,
  type OverworldQuestView,
  type OverworldView,
  type TravelLogEntry,
} from "../world/session.js";
import { compactOverworldView, type OverworldCompactView } from "../world/compact_view.js";
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

type WorldQuestSourceEntry = {
  path: string;
  id: string;
  title: string;
  mode: PackMode | null;
  playable: boolean;
  world: WorldBinding | null;
  world_quest_id: string | null;
};

type PublicWorldGraphNode = Omit<WorldManifest["graph"]["nodes"][number], "pack">;

type PublicWorldGraph = Omit<WorldManifest["graph"], "nodes" | "edges"> & {
  nodes: PublicWorldGraphNode[];
  edges: WorldManifest["graph"]["edges"];
};

type PublicWorldSummary = Pick<WorldManifest, "id" | "name" | "hub">;

type WorldListOptions = {
  include_graph?: boolean;
  include_routes?: boolean;
};

type WorldQuestCatalogEntry = {
  id: string;
  title: string;
  mode: PackMode | null;
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

type OverworldSessionPayload<Key extends string, Value> = {
  ok: true;
  session_id: string;
  snapshot_hash: string;
  observation: OverworldView;
} & { [P in Key]: Value };

type OverworldCompactSessionPayload<Key extends string, Value> = {
  ok: true;
  session_id: string;
  snapshot_hash: string;
  context: OverworldCompactView;
} & { [P in Key]: Value };

type OverworldResponseOptions = {
  compact_context?: boolean;
};

type OverworldListOptions = {
  include_design_notes?: boolean;
};

type RpgResponseOptions = {
  compact_actions?: boolean;
  compact_observation?: boolean;
};

type OverworldViewField<Args extends OverworldResponseOptions> = Args extends {
  compact_context: true;
}
  ? { context: OverworldCompactView }
  : { observation: OverworldView };

type OverworldStartResponse<Args extends OverworldResponseOptions> = {
  session_id: string;
  snapshot_hash: string;
} & OverworldViewField<Args>;

type OverworldRestoreResponse<Args extends OverworldResponseOptions> = {
  ok: true;
  session_id: string;
  snapshot_hash: string;
} & OverworldViewField<Args>;

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

type RpgViewField<Args extends RpgResponseOptions> = Args extends {
  compact_observation: true;
}
  ? { context: RpgCompactObservation }
  : { observation: McpObservation };

type RpgSessionPayload<Args extends RpgResponseOptions = RpgResponseOptions> = {
  session_id: string;
  mode: PackMode;
  world_quest_id: string | null;
  generated_rpg_seed: number | null;
  state_hash: string;
} & RpgViewField<Args>;

type RpgObservationResponse<Args extends RpgResponseOptions> = {
  state_hash: string;
} & RpgViewField<Args>;

type RpgStepActionResponse<Args extends RpgResponseOptions> = {
  ok: boolean;
  rejection_reason: string | null;
  events: ReturnType<typeof playerVisibleEvents>;
  state_hash: string;
} & RpgViewField<Args>;

type RpgNewGameArgs = {
  world_quest_id?: string;
  generate_rpg_seed?: number;
  seed?: number;
  hide_graph?: boolean;
} & RpgResponseOptions;

type RpgStartWorldQuestArgs = {
  quest_id: string;
  seed?: number;
  hide_graph?: boolean;
} & RpgResponseOptions;

type RpgStartQuestArgs = {
  quest_id?: string;
  world_quest_id?: string;
  seed?: number;
  hide_graph?: boolean;
} & RpgResponseOptions;

type RpgGetObservationArgs = {
  session_id: string;
  hide_graph?: boolean;
} & RpgResponseOptions;

type RpgStepActionArgs = {
  session_id: string;
  action_id: string;
  hide_graph?: boolean;
} & RpgResponseOptions;

type RpgChooseOptionArgs = {
  session_id: string;
  option_id: string;
  hide_graph?: boolean;
} & RpgResponseOptions;

type RpgLoadGameArgs = {
  world_quest_id?: string;
  generate_rpg_seed?: number;
  pack_path?: never;
  save: string;
  hide_graph?: boolean;
} & RpgResponseOptions;

type RpgWorldQuestStartPayload<Args extends RpgResponseOptions> = {
  world: { id: string; name: string; hub: string };
  quest: {
    id: string;
    name: string;
    path_from_hub: WorldRouteStep[];
  };
} & RpgSessionPayload<Args>;

type OverworldQuestStartResponse<Args extends OverworldResponseOptions & RpgResponseOptions> = {
  ok: true;
  session_id: string;
  snapshot_hash: string;
  quest: OverworldQuestView;
  rpg_session_id: string;
  rpg_session: RpgSessionPayload<Args>;
} & OverworldViewField<Args>;

type TranscriptFullTurn = Session["transcript"][number];
type TranscriptCompactTurn = Pick<
  TranscriptFullTurn,
  "step" | "scene_id" | "action_id" | "result_scene_id" | "ended" | "ending_id"
>;
type TranscriptSummary = {
  steps: number;
  scenes: string[];
  ended: boolean;
  ending_id: string | null;
  inventory: string[];
  flags: string[];
  journal: string[];
  more?: {
    scenes?: number;
    inventory?: number;
    flags?: number;
    journal?: number;
  };
};
type TranscriptResponse<Turn> = {
  session_id: string;
  pack_id: string;
  world_quest_id: string | null;
  generated_rpg_seed: number | null;
  mode: typeof SAVE_MODE;
  turns: Turn[];
  summary: TranscriptSummary;
};
type TranscriptArgs = {
  session_id: string;
  summary_only?: boolean;
  compact_turns?: boolean;
  compact_summary?: boolean;
};
type TranscriptTurnFor<Args extends TranscriptArgs> = Args extends { compact_turns: true }
  ? TranscriptCompactTurn
  : TranscriptFullTurn;

type OverworldSessionResponse<
  Key extends string,
  Value,
  Args extends OverworldResponseOptions,
> = Args extends { compact_context: true }
  ? OverworldCompactSessionPayload<Key, Value>
  : OverworldSessionPayload<Key, Value>;

type OverworldContextPayload = {
  ok: true;
  session_id: string;
  snapshot_hash: string;
  context: OverworldCompactView;
};

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
  opts: { hideGraph?: boolean; includeWorldIntro?: boolean } = {},
): RpgObservation {
  return buildRpgObservation(index, state, opts);
}

const TRANSCRIPT_SUMMARY_LIST_LIMIT = 16;
const TRANSCRIPT_SUMMARY_JOURNAL_LIMIT = 5;

function compactTranscriptHead(values: readonly string[], limit: number): string[] {
  return values.slice(0, limit);
}

function compactTranscriptRecent(values: readonly string[], limit: number): string[] {
  return values.slice(Math.max(0, values.length - limit));
}

function transcriptOmittedCount(
  values: readonly string[],
  compacted: readonly string[],
): number | undefined {
  return values.length > compacted.length ? values.length - compacted.length : undefined;
}

function compactTranscriptSummary(summary: TranscriptSummary): TranscriptSummary {
  const scenes = compactTranscriptHead(summary.scenes, TRANSCRIPT_SUMMARY_LIST_LIMIT);
  const inventory = compactTranscriptHead(summary.inventory, TRANSCRIPT_SUMMARY_LIST_LIMIT);
  const flags = compactTranscriptHead(summary.flags, TRANSCRIPT_SUMMARY_LIST_LIMIT);
  const journal = compactTranscriptRecent(summary.journal, TRANSCRIPT_SUMMARY_JOURNAL_LIMIT);
  const omittedScenes = transcriptOmittedCount(summary.scenes, scenes);
  const omittedInventory = transcriptOmittedCount(summary.inventory, inventory);
  const omittedFlags = transcriptOmittedCount(summary.flags, flags);
  const omittedJournal = transcriptOmittedCount(summary.journal, journal);
  const more = {
    ...(omittedScenes !== undefined ? { scenes: omittedScenes } : {}),
    ...(omittedInventory !== undefined ? { inventory: omittedInventory } : {}),
    ...(omittedFlags !== undefined ? { flags: omittedFlags } : {}),
    ...(omittedJournal !== undefined ? { journal: omittedJournal } : {}),
  };
  return {
    ...summary,
    scenes,
    inventory,
    flags,
    journal,
    ...(Object.keys(more).length > 0 ? { more } : {}),
  };
}

/** The current RPG room id. */
function obsLocation(obs: RpgObservation): string {
  return obs.room;
}

/**
 * Strip internal-bookkeeping `state_change` events from the player-facing event
 * stream (bug_0260, a blind-playtest finding). Some engine effects write `__`-
 * prefixed vars/flags that exist only to drive mechanics, never to be read by the
 * player: the per-enemy HP tracker `__enemy_hp_<id>` (rpg/schema enemyHpVar, set
 * each combat round) and the dialogue-progress flag `__dlg_<npc>`.
 * observation.ts ALREADY hides these from `state.flags`/`state.vars` (and
 * get_transcript's summary.flags filters them too), but the raw `events` array
 * returned by step_action — and recorded in the transcript get_transcript shows —
 * still surfaced them as `set_var`/`set_flag` state_change events, leaking
 * `__enemy_hp_barrow_wight` / `__dlg_reaver_shade` into a source-blind player's
 * view (sunken_barrow seed 13 §4, ai-runs/2026-06-04T23-46-24-371Z/playtest.md).
 * The legible combat/dialogue NARRATION events ("You strike … it has N HP left")
 * are not `__`-prefixed and are untouched, so the player loses no information.
 * This filters DISPLAY ONLY: the engine's effects, the stored GameState, and the
 * state_hash are unchanged (determinism/save integrity §8.5/§8.7 hold), and the
 * engine-level `result.events` stays complete for tests, traces, and debugging.
 */
function playerVisibleEvents(events: GameEvent[]): GameEvent[] {
  return events.filter((e) => {
    if (e.type !== "state_change") return true;
    const sc = e as { flag?: unknown; name?: unknown };
    const key = typeof sc.flag === "string" ? sc.flag : typeof sc.name === "string" ? sc.name : "";
    return !key.startsWith("__");
  });
}

/** The human command label for an action id in this observation. */
function obsActionText(obs: RpgObservation, id: string): string | null {
  return obs.available_actions.find((a) => a.id === id)?.command ?? null;
}

/**
 * Map an action id from the RPG observation's legal set to a structured Action.
 * Unknown ids are rejected before they reach the reducer, preserving the illegal
 * action / no state-change path.
 */
function actionForId(obs: RpgObservation, id: string): RpgAction | null {
  return obs.available_actions.find((a) => a.id === id)?.action ?? null;
}

type PublicObservationOptions = { compactActions?: boolean };

function publicObservationOptions(args: { compact_actions?: boolean }): PublicObservationOptions {
  return args.compact_actions ? { compactActions: true } : {};
}

function publicActions(
  obs: RpgObservation,
  opts: PublicObservationOptions = {},
): McpActionOption[] {
  return obs.available_actions.map((option) => ({
    id: option.id,
    ...(opts.compactActions ? {} : { command: option.command }),
    ...(option.skill_check ? { skill_check: option.skill_check } : {}),
  }));
}

function publicObservation(
  obs: RpgObservation,
  opts: PublicObservationOptions = {},
): McpObservation {
  return {
    ...obs,
    available_actions: publicActions(obs, opts),
  };
}

function rpgViewField<Args extends RpgResponseOptions>(
  obs: RpgObservation,
  args: Args,
): RpgViewField<Args> {
  if (args.compact_observation === true) {
    return {
      context: compactRpgObservation(obs, publicActions(obs, { compactActions: true })),
    } as RpgViewField<Args>;
  }
  return {
    observation: publicObservation(obs, publicObservationOptions(args)),
  } as RpgViewField<Args>;
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
  let overworldCounter = 0;
  const overworldSessions = new Map<string, OverworldSession>();

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

  /**
   * Mint a fresh RPG pack from a seed and refuse to play it unless it clears the SAME
   * `validateRpg` gate the curated RPG packs clear. This is the only public MCP
   * generation route.
   */
  function requireGeneratedRpgPlayable(seed: number): CompiledRpgPack {
    const pack = generateRpgPack(seed); // mints + schema self-check (throws on malformed emission)
    const report = validateRpg(pack);
    if (!report.ok) {
      throw new Error(
        `Generated RPG pack (seed ${seed}) is not playable:\n${formatReport(report)}`,
      );
    }
    return { pack, contentHash: hashState(pack) };
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
    const index = indexFor(compiled.pack);
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
      rules: rulesFor(index),
      state: st,
      transcript: [],
      ...(opts.hideGraph ? { hideGraph: true } : {}),
    });
    const obs = buildObsFor(index, st);
    session.transcript.push({
      step: st.step,
      scene_id: obsLocation(obs),
      title: obs.title,
      action_id: null,
      action_text: null,
      events: [],
      result_scene_id: obsLocation(obs),
      ended: obs.ended,
      ending_id: obs.ending_id,
    });
    return session;
  }

  const openingObsOf = (s: Session): RpgObservation =>
    buildObsFor(s.index, s.state, {
      hideGraph: s.hideGraph ?? false,
      includeWorldIntro: true,
    });

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
        mode: lr.ok ? SAVE_MODE : null,
        playable: lr.ok && lr.report.ok,
        world: lr.ok ? (lr.compiled.pack.meta.world ?? null) : null,
        world_quest_id: node?.id ?? null,
      };
    });
  }

  function publicWorldGraph(world: WorldManifest): PublicWorldGraph {
    return {
      hub: world.graph.hub,
      nodes: world.graph.nodes.map((node) => ({
        id: node.id,
        name: node.name,
        kind: node.kind,
        ...(node.district === undefined ? {} : { district: node.district }),
      })),
      edges: world.graph.edges.map((edge) => ({
        from: edge.from,
        to: edge.to,
        route: edge.route,
      })),
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

  function resolveQuestIdSource(
    args: { quest_id?: string; world_quest_id?: string },
    operation: string,
  ): { worldQuestId: string } {
    if ((args as { pack_path?: unknown }).pack_path !== undefined) {
      throw new Error(`${operation} accepts quest_id or world_quest_id, not pack_path.`);
    }
    if ((args as { quest_path?: unknown }).quest_path !== undefined) {
      throw new Error(`${operation} accepts quest_id or world_quest_id, not quest_path.`);
    }
    const sourceCount = [args.quest_id !== undefined, args.world_quest_id !== undefined].filter(
      Boolean,
    ).length;
    if (sourceCount === 0) {
      throw new Error(`${operation} requires quest_id or world_quest_id.`);
    }
    if (sourceCount > 1) {
      throw new Error(`${operation} accepts exactly one of quest_id or world_quest_id.`);
    }
    return { worldQuestId: args.quest_id ?? args.world_quest_id! };
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
    mode?: PackMode;
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
      mode: SAVE_MODE,
      meta: lr.compiled.pack.meta,
      content_hash: lr.compiled.contentHash,
      report: lr.report,
    };
  }

  function loadWorldManifest(): WorldManifest {
    return loadWorldManifestFromRoot(root);
  }

  function loadOverworldManifest(): OverworldManifest {
    return loadOverworldManifestFromRoot(root);
  }

  function createOverworldSession(): { session_id: string; session: OverworldSession } {
    const session = new OverworldSession(loadOverworldManifest());
    const sessionId = `oworld_${++overworldCounter}`;
    overworldSessions.set(sessionId, session);
    return { session_id: sessionId, session };
  }

  function restoreOverworldSession(snapshot: unknown): {
    session_id: string;
    session: OverworldSession;
  } {
    const session = OverworldSession.restore(loadOverworldManifest(), snapshot);
    const sessionId = `oworld_${++overworldCounter}`;
    overworldSessions.set(sessionId, session);
    return { session_id: sessionId, session };
  }

  function getOverworldSession(sessionId: string): OverworldSession {
    const session = overworldSessions.get(sessionId);
    if (!session) throw new Error(`Unknown overworld session "${sessionId}".`);
    return session;
  }

  function overworldSnapshotHash(session: OverworldSession): string {
    return hashState(session.snapshot());
  }

  function overworldViewField<Args extends OverworldResponseOptions>(
    args: Args,
    session: OverworldSession,
  ): OverworldViewField<Args> {
    const view = session.view();
    if (args.compact_context === true) {
      return { context: compactOverworldView(view) } as OverworldViewField<Args>;
    }
    return { observation: view } as OverworldViewField<Args>;
  }

  function runOverworldSession<Key extends string, Value, Args extends OverworldResponseOptions>(
    args: Args,
    sessionId: string,
    key: Key,
    action: (session: OverworldSession) => Value,
  ): OverworldSessionResponse<Key, Value, Args> {
    const session = getOverworldSession(sessionId);
    const value = action(session);
    const payload = {
      ok: true,
      session_id: sessionId,
      snapshot_hash: overworldSnapshotHash(session),
      [key]: value,
      ...overworldViewField(args, session),
    };
    return payload as unknown as OverworldSessionResponse<Key, Value, Args>;
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
            mode: s.mode,
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

    world_path(args: { world_quest_id?: string }): {
      world: Pick<WorldManifest, "id" | "name" | "hub">;
      world_quest_id: string | null;
      graph_node: string | null;
      path_from_hub: WorldRouteStep[];
    } {
      if ((args as { quest_path?: unknown }).quest_path !== undefined) {
        throw new Error("world_path accepts world_quest_id, not quest_path.");
      }
      if (args.world_quest_id === undefined) {
        throw new Error("world_path requires world_quest_id.");
      }
      const resolved = resolveWorldQuestPackPath(args.world_quest_id);
      return {
        world: {
          id: resolved.world.id,
          name: resolved.world.name,
          hub: resolved.world.hub,
        },
        world_quest_id: resolved.node.id,
        graph_node: resolved.node.id,
        path_from_hub: worldRouteFromHub(resolved.world, resolved.node.id) ?? [],
      };
    },

    list_overworld<Args extends OverworldListOptions = Record<string, never>>(
      args?: Args,
    ): OverworldListResponse<Args> {
      const world = loadOverworldManifest();
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
      const created = createOverworldSession();
      return {
        session_id: created.session_id,
        snapshot_hash: overworldSnapshotHash(created.session),
        ...overworldViewField(responseOptions, created.session),
      } as OverworldStartResponse<Args>;
    },

    get_overworld_session(args: { session_id: string }): {
      session_id: string;
      snapshot_hash: string;
      observation: OverworldView;
    } {
      const session = getOverworldSession(args.session_id);
      return {
        session_id: args.session_id,
        snapshot_hash: overworldSnapshotHash(session),
        observation: session.view(),
      };
    },

    get_overworld_session_context(args: { session_id: string }): OverworldContextPayload {
      const session = getOverworldSession(args.session_id);
      return {
        ok: true,
        session_id: args.session_id,
        snapshot_hash: overworldSnapshotHash(session),
        context: compactOverworldView(session.view()),
      };
    },

    export_overworld_session(args: { session_id: string }): {
      ok: true;
      session_id: string;
      snapshot_hash: string;
      snapshot: OverworldSessionSnapshot;
    } {
      const session = getOverworldSession(args.session_id);
      const snapshot = session.snapshot();
      return {
        ok: true,
        session_id: args.session_id,
        snapshot_hash: hashState(snapshot),
        snapshot,
      };
    },

    restore_overworld_session<Args extends { snapshot: unknown } & OverworldResponseOptions>(
      args: Args,
    ): OverworldRestoreResponse<Args> {
      const restored = restoreOverworldSession(args.snapshot);
      return {
        ok: true,
        session_id: restored.session_id,
        snapshot_hash: overworldSnapshotHash(restored.session),
        ...overworldViewField(args, restored.session),
      } as OverworldRestoreResponse<Args>;
    },

    plan_overworld_session_route<
      Args extends {
        session_id: string;
        destination_town_id: string;
      } & OverworldResponseOptions,
    >(args: Args): OverworldSessionResponse<"route", OverworldSessionRoutePlan, Args> {
      return runOverworldSession(args, args.session_id, "route", (session) =>
        session.planRoute(args.destination_town_id),
      );
    },

    travel_overworld_session<
      Args extends { session_id: string; road_id: string } & OverworldResponseOptions,
    >(args: Args): OverworldSessionResponse<"travel", TravelLogEntry, Args> {
      return runOverworldSession(args, args.session_id, "travel", (session) =>
        session.travel(args.road_id),
      );
    },

    resolve_overworld_session_road_encounter<
      Args extends {
        session_id: string;
        strategy: OverworldRoadEncounterStrategy;
      } & OverworldResponseOptions,
    >(args: Args): OverworldSessionResponse<"result", OverworldRoadEncounterResult, Args> {
      return runOverworldSession(args, args.session_id, "result", (session) =>
        session.resolveRoadEncounter(args.strategy),
      );
    },

    resupply_overworld_session<Args extends { session_id: string } & OverworldResponseOptions>(
      args: Args,
    ): OverworldSessionResponse<"result", OverworldServiceResult, Args> {
      return runOverworldSession(args, args.session_id, "result", (session) =>
        session.resupplyAtTown(),
      );
    },

    rest_overworld_session<Args extends { session_id: string } & OverworldResponseOptions>(
      args: Args,
    ): OverworldSessionResponse<"result", OverworldServiceResult, Args> {
      return runOverworldSession(args, args.session_id, "result", (session) =>
        session.restAtTown(),
      );
    },

    scout_overworld_session_poi<
      Args extends { session_id: string; poi_id: string } & OverworldResponseOptions,
    >(args: Args): OverworldSessionResponse<"result", OverworldActionResult, Args> {
      return runOverworldSession(args, args.session_id, "result", (session) =>
        session.scoutPoi(args.poi_id),
      );
    },

    talk_overworld_session_contact<
      Args extends { session_id: string; character_id: string } & OverworldResponseOptions,
    >(args: Args): OverworldSessionResponse<"result", OverworldActionResult, Args> {
      return runOverworldSession(args, args.session_id, "result", (session) =>
        session.talkToCharacter(args.character_id),
      );
    },

    investigate_overworld_session_event<
      Args extends { session_id: string; event_id: string } & OverworldResponseOptions,
    >(args: Args): OverworldSessionResponse<"result", OverworldActionResult, Args> {
      return runOverworldSession(args, args.session_id, "result", (session) =>
        session.investigateEvent(args.event_id),
      );
    },

    resolve_overworld_session_event<
      Args extends { session_id: string; event_id: string } & OverworldResponseOptions,
    >(args: Args): OverworldSessionResponse<"result", OverworldActionResult, Args> {
      return runOverworldSession(args, args.session_id, "result", (session) =>
        session.resolveEvent(args.event_id),
      );
    },

    explore_overworld_session_site<
      Args extends { session_id: string; site_id: string } & OverworldResponseOptions,
    >(args: Args): OverworldSessionResponse<"result", OverworldActionResult, Args> {
      return runOverworldSession(args, args.session_id, "result", (session) =>
        session.exploreSite(args.site_id),
      );
    },

    explore_overworld_session_area<
      Args extends { session_id: string; area_id: string } & OverworldResponseOptions,
    >(args: Args): OverworldSessionResponse<"result", OverworldActionResult, Args> {
      return runOverworldSession(args, args.session_id, "result", (session) =>
        session.exploreArea(args.area_id),
      );
    },

    work_overworld_session_job<
      Args extends { session_id: string; job_id: string } & OverworldResponseOptions,
    >(args: Args): OverworldSessionResponse<"result", OverworldActionResult, Args> {
      return runOverworldSession(args, args.session_id, "result", (session) =>
        session.workLocalJob(args.job_id),
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
      const session = getOverworldSession(args.session_id);
      const quest = session.startQuest(args.quest_id);
      const rpgSession = this.new_game({
        world_quest_id: quest.id,
        ...(args.seed !== undefined ? { seed: args.seed } : {}),
        ...(args.hide_graph ? { hide_graph: true } : {}),
        ...(args.compact_actions ? { compact_actions: true } : {}),
        ...(args.compact_observation ? { compact_observation: true } : {}),
      } as RpgNewGameArgs & Args);
      return {
        ok: true,
        session_id: args.session_id,
        snapshot_hash: overworldSnapshotHash(session),
        quest,
        rpg_session_id: rpgSession.session_id,
        rpg_session: rpgSession,
        ...overworldViewField(args, session),
      } as OverworldQuestStartResponse<Args>;
    },

    move_overworld_session_area<
      Args extends { session_id: string; area_route_id: string } & OverworldResponseOptions,
    >(args: Args): OverworldSessionResponse<"result", OverworldAreaTravelResult, Args> {
      return runOverworldSession(args, args.session_id, "result", (session) =>
        session.moveArea(args.area_route_id),
      );
    },

    validate_quest(args: { quest_id?: string; world_quest_id?: string }): {
      ok: boolean;
      world_quest_id: string | null;
      report: ValidationReport;
    } {
      const source = resolveQuestIdSource(args, "validate_quest");
      return validateWorldQuest(source.worldQuestId);
    },

    load_quest(args: { quest_id?: string; world_quest_id?: string }): {
      ok: boolean;
      world_quest_id: string | null;
      mode?: PackMode;
      meta?: CompiledRpgPack["pack"]["meta"];
      content_hash?: string;
      report: ValidationReport;
    } {
      const source = resolveQuestIdSource(args, "load_quest");
      return loadWorldQuest(source.worldQuestId);
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
      mode: PackMode;
      pack_id: string;
      content_hash: string;
      seed: number;
      meta: RpgPack["meta"];
      room_count: number;
      enemy_count: number;
      ending_count: number;
      report: ValidationReport;
    } {
      const pack = generateRpgPack(args.seed);
      const report = validateRpg(pack);
      return {
        ok: report.ok,
        mode: SAVE_MODE,
        pack_id: pack.meta.id,
        content_hash: hashState(pack),
        seed: args.seed,
        meta: pack.meta,
        room_count: pack.rooms.length,
        enemy_count: pack.enemies.length,
        ending_count: pack.endings.length,
        report,
      };
    },

    new_game<Args extends RpgNewGameArgs>(args: Args): RpgSessionPayload<Args> {
      // Either load a world-graph quest or mint a fresh RPG pack in-memory from
      // `generate_rpg_seed`. The generation seed selects the minted pack's
      // theme/structure; `seed` still seeds runtime state, so the two are independent.
      const source = resolveGameSource(root, args, "new_game");
      const compiled =
        source.kind === "generated"
          ? requireGeneratedRpgPlayable(source.generateRpgSeed)
          : requirePlayable(source.packPath);
      const session = startSession(compiled, undefined, {
        seed: args.seed ?? 1,
        ...(args.hide_graph ? { hideGraph: true } : {}),
        ...(source.packPath ? { packPath: source.packPath } : {}),
        ...(source.worldQuestId ? { worldQuestId: source.worldQuestId } : {}),
        ...(source.generateRpgSeed !== null ? { generatedRpgSeed: source.generateRpgSeed } : {}),
      });
      return {
        session_id: session.id,
        mode: SAVE_MODE,
        ...rpgViewField(openingObsOf(session), args),
        world_quest_id: session.worldQuestId ?? null,
        generated_rpg_seed: session.generatedRpgSeed ?? null,
        state_hash: hashState(session.state),
      } as RpgSessionPayload<Args>;
    },

    start_world_quest<Args extends RpgStartWorldQuestArgs>(
      args: Args,
    ): RpgWorldQuestStartPayload<Args> {
      const resolved = resolveWorldQuestPackPath(args.quest_id);
      const started = this.new_game({
        world_quest_id: args.quest_id,
        ...(args.seed !== undefined ? { seed: args.seed } : {}),
        ...(args.hide_graph ? { hide_graph: true } : {}),
        ...(args.compact_actions ? { compact_actions: true } : {}),
        ...(args.compact_observation ? { compact_observation: true } : {}),
      } as RpgNewGameArgs & Args);
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

    start_quest<Args extends RpgStartQuestArgs>(args: Args): RpgWorldQuestStartPayload<Args> {
      const source = resolveQuestIdSource(args, "start_quest");
      return this.start_world_quest({
        quest_id: source.worldQuestId,
        ...(args.seed !== undefined ? { seed: args.seed } : {}),
        ...(args.hide_graph ? { hide_graph: true } : {}),
        ...(args.compact_actions ? { compact_actions: true } : {}),
        ...(args.compact_observation ? { compact_observation: true } : {}),
      } as RpgStartWorldQuestArgs & Args);
    },

    get_observation<Args extends RpgGetObservationArgs>(args: Args): RpgObservationResponse<Args> {
      const s = sessions.get(args.session_id);
      const obs = buildObsFor(s.index, s.state, {
        hideGraph: args.hide_graph ?? s.hideGraph ?? false,
      });
      return {
        ...rpgViewField(obs, args),
        state_hash: hashState(s.state),
      } as RpgObservationResponse<Args>;
    },

    get_scene<Args extends RpgGetObservationArgs>(args: Args): RpgObservationResponse<Args> {
      return this.get_observation(args);
    },

    list_legal_actions(args: {
      session_id: string;
      hide_graph?: boolean;
      compact_actions?: boolean;
    }): { actions: McpActionOption[]; state_hash: string } {
      const s = sessions.get(args.session_id);
      const obs = buildObsFor(s.index, s.state, {
        hideGraph: args.hide_graph ?? s.hideGraph ?? false,
      });
      return {
        actions: publicActions(obs, publicObservationOptions(args)),
        state_hash: hashState(s.state),
      };
    },

    step_action<Args extends RpgStepActionArgs>(args: Args): RpgStepActionResponse<Args> {
      const s = sessions.get(args.session_id);
      const before = buildObsFor(s.index, s.state, {
        hideGraph: args.hide_graph ?? s.hideGraph ?? false,
      });
      const beforeStep = s.state.step;
      const actionText = obsActionText(before, args.action_id);
      const action = actionForId(before, args.action_id);
      if (action === null) {
        // Unknown action ids never reach the engine.
        return {
          ok: false,
          rejection_reason: "That action is not available right now.",
          events: [
            { type: "rejected" as const, reason: "That action is not available right now." },
          ],
          ...rpgViewField(before, args),
          state_hash: hashState(s.state),
        } as RpgStepActionResponse<Args>;
      }
      const result = makeStep(s.rules)(s.state, action);
      sessions.update(s.id, result.state);
      const after = buildObsFor(s.index, s.state, {
        hideGraph: args.hide_graph ?? s.hideGraph ?? false,
      });
      s.transcript.push({
        step: beforeStep,
        scene_id: obsLocation(before),
        title: before.title,
        action_id: args.action_id,
        action_text: actionText,
        events: result.events,
        result_scene_id: obsLocation(after),
        ended: after.ended,
        ending_id: after.ending_id,
      });
      return {
        ok: result.ok,
        rejection_reason: result.rejectionReason ?? null,
        events: playerVisibleEvents(result.events),
        ...rpgViewField(after, args),
        state_hash: hashState(result.state),
      } as RpgStepActionResponse<Args>;
    },

    choose_option<Args extends RpgChooseOptionArgs>(args: Args): RpgStepActionResponse<Args> {
      return this.step_action({
        session_id: args.session_id,
        action_id: args.option_id,
        ...(args.hide_graph !== undefined && { hide_graph: args.hide_graph }),
        ...(args.compact_actions !== undefined && { compact_actions: args.compact_actions }),
        ...(args.compact_observation !== undefined && {
          compact_observation: args.compact_observation,
        }),
      } as RpgStepActionArgs & Args);
    },

    get_state(args: { session_id: string }) {
      const s = sessions.get(args.session_id);
      return { state: s.state, state_hash: hashState(s.state) };
    },

    get_transcript<Args extends TranscriptArgs>(
      args: Args,
    ): TranscriptResponse<TranscriptTurnFor<Args>> {
      const s = sessions.get(args.session_id);
      const summary: TranscriptSummary = {
        steps: s.transcript.filter((t) => t.action_id !== null).length,
        scenes: [...new Set(s.transcript.flatMap((t) => [t.scene_id, t.result_scene_id]))].sort(),
        ended: s.state.ended,
        ending_id: s.state.endingId,
        inventory: [...s.state.inventory],
        flags: Object.keys(s.state.flags)
          .filter((f) => s.state.flags[f] === true && !f.startsWith("__"))
          .sort(),
        journal: [...s.state.journal],
      };
      const response = {
        session_id: s.id,
        pack_id: s.packId,
        world_quest_id: s.worldQuestId ?? null,
        generated_rpg_seed: s.generatedRpgSeed ?? null,
        mode: SAVE_MODE,
        // Filter internal-bookkeeping events the same way step_action does, so the
        // transcript a player reads never surfaces `__`-prefixed vars/flags (bug_0260).
        turns: args.summary_only
          ? []
          : args.compact_turns
            ? s.transcript.map((t) => ({
                step: t.step,
                scene_id: t.scene_id,
                action_id: t.action_id,
                result_scene_id: t.result_scene_id,
                ended: t.ended,
                ending_id: t.ending_id,
              }))
            : s.transcript.map((t) => ({ ...t, events: playerVisibleEvents(t.events) })),
        summary: args.compact_summary ? compactTranscriptSummary(summary) : summary,
      };
      return response as unknown as TranscriptResponse<TranscriptTurnFor<Args>>;
    },

    save_game(args: { session_id: string }) {
      const s = sessions.get(args.session_id);
      // The save records the pack mode so load can refuse a mode mismatch (§8.7).
      const saveMetadata = {
        ...(s.worldQuestId ? { worldQuestId: s.worldQuestId } : {}),
        ...(s.generatedRpgSeed !== undefined ? { generatedRpgSeed: s.generatedRpgSeed } : {}),
      };
      return {
        save: save(s.state, s.packId, s.contentHash, SAVE_MODE, saveMetadata),
        pack_id: s.packId,
        world_quest_id: s.worldQuestId ?? null,
        generated_rpg_seed: s.generatedRpgSeed ?? null,
        content_hash: s.contentHash,
        mode: SAVE_MODE,
        state_hash: hashState(s.state),
      };
    },

    load_game<Args extends RpgLoadGameArgs>(args: Args): RpgSessionPayload<Args> {
      const bundle = load(args.save, undefined, SAVE_MODE);
      const source = resolveSaveGameSource(root, args, bundle, "load_game");
      const compiled =
        source.kind === "generated"
          ? requireGeneratedRpgPlayable(source.generateRpgSeed)
          : requirePlayable(source.packPath);
      // Content-hash check is enforced by load() against the loaded pack (§8.7);
      // mode is verified too, so a save can't be loaded against a different mode.
      const verified = load(args.save, compiled.contentHash, SAVE_MODE);
      const session = startSession(compiled, verified.state, {
        ...(source.packPath ? { packPath: source.packPath } : {}),
        ...(source.worldQuestId ? { worldQuestId: source.worldQuestId } : {}),
        ...(source.generateRpgSeed !== null ? { generatedRpgSeed: source.generateRpgSeed } : {}),
        ...(args.hide_graph ? { hideGraph: true } : {}),
      });
      return {
        session_id: session.id,
        mode: SAVE_MODE,
        ...rpgViewField(openingObsOf(session), args),
        world_quest_id: session.worldQuestId ?? null,
        generated_rpg_seed: session.generatedRpgSeed ?? null,
        state_hash: hashState(session.state),
      } as RpgSessionPayload<Args>;
    },

    async adapt_story(args: { premise: string; mode?: PackMode }) {
      // Author a pack from a premise via the writer → adapter → validator loop
      // (§12.1–3). Uses a REAL frontier model when a provider key is present
      // (ANTHROPIC/OPENAI/GOOGLE, or AF_LLM_PROVIDER), falling back to the
      // deterministic MockAuthorProvider when none is set — so CI and key-less runs
      // stay green and offline while a keyed run exercises the genuine §1 author.
      // Mirrors bin/author.ts. Returns the story, the green/red pack, the validation
      // report, and the per-beat classification (§11). Never writes files.
      if (args.mode !== undefined) {
        throw new Error("adapt_story is RPG-only; mode is no longer supported.");
      }
      const provider = resolveProvider({ mock: new MockAuthorProvider() });
      const contract = loadEngineContract();
      const story = await runWriter(provider, { premise: args.premise, contract });
      const result = await runRpgAdapter(provider, { story, contract });
      return {
        ok: result.ok,
        mode: SAVE_MODE,
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
      const index = indexFor(compiled.pack);
      assertRpgStateReferences(index, trace.initial_state);
      const rules = rulesFor(index);
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
      const { compiled } = resolveTraceSource(args, trace, "inspect_trace");
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
      const index = indexFor(compiled.pack);
      assertRpgStateReferences(index, trace.initial_state);
      const rules = rulesFor(index);
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
        mode: SAVE_MODE,
        pack_id: trace.pack_id,
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
