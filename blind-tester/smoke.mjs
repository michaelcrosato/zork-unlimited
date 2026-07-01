#!/usr/bin/env node
/**
 * Blind-tester smoke test — proves the MCP plumbing end to end with NO LLM and NO
 * API key. It spawns the adventureforge MCP server exactly the way the blind agent
 * will reach it (stdio JSON-RPC), lists tools, starts a game, and steps a few
 * actions, asserting the whole path works. Run it before (or instead of) a real
 * `claude -p` blind run to confirm the harness is wired correctly without spending
 * any subscription/token budget.
 *
 *   node blind-tester/smoke.mjs [--pack <path>] [--seed <n>] [--steps <n>]
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const GAME_DIR = resolve(HERE, "..");

function arg(flag, fallback) {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] !== undefined ? process.argv[i + 1] : fallback;
}

const PACK = arg("--pack", "content/rpg/pack/breaking_weir.yaml");
const SEED = Number(arg("--seed", "7"));
const STEPS = Number(arg("--steps", "3"));

/** MCP text-content tool results carry a JSON string; parse it defensively. */
function parseResult(result) {
  if (result?.isError) throw new Error(result.content?.[0]?.text ?? "tool returned isError");
  const text = result?.content?.[0]?.text ?? "";
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

function fail(msg) {
  console.error(`✗ ${msg}`);
  process.exitCode = 1;
}

async function main() {
  // Launch the server with cwd = game dir, exactly the entrypoint the blind agent's
  // MCP config uses, so packs resolve relative to the project root.
  const transport = new StdioClientTransport({
    command: "npm",
    args: ["--silent", "run", "mcp"],
    cwd: GAME_DIR,
    stderr: "inherit",
  });
  const client = new Client({ name: "blind-tester-smoke", version: "1.0.0" }, { capabilities: {} });

  await client.connect(transport);
  try {
    const { tools } = await client.listTools();
    const names = new Set(tools.map((t) => t.name));
    console.log(`• tools/list → ${tools.length} tools`);
    for (const required of ["start_game", "get_scene", "step_action"]) {
      if (!names.has(required)) fail(`MCP server is missing the "${required}" tool`);
    }

    const start = parseResult(
      await client.callTool({ name: "start_game", arguments: { story_path: PACK, seed: SEED } }),
    );
    if (!start.session_id) throw new Error(`start_game returned no session_id (pack ${PACK})`);
    const session_id = start.session_id;
    let obs = start.observation;
    const sceneText = (obs?.scene?.text ?? obs?.text ?? "").slice(0, 90).replace(/\s+/g, " ");
    console.log(`• start_game ok → session ${session_id} · mode ${start.mode}`);
    console.log(`  scene: "${sceneText}…"  (${obs?.available_actions?.length ?? 0} actions)`);

    // Step a few actions (first legal action each turn) to prove stepping works.
    let stepped = 0;
    for (let i = 0; i < STEPS; i++) {
      const actions = obs?.available_actions ?? [];
      if (obs?.ended || actions.length === 0) break;
      const actionId = actions[0].id;
      const res = parseResult(
        await client.callTool({
          name: "step_action",
          arguments: { session_id, action_id: actionId },
        }),
      );
      obs = res.observation ?? res;
      stepped++;
      console.log(`  step ${i + 1}: ${actionId} → ${obs?.ended ? "[ended]" : "ok"}`);
    }

    if (stepped === 0) fail("could not step any action from the opening scene");
    if (process.exitCode) console.error("\nSMOKE: FAIL");
    else console.log(`\n✓ SMOKE OK — MCP path works (no LLM, no API key). Stepped ${stepped} action(s).`);
  } finally {
    await client.close();
  }
}

main().catch((e) => {
  console.error(`✗ smoke failed: ${e.message}`);
  process.exit(1);
});
