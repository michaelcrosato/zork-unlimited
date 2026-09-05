import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { hashState } from "../../../src/core/hash.js";
import {
  INITIAL_JOURNEY_GOAL,
  JOURNEY_CONTRACT_VERSION,
} from "../../../src/world/journey_contract.js";
import { parseRunEvidenceJsonl } from "../../../src/blind/run_evidence.js";
import { sha256Hex } from "../../../src/qa/session_store.js";
// @ts-expect-error -- intentionally plain ESM runner capture code.
import * as claudeCapture from "../../../blind-tester/claude-session.mjs";
// @ts-expect-error -- intentionally plain ESM runner capture code.
import { CODEX_SPARK_PLAYER_BASE_INSTRUCTIONS } from "../../../blind-tester/codex-pure-envelope.mjs";

export const jsonl = (rows: readonly unknown[]): string =>
  `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`;

/** Synthetic protocol artifacts for admission tests, never player evidence. */
export function recordedRun(outPrefix: string) {
  const proofHash = "a".repeat(64);
  const receiptBody = {
    contractVersion: JOURNEY_CONTRACT_VERSION,
    exitReason: "player_ended_at_choice",
    goalVersion: 1,
    goalId: INITIAL_JOURNEY_GOAL.id,
    goalText: INITIAL_JOURNEY_GOAL.text,
    goalStatus: "active",
    goalCompletedAtDecision: null,
    completedGoals: [],
    acceptedDecisions: 40,
    exitReasons: ["checkpoint"],
    checkpoint: 40,
    decisionProofHash: proofHash,
    retentionHistory: [
      {
        sequence: 1,
        atDecision: 40,
        reasons: ["checkpoint"],
        checkpoint: 40,
        goalVersion: null,
        goalId: null,
        choice: "end",
        decisionProofHash: proofHash,
      },
    ],
  };
  const receipt = { ...receiptBody, receiptHash: hashState(receiptBody) };
  const build = {
    git_commit: "b".repeat(40),
    tracked_worktree_clean: true,
    world_id: "new_york_overworld",
    world_hash: "c".repeat(64),
  };
  const start = {
    schema_version: 2,
    play_mode: "pure",
    event: "fresh_start",
    start_surface: "fresh_overworld",
    session_id: "ow-recorded-proof",
    run_seed: 741,
    build,
  };
  const evidenceText = jsonl([
    start,
    { ...start, event: "journey_exit", quest_outcomes: [], receipt },
  ]);
  const parsed = parseRunEvidenceJsonl(evidenceText);
  if (!parsed.ok) throw new Error(parsed.reason);
  const sidecarText = JSON.stringify(parsed.sidecar);
  const interview = {
    schema_version: 2,
    play_mode: "pure",
    start_surface: "fresh_overworld",
    retention_eligible: true,
    journey_exit_receipt: receipt,
    clarity: 4,
    enjoyment: 4,
    goal_understood: true,
    got_stuck: false,
    confusions: [],
    bugs: [],
    best_moment: "The road choice.",
    worst_moment: "The long walk.",
    would_replay: true,
    verdict: "A clear and enjoyable journey.",
  };
  const reportText =
    `## Playthrough log\nI followed the road and ended at the journey choice.\n\n` +
    `## Verdict\nClarity: 4/5. Enjoyment: 4/5.\n\n\`\`\`json exit-interview\n${JSON.stringify(interview)}\n\`\`\`\n`;
  writeFileSync(`${outPrefix}.md`, reportText);
  writeFileSync(`${outPrefix}.evidence.jsonl`, evidenceText);
  writeFileSync(`${outPrefix}.run.json`, sidecarText);
  return { outPrefix, reportText, sidecarText, evidenceText };
}

