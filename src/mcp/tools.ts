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
import { readFileSync } from "node:fs";
import type { RpgAction } from "../api/types.js";
import type { GameState } from "../core/state.js";

import type { CompiledRpgSource } from "../rpg/source.js";
import { assertRpgStateReferences } from "../rpg/state_integrity.js";

import type { ValidationReport } from "../validate/report.js";
import { assertWellFormedState } from "../persist/save_load.js";
import { assertTraceMode, replayTrace } from "../trace/replay.js";
import type { Trace } from "../trace/record.js";
import { safeResolve } from "./paths.js";
import { SessionStore } from "./sessions.js";
import { type McpActionOption, type McpObservation } from "./types.js";
import type { RpgCompactObservation } from "./compact_rpg_observation.js";
import type { RpgCompactState } from "./compact_rpg_state.js";
import { RpgMcpSessionRuntime } from "./rpg_session_runtime.js";
import {
  runRpgLoadGame,
  runRpgNewGame,
  runRpgStartWorldQuest,
  type RpgWorldQuestStartPayload as RpgRuntimeWorldQuestStartPayload,
} from "./rpg_session_lifecycle.js";
import { RpgSourceRuntime, type PublicWorldGraph } from "./rpg_source_runtime.js";
import {
  runRpgGetObservation,
  runRpgGetState,
  runRpgGetTranscript,
  runRpgListLegalActions,
  runRpgSaveGame,
} from "./rpg_session_tools.js";
import {
  runRpgStepAction,
  type RpgStepActionResponse as RpgRuntimeStepActionResponse,
} from "./rpg_step_action.js";
import type { RpgStateHashRejection, RpgStateUnchanged } from "./rpg_state_guards.js";
import type { TranscriptArgs, TranscriptResponse } from "./transcript_projection.js";
import { OverworldMcpSessionStore } from "./overworld_sessions.js";
import { createOverworldToolHandlers } from "./overworld_tool_handlers.js";
import type { WorldManifest } from "../world/schema.js";
import {
  worldNodeAtCoord,
  worldQuestNodeById,
  worldRouteFromHub,
  type WorldCoord,
  type WorldRouteStep,
} from "../world/graph.js";
import {
  loadOverworldManifest as loadOverworldManifestFromRoot,
  resolveWorldQuestSourceId,
} from "../world/source.js";
import { loadWorldQuestReport, validateWorldQuestReport } from "./world_quest_reports.js";
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

type PublicWorldSummary = Pick<WorldManifest, "id" | "name" | "hub">;

type WorldListOptions = {
  include_graph?: boolean;
  include_routes?: boolean;
};

