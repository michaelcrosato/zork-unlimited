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

type Obs = {
  mode: "rpg";
  room: string;
  title: string;
  description: string;
  inventory: string[];
  state: { flags: string[]; vars: Record<string, number>; journal: string[] };
  enemies_present: { id: string; name: string; hp: number }[];
  stats: { hp: number; attack: number; defense: number };
  available_actions: {
    id: string;
    command: string;
    skill_check?: { skill: string; difficulty: number; die: string };
  }[];
  ended: boolean;
  ending_id: string | null;
  ending: { title: string; text: string; death: boolean } | null;
};

function parseResult(res: unknown): {
  session_id?: string;
  observation: Obs;
  state_hash: string;
  ok?: boolean;
  rejection_reason?: string;
} {
  const content = (res as { content: { type: string; text: string }[] }).content;
  return JSON.parse(content[0]!.text);
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
      arguments: { world_quest_id: questId, seed },
    }),
  );
  const sessionId = game.session_id!;
  let current = game.observation;

  for (const action_id of actions) {
    const r = parseResult(
      await client.callTool({
        name: "step_action",
        arguments: { session_id: sessionId, action_id },
      }),
    );
    if (r.ok === false) {
      console.log(`! rejected "${action_id}": ${r.rejection_reason}`);
    }
    current = r.observation;
  }

  console.log(`\n=== ${current.title} (${current.room}) ===`);
  console.log(current.description.trim());
  console.log(
    `\n[hp ${current.stats.hp} | attack ${current.stats.attack} | defense ${current.stats.defense}]`,
  );
  if (current.enemies_present.length)
    console.log(
      `[enemies: ${current.enemies_present.map((e) => `${e.name} hp${e.hp}`).join(", ")}]`,
    );
  if (current.inventory.length) console.log(`[inventory: ${current.inventory.join(", ")}]`);
  if (current.state.journal.length)
    console.log(
      `[journal: ${current.state.journal.length} entries — latest: "${current.state.journal.at(-1)}"]`,
    );
  if (current.ended) {
    const endingTitle = current.ending?.title ?? current.ending_id;
    console.log(`\n*** THE END — ${endingTitle} ***`);
  } else {
    console.log("\nAvailable actions:");
    for (const a of current.available_actions) {
      const roll = a.skill_check
        ? ` [${a.skill_check.die} ${a.skill_check.skill} vs ${a.skill_check.difficulty}]`
        : "";
      console.log(`  - ${a.id}: ${a.command}${roll}`);
    }
  }

  await client.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
