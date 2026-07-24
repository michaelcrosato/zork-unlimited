import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { bindPureCodexReceipt } from "../../src/blind/receipt_binding.js";
import { parseRunEvidenceJsonl } from "../../src/blind/run_evidence.js";
import { hashState } from "../../src/core/hash.js";
import {
  validateCodexFleetProviderAuthority,
  validatePureFleetRunArtifactBytes,
} from "../../src/starting_slice/fleet_run_artifacts.js";
import {
  INITIAL_JOURNEY_GOAL,
  JOURNEY_CONTRACT_VERSION,
} from "../../src/world/journey_contract.js";

const SESSION = "019f7250-1ed0-7102-be6c-4f1d5513d91e";
const TURN = "119f7250-1ed0-7102-be6c-4f1d5513d91e";
const REPORT = "# Playthrough log\n\nDone.\n";
const PERMISSIONS_BLOCK = "<permissions instructions>read-only player</permissions instructions>";
const SKILLS_BLOCK = "<skills_instructions>player skills</skills_instructions>";
const V2_TEAM_BLOCK =
  "You are `/root`, the primary agent in a team of agents collaborating to fulfill the user's goals.";
const V2_MODE_BLOCK =
  "<multi_agent_mode>Only explicit requests permit delegation.</multi_agent_mode>";
const ENVIRONMENT_BLOCK = "<environment_context>isolated player</environment_context>";
const GLOBAL_AGENTS_BLOCK =
  "# AGENTS.md instructions\n\n" +
  "<INSTRUCTIONS>\n" +
  "# Global Codex Guidance\n\n" +
  "- Read the repository's own instructions, scripts, and existing patterns before changing code.\n" +
  "- Prefer the repo-local toolchain and package manager over global installs.\n" +
  "- Use `rg`/`rg --files` for code search when available.\n" +
  "- Check the worktree before editing, and do not overwrite unrelated user changes.\n" +
  "- Keep changes scoped to the requested task unless a broader fix is necessary.\n" +
  "- Run the most relevant tests, type checks, linters, builds, or browser smoke checks before finishing when the repo provides them.\n" +
  "- Do not print, commit, or move secrets. Use local env files such as `.env.local` only when a task explicitly needs credentials.\n" +
  "- For web apps, start the dev server and verify the local page when the app needs a server to run.\n" +
  "</INSTRUCTIONS>";
const CODEX_EXEC_YIELD_PRAGMA = '// @exec: {"yield_time_ms": 120000}';
const HISTORICAL_STRICT_CODE_MODE_CONTRACT = "strict-code-mode-v1";
const STRICT_CODE_MODE_CONTRACT = "strict-code-mode-v2";
const CODE_MODE_WARNING_PREFIX =
  "Under-development features enabled: code_mode_only. Under-development features are incomplete and may behave unpredictably. To suppress this warning, set `suppress_unstable_features_warning = true` in ";

function jsonl(rows: unknown[]): string {
  return `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`;
}

function payload(rows: unknown[], index: number): Record<string, unknown> {
  return (rows[index] as { payload: Record<string, unknown> }).payload;
}

function finalOutput(rows: unknown[]): Record<string, unknown> {
  const message = rows.find(
    (row) =>
      (row as { type?: string; payload?: { type?: string; role?: string } }).type ===
        "response_item" &&
      (row as { payload?: { type?: string; role?: string } }).payload?.type === "message" &&
      (row as { payload?: { role?: string } }).payload?.role === "assistant",
  ) as { payload: { content: Record<string, unknown>[] } };
  const content = message.payload.content;
  return content[0]!;
}

function environmentInputContent(
  rows: unknown[],
): Array<{ type?: string; text?: string; [key: string]: unknown }> {
  for (const row of rows) {
    if (
      typeof row !== "object" ||
      row === null ||
      (row as { type?: string }).type !== "response_item"
    ) {
      continue;
    }
    const candidate = (row as { payload?: Record<string, unknown> }).payload;
    if (
      candidate?.type !== "message" ||
      candidate.role !== "user" ||
      !Array.isArray(candidate.content)
    ) {
      continue;
    }
    const content = candidate.content as Array<{
      type?: string;
      text?: string;
      [key: string]: unknown;
    }>;
    if (content.some((block) => block.type === "input_text" && block.text === ENVIRONMENT_BLOCK)) {
      return content;
    }
  }
  throw new Error("missing environment input fixture");
}