type WorldQuestCatalogEntry = {
  title: string;
  playable: boolean;
  world_quest_id: string;
  district: string;
  quest: string;
  role: string;
  connection: string;
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

type RpgViewOptions = {
  compact_actions?: boolean;
  compact_observation?: boolean;
};

type RpgEventOptions = {
  compact_events?: boolean;
};

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
  /** Internal bridge binding; not registered as public MCP input. */
  overworldSessionId?: string;
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

type RpgWorldQuestStartPayload<Args extends RpgViewOptions> =
  RpgRuntimeWorldQuestStartPayload<Args>;

type RpgStartWorldQuestInvoker = {
  start_world_quest<Args extends RpgStartWorldQuestArgs>(
    args: Args,
  ): RpgWorldQuestStartPayload<Args>;
};

type RpgGetStateArgs = {
  session_id: string;
  include_state?: boolean;
  compact_state?: boolean;
  if_state_hash?: string;
};
type RpgStateHashPayload = {
  state_hash: string;
};
type RpgRawStatePayloadField = {
  state: GameState;
};
type RpgCompactStatePayloadField = {
  compact_state: RpgCompactState;
};
type RpgStatePayloadFor<Args extends RpgGetStateArgs> = Args extends { include_state: true }
  ? RpgStateHashPayload &
      RpgRawStatePayloadField &
      (Args extends { compact_state: true } ? RpgCompactStatePayloadField : Record<string, never>)
  : RpgStateHashPayload &
      (Args extends { compact_state: true } ? RpgCompactStatePayloadField : Record<string, never>);
type RpgStateResponse<Args extends RpgGetStateArgs> = Args extends { if_state_hash: string }
  ? RpgStatePayloadFor<Args> | RpgStateUnchanged
  : RpgStatePayloadFor<Args>;

type RpgSaveArgs = {
  session_id: string;
  expected_state_hash?: string;
  if_state_hash?: string;
};

type RpgSaveSuccess = {
  ok: true;
  save: string;
  content_hash: string;
  state_hash: string;
} & RpgSourceFields;

type RpgSaveRejection = RpgStateHashRejection;

type RpgSaveUnchanged = RpgStateUnchanged;

type RpgSaveResponse<Args extends RpgSaveArgs> =
  | RpgSaveSuccess
  | (Args extends { expected_state_hash: string } ? RpgSaveRejection : never)
  | (Args extends { if_state_hash: string } ? RpgSaveUnchanged : never);

export function createToolApi(opts: { root: string }) {
  const root = opts.root;
  const sessions = new SessionStore();
  const rpgSources = new RpgSourceRuntime(root);
  const rpgRuntime = new RpgMcpSessionRuntime(sessions);
  const overworldSessions = new OverworldMcpSessionStore(() => loadOverworldManifestFromRoot(root));
  const apiRef: { current?: RpgStartWorldQuestInvoker } = {};

  const api = {
    sessions,

    list_world<Args extends WorldListOptions = Record<string, never>>(
      args?: Args,
    ): WorldListResponse<Args> {
      const world = rpgSources.loadWorldManifest();
      const quests = rpgSources
        .discoverWorldQuestSources(world)
        .filter((s) => s.world?.id === world.id)
        .map((s) => {
          const quest: WorldQuestCatalogEntry = {
            title: s.title,
            playable: s.playable,
            world_quest_id: s.world_quest_id,
            district: s.world?.district ?? "",
            quest: s.world?.quest ?? "",
            role: s.world?.role ?? "",
            connection: s.world?.connection ?? "",
          };
          if (args?.include_routes === true) {
            return {
              ...quest,
              path_from_hub: worldRouteFromHub(world, s.world_quest_id) ?? [],
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
          graph: rpgSources.publicWorldGraph(world),
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
      const world = rpgSources.loadWorldManifest();
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

    ...createOverworldToolHandlers({
      sessions,
      overworldSessions,
      loadOverworldManifest: () => loadOverworldManifestFromRoot(root),
      startWorldQuest: <Args extends RpgStartWorldQuestArgs>(
        startArgs: Args,
      ): RpgWorldQuestStartPayload<Args> => {
        const current = apiRef.current;
        if (!current) throw new Error("Tool API is not initialized.");
        return current.start_world_quest(startArgs);
      },
    }),

    validate_quest(args: { world_quest_id?: string }): {
      ok: boolean;
      world_quest_id: string | null;
      report: ValidationReport;
    } {
      return validateWorldQuestReport(args, "validate_quest", (worldQuestId) =>
        rpgSources.loadWorldQuestReport(worldQuestId),
      );
    },

    load_quest(args: { world_quest_id?: string }): {
      ok: boolean;
      world_quest_id: string | null;
      meta?: CompiledRpgSource["pack"]["meta"];
      content_hash?: string;
      report: ValidationReport;
    } {
      return loadWorldQuestReport(args, "load_quest", (worldQuestId) =>
        rpgSources.loadWorldQuestReport(worldQuestId),
      );
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
      meta: CompiledRpgSource["pack"]["meta"];
      room_count: number;
      enemy_count: number;
      ending_count: number;
      report: ValidationReport;
    } {
      const {
        compiled: { pack, contentHash },
        report,
      } = rpgSources.generatedRpg(args.seed);
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
      return runRpgNewGame({ root, rpgRuntime, rpgSources }, args);
    },

    start_world_quest<Args extends RpgStartWorldQuestArgs>(
      args: Args,
    ): RpgWorldQuestStartPayload<Args> {
      return runRpgStartWorldQuest(
        { rpgRuntime, rpgSources },
        args,
      ) as RpgWorldQuestStartPayload<Args>;
    },

    get_observation<Args extends RpgGetObservationArgs>(args: Args): RpgObservationResponse<Args> {
      return runRpgGetObservation({ sessions, rpgRuntime }, args) as RpgObservationResponse<Args>;
    },

    list_legal_actions<Args extends RpgLegalActionsArgs>(
      args: Args,
    ): RpgLegalActionsResponse<Args> {
      return runRpgListLegalActions(
        { sessions, rpgRuntime },
        args,
      ) as RpgLegalActionsResponse<Args>;
    },

    step_action<Args extends RpgStepActionArgs>(args: Args): RpgStepActionResponse<Args> {
      return runRpgStepAction({ sessions, rpgRuntime }, args);
    },

    get_state<Args extends RpgGetStateArgs>(args: Args): RpgStateResponse<Args> {
      return runRpgGetState({ sessions }, args) as RpgStateResponse<Args>;
    },

    get_transcript<Args extends TranscriptArgs>(args: Args): TranscriptResponse<Args> {
      return runRpgGetTranscript({ sessions }, args) as TranscriptResponse<Args>;
    },

    save_game<Args extends RpgSaveArgs>(args: Args): RpgSaveResponse<Args> {
      return runRpgSaveGame({ sessions }, args) as RpgSaveResponse<Args>;
    },

    load_game<Args extends RpgLoadGameArgs>(args: Args): RpgSessionPayload<Args> {
      return runRpgLoadGame({ root, sessions, rpgRuntime, rpgSources }, args);
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
      const { compiled } = rpgSources.resolveTraceSource(args, trace, "replay_trace");
      if (trace.content_hash !== compiled.contentHash) {
        return {
          ok: false,
          message: `Trace was recorded against content ${trace.content_hash}, but the source is ${compiled.contentHash}.`,
        };
      }
      // §16 integrity at load: trace.initial_state came off an UNTRUSTED file (the
      // content-hash check above guards WHICH source, not WHETHER the state is well-
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
      const source = rpgSources.resolveTraceSource(args, trace, "inspect_trace");
      const { compiled } = source;
      if (trace.content_hash !== compiled.contentHash) {
        return {
          ok: false,
          message: `Trace content ${trace.content_hash} != source ${compiled.contentHash}.`,
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
        ...(source.generateRpgSeed !== null ? { generated_rpg_seed: source.generateRpgSeed } : {}),
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
      const requestedWorldQuestId = resolveWorldQuestSourceId(args, "apply_content_patch");
      const proposal = ContentPatchProposalSchema.parse(args.proposal);
      const source = rpgSources.loadWorldQuestReport(requestedWorldQuestId);
      const loaded = source.result;
      if (!loaded.ok) {
        return {
          ok: false,
          world_quest_id: source.node.id,
          report: loaded.report,
        };
      }
      const result = applyContentPatch(loaded.compiled.pack, proposal);
      return result.ok
        ? {
            ok: true,
            world_quest_id: source.node.id,
            applied: result.applied,
            report: result.report,
            pack: result.pack,
          }
        : {
            ok: false,
            world_quest_id: source.node.id,
            report: result.report,
          };
    },
  };
  apiRef.current = api;
  return api;
}
