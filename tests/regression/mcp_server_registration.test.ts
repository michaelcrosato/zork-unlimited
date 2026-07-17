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
import { READ_ONLY_TOOLS, TOOL_REGISTRATIONS } from "../../src/mcp/server.js";

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
  "follow_overworld_session_goal",
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
  "choose_overworld_session_journey",
  "choose_overworld_session_story",
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
  const firstTool = /tool\(\r?\n\s+"list_overworld"/.exec(text);
  const end = firstTool?.index ?? -1;
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

function sourceBlock(path: string, startMarker: string, endMarker: string): string {
  const text = readFileSync(path, "utf8");
  const start = text.indexOf(startMarker);
  const end = text.indexOf(endMarker, start);
  if (start < 0 || end < 0) throw new Error(`missing source block ${path}:${startMarker}`);
  return text.slice(start, end);
}

function toolApiSourceBlock(startMarker: string, endMarker: string): string {
  return sourceBlock("src/mcp/tools.ts", startMarker, endMarker);
}

describe("MCP server registration", () => {
  it("registers exactly the tested ToolApi handlers", () => {
    const api = createToolApi({ root: process.cwd() }) as Record<string, unknown>;
    const apiHandlers = Object.keys(api)
      .filter((key) => typeof api[key] === "function")
      .sort();

    expect(registeredServerTools()).toEqual(apiHandlers);
  });

  it("annotates every tool: closed + non-destructive engine, read-only tools flagged", () => {
    expect(TOOL_REGISTRATIONS.length).toBeGreaterThan(0);
    const registeredNames = new Set(TOOL_REGISTRATIONS.map((t) => t.name));
    // The read-only set must reference only real registered tools (no stale names).
    for (const name of READ_ONLY_TOOLS) {
      expect(registeredNames.has(name), `READ_ONLY_TOOLS names an unregistered tool: ${name}`).toBe(
        true,
      );
    }
    for (const reg of TOOL_REGISTRATIONS) {
      // Deterministic, closed engine: no tool is destructive or open-world.
      expect(reg.annotations.destructiveHint, reg.name).toBe(false);
      expect(reg.annotations.openWorldHint, reg.name).toBe(false);
      if (READ_ONLY_TOOLS.has(reg.name)) {
        expect(reg.annotations.readOnlyHint, reg.name).toBe(true);
        expect(reg.annotations.idempotentHint, reg.name).toBe(true);
      } else {
        // Session-mutating tools must not claim read-only.
        expect(reg.annotations.readOnlyHint ?? false, reg.name).toBe(false);
      }
    }
    const byName = new Map(TOOL_REGISTRATIONS.map((t) => [t.name, t]));
    expect(byName.get("list_overworld")?.annotations.readOnlyHint).toBe(true);
    expect(byName.get("get_observation")?.annotations.readOnlyHint).toBe(true);
    expect(byName.get("step_action")?.annotations.readOnlyHint ?? false).toBe(false);
    expect(byName.get("start_overworld")?.annotations.readOnlyHint ?? false).toBe(false);
    expect(byName.get("start_overworld_session_quest")?.annotations.readOnlyHint ?? false).toBe(
      false,
    );
  });

  it("advertises world-bound and generated starts, not the retired Charter-Marches quest menu", () => {
    const newGame = registeredToolBlock("new_game");
    const startWorldQuest = registeredToolBlock("start_world_quest");
    const startOverworldQuest = registeredToolBlock("start_overworld_session_quest");
    const validateQuest = registeredToolBlock("validate_quest");
    const loadGame = registeredToolBlock("load_game");
    const registered = registeredServerTools();

    expect(newGame).toContain("generate_rpg_seed");
    expect(newGame).not.toContain("world_quest_id");
    expect(newGame).not.toContain("pack_path");
    expect(loadGame).toContain("world_quest_id");
    expect(loadGame).toContain("generate_rpg_seed");
    expect(loadGame).not.toContain("pack_path");
    expect(startWorldQuest).toContain("world_quest_id");
    expect(startWorldQuest).not.toContain("approach_id");
    expect(startWorldQuest).not.toMatch(/\n\s+quest_id:/);
    expect(startWorldQuest).not.toContain("quest_path");
    expect(startWorldQuest).not.toContain("include_world_context");
    expect(startOverworldQuest).toContain("approach_id");
    expect(validateQuest).toContain("WORLD_QUEST_SOURCE");
    expect(validateQuest).not.toContain("QUEST_ID_SOURCE");
    expect(validateQuest).not.toContain("quest_path");
    // The retired Charter-Marches quest CATALOG/route tools are gone (the overworld
    // is the sole world + quest registry); players reach quests in-world, and
    // start_world_quest survives only as a dev/QA entry point.
    expect(registered).not.toContain("list_world");
    expect(registered).not.toContain("world_path");
    expect(registered).toContain("start_overworld_session_quest");
  });

  it("keeps public MCP content and trace tools quest-id first", () => {
    const sharedSource = serverSourceBlock("const WORLD_QUEST_SOURCE", "const OVERWORLD_SESSION");
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

  it("keeps retired source aliases out of public ToolApi argument types", () => {
    const sourceArgs = sourceBlock(
      "src/world/source.ts",
      "export type TraceSourceArgs",
      "const overworldManifestCache",
    );
    const lifecycleArgs = sourceBlock(
      "src/mcp/rpg_session_lifecycle.ts",
      "export type RpgNewGameToolArgs",
      "export type RpgWorldQuestStartPayload",
    );
    const toolApiArgs = toolApiSourceBlock("type RpgNewGameArgs", "type AdaptStoryArgs");

    for (const block of [sourceArgs, lifecycleArgs, toolApiArgs]) {
      expect(block).not.toContain("pack_path?: never");
      expect(block).not.toContain("quest_id?: never");
      expect(block).not.toContain("quest_path?: never");
    }
  });

  // Schema-source budgets: every tool must fit ONE informative sentence plus
  // meaningful arg describes (the blind-agent contract guarded by
  // tests/unit/compact_legend.test.ts), while these caps stop the schemas from
  // regrowing into the multi-paragraph prose the token-efficiency pass removed.
  it("keeps the blind-playtest ToolSearch schema source terse", () => {
    const blindToolSchemaSource = [
      sharedSchemaBlock(),
      registeredToolBlock("start_world_quest"),
      registeredToolBlock("get_observation"),
      registeredToolBlock("list_legal_actions"),
      registeredToolBlock("step_action"),
      registeredToolBlock("get_state"),
      registeredToolBlock("get_transcript"),
    ].join("\n");

    expect(blindToolSchemaSource.length).toBeLessThanOrEqual(4650);
    expect(blindToolSchemaSource).not.toContain("Token economy:");
    expect(blindToolSchemaSource).toContain("compact_observation");
    expect(blindToolSchemaSource).toContain("compact_state");
    expect(blindToolSchemaSource).toContain("compact_summary");
  });

  it("serializes successful MCP tool results as minified JSON text", () => {
    const text = readFileSync("src/mcp/server.ts", "utf8");

    expect(text).toContain("JSON.stringify(value)");
    expect(text).not.toContain("JSON.stringify(value, null, 2)");
  });

  it("keeps restore and trace ToolSearch schema source terse", () => {
    const restoreTraceSchemaSource = [
      registeredToolBlock("load_game"),
      registeredToolBlock("replay_trace"),
      registeredToolBlock("inspect_trace"),
    ].join("\n");

    expect(restoreTraceSchemaSource.length).toBeLessThanOrEqual(1300);
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

    expect(authoringFixSchemaSource.length).toBeLessThanOrEqual(2250);
    expect(authoringFixSchemaSource).not.toContain("writer→adapter→validator");
    expect(authoringFixSchemaSource).not.toContain("model-issued code");
    expect(authoringFixSchemaSource).not.toContain("combat-winnability and score-economy");
  });

  it("keeps overworld ToolSearch schema source terse", () => {
    const overworldSchemaSource = OVERWORLD_SCHEMA_TOOLS.map((toolName) =>
      registeredToolBlock(toolName),
    ).join("\n");

    // The game-native passage action and optional quest-approach id add bounded
    // schema blocks; retain a tight ceiling so transport prose cannot regrow.
    expect(overworldSchemaSource.length).toBeLessThanOrEqual(8250);
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

    expect(rpgUtilitySchemaSource.length).toBeLessThanOrEqual(2100);
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
      "follow_overworld_session_goal",
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
      "choose_overworld_session_story",
    ]) {
      const block = registeredToolBlock(toolName);
      expect(block).toContain("defaultCompactOverworld(a)");
    }
    expect(registeredToolBlock("complete_overworld_session_quest")).toContain(
      "expected_rpg_state_hash",
    );
    expect(registeredToolBlock("follow_overworld_session_goal")).not.toMatch(
      /destination_town_id|road_id|choice:/,
    );
    expect(registeredToolBlock("travel_overworld_session")).toContain("Adjacent destination town.");
    expect(registeredToolBlock("travel_overworld_session")).not.toContain("routes multi-leg");

    const overworldDefaults = serverSourceBlock(
      "function defaultCompactOverworld",
      "function defaultCompactOverworldAndRpg",
    );
    expect(overworldDefaults).toContain("compact_context: true");
    expect(overworldDefaults).toContain("compact_result: true");
    expect(overworldDefaults.indexOf("compact_result: true")).toBeLessThan(
      overworldDefaults.indexOf("...input"),
    );

    for (const toolName of ["start_overworld_session_quest", "choose_overworld_session_journey"]) {
      expect(registeredToolBlock(toolName)).toContain("defaultCompactOverworldAndRpg(a)");
    }
    expect(registeredToolBlock("choose_overworld_session_journey")).toContain(
      "COMPACT_OBSERVATION",
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
    expect(overworldAndRpgDefaults).toContain("compact_actions: true");
    expect(overworldAndRpgDefaults.indexOf("compact_actions: true")).toBeLessThan(
      overworldAndRpgDefaults.indexOf("...input"),
    );
    expect(overworldAndRpgDefaults).toContain('PLAY_MODE !== "pure"');
    expect(overworldAndRpgDefaults).toContain("compact_context: true");
    expect(overworldAndRpgDefaults.lastIndexOf("compact_context: true")).toBeGreaterThan(
      overworldAndRpgDefaults.indexOf("...input"),
    );
    expect(overworldAndRpgDefaults).toContain("input.compact_observation === false");
    expect(overworldAndRpgDefaults).toContain("compact_actions: input.compact_actions ?? false");
    expect(overworldAndRpgDefaults).toContain("include_actions: true");
    expect(overworldAndRpgDefaults.lastIndexOf("include_actions: true")).toBeGreaterThan(
      overworldAndRpgDefaults.indexOf("...input"),
    );
    expect(
      serverSourceBlock("const COMPACT_OVERWORLD_CONTEXT", 'tool(\n  "start_overworld"'),
    ).toContain("compact_result");
    expect(registeredToolBlock("get_overworld_session")).toContain("compactMcpOverworldSession(a)");
    expect(registeredToolBlock("get_overworld_session")).toContain("include_observation");
    expect(registeredToolBlock("get_overworld_session")).toContain("IF_SNAPSHOT_HASH");
    expect(registeredToolBlock("get_overworld_session_context")).toContain("IF_SNAPSHOT_HASH");
    expect(registeredToolBlock("export_overworld_session")).toContain("IF_SNAPSHOT_HASH");
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
    expect(rpgDefaults).toContain("compact_actions: true");
    expect(rpgDefaults.indexOf("compact_actions: true")).toBeLessThan(
      rpgDefaults.indexOf("...input"),
    );
    expect(rpgDefaults).toContain('PLAY_MODE !== "pure"');
    expect(rpgDefaults).toContain("input.compact_observation === false");
    expect(rpgDefaults).toContain("compact_actions: input.compact_actions ?? false");
    expect(rpgDefaults).toContain("include_actions: true");
    expect(rpgDefaults.lastIndexOf("include_actions: true")).toBeGreaterThan(
      rpgDefaults.indexOf("...input"),
    );
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
    expect(rpgViewOptions).toContain("include_actions");
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
    expect(actionDefaults).toContain('PLAY_MODE === "pure" ? false : true');
    expect(actionDefaults.indexOf('PLAY_MODE === "pure" ? false : true')).toBeLessThan(
      actionDefaults.indexOf("...input"),
    );
    const legalActionArgs = toolApiSourceBlock(
      "type RpgLegalActionsArgs",
      "type RpgLegalActionRows",
    );
    expect(legalActionArgs).not.toContain("hide_graph");
    expect(legalActions).toContain("labeled options");
    expect(legalActions).toContain("IF_STATE_HASH");
    expect(legalActions).not.toContain("HIDE_GRAPH");
    expect(legalActions).not.toContain("hide_graph");
    expect(legalActions).not.toContain("defaultCompactRpg");
    expect(registeredToolBlock("get_observation")).toContain("IF_STATE_HASH");
    expect(sharedSchemaBlock()).toContain("include_actions");
    expect(sharedSchemaBlock()).toContain("compact_events");
    expect(sharedSchemaBlock()).toContain("include_event_version");
    expect(registeredToolBlock("step_action")).toContain("COMPACT_EVENTS");
    expect(registeredToolBlock("get_state")).not.toContain("defaultCompactRpg");
  });

  it("defaults public RPG MCP transcripts to compact summary only", () => {
    const block = registeredToolBlock("get_transcript");
    const args = sourceBlock(
      "src/mcp/transcript_projection.ts",
      "export type TranscriptArgs",
      "type TranscriptTurnFor",
    );
    expect(block).toContain("defaultCompactTranscript(a)");
    expect(block).not.toContain("IF_STATE_HASH");
    expect(block).toContain("IF_TRANSCRIPT_HASH");
    expect(args).not.toContain("if_state_hash");
    expect(args).toContain("if_transcript_hash");
    expect(args).toContain("include_session_id");
    expect(args).toContain("include_event_version");
    expect(args).toContain("turn_limit");
    expect(block).toContain("...S");
    expect(block).toContain("per-turn rows");
    expect(block).toContain("summary labels");
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
    expect(block).toContain("IF_STATE_HASH");
    expect(block).toContain("include_state");
    expect(block).toContain("state hash");
    expect(block).not.toContain("include_state === true");
    const saveBlock = registeredToolBlock("save_game");
    expect(saveBlock).toContain("IF_STATE_HASH");
    expect(saveBlock).toContain("include_source");
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
        "follow_overworld_session_goal",
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
