import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("blind runner MCP config contract", () => {
  it("uses a Claude-compatible Windows launch on WSL and an npm cwd fallback elsewhere", () => {
    const runner = readFileSync(join(process.cwd(), "blind-tester", "run.sh"), "utf8");

    expect(runner).toContain('"command": "cmd.exe"');
    expect(runner).toContain("cd /d");
    expect(runner).toContain('"command": "npm"');
    expect(runner).toContain('"args": ["--silent", "run", "mcp"]');
    expect(runner).toContain('"cwd": "$GAME_DIR"');
    expect(runner).not.toContain('"command": "bash"');
    expect(runner).not.toContain('"command": "wsl.exe"');
  });
});