function taskCompletePayload(rows: unknown[]): Record<string, unknown> {
  return (
    rows.find(
      (row) =>
        (row as { type?: string; payload?: { type?: string } }).type === "event_msg" &&
        (row as { payload?: { type?: string } }).payload?.type === "task_complete",
    ) as { payload: Record<string, unknown> }
  ).payload;
}

function publicEvents(report = REPORT): unknown[] {
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
    { type: "item.completed", item: { id: "item_2", type: "agent_message", text: report } },
    {
      type: "turn.completed",
      usage: { input_tokens: 10, cached_input_tokens: 2, output_tokens: 3 },
    },
  ];
}

function strictPublicEvents(report = REPORT): unknown[] {
  const rows = publicEvents(report);
  rows.splice(1, 0, {
    type: "item.completed",
    item: {
      id: "code-mode-notice",
      type: "error",
      message: `${CODE_MODE_WARNING_PREFIX}C:\\Users\\operator\\.codex\\config.toml.`,
    },
  });
  return rows;
}

function rollout(report = REPORT): unknown[] {
  // Observed Codex CLI ordering: session, task start, turn context, final
  // assistant response, then task_complete as the terminal rollout row.
  const inputMessage = (role: "developer" | "user", ...texts: string[]) => ({
    timestamp: "2026-07-19T00:00:00.0006Z",
    type: "response_item",
    payload: {
      type: "message",
      role,
      content: texts.map((text) => ({ type: "input_text", text })),
      internal_chat_message_metadata_passthrough: { turn_id: TURN },
    },
  });
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
    inputMessage("developer", PERMISSIONS_BLOCK, SKILLS_BLOCK),
    inputMessage("developer", V2_TEAM_BLOCK),
    inputMessage("developer", V2_MODE_BLOCK),
    inputMessage("user", ENVIRONMENT_BLOCK),
    {
      timestamp: "2026-07-19T00:00:00.0007Z",
      type: "world_state",
      payload: { full: true },
    },
    {
      timestamp: "2026-07-19T00:00:00.001Z",
      type: "turn_context",
      payload: {
        turn_id: TURN,
        cwd: "C:\\private\\player",
        approval_policy: "never",
        sandbox_policy: { type: "read-only" },
        model: "gpt-5.6-terra",
        collaboration_mode: {
          mode: "default",
          settings: {
            model: "gpt-5.6-terra",
            reasoning_effort: "xhigh",
            developer_instructions: null,
          },
        },
        multi_agent_version: "v2",
        multi_agent_mode: "explicitRequestOnly",
        effort: "xhigh",
      },
    },
    {
      timestamp: "2026-07-19T00:00:00.050Z",
      type: "response_item",
      payload: {
        type: "message",
        role: "user",
        content: [{ type: "input_text", text: "blind prompt" }],
        internal_chat_message_metadata_passthrough: { turn_id: TURN },
      },
    },
    {
      timestamp: "2026-07-19T00:00:00.075Z",
      type: "event_msg",
      payload: {
        type: "user_message",
        message: "blind prompt",
        images: [],
        local_images: [],
        text_elements: [],
      },
    },
    {
      timestamp: "2026-07-19T00:00:00.100Z",
      type: "response_item",
      payload: {
        type: "custom_tool_call",
        id: "wrapper-item-1",
        status: "completed",
        call_id: "call-wrapper-1",
        name: "exec",
        input:
          "const result = await tools.mcp__adventureforge__start_overworld({});\n" +
          "text(JSON.stringify(result));\n",
        internal_chat_message_metadata_passthrough: { turn_id: TURN },
      },
    },
    {
      timestamp: "2026-07-19T00:00:00.200Z",
      type: "event_msg",
      payload: {
        type: "mcp_tool_call_end",
        call_id: "exec-gameplay-1",
        invocation: { server: "adventureforge", tool: "start_overworld", arguments: {} },
        result: { Ok: { content: [] } },
      },
    },
    {
      timestamp: "2026-07-19T00:00:00.300Z",
      type: "response_item",
      payload: {
        type: "custom_tool_call_output",
        call_id: "call-wrapper-1",
        internal_chat_message_metadata_passthrough: { turn_id: TURN },
        output: [
          { type: "input_text", text: "Script completed\nWall time 0.0 seconds\nOutput:\n" },
          { type: "input_text", text: '{"content":[]}' },
        ],
      },
    },
    {
      timestamp: "2026-07-19T00:00:01.000Z",
      type: "response_item",
      payload: {
        type: "message",
        id: "final-message",
        role: "assistant",
        content: [{ type: "output_text", text: report }],
        phase: "final_answer",
        internal_chat_message_metadata_passthrough: { turn_id: TURN },
      },
    },
    {
      timestamp: "2026-07-19T00:00:01.001Z",
      type: "event_msg",
      payload: { type: "task_complete", turn_id: TURN, last_agent_message: report },
    },
  ];
}

