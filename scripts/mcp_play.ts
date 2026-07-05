#!/usr/bin/env -S npx tsx
/**
 * Dev harness: play a shipped RPG world quest by driving the AdventureForge MCP server over
 * stdio with the MCP *client* SDK. Demonstrates an external agent playing the
 * game purely through the §9.4 tools (start_world_quest / step_action / get_observation).
 *
 * Each invocation spawns a fresh server and applies the optional `--do` action
 * ids in order to one deterministic in-memory session.
 *
 * Usage: tsx scripts/mcp_play.ts <world_quest_id> [--seed N] [--do a,b,c]
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { RpgCompactObservation } from "../src/mcp/compact_rpg_observation.js";

const COMPACT_RPG_ARGS = {
  hide_graph: true,
  compact_actions: true,
  compact_observation: true,
} as const;

const COMPACT_STEP_ARGS = {
  ...COMPACT_RPG_ARGS,
  compact_events: true,
} as const;

function parseResult(res: unknown): {
  session_id?: string;
  context: RpgCompactObservation;
  state_hash: string;
  ok?: boolean;
  rejection_reason?: string;
} {
  const content = (res as { content: { type: string; text: string }[] }).content;
  return JSON.parse(content[0]!.text);
}

function printCompactContext(current: RpgCompactObservation): void {
  const [room, title] = current.here;
  const [hp, attack, defense, score, maxScore] = current.vitals;

  console.log(`\n=== ${title} (${room}) ===`);
  console.log(current.text.trim());
  console.log(`\n[hp ${hp} | attack ${attack} | defense ${defense} | score ${score}/${maxScore}]`);
  if (current.enemies?.length) {
    console.log(
      `[enemies: ${current.enemies.map((enemy) => `${enemy[1]} hp${enemy[2]}`).join(", ")}]`,
    );
  }
  if (current.inv?.length) console.log(`[inventory: ${current.inv.join(", ")}]`);
  if (current.journal?.length) {
    console.log(
      `[journal: ${current.journal.length} entries - latest: "${current.journal.at(-1)}"]`,
    );
  }
  if (current.ended) {
    const endingTitle = current.ending?.title ?? current.ending_id;
    console.log(`\n*** THE END - ${endingTitle} ***`);
    return;
  }

  console.log("\nAvailable action ids:");
  for (const action of current.actions ?? []) console.log(`  - ${action}`);
}

async function main(): Promise<void> {
  const questId = process.argv[2]!;
  let seed = 1;
  let actions: string[] = [];
  for (let i = 3; i < process.argv.length; i++) {
    if (process.argv[i] === "--seed") seed = Number(process.argv[++i]);
    else if (process.argv[i] === "--do")
      actions = (process.argv[++i] ?? "").split(",").filter(Boolean);
  }

  const transport = new StdioClientTransport({ command: "npm", args: ["--silent", "run", "mcp"] });
  const client = new Client({ name: "mcp-play-harness", version: "0.1.0" });
  await client.connect(transport);

  const game = parseResult(
    await client.callTool({
      name: "start_world_quest",
      arguments: { world_quest_id: questId, seed, ...COMPACT_RPG_ARGS },
    }),
  );
  const sessionId = game.session_id!;
  let current = game.context;

  for (const action_id of actions) {
    const r = parseResult(
      await client.callTool({
        name: "step_action",
        arguments: { session_id: sessionId, action_id, ...COMPACT_STEP_ARGS },
      }),
    );
    if (r.ok === false) {
      console.log(`! rejected "${action_id}": ${r.rejection_reason}`);
    }
    current = r.context;
  }

  printCompactContext(current);

  await client.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
