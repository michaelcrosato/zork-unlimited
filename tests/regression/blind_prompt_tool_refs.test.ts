/**
 * The blind-playtest prompts (blind-tester/prompt*.md) name the AdventureForge MCP
 * tools that blind agents may call directly or expose through one ToolSearch
 * fallback. If a tool is renamed or removed, a prompt that still names it silently
 * sends the blind agent after a tool that no longer exists. This guard keeps every
 * prompt's tool references honest against the server's actual registration.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { TOOL_REGISTRATIONS } from "../../src/mcp/server.js";

const PROMPT_DIR = join(process.cwd(), "blind-tester");
const registered = new Set(TOOL_REGISTRATIONS.map((t) => t.name));
const promptFiles = readdirSync(PROMPT_DIR)
  .filter((f) => f.startsWith("prompt") && f.endsWith(".md"))
  .sort();

describe("blind prompts reference only registered adventureforge tools", () => {
  it("finds the blind prompt files", () => {
    // At least the quest-mode, overworld core-game, and load-test prompts.
    expect(promptFiles).toEqual(
      expect.arrayContaining(["prompt-loadtest.md", "prompt-overworld.md", "prompt.md"]),
    );
  });

  it.each(promptFiles)("%s names only real mcp__adventureforge__* tools", (file) => {
    const text = readFileSync(join(PROMPT_DIR, file), "utf8");
    const refs = [...text.matchAll(/mcp__adventureforge__([a-z_]+)/g)].map((m) => m[1]!);
    expect(refs.length, `${file} references no adventureforge tools`).toBeGreaterThan(0);
    const unknown = [...new Set(refs)].filter((name) => !registered.has(name)).sort();
    expect(unknown, `${file} references unregistered tool(s)`).toEqual([]);
  });
});
