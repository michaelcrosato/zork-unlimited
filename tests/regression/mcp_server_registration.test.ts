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

    expect(newGame).toContain("world_quest_id");
    expect(newGame).toContain("generate_rpg_seed");
    expect(newGame).not.toContain("pack_path");
    expect(startQuest).toContain("QUEST_ID_SOURCE");
    expect(startQuest).not.toContain("QUEST_ALIAS_SOURCE");
    expect(startQuest).not.toContain("quest_path");
  });
});
