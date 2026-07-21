#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const THREAD_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const ALLOWED_EVENT_TYPES = new Set([
  "thread.started",
  "turn.started",
  "item.started",
  "item.updated",
  "item.completed",
  "turn.completed",
]);
const ALLOWED_ITEM_TYPES = new Set(["agent_message", "reasoning", "mcp_tool_call", "todo_list"]);
const RESOURCE_PROBE_METHODS = new Map([
  ["list_mcp_resources", "resources/list"],
  ["list_mcp_resource_templates", "resources/templates/list"],
  ["read_mcp_resource", "resources/read"],
]);
const MAX_TODO_ITEMS = 3;
const MAX_TODO_TEXT_LENGTH = 160;
const MAX_TODO_UPDATES = 4;
const MAX_ITEM_ID_LENGTH = 128;
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
  "inspect_overworld_session_story",
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

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function sameJsonValue(left, right) {
  if (left === right) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((entry, index) => sameJsonValue(entry, right[index]))
    );
  }
  if (!isRecord(left) || !isRecord(right)) return false;
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every((key, index) => key === rightKeys[index] && sameJsonValue(left[key], right[key]))
  );
}

function hasOnlyKeys(record, expected) {
  const keys = Object.keys(record).sort();
  const sortedExpected = [...expected].sort();
  return (
    keys.length === sortedExpected.length &&
    keys.every((key, index) => key === sortedExpected[index])
  );
}

function validItemId(value) {
  return typeof value === "string" && value.length > 0 && value.length <= MAX_ITEM_ID_LENGTH;
}

function validTodoItems(items) {
  return (
    Array.isArray(items) &&
    items.length > 0 &&
    items.length <= MAX_TODO_ITEMS &&
    items.every(
      (entry) =>
        isRecord(entry) &&
        hasOnlyKeys(entry, ["text", "completed"]) &&
        typeof entry.text === "string" &&
        entry.text.length > 0 &&
        entry.text.length <= MAX_TODO_TEXT_LENGTH &&
        typeof entry.completed === "boolean",
    )
  );
}

function todoLifecycleMayAdvance(started, completed) {
  return (
    started.length === completed.length &&
    started.every(
      (entry, index) =>
        entry.text === completed[index]?.text &&
        (!entry.completed || completed[index]?.completed === true),
    )
  );
}

function validResourceProbeArguments(tool, arguments_) {
  if (!isRecord(arguments_)) return false;
  if (tool === "list_mcp_resources") {
    return (
      arguments_.server === "adventureforge" &&
      (hasOnlyKeys(arguments_, ["server"]) ||
        (hasOnlyKeys(arguments_, ["cursor", "server"]) && arguments_.cursor === ""))
    );
  }
  if (tool === "list_mcp_resource_templates") {
    return hasOnlyKeys(arguments_, ["server"]) && arguments_.server === "adventureforge";
  }
  if (tool === "read_mcp_resource") {
    const prefix = "functions.mcp__adventureforge__";
    const toolName = typeof arguments_.uri === "string" ? arguments_.uri.slice(prefix.length) : "";
    return (
      hasOnlyKeys(arguments_, ["server", "uri"]) &&
      arguments_.server === "adventureforge" &&
      typeof arguments_.uri === "string" &&
      arguments_.uri.startsWith(prefix) &&
      CODEX_PURE_PLAYER_TOOLS.has(toolName)
    );
  }
  return false;
}

function expectedResourceProbeError(tool, arguments_) {
  const method = RESOURCE_PROBE_METHODS.get(tool);
  const target =
    tool === "read_mcp_resource" ? `\`adventureforge\` (${arguments_.uri})` : "`adventureforge`";
  return `${method} failed: ${method} failed for ${target}: Mcp error: -32601: Method not found`;
}

function validResourceProbeStart(item) {
  return (
    isRecord(item) &&
    hasOnlyKeys(item, ["id", "type", "server", "tool", "arguments", "result", "error", "status"]) &&
    validItemId(item.id) &&
    item.type === "mcp_tool_call" &&
    item.server === "adventureforge" &&
    validResourceProbeArguments(item.tool, item.arguments) &&
    item.status === "in_progress" &&
    item.result === null &&
    item.error === null
  );
}

