/**
 * MCP server (spec §9.4) — exposes the engine as agent tools over stdio.
 *
 * Every tool is a thin adapter over the pure handlers in tools.ts (which are the
 * unit-tested source of truth). The server confines all paths to the project
 * root and treats content/traces as data only — never code or shell (§16).
 *
 * Tool descriptions are the agent-facing contract: each one is a single sentence
 * that says what the tool does and when to use it (blind playtesters have no
 * other manual). The compact positional payloads are documented by the `legend`
 * field on session-creating responses; tests/unit/compact_legend.test.ts guards
 * both halves of that contract via the exported TOOL_REGISTRATIONS registry.
 *
 * Run: `npm run mcp` (or register the project's .mcp.json in an MCP client).
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z, type ZodRawShape } from "zod";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { appendFileSync, mkdirSync } from "node:fs";
import { createToolApi } from "./tools.js";
import { TRANSCRIPT_TURN_LIMIT_DEFAULT } from "./transcript_projection.js";
import { isGeneratedRpgSeed as genSeed } from "../gen/seed.js";
import { formatSpectateEntry } from "./spectate.js";

const api = createToolApi({ root: process.cwd() });

export type McpPlayMode = "full" | "structural" | "pure";

function parsePlayMode(): McpPlayMode {
  const value = argValue("--play-mode") ?? "full";
  if (value === "full" || value === "structural" || value === "pure") return value;
  throw new Error(
    `Invalid --play-mode ${JSON.stringify(value)}; expected "full", "structural", or "pure".`,
  );
}

/**
 * Pure play exposes only choices a human can make through the game UI. Authoring,
 * validation, raw-state, direct-quest, restore, and generated-game tools stay in
 * the default full server used by developers and structural tests.
 */
export const PURE_PLAYER_TOOLS = new Set<string>([
  "start_overworld",
  "get_overworld_session",
  "get_overworld_session_context",
  "plan_overworld_session_route",
  "travel_overworld_session",
  "resolve_overworld_session_road_encounter",
  "resupply_overworld_session",
  "rest_overworld_session",
  "scout_overworld_session_poi",
  "talk_overworld_session_contact",
  "investigate_overworld_session_event",
  "resolve_overworld_session_event",
  "explore_overworld_session_site",
  "explore_overworld_session_area",
  "move_overworld_session_area",
  "work_overworld_session_job",
  "start_overworld_session_quest",
  "complete_overworld_session_quest",
  "choose_overworld_session_journey",
  "get_observation",
  "list_legal_actions",
  "step_action",
]);

export function toolAvailableInPlayMode(name: string, playMode: McpPlayMode): boolean {
  return playMode !== "pure" || PURE_PLAYER_TOOLS.has(name);
}

const PLAY_MODE = parsePlayMode();

type PureRunEvidence =
  | {
      schema_version: 1;
      play_mode: "pure";
      event: "fresh_start";
      start_surface: "fresh_overworld";
      session_id: string;
    }
  | {
      schema_version: 1;
      play_mode: "pure";
      event: "journey_exit";
      start_surface: "fresh_overworld";
      session_id: string;
      receipt: unknown;
    };

const RUN_EVIDENCE_PATH = (() => {
  const requested = process.argv.includes("--run-evidence");
  const value = argValue("--run-evidence");
  if (!requested) return null;
  if (!value || value.startsWith("--")) {
    throw new Error("--run-evidence requires a JSONL path.");
  }
  return resolve(value);
})();

const pureRunState: { overworldSessionId: string | null; journeyExitRecorded: boolean } = {
  overworldSessionId: null,
  journeyExitRecorded: false,
};

const PURE_RPG_SESSION_TOOLS = new Set(["get_observation", "list_legal_actions", "step_action"]);
const PURE_OVERWORLD_SESSION_TOOLS = new Set(
  [...PURE_PLAYER_TOOLS].filter(
    (name) => name !== "start_overworld" && !PURE_RPG_SESSION_TOOLS.has(name),
  ),
);

function appendRunEvidence(event: PureRunEvidence): void {
  if (!RUN_EVIDENCE_PATH) return;
  mkdirSync(dirname(RUN_EVIDENCE_PATH), { recursive: true });
  appendFileSync(RUN_EVIDENCE_PATH, `${JSON.stringify(event)}\n`);
}

function objectRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function pureCallPreflight(name: string, args: unknown): void {
  if (PLAY_MODE !== "pure") return;
  if (pureRunState.journeyExitRecorded) {
    throw new Error("This pure-play journey has ended; the exit receipt is the final run event.");
  }
  if (name === "start_overworld") {
    if (pureRunState.overworldSessionId !== null) {
      throw new Error("Pure play permits exactly one fresh overworld start per run.");
    }
    return;
  }
  if (pureRunState.overworldSessionId === null) {
    throw new Error("Pure play must begin with start_overworld.");
  }
  const input = objectRecord(args);
  const sessionId = input?.session_id;
  if (PURE_OVERWORLD_SESSION_TOOLS.has(name) && sessionId !== pureRunState.overworldSessionId) {
    throw new Error("Pure play tools must use the fresh overworld session from this run.");
  }
  if (PURE_RPG_SESSION_TOOLS.has(name)) {
    if (typeof sessionId !== "string") throw new Error("Embedded quest session id is required.");
    const rpgSession = api.sessions.get(sessionId);
    if (rpgSession.overworldSessionId !== pureRunState.overworldSessionId) {
      throw new Error("Pure play RPG tools require a quest entered from this fresh overworld run.");
    }
  }
  if (name === "complete_overworld_session_quest") {
    const rpgSessionId = input?.rpg_session_id;
    if (typeof rpgSessionId !== "string") throw new Error("Ended quest session id is required.");
    const rpgSession = api.sessions.get(rpgSessionId);
    if (rpgSession.overworldSessionId !== pureRunState.overworldSessionId) {
      throw new Error("Only a quest entered from this fresh overworld run can be completed.");
    }
  }
}

function pureCallEvidence(name: string, value: unknown): void {
  if (PLAY_MODE !== "pure") return;
  const response = objectRecord(value);
  if (!response) return;
  if (name === "start_overworld") {
    const sessionId = response.session_id;
    if (typeof sessionId !== "string" || sessionId.length === 0) {
      throw new Error("Fresh overworld start returned no session id.");
    }
    pureRunState.overworldSessionId = sessionId;
    appendRunEvidence({
      schema_version: 1,
      play_mode: "pure",
      event: "fresh_start",
      start_surface: "fresh_overworld",
      session_id: sessionId,
    });
    return;
  }
  if (name !== "choose_overworld_session_journey" || pureRunState.journeyExitRecorded) return;
  const receipt = response.exitReceipt ?? objectRecord(response.result)?.exitReceipt;
  const receiptRecord = objectRecord(receipt);
  if (
    !receiptRecord ||
    receiptRecord.exitReason !== "player_ended_at_choice" ||
    typeof receiptRecord.receiptHash !== "string"
  ) {
    return;
  }
  appendRunEvidence({
    schema_version: 1,
    play_mode: "pure",
    event: "journey_exit",
    start_surface: "fresh_overworld",
    session_id: pureRunState.overworldSessionId!,
    receipt,
  });
  pureRunState.journeyExitRecorded = true;
}

// ── Spectate mode ─────────────────────────────────────────────────────────────
// A human-facing live feed of every tool call (plus an optional pacing delay
// before each response returns) so a person can watch an LLM playthrough in
// real time and verify what is happening — `npm run spectate` tails the feed
// from another terminal. Configure via CLI args (`npm run mcp -- --spectate
// [path] --spectate-delay-ms N` — args survive every MCP client) or env
// (AF_SPECTATE=1|<path>, AF_SPECTATE_DELAY_MS=N). Entirely inert when unset:
// no files are touched and no delay is added, so importing this module (tests)
// and normal blind/loop runs are unaffected. The feed goes to a FILE — stdout
// is the JSON-RPC transport and must stay clean.
const SPECTATE_DEFAULT_LOG = "ai-runs/spectate.log";

