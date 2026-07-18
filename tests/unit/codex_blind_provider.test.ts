import { describe, expect, it } from "vitest";

// @ts-expect-error — plain .mjs module without type declarations
import * as codexProvider from "../../blind-tester/codex-pure-envelope.mjs";
import { PURE_PLAYER_TOOLS } from "../../src/mcp/server.js";

const { buildCodexPureEnvelope, CODEX_PURE_PLAYER_TOOLS, inspectCodexPureEvents } = codexProvider;

const THREAD_ID = "019f7250-1ed0-7102-be6c-4f1d5513d91e";

function validRows() {
  return [
    { type: "thread.started", thread_id: THREAD_ID },
    { type: "turn.started" },
    {
      type: "item.completed",
      item: { id: "item_0", type: "agent_message", text: "I will begin." },
    },
    {
      type: "item.started",
      item: {
        id: "item_1",
        type: "mcp_tool_call",
        server: "adventureforge",
        tool: "start_overworld",
      },
    },
    {
      type: "item.completed",
      item: {
        id: "item_1",
        type: "mcp_tool_call",
        server: "adventureforge",
        tool: "start_overworld",
      },
    },
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
      label: "duplicate thread",
      mutate: (rows: ReturnType<typeof validRows>) =>
        rows.splice(1, 0, { type: "thread.started", thread_id: THREAD_ID }),
      reason: /exactly one valid thread identity/i,
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