function validMcpResult(value) {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, ["content", "structured_content"]) &&
    Array.isArray(value.content) &&
    (value.structured_content === null || isRecord(value.structured_content))
  );
}

function validMcpError(value) {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, ["message"]) &&
    typeof value.message === "string" &&
    value.message.length > 0
  );
}

function validGameplayCallStart(item) {
  return (
    isRecord(item) &&
    hasOnlyKeys(item, ["id", "type", "server", "tool", "arguments", "result", "error", "status"]) &&
    validItemId(item.id) &&
    item.type === "mcp_tool_call" &&
    item.server === "adventureforge" &&
    typeof item.tool === "string" &&
    CODEX_PURE_PLAYER_TOOLS.has(item.tool) &&
    isRecord(item.arguments) &&
    item.status === "in_progress" &&
    item.result === null &&
    item.error === null
  );
}

function validGameplayCallCompletion(item, started) {
  if (
    !isRecord(item) ||
    !hasOnlyKeys(item, [
      "id",
      "type",
      "server",
      "tool",
      "arguments",
      "result",
      "error",
      "status",
    ]) ||
    !validItemId(item.id) ||
    item.type !== "mcp_tool_call" ||
    item.id !== started.id ||
    item.server !== started.server ||
    item.tool !== started.tool ||
    !sameJsonValue(item.arguments, started.arguments)
  ) {
    return false;
  }
  if (item.status === "completed") {
    return validMcpResult(item.result) && item.error === null;
  }
  if (item.status === "failed") {
    return (
      (validMcpResult(item.result) && item.error === null) ||
      (item.result === null && validMcpError(item.error))
    );
  }
  return false;
}

function validResourceProbeCompletion(item, started) {
  return (
    validResourceProbeStart({ ...item, status: "in_progress", error: null }) &&
    item.status === "failed" &&
    item.result === null &&
    isRecord(item.error) &&
    hasOnlyKeys(item.error, ["message"]) &&
    item.error.message === expectedResourceProbeError(item.tool, started.arguments) &&
    item.id === started.id &&
    item.server === started.server &&
    item.tool === started.tool &&
    sameJsonValue(item.arguments, started.arguments)
  );
}

/**
 * Authenticate the useful subset of `codex exec --json` and fail closed on any
 * tool surface outside the runner-owned AdventureForge MCP server.
 */