function argValue(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const SPECTATE_LOG: string | null = (() => {
  const fromArg = process.argv.includes("--spectate")
    ? (argValue("--spectate") ?? "")
    : (process.env.AF_SPECTATE ?? "");
  if (!fromArg && !process.argv.includes("--spectate") && !process.env.AF_SPECTATE) return null;
  const isPath = fromArg !== "" && fromArg !== "1" && !fromArg.startsWith("--");
  return resolve(isPath ? fromArg : SPECTATE_DEFAULT_LOG);
})();

const SPECTATE_DELAY_MS: number = Math.max(
  0,
  Number(argValue("--spectate-delay-ms") ?? process.env.AF_SPECTATE_DELAY_MS ?? 0) || 0,
);

/** On startup (direct run only): banner into the feed + a stderr pointer. */
function announceSpectate(): void {
  if (!SPECTATE_LOG) return;
  try {
    mkdirSync(dirname(SPECTATE_LOG), { recursive: true });
    appendFileSync(
      SPECTATE_LOG,
      `\n═══ adventureforge spectate — session started ${new Date().toISOString()}${SPECTATE_DELAY_MS > 0 ? ` (delay ${SPECTATE_DELAY_MS}ms)` : ""} ═══\n`,
    );
  } catch {
    // best-effort
  }
  process.stderr.write(
    `spectate feed → ${SPECTATE_LOG}${SPECTATE_DELAY_MS > 0 ? ` (delay ${SPECTATE_DELAY_MS}ms per tool response)` : ""} — watch with: npm run spectate\n`,
  );
}

/** Append one human-readable play-by-play entry per tool call. Best-effort. */
function spectateRecord(name: string, args: unknown, result: CallToolResult): void {
  if (!SPECTATE_LOG) return;
  const first = result.content?.[0];
  const body = first && first.type === "text" ? first.text : "";
  const entry = formatSpectateEntry(name, args, body, result.isError === true, new Date());
  try {
    mkdirSync(dirname(SPECTATE_LOG), { recursive: true });
    appendFileSync(SPECTATE_LOG, entry);
  } catch {
    // Spectating is best-effort; a feed write failure must not fail the tool call.
  }
}

function ok(value: unknown): CallToolResult {
  return { content: [{ type: "text", text: JSON.stringify(value) }] };
}

function wrap<A>(name: string, handler: (args: A) => unknown) {
  return async (args: A): Promise<CallToolResult> => {
    let result: CallToolResult;
    try {
      pureCallPreflight(name, args);
      const value = await handler(args); // await is a no-op for the sync handlers
      pureCallEvidence(name, value);
      result = ok(value);
    } catch (e) {
      result = {
        content: [{ type: "text", text: `Error: ${(e as Error).message}` }],
        isError: true,
      };
    }
    spectateRecord(name, args, result);
    if (SPECTATE_DELAY_MS > 0) await new Promise((r) => setTimeout(r, SPECTATE_DELAY_MS));
    return result;
  };
}

const server = new McpServer({ name: "adventureforge", version: "0.1.0" });

/** MCP behavioral hints (see the spec's tool annotations). */
export type ToolAnnotations = {
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
  openWorldHint?: boolean;
};

export type ToolRegistration = {
  name: string;
  description: string;
  annotations: ToolAnnotations;
};

/** Every registered tool, exported so tests can hold descriptions + annotations to a floor. */
export const TOOL_REGISTRATIONS: ToolRegistration[] = [];

/**
 * Tools that neither mutate session/engine state nor have side effects — pure reads,
 * previews, serializers, and deterministic mint/validate/replay analyses. Everything
 * else creates or advances a session (a session-store mutation), so it is left as the
 * mutating default. This engine is closed and deterministic, so EVERY tool is
 * non-destructive and non-open-world (no external entities); read-only tools are also
 * idempotent (same args ⇒ same result).
 */
export const READ_ONLY_TOOLS = new Set<string>([
  "list_overworld",
  "get_overworld_session",
  "get_overworld_session_context",
  "export_overworld_session",
  "plan_overworld_session_route",
  "get_observation",
  "list_legal_actions",
  "get_state",
  "get_transcript",
  "save_game",
  "validate_quest",
  "load_quest",
  "generate_rpg_pack",
  "replay_trace",
  "inspect_trace",
  "adapt_story",
  "apply_content_patch",
]);

function tool(
  name: string,
  description: string,
  inputSchema: ZodRawShape,
  handler: (args: never) => unknown,
): void {
  if (!toolAvailableInPlayMode(name, PLAY_MODE)) return;
  const readOnly = READ_ONLY_TOOLS.has(name);
  const annotations: ToolAnnotations = {
    // Deterministic, closed engine: no external entities, and nothing is destroyed
    // (sessions are in-memory; saves/snapshots are returned strings).
    openWorldHint: false,
    destructiveHint: false,
    ...(readOnly ? { readOnlyHint: true, idempotentHint: true } : {}),
  };
  TOOL_REGISTRATIONS.push({ name, description, annotations });
  server.registerTool(
    name,
    { description, inputSchema, annotations },
    wrap(name, handler) as never,
  );
}

const WORLD_QUEST_SOURCE = {
  world_quest_id: z.string().describe("Shipped quest id (from the overworld quest registry)."),
};
const G = z.number().int().refine(genSeed);
const B = (d: string) => z.boolean().optional().describe(d);
const SESSION = {
  session_id: z.string().describe("Session id from the tool that created the session."),
};
const HIDE_GRAPH = {
  hide_graph: B("Omit the world graph from observations."),
};
const PLAYER_HIDE_GRAPH = PLAY_MODE === "pure" ? {} : HIDE_GRAPH;
const EMBEDDED_QUEST_SEED =
  PLAY_MODE === "pure"
    ? {}
    : {
        seed: z.number().int().safe().optional().describe("Runtime seed."),
      };
const COMPACT_ACTIONS = {
  compact_actions: B("Bare action ids instead of labeled options."),
};
const COMPACT_EVENTS = {
  compact_events: B("Events as tagged tuples per the session legend."),
  include_event_version: B("Echo the event schema version."),
};
const COMPACT_OBSERVATION = {
  compact_observation: B("False swaps the compact context for the verbose observation."),
  include_actions: B("Bundle legal action ids into the compact context."),
  include_context_version: B("Echo the context schema version."),
};
const IF_STATE_HASH = {
  if_state_hash: z.string().optional().describe("Reply unchanged:true if this state hash holds."),
};
const IF_TRANSCRIPT_HASH = {
  if_transcript_hash: z
    .string()
    .optional()
    .describe("Reply unchanged:true if this transcript hash holds."),
};
const EXPECTED_STATE_HASH = {
  expected_state_hash: z.string().optional().describe("Reject if the state hash went stale."),
};
tool(
  "list_overworld",
  "Summarize the overworld: town, road, and content counts plus the start town; design notes are opt-in.",
  {
    include_design_notes: z.boolean().optional().describe("Include sources and design rules."),
  },
  (a) => api.list_overworld(a),
);

function defaultCompactRpg(args: unknown): never {
  const input: Record<string, unknown> =
    typeof args === "object" && args !== null ? { ...(args as Record<string, unknown>) } : {};
  if (PLAY_MODE === "pure") {
    delete input.hide_graph;
    delete input.seed;
  }
  return {
    hide_graph: true,
    compact_actions: true,
    compact_events: true,
    compact_observation: true,
    ...input,
    ...(PLAY_MODE === "pure" ? { hide_graph: true } : {}),
  } as never;
}

function defaultCompactActions(args: unknown): never {
  const input = typeof args === "object" && args !== null ? args : {};
  return { compact_actions: true, ...input } as never;
}

function defaultCompactOverworld(args: unknown): never {
  const input = typeof args === "object" && args !== null ? args : {};
  return { compact_context: true, compact_result: true, ...input } as never;
}

function defaultCompactOverworldAndRpg(args: unknown): never {
  const input: Record<string, unknown> =
    typeof args === "object" && args !== null ? { ...(args as Record<string, unknown>) } : {};
  if (PLAY_MODE === "pure") {
    delete input.hide_graph;
    delete input.seed;
  }
  return {
    compact_context: true,
    compact_result: true,
    hide_graph: true,
    compact_actions: true,
    compact_observation: true,
    ...input,
    ...(PLAY_MODE === "pure" ? { hide_graph: true } : {}),
  } as never;
}

function defaultCompactTranscript(args: unknown): never {
  const input = typeof args === "object" && args !== null ? args : {};
  return {
    summary_only: true,
    compact_events: true,
    compact_summary: true,
    turn_limit: TRANSCRIPT_TURN_LIMIT_DEFAULT,
    ...input,
  } as never;
}

type McpStateArgs = {
  session_id: string;
  include_state?: boolean;
  compact_state?: boolean;
  if_state_hash?: string;
};

function compactMcpState(args: McpStateArgs): unknown {
  return api.get_state(args);
}

type McpOverworldReadArgs = {
  session_id: string;
  include_observation?: boolean;
  if_snapshot_hash?: string;
  include_ids?: boolean;
  include_route_options?: boolean;
};

function compactMcpOverworldSession(args: McpOverworldReadArgs): unknown {
  return args.include_observation === true
    ? api.get_overworld_session(args)
    : api.get_overworld_session_context(args);
}

const EXPECTED_SNAPSHOT_HASH = {
  expected_snapshot_hash: z.string().optional().describe("Reject if the snapshot hash is stale."),
};
const IF_SNAPSHOT_HASH = {
  if_snapshot_hash: z
    .string()
    .optional()
    .describe("Reply unchanged:true if this snapshot hash holds."),
};
const ROUTES = {
  include_route_options: B("Include multi-leg route_options in the context."),
};
const IDS = {
  include_ids: B("Include discovered/completed id lists in the context."),
};
const W = {
  include_world_name: B("Include the world name in the context."),
};
const S = {
  include_session_id: B("Echo the session id."),
};
const COMPACT_OVERWORLD_CONTEXT = {
  compact_context: B("False swaps the compact context for the verbose observation."),
  ...W,
  ...IDS,
  ...ROUTES,
};
const COMPACT_OVERWORLD_RESULT = {
  compact_result: B("False returns the verbose action result."),
};
const OVERWORLD_ACTION_CONTEXT = {
  ...EXPECTED_SNAPSHOT_HASH,
  ...COMPACT_OVERWORLD_CONTEXT,
  ...COMPACT_OVERWORLD_RESULT,
};

tool(
  "start_overworld",
  "Start a fresh overworld game; returns its one-time tutorial, current journey goal, session_id, snapshot_hash, and compact legend.",
  {
    ...COMPACT_OVERWORLD_CONTEXT,
  },
  (a) => api.start_overworld(defaultCompactOverworld(a)),
);
tool(
  "get_overworld_session",
  "Re-read an overworld session without acting; include_observation swaps the compact context for the verbose view.",
  {
    ...SESSION,
    ...IF_SNAPSHOT_HASH,
    include_observation: z.boolean().optional().describe("Return the verbose observation."),
    ...S,
    ...W,
    ...IDS,
    ...ROUTES,
  },
  (a) => compactMcpOverworldSession(a),
);
tool(
  "get_overworld_session_context",
  "Re-read only the compact context of an overworld session, with if_snapshot_hash change detection.",
  {
    ...SESSION,
    ...IF_SNAPSHOT_HASH,
    ...S,
    ...W,
    ...IDS,
    ...ROUTES,
  },
  (a) => api.get_overworld_session_context(a),
);
tool(
  "export_overworld_session",
  "Export a resumable overworld snapshot; pass it to restore_overworld_session to continue the run later.",
  {
    ...SESSION,
    ...EXPECTED_SNAPSHOT_HASH,
    ...IF_SNAPSHOT_HASH,
  },
  (a) => api.export_overworld_session(a),
);
tool(
  "restore_overworld_session",
  "Continue an exported overworld snapshot as a new session without replaying the fresh-game tutorial; repeats the compact-context legend.",
  {
    snapshot: z.record(z.unknown()).describe("Snapshot from export_overworld_session."),
    ...COMPACT_OVERWORLD_CONTEXT,
  },
  (a) => api.restore_overworld_session(defaultCompactOverworld(a)),
);
tool(
  "travel_overworld_session",
  "Travel to another town, spending minutes and supplies and gaining fatigue; may trigger a road encounter.",
  {
    ...SESSION,
    destination_town_id: z.string().optional().describe("Destination town; routes multi-leg."),
    road_id: z.string().optional().describe("Single road to walk instead."),
    ...OVERWORLD_ACTION_CONTEXT,
  },
  (a) => api.travel_overworld_session(defaultCompactOverworld(a)),
);
tool(
  "resolve_overworld_session_road_encounter",
  "Choose a strategy for the pending road encounter; travel stays blocked until it is resolved.",
  {
    ...SESSION,
    strategy: z
      .enum(["cautious_scout", "assist_travelers", "press_on"])
      .describe("Option from pending_road.options."),
    ...OVERWORLD_ACTION_CONTEXT,
  },
  (a) => api.resolve_overworld_session_road_encounter(defaultCompactOverworld(a)),
);
tool(
  "resupply_overworld_session",
  "Buy supplies back up to the cap at the current town, spending time.",
  {
    ...SESSION,
    ...OVERWORLD_ACTION_CONTEXT,
  },
  (a) => api.resupply_overworld_session(defaultCompactOverworld(a)),
);
tool(
  "rest_overworld_session",
  "Rest at the current town to lower fatigue, spending time.",
  {
    ...SESSION,
    ...OVERWORLD_ACTION_CONTEXT,
  },
  (a) => api.rest_overworld_session(defaultCompactOverworld(a)),
);
tool(
  "plan_overworld_session_route",
  "Preview the best route to a town — minutes, supplies, fatigue — without moving.",
  {
    ...SESSION,
    destination_town_id: z.string().describe("Destination town id."),
    ...OVERWORLD_ACTION_CONTEXT,
  },
  (a) => api.plan_overworld_session_route(defaultCompactOverworld(a)),
);
tool(
  "scout_overworld_session_poi",
  "Scout a point of interest in the current area; can reveal hidden areas, jobs, sites, or quests.",
  {
    ...SESSION,
    poi_id: z.string().describe("POI id."),
    ...OVERWORLD_ACTION_CONTEXT,
  },
  (a) => api.scout_overworld_session_poi(defaultCompactOverworld(a)),
);
tool(
  "talk_overworld_session_contact",
  "Talk to a local contact; can reveal leads, jobs, quests, or renown.",
  {
    ...SESSION,
    character_id: z.string().describe("Contact id."),
    ...OVERWORLD_ACTION_CONTEXT,
  },
  (a) => api.talk_overworld_session_contact(defaultCompactOverworld(a)),
);
tool(
  "investigate_overworld_session_event",
  "Investigate a local event to uncover details before resolving it.",
  {
    ...SESSION,
    event_id: z.string().describe("Event id."),
    ...OVERWORLD_ACTION_CONTEXT,
  },
  (a) => api.investigate_overworld_session_event(defaultCompactOverworld(a)),
);
tool(
  "resolve_overworld_session_event",
  "Resolve an investigated local event, spending time and earning renown.",
  {
    ...SESSION,
    event_id: z.string().describe("Event id."),
    ...OVERWORLD_ACTION_CONTEXT,
  },
  (a) => api.resolve_overworld_session_event(defaultCompactOverworld(a)),
);
tool(
  "explore_overworld_session_site",
  "Explore a discovered exploration site for renown and journal finds.",
  {
    ...SESSION,
    site_id: z.string().describe("Site id."),
    ...OVERWORLD_ACTION_CONTEXT,
  },
  (a) => api.explore_overworld_session_site(defaultCompactOverworld(a)),
);
tool(
  "explore_overworld_session_area",
  "Survey the current local area to reveal its points of interest, contacts, events, and exits.",
  {
    ...SESSION,
    area_id: z.string().describe("Area id."),
    ...OVERWORLD_ACTION_CONTEXT,
  },
  (a) => api.explore_overworld_session_area(defaultCompactOverworld(a)),
);
tool(
  "move_overworld_session_area",
  "Walk an area route to another local area inside the current town.",
  {
    ...SESSION,
    area_route_id: z.string().describe("Route id from area_routes."),
    ...OVERWORLD_ACTION_CONTEXT,
  },
  (a) => api.move_overworld_session_area(defaultCompactOverworld(a)),
);
tool(
  "work_overworld_session_job",
  "Work a discovered local job, spending time to earn renown.",
  {
    ...SESSION,
    job_id: z.string().describe("Job id."),
    ...OVERWORLD_ACTION_CONTEXT,
  },
  (a) => api.work_overworld_session_job(defaultCompactOverworld(a)),
);
tool(
  "start_overworld_session_quest",
  "Start a discovered quest as an embedded RPG session; play it via step_action, then complete_overworld_session_quest.",
  {
    ...SESSION,
    quest_id: z.string().describe("Quest id."),
    ...EMBEDDED_QUEST_SEED,
    ...PLAYER_HIDE_GRAPH,
    ...COMPACT_ACTIONS,
    ...COMPACT_OBSERVATION,
    ...OVERWORLD_ACTION_CONTEXT,
  },
  (a) => api.start_overworld_session_quest(defaultCompactOverworldAndRpg(a)),
);
tool(
  "complete_overworld_session_quest",
  "Fold an ended RPG quest session's outcome back into overworld progress and renown.",
  {
    ...SESSION,
    rpg_session_id: z.string().describe("Ended RPG session."),
    expected_rpg_state_hash: z.string().optional().describe("Reject stale RPG state."),
    ...OVERWORLD_ACTION_CONTEXT,
  },
  (a) => api.complete_overworld_session_quest(defaultCompactOverworld(a)),
);
tool(
  "choose_overworld_session_journey",
  "At a presented journey pause, choose to continue playing or end this journey.",
  {
    ...SESSION,
    choice: z.enum(["continue", "end"]).describe("Choice from journey.pendingChoice.options."),
    ...OVERWORLD_ACTION_CONTEXT,
  },
  (a) => api.choose_overworld_session_journey(defaultCompactOverworld(a)),
);
tool(
  "validate_quest",
  "Validate one shipped RPG quest by id and return its validation report.",
  WORLD_QUEST_SOURCE,
  (a) => api.validate_quest(a),
);
tool(
  "load_quest",
  "Compile a shipped RPG quest and return its metadata, content hash, and validation report.",
  WORLD_QUEST_SOURCE,
  (a) => api.load_quest(a),
);

tool(
  "generate_rpg_pack",
  "Mint and validate a deterministic RPG pack from a seed, writing nothing; play it via new_game's generate_rpg_seed.",
  {
    seed: G.describe("Generation seed."),
  },
  (a) => api.generate_rpg_pack(a),
);

tool(
  "new_game",
  "Start an RPG session on the default or a generated pack; returns session_id, state_hash, and a compact context with its legend.",
  {
    generate_rpg_seed: G.optional().describe("Seed from generate_rpg_pack."),
    seed: z.number().int().safe().optional().describe("Runtime seed."),
    ...HIDE_GRAPH,
    ...COMPACT_ACTIONS,
    ...COMPACT_OBSERVATION,
  },
  (a) => api.new_game(defaultCompactRpg(a)),
);
tool(
  "start_world_quest",
  "Start an RPG session for a shipped quest by id — a dev/QA entry point into the RPG runtime; players reach quests in-world via the overworld. Returns session_id, state_hash, and a compact context with its legend.",
  {
    world_quest_id: z.string().describe("Shipped quest id (from the overworld quest registry)."),
    seed: z.number().int().safe().optional().describe("Runtime seed."),
    ...HIDE_GRAPH,
    ...COMPACT_ACTIONS,
    ...COMPACT_OBSERVATION,
  },
  (a) => api.start_world_quest(defaultCompactRpg(a)),
);

tool(
  "get_observation",
  "Re-read the current RPG context without acting; embedded quests also return the parent journey.",
  {
    ...SESSION,
    ...PLAYER_HIDE_GRAPH,
    ...IF_STATE_HASH,
    ...COMPACT_ACTIONS,
    ...COMPACT_OBSERVATION,
  },
  (a) => api.get_observation(defaultCompactRpg(a)),
);
tool(
  "list_legal_actions",
  "List legal RPG action ids; embedded play returns none while its journey choice is due.",
  {
    ...SESSION,
    ...IF_STATE_HASH,
    compact_actions: z.boolean().optional().describe("False returns labeled options."),
  },
  (a) => api.list_legal_actions(defaultCompactActions(a)),
);

tool(
  "step_action",
  "Apply one legal RPG action; embedded play also updates and returns the parent journey.",
  {
    ...SESSION,
    action_id: z.string().describe("Action id from list_legal_actions."),
    ...EXPECTED_STATE_HASH,
    ...PLAYER_HIDE_GRAPH,
    ...COMPACT_ACTIONS,
    ...COMPACT_EVENTS,
    ...COMPACT_OBSERVATION,
  },
  (a) => api.step_action(defaultCompactRpg(a)),
);
tool(
  "get_state",
  "Read the RPG session's state hash for change detection; raw or compact state is opt-in.",
  {
    ...SESSION,
    ...IF_STATE_HASH,
    include_state: z.boolean().optional().describe("Include the raw state object."),
    compact_state: z.boolean().optional().describe("Include a compact state summary."),
  },
  (a) => compactMcpState(a),
);
tool(
  "get_transcript",
  "Summarize an RPG session's play history; per-turn rows and events are opt-in.",
  {
    ...SESSION,
    ...S,
    include_source: z.boolean().optional(),
    ...IF_TRANSCRIPT_HASH,
    summary_only: z.boolean().optional().describe("False adds per-turn rows."),
    compact_summary: z.boolean().optional().describe("False keeps verbose summary labels."),
    compact_turns: z.boolean().optional().describe("Turn rows as tuples."),
    turn_limit: z.number().int().min(0).optional().describe("Max turn rows."),
    ...COMPACT_EVENTS,
  },
  (a) => api.get_transcript(defaultCompactTranscript(a)),
);
tool(
  "save_game",
  "Serialize the RPG session to a save string for load_game; hash guards reject stale saves.",
  {
    ...SESSION,
    ...EXPECTED_STATE_HASH,
    ...IF_STATE_HASH,
    include_source: z.boolean().optional().describe("Echo source id."),
    include_content_hash: z.boolean().optional().describe("Echo content hash."),
  },
  (a) => api.save_game(a),
);
tool(
  "load_game",
  "Restore an RPG session from a save string; returns a new session_id and a compact context with its legend.",
  {
    world_quest_id: z.string().optional().describe("World quest id."),
    generate_rpg_seed: G.optional().describe("Seed for generated-pack saves."),
    save: z.string().describe("Save string from save_game."),
    ...HIDE_GRAPH,
    ...COMPACT_ACTIONS,
    ...COMPACT_OBSERVATION,
  },
  (a) => api.load_game(defaultCompactRpg(a)),
);

tool(
  "replay_trace",
  "Replay a recorded action trace through the engine and verify the final state hash.",
  {
    trace_path: z.string().describe("Trace path."),
    world_quest_id: z.string().optional().describe("World quest id."),
  },
  (a) => api.replay_trace(a),
);

tool(
  "adapt_story",
  "Author and validate a new RPG pack from a story premise; returns the authoring report.",
  {
    premise: z.string().describe("Story premise."),
    include_pack: z.boolean().optional().describe("Echo the authored pack."),
  },
  (a) => api.adapt_story(a),
);

tool(
  "inspect_trace",
  "Inspect a recorded trace with per-step summaries, hash checks, and bug diagnosis.",
  {
    trace_path: z.string().describe("Trace path."),
    world_quest_id: z.string().optional().describe("World quest id."),
    compact_summary: z.boolean().optional().describe("Step summaries as tuple rows."),
  },
  (a) => api.inspect_trace(a),
);

tool(
  "apply_content_patch",
  "Apply a validated op-based content patch to a shipped quest and return proof; writes nothing.",
  {
    ...WORLD_QUEST_SOURCE,
    include_pack: z.boolean().optional().describe("Echo the patched pack."),
    proposal: z
      .object({
        layer: z.enum([
          "content",
          "engine_rule",
          "validator",
          "test",
          "hint_text",
          "quest_structure",
        ]),
        summary: z.string(),
        ops: z.array(z.record(z.string(), z.unknown())).describe("Validated patch ops."),
      })
      .describe("Op-based patch proposal."),
  },
  (a) => api.apply_content_patch(a as never),
);

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // Log to stderr only — stdout is the MCP transport.
  process.stderr.write("adventureforge MCP server ready on stdio\n");
  announceSpectate();
}

// Connect the stdio transport only when this module is the process entrypoint
// (`npm run mcp` / `tsx src/mcp/server.ts`). Importing it — e.g. from
// tests/unit/compact_legend.test.ts to read TOOL_REGISTRATIONS — must not
// hijack stdin/stdout.
const entryPath = process.argv[1] === undefined ? "" : resolve(process.argv[1]);
const isDirectRun =
  entryPath !== "" && entryPath.toLowerCase() === fileURLToPath(import.meta.url).toLowerCase();

if (isDirectRun) {
  main().catch((e) => {
    process.stderr.write(`Fatal: ${(e as Error).message}\n`);
    process.exit(1);
  });
}
