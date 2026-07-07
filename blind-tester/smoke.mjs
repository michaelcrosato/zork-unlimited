#!/usr/bin/env node
/**
 * Blind-tester smoke test — proves the MCP plumbing end to end with NO LLM and NO
 * API key. It spawns the adventureforge MCP server exactly the way the blind agent
 * will reach it (stdio JSON-RPC), lists tools, and exercises BOTH blind-run start
 * surfaces: the overworld CORE GAME (the default blind mode — start_overworld +
 * a context re-read) and a targeted quest drop-in (start_world_quest + a few
 * stepped actions; a dev/QA entry point — players reach quests in-world via the
 * overworld). Run it before (or instead of) a real `claude -p` blind run to
 * confirm the harness is wired correctly without spending any subscription/token
 * budget.
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

function actionIdOf(action) {
  return typeof action === "string" ? action : action?.id;
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
    for (const required of [
      startTool,
      "get_observation",
      "list_legal_actions",
      "step_action",
      "get_state",
      "get_transcript",
      // The default blind mode plays the overworld CORE GAME — its start surface
      // must be present, as must the quest bridge that reaches shipped quests
      // in-world.
      "start_overworld",
      "get_overworld_session_context",
      "start_overworld_session_quest",
    ]) {
      if (!names.has(required)) fail(`MCP server is missing the "${required}" tool`);
    }
    // The retired Charter-Marches quest CATALOG/route tools must be gone.
    for (const retired of ["list_world", "world_path"]) {
      if (names.has(retired)) fail(`MCP server still advertises the retired "${retired}" tool`);
    }

    // Leg 1 — the DEFAULT blind mode: start the overworld core game from a
    // fresh start, keep the one-time compact legend, and prove the guarded
    // context re-read round-trips.
    const overworld = parseResult(
      await client.callTool({
        name: "start_overworld",
        arguments: { compact_context: true },
      }),
    );
    if (!overworld.session_id) throw new Error("start_overworld returned no session_id");
    if (!overworld.snapshot_hash) fail("start_overworld returned no snapshot_hash");
    if (!overworld.legend) fail("start_overworld did not include the one-time compact legend");
    if (!overworld.context) fail("start_overworld did not include a compact context");
    const overworldUnchanged = parseResult(
      await client.callTool({
        name: "get_overworld_session_context",
        arguments: {
          session_id: overworld.session_id,
          if_snapshot_hash: overworld.snapshot_hash,
        },
      }),
    );
    if (overworldUnchanged.unchanged !== true) {
      fail("overworld context freshness check did not return hash-only unchanged");
    }
    console.log(
      `• start_overworld ok → session ${overworld.session_id} (legend + snapshot_hash present)`,
    );

    // Leg 2 — the targeted quest drop-in (a dev/QA entry point into the RPG
    // runtime; the player-facing path reaches this quest in-world through the
    // overworld).

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
    let stateHash = start.state_hash;
    let actionMenu = parseResult(
      await client.callTool({
        name: "list_legal_actions",
        arguments: { session_id, compact_actions: true },
      }),
    );
    let actions = actionMenu.actions ?? [];
    stateHash = actionMenu.state_hash ?? stateHash;
    const sceneText = (view?.scene?.text ?? view?.text ?? "").slice(0, 90).replace(/\s+/g, " ");
    console.log(`• ${startTool} ok → session ${session_id} · ${SOURCE_LABEL}`);
    console.log(`  scene: "${sceneText}…"  (${actions.length} actions)`);

    // Step a few actions (first legal action each turn) to prove stepping works.
    let stepped = 0;
    for (let i = 0; i < STEPS; i++) {
      if (view?.ended || actions.length === 0) break;
      const actionId = actionIdOf(actions[0]);
      if (typeof actionId !== "string") fail("first legal action did not expose an action id");
      const res = parseResult(
        await client.callTool({
          name: "step_action",
          arguments: {
            session_id,
            action_id: actionId,
            expected_state_hash: stateHash,
            hide_graph: true,
            compact_observation: true,
          },
        }),
      );
      view = viewOf(res);
      stateHash = res.state_hash ?? stateHash;
      stepped++;
      console.log(`  step ${i + 1}: ${actionId} → ${view?.ended ? "[ended]" : "ok"}`);
      actionMenu = view?.ended
        ? { actions: [], state_hash: stateHash }
        : parseResult(
            await client.callTool({
              name: "list_legal_actions",
              arguments: { session_id, compact_actions: true },
            }),
          );
      actions = actionMenu.actions ?? [];
      stateHash = actionMenu.state_hash ?? stateHash;
    }

    if (stepped === 0) fail("could not step any action from the opening scene");
    const state = parseResult(
      await client.callTool({
        name: "get_state",
        arguments: { session_id, compact_state: true },
      }),
    );
    if (!state.compact_state || state.state) {
      fail("compact state audit did not return compact_state without raw state");
    }
    const unchangedState = parseResult(
      await client.callTool({
        name: "get_state",
        arguments: { session_id, compact_state: true, if_state_hash: state.state_hash },
      }),
    );
    if (unchangedState.unchanged !== true || unchangedState.compact_state) {
      fail("compact state freshness check did not return hash-only unchanged");
    }
    console.log(`  compact state: step ${state.compact_state?.step ?? "?"}`);
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