function lunaV1Rollout(report = REPORT): unknown[] {
  const rows = rollout(report);
  rows.splice(3, 2);
  const context = rows.find((row) => (row as { type?: string }).type === "turn_context") as {
    payload: Record<string, unknown>;
  };
  context.payload.model = "gpt-5.6-luna";
  const collaboration = context.payload.collaboration_mode as Record<string, unknown>;
  const settings = collaboration.settings as Record<string, unknown>;
  settings.model = "gpt-5.6-luna";
  context.payload.multi_agent_version = "v1";
  delete context.payload.multi_agent_mode;
  const wrapper = rows.find(
    (row) =>
      (row as { type?: string; payload?: { type?: string } }).type === "response_item" &&
      (row as { payload?: { type?: string } }).payload?.type === "custom_tool_call",
  ) as { payload: Record<string, unknown> };
  wrapper.payload.input =
    "const result = await tools.mcp__adventureforge__start_overworld();\n" +
    "text(JSON.stringify(result));\n";
  return rows;
}

function solV2Rollout(report = REPORT): unknown[] {
  const rows = rollout(report);
  const context = rows.find((row) => (row as { type?: string }).type === "turn_context") as {
    payload: Record<string, unknown>;
  };
  context.payload.model = "gpt-5.6-sol";
  const collaboration = context.payload.collaboration_mode as Record<string, unknown>;
  const settings = collaboration.settings as Record<string, unknown>;
  settings.model = "gpt-5.6-sol";
  return rows;
}

function strictTerraRollout(report = REPORT): unknown[] {
  const rows = rollout(report);
  const wrapper = rows.find(
    (row) =>
      (row as { type?: string; payload?: { type?: string } }).type === "response_item" &&
      (row as { payload?: { type?: string } }).payload?.type === "custom_tool_call",
  ) as { payload: Record<string, unknown> };
  wrapper.payload.input = `${CODEX_EXEC_YIELD_PRAGMA}\ntext(await tools.mcp__adventureforge__start_overworld({}));\n`;
  return rows;
}

function historicalStrictTerraRollout(report = REPORT): unknown[] {
  const rows = rollout(report);
  const wrapper = rows.find(
    (row) =>
      (row as { type?: string; payload?: { type?: string } }).type === "response_item" &&
      (row as { payload?: { type?: string } }).payload?.type === "custom_tool_call",
  ) as { payload: Record<string, unknown> };
  wrapper.payload.input =
    `${CODEX_EXEC_YIELD_PRAGMA}\n` +
    "const result = await tools.mcp__adventureforge__start_overworld({});\n" +
    "text(JSON.stringify(result));\n";
  return rows;
}

function insertCompactedContextReplay(rows: unknown[]): void {
  const replay = structuredClone(rows[7]) as Record<string, unknown>;
  replay.timestamp = "2026-07-19T00:00:00.500Z";
  rows.splice(
    rows.length - 2,
    0,
    { type: "compacted", payload: { window_number: 2 } },
    { type: "world_state", payload: { full: true } },
    replay,
    { type: "event_msg", payload: { type: "context_compacted" } },
  );
}

