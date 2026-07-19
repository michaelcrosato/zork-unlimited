import { describe, expect, it } from "vitest";

// @ts-expect-error — plain .mjs module without type declarations
import * as codexProvider from "../../blind-tester/codex-pure-envelope.mjs";
import { PURE_PLAYER_TOOLS } from "../../src/mcp/server.js";

const { buildCodexPureEnvelope, CODEX_PURE_PLAYER_TOOLS, inspectCodexPureEvents } = codexProvider;

const THREAD_ID = "019f7250-1ed0-7102-be6c-4f1d5513d91e";

type TestItem = {
  id: string;
  type: string;
  text?: string;
  server?: string;
  tool?: string;
  arguments?: Record<string, unknown>;
  result?: unknown;
  error?: unknown;
  status?: string;
};

type TestRow = {
  type: string;
  thread_id?: string;
  item?: TestItem;
  usage?: {
    input_tokens: number;
    cached_input_tokens: number;
    output_tokens: number;
    reasoning_output_tokens: number;
  };
};

function gameplayCallRows(
  id = "item_1",
  tool = "start_overworld",
  arguments_: Record<string, unknown> = {},
): TestRow[] {
  const common = {
    id,
    type: "mcp_tool_call",
    server: "adventureforge",
    tool,
    arguments: arguments_,
  };
  return [
    {
      type: "item.started",
      item: { ...common, result: null, error: null, status: "in_progress" },
    },
    {
      type: "item.completed",
      item: {
        ...common,
        result: { content: [], structured_content: null },
        error: null,
        status: "completed",
      },
    },
  ];
}

function validRows(): TestRow[] {
  return [
    { type: "thread.started", thread_id: THREAD_ID },
    { type: "turn.started" },
    {
      type: "item.completed",
      item: { id: "item_0", type: "agent_message", text: "I will begin." },
    },
    ...gameplayCallRows(),
    {
      type: "turn.completed",
      usage: {
        input_tokens: 120,
        cached_input_tokens: 80,
        output_tokens: 40,
        reasoning_output_tokens: 10,
      },
    },
  ];
}

function resourceProbeRows(
  tool:
    | "list_mcp_resources"
    | "list_mcp_resource_templates"
    | "read_mcp_resource" = "list_mcp_resources",
) {
  const method =
    tool === "list_mcp_resources"
      ? "resources/list"
      : tool === "list_mcp_resource_templates"
        ? "resources/templates/list"
        : "resources/read";
  const argumentsByTool = {
    list_mcp_resources: { cursor: "", server: "adventureforge" },
    list_mcp_resource_templates: { server: "adventureforge" },
    read_mcp_resource: {
      server: "adventureforge",
      uri: "functions.mcp__adventureforge__choose_overworld_session_story",
    },
  };
  const item = {
    id: `probe-${tool}`,
    type: "mcp_tool_call",
    server: "adventureforge",
    tool,
    arguments: argumentsByTool[tool],
  };
  const target =
    tool === "read_mcp_resource"
      ? "`adventureforge` (functions.mcp__adventureforge__choose_overworld_session_story)"
      : "`adventureforge`";
  return [
    {
      type: "item.started",
      item: { ...item, result: null, error: null, status: "in_progress" },
    },
    {
      type: "item.completed",
      item: {
        ...item,
        result: null,
        error: {
          message: `${method} failed: ${method} failed for ${target}: Mcp error: -32601: Method not found`,
        },
        status: "failed",
      },
    },
  ] as const;
}

function todoLifecycleRows() {
  const firstItem = { text: "Start fresh overworld session", completed: false };
  const secondItem = { text: "Play naturally", completed: false };
  return [
    {
      type: "item.started",
      item: { id: "todo-1", type: "todo_list", items: [firstItem, secondItem] },
    },
    {
      type: "item.completed",
      item: {
        id: "todo-1",
        type: "todo_list",
        items: [{ ...firstItem, completed: true }, secondItem],
      },
    },
  ] as const;
}

function todoUpdateRow() {
  return {
    type: "item.updated",
    item: {
      id: "todo-1",
      type: "todo_list",
      items: [
        { text: "Start fresh overworld session", completed: true },
        { text: "Play naturally", completed: false },
      ],
    },
  };
}

function insertBeforeGameplay(rows: ReturnType<typeof validRows>, entries: readonly object[]) {
  const firstGameplay = rows.findIndex(
    (row) => row.type === "item.started" && row.item?.type === "mcp_tool_call",
  );
  rows.splice(firstGameplay, 0, ...(entries as (typeof rows)[number][]));
  return rows;
}

