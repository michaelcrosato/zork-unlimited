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

const INTERNAL_TOOL_API_HELPERS = new Set([
  "explore_overworld_area",
  "explore_overworld_site",
  "investigate_overworld_event",
  "look_overworld",
  "scout_overworld_poi",
  "talk_overworld_contact",
  "travel_overworld",
  "work_overworld_job",
]);

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

describe("MCP server registration", () => {
  it("registers exactly the tested public ToolApi handlers", () => {
    const api = createToolApi({ root: process.cwd() }) as Record<string, unknown>;
    const apiHandlers = Object.keys(api)
      .filter((key) => typeof api[key] === "function")
      .filter((key) => !INTERNAL_TOOL_API_HELPERS.has(key))
      .sort();

    expect(registeredServerTools()).toEqual(apiHandlers);
  });

  it("advertises world-bound starts instead of raw pack-path gameplay starts", () => {
    const newGame = registeredToolBlock("new_game");
    const startQuest = registeredToolBlock("start_quest");
    const validateQuest = registeredToolBlock("validate_quest");
    const worldPath = registeredToolBlock("world_path");

    expect(newGame).toContain("world_quest_id");
    expect(newGame).toContain("generate_rpg_seed");
    expect(newGame).not.toContain("pack_path");
    expect(startQuest).toContain("QUEST_ID_SOURCE");
    expect(startQuest).not.toContain("quest_path");
    expect(validateQuest).toContain("QUEST_ID_SOURCE");
    expect(validateQuest).not.toContain("quest_path");
    expect(worldPath).toContain("world_quest_id");
    expect(worldPath).not.toContain("quest_path");
  });

  it("keeps static overworld compatibility helpers off the public MCP surface", () => {
    const registered = registeredServerTools();

    for (const helper of INTERNAL_TOOL_API_HELPERS) {
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
