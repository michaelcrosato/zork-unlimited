#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const THREAD_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const ALLOWED_EVENT_TYPES = new Set([
  "thread.started",
  "turn.started",
  "item.started",
  "item.completed",
  "turn.completed",
]);
const ALLOWED_ITEM_TYPES = new Set(["agent_message", "reasoning", "mcp_tool_call"]);
// Keep this transport audit synchronized with the server's authoritative
// PURE_PLAYER_TOOLS set. A regression imports both sets and compares them.
export const CODEX_PURE_PLAYER_TOOLS = new Set([
  "start_overworld",
  "get_overworld_session",
  "get_overworld_session_context",
  "plan_overworld_session_route",
  "travel_overworld_session",
  "follow_overworld_session_goal",
  "resolve_overworld_session_road_encounter",
  "resupply_overworld_session",
  "rest_overworld_session",
  "scout_overworld_session_poi",
  "talk_overworld_session_contact",
  "investigate_overworld_session_event",
  "resolve_overworld_session_event",
  "explore_overworld_session_site",
  "explore_overworld_session_area",
  "move_overworld_session_area",
  "work_overworld_session_job",
  "start_overworld_session_quest",
  "choose_overworld_session_journey",
  "choose_overworld_session_story",
  "get_observation",
  "list_legal_actions",
  "step_action",
]);

function nonNegativeInteger(value) {
  return Number.isInteger(value) && value >= 0;
}

function reject(reason) {
  return { ok: false, reason };
}

/**
 * Authenticate the useful subset of `codex exec --json` and fail closed on any
 * tool surface outside the runner-owned AdventureForge MCP server.
 */
export function inspectCodexPureEvents(rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return reject("Codex event stream is empty");
  }

  const threadRows = [];
  const turnStartedRows = [];
  const turnCompletedRows = [];
  let completedMcpCalls = 0;

  for (const row of rows) {
    if (row === null || typeof row !== "object" || Array.isArray(row)) {
      return reject("Codex event stream contains a non-object row");
    }
    if (!ALLOWED_EVENT_TYPES.has(row.type)) {
      return reject(`Codex event stream contains forbidden event type ${String(row.type)}`);
    }

    if (row.type === "thread.started") threadRows.push(row);
    if (row.type === "turn.started") turnStartedRows.push(row);
    if (row.type === "turn.completed") turnCompletedRows.push(row);

    if (row.type === "item.started" || row.type === "item.completed") {
      const item = row.item;
      if (item === null || typeof item !== "object" || Array.isArray(item)) {
        return reject("Codex item event is missing its item object");
      }
      if (!ALLOWED_ITEM_TYPES.has(item.type)) {
        return reject(`Codex pure run used forbidden item type ${String(item.type)}`);
      }
      if (item.type === "mcp_tool_call") {
        if (item.server !== "adventureforge") {
          return reject(`Codex pure run called forbidden MCP server ${String(item.server)}`);
        }
        if (typeof item.tool !== "string" || item.tool.length === 0) {
          return reject("Codex AdventureForge call is missing its tool name");
        }
        if (!CODEX_PURE_PLAYER_TOOLS.has(item.tool)) {
          return reject(`Codex pure run called forbidden AdventureForge tool ${item.tool}`);
        }
        if (row.type === "item.completed") completedMcpCalls += 1;
      }
    }
  }

  if (threadRows.length !== 1 || !THREAD_ID_RE.test(threadRows[0]?.thread_id ?? "")) {
    return reject("Codex pure run requires exactly one valid thread identity");
  }
  if (turnStartedRows.length !== 1 || turnCompletedRows.length !== 1) {
    return reject("Codex pure run requires exactly one started and completed turn");
  }
  if (rows.at(-1)?.type !== "turn.completed") {
    return reject("Codex pure run did not close with turn.completed");
  }

  const usage = turnCompletedRows[0]?.usage;
  if (
    usage === null ||
    typeof usage !== "object" ||
    Array.isArray(usage) ||
    !nonNegativeInteger(usage.input_tokens) ||
    !nonNegativeInteger(usage.cached_input_tokens) ||
    !nonNegativeInteger(usage.output_tokens)
  ) {
    return reject("Codex completed turn is missing valid token usage");
  }

  return {
    ok: true,
    threadId: threadRows[0].thread_id,
    completedMcpCalls,
    usage: {
      input_tokens: usage.input_tokens,
      cached_input_tokens: usage.cached_input_tokens,
      output_tokens: usage.output_tokens,
      reasoning_output_tokens: nonNegativeInteger(usage.reasoning_output_tokens)
        ? usage.reasoning_output_tokens
        : 0,
    },
  };
}

export function buildCodexPureEnvelope({ rows, report, model, durationMs }) {
  const inspected = inspectCodexPureEvents(rows);
  if (!inspected.ok) return inspected;
  if (typeof report !== "string" || report.trim().length === 0) {
    return reject("Codex pure run produced no final report");
  }
  if (typeof model !== "string" || model.trim().length === 0) {
    return reject("Codex pure run is missing its requested model");
  }
  if (!nonNegativeInteger(durationMs)) {
    return reject("Codex pure run is missing a valid duration");
  }

  const usage = {
    input_tokens: inspected.usage.input_tokens,
    cache_read_input_tokens: inspected.usage.cached_input_tokens,
    output_tokens: inspected.usage.output_tokens,
    reasoning_output_tokens: inspected.usage.reasoning_output_tokens,
  };
  return {
    ok: true,
    envelope: {
      type: "result",
      subtype: "success",
      provider: "codex",
      is_error: false,
      duration_ms: durationMs,
      num_turns: inspected.completedMcpCalls,
      result: report,
      session_id: inspected.threadId,
      requested_model: model,
      terminal_reason: "completed",
      usage,
      modelUsage: {
        [model]: {
          inputTokens: inspected.usage.input_tokens,
          cacheReadInputTokens: inspected.usage.cached_input_tokens,
          outputTokens: inspected.usage.output_tokens,
          reasoningOutputTokens: inspected.usage.reasoning_output_tokens,
        },
      },
    },
  };
}

function option(argv, name) {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
}

function parseEventRows(path) {
  return readFileSync(path, "utf8")
    .split(/\r?\n/u)
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line));
}

function main() {
  const argv = process.argv.slice(2);
  if (argv.includes("--print-tools-toml")) {
    process.stdout.write(`${JSON.stringify([...CODEX_PURE_PLAYER_TOOLS])}\n`);
    return;
  }
  const eventsPath = option(argv, "--events");
  const reportPath = option(argv, "--report");
  const model = option(argv, "--model");
  const startedAtMs = Number(option(argv, "--started-at-ms"));
  if (!eventsPath || !reportPath || !model || !nonNegativeInteger(startedAtMs)) {
    console.error(
      "Usage: codex-pure-envelope.mjs --events <jsonl> --report <md> --model <id> --started-at-ms <n>",
    );
    process.exit(2);
  }

  try {
    const result = buildCodexPureEnvelope({
      rows: parseEventRows(eventsPath),
      report: readFileSync(reportPath, "utf8"),
      model,
      durationMs: Math.max(0, Date.now() - startedAtMs),
    });
    if (!result.ok) {
      console.error(result.reason);
      process.exit(1);
    }
    process.stdout.write(`${JSON.stringify(result.envelope)}\n`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main();
}
