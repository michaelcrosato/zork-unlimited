#!/usr/bin/env node
/**
 * Blind-tester smoke test — proves the MCP plumbing end to end with NO LLM and NO
 * API key. It spawns the adventureforge MCP server exactly the way the blind agent
 * will reach it (stdio JSON-RPC), lists tools, starts a game, and steps a few
 * actions, asserting the whole path works. Run it before (or instead of) a real
 * `claude -p` blind run to confirm the harness is wired correctly without spending
 * any subscription/token budget.
 *
 *   node blind-tester/smoke.mjs [--quest <id>] [--seed <n>] [--steps <n>]
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

function hasArg(flag) {
  return process.argv.includes(flag);
}

function positionalArgs() {
  const out = [];
  for (let i = 2; i < process.argv.length; i += 1) {
    const token = process.argv[i];
    if (token?.startsWith("--")) {
      if (process.argv[i + 1] !== undefined && !process.argv[i + 1]?.startsWith("--")) i += 1;
      continue;
    }
    if (token !== undefined) out.push(token);
  }
  return out;
}

const POSITIONAL = positionalArgs();
const QUEST_EXPLICIT = hasArg("--quest") || hasArg("--quest-id");
const POSITIONAL_SOURCE = QUEST_EXPLICIT ? "" : (POSITIONAL[0] ?? "");
const POSITIONAL_IS_PACK =
  POSITIONAL_SOURCE.endsWith(".yaml") ||
  POSITIONAL_SOURCE.includes("/") ||
  POSITIONAL_SOURCE.includes("\\");
if (hasArg("--pack") || POSITIONAL_IS_PACK) {
  throw new Error("Blind smoke starts shipped quests by quest id only; use --quest <id>.");
}

const QUEST_ID = QUEST_EXPLICIT
  ? arg("--quest", arg("--quest-id", ""))
  : POSITIONAL_SOURCE || "breaking_weir";
const SEED = Number(arg("--seed", POSITIONAL[1] ?? "7"));
const STEPS = Number(arg("--steps", POSITIONAL[2] ?? "3"));
if (!QUEST_ID) {
  throw new Error("A smoke run needs --quest <id>.");
}
const SOURCE_LABEL = `quest ${QUEST_ID}`;

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

function viewOf(payload) {
  return payload?.context ?? payload?.observation ?? payload;
}

function actionsOf(view) {
  return view?.actions ?? view?.available_actions ?? [];
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
    const startTool = "start_world_quest";
    for (const required of [startTool, "get_observation", "step_action", "get_transcript"]) {
      if (!names.has(required)) fail(`MCP server is missing the "${required}" tool`);
    }

    const start = parseResult(
      await client.callTool({
        name: startTool,
        arguments: {
          world_quest_id: QUEST_ID,
          seed: SEED,
          hide_graph: true,
          compact_observation: true,
        },
      }),
    );
    if (!start.session_id) throw new Error(`${startTool} returned no session_id (${SOURCE_LABEL})`);
    const session_id = start.session_id;
    let view = viewOf(start);
    const sceneText = (view?.scene?.text ?? view?.text ?? "").slice(0, 90).replace(/\s+/g, " ");
    console.log(`• ${startTool} ok → session ${session_id} · mode ${start.mode} · ${SOURCE_LABEL}`);
    console.log(`  scene: "${sceneText}…"  (${actionsOf(view).length} actions)`);

    // Step a few actions (first legal action each turn) to prove stepping works.
    let stepped = 0;
    for (let i = 0; i < STEPS; i++) {
      const actions = actionsOf(view);
      if (view?.ended || actions.length === 0) break;
      const actionId = actions[0].id;
      const res = parseResult(
        await client.callTool({
          name: "step_action",
          arguments: {
            session_id,
            action_id: actionId,
            hide_graph: true,
            compact_observation: true,
          },
        }),
      );
      view = viewOf(res);
      stepped++;
      console.log(`  step ${i + 1}: ${actionId} → ${view?.ended ? "[ended]" : "ok"}`);
    }

    if (stepped === 0) fail("could not step any action from the opening scene");
    const transcript = parseResult(
      await client.callTool({
        name: "get_transcript",
        arguments: { session_id, summary_only: true, compact_summary: true },
      }),
    );
    if ((transcript.summary?.steps ?? -1) < stepped) {
      fail("summary transcript under-counted stepped actions");
    }
    if (Array.isArray(transcript.turns) && transcript.turns.length > 0) {
      fail("summary transcript unexpectedly returned turn rows");
    }
    console.log(
      `  transcript summary: ${transcript.summary?.steps ?? 0} step(s), ${
        transcript.summary?.scenes?.length ?? 0
      } scene(s)`,
    );

    if (process.exitCode) console.error("\nSMOKE: FAIL");
    else
      console.log(
        `\n✓ SMOKE OK — MCP path works (no LLM, no API key). Stepped ${stepped} action(s).`,
      );
  } finally {
    await client.close();
  }
}

main().catch((e) => {
  console.error(`✗ smoke failed: ${e.message}`);
  process.exit(1);
});
