/**
 * The unit suite exercises `createToolApi()` directly, while blind agents reach the
 * game through `src/mcp/server.ts` over stdio. A handler can be fully tested yet
 * still be invisible to agents if the server forgets to register it. This guard
 * keeps the adapter layer honest: every callable ToolApi handler must have a
 * matching `tool("name", ...)` registration, and the server must not advertise
 * a tool that the tested API does not implement.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { createToolApi } from "../../src/mcp/tools.js";

const RETIRED_STATIC_OVERWORLD_TOOLS = [
  "explore_overworld_area",
  "explore_overworld_site",
  "investigate_overworld_event",
  "look_overworld",
  "scout_overworld_poi",
  "talk_overworld_contact",
  "travel_overworld",
  "work_overworld_job",
] as const;

const RETIRED_COMPATIBILITY_TOOLS = ["list_stories"] as const;

const OVERWORLD_SCHEMA_TOOLS = [
  "start_overworld",
  "get_overworld_session",
  "get_overworld_session_context",
  "export_overworld_session",
  "restore_overworld_session",
  "travel_overworld_session",
  "resolve_overworld_session_road_encounter",
  "resupply_overworld_session",
  "rest_overworld_session",
  "plan_overworld_session_route",
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
] as const;

function registeredServerTools(): string[] {
  const text = readFileSync("src/mcp/server.ts", "utf8");
  return [...text.matchAll(/tool\(\s*\n?\s*["']([^"']+)["']/g)].map((match) => match[1]!).sort();
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function registeredToolBlock(name: string): string {
  const text = readFileSync("src/mcp/server.ts", "utf8");
  const start = new RegExp(`tool\\(\\s*["']${escapeRegex(name)}["']`).exec(text)?.index ?? -1;
  if (start < 0) throw new Error(`missing tool block ${name}`);
  const next = text.indexOf("\ntool(", start + 1);
  return text.slice(start, next < 0 ? text.length : next);
}

function sharedSchemaBlock(): string {
  const text = readFileSync("src/mcp/server.ts", "utf8");
  const start = text.indexOf("const WORLD_QUEST_SOURCE");
  const listWorldTool = /tool\(\r?\n\s+"list_world"/.exec(text);
  const end = listWorldTool?.index ?? -1;
  if (start < 0 || end < 0) throw new Error("missing shared schema block");
  return text.slice(start, end);
}

function serverSourceBlock(startMarker: string, endMarker: string): string {
  const text = readFileSync("src/mcp/server.ts", "utf8");
  const start = text.indexOf(startMarker);
  const end = text.indexOf(endMarker, start);
  if (start < 0 || end < 0) throw new Error(`missing server source block ${startMarker}`);
  return text.slice(start, end);
}

function toolApiSourceBlock(startMarker: string, endMarker: string): string {
  const text = readFileSync("src/mcp/tools.ts", "utf8");
  const start = text.indexOf(startMarker);
  const end = text.indexOf(endMarker, start);
  if (start < 0 || end < 0) throw new Error(`missing tool API source block ${startMarker}`);
  return text.slice(start, end);
}

describe("MCP server registration", () => {
  it("registers exactly the tested ToolApi handlers", () => {
    const api = createToolApi({ root: process.cwd() }) as Record<string, unknown>;
    const apiHandlers = Object.keys(api)
      .filter((key) => typeof api[key] === "function")
      .sort();

    expect(registeredServerTools()).toEqual(apiHandlers);
  });

  it("advertises world-bound starts instead of raw pack-path gameplay starts", () => {
    const newGame = registeredToolBlock("new_game");
    const startWorldQuest = registeredToolBlock("start_world_quest");
    const validateQuest = registeredToolBlock("validate_quest");
    const worldPath = registeredToolBlock("world_path");
    const loadGame = registeredToolBlock("load_game");

    expect(newGame).toContain("generate_rpg_seed");
    expect(newGame).not.toContain("world_quest_id");
    expect(newGame).not.toContain("pack_path");
    expect(loadGame).toContain("world_quest_id");
    expect(loadGame).toContain("generate_rpg_seed");
    expect(loadGame).not.toContain("pack_path");
    expect(startWorldQuest).toContain("world_quest_id");
    expect(startWorldQuest).not.toMatch(/\n\s+quest_id:/);
    expect(startWorldQuest).not.toContain("quest_path");
    expect(validateQuest).toContain("WORLD_QUEST_SOURCE");
    expect(validateQuest).not.toContain("QUEST_ID_SOURCE");
    expect(validateQuest).not.toContain("quest_path");
    expect(worldPath).toContain("world_quest_id");
    expect(worldPath).not.toContain("quest_path");
  });

  it("keeps public MCP content and trace tools quest-id first", () => {
    const sharedSource = serverSourceBlock("const WORLD_QUEST_SOURCE", "const SESSION");
    expect(sharedSource).toContain("world_quest_id");
    expect(sharedSource).not.toMatch(/\n\s+quest_id:/);
    expect(sharedSource).not.toContain("Alias.");
    expect(sharedSource).not.toContain("pack_path");

    for (const toolName of [
      "validate_quest",
      "load_quest",
      "apply_content_patch",
      "replay_trace",
      "inspect_trace",
    ]) {
      const block = registeredToolBlock(toolName);
      expect(block).toMatch(/world_quest_id|WORLD_QUEST_SOURCE/);
      expect(block).not.toContain("QUEST_ID_SOURCE");
      expect(block).not.toContain("pack_path");
    }
    expect(registeredToolBlock("apply_content_patch")).not.toContain("mode:");
  });

  it("keeps the blind-playtest ToolSearch schema source terse", () => {
    const blindToolSchemaSource = [
      sharedSchemaBlock(),
      registeredToolBlock("start_world_quest"),
      registeredToolBlock("get_observation"),
      registeredToolBlock("list_legal_actions"),
      registeredToolBlock("step_action"),
      registeredToolBlock("get_transcript"),
    ].join("\n");

    expect(blindToolSchemaSource.length).toBeLessThanOrEqual(2600);
    expect(blindToolSchemaSource).not.toContain("Token economy:");
    expect(blindToolSchemaSource).toContain("compact_observation");
    expect(blindToolSchemaSource).toContain("compact_summary");
  });

  it("serializes successful MCP tool results as minified JSON text", () => {
    const text = readFileSync("src/mcp/server.ts", "utf8");

    expect(text).toContain("JSON.stringify(value)");
    expect(text).not.toContain("JSON.stringify(value, null, 2)");
  });

  it("keeps restore and trace ToolSearch schema source terse", () => {
    const restoreTraceSchemaSource = [
      registeredToolBlock("world_path"),
      registeredToolBlock("load_game"),
      registeredToolBlock("replay_trace"),
      registeredToolBlock("inspect_trace"),
    ].join("\n");

    expect(restoreTraceSchemaSource.length).toBeLessThanOrEqual(1200);
    expect(restoreTraceSchemaSource).toContain("world_quest_id");
    expect(restoreTraceSchemaSource).toContain("generate_rpg_seed");
    expect(restoreTraceSchemaSource).not.toContain("list_world().quests[].graph_node");
    expect(restoreTraceSchemaSource).not.toContain("Charter Marches quest graph node id");
    expect(restoreTraceSchemaSource).not.toContain("content-hash + mode");
    expect(restoreTraceSchemaSource).not.toContain("optional when embedded");
    expect(restoreTraceSchemaSource).not.toContain("Project-relative trace");
  });

  it("keeps authoring and fix ToolSearch schema source terse", () => {
    const authoringFixSchemaSource = [
      registeredToolBlock("generate_rpg_pack"),
      registeredToolBlock("adapt_story"),
      registeredToolBlock("apply_content_patch"),
    ].join("\n");

    expect(authoringFixSchemaSource.length).toBeLessThanOrEqual(1450);
    expect(authoringFixSchemaSource).not.toContain("writer→adapter→validator");
    expect(authoringFixSchemaSource).not.toContain("model-issued code");
    expect(authoringFixSchemaSource).not.toContain("combat-winnability and score-economy");
  });

  it("keeps overworld ToolSearch schema source terse", () => {
    const overworldSchemaSource = OVERWORLD_SCHEMA_TOOLS.map((toolName) =>
      registeredToolBlock(toolName),
    ).join("\n");

    expect(overworldSchemaSource.length).toBeLessThanOrEqual(5000);
    expect(overworldSchemaSource).not.toContain("Session id returned by start_overworld");
    expect(overworldSchemaSource).not.toContain("returns compact context by default");
    expect(overworldSchemaSource).not.toContain("from the session observation");
  });

  it("keeps public RPG utility ToolSearch schema source terse", () => {
    const rpgUtilitySchemaSource = [
      registeredToolBlock("new_game"),
      registeredToolBlock("get_state"),
      registeredToolBlock("get_transcript"),
      registeredToolBlock("load_game"),
    ].join("\n");

    expect(rpgUtilitySchemaSource.length).toBeLessThanOrEqual(1400);
    expect(rpgUtilitySchemaSource).not.toContain("returns compact context by default");
    expect(rpgUtilitySchemaSource).not.toContain("Deterministic runtime seed");
    expect(rpgUtilitySchemaSource).not.toContain("Include raw reducer state");
    expect(rpgUtilitySchemaSource).not.toContain("full summary lists");
    expect(rpgUtilitySchemaSource).not.toContain("A save string produced");
  });

  it("defaults stateful overworld MCP actions to compact context and results", () => {
    for (const toolName of [
      "start_overworld",
      "restore_overworld_session",
      "travel_overworld_session",
      "resolve_overworld_session_road_encounter",
      "resupply_overworld_session",
      "rest_overworld_session",
      "plan_overworld_session_route",
      "scout_overworld_session_poi",
      "talk_overworld_session_contact",
      "investigate_overworld_session_event",
      "resolve_overworld_session_event",
      "explore_overworld_session_site",
      "explore_overworld_session_area",
      "move_overworld_session_area",
      "work_overworld_session_job",
      "complete_overworld_session_quest",
    ]) {
      const block = registeredToolBlock(toolName);
      expect(block).toContain("defaultCompactOverworld(a)");
    }

    const overworldDefaults = serverSourceBlock(
      "function defaultCompactOverworld",
      "function defaultCompactOverworldAndRpg",
    );
    expect(overworldDefaults).toContain("compact_context: true");
    expect(overworldDefaults).toContain("compact_result: true");
    expect(overworldDefaults.indexOf("compact_result: true")).toBeLessThan(
      overworldDefaults.indexOf("...input"),
    );

    expect(registeredToolBlock("start_overworld_session_quest")).toContain(
      "defaultCompactOverworldAndRpg(a)",
    );
    const overworldAndRpgDefaults = serverSourceBlock(
      "function defaultCompactOverworldAndRpg",
      "function defaultCompactTranscript",
    );
    expect(overworldAndRpgDefaults).toContain("hide_graph: true");
    expect(overworldAndRpgDefaults.indexOf("hide_graph: true")).toBeLessThan(
      overworldAndRpgDefaults.indexOf("...input"),
    );
    expect(overworldAndRpgDefaults).toContain("compact_result: true");
    expect(overworldAndRpgDefaults.indexOf("compact_result: true")).toBeLessThan(
      overworldAndRpgDefaults.indexOf("...input"),
    );
    expect(
      serverSourceBlock("const COMPACT_OVERWORLD_CONTEXT", 'tool(\n  "start_overworld"'),
    ).toContain("compact_result");
    expect(registeredToolBlock("get_overworld_session")).toContain("compactMcpOverworldSession(a)");
    expect(registeredToolBlock("get_overworld_session")).toContain("include_observation");
    expect(registeredToolBlock("get_overworld_session")).toContain("IF_SNAPSHOT_HASH");
    expect(registeredToolBlock("get_overworld_session_context")).toContain("IF_SNAPSHOT_HASH");
  });

  it("defaults public RPG MCP play tools to compact hidden-graph observation", () => {
    for (const toolName of [
      "new_game",
      "start_world_quest",
      "get_observation",
      "step_action",
      "load_game",
    ]) {
      const block = registeredToolBlock(toolName);
      expect(block).toContain("defaultCompactRpg(a)");
    }

    const rpgDefaults = serverSourceBlock(
      "function defaultCompactRpg",
      "function defaultCompactActions",
    );
    expect(rpgDefaults).toContain("hide_graph: true");
    expect(rpgDefaults.indexOf("hide_graph: true")).toBeLessThan(rpgDefaults.indexOf("...input"));
    const rpgViewOptions = toolApiSourceBlock("type RpgViewOptions", "type RpgEventOptions");
    const rpgEventOptions = toolApiSourceBlock("type RpgEventOptions", "type RpgViewField");
    const viewOnlyRpgArgs = [
      toolApiSourceBlock("type RpgNewGameArgs", "type RpgStartWorldQuestArgs"),
      toolApiSourceBlock("type RpgStartWorldQuestArgs", "type RpgGetObservationArgs"),
      toolApiSourceBlock("type RpgGetObservationArgs", "type RpgStepActionArgs"),
      toolApiSourceBlock("type RpgLoadGameArgs", "type RpgWorldQuestStartPayload"),
    ].join("\n");
    const stepArgs = toolApiSourceBlock("type RpgStepActionArgs", "type RpgLoadGameArgs");
    expect(rpgViewOptions).toContain("compact_observation");
    expect(rpgViewOptions).not.toContain("compact_events");
    expect(rpgEventOptions).toContain("compact_events");
    expect(viewOnlyRpgArgs).not.toContain("compact_events");
    expect(stepArgs).toContain("RpgEventOptions");
    const legalActions = registeredToolBlock("list_legal_actions");
    const actionDefaults = serverSourceBlock(
      "function defaultCompactActions",
      "function defaultCompactOverworld",
    );
    expect(legalActions).toContain("defaultCompactActions(a)");
    expect(actionDefaults).not.toContain("hide_graph");
    const legalActionArgs = toolApiSourceBlock(
      "type RpgLegalActionsArgs",
      "type RpgLegalActionRows",
    );
    expect(legalActionArgs).not.toContain("hide_graph");
    expect(legalActions).toContain("Default true; false returns labels.");
    expect(legalActions).toContain("if_state_hash");
    expect(legalActions).not.toContain("HIDE_GRAPH");
    expect(legalActions).not.toContain("hide_graph");
    expect(legalActions).not.toContain("defaultCompactRpg");
    expect(registeredToolBlock("get_observation")).toContain("if_state_hash");
    expect(sharedSchemaBlock()).toContain("compact_events");
    expect(registeredToolBlock("step_action")).toContain("COMPACT_EVENTS");
    expect(registeredToolBlock("get_state")).not.toContain("defaultCompactRpg");
  });

  it("defaults public RPG MCP transcripts to compact summary only", () => {
    const block = registeredToolBlock("get_transcript");
    const args = toolApiSourceBlock("type TranscriptArgs", "type TranscriptTurnFor");
    expect(block).toContain("defaultCompactTranscript(a)");
    expect(block).not.toContain("IF_STATE_HASH");
    expect(block).toContain("IF_TRANSCRIPT_HASH");
    expect(args).not.toContain("if_state_hash");
    expect(args).toContain("if_transcript_hash");
    expect(args).toContain("turn_limit");
    expect(block).toContain("Default true; no turns.");
    expect(block).toContain("Default true; capped lists.");
    expect(block).toContain("turn_limit");
    expect(block).toContain("COMPACT_EVENTS");
    const defaultTranscript = serverSourceBlock(
      "function defaultCompactTranscript",
      "type McpStateArgs",
    );
    expect(defaultTranscript).toContain("compact_events: true");
    expect(defaultTranscript).toContain("turn_limit: TRANSCRIPT_TURN_LIMIT_DEFAULT");
  });

  it("defaults public RPG MCP state reads to hash only", () => {
    const block = registeredToolBlock("get_state");
    expect(block).toContain("compactMcpState(a)");
    expect(block).toContain("include_state");
    expect(block).toContain("State hash");
    expect(block).not.toContain("include_state === true");
  });

  it("keeps retired static overworld compatibility helpers out of ToolApi and MCP", () => {
    const api = createToolApi({ root: process.cwd() }) as Record<string, unknown>;
    const registered = registeredServerTools();

    for (const helper of [
      ...RETIRED_STATIC_OVERWORLD_TOOLS,
      ...RETIRED_COMPATIBILITY_TOOLS,
      "validate_pack",
      "load_pack",
    ]) {
      expect(api).not.toHaveProperty(helper);
      expect(registered).not.toContain(helper);
    }

    expect(registered).toEqual(
      expect.arrayContaining([
        "start_overworld",
        "get_overworld_session_context",
        "travel_overworld_session",
        "scout_overworld_session_poi",
        "talk_overworld_session_contact",
        "investigate_overworld_session_event",
        "explore_overworld_session_area",
        "explore_overworld_session_site",
        "work_overworld_session_job",
      ]),
    );
  });
});