function captureReceipt(rows: unknown[], current = false): string {
  const rolloutBody = jsonl(rows);
  const session = rows.find((row) => (row as { type?: string }).type === "session_meta") as {
    payload: { cwd: string };
  };
  const turn = rows.find((row) => (row as { type?: string }).type === "turn_context") as {
    payload: { cwd: string };
  };
  const cwd = session.payload.cwd;
  return `${JSON.stringify({
    schema_version: current ? 3 : 1,
    binding: "runner_work_player",
    ...(current ? { code_mode_contract: STRICT_CODE_MODE_CONTRACT } : {}),
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

function historicalStrictCaptureReceipt(rows: unknown[]): string {
  const receipt = JSON.parse(captureReceipt(rows)) as Record<string, unknown>;
  receipt.schema_version = 2;
  receipt.code_mode_contract = HISTORICAL_STRICT_CODE_MODE_CONTRACT;
  return `${JSON.stringify(receipt)}\n`;
}

const BUILD = {
  git_commit: "a".repeat(40),
  tracked_worktree_clean: true as const,
  world_id: "new_york_overworld",
  world_hash: "b".repeat(64),
};

function journeyReceipt() {
  const decisionHash = "c".repeat(64);
  const payload = {
    contractVersion: JOURNEY_CONTRACT_VERSION,
    exitReason: "player_ended_at_choice" as const,
    goalVersion: 1,
    goalId: INITIAL_JOURNEY_GOAL.id,
    goalText: INITIAL_JOURNEY_GOAL.text,
    goalStatus: "active" as const,
    goalCompletedAtDecision: null,
    completedGoals: [],
    acceptedDecisions: 40,
    exitReasons: ["checkpoint" as const],
    checkpoint: 40,
    decisionProofHash: decisionHash,
    retentionHistory: [
      {
        sequence: 1,
        atDecision: 40,
        reasons: ["checkpoint" as const],
        checkpoint: 40,
        goalVersion: null,
        goalId: null,
        choice: "end" as const,
        decisionProofHash: decisionHash,
      },
    ],
  };
  return { ...payload, receiptHash: hashState(payload) };
}

function receiptBindingFixture() {
  const originalReport = `## Playthrough log

I followed the journey until the real end choice and ended it.

## Did it work mechanically?

Yes, state and choices advanced normally.

## Understandable & fun?

Clarity: 4/5. Enjoyment: 5/5.

## Confusion / friction points

One prompt needed a second reading.

## Bugs or design flaws

None found.

## Verdict

The journey felt reactive and worth replaying.

\`\`\`json exit-interview
${JSON.stringify({
  schema_version: 2,
  play_mode: "pure",
  start_surface: "fresh_overworld",
  retention_eligible: true,
  journey_exit_receipt: { acceptedDecisions: 40, decisionProofHash: "925d92dfff? " },
  clarity: 4,
  enjoyment: 5,
  goal_understood: true,
  got_stuck: false,
  confusions: ["One prompt needed a second reading."],
  bugs: [],
  best_moment: "The route reacted to preparation.",
  worst_moment: "One prompt needed a second reading.",
  would_replay: true,
  verdict: "The journey felt reactive, legible, and worth replaying by another route.",
})}
\`\`\`
`;
  const start = {
    schema_version: 2,
    play_mode: "pure",
    event: "fresh_start",
    start_surface: "fresh_overworld",
    session_id: "ow-fleet-receipt-bound",
    run_seed: 4244,
    build: BUILD,
  };
  const exit = {
    schema_version: 2,
    play_mode: "pure",
    event: "journey_exit",
    start_surface: "fresh_overworld",
    session_id: "ow-fleet-receipt-bound",
    run_seed: 4244,
    build: BUILD,
    quest_outcomes: [["wolf_winter", "ending_pack_diverted"]],
    receipt: journeyReceipt(),
  };
  const evidence = [start, exit].map((event) => JSON.stringify(event)).join("\n");
  const primaryEnvelope = `${JSON.stringify({
    type: "result",
    subtype: "success",
    provider: "codex",
    is_error: false,
    duration_ms: 1000,
    num_turns: 1,
    result: originalReport,
    session_id: SESSION,
    requested_model: "gpt-5.6-terra",
    terminal_reason: "completed",
    usage: {
      input_tokens: 10,
      cache_read_input_tokens: 2,
      output_tokens: 3,
      reasoning_output_tokens: 0,
    },
    modelUsage: {
      "gpt-5.6-terra": {
        inputTokens: 10,
        cacheReadInputTokens: 2,
        outputTokens: 3,
        reasoningOutputTokens: 0,
      },
    },
  })}\n`;
  const bound = bindPureCodexReceipt({
    playMode: "pure",
    provider: "codex",
    agentExitStatus: 0,
    verifierExitStatus: 5,
    attempt: 0,
    requestedModel: "gpt-5.6-terra",
    expectedRunSeed: 4244,
    expectedGitCommit: BUILD.git_commit,
    expectedTrackedWorktreeClean: true,
    primaryEnvelopeBytes: Buffer.from(primaryEnvelope),
    runEvidenceBytes: Buffer.from(evidence),
    reportBytes: Buffer.from(originalReport),
  });
  if (!bound.ok) throw new Error(bound.reason);
  const parsedEvidence = parseRunEvidenceJsonl(evidence);
  if (!parsedEvidence.ok) throw new Error(parsedEvidence.reason);
  return { originalReport, evidence, primaryEnvelope, bound, run: parsedEvidence.sidecar };
}

