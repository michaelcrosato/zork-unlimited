/**
 * Spectate mode — a human can live-watch an LLM playthrough and verify what is
 * happening. When the MCP server is started with `--spectate <file>` (or
 * AF_SPECTATE), every tool call appends a human-readable entry to the feed
 * (watched from another terminal via `npm run spectate`), and
 * `--spectate-delay-ms N` (or AF_SPECTATE_DELAY_MS) pauses each tool response
 * so the playthrough is slow enough to follow. Both knobs ride the server's
 * argv, which every MCP client preserves (unlike env/cwd fields, which some
 * clients drop). Inert when unset — pinned here so a regression can't silently
 * add delays or file writes to normal blind/loop runs.
 */
import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = process.cwd();
const TSX = join(ROOT, "node_modules", "tsx", "dist", "cli.mjs");

async function withServer<T>(
  serverArgs: string[],
  body: (client: Client) => Promise<T>,
): Promise<T> {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [TSX, "src/mcp/server.ts", ...serverArgs],
    cwd: ROOT,
    stderr: "pipe",
  });
  const client = new Client({ name: "spectate-test", version: "1.0.0" }, { capabilities: {} });
  await client.connect(transport);
  try {
    return await body(client);
  } finally {
    await client.close();
  }
}

describe("MCP spectate mode", () => {
  it("writes a human-readable feed entry per tool call and honors the response delay", async () => {
    const dir = mkdtempSync(join(tmpdir(), "spectate-"));
    const feed = join(dir, "feed.log");
    try {
      await withServer(["--spectate", feed, "--spectate-delay-ms", "250"], async (client) => {
        const before = Date.now();
        await client.callTool({ name: "list_overworld", arguments: {} });
        await client.callTool({
          name: "start_overworld",
          arguments: { compact_context: true },
        });
        const elapsed = Date.now() - before;
        // Two calls x 250ms pacing; generous floor to stay timing-tolerant.
        expect(elapsed).toBeGreaterThanOrEqual(400);
      });
      const text = readFileSync(feed, "utf8");
      expect(text).toContain("adventureforge spectate — session started");
      // Human-readable play-by-play, not a raw JSON dump.
      expect(text).toContain("enter the world"); // the action, readable
      expect(text).toMatch(/albany/i); // the game's scene content (the start town) is visible
      expect(text).not.toContain('"snapshot_hash"'); // not raw MCP JSON
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 120_000);

  it("stays fully inert when spectate is not enabled (no feed, no delay plumbing)", async () => {
    const dir = mkdtempSync(join(tmpdir(), "spectate-off-"));
    const feed = join(dir, "feed.log");
    try {
      await withServer([], async (client) => {
        await client.callTool({ name: "list_overworld", arguments: {} });
      });
      expect(existsSync(feed)).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 120_000);
});
