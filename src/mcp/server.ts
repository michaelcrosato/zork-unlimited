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
  return { content: [{ type: "text", text: JSON.stringify(value, null, 2) }] };
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

function tool(name: string, description: string, inputSchema: ZodRawShape, handler: (args: never) => unknown): void {
  server.registerTool(name, { description, inputSchema }, wrap(handler) as never);
}

const PACK = { pack_path: z.string().describe("Path to a CYOA pack (.yaml), relative to the project root.") };
const SESSION = { session_id: z.string().describe("A session id from new_game/load_game.") };

tool("validate_pack", "Validate a CYOA content pack; returns the validation report (§10).", PACK, (a) => api.validate_pack(a));
tool(
  "list_stories",
  "List playable CYOA story packs in content/cyoa/pack and identify the default story for AFK playtesting.",
  {},
  () => api.list_stories(),
);
tool(
  "validate_story",
  "AFK alias for validate_pack; validates one story and returns hard errors/warnings.",
  { story_path: z.string().describe("Path to a CYOA story pack, relative to the project root.") },
  (a) => api.validate_story(a),
);
tool("load_pack", "Compile a pack and return its metadata, content hash, and validation report.", PACK, (a) => api.load_pack(a));

tool(
  "new_game",
  "Start a new game on a (playable) pack; returns a session id and the first observation.",
  { ...PACK, seed: z.number().int().optional().describe("Deterministic seed (default 1).") },
  (a) => api.new_game(a),
);
tool(
  "start_game",
  "AFK alias for new_game; start a story session for MCP-driven playtesting.",
  { story_path: z.string().describe("Path to a CYOA story pack."), seed: z.number().int().optional() },
  (a) => api.start_game(a),
);

tool("get_observation", "Get the current AI-facing observation for a session (§9.1).", SESSION, (a) => api.get_observation(a));
tool("get_scene", "AFK alias for get_observation; returns current scene text, state, and visible options.", SESSION, (a) =>
  api.get_scene(a),
);
tool("list_legal_actions", "List the legal actions available right now in a session (§9).", SESSION, (a) => api.list_legal_actions(a));

tool(
  "step_action",
  "Apply one chosen action (by its id from available_actions); returns events + the new observation.",
  { ...SESSION, action_id: z.string().describe("An action id from the current legal-action set.") },
  (a) => api.step_action(a),
);
tool(
  "choose_option",
  "AFK alias for step_action; choose one visible option id and return the next scene.",
  { ...SESSION, option_id: z.string().describe("An option/action id from get_scene().observation.available_actions.") },
  (a) => api.choose_option(a),
);
tool("get_state", "Return the raw deterministic state and state hash for a session.", SESSION, (a) => api.get_state(a));
tool(
  "get_transcript",
  "Return a compact turn transcript with choices, events, inventory, flags, journal, and ending state.",
  SESSION,
  (a) => api.get_transcript(a),
);
tool(
  "run_playtest",
  "Run deterministic automated MCP-style CYOA playtests and summarize endings, coverage, unvisited scenes, and suspicious paths.",
  {
    story_path: z.string().describe("Path to a CYOA story pack."),
    strategy: z.enum(["random", "coverage"]).optional().describe("random samples varied choices; coverage biases toward new/investigative options."),
    runs: z.number().int().positive().optional().describe("Number of runs, default 100."),
    max_steps: z.number().int().positive().optional().describe("Per-run step cap, default 80."),
  },
  (a) => api.run_playtest(a),
);

tool("save_game", "Serialize a session to a save string (content-hash bound, §8.7).", SESSION, (a) => api.save_game(a));
tool(
  "load_game",
  "Load a save against a pack (content-hash verified) and return a fresh session.",
  { ...PACK, save: z.string().describe("A save string produced by save_game.") },
  (a) => api.load_game(a),
);

tool(
  "replay_trace",
  "Replay a recorded trace against a pack and assert its final-state hash (§8.8).",
  { trace_path: z.string().describe("Path to a trace JSON, relative to the project root."), ...PACK },
  (a) => api.replay_trace(a),
);

tool(
  "adapt_story",
  "Author a CYOA pack from a premise via the writer→adapter→validator loop (§12.1–3); returns the pack, validation report, and per-beat classification.",
  { premise: z.string().describe("A one-sentence story premise to author from.") },
  (a) => api.adapt_story(a),
);

tool(
  "inspect_trace",
  "Summarize a recorded trace: per-step locations/events, final-hash check, and the debugger's suspected-bug classification (§9.4, §12.5).",
  { trace_path: z.string().describe("Path to a trace JSON, relative to the project root."), ...PACK },
  (a) => api.inspect_trace(a),
);

tool(
  "apply_content_patch",
  "Apply a structured, whitelisted content patch with deterministic code and return the modified pack + validation report (§9.4, §16). Never writes files; never runs model-issued code.",
  {
    ...PACK,
    proposal: z
      .object({
        layer: z.enum(["content", "engine_rule", "validator", "test", "hint_text", "quest_structure"]),
        mode: z.enum(["cyoa", "parser"]),
        summary: z.string(),
        ops: z.array(z.record(z.string(), z.unknown())).describe("Closed-vocabulary patch ops; validated against the fixer's op schema (§12.5)."),
      })
      .describe("A ContentPatchProposal: a single-layer, op-based edit applied by code, not the model."),
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
