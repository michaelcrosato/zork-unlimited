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
const SESSION = {
  session_id: z.string().describe("Session."),
};
const HIDE_GRAPH = {
  hide_graph: z.boolean().optional().describe("Hide exit targets."),
};
const COMPACT_ACTIONS = {
  compact_actions: z.boolean().optional().describe("Ids only."),
};
const COMPACT_EVENTS = {
  compact_events: z.boolean().optional().describe("Default true; false full events."),
};
const COMPACT_OBSERVATION = {
  compact_observation: z.boolean().optional().describe("Default true; false full obs."),
};
const IF_STATE_HASH = {
  if_state_hash: z.string().optional().describe("Hash-only when unchanged."),
};
const EXPECTED_STATE_HASH = {
  expected_state_hash: z.string().optional().describe("Reject stale state_hash."),
};
tool(
  "list_world",
  "List shipped RPG quest ids; graph and all routes are opt-in.",
  {
    include_graph: z.boolean().optional().describe("Include the pack-free world graph."),
    include_routes: z.boolean().optional().describe("Include every quest route from the hub."),
  },
  (a) => api.list_world(a),
);
tool(
  "world_path",
  "Return the route from Charterhaven to a shipped RPG quest.",
  {
    world_quest_id: z.string().describe("World quest id."),
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
  return { compact_events: true, compact_observation: true, ...input } as never;
}

function defaultCompactActions(args: unknown): never {
  const input = typeof args === "object" && args !== null ? args : {};
  return { compact_actions: true, ...input } as never;
}

function defaultCompactOverworld(args: unknown): never {
  const input = typeof args === "object" && args !== null ? args : {};
  return { compact_context: true, ...input } as never;
}

function defaultCompactOverworldAndRpg(args: unknown): never {
  const input = typeof args === "object" && args !== null ? args : {};
  return { compact_context: true, compact_observation: true, ...input } as never;
}

function defaultCompactTranscript(args: unknown): never {
  const input = typeof args === "object" && args !== null ? args : {};
  return { summary_only: true, compact_summary: true, ...input } as never;
}

type McpStateArgs = {
  session_id: string;
  include_state?: boolean;
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
  expected_snapshot_hash: z.string().optional().describe("Reject stale snapshot_hash."),
};
const IF_SNAPSHOT_HASH = {
  if_snapshot_hash: z.string().optional().describe("Hash-only when unchanged."),
};
const COMPACT_OVERWORLD_CONTEXT = {
  compact_context: z.boolean().optional().describe("Default true; false full observation."),
};
const OVERWORLD_ACTION_CONTEXT = { ...EXPECTED_SNAPSHOT_HASH, ...COMPACT_OVERWORLD_CONTEXT };

tool(
  "start_overworld",
  "Start a stateful New York overworld run; returns compact context by default.",
  {
    ...COMPACT_OVERWORLD_CONTEXT,
  },
  (a) => api.start_overworld(defaultCompactOverworld(a)),
);
tool(
  "get_overworld_session",
  "Read compact overworld context; if_snapshot_hash returns hash-only when unchanged.",
  {
    session_id: z.string().describe("Session id returned by start_overworld."),
    ...IF_SNAPSHOT_HASH,
    include_observation: z.boolean().optional().describe("Include full observation object."),
  },
  (a) => compactMcpOverworldSession(a),
);
tool(
  "get_overworld_session_context",
  "Read compact overworld context for repeated loop turns; if_snapshot_hash returns hash-only when unchanged.",
  {
    session_id: z.string().describe("Session id returned by start_overworld."),
    ...IF_SNAPSHOT_HASH,
  },
  (a) => api.get_overworld_session_context(a),
);
tool(
  "export_overworld_session",
  "Export a content-bound overworld snapshot plus snapshot_hash; expected_snapshot_hash rejects stale checkpoints.",
  {
    session_id: z.string().describe("Session id returned by start_overworld."),
    ...EXPECTED_SNAPSHOT_HASH,
  },
  (a) => api.export_overworld_session(a),
);
tool(
  "restore_overworld_session",
  "Restore an overworld snapshot; returns snapshot_hash and compact context by default.",
  {
    snapshot: z
      .record(z.unknown())
      .describe("Snapshot object previously returned as export_overworld_session.snapshot."),
    ...COMPACT_OVERWORLD_CONTEXT,
  },
  (a) => api.restore_overworld_session(defaultCompactOverworld(a)),
);
tool(
  "travel_overworld_session",
  "Travel along an adjacent road id; returns compact context by default.",
  {
    session_id: z.string().describe("Session id returned by start_overworld."),
    road_id: z.string().describe("Road id from the session observation's exits list."),
    ...OVERWORLD_ACTION_CONTEXT,
  },
  (a) => api.travel_overworld_session(defaultCompactOverworld(a)),
);
tool(
  "resolve_overworld_session_road_encounter",
  "Resolve the pending road encounter; returns compact context by default.",
  {
    session_id: z.string().describe("Session id returned by start_overworld."),
    strategy: z
      .enum(["cautious_scout", "assist_travelers", "press_on"])
      .describe("Road encounter response from observation.pendingRoadEncounter.options."),
    ...OVERWORLD_ACTION_CONTEXT,
  },
  (a) => api.resolve_overworld_session_road_encounter(defaultCompactOverworld(a)),
);
tool(
  "resupply_overworld_session",
  "Resupply at the current town; returns compact context by default.",
  {
    session_id: z.string().describe("Session id returned by start_overworld."),
    ...OVERWORLD_ACTION_CONTEXT,
  },
  (a) => api.resupply_overworld_session(defaultCompactOverworld(a)),
);
tool(
  "rest_overworld_session",
  "Rest at the current town; returns compact context by default.",
  {
    session_id: z.string().describe("Session id returned by start_overworld."),
    ...OVERWORLD_ACTION_CONTEXT,
  },
  (a) => api.rest_overworld_session(defaultCompactOverworld(a)),
);
tool(
  "plan_overworld_session_route",
  "Plan the shortest known route to a discovered town; returns compact context by default.",
  {
    session_id: z.string().describe("Session id returned by start_overworld."),
    destination_town_id: z
      .string()
      .describe(
        "Discovered town id from the session observation's discovered or routeOptions list.",
      ),
    ...OVERWORLD_ACTION_CONTEXT,
  },
  (a) => api.plan_overworld_session_route(defaultCompactOverworld(a)),
);
tool(
  "scout_overworld_session_poi",
  "Scout a local point of interest; returns compact context by default.",
  {
    session_id: z.string().describe("Session id returned by start_overworld."),
    poi_id: z.string().describe("Point-of-interest id from the session observation."),
    ...OVERWORLD_ACTION_CONTEXT,
  },
  (a) => api.scout_overworld_session_poi(defaultCompactOverworld(a)),
);
tool(
  "talk_overworld_session_contact",
  "Talk to a local contact; returns compact context by default.",
  {
    session_id: z.string().describe("Session id returned by start_overworld."),
    character_id: z.string().describe("Character id from the session observation."),
    ...OVERWORLD_ACTION_CONTEXT,
  },
  (a) => api.talk_overworld_session_contact(defaultCompactOverworld(a)),
);
tool(
  "investigate_overworld_session_event",
  "Investigate a local event; returns compact context by default.",
  {
    session_id: z.string().describe("Session id returned by start_overworld."),
    event_id: z.string().describe("Event id from the session observation."),
    ...OVERWORLD_ACTION_CONTEXT,
  },
  (a) => api.investigate_overworld_session_event(defaultCompactOverworld(a)),
);
tool(
  "resolve_overworld_session_event",
  "Resolve a local event; returns compact context by default.",
  {
    session_id: z.string().describe("Session id returned by start_overworld."),
    event_id: z.string().describe("Event id from the session observation."),
    ...OVERWORLD_ACTION_CONTEXT,
  },
  (a) => api.resolve_overworld_session_event(defaultCompactOverworld(a)),
);
tool(
  "explore_overworld_session_site",
  "Explore a discovered regional site; returns compact context by default.",
  {
    session_id: z.string().describe("Session id returned by start_overworld."),
    site_id: z.string().describe("Exploration site id from the session observation's sites list."),
    ...OVERWORLD_ACTION_CONTEXT,
  },
  (a) => api.explore_overworld_session_site(defaultCompactOverworld(a)),
);
tool(
  "explore_overworld_session_area",
  "Explore a discovered local area; returns compact context by default.",
  {
    session_id: z.string().describe("Session id returned by start_overworld."),
    area_id: z.string().describe("Area id from the session observation's areas list."),
    ...OVERWORLD_ACTION_CONTEXT,
  },
  (a) => api.explore_overworld_session_area(defaultCompactOverworld(a)),
);
tool(
  "move_overworld_session_area",
  "Move inside the current town along a local-area route; returns compact context by default.",
  {
    session_id: z.string().describe("Session id returned by start_overworld."),
    area_route_id: z.string().describe("Area route id from observation.areaExits."),
    ...OVERWORLD_ACTION_CONTEXT,
  },
  (a) => api.move_overworld_session_area(defaultCompactOverworld(a)),
);
tool(
  "work_overworld_session_job",
  "Work a discovered local job; returns compact context by default.",
  {
    session_id: z.string().describe("Session id returned by start_overworld."),
    job_id: z.string().describe("Job id from the session observation's jobs list."),
    ...OVERWORLD_ACTION_CONTEXT,
  },
  (a) => api.work_overworld_session_job(defaultCompactOverworld(a)),
);
tool(
  "start_overworld_session_quest",
  "Start a discovered local quest lead; returns compact overworld/RPG context by default.",
  {
    session_id: z.string().describe("Session id returned by start_overworld."),
    quest_id: z.string().describe("Quest id from the session observation's quests list."),
    seed: z.number().int().optional().describe("Optional runtime seed for the RPG quest session."),
    hide_graph: z
      .boolean()
      .optional()
      .describe("When true, hide RPG graph destinations in the returned quest observation."),
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
    session_id: z.string().describe("Session id returned by start_overworld."),
    rpg_session_id: z.string().describe("Ended RPG session id returned by quest start."),
    ...OVERWORLD_ACTION_CONTEXT,
  },
  (a) => api.complete_overworld_session_quest(defaultCompactOverworld(a)),
);
tool("validate_quest", "Validate one shipped RPG quest by id.", WORLD_QUEST_SOURCE, (a) =>
  api.validate_quest(a),
);
tool(
  "load_quest",
  "Compile a shipped world quest by graph id and return its metadata, content hash, source identity, and validation report.",
  WORLD_QUEST_SOURCE,
  (a) => api.load_quest(a),
);

tool(
  "generate_rpg_pack",
  "Mint a FRESH procedural RPG pack from a seed and validate it against the same gate the curated RPG packs clear — exercising the combat-winnability and score-economy proofs against a moving target. Pure + deterministic; writes nothing. Play it with new_game's generate_rpg_seed.",
  {
    seed: z.number().int().describe("Generation seed — selects the minted pack's theme/structure."),
  },
  (a) => api.generate_rpg_pack(a),
);

tool(
  "new_game",
  "Start a generated RPG quest; returns compact context by default.",
  {
    generate_rpg_seed: z.number().int().optional().describe("Procedural RPG seed."),
    seed: z.number().int().optional().describe("Deterministic runtime seed (default 1)."),
    ...HIDE_GRAPH,
    ...COMPACT_ACTIONS,
    ...COMPACT_OBSERVATION,
  },
  (a) => api.new_game(defaultCompactRpg(a)),
);
tool(
  "start_world_quest",
  "Start RPG quest; compact by default.",
  {
    world_quest_id: z.string().describe("World quest id."),
    seed: z.number().int().optional(),
    ...HIDE_GRAPH,
    ...COMPACT_ACTIONS,
    ...COMPACT_OBSERVATION,
  },
  (a) => api.start_world_quest(defaultCompactRpg(a)),
);

tool(
  "get_observation",
  "Read compact RPG context; if_state_hash returns hash-only when unchanged.",
  { ...SESSION, ...HIDE_GRAPH, ...IF_STATE_HASH, ...COMPACT_ACTIONS, ...COMPACT_OBSERVATION },
  (a) => api.get_observation(defaultCompactRpg(a)),
);
tool(
  "list_legal_actions",
  "List action ids plus state_hash; if_state_hash returns hash-only when unchanged; compact_actions false returns labels.",
  {
    ...SESSION,
    ...HIDE_GRAPH,
    ...IF_STATE_HASH,
    compact_actions: z.boolean().optional().describe("Default true; false returns labels."),
  },
  (a) => api.list_legal_actions(defaultCompactActions(a)),
);

tool(
  "step_action",
  "Apply action id; rejects stale menus.",
  {
    ...SESSION,
    action_id: z.string().describe("Current action id."),
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
  "Return state hash; include_state true returns raw deterministic state.",
  {
    ...SESSION,
    include_state: z.boolean().optional().describe("Include raw reducer state for debugging."),
  },
  (a) => compactMcpState(a),
);
tool(
  "get_transcript",
  "Compact transcript; if_state_hash returns unchanged.",
  {
    ...SESSION,
    ...IF_STATE_HASH,
    summary_only: z.boolean().optional().describe("Default true; omits turns."),
    compact_summary: z
      .boolean()
      .optional()
      .describe("Default true; false returns full summary lists."),
    compact_turns: z.boolean().optional().describe("Id-only rows; ignored with summary_only."),
  },
  (a) => api.get_transcript(defaultCompactTranscript(a)),
);
tool(
  "save_game",
  "Serialize a session to a save string; expected_state_hash rejects stale checkpoints.",
  { ...SESSION, ...EXPECTED_STATE_HASH },
  (a) => api.save_game(a),
);
tool(
  "load_game",
  "Restore a saved RPG session; returns compact context by default.",
  {
    world_quest_id: z
      .string()
      .optional()
      .describe("World quest id; optional when embedded in save."),
    generate_rpg_seed: z
      .number()
      .int()
      .optional()
      .describe("Generated RPG seed; optional when embedded in save."),
    save: z.string().describe("A save string produced by save_game."),
    ...HIDE_GRAPH,
    ...COMPACT_ACTIONS,
    ...COMPACT_OBSERVATION,
  },
  (a) => api.load_game(defaultCompactRpg(a)),
);

tool(
  "replay_trace",
  "Replay an RPG trace and verify its final-state hash.",
  {
    trace_path: z.string().describe("Project-relative trace JSON path."),
    world_quest_id: z
      .string()
      .optional()
      .describe("World quest id; optional when embedded in trace."),
  },
  (a) => api.replay_trace(a),
);

tool(
  "adapt_story",
  "Author an RPG pack from a premise via the writer→adapter→validator loop (§12.1–3); returns the pack, validation report, and per-beat classification.",
  {
    premise: z.string().describe("A one-sentence story premise to author from."),
  },
  (a) => api.adapt_story(a),
);

tool(
  "inspect_trace",
  "Summarize an RPG trace with replay diagnostics.",
  {
    trace_path: z.string().describe("Project-relative trace JSON path."),
    world_quest_id: z
      .string()
      .optional()
      .describe("World quest id; optional when embedded in trace."),
  },
  (a) => api.inspect_trace(a),
);

tool(
  "apply_content_patch",
  "Apply a structured, whitelisted content patch with deterministic code to a shipped world quest id and return the modified pack + validation report (§9.4, §16). Never writes files; never runs model-issued code.",
  {
    ...WORLD_QUEST_SOURCE,
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
        ops: z
          .array(z.record(z.string(), z.unknown()))
          .describe(
            "Closed-vocabulary patch ops; validated against the fixer's op schema (§12.5).",
          ),
      })
      .describe(
        "A ContentPatchProposal: a single-layer, op-based edit applied by code, not the model.",
      ),
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
