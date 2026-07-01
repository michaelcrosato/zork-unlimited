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

function tool(
  name: string,
  description: string,
  inputSchema: ZodRawShape,
  handler: (args: never) => unknown,
): void {
  server.registerTool(name, { description, inputSchema }, wrap(handler) as never);
}

const PACK_SOURCE = {
  pack_path: z
    .string()
    .optional()
    .describe("Compatibility path to an RPG quest content pack. Prefer world_quest_id."),
  world_quest_id: z
    .string()
    .optional()
    .describe(
      "Preferred Charter Marches quest graph node id from list_world().quests[].graph_node.",
    ),
};
const QUEST_ID_SOURCE = {
  quest_id: z
    .string()
    .optional()
    .describe(
      "Preferred Charter Marches quest graph node id from list_world().quests[].graph_node.",
    ),
  world_quest_id: z
    .string()
    .optional()
    .describe("Alias for quest_id, accepted for consistency with new_game/load_game."),
};
const SESSION = {
  session_id: z.string().describe("A session id from new_game/start_quest/load_game."),
};
const HIDE_GRAPH = {
  hide_graph: z
    .boolean()
    .optional()
    .describe(
      "Difficulty: when true, exits report only their direction, not their destination - the spatial map must be reasoned out, not read off. Default false.",
    ),
};
const COMPACT_ACTIONS = {
  compact_actions: z
    .boolean()
    .optional()
    .describe(
      "Token economy: when true, observation available_actions include stable ids and skill metadata but omit repeated command labels. Use list_legal_actions without this flag when command text is needed.",
    ),
};
const COMPACT_OBSERVATION = {
  compact_observation: z
    .boolean()
    .optional()
    .describe(
      "Token economy: when true, RPG tools return a compact `context` instead of the full `observation`; context uses tuple fields and compact action ids for repeated loop turns.",
    ),
};
const COMPACT_OVERWORLD_CONTEXT = {
  compact_context: z
    .boolean()
    .optional()
    .describe(
      "Token economy: when true, stateful overworld action tools return compact context instead of the full observation object graph.",
    ),
};

