/**
 * MCP server (spec §9.4) — exposes the engine as agent tools over stdio.
 *
 * Every tool is a thin adapter over the pure handlers in tools.ts (which are the
 * unit-tested source of truth). The server confines all paths to the project
 * root and treats content/traces as data only — never code or shell (§16).
 *
 * Run: `npm run mcp` (or register the project's .mcp.json in an MCP client).
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z, type ZodRawShape } from "zod";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { createToolApi } from "./tools.js";
import { TRANSCRIPT_TURN_LIMIT_DEFAULT } from "./transcript_projection.js";
import { isGeneratedRpgSeed as genSeed } from "../gen/seed.js";

const api = createToolApi({ root: process.cwd() });

function ok(value: unknown): CallToolResult {
  return { content: [{ type: "text", text: JSON.stringify(value) }] };
}

function wrap<A>(handler: (args: A) => unknown) {
  return async (args: A): Promise<CallToolResult> => {
    try {
      return ok(await handler(args)); // await is a no-op for the sync handlers
    } catch (e) {
      return { content: [{ type: "text", text: `Error: ${(e as Error).message}` }], isError: true };
    }
  };
}

const server = new McpServer({ name: "adventureforge", version: "0.1.0" });

function tool(
  name: string,
  description: string,
  inputSchema: ZodRawShape,
  handler: (args: never) => unknown,
): void {
  server.registerTool(name, { description, inputSchema }, wrap(handler) as never);
}

const WORLD_QUEST_SOURCE = {
  world_quest_id: z.string().describe("World quest id."),
};
const G = z.number().int().refine(genSeed);
const SESSION = {
  session_id: z.string().describe("Session."),
};
const HIDE_GRAPH = {
  hide_graph: z.boolean().optional().describe("Hide exits."),
};
const COMPACT_ACTIONS = {
  compact_actions: z.boolean().optional().describe("Ids."),
};
const COMPACT_EVENTS = {
  compact_events: z.boolean().optional().describe("Full events?"),
};
const COMPACT_OBSERVATION = {
  compact_observation: z.boolean().optional().describe("Full obs?"),
};
const IF_STATE_HASH = {
  if_state_hash: z.string().optional().describe("If same."),
};
const IF_TRANSCRIPT_HASH = {
  if_transcript_hash: z.string().optional().describe("If same tx."),
};
const EXPECTED_STATE_HASH = {
  expected_state_hash: z.string().optional().describe("Reject stale."),
};
tool(
  "list_world",
  "List shipped RPG quest ids; graph and all routes are opt-in.",
  {
    include_graph: z
      .boolean()
      .optional()
      .describe("Include the pack-free world graph with map coordinates."),
    include_routes: z.boolean().optional().describe("Include every quest route from the hub."),
  },
  (a) => api.list_world(a),
);
tool(
  "world_path",
  "Return the route from Charterhaven to a world graph node.",
  {
    world_quest_id: z.string().optional().describe("World quest id."),
    coord: z.tuple([z.number().int(), z.number().int()]).optional().describe("Node coordinate."),
  },
  (a) => api.world_path(a),
);
tool(
  "list_overworld",
  "List overworld counts and the start town; design notes are opt-in.",
  {
    include_design_notes: z.boolean().optional().describe("Include sources and design rules."),
  },
  (a) => api.list_overworld(a),
);

function defaultCompactRpg(args: unknown): never {
  const input = typeof args === "object" && args !== null ? args : {};
  return {
    hide_graph: true,
    compact_actions: true,
    compact_events: true,
    compact_observation: true,
    ...input,
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
  const input = typeof args === "object" && args !== null ? args : {};
  return {
    compact_context: true,
    compact_result: true,
    hide_graph: true,
    compact_actions: true,
    compact_observation: true,
    ...input,
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
};

function compactMcpOverworldSession(args: McpOverworldReadArgs): unknown {
  return args.include_observation === true
    ? api.get_overworld_session(args)
    : api.get_overworld_session_context(args);
}

const EXPECTED_SNAPSHOT_HASH = {
  expected_snapshot_hash: z.string().optional().describe("Hash-only reject when stale."),
};
const IF_SNAPSHOT_HASH = {
  if_snapshot_hash: z.string().optional().describe("Hash-only when unchanged."),
};
const COMPACT_OVERWORLD_CONTEXT = {
  compact_context: z.boolean().optional().describe("Default true; false full obs."),
};
const COMPACT_OVERWORLD_RESULT = {
  compact_result: z.boolean().optional().describe("Default true; false full result."),
};
const OVERWORLD_ACTION_CONTEXT = {
  ...EXPECTED_SNAPSHOT_HASH,
  ...COMPACT_OVERWORLD_CONTEXT,
  ...COMPACT_OVERWORLD_RESULT,
};

tool(
  "start_overworld",
  "Start overworld; compact.",
  {
    ...COMPACT_OVERWORLD_CONTEXT,
  },
  (a) => api.start_overworld(defaultCompactOverworld(a)),
);
tool(
  "get_overworld_session",
  "Read overworld; hash-only if same.",
  {
    ...SESSION,
    ...IF_SNAPSHOT_HASH,
    include_observation: z.boolean().optional().describe("Return full obs."),
  },
  (a) => compactMcpOverworldSession(a),
);
tool(
  "get_overworld_session_context",
  "Read compact overworld; hash-only if same.",
  {
    ...SESSION,
    ...IF_SNAPSHOT_HASH,
  },
  (a) => api.get_overworld_session_context(a),
);
tool(
  "export_overworld_session",
  "Export overworld snapshot; hash guards.",
  {
    ...SESSION,
    ...EXPECTED_SNAPSHOT_HASH,
    ...IF_SNAPSHOT_HASH,
  },
  (a) => api.export_overworld_session(a),
);
tool(
  "restore_overworld_session",
  "Restore overworld snapshot; compact.",
  {
    snapshot: z.record(z.unknown()).describe("Exported snapshot."),
    ...COMPACT_OVERWORLD_CONTEXT,
  },
  (a) => api.restore_overworld_session(defaultCompactOverworld(a)),
);
tool(
  "travel_overworld_session",
  "Travel road.",
  {
    ...SESSION,
    road_id: z.string().describe("Road id."),
    ...OVERWORLD_ACTION_CONTEXT,
  },
  (a) => api.travel_overworld_session(defaultCompactOverworld(a)),
);
tool(
  "resolve_overworld_session_road_encounter",
  "Resolve road encounter.",
  {
    ...SESSION,
    strategy: z
      .enum(["cautious_scout", "assist_travelers", "press_on"])
      .describe("Encounter option."),
    ...OVERWORLD_ACTION_CONTEXT,
  },
  (a) => api.resolve_overworld_session_road_encounter(defaultCompactOverworld(a)),
);
tool(
  "resupply_overworld_session",
  "Resupply.",
  {
    ...SESSION,
    ...OVERWORLD_ACTION_CONTEXT,
  },
  (a) => api.resupply_overworld_session(defaultCompactOverworld(a)),
);
tool(
  "rest_overworld_session",
  "Rest.",
  {
    ...SESSION,
    ...OVERWORLD_ACTION_CONTEXT,
  },
  (a) => api.rest_overworld_session(defaultCompactOverworld(a)),
);
tool(
  "plan_overworld_session_route",
  "Plan route.",
  {
    ...SESSION,
    destination_town_id: z.string().describe("Town id."),
    ...OVERWORLD_ACTION_CONTEXT,
  },
  (a) => api.plan_overworld_session_route(defaultCompactOverworld(a)),
);
tool(
  "scout_overworld_session_poi",
  "Scout POI.",
  {
    ...SESSION,
    poi_id: z.string().describe("POI id."),
    ...OVERWORLD_ACTION_CONTEXT,
  },
  (a) => api.scout_overworld_session_poi(defaultCompactOverworld(a)),
);
tool(
  "talk_overworld_session_contact",
  "Talk contact.",
  {
    ...SESSION,
    character_id: z.string().describe("Contact id."),
    ...OVERWORLD_ACTION_CONTEXT,
  },
  (a) => api.talk_overworld_session_contact(defaultCompactOverworld(a)),
);
tool(
  "investigate_overworld_session_event",
  "Investigate event.",
  {
    ...SESSION,
    event_id: z.string().describe("Event id."),
    ...OVERWORLD_ACTION_CONTEXT,
  },
  (a) => api.investigate_overworld_session_event(defaultCompactOverworld(a)),
);
tool(
  "resolve_overworld_session_event",
  "Resolve event.",
  {
    ...SESSION,
    event_id: z.string().describe("Event id."),
    ...OVERWORLD_ACTION_CONTEXT,
  },
  (a) => api.resolve_overworld_session_event(defaultCompactOverworld(a)),
);
tool(
  "explore_overworld_session_site",
  "Explore site.",
  {
    ...SESSION,
    site_id: z.string().describe("Site id."),
    ...OVERWORLD_ACTION_CONTEXT,
  },
  (a) => api.explore_overworld_session_site(defaultCompactOverworld(a)),
);
tool(
  "explore_overworld_session_area",
  "Explore area.",
  {
    ...SESSION,
    area_id: z.string().describe("Area id."),
    ...OVERWORLD_ACTION_CONTEXT,
  },
  (a) => api.explore_overworld_session_area(defaultCompactOverworld(a)),
);
tool(
  "move_overworld_session_area",
  "Move area route.",
  {
    ...SESSION,
    area_route_id: z.string().describe("Area route id."),
    ...OVERWORLD_ACTION_CONTEXT,
  },
  (a) => api.move_overworld_session_area(defaultCompactOverworld(a)),
);
tool(
  "work_overworld_session_job",
  "Work job.",
  {
    ...SESSION,
    job_id: z.string().describe("Job id."),
    ...OVERWORLD_ACTION_CONTEXT,
  },
  (a) => api.work_overworld_session_job(defaultCompactOverworld(a)),
);
tool(
  "start_overworld_session_quest",
  "Start local quest; compact overworld/RPG.",
  {
    ...SESSION,
    quest_id: z.string().describe("Quest id."),
    seed: z.number().int().safe().optional().describe("Runtime seed."),
    ...HIDE_GRAPH,
    ...COMPACT_ACTIONS,
    ...COMPACT_OBSERVATION,
    ...OVERWORLD_ACTION_CONTEXT,
  },
  (a) => api.start_overworld_session_quest(defaultCompactOverworldAndRpg(a)),
);
tool(
  "complete_overworld_session_quest",
  "Sync an ended RPG quest session into overworld progress.",
  {
    ...SESSION,
    rpg_session_id: z.string().describe("Ended RPG session."),
    expected_rpg_state_hash: z.string().optional().describe("Reject stale RPG state."),
    ...OVERWORLD_ACTION_CONTEXT,
  },
  (a) => api.complete_overworld_session_quest(defaultCompactOverworld(a)),
);
tool("validate_quest", "Validate one shipped RPG quest by id.", WORLD_QUEST_SOURCE, (a) =>
  api.validate_quest(a),
);
tool(
  "load_quest",
  "Compile a shipped RPG quest; return metadata, hash, and report.",
  WORLD_QUEST_SOURCE,
  (a) => api.load_quest(a),
);

tool(
  "generate_rpg_pack",
  "Mint and validate a deterministic RPG pack from a seed; writes nothing.",
  {
    seed: G.describe("Generation seed."),
  },
  (a) => api.generate_rpg_pack(a),
);

tool(
  "new_game",
  "Start RPG.",
  {
    generate_rpg_seed: G.optional().describe("Gen seed."),
    seed: z.number().int().safe().optional().describe("Seed."),
    ...HIDE_GRAPH,
    ...COMPACT_ACTIONS,
    ...COMPACT_OBSERVATION,
  },
  (a) => api.new_game(defaultCompactRpg(a)),
);
tool(
  "start_world_quest",
  "Start RPG.",
  {
    world_quest_id: z.string().describe("World quest id."),
    seed: z.number().int().safe().optional(),
    ...HIDE_GRAPH,
    ...COMPACT_ACTIONS,
    ...COMPACT_OBSERVATION,
  },
  (a) => api.start_world_quest(defaultCompactRpg(a)),
);

tool(
  "get_observation",
  "Observe.",
  { ...SESSION, ...HIDE_GRAPH, ...IF_STATE_HASH, ...COMPACT_ACTIONS, ...COMPACT_OBSERVATION },
  (a) => api.get_observation(defaultCompactRpg(a)),
);
tool(
  "list_legal_actions",
  "Actions.",
  {
    ...SESSION,
    ...IF_STATE_HASH,
    compact_actions: z.boolean().optional().describe("Labels?"),
  },
  (a) => api.list_legal_actions(defaultCompactActions(a)),
);

tool(
  "step_action",
  "Step action.",
  {
    ...SESSION,
    action_id: z.string().describe("Action id."),
    ...EXPECTED_STATE_HASH,
    ...HIDE_GRAPH,
    ...COMPACT_ACTIONS,
    ...COMPACT_EVENTS,
    ...COMPACT_OBSERVATION,
  },
  (a) => api.step_action(defaultCompactRpg(a)),
);
tool(
  "get_state",
  "State hash.",
  {
    ...SESSION,
    ...IF_STATE_HASH,
    include_state: z.boolean().optional().describe("Raw."),
    compact_state: z.boolean().optional().describe("Compact."),
  },
  (a) => compactMcpState(a),
);
tool(
  "get_transcript",
  "Transcript.",
  {
    ...SESSION,
    include_source: z.boolean().optional(),
    ...IF_TRANSCRIPT_HASH,
    summary_only: z.boolean().optional().describe("No turns."),
    compact_summary: z.boolean().optional().describe("Capped lists."),
    compact_turns: z.boolean().optional().describe("Row tuples."),
    turn_limit: z.number().int().min(0).optional().describe("Rows."),
    ...COMPACT_EVENTS,
  },
  (a) => api.get_transcript(defaultCompactTranscript(a)),
);
tool(
  "save_game",
  "Serialize save; hash guards.",
  {
    ...SESSION,
    ...EXPECTED_STATE_HASH,
    ...IF_STATE_HASH,
    include_source: z.boolean().optional().describe("Echo source id."),
  },
  (a) => api.save_game(a),
);
tool(
  "load_game",
  "Restore save; compact.",
  {
    world_quest_id: z.string().optional().describe("World quest id."),
    generate_rpg_seed: G.optional().describe("Gen seed."),
    save: z.string().describe("Save string."),
    ...HIDE_GRAPH,
    ...COMPACT_ACTIONS,
    ...COMPACT_OBSERVATION,
  },
  (a) => api.load_game(defaultCompactRpg(a)),
);

tool(
  "replay_trace",
  "Replay trace; verify final hash.",
  {
    trace_path: z.string().describe("Trace path."),
    world_quest_id: z.string().optional().describe("World quest id."),
  },
  (a) => api.replay_trace(a),
);

tool(
  "adapt_story",
  "Author an RPG pack from a premise; return pack, report, and classifications.",
  {
    premise: z.string().describe("Story premise."),
  },
  (a) => api.adapt_story(a),
);

tool(
  "inspect_trace",
  "Inspect trace diagnostics.",
  {
    trace_path: z.string().describe("Trace path."),
    world_quest_id: z.string().optional().describe("World quest id."),
    compact_summary: z.boolean().optional().describe("Tuple rows."),
  },
  (a) => api.inspect_trace(a),
);

tool(
  "apply_content_patch",
  "Patch quest; report.",
  {
    ...WORLD_QUEST_SOURCE,
    include_pack: z.boolean().optional().describe("Echo pack."),
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
}

main().catch((e) => {
  process.stderr.write(`Fatal: ${(e as Error).message}\n`);
  process.exit(1);
});
