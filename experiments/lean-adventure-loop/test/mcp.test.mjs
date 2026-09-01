import assert from "node:assert/strict";
import test from "node:test";
import { McpClient } from "../src/mcp-client.mjs";

test("modern MCP exposes only start and step", async (t) => {
  const client = new McpClient();
  t.after(() => client.close());
  const discovery = await client.connect();
  assert.ok(discovery.supportedVersions.includes("2026-07-28"));
  const listed = await client.listTools();
  assert.deepEqual(listed.tools.map((tool) => tool.name), ["game_start", "game_step"]);

  const start = await client.callTool("game_start", { seed: 3 });
  assert.equal(start.isError, false);
  assert.equal(start.payload.rev, 0);
  assert.ok(Array.isArray(start.payload.actions));

  const stale = await client.callTool("game_step", {
    sid: start.payload.sid,
    rev: 99,
    action: start.payload.actions[0][0],
  });
  assert.equal(stale.isError, true);
  assert.equal(stale.payload.rev, 0);
});

test("legacy initialize remains compatible", async (t) => {
  const client = new McpClient({ legacy: true });
  t.after(() => client.close());
  const initialized = await client.connect();
  assert.equal(initialized.capabilities.tools.constructor, Object);
  const listed = await client.listTools();
  assert.equal(listed.tools.length, 2);
  assert.equal("resultType" in listed, false);
});

import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline";

test("stdio server accepts JSON-RPC batches", async () => {
  const server = fileURLToPath(new URL("../src/mcp-server.mjs", import.meta.url));
  const child = spawn(process.execPath, [server], { stdio: ["pipe", "pipe", "pipe"] });
  const lines = createInterface({ input: child.stdout, crlfDelay: Infinity });
  const response = new Promise((resolve) => lines.once("line", (line) => resolve(JSON.parse(line))));
  child.stdin.write(
    `${JSON.stringify([
      { jsonrpc: "2.0", id: 1, method: "server/discover", params: {} },
      { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} },
      { jsonrpc: "2.0", method: "notifications/initialized" },
    ])}\n`,
  );
  const batch = await response;
  child.stdin.end();
  assert.deepEqual(batch.map((item) => item.id), [1, 2]);
  assert.equal(batch[1].result.tools.length, 2);
});