tool(
  "validate_pack",
  "Validate a shipped world quest or compatibility RPG quest pack; legacy CYOA/parser packs are rejected with an error report.",
  PACK_SOURCE,
  (a) => api.validate_pack(a),
);
tool(
  "list_stories",
  "Compatibility catalog for blind/AFK play. Returns the RPG quest packs declared by the canonical Charter Marches world graph.",
  {},
  () => api.list_stories(),
);
tool(
  "list_world",
  "List the single canonical world graph, its hub city, and shipped RPG quest packs as reachable quest/area entries.",
  {},
  () => api.list_world(),
);
tool(
  "world_path",
  "Return the route through the Charter Marches graph from Charterhaven to a shipped quest graph node.",
  {
    world_quest_id: z
      .string()
      .describe("Charter Marches quest graph node id from list_world().quests[].graph_node."),
  },
  (a) => api.world_path(a),
);
tool(
  "list_overworld",
  "List the New York State overworld summary: start town, town/road/region/regional-arc counts, character/event/quest counts, sources, and design rules.",
  {},
  () => api.list_overworld(),
);
tool(
  "start_overworld",
  "Start a stateful New York overworld run at Albany and return the current location, local actions, discovered quest leads, regional arcs, journal, discovered towns, and roads.",
  {
    ...COMPACT_OVERWORLD_CONTEXT,
  },
  (a) => api.start_overworld(a),
);
tool(
  "get_overworld_session",
  "Read the current observation for a stateful New York overworld session.",
  {
    session_id: z.string().describe("Session id returned by start_overworld."),
  },
  (a) => api.get_overworld_session(a),
);
tool(
  "get_overworld_session_context",
  "Read a compact stateful overworld context for repeated agent loop turns. Returns stable ids, vitals, local actions, nearby roads, capped route options, pending road options, and recent journal entries without the full object graph.",
  {
    session_id: z.string().describe("Session id returned by start_overworld."),
  },
  (a) => api.get_overworld_session_context(a),
);
tool(
  "export_overworld_session",
  "Export a content-bound snapshot for a stateful New York overworld session so a long run can be restored later.",
  {
    session_id: z.string().describe("Session id returned by start_overworld."),
  },
  (a) => api.export_overworld_session(a),
);
tool(
  "restore_overworld_session",
  "Restore a new stateful New York overworld session from a snapshot previously returned by export_overworld_session.",
  {
    snapshot: z
      .record(z.unknown())
      .describe("Snapshot object previously returned as export_overworld_session.snapshot."),
    ...COMPACT_OVERWORLD_CONTEXT,
  },
  (a) => api.restore_overworld_session(a),
);
tool(
  "travel_overworld_session",
  "Travel in a stateful New York overworld session along an adjacent road id from the current town. Travel consumes supplies, adds fatigue, and can add elapsed delay when fatigue or supply shortage catches up.",
  {
    session_id: z.string().describe("Session id returned by start_overworld."),
    road_id: z.string().describe("Road id from the session observation's exits list."),
    ...COMPACT_OVERWORLD_CONTEXT,
  },
  (a) => api.travel_overworld_session(a),
);
tool(
  "resolve_overworld_session_road_encounter",
  "Resolve the pending road encounter after travel with a strategy: scout it, help resolve it, or press on. Clears the encounter before the next road leg.",
  {
    session_id: z.string().describe("Session id returned by start_overworld."),
    strategy: z
      .enum(["cautious_scout", "assist_travelers", "press_on"])
      .describe("Road encounter response from observation.pendingRoadEncounter.options."),
    ...COMPACT_OVERWORLD_CONTEXT,
  },
  (a) => api.resolve_overworld_session_road_encounter(a),
);
tool(
  "resupply_overworld_session",
  "Resupply at the current town if it has a market, inn, or stable. Returns updated supplies, fatigue, time, and observation.",
  {
    session_id: z.string().describe("Session id returned by start_overworld."),
    ...COMPACT_OVERWORLD_CONTEXT,
  },
  (a) => api.resupply_overworld_session(a),
);
tool(
  "rest_overworld_session",
  "Rest at the current town if it has an inn or healer. Returns updated fatigue, supplies, time, and observation.",
  {
    session_id: z.string().describe("Session id returned by start_overworld."),
    ...COMPACT_OVERWORLD_CONTEXT,
  },
  (a) => api.rest_overworld_session(a),
);
tool(
  "plan_overworld_session_route",
  "Plan the shortest known route in a stateful New York overworld session to a discovered town. Returns ordered road legs without moving the session.",
  {
    session_id: z.string().describe("Session id returned by start_overworld."),
    destination_town_id: z
      .string()
      .describe(
        "Discovered town id from the session observation's discovered or routeOptions list.",
      ),
    ...COMPACT_OVERWORLD_CONTEXT,
  },
  (a) => api.plan_overworld_session_route(a),
);
tool(
  "scout_overworld_session_poi",
  "Scout a local point of interest in a stateful New York overworld session, revealing nearby sites and local quest leads while updating journal/time.",
  {
    session_id: z.string().describe("Session id returned by start_overworld."),
    poi_id: z.string().describe("Point-of-interest id from the session observation."),
    ...COMPACT_OVERWORLD_CONTEXT,
  },
  (a) => api.scout_overworld_session_poi(a),
);
tool(
  "talk_overworld_session_contact",
  "Talk to a local contact in a stateful New York overworld session, revealing local quest leads while updating journal/time.",
  {
    session_id: z.string().describe("Session id returned by start_overworld."),
    character_id: z.string().describe("Character id from the session observation."),
    ...COMPACT_OVERWORLD_CONTEXT,
  },
  (a) => api.talk_overworld_session_contact(a),
);
tool(
  "investigate_overworld_session_event",
  "Investigate a local event in a stateful New York overworld session, revealing local quest leads while updating journal/time.",
  {
    session_id: z.string().describe("Session id returned by start_overworld."),
    event_id: z.string().describe("Event id from the session observation."),
    ...COMPACT_OVERWORLD_CONTEXT,
  },
  (a) => api.investigate_overworld_session_event(a),
);
tool(
  "resolve_overworld_session_event",
  "Resolve a local event in a stateful New York overworld session after scouting a local POI, talking to a local contact, and investigating the event.",
  {
    session_id: z.string().describe("Session id returned by start_overworld."),
    event_id: z.string().describe("Event id from the session observation."),
    ...COMPACT_OVERWORLD_CONTEXT,
  },
  (a) => api.resolve_overworld_session_event(a),
);
tool(
  "explore_overworld_session_site",
  "Explore a discovered regional site in a stateful New York overworld session. Scout a local point of interest first to reveal nearby sites.",
  {
    session_id: z.string().describe("Session id returned by start_overworld."),
    site_id: z.string().describe("Exploration site id from the session observation's sites list."),
    ...COMPACT_OVERWORLD_CONTEXT,
  },
  (a) => api.explore_overworld_session_site(a),
);
tool(
  "explore_overworld_session_area",
  "Explore a discovered local area or district in a stateful New York overworld session. Larger towns expose more areas over time.",
  {
    session_id: z.string().describe("Session id returned by start_overworld."),
    area_id: z.string().describe("Area id from the session observation's areas list."),
    ...COMPACT_OVERWORLD_CONTEXT,
  },
  (a) => api.explore_overworld_session_area(a),
);
tool(
  "move_overworld_session_area",
  "Move inside the current town along a discovered local-area route. This changes the current area and consumes local walking time.",
  {
    session_id: z.string().describe("Session id returned by start_overworld."),
    area_route_id: z.string().describe("Area route id from observation.areaExits."),
    ...COMPACT_OVERWORLD_CONTEXT,
  },
  (a) => api.move_overworld_session_area(a),
);
tool(
  "work_overworld_session_job",
  "Work a discovered local job in a stateful New York overworld session. Jobs are tied to mapped town areas and award regional renown.",
  {
    session_id: z.string().describe("Session id returned by start_overworld."),
    job_id: z.string().describe("Job id from the session observation's jobs list."),
    ...COMPACT_OVERWORLD_CONTEXT,
  },
  (a) => api.work_overworld_session_job(a),
);
tool(
  "start_overworld_session_quest",
  "Start a discovered local quest lead in a stateful New York overworld session and return a playable RPG session through its canonical world quest id. The lead must belong to the current town and current local area.",
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
    ...COMPACT_OVERWORLD_CONTEXT,
  },
  (a) => api.start_overworld_session_quest(a),
);
tool(
  "validate_quest",
  "Validate one Charter Marches RPG quest by graph id.",
  QUEST_ID_SOURCE,
  (a) => api.validate_quest(a),
);
tool(
  "load_pack",
  "Compile a shipped world quest or compatibility RPG quest pack and return its mode, metadata, content hash, source identity, and validation report.",
  PACK_SOURCE,
  (a) => api.load_pack(a),
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
  "Start a new session on a playable RPG quest; returns a session id, mode, and first observation. Use world_quest_id for shipped Charter Marches quests; generate_rpg_seed mints a procedural pack.",
  {
    world_quest_id: z
      .string()
      .optional()
      .describe("Charter Marches quest graph node id from list_world().quests[].graph_node."),
    generate_rpg_seed: z
      .number()
      .int()
      .optional()
      .describe(
        "Instead of world_quest_id: mint and play a fresh procedural RPG pack from this seed (see generate_rpg_pack). Independent of `seed` (which seeds runtime state).",
      ),
    seed: z.number().int().optional().describe("Deterministic runtime seed (default 1)."),
    ...HIDE_GRAPH,
    ...COMPACT_ACTIONS,
    ...COMPACT_OBSERVATION,
  },
  (a) => api.new_game(a),
);
tool(
  "start_world_quest",
  "Start a playable RPG session by Charter Marches quest graph node id and return the world route context plus the first RPG observation.",
  {
    quest_id: z.string().describe("Quest graph node id from list_world().quests[].graph_node."),
    seed: z.number().int().optional(),
    ...HIDE_GRAPH,
    ...COMPACT_ACTIONS,
    ...COMPACT_OBSERVATION,
  },
  (a) => api.start_world_quest(a),
);
tool(
  "start_quest",
  "Start a Charter Marches RPG quest by graph id for MCP-driven playtesting.",
  {
    ...QUEST_ID_SOURCE,
    seed: z.number().int().optional(),
    ...HIDE_GRAPH,
    ...COMPACT_ACTIONS,
    ...COMPACT_OBSERVATION,
  },
  (a) => api.start_quest(a),
);