export function inspectCodexPureEvents(rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return reject("Codex event stream is empty");
  }

  if (rows[0]?.type !== "thread.started" || rows[1]?.type !== "turn.started") {
    return reject("Codex pure run must begin with thread.started then turn.started");
  }

  const threadRows = [];
  const turnStartedRows = [];
  const turnCompletedRows = [];
  let completedMcpCalls = 0;
  let gameplayCallsStarted = 0;
  let freshStartCompleted = false;
  const resourceProbes = new Map();
  const gameplayCalls = new Map();
  const mcpCallIds = new Set();
  let todoLifecycle = null;

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

    if (
      row.type === "item.started" ||
      row.type === "item.updated" ||
      row.type === "item.completed"
    ) {
      const item = row.item;
      if (item === null || typeof item !== "object" || Array.isArray(item)) {
        return reject("Codex item event is missing its item object");
      }
      if (!ALLOWED_ITEM_TYPES.has(item.type)) {
        return reject(`Codex pure run used forbidden item type ${String(item.type)}`);
      }
      if (row.type === "item.updated" && item.type !== "todo_list") {
        return reject(`Codex pure run used an unexpected item.updated lifecycle for ${item.type}`);
      }
      if (item.type === "todo_list") {
        if (!isRecord(item) || !hasOnlyKeys(item, ["id", "type", "items"])) {
          return reject("Codex pure run used a malformed todo_list item");
        }
        if (!validItemId(item.id) || !validTodoItems(item.items)) {
          return reject("Codex pure run used an invalid todo_list lifecycle");
        }
        if (row.type === "item.started") {
          if (todoLifecycle !== null) {
            return reject("Codex pure run used more than one todo_list lifecycle");
          }
          todoLifecycle = { id: item.id, items: item.items, updates: 0 };
        } else if (row.type === "item.updated") {
          if (
            todoLifecycle === null ||
            todoLifecycle.completed === true ||
            todoLifecycle.id !== item.id ||
            todoLifecycle.updates >= MAX_TODO_UPDATES ||
            !todoLifecycleMayAdvance(todoLifecycle.items, item.items)
          ) {
            return reject("Codex pure run used an invalid todo_list update");
          }
          todoLifecycle = {
            ...todoLifecycle,
            items: item.items,
            updates: todoLifecycle.updates + 1,
          };
        } else {
          if (
            todoLifecycle === null ||
            todoLifecycle.completed === true ||
            todoLifecycle.id !== item.id ||
            !todoLifecycleMayAdvance(todoLifecycle.items, item.items)
          ) {
            return reject("Codex pure run used an unpaired or mismatched todo_list lifecycle");
          }
          todoLifecycle = { ...todoLifecycle, completed: true };
        }
      }
      if (row.type === "item.updated") continue;
      if (item.type === "mcp_tool_call") {
        if (RESOURCE_PROBE_METHODS.has(item.tool)) {
          if (row.type === "item.started") {
            if (
              !validResourceProbeStart(item) ||
              gameplayCallsStarted !== 0 ||
              resourceProbes.has(item.tool) ||
              mcpCallIds.has(item.id)
            ) {
              return reject(
                `Codex pure run used an invalid or duplicate resource probe ${item.tool}`,
              );
            }
            mcpCallIds.add(item.id);
            resourceProbes.set(item.tool, item);
          } else {
            const started = resourceProbes.get(item.tool);
            if (
              gameplayCallsStarted !== 0 ||
              !started ||
              started.completed === true ||
              !validResourceProbeCompletion(item, started)
            ) {
              return reject(
                `Codex pure run used an unpaired or invalid resource probe ${item.tool}`,
              );
            }
            resourceProbes.set(item.tool, { ...started, completed: true });
          }
          continue;
        }
        if (row.type === "item.started") {
          if (item.server !== "adventureforge") {
            return reject(`Codex pure run called forbidden MCP server ${String(item.server)}`);
          }
          if (typeof item.tool !== "string" || item.tool.length === 0) {
            return reject("Codex AdventureForge call is missing its tool name");
          }
          if (!CODEX_PURE_PLAYER_TOOLS.has(item.tool)) {
            return reject(`Codex pure run called forbidden AdventureForge tool ${item.tool}`);
          }
          if (!validGameplayCallStart(item) || mcpCallIds.has(item.id)) {
            return reject(`Codex pure run used an invalid or duplicate gameplay call ${item.tool}`);
          }
          if (gameplayCallsStarted === 0) {
            if (item.tool !== "start_overworld" || !sameJsonValue(item.arguments, {})) {
              return reject(
                "Codex pure run must begin gameplay with start_overworld and no arguments",
              );
            }
          } else if (!freshStartCompleted) {
            return reject("Codex pure run used gameplay before a successful fresh start completed");
          }
          gameplayCallsStarted += 1;
          mcpCallIds.add(item.id);
          gameplayCalls.set(item.id, item);
        } else {
          const started = gameplayCalls.get(item.id);
          if (
            !started ||
            started.completed === true ||
            !validGameplayCallCompletion(item, started)
          ) {
            return reject(
              `Codex pure run used an unpaired or invalid gameplay completion ${String(item.tool)}`,
            );
          }
          if (gameplayCallsStarted === 1 && started.tool === "start_overworld") {
            if (item.status !== "completed") {
              return reject("Codex pure run did not complete its first fresh start successfully");
            }
            freshStartCompleted = true;
          } else if (!freshStartCompleted) {
            return reject("Codex pure run completed gameplay before a successful fresh start");
          }
          gameplayCalls.set(item.id, { ...started, completed: true });
          completedMcpCalls += 1;
        }
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
  if (!freshStartCompleted) {
    return reject("Codex pure run did not complete one successful fresh start");
  }
  for (const [tool, probe] of resourceProbes) {
    if (probe.completed !== true) {
      return reject(`Codex pure run used an unpaired resource probe ${tool}`);
    }
  }
  for (const [id, call] of gameplayCalls) {
    if (call.completed !== true) {
      return reject(`Codex pure run used an unpaired gameplay call ${id}`);
    }
  }
  if (todoLifecycle !== null && todoLifecycle.completed !== true) {
    return reject("Codex pure run used an unpaired todo_list lifecycle");
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
