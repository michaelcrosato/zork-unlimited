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

describe("MCP server registration", () => {
  it("registers exactly the tested ToolApi handlers", () => {
    const api = createToolApi({ root: process.cwd() }) as Record<string, unknown>;
    const apiHandlers = Object.keys(api)
      .filter((key) => typeof api[key] === "function")
      .sort();

    expect(registeredServerTools()).toEqual(apiHandlers);
  });
});