tool(
  "get_observation",
  "Get the current AI-facing RPG observation for a session (§9.1). Set compact_observation for lean repeated loop turns.",
  { ...SESSION, ...HIDE_GRAPH, ...COMPACT_ACTIONS, ...COMPACT_OBSERVATION },
  (a) => api.get_observation(a),
);
tool(
  "get_scene",
  "AFK alias for get_observation; returns current scene/room text, state, and visible options. Set compact_observation for compact repeated loop turns.",
  { ...SESSION, ...HIDE_GRAPH, ...COMPACT_ACTIONS, ...COMPACT_OBSERVATION },
  (a) => api.get_scene(a),
);
tool(
  "list_legal_actions",
  "List the legal RPG actions available right now in a session (§9). Defaults to full command labels; compact_actions returns ids only.",
  { ...SESSION, ...HIDE_GRAPH, ...COMPACT_ACTIONS },
  (a) => api.list_legal_actions(a),
);

tool(
  "step_action",
  "Apply one chosen RPG action by its id from available_actions; returns events + the new observation.",
  {
    ...SESSION,
    action_id: z.string().describe("An action id from the current legal-action set."),
    ...HIDE_GRAPH,
    ...COMPACT_ACTIONS,
    ...COMPACT_OBSERVATION,
  },
  (a) => api.step_action(a),
);
tool(
  "choose_option",
  "AFK alias for step_action; choose one visible option id and return the next scene.",
  {
    ...SESSION,
    option_id: z
      .string()
      .describe(
        "An option/action id from get_scene().observation.available_actions or context.actions.",
      ),
    ...HIDE_GRAPH,
    ...COMPACT_ACTIONS,
    ...COMPACT_OBSERVATION,
  },
  (a) => api.choose_option(a),
);
tool(
  "get_state",
  "Return the raw deterministic state and state hash for a session.",
  SESSION,
  (a) => api.get_state(a),
);
tool(
  "get_transcript",
  "Return a turn transcript with choices, events, inventory, flags, journal, and ending state. Set compact_turns for id-only turn rows or summary_only to omit turns.",
  {
    ...SESSION,
    summary_only: z
      .boolean()
      .optional()
      .describe(
        "Token economy: when true, returns session metadata and summary while replacing detailed turns with an empty array.",
      ),
    compact_turns: z
      .boolean()
      .optional()
      .describe(
        "Token economy: when true, returns id-only turn rows without titles, command labels, or event payloads. Ignored when summary_only is true.",
      ),
  },
  (a) => api.get_transcript(a),
);
tool(
  "save_game",
  "Serialize a session to a save string (content-hash + mode bound, §8.7).",
  SESSION,
  (a) => api.save_game(a),
);
tool(
  "load_game",
  "Load a save against its embedded shipped world quest id/generated RPG seed, an explicit world_quest_id/generate_rpg_seed, or a compatibility pack path (content-hash + mode verified) and return a fresh session.",
  {
    pack_path: z
      .string()
      .optional()
      .describe(
        "Compatibility path to an RPG quest content pack. Omit for shipped saves with embedded worldQuestId.",
      ),
    world_quest_id: z
      .string()
      .optional()
      .describe(
        "Charter Marches quest graph node id from list_world().quests[].graph_node. Optional when the save embeds worldQuestId.",
      ),
    generate_rpg_seed: z
      .number()
      .int()
      .optional()
      .describe("Procedural RPG generation seed. Optional when the save embeds generatedRpgSeed."),
    save: z.string().describe("A save string produced by save_game."),
    ...HIDE_GRAPH,
    ...COMPACT_ACTIONS,
    ...COMPACT_OBSERVATION,
  },
  (a) => api.load_game(a),
);

