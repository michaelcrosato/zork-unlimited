#!/usr/bin/env -S npx tsx
/**
 * Dev harness: play a CYOA pack by driving the AdventureForge MCP server over
 * stdio with the MCP *client* SDK. Demonstrates an external agent playing the
 * game purely through the §9.4 tools (new_game / step_action / get_observation).
 *
 * Because each invocation spawns a fresh server (in-memory sessions), the action
 * prefix is replayed each turn — deterministic, so the reached state is exact.
 *
 * Usage: tsx scripts/mcp_play.ts <pack.yaml> [--seed N] [--do a,b,c]
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

type Obs = {
  scene_id: string;
  title: string;
  text: string;
  state: { flags: string[]; inventory: string[]; journal: string[] };
  available_actions: { id: string; text: string }[];
  ended: boolean;
  ending_id: string | null;
};

function parseResult(res: unknown): { session_id?: string; observation: Obs; state_hash: string; ok?: boolean; rejection_reason?: string } {
  const content = (res as { content: { type: string; text: string }[] }).content;
  return JSON.parse(content[0]!.text);
}

async function main(): Promise<void> {
  const pack = process.argv[2]!;
  let seed = 1;
  let actions: string[] = [];
  for (let i = 3; i < process.argv.length; i++) {
    if (process.argv[i] === "--seed") seed = Number(process.argv[++i]);
    else if (process.argv[i] === "--do") actions = (process.argv[++i] ?? "").split(",").filter(Boolean);
  }

  const transport = new StdioClientTransport({ command: "npm", args: ["--silent", "run", "mcp"] });
  const client = new Client({ name: "mcp-play-harness", version: "0.1.0" });
  await client.connect(transport);

  const game = parseResult(await client.callTool({ name: "new_game", arguments: { pack_path: pack, seed } }));
  const sessionId = game.session_id!;
  let current = game.observation;

  for (const action_id of actions) {
    const r = parseResult(await client.callTool({ name: "step_action", arguments: { session_id: sessionId, action_id } }));
    if (r.ok === false) {
      console.log(`! rejected "${action_id}": ${r.rejection_reason}`);
    }
    current = r.observation;
  }

  console.log(`\n=== ${current.title} (${current.scene_id}) ===`);
  console.log(current.text.trim());
  if (current.state.inventory.length) console.log(`\n[inventory: ${current.state.inventory.join(", ")}]`);
  if (current.state.journal.length) console.log(`[journal: ${current.state.journal.length} entries — latest: "${current.state.journal.at(-1)}"]`);
  if (current.ended) {
    console.log(`\n*** THE END — ${current.ending_id} ***`);
  } else {
    console.log("\nAvailable actions:");
    for (const a of current.available_actions) console.log(`  - ${a.id}: ${a.text}`);
  }

  await client.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
