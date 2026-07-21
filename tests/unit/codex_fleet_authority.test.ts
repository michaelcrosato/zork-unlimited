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

function rollout(report = REPORT): unknown[] {
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
        content: [{ type: "output_text", text: report }],
      },
    },
    {
      timestamp: "2026-07-19T00:00:01.001Z",
      type: "event_msg",
      payload: { type: "task_complete", turn_id: TURN, last_agent_message: report },
    },
  ];
}

function insertCompactedContextReplay(rows: unknown[]): void {
  const replay = structuredClone(rows[2]) as Record<string, unknown>;
  replay.timestamp = "2026-07-19T00:00:00.500Z";
  rows.splice(
    3,
    0,
    { type: "compacted", payload: { window_number: 2 } },
    { type: "world_state", payload: { full: true } },
    replay,
  );
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
    requested_model: "gpt-5.3-codex-spark",
    terminal_reason: "completed",
    usage: {
      input_tokens: 10,
      cache_read_input_tokens: 2,
      output_tokens: 3,
      reasoning_output_tokens: 0,
    },
    modelUsage: {
      "gpt-5.3-codex-spark": {
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
    requestedModel: "gpt-5.3-codex-spark",
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
      model: "gpt-5.3-codex-spark" as const,
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
    const replay = structuredClone(rows[5]) as Record<string, unknown>;
    replay.timestamp = "2026-07-19T00:00:00.750Z";
    rows.splice(
      rows.length - 1,
      0,
      { type: "compacted", payload: {} },
      { type: "world_state", payload: {} },
      replay,
    );
    expect(
      validateCodexFleetProviderAuthority({
        events: jsonl(publicEvents()),
        rollout: jsonl(rows),
        capture: captureReceipt(rows),
        model: "gpt-5.3-codex-spark",
        report: REPORT,
      }),
    ).toMatchObject({ ok: true, facts: { turnId: TURN } });
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
      "second context without compaction",
      (rows: unknown[]) => rows.push(structuredClone(rows[2])),
      /exact compacted pre-completion replay/i,
    ],
    [
      "altered compacted context",
      (rows: unknown[]) => {
        insertCompactedContextReplay(rows);
        payload(rows, 5).model = "gpt-5.6-sol";
      },
      /exact compacted pre-completion replay/i,
    ],
    [
      "altered compacted context envelope",
      (rows: unknown[]) => {
        insertCompactedContextReplay(rows);
        (rows[5] as Record<string, unknown>).untrusted_marker = true;
      },
      /exact compacted pre-completion replay/i,
    ],
    [
      "post-completion compacted context replay",
      (rows: unknown[]) => {
        const replay = structuredClone(rows[2]);
        rows.push({ type: "compacted", payload: {} }, { type: "world_state", payload: {} }, replay);
      },
      /exact compacted pre-completion replay/i,
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