tool(
  "replay_trace",
  "Replay a recorded RPG trace against its embedded worldQuestId, an explicit world_quest_id, or a compatibility pack path and assert its final-state hash (§8.8).",
  {
    trace_path: z.string().describe("Path to a trace JSON, relative to the project root."),
    pack_path: z
      .string()
      .optional()
      .describe(
        "Compatibility path to an RPG quest content pack. Omit for shipped traces with embedded worldQuestId.",
      ),
    world_quest_id: z
      .string()
      .optional()
      .describe(
        "Charter Marches quest graph node id from list_world().quests[].graph_node. Optional when the trace embeds worldQuestId.",
      ),
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
  "Summarize a recorded trace against its embedded worldQuestId, an explicit world_quest_id, or a compatibility pack path: per-step locations/events, final-hash check, and the debugger's suspected-bug classification (§9.4, §12.5).",
  {
    trace_path: z.string().describe("Path to a trace JSON, relative to the project root."),
    pack_path: z
      .string()
      .optional()
      .describe(
        "Compatibility path to an RPG quest content pack. Omit for shipped traces with embedded worldQuestId.",
      ),
    world_quest_id: z
      .string()
      .optional()
      .describe(
        "Charter Marches quest graph node id from list_world().quests[].graph_node. Optional when the trace embeds worldQuestId.",
      ),
  },
  (a) => api.inspect_trace(a),
);

tool(
  "apply_content_patch",
  "Apply a structured, whitelisted content patch with deterministic code to a shipped world quest or compatibility pack path and return the modified pack + validation report (§9.4, §16). Never writes files; never runs model-issued code.",
  {
    ...PACK_SOURCE,
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
        mode: z.literal("rpg"),
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