describe("Codex pure blind provider envelope", () => {
  it("keeps its transport allowlist exactly aligned with the pure MCP server", () => {
    expect(CODEX_PURE_PLAYER_TOOLS).toEqual(PURE_PLAYER_TOOLS);
  });

  it("accepts one completed AdventureForge-only thread and normalizes telemetry", () => {
    expect(inspectCodexPureEvents(validRows())).toEqual({
      ok: true,
      threadId: THREAD_ID,
      completedMcpCalls: 1,
      usage: {
        input_tokens: 120,
        cached_input_tokens: 80,
        output_tokens: 40,
        reasoning_output_tokens: 10,
      },
    });

    const built = buildCodexPureEnvelope({
      rows: validRows(),
      report: "# Playthrough log\n\n# Verdict\n\n```json exit-interview\n{}\n```\n",
      model: "gpt-5.6-sol",
      durationMs: 1234,
    });
    expect(built).toMatchObject({
      ok: true,
      envelope: {
        provider: "codex",
        is_error: false,
        duration_ms: 1234,
        num_turns: 1,
        session_id: THREAD_ID,
        requested_model: "gpt-5.6-sol",
        terminal_reason: "completed",
        usage: {
          input_tokens: 120,
          cache_read_input_tokens: 80,
          output_tokens: 40,
          reasoning_output_tokens: 10,
        },
      },
    });
  });

  it("accepts only paired inert built-in resource failures and excludes them from gameplay", () => {
    const rows = insertBeforeGameplay(validRows(), [
      ...resourceProbeRows("list_mcp_resources"),
      ...resourceProbeRows("list_mcp_resource_templates"),
      ...resourceProbeRows("read_mcp_resource"),
    ]);

    expect(inspectCodexPureEvents(rows)).toMatchObject({ ok: true, completedMcpCalls: 1 });
  });

  it("accepts one paired in-memory todo lifecycle and excludes it from gameplay", () => {
    const todo = todoLifecycleRows();
    const rows = insertBeforeGameplay(validRows(), [todo[0], todoUpdateRow(), todo[1]]);

    expect(inspectCodexPureEvents(rows)).toMatchObject({ ok: true, completedMcpCalls: 1 });
  });

  it.each([
    {
      label: "a successful resource probe",
      mutate: (rows: ReturnType<typeof validRows>) => {
        const completed = resourceProbeRows()[1] as { item: Record<string, unknown> };
        completed.item.status = "completed";
        completed.item.result = { content: [] };
        insertBeforeGameplay(rows, [resourceProbeRows()[0], completed]);
      },
      reason: /unpaired or invalid resource probe list_mcp_resources/i,
    },
    {
      label: "a resource probe with content despite failure",
      mutate: (rows: ReturnType<typeof validRows>) => {
        const probe = resourceProbeRows();
        (probe[1] as { item: Record<string, unknown> }).item.result = { content: [] };
        insertBeforeGameplay(rows, probe);
      },
      reason: /unpaired or invalid resource probe list_mcp_resources/i,
    },
    {
      label: "a resource probe on another server",
      mutate: (rows: ReturnType<typeof validRows>) => {
        const probe = resourceProbeRows();
        (probe[0] as { item: Record<string, unknown> }).item.server = "filesystem";
        insertBeforeGameplay(rows, probe);
      },
      reason: /invalid or duplicate resource probe list_mcp_resources/i,
    },
    {
      label: "an unpaired resource probe",
      mutate: (rows: ReturnType<typeof validRows>) =>
        insertBeforeGameplay(rows, [resourceProbeRows()[0]]),
      reason: /unpaired resource probe list_mcp_resources/i,
    },
    {
      label: "a duplicate resource probe",
      mutate: (rows: ReturnType<typeof validRows>) => {
        const first = resourceProbeRows();
        const duplicate = resourceProbeRows();
        (duplicate[0] as { item: Record<string, unknown> }).item.id = "probe-duplicate";
        (duplicate[1] as { item: Record<string, unknown> }).item.id = "probe-duplicate";
        insertBeforeGameplay(rows, [...first, ...duplicate]);
      },
      reason: /invalid or duplicate resource probe list_mcp_resources/i,
    },
    {
      label: "a mismatched resource probe completion",
      mutate: (rows: ReturnType<typeof validRows>) => {
        const probe = resourceProbeRows();
        (probe[1] as { item: { arguments: { cursor: string; server: string } } }).item.arguments = {
          cursor: "later",
          server: "adventureforge",
        };
        insertBeforeGameplay(rows, probe);
      },
      reason: /unpaired or invalid resource probe list_mcp_resources/i,
    },
    {
      label: "a resource probe with a non-method-not-found error",
      mutate: (rows: ReturnType<typeof validRows>) => {
        const probe = resourceProbeRows();
        (probe[1] as { item: { error: { message: string } } }).item.error.message =
          "network failed";
        insertBeforeGameplay(rows, probe);
      },
      reason: /unpaired or invalid resource probe list_mcp_resources/i,
    },
    {
      label: "a second todo lifecycle",
      mutate: (rows: ReturnType<typeof validRows>) => {
        const another = todoLifecycleRows().map((entry) => ({
          ...entry,
          item: { ...entry.item, id: "todo-2" },
        }));
        insertBeforeGameplay(rows, [...todoLifecycleRows(), ...another]);
      },
      reason: /more than one todo_list lifecycle/i,
    },
    {
      label: "a todo completion before its start",
      mutate: (rows: ReturnType<typeof validRows>) => {
        const todo = todoLifecycleRows();
        insertBeforeGameplay(rows, [todo[1], todo[0]]);
      },
      reason: /unpaired or mismatched todo_list lifecycle/i,
    },
    {
      label: "too many todo updates",
      mutate: (rows: ReturnType<typeof validRows>) => {
        const todo = todoLifecycleRows();
        insertBeforeGameplay(rows, [
          todo[0],
          todoUpdateRow(),
          todoUpdateRow(),
          todoUpdateRow(),
          todoUpdateRow(),
          todoUpdateRow(),
          todo[1],
        ]);
      },
      reason: /invalid todo_list update/i,
    },
    {
      label: "an oversized todo list",
      mutate: (rows: ReturnType<typeof validRows>) => {
        const todo = todoLifecycleRows();
        (
          todo[0] as unknown as {
            item: { items: Array<{ text: string; completed: boolean }> };
          }
        ).item.items = [
          { text: "one", completed: false },
          { text: "two", completed: false },
          { text: "three", completed: false },
          { text: "four", completed: false },
        ];
        insertBeforeGameplay(rows, todo);
      },
      reason: /invalid todo_list lifecycle/i,
    },
    {
      label: "an oversized todo text payload",
      mutate: (rows: ReturnType<typeof validRows>) => {
        const todo = todoLifecycleRows();
        (
          todo[0] as unknown as {
            item: { items: Array<{ text: string; completed: boolean }> };
          }
        ).item.items = [{ text: "x".repeat(161), completed: false }];
        insertBeforeGameplay(rows, todo);
      },
      reason: /invalid todo_list lifecycle/i,
    },
    {
      label: "a resource read outside the AdventureForge player surface",
      mutate: (rows: ReturnType<typeof validRows>) => {
        const probe = resourceProbeRows("read_mcp_resource");
        (probe[0] as { item: { arguments: { server: string; uri: string } } }).item.arguments = {
          server: "adventureforge",
          uri: "resource://outside-the-game",
        };
        insertBeforeGameplay(rows, probe);
      },
      reason: /invalid or duplicate resource probe read_mcp_resource/i,
    },
    {
      label: "a todo item with an external-looking field",
      mutate: (rows: ReturnType<typeof validRows>) => {
        const todo = todoLifecycleRows();
        (todo[0] as { item: Record<string, unknown> }).item.command = "dir";
        insertBeforeGameplay(rows, todo);
      },
      reason: /malformed todo_list item/i,
    },
    {
      label: "an oversized todo lifecycle id",
      mutate: (rows: ReturnType<typeof validRows>) => {
        const todo = todoLifecycleRows();
        const oversizedId = "x".repeat(129);
        for (const row of todo) {
          (row as unknown as { item: { id: string } }).item.id = oversizedId;
        }
        insertBeforeGameplay(rows, todo);
      },
      reason: /invalid todo_list lifecycle/i,
    },
  ])("rejects $label", ({ mutate, reason }) => {
    const rows = validRows();
    mutate(rows);
    expect(inspectCodexPureEvents(rows)).toEqual({
      ok: false,
      reason: expect.stringMatching(reason),
    });
  });

  it.each([
    {
      label: "unknown top-level event",
      mutate: (rows: ReturnType<typeof validRows>) =>
        rows.splice(-1, 0, { type: "error" } as (typeof rows)[number]),
      reason: /forbidden event type error/i,
    },
    {
      label: "shell command",
      mutate: (rows: ReturnType<typeof validRows>) =>
        rows.splice(-1, 0, {
          type: "item.completed",
          item: { id: "shell", type: "command_execution" },
        } as (typeof rows)[number]),
      reason: /forbidden item type command_execution/i,
    },
    {
      label: "file change",
      mutate: (rows: ReturnType<typeof validRows>) =>
        rows.splice(-1, 0, {
          type: "item.completed",
          item: { id: "file", type: "file_change" },
        } as (typeof rows)[number]),
      reason: /forbidden item type file_change/i,
    },
    {
      label: "web search",
      mutate: (rows: ReturnType<typeof validRows>) =>
        rows.splice(-1, 0, {
          type: "item.completed",
          item: { id: "web", type: "web_search" },
        } as (typeof rows)[number]),
      reason: /forbidden item type web_search/i,
    },
    {
      label: "wrong MCP server",
      mutate: (rows: ReturnType<typeof validRows>) => {
        const call = rows.find((row) => row.item?.type === "mcp_tool_call");
        if (call?.item) call.item.server = "filesystem";
      },
      reason: /forbidden MCP server filesystem/i,
    },
    {
      label: "structural AdventureForge tool",
      mutate: (rows: ReturnType<typeof validRows>) => {
        const call = rows.find((row) => row.item?.type === "mcp_tool_call");
        if (call?.item) call.item.tool = "start_world_quest";
      },
      reason: /forbidden AdventureForge tool start_world_quest/i,
    },
    {
      label: "gameplay before fresh start",
      mutate: (rows: ReturnType<typeof validRows>) => {
        const call = rows.find((row) => row.item?.type === "mcp_tool_call");
        if (call?.item) call.item.tool = "get_overworld_session_context";
      },
      reason: /must begin gameplay with start_overworld/i,
    },
    {
      label: "a completed-only fresh start",
      mutate: (rows: ReturnType<typeof validRows>) => {
        const started = rows.findIndex(
          (row) => row.type === "item.started" && row.item?.id === "item_1",
        );
        rows.splice(started, 1);
      },
      reason: /unpaired or invalid gameplay completion start_overworld/i,
    },
    {
      label: "a mismatched gameplay completion",
      mutate: (rows: ReturnType<typeof validRows>) => {
        const completed = rows.find(
          (row) => row.type === "item.completed" && row.item?.id === "item_1",
        );
        if (completed?.item) completed.item.tool = "get_overworld_session_context";
      },
      reason: /unpaired or invalid gameplay completion get_overworld_session_context/i,
    },
    {
      label: "gameplay before thread and turn startup",
      mutate: (rows: ReturnType<typeof validRows>) => {
        const gameplay = rows.splice(3, 2);
        rows.unshift(...gameplay);
      },
      reason: /must begin with thread\.started then turn\.started/i,
    },
    {
      label: "fresh start arguments",
      mutate: (rows: ReturnType<typeof validRows>) => {
        for (const row of rows) {
          if (row.item?.id === "item_1") row.item.arguments = { invented: true };
        }
      },
      reason: /must begin gameplay with start_overworld and no arguments/i,
    },
    {
      label: "a failed first fresh start",
      mutate: (rows: ReturnType<typeof validRows>) => {
        const completed = rows.find(
          (row) => row.type === "item.completed" && row.item?.id === "item_1",
        );
        if (completed?.item) completed.item.status = "failed";
      },
      reason: /did not complete its first fresh start successfully/i,
    },
    {
      label: "a duplicate gameplay call id",
      mutate: (rows: ReturnType<typeof validRows>) => {
        rows.splice(-1, 0, ...gameplayCallRows("item_1", "get_overworld_session_context", {}));
      },
      reason: /invalid or duplicate gameplay call get_overworld_session_context/i,
    },
    {
      label: "an unpaired gameplay start",
      mutate: (rows: ReturnType<typeof validRows>) => {
        rows.splice(-1, 0, gameplayCallRows("item_2", "get_overworld_session_context", {})[0]!);
      },
      reason: /unpaired gameplay call item_2/i,
    },
    {
      label: "duplicate thread",
      mutate: (rows: ReturnType<typeof validRows>) =>
        rows.splice(1, 0, { type: "thread.started", thread_id: THREAD_ID }),
      reason:
        /must begin with thread\.started then turn\.started|exactly one valid thread identity/i,
    },
    {
      label: "incomplete turn",
      mutate: (rows: ReturnType<typeof validRows>) => rows.pop(),
      reason: /exactly one started and completed turn/i,
    },
  ])("rejects $label", ({ mutate, reason }) => {
    const rows = validRows();
    mutate(rows);
    expect(inspectCodexPureEvents(rows)).toEqual({
      ok: false,
      reason: expect.stringMatching(reason),
    });
  });

  it("rejects missing reports and malformed usage", () => {
    expect(
      buildCodexPureEnvelope({
        rows: validRows(),
        report: "",
        model: "gpt-5.6-sol",
        durationMs: 1,
      }),
    ).toEqual({ ok: false, reason: "Codex pure run produced no final report" });

    const rows = validRows();
    const completed = rows.at(-1);
    if (completed?.usage) completed.usage.output_tokens = -1;
    expect(inspectCodexPureEvents(rows)).toEqual({
      ok: false,
      reason: "Codex completed turn is missing valid token usage",
    });
  });
});
