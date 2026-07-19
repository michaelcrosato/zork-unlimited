import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { validateCodexFleetProviderAuthority } from "../../src/starting_slice/fleet_run_artifacts.js";

const SESSION = "019f7250-1ed0-7102-be6c-4f1d5513d91e";
const TURN = "119f7250-1ed0-7102-be6c-4f1d5513d91e";
const REPORT = "# Playthrough log\n\nDone.\n";

function jsonl(rows: unknown[]): string {
  return `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`;
}

function payload(rows: unknown[], index: number): Record<string, unknown> {
  return (rows[index] as { payload: Record<string, unknown> }).payload;
}

function finalOutput(rows: unknown[]): Record<string, unknown> {
  const content = payload(rows, 3).content as Record<string, unknown>[];
  return content[0]!;
}

function publicEvents(): unknown[] {
  const call = {
    id: "item_1",
    type: "mcp_tool_call",
    server: "adventureforge",
    tool: "start_overworld",
    arguments: {},
  };
  return [
    { type: "thread.started", thread_id: SESSION },
    { type: "turn.started" },
    {
      type: "item.started",
      item: { ...call, result: null, error: null, status: "in_progress" },
    },
    {
      type: "item.completed",
      item: {
        ...call,
        result: { content: [], structured_content: null },
        error: null,
        status: "completed",
      },
    },
    { type: "item.completed", item: { id: "item_2", type: "agent_message", text: REPORT } },
    {
      type: "turn.completed",
      usage: { input_tokens: 10, cached_input_tokens: 2, output_tokens: 3 },
    },
  ];
}

function rollout(): unknown[] {
  // Observed Codex CLI ordering: session, task start, turn context, final
  // assistant response, then task_complete as the terminal rollout row.
  return [
    {
      timestamp: "2026-07-19T00:00:00.000Z",
      type: "session_meta",
      payload: {
        id: SESSION,
        cwd: "C:\\private\\player",
        cli_version: "0.145.0",
        model_provider: "openai",
      },
    },
    {
      timestamp: "2026-07-19T00:00:00.0005Z",
      type: "event_msg",
      payload: { type: "task_started", turn_id: TURN },
    },
    {
      timestamp: "2026-07-19T00:00:00.001Z",
      type: "turn_context",
      payload: {
        turn_id: TURN,
        cwd: "C:\\private\\player",
        approval_policy: "never",
        sandbox_policy: { type: "read-only" },
        model: "gpt-5.3-codex-spark",
        effort: "xhigh",
      },
    },
    {
      timestamp: "2026-07-19T00:00:01.000Z",
      type: "response_item",
      payload: {
        type: "message",
        role: "assistant",
        content: [{ type: "output_text", text: REPORT }],
      },
    },
    {
      timestamp: "2026-07-19T00:00:01.001Z",
      type: "event_msg",
      payload: { type: "task_complete", turn_id: TURN, last_agent_message: REPORT },
    },
  ];
}

function captureReceipt(rows: unknown[]): string {
  const rolloutBody = jsonl(rows);
  const session = rows.find((row) => (row as { type?: string }).type === "session_meta") as {
    payload: { cwd: string };
  };
  const turn = rows.find((row) => (row as { type?: string }).type === "turn_context") as {
    payload: { cwd: string };
  };
  const cwd = session.payload.cwd;
  return `${JSON.stringify({
    schema_version: 1,
    binding: "runner_work_player",
    recorded_session_cwd: cwd,
    recorded_turn_cwd: turn.payload.cwd,
    canonical_expected_cwd: cwd,
    canonical_session_cwd: cwd,
    canonical_turn_cwd: cwd,
    expected_directory_identity: { device_id: "1", file_id: "2" },
    session_directory_identity: { device_id: "1", file_id: "2" },
    turn_directory_identity: { device_id: "1", file_id: "2" },
    copied_rollout_sha256: createHash("sha256").update(rolloutBody).digest("hex"),
  })}\n`;
}

