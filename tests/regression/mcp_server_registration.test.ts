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
    const startQuest = registeredToolBlock("start_quest");
    const validateQuest = registeredToolBlock("validate_quest");
    const worldPath = registeredToolBlock("world_path");
    const loadGame = registeredToolBlock("load_game");

    expect(newGame).toContain("world_quest_id");
    expect(newGame).toContain("generate_rpg_seed");
    expect(newGame).not.toContain("pack_path");
    expect(loadGame).toContain("world_quest_id");
    expect(loadGame).toContain("generate_rpg_seed");
    expect(loadGame).not.toContain("pack_path");
    expect(startQuest).toContain("QUEST_ID_SOURCE");
    expect(startQuest).not.toContain("quest_path");
    expect(validateQuest).toContain("QUEST_ID_SOURCE");
    expect(validateQuest).not.toContain("quest_path");
    expect(worldPath).toContain("world_quest_id");
    expect(worldPath).not.toContain("quest_path");
  });

  it("keeps public MCP content and trace tools quest-id first", () => {
    const sharedSource = serverSourceBlock("const WORLD_QUEST_SOURCE", "const QUEST_ID_SOURCE");
    expect(sharedSource).toContain("world_quest_id");
    expect(sharedSource).not.toContain("pack_path");

    for (const toolName of [
      "validate_quest",
      "load_quest",
      "apply_content_patch",
      "replay_trace",
      "inspect_trace",
    ]) {
      const block = registeredToolBlock(toolName);
      expect(block).toMatch(/world_quest_id|WORLD_QUEST_SOURCE|QUEST_ID_SOURCE/);
      expect(block).not.toContain("pack_path");
    }
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

  it("keeps restore and trace ToolSearch schema source terse", () => {
    const restoreTraceSchemaSource = [
      registeredToolBlock("world_path"),
      registeredToolBlock("load_game"),
      registeredToolBlock("replay_trace"),
      registeredToolBlock("inspect_trace"),
    ].join("\n");

    expect(restoreTraceSchemaSource.length).toBeLessThanOrEqual(1500);
    expect(restoreTraceSchemaSource).toContain("world_quest_id");
    expect(restoreTraceSchemaSource).toContain("generate_rpg_seed");
    expect(restoreTraceSchemaSource).not.toContain("list_world().quests[].graph_node");
    expect(restoreTraceSchemaSource).not.toContain("Charter Marches quest graph node id");
    expect(restoreTraceSchemaSource).not.toContain("content-hash + mode");
  });

  it("defaults stateful overworld MCP actions to compact context", () => {
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
    ]) {
      const block = registeredToolBlock(toolName);
      expect(block).toContain("defaultCompactOverworld(a)");
    }

    expect(registeredToolBlock("start_overworld_session_quest")).toContain(
      "defaultCompactOverworldAndRpg(a)",
    );
    expect(registeredToolBlock("get_overworld_session")).toContain("compactMcpOverworldSession(a)");
    expect(registeredToolBlock("get_overworld_session")).toContain("include_observation");
  });

  it("defaults public RPG MCP play tools to compact observation", () => {
    for (const toolName of [
      "new_game",
      "start_world_quest",
      "start_quest",
      "get_observation",
      "get_scene",
      "step_action",
      "choose_option",
      "load_game",
    ]) {
      const block = registeredToolBlock(toolName);
      expect(block).toContain("defaultCompactRpg(a)");
    }

    const legalActions = registeredToolBlock("list_legal_actions");
    expect(legalActions).toContain("defaultCompactActions(a)");
    expect(legalActions).toContain("Default true; false returns labels.");
    expect(legalActions).not.toContain("defaultCompactRpg");
    expect(registeredToolBlock("get_state")).not.toContain("defaultCompactRpg");
  });

  it("defaults public RPG MCP transcripts to compact summary only", () => {
    const block = registeredToolBlock("get_transcript");
    expect(block).toContain("defaultCompactTranscript(a)");
    expect(block).toContain("Default true; false returns turn rows.");
    expect(block).toContain("Default true; false returns full summary lists.");
  });

  it("defaults public RPG MCP state reads to hash only", () => {
    const block = registeredToolBlock("get_state");
    expect(block).toContain("compactMcpState(a)");
    expect(block).toContain("include_state");
    expect(block).toContain("Return state hash");
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