export function recordedClaudeRun(outPrefix: string) {
  const run = recordedRun(outPrefix);
  const model = "claude-haiku-4-5-20251001";
  const sessionId = "10000000-0000-4000-8000-000000000741";
  const cwd = join(outPrefix, "player");
  const tool = "mcp__adventureforge__start_overworld";
  const toolCall = { type: "tool_use", id: "tool-1", name: tool, input: {} };
  const transcriptBytes = Buffer.from(
    jsonl([
      {
        type: "assistant",
        cwd,
        sessionId,
        version: "2.1.251",
        message: { model, content: [toolCall] },
      },
      {
        type: "assistant",
        cwd,
        sessionId,
        version: "2.1.251",
        message: { model, content: [{ type: "text", text: run.reportText }] },
      },
    ]),
  );
  const streamRows = [
    {
      type: "system",
      subtype: "init",
      cwd,
      session_id: sessionId,
      mcp_servers: [{ name: "adventureforge", status: "connected" }],
      tools: [tool],
      skills: [],
      plugins: [],
      slash_commands: [],
      model,
      claude_code_version: "2.1.251",
    },
    { type: "assistant", message: { content: [toolCall] } },
    { type: "assistant", message: { content: [{ type: "text", text: run.reportText }] } },
    {
      type: "result",
      subtype: "success",
      is_error: false,
      session_id: sessionId,
      result: run.reportText,
      num_turns: 1,
    },
  ];
  const streamBytes = Buffer.from(jsonl(streamRows));
  const receipt = claudeCapture.inspectClaudeSessionBytes({
    transcriptBytes,
    streamBytes,
    sessionId,
    cwd,
    path: "deleted-private-session.jsonl",
  });
  const transportContract = "game-direct-mcp-v1";
  const envelope = claudeCapture.buildClaudeEnvelope({
    receipt,
    streamRows,
    model,
    transportContract,
  });
  writeFileSync(`${outPrefix}.claude-session.jsonl`, transcriptBytes);
  writeFileSync(`${outPrefix}.claude.jsonl`, streamBytes);
  writeFileSync(`${outPrefix}.claude-capture.json`, JSON.stringify(receipt));
  writeFileSync(`${outPrefix}.json`, JSON.stringify(envelope));
  return { ...run, provider: "claude_code", model, transportContract, reasoningEffort: "xhigh" };
}
const GLOBAL_AGENTS_BLOCK = [
  "# AGENTS.md instructions",
  "",
  "<INSTRUCTIONS>",
  "# Global Codex Guidance",
  "",
  "- Read the repository's own instructions, scripts, and existing patterns before changing code.",
  "- Prefer the repo-local toolchain and package manager over global installs.",
  "- Use `rg`/`rg --files` for code search when available.",
  "- Check the worktree before editing, and do not overwrite unrelated user changes.",
  "- Keep changes scoped to the requested task unless a broader fix is necessary.",
  "- Run the most relevant tests, type checks, linters, builds, or browser smoke checks before finishing when the repo provides them.",
  "- Do not print, commit, or move secrets. Use local env files such as `.env.local` only when a task explicitly needs credentials.",
  "- For web apps, start the dev server and verify the local page when the app needs a server to run.",
  "</INSTRUCTIONS>",
].join("\n");