describe("Codex certified fleet rollout authority", () => {
  it("binds one public thread to one rollout turn and exact final report", () => {
    const rows = rollout();
    expect(
      validateCodexFleetProviderAuthority({
        events: jsonl(publicEvents()),
        rollout: jsonl(rows),
        capture: captureReceipt(rows),
        model: "gpt-5.3-codex-spark",
        report: REPORT,
      }),
    ).toEqual({
      ok: true,
      facts: {
        sessionId: SESSION,
        actualModel: "gpt-5.3-codex-spark",
        turnId: TURN,
        cwd: "C:\\private\\player",
      },
    });
  });

  it.each([
    [
      "model substitution",
      (rows: unknown[]) => (payload(rows, 2).model = "gpt-5.6-sol"),
      /differs from planned/i,
    ],
    [
      "provider substitution",
      (rows: unknown[]) => (payload(rows, 0).model_provider = "anthropic"),
      /session_meta is malformed/i,
    ],
    [
      "session substitution",
      (rows: unknown[]) => (payload(rows, 0).id = "219f7250-1ed0-7102-be6c-4f1d5513d91e"),
      /differs from public/i,
    ],
    [
      "effort downgrade",
      (rows: unknown[]) => (payload(rows, 2).effort = "high"),
      /strict read-only xhigh/i,
    ],
    [
      "sandbox widening",
      (rows: unknown[]) => (payload(rows, 2).sandbox_policy = { type: "danger-full-access" }),
      /strict read-only xhigh/i,
    ],
    [
      "report substitution",
      (rows: unknown[]) => (finalOutput(rows).text = "other"),
      /rollout final assistant/i,
    ],
    [
      "multiple rollout turns",
      (rows: unknown[]) => rows.push(structuredClone(rows[2])),
      /exactly one turn_context/i,
    ],
    ["missing completion", (rows: unknown[]) => rows.pop(), /exactly one task_started/i],
    [
      "duplicate start",
      (rows: unknown[]) => rows.push(structuredClone(rows[1])),
      /exactly one task_started/i,
    ],
    [
      "lifecycle turn substitution",
      (rows: unknown[]) => (payload(rows, 4).turn_id = "419f7250-1ed0-7102-be6c-4f1d5513d91e"),
      /lifecycle turn id differs/i,
    ],
    [
      "completion report substitution",
      (rows: unknown[]) => (payload(rows, 4).last_agent_message = "other"),
      /task_complete message bytes/i,
    ],
    [
      "out of order lifecycle",
      (rows: unknown[]) => ([rows[1], rows[2]] = [rows[2], rows[1]]),
      /out of order/i,
    ],
    [
      "abort terminal history before apparent completion",
      (rows: unknown[]) =>
        rows.splice(rows.length - 1, 0, {
          type: "event_msg",
          payload: { type: "turn_aborted", turn_id: TURN, reason: "interrupted" },
        }),
      /forbidden abort\/error lifecycle/i,
    ],
    [
      "an error terminal row after apparent completion",
      (rows: unknown[]) => rows.push({ type: "error", message: "late stream failure" }),
      /forbidden abort\/error lifecycle/i,
    ],
    [
      "nonterminal history after task_complete",
      (rows: unknown[]) => rows.push({ type: "response_item", payload: { type: "reasoning" } }),
      /task_complete must be the final rollout row/i,
    ],
    [
      "repository cwd",
      (rows: unknown[]) => {
        payload(rows, 0).cwd = process.cwd();
        payload(rows, 2).cwd = process.cwd();
      },
      /isolated player directory/i,
    ],
  ])("rejects $0", (_label, mutate, reason) => {
    const rows = rollout();
    mutate(rows);
    expect(
      validateCodexFleetProviderAuthority({
        events: jsonl(publicEvents()),
        rollout: jsonl(rows),
        capture: captureReceipt(rows),
        model: "gpt-5.3-codex-spark",
        report: REPORT,
      }),
    ).toEqual({ ok: false, reason: expect.stringMatching(reason) });
  });

  it.each([
    [
      "a copied-rollout hash substitution",
      (receipt: Record<string, unknown>) => (receipt.copied_rollout_sha256 = "0".repeat(64)),
      /rollout hash differs/i,
    ],
    [
      "a canonical cwd substitution",
      (receipt: Record<string, unknown>) => (receipt.canonical_turn_cwd = "C:\\other\\player"),
      /one canonical isolated player cwd/i,
    ],
    [
      "a filesystem identity substitution",
      (receipt: Record<string, unknown>) =>
        (receipt.turn_directory_identity = { device_id: "1", file_id: "99" }),
      /directory identities differ/i,
    ],
    [
      "an unrecognized capture field",
      (receipt: Record<string, unknown>) => (receipt.untrusted = true),
      /exact runner-work-player proof/i,
    ],
  ])("rejects $0", (_label, mutate, reason) => {
    const rows = rollout();
    const receipt = JSON.parse(captureReceipt(rows)) as Record<string, unknown>;
    mutate(receipt);
    expect(
      validateCodexFleetProviderAuthority({
        events: jsonl(publicEvents()),
        rollout: jsonl(rows),
        capture: `${JSON.stringify(receipt)}\n`,
        model: "gpt-5.3-codex-spark",
        report: REPORT,
      }),
    ).toEqual({ ok: false, reason: expect.stringMatching(reason) });
  });
});
