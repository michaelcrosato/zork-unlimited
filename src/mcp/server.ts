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

const PACK = {
  pack_path: z
    .string()
    .describe(
      "Path to an RPG quest content pack (.yaml), relative to the project root. Legacy CYOA/parser packs are rejected.",
    ),
};
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
  "Return the route through the Charter Marches graph from Charterhaven to a shipped quest graph node or compatibility quest pack.",
  {
    world_quest_id: z
      .string()
      .optional()
      .describe(
        "Preferred Charter Marches quest graph node id from list_world().quests[].graph_node.",
      ),
    quest_path: z
      .string()
      .optional()
      .describe("Compatibility path to an RPG quest content pack, relative to the project root."),
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
  {},
  () => api.start_overworld(),
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
  },
  (a) => api.restore_overworld_session(a),
);
tool(
  "travel_overworld_session",
  "Travel in a stateful New York overworld session along an adjacent road id from the current town. Travel consumes supplies, adds fatigue, and can add elapsed delay when fatigue or supply shortage catches up.",
  {
    session_id: z.string().describe("Session id returned by start_overworld."),
    road_id: z.string().describe("Road id from the session observation's exits list."),
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
  },
  (a) => api.resolve_overworld_session_road_encounter(a),
);
tool(
  "resupply_overworld_session",
  "Resupply at the current town if it has a market, inn, or stable. Returns updated supplies, fatigue, time, and observation.",
  {
    session_id: z.string().describe("Session id returned by start_overworld."),
  },
  (a) => api.resupply_overworld_session(a),
);
tool(
  "rest_overworld_session",
  "Rest at the current town if it has an inn or healer. Returns updated fatigue, supplies, time, and observation.",
  {
    session_id: z.string().describe("Session id returned by start_overworld."),
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
  },
  (a) => api.plan_overworld_session_route(a),
);
tool(
  "scout_overworld_session_poi",
  "Scout a local point of interest in a stateful New York overworld session, revealing nearby sites and local quest leads while updating journal/time.",
  {
    session_id: z.string().describe("Session id returned by start_overworld."),
    poi_id: z.string().describe("Point-of-interest id from the session observation."),
  },
  (a) => api.scout_overworld_session_poi(a),
);
tool(
  "talk_overworld_session_contact",
  "Talk to a local contact in a stateful New York overworld session, revealing local quest leads while updating journal/time.",
  {
    session_id: z.string().describe("Session id returned by start_overworld."),
    character_id: z.string().describe("Character id from the session observation."),
  },
  (a) => api.talk_overworld_session_contact(a),
);
tool(
  "investigate_overworld_session_event",
  "Investigate a local event in a stateful New York overworld session, revealing local quest leads while updating journal/time.",
  {
    session_id: z.string().describe("Session id returned by start_overworld."),
    event_id: z.string().describe("Event id from the session observation."),
  },
  (a) => api.investigate_overworld_session_event(a),
);
tool(
  "resolve_overworld_session_event",
  "Resolve a local event in a stateful New York overworld session after scouting a local POI, talking to a local contact, and investigating the event.",
  {
    session_id: z.string().describe("Session id returned by start_overworld."),
    event_id: z.string().describe("Event id from the session observation."),
  },
  (a) => api.resolve_overworld_session_event(a),
);
tool(
  "explore_overworld_session_site",
  "Explore a discovered regional site in a stateful New York overworld session. Scout a local point of interest first to reveal nearby sites.",
  {
    session_id: z.string().describe("Session id returned by start_overworld."),
    site_id: z.string().describe("Exploration site id from the session observation's sites list."),
  },
  (a) => api.explore_overworld_session_site(a),
);
tool(
  "explore_overworld_session_area",
  "Explore a discovered local area or district in a stateful New York overworld session. Larger towns expose more areas over time.",
  {
    session_id: z.string().describe("Session id returned by start_overworld."),
    area_id: z.string().describe("Area id from the session observation's areas list."),
  },
  (a) => api.explore_overworld_session_area(a),
);
tool(
  "move_overworld_session_area",
  "Move inside the current town along a discovered local-area route. This changes the current area and consumes local walking time.",
  {
    session_id: z.string().describe("Session id returned by start_overworld."),
    area_route_id: z.string().describe("Area route id from observation.areaExits."),
  },
  (a) => api.move_overworld_session_area(a),
);
tool(
  "work_overworld_session_job",
  "Work a discovered local job in a stateful New York overworld session. Jobs are tied to mapped town areas and award regional renown.",
  {
    session_id: z.string().describe("Session id returned by start_overworld."),
    job_id: z.string().describe("Job id from the session observation's jobs list."),
  },
  (a) => api.work_overworld_session_job(a),
);
tool(
  "start_overworld_session_quest",
  "Start a discovered local quest lead in a stateful New York overworld session and return a playable RPG session for its pack. The lead must belong to the current town and current local area.",
  {
    session_id: z.string().describe("Session id returned by start_overworld."),
    quest_id: z.string().describe("Quest id from the session observation's quests list."),
    seed: z.number().int().optional().describe("Optional runtime seed for the RPG quest session."),
    hide_graph: z
      .boolean()
      .optional()
      .describe("When true, hide RPG graph destinations in the returned quest observation."),
  },
  (a) => api.start_overworld_session_quest(a),
);
tool(
  "look_overworld",
  "Inspect one New York overworld town as static map data. Returns adjacent roads, local areas, points of interest, contacts, events, local jobs, and the authored local quest catalog; use start_overworld for discovery-gated play.",
  {
    town_id: z
      .string()
      .optional()
      .describe("Overworld town id to inspect. Defaults to the starting town."),
  },
  (a) => api.look_overworld(a),
);
tool(
  "travel_overworld",
  "Travel from one New York overworld town along an adjacent road id and return the route event plus arrival town. Rejects non-adjacent roads.",
  {
    from_town: z.string().describe("Current overworld town id."),
    road_id: z.string().describe("Road id from look_overworld(current town)."),
  },
  (a) => api.travel_overworld(a),
);
tool(
  "explore_overworld_area",
  "Explore one static local area from look_overworld and return its time cost and journal text. Use explore_overworld_session_area for discovery-gated play.",
  {
    town_id: z.string().optional().describe("Overworld town id. Defaults to the starting town."),
    area_id: z.string().describe("Area id from look_overworld(current town)."),
  },
  (a) => api.explore_overworld_area(a),
);
tool(
  "work_overworld_job",
  "Inspect one static local job from look_overworld and return its time cost, renown, and journal text. Use work_overworld_session_job for discovery-gated play.",
  {
    town_id: z.string().optional().describe("Overworld town id. Defaults to the starting town."),
    job_id: z.string().describe("Job id from look_overworld(current town)."),
  },
  (a) => api.work_overworld_job(a),
);
tool(
  "scout_overworld_poi",
  "Scout a local point of interest in one New York overworld town and return a journal entry. The poi_id must come from look_overworld for that town.",
  {
    town_id: z.string().optional().describe("Overworld town id. Defaults to the starting town."),
    poi_id: z.string().describe("Point-of-interest id from look_overworld(current town)."),
  },
  (a) => api.scout_overworld_poi(a),
);
tool(
  "talk_overworld_contact",
  "Talk to a local overworld contact and return a journal entry. The character_id must come from look_overworld for that town.",
  {
    town_id: z.string().optional().describe("Overworld town id. Defaults to the starting town."),
    character_id: z.string().describe("Character id from look_overworld(current town)."),
  },
  (a) => api.talk_overworld_contact(a),
);
tool(
  "investigate_overworld_event",
  "Investigate a local overworld event and return a journal entry. The event_id must come from look_overworld for that town.",
  {
    town_id: z.string().optional().describe("Overworld town id. Defaults to the starting town."),
    event_id: z.string().describe("Event id from look_overworld(current town)."),
  },
  (a) => api.investigate_overworld_event(a),
);
tool(
  "explore_overworld_site",
  "Explore a local regional site and return the time cost, reward, and journal entry. The site_id must come from look_overworld for that town.",
  {
    town_id: z.string().optional().describe("Overworld town id. Defaults to the starting town."),
    site_id: z.string().describe("Exploration site id from look_overworld(current town)."),
  },
  (a) => api.explore_overworld_site(a),
);
tool(
  "validate_story",
  "AFK alias for validate_pack; validates one RPG pack and returns hard errors/warnings.",
  {
    story_path: z.string().describe("Path to an RPG content pack, relative to the project root."),
  },
  (a) => api.validate_story(a),
);
tool(
  "validate_quest",
  "Validate one Charter Marches RPG quest pack and return hard errors/warnings.",
  {
    quest_path: z
      .string()
      .describe("Path to an RPG quest content pack, relative to the project root."),
  },
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
  "Start a new session on a playable RPG quest; returns a session id, mode, and first observation. Prefer world_quest_id for shipped Charter Marches quests; pack_path remains for compatibility, and generate_rpg_seed mints a procedural pack.",
  {
    pack_path: z
      .string()
      .optional()
      .describe(
        "Compatibility path to an RPG quest content pack (.yaml). Prefer world_quest_id for shipped quests.",
      ),
    world_quest_id: z
      .string()
      .optional()
      .describe("Charter Marches quest graph node id from list_world().quests[].graph_node."),
    generate_rpg_seed: z
      .number()
      .int()
      .optional()
      .describe(
        "Instead of pack_path: mint and play a fresh procedural RPG pack from this seed (see generate_rpg_pack). Independent of `seed` (which seeds runtime state).",
      ),
    seed: z.number().int().optional().describe("Deterministic runtime seed (default 1)."),
    ...HIDE_GRAPH,
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
  },
  (a) => api.start_world_quest(a),
);
tool(
  "start_game",
  "Legacy AFK alias for new_game; start a session on an RPG quest pack for MCP-driven playtesting.",
  {
    story_path: z.string().describe("Path to an RPG content pack."),
    seed: z.number().int().optional(),
    ...HIDE_GRAPH,
  },
  (a) => api.start_game(a),
);
tool(
  "start_quest",
  "Start a session on a Charter Marches RPG quest pack for MCP-driven playtesting.",
  {
    quest_path: z.string().describe("Path to an RPG quest content pack."),
    seed: z.number().int().optional(),
    ...HIDE_GRAPH,
  },
  (a) => api.start_quest(a),
);

