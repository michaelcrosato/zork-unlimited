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

function registeredServerTools(): string[] {
  const text = readFileSync("src/mcp/server.ts", "utf8");
  return [...text.matchAll(/tool\(\s*\n?\s*["']([^"']+)["']/g)].map((match) => match[1]!).sort();
}

function registeredToolBlock(name: string): string {
  const text = readFileSync("src/mcp/server.ts", "utf8");
  const marker = `  "${name}",`;
  const start = text.indexOf(marker);
  if (start < 0) throw new Error(`missing tool block ${name}`);
  const next = text.indexOf("\ntool(", start + marker.length);
  return text.slice(start, next < 0 ? text.length : next);
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
    const sharedSource = serverSourceBlock(
      "const WORLD_QUEST_PACK_SOURCE",
      "const QUEST_ID_SOURCE",
    );
    expect(sharedSource).toContain("world_quest_id");
    expect(sharedSource).not.toContain("pack_path");

    for (const toolName of [
      "validate_pack",
      "load_pack",
      "apply_content_patch",
      "replay_trace",
      "inspect_trace",
    ]) {
      const block = registeredToolBlock(toolName);
      expect(block).toMatch(/world_quest_id|WORLD_QUEST_PACK_SOURCE/);
      expect(block).not.toContain("pack_path");
    }
  });

  it("keeps retired static overworld compatibility helpers out of ToolApi and MCP", () => {
    const api = createToolApi({ root: process.cwd() }) as Record<string, unknown>;
    const registered = registeredServerTools();

    for (const helper of RETIRED_STATIC_OVERWORLD_TOOLS) {
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