describe("Codex certified fleet rollout authority", () => {
  it("binds one public thread to one rollout turn and exact final report", () => {
    const rows = strictTerraRollout();
    expect(
      validateCodexFleetProviderAuthority({
        events: jsonl(strictPublicEvents()),
        rollout: jsonl(rows),
        capture: captureReceipt(rows, true),
        model: "gpt-5.6-terra",
        report: REPORT,
      }),
    ).toEqual({
      ok: true,
      facts: {
        sessionId: SESSION,
        actualModel: "gpt-5.6-terra",
        turnId: TURN,
        cwd: "C:\\private\\player",
        codeModeContract: STRICT_CODE_MODE_CONTRACT,
      },
    });
  });

  it("accepts the current optional global AGENTS prelude through fleet authority", () => {
    const rows = strictTerraRollout();
    environmentInputContent(rows).unshift({
      type: "input_text",
      text: GLOBAL_AGENTS_BLOCK,
    });
    expect(
      validateCodexFleetProviderAuthority({
        events: jsonl(strictPublicEvents()),
        rollout: jsonl(rows),
        capture: captureReceipt(rows, true),
        model: "gpt-5.6-terra",
        report: REPORT,
      }),
    ).toEqual({
      ok: true,
      facts: {
        sessionId: SESSION,
        actualModel: "gpt-5.6-terra",
        turnId: TURN,
        cwd: "C:\\private\\player",
        codeModeContract: STRICT_CODE_MODE_CONTRACT,
      },
    });
  });

  it("preserves historical strict-v1 schema-2 rollout authority", () => {
    const rows = historicalStrictTerraRollout();
    expect(payload(rows, 10).input).toBe(
      `${CODEX_EXEC_YIELD_PRAGMA}\n` +
        "const result = await tools.mcp__adventureforge__start_overworld({});\n" +
        "text(JSON.stringify(result));\n",
    );
    expect(
      validateCodexFleetProviderAuthority({
        events: jsonl(strictPublicEvents()),
        rollout: jsonl(rows),
        capture: historicalStrictCaptureReceipt(rows),
        model: "gpt-5.6-terra",
        report: REPORT,
      }),
    ).toEqual({
      ok: true,
      facts: {
        sessionId: SESSION,
        actualModel: "gpt-5.6-terra",
        turnId: TURN,
        cwd: "C:\\private\\player",
        codeModeContract: HISTORICAL_STRICT_CODE_MODE_CONTRACT,
      },
    });
  });

  it.each([
    [
      "a missing public code-mode notice",
      (events: unknown[]) => events.splice(1, 1),
      (_rows: unknown[], _receipt: Record<string, unknown>) => undefined,
      /exact code-mode prelude/i,
    ],
    [
      "an altered public code-mode notice",
      (events: unknown[]) => {
        const item = (events[1] as { item: { message: string } }).item;
        item.message += " altered";
      },
      (_rows: unknown[], _receipt: Record<string, unknown>) => undefined,
      /exact code-mode prelude|begin with thread/i,
    ],
    [
      "a missing wrapper pragma",
      (_events: unknown[]) => undefined,
      (rows: unknown[], _receipt: Record<string, unknown>) => {
        payload(rows, 10).input = String(payload(rows, 10).input).replace(
          `${CODEX_EXEC_YIELD_PRAGMA}\n`,
          "",
        );
      },
      /forbidden wrapper program/i,
    ],
    [
      "an altered wrapper pragma",
      (_events: unknown[]) => undefined,
      (rows: unknown[], _receipt: Record<string, unknown>) => {
        payload(rows, 10).input = String(payload(rows, 10).input).replace("120000", "120001");
      },
      /forbidden wrapper program/i,
    ],
    [
      "a direct-result strict wrapper",
      (_events: unknown[]) => undefined,
      (rows: unknown[], _receipt: Record<string, unknown>) => {
        payload(rows, 10).input =
          `${CODEX_EXEC_YIELD_PRAGMA}\n` +
          "const result = await tools.mcp__adventureforge__start_overworld({});\ntext(result);\n";
      },
      /forbidden wrapper program/i,
    ],
    [
      "a pragma-bearing historical content renderer",
      (_events: unknown[]) => undefined,
      (rows: unknown[], _receipt: Record<string, unknown>) => {
        payload(rows, 10).input =
          `${CODEX_EXEC_YIELD_PRAGMA}\n` +
          "const r = await tools.mcp__adventureforge__start_overworld({});\n" +
          "for (const c of (r?.content ?? [])) {\n" +
          '  if (c.type === "image") image(c);\n' +
          '  else if (c.type === "text") text(c.text);\n' +
          "}\n";
      },
      /forbidden wrapper program/i,
    ],
    [
      "a wrong v2 contract marker",
      (_events: unknown[]) => undefined,
      (_rows: unknown[], receipt: Record<string, unknown>) => {
        receipt.code_mode_contract = "legacy";
      },
      /exact runner-work-player proof/i,
    ],
    [
      "an extra v2 capture key",
      (_events: unknown[]) => undefined,
      (_rows: unknown[], receipt: Record<string, unknown>) => {
        receipt.extra = true;
      },
      /exact runner-work-player proof/i,
    ],
  ])("rejects strict v2 with $0", (_label, mutateEvents, mutatePrivate, reason) => {
    const events = strictPublicEvents();
    const rows = strictTerraRollout();
    const receipt = JSON.parse(captureReceipt(rows, true)) as Record<string, unknown>;
    mutateEvents(events);
    mutatePrivate(rows, receipt);
    receipt.copied_rollout_sha256 = createHash("sha256").update(jsonl(rows)).digest("hex");
    expect(
      validateCodexFleetProviderAuthority({
        events: jsonl(events),
        rollout: jsonl(rows),
        capture: `${JSON.stringify(receipt)}\n`,
        model: "gpt-5.6-terra",
        report: REPORT,
      }),
    ).toEqual({ ok: false, reason: expect.stringMatching(reason) });
  });

  it("rejects duplicate strict v2 capture markers before schema selection", () => {
    const rows = strictTerraRollout();
    const duplicate = captureReceipt(rows, true).replace(
      '"code_mode_contract":"strict-code-mode-v2"',
      '"code_mode_contract":"legacy","code_mode_contract":"strict-code-mode-v2"',
    );
    expect(
      validateCodexFleetProviderAuthority({
        events: jsonl(strictPublicEvents()),
        rollout: jsonl(rows),
        capture: duplicate,
        model: "gpt-5.6-terra",
        report: REPORT,
      }),
    ).toEqual({ ok: false, reason: expect.stringMatching(/duplicate JSON object key/i) });
  });

  it("authenticates the exact Luna v1 topology without trusting a rewritten capture receipt", () => {
    const rows = lunaV1Rollout();
    expect(
      validateCodexFleetProviderAuthority({
        events: jsonl(publicEvents()),
        rollout: jsonl(rows),
        capture: captureReceipt(rows),
        model: "gpt-5.6-luna",
        report: REPORT,
      }),
    ).toMatchObject({
      ok: true,
      facts: { actualModel: "gpt-5.6-luna", turnId: TURN },
    });

    const badReceipt = JSON.parse(captureReceipt(rows)) as Record<string, unknown>;
    badReceipt.copied_rollout_sha256 = "0".repeat(64);
    expect(
      validateCodexFleetProviderAuthority({
        events: jsonl(publicEvents()),
        rollout: jsonl(rows),
        capture: `${JSON.stringify(badReceipt)}\n`,
        model: "gpt-5.6-luna",
        report: REPORT,
      }),
    ).toEqual({ ok: false, reason: expect.stringMatching(/rollout hash differs/i) });

    const invalidProfile = structuredClone(rows);
    const context = invalidProfile.find(
      (row) => (row as { type?: string }).type === "turn_context",
    ) as { payload: Record<string, unknown> };
    context.payload.multi_agent_mode = "explicitRequestOnly";
    expect(
      validateCodexFleetProviderAuthority({
        events: jsonl(publicEvents()),
        rollout: jsonl(invalidProfile),
        capture: captureReceipt(invalidProfile),
        model: "gpt-5.6-luna",
        report: REPORT,
      }),
    ).toEqual({
      ok: false,
      reason: expect.stringMatching(/capture profile is unsupported/i),
    });
  });

  it("rejects a Sol capture relabeled Terra behind a regenerated rollout receipt", () => {
    const rows = solV2Rollout();
    const context = rows.find((row) => (row as { type?: string }).type === "turn_context") as {
      payload: Record<string, unknown>;
    };
    context.payload.model = "gpt-5.6-terra";

    expect(
      validateCodexFleetProviderAuthority({
        events: jsonl(publicEvents()),
        rollout: jsonl(rows),
        capture: captureReceipt(rows),
        model: "gpt-5.6-terra",
        report: REPORT,
      }),
    ).toEqual({
      ok: false,
      reason: expect.stringMatching(/capture profile is unsupported/i),
    });
  });

  it.each([
    [
      "a private gameplay lifecycle removed behind a freshly rehashed capture",
      (rows: unknown[]) => rows.splice(10, 3),
      /user_message before gameplay|no AdventureForge gameplay result/i,
    ],
    [
      "a private gameplay tool substituted behind a valid wrapper",
      (rows: unknown[]) => {
        payload(rows, 10).input =
          "const result = await tools.mcp__adventureforge__get_overworld_session_context({});\n" +
          "text(JSON.stringify(result));\n";
        const invocation = payload(rows, 11).invocation as Record<string, unknown>;
        invocation.tool = "get_overworld_session_context";
      },
      /public\/private gameplay lifecycle differs at call 1/i,
    ],
    [
      "ALL_TOOLS wrapper activity",
      (rows: unknown[]) => {
        payload(rows, 10).input =
          "const hits = ALL_TOOLS.filter((tool) => tool.name.includes('adventureforge'));\ntext(hits);\n";
      },
      /forbidden wrapper program/i,
    ],
    [
      "an output id detached from its wrapper start",
      (rows: unknown[]) => (payload(rows, 12).call_id = "other-output"),
      /missing, mismatched, or truncated output/i,
    ],
    [
      "a non-adjacent duplicate wrapper output",
      (rows: unknown[]) => rows.splice(rows.length - 1, 0, structuredClone(rows[12])),
      /orphan or unexpected tool lifecycle/i,
    ],
  ])("rejects $0 during fleet artifact authority validation", (_label, mutate, reason) => {
    const rows = rollout();
    mutate(rows);
    expect(
      validateCodexFleetProviderAuthority({
        events: jsonl(publicEvents()),
        rollout: jsonl(rows),
        capture: captureReceipt(rows),
        model: "gpt-5.6-terra",
        report: REPORT,
      }),
    ).toEqual({ ok: false, reason: expect.stringMatching(reason) });
  });

  it("authenticates a receipt-bound report against the original rollout message", () => {
    const fixture = receiptBindingFixture();
    const rolloutRows = rollout(fixture.originalReport);
    const metadataBytes = Buffer.from(`${JSON.stringify(fixture.bound.metadata, null, 2)}\n`);
    const artifacts = {
      report: fixture.bound.reportBytes,
      runSidecar: Buffer.from(JSON.stringify(fixture.run)),
      runEvidence: Buffer.from(fixture.evidence),
      primaryEnvelope: Buffer.from(fixture.primaryEnvelope),
      initialReport: Buffer.from(fixture.originalReport),
      receiptBinding: metadataBytes,
      recoveryMetadata: null,
      recoveryEnvelope: null,
      providerEvents: Buffer.from(jsonl(publicEvents(fixture.originalReport))),
      providerRollout: Buffer.from(jsonl(rolloutRows)),
      providerCapture: Buffer.from(captureReceipt(rolloutRows)),
    };
    const expected = {
      seed: 4244,
      provider: "codex" as const,
      model: "gpt-5.6-terra" as const,
      build: BUILD,
    };
    expect(validatePureFleetRunArtifactBytes(artifacts, expected)).toMatchObject({
      ok: true,
      facts: {
        report_recovered: false,
        report_receipt_bound: true,
        hashes: { receipt_binding_sha256: expect.stringMatching(/^[0-9a-f]{64}$/) },
      },
    });

    const changedMetadata = Buffer.from(
      `${JSON.stringify({ ...fixture.bound.metadata, bound_report_sha256: "d".repeat(64) })}\n`,
    );
    expect(
      validatePureFleetRunArtifactBytes(
        { ...artifacts, receiptBinding: changedMetadata },
        expected,
      ),
    ).toMatchObject({ ok: false, reason: expect.stringMatching(/metadata does not reproduce/i) });

    const duplicateDigestMetadata = Buffer.from(
      metadataBytes
        .toString("utf8")
        .replace(
          '"bound_report_sha256":',
          `"bound_report_sha256":"${"d".repeat(64)}","bound_report_sha256":`,
        ),
    );
    expect(
      validatePureFleetRunArtifactBytes(
        { ...artifacts, receiptBinding: duplicateDigestMetadata },
        expected,
      ),
    ).toMatchObject({
      ok: false,
      reason: expect.stringMatching(/duplicate JSON object key "bound_report_sha256"/i),
    });
  });

  it("accepts exact context replays immediately after each compaction", () => {
    const rows = rollout();
    insertCompactedContextReplay(rows);
    const replay = structuredClone(rows[7]) as Record<string, unknown>;
    replay.timestamp = "2026-07-19T00:00:00.750Z";
    rows.splice(
      rows.length - 1,
      0,
      { type: "compacted", payload: {} },
      { type: "world_state", payload: {} },
      replay,
      { type: "event_msg", payload: { type: "context_compacted" } },
    );
    expect(
      validateCodexFleetProviderAuthority({
        events: jsonl(publicEvents()),
        rollout: jsonl(rows),
        capture: captureReceipt(rows),
        model: "gpt-5.6-terra",
        report: REPORT,
      }),
    ).toMatchObject({ ok: true, facts: { turnId: TURN } });
  });

  it.each([
    [
      "model substitution",
      (rows: unknown[]) => (payload(rows, 7).model = "gpt-5.6-sol"),
      /capture profile is unsupported|differs from planned/i,
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
      (rows: unknown[]) => (payload(rows, 7).effort = "high"),
      /capture profile is unsupported|strict read-only xhigh/i,
    ],
    [
      "sandbox widening",
      (rows: unknown[]) => (payload(rows, 7).sandbox_policy = { type: "danger-full-access" }),
      /strict read-only xhigh/i,
    ],
    [
      "report substitution",
      (rows: unknown[]) => (finalOutput(rows).text = "other"),
      /rollout final assistant/i,
    ],
    [
      "second context without compaction",
      (rows: unknown[]) => rows.splice(rows.length - 1, 0, structuredClone(rows[7])),
      /invalid compacted context replay|exact compacted pre-completion replay/i,
    ],
    [
      "altered compacted context",
      (rows: unknown[]) => {
        insertCompactedContextReplay(rows);
        payload(rows, 15).model = "gpt-5.6-sol";
      },
      /invalid compacted context replay|exact compacted pre-completion replay/i,
    ],
    [
      "altered compacted context envelope",
      (rows: unknown[]) => {
        insertCompactedContextReplay(rows);
        (rows[15] as Record<string, unknown>).untrusted_marker = true;
      },
      /invalid compacted context replay|exact compacted pre-completion replay/i,
    ],
    [
      "post-completion compacted context replay",
      (rows: unknown[]) => {
        const replay = structuredClone(rows[7]);
        rows.push({ type: "compacted", payload: {} }, { type: "world_state", payload: {} }, replay);
      },
      /task_complete must be the final row|exact compacted pre-completion replay/i,
    ],
    ["missing completion", (rows: unknown[]) => rows.pop(), /exactly one task_started/i],
    [
      "duplicate start",
      (rows: unknown[]) => rows.push(structuredClone(rows[1])),
      /exactly one task_started/i,
    ],
    [
      "lifecycle turn substitution",
      (rows: unknown[]) =>
        (taskCompletePayload(rows).turn_id = "419f7250-1ed0-7102-be6c-4f1d5513d91e"),
      /input and initial context lifecycle is out of order|lifecycle turn id differs/i,
    ],
    [
      "completion report substitution",
      (rows: unknown[]) => (taskCompletePayload(rows).last_agent_message = "other"),
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
      /forbidden private event|forbidden abort\/error lifecycle/i,
    ],
    [
      "an error terminal row after apparent completion",
      (rows: unknown[]) => rows.push({ type: "error", message: "late stream failure" }),
      /task_complete must be the final row|forbidden abort\/error lifecycle/i,
    ],
    [
      "nonterminal history after task_complete",
      (rows: unknown[]) => rows.push({ type: "response_item", payload: { type: "reasoning" } }),
      /task_complete must be the final row/i,
    ],
    [
      "repository cwd",
      (rows: unknown[]) => {
        payload(rows, 0).cwd = process.cwd();
        payload(rows, 7).cwd = process.cwd();
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
        model: "gpt-5.6-terra",
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
        model: "gpt-5.6-terra",
        report: REPORT,
      }),
    ).toEqual({ ok: false, reason: expect.stringMatching(reason) });
  });
});