export function recordedCodexRun(outPrefix: string, effort = "xhigh") {
  const run = recordedRun(outPrefix);
  const seed = 741;
  const reportBody = run.reportText;
  const providerSessionId = "10000000-0000-4000-8000-000000000741";
  const providerTurnId = "20000000-0000-4000-8000-000000000741";
  const providerCwd = join(outPrefix, "player");
  const codexClient = { cli_version: "0.146.0" };
  const model = "gpt-5.6-terra";
  const call = {
    id: "item_1",
    type: "mcp_tool_call",
    server: "adventureforge",
    tool: "start_overworld",
    arguments: {},
  };
  const providerEventsBody = `${[
    { type: "thread.started", thread_id: providerSessionId },
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
    { type: "item.completed", item: { id: "item_2", type: "agent_message", text: reportBody } },
    {
      type: "turn.completed",
      usage: { input_tokens: 10, cached_input_tokens: 0, output_tokens: 10 },
    },
  ]
    .map((event) => JSON.stringify(event))
    .join("\n")}\n`;
  let providerInputOrdinal = 0;
  const providerInputMessage = (role: "developer" | "user", ...texts: string[]) => ({
    type: "response_item",
    payload: {
      type: "message",
      id: `input-${(providerInputOrdinal += 1)}`,
      role,
      content: texts.map((text) => ({ type: "input_text", text })),
      internal_chat_message_metadata_passthrough: { turn_id: providerTurnId },
    },
  });
  const providerRolloutBody = `${[
    {
      timestamp: "2026-07-19T00:00:00.000Z",
      type: "session_meta",
      payload: {
        id: providerSessionId,
        cwd: providerCwd,
        cli_version: codexClient.cli_version,
        model_provider: "openai",
        base_instructions: { text: CODEX_SPARK_PLAYER_BASE_INSTRUCTIONS },
      },
    },
    {
      timestamp: "2026-07-19T00:00:00.001Z",
      type: "event_msg",
      payload: { type: "task_started", turn_id: providerTurnId },
    },
    providerInputMessage("user", GLOBAL_AGENTS_BLOCK),
    { type: "world_state", payload: { full: true } },
    {
      timestamp: "2026-07-19T00:00:00.002Z",
      type: "turn_context",
      payload: {
        turn_id: providerTurnId,
        cwd: providerCwd,
        approval_policy: "never",
        sandbox_policy: { type: "read-only" },
        model,
        collaboration_mode: {
          mode: "default",
          settings: {
            model,
            reasoning_effort: effort,
            developer_instructions: null,
          },
        },
        multi_agent_version: "disabled",
        comp_hash: "3000",
        effort: effort,
        summary: "auto",
      },
    },
    providerInputMessage("user", "blind prompt"),
    {
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
        type: "function_call",
        id: "function-call-1",
        call_id: "function-call-1",
        name: "start_overworld",
        namespace: "mcp__adventureforge",
        arguments: "{}",
        internal_chat_message_metadata_passthrough: { turn_id: providerTurnId },
      },
    },
    {
      timestamp: "2026-07-19T00:00:00.200Z",
      type: "event_msg",
      payload: {
        type: "mcp_tool_call_end",
        call_id: "function-call-1",
        invocation: { server: "adventureforge", tool: "start_overworld", arguments: {} },
        result: { Ok: { content: [] } },
      },
    },
    {
      timestamp: "2026-07-19T00:00:00.300Z",
      type: "response_item",
      payload: {
        type: "function_call_output",
        id: "function-output-1",
        call_id: "function-call-1",
        internal_chat_message_metadata_passthrough: { turn_id: providerTurnId },
        output: "Wall time: 0.0 seconds\nOutput:\n[]",
      },
    },
    {
      timestamp: "2026-07-19T00:00:00.999Z",
      type: "event_msg",
      payload: {
        type: "agent_message",
        message: reportBody,
        phase: "final_answer",
        memory_citation: null,
      },
    },
    {
      timestamp: "2026-07-19T00:00:01.000Z",
      type: "response_item",
      payload: {
        type: "message",
        id: "final-message",
        role: "assistant",
        content: [{ type: "output_text", text: reportBody }],
        phase: "final_answer",
        internal_chat_message_metadata_passthrough: { turn_id: providerTurnId },
      },
    },
    {
      timestamp: "2026-07-19T00:00:01.001Z",
      type: "event_msg",
      payload: {
        type: "task_complete",
        turn_id: providerTurnId,
        last_agent_message: reportBody,
      },
    },
  ]
    .map((event) => JSON.stringify(event))
    .join("\n")}\n`;
  const providerCaptureBody = `${JSON.stringify(
    {
      schema_version: 5,
      binding: "runner_work_player",
      transport_contract: "game-direct-mcp-v1",
      recorded_session_cwd: providerCwd,
      recorded_turn_cwd: providerCwd,
      canonical_expected_cwd: providerCwd,
      canonical_session_cwd: providerCwd,
      canonical_turn_cwd: providerCwd,
      expected_directory_identity: { device_id: "1", file_id: String(seed) },
      session_directory_identity: { device_id: "1", file_id: String(seed) },
      turn_directory_identity: { device_id: "1", file_id: String(seed) },
      copied_rollout_sha256: sha256Hex(providerRolloutBody),
    },
    null,
    2,
  )}\n`;
  const primaryEnvelopeBody = `${JSON.stringify({
    type: "result",
    subtype: "success",
    provider: "codex",
    is_error: false,
    session_id: providerSessionId,
    result: reportBody,
    terminal_reason: "completed",
    num_turns: 1,
    requested_model: model,
    usage: {
      input_tokens: 10,
      cache_read_input_tokens: 0,
      output_tokens: 10,
      reasoning_output_tokens: 0,
    },
    modelUsage: {
      [model]: {
        inputTokens: 10,
        cacheReadInputTokens: 0,
        outputTokens: 10,
        reasoningOutputTokens: 0,
      },
    },
  })}\n`;
  writeFileSync(`${outPrefix}.codex.jsonl`, providerEventsBody);
  writeFileSync(`${outPrefix}.codex-rollout.jsonl`, providerRolloutBody);
  writeFileSync(`${outPrefix}.codex-capture.json`, providerCaptureBody);
  writeFileSync(`${outPrefix}.json`, primaryEnvelopeBody);
  return {
    ...run,
    provider: "codex",
    model,
    transportContract: "game-direct-mcp-v1",
    reasoningEffort: effort,
  };
}
