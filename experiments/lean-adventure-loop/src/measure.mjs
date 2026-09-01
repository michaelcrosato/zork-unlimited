#!/usr/bin/env node
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadWorld } from "./engine.mjs";
import { McpClient } from "./mcp-client.mjs";

export async function measure() {
  const world = await loadWorld();
  const client = new McpClient();
  try {
    await client.connect();
    const catalog = await client.listTools();
    const started = await client.callTool("game_start", { seed: 1 });
    let payload = started.payload;
    const sizes = [JSON.stringify(payload).length];
    for (const action of world.winningPlan) {
      const result = await client.callTool("game_step", {
        sid: payload.sid,
        rev: payload.rev,
        action,
      });
      if (result.isError) throw new Error(result.payload.error);
      payload = result.payload;
      sizes.push(JSON.stringify(payload).length);
    }
    return {
      tools: catalog.tools.length,
      toolCatalogJsonBytes: JSON.stringify(catalog).length,
      callsToWin: sizes.length,
      startJsonBytes: sizes[0],
      meanStepJsonBytes: Math.round(
        sizes.slice(1).reduce((sum, value) => sum + value, 0) / Math.max(1, sizes.length - 1),
      ),
      totalGameResultJsonBytes: sizes.reduce((sum, value) => sum + value, 0),
      ending: payload.end?.[0] ?? null,
    };
  } finally {
    await client.close();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  measure()
    .then((value) => process.stdout.write(`${JSON.stringify(value, null, 2)}\n`))
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
}