tool(
  "get_observation",
  "Get the current AI-facing RPG observation for a session (§9.1).",
  { ...SESSION, ...HIDE_GRAPH },
  (a) => api.get_observation(a),
);
tool(
  "get_scene",
  "AFK alias for get_observation; returns current scene/room text, state, and visible options.",
  { ...SESSION, ...HIDE_GRAPH },
  (a) => api.get_scene(a),
);
tool(
  "list_legal_actions",
  "List the legal RPG actions available right now in a session (§9).",
  { ...SESSION, ...HIDE_GRAPH },
  (a) => api.list_legal_actions(a),
);

tool(
  "step_action",
  "Apply one chosen RPG action by its id from available_actions; returns events + the new observation.",
  {
    ...SESSION,
    action_id: z.string().describe("An action id from the current legal-action set."),
    ...HIDE_GRAPH,
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
      .describe("An option/action id from get_scene().observation.available_actions."),
    ...HIDE_GRAPH,
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
  "Return a compact turn transcript with choices, events, inventory, flags, journal, and ending state.",
  SESSION,
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
  "Load a save against a shipped world quest or compatibility pack path (content-hash + mode verified) and return a fresh session.",
  {
    pack_path: z
      .string()
      .optional()
      .describe("Compatibility path to an RPG quest content pack. Prefer world_quest_id."),
    world_quest_id: z
      .string()
      .optional()
      .describe("Charter Marches quest graph node id from list_world().quests[].graph_node."),
    save: z.string().describe("A save string produced by save_game."),
  },
  (a) => api.load_game(a),
);

tool(
  "replay_trace",
  "Replay a recorded RPG trace against a shipped world quest or compatibility pack path and assert its final-state hash (§8.8).",
  {
    trace_path: z.string().describe("Path to a trace JSON, relative to the project root."),
    pack_path: z
      .string()
      .optional()
      .describe("Compatibility path to an RPG quest content pack. Prefer world_quest_id."),
    world_quest_id: z
      .string()
      .optional()
      .describe("Charter Marches quest graph node id from list_world().quests[].graph_node."),
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
  "Summarize a recorded trace against a shipped world quest or compatibility pack path: per-step locations/events, final-hash check, and the debugger's suspected-bug classification (§9.4, §12.5).",
  {
    trace_path: z.string().describe("Path to a trace JSON, relative to the project root."),
    pack_path: z
      .string()
      .optional()
      .describe("Compatibility path to an RPG quest content pack. Prefer world_quest_id."),
    world_quest_id: z
      .string()
      .optional()
      .describe("Charter Marches quest graph node id from list_world().quests[].graph_node."),
  },
  (a) => api.inspect_trace(a),
);

tool(
  "apply_content_patch",
  "Apply a structured, whitelisted content patch with deterministic code and return the modified pack + validation report (§9.4, §16). Never writes files; never runs model-issued code.",
  {
    ...PACK,
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
