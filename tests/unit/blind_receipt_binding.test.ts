import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { hashState } from "../../src/core/hash.js";
import {
  bindPureCodexReceipt,
  reproducePureCodexReceiptBinding,
} from "../../src/blind/receipt_binding.js";
import { verifyBlindReportText } from "../../src/blind/report_verifier.js";
import {
  INITIAL_JOURNEY_GOAL,
  JOURNEY_CONTRACT_VERSION,
} from "../../src/world/journey_contract.js";

const PROVIDER_SESSION_ID = "10852ae5-43b1-424a-aa39-7ba347361cec";
const MODEL = "gpt-5.6-luna";
const HASH = "a".repeat(64);
const BUILD = {
  git_commit: "b".repeat(40),
  tracked_worktree_clean: true,
  world_id: "new_york_overworld",
  world_hash: "c".repeat(64),
};

const SUBJECTIVE = {
  clarity: 4,
  enjoyment: 5,
  goal_understood: true,
  got_stuck: false,
  confusions: ["One choice needed a second reading."],
  bugs: [],
  best_moment: "Seeing preparation alter the encounter.",
  worst_moment: "One choice needed a second reading.",
  would_replay: true,
  verdict: "The journey was clear, reactive, and worth replaying with another route.",
};

const MALFORMED_RECEIPT = {
  acceptedDecisions: 40,
  decisionProofHash: "925d92dfff? ",
  receiptHash: "not-the-server-receipt",
};

const REPORT_PROSE = `## Playthrough log
I played naturally until the game offered its real journey choice, then ended.

## Did it work mechanically?
Yes. The game tools and state transitions worked throughout.

## Understandable & fun?
Clarity: 4/5. Enjoyment: 5/5.

## Confusion / friction points
One choice needed a second reading.

## Bugs or design flaws
None found.

## Verdict
A new player could understand the journey and would likely continue playing.`;

const bytes = (text: string): Buffer => Buffer.from(text, "utf8");

function receipt() {
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
    decisionProofHash: HASH,
    retentionHistory: [
      {
        sequence: 1,
        atDecision: 40,
        reasons: ["checkpoint" as const],
        checkpoint: 40,
        goalVersion: null,
        goalId: null,
        choice: "end" as const,
        decisionProofHash: HASH,
      },
    ],
  };
  return { ...payload, receiptHash: hashState(payload) };
}

function evidence(rows: "valid" | "no-exit" | "duplicate-exit" = "valid"): string {
  const start = {
    schema_version: 2,
    play_mode: "pure",
    event: "fresh_start",
    start_surface: "fresh_overworld",
    session_id: "ow-receipt-binding",
    run_seed: 4244,
    build: BUILD,
  };
  const exit = {
    schema_version: 2,
    play_mode: "pure",
    event: "journey_exit",
    start_surface: "fresh_overworld",
    session_id: "ow-receipt-binding",
    run_seed: 4244,
    build: BUILD,
    quest_outcomes: [["wolf_winter", "ending_pack_diverted"]],
    receipt: receipt(),
  };
  const events =
    rows === "no-exit" ? [start] : rows === "duplicate-exit" ? [start, exit, exit] : [start, exit];
  return events.map((event) => JSON.stringify(event)).join("\n");
}

function reportWith(
  journeyReceipt: unknown = MALFORMED_RECEIPT,
  subjective: Record<string, unknown> = SUBJECTIVE,
): string {
  const interview = {
    schema_version: 2,
    play_mode: "pure",
    start_surface: "fresh_overworld",
    retention_eligible: true,
    journey_exit_receipt: journeyReceipt,
    ...subjective,
  };
  return `${REPORT_PROSE}\n\n\`\`\`json exit-interview\n${JSON.stringify(interview)}\n\`\`\`\n`;
}

function envelope(report: string, overrides: Record<string, unknown> = {}): string {
  return `${JSON.stringify({
    type: "result",
    subtype: "success",
    provider: "codex",
    is_error: false,
    duration_ms: 1234,
    num_turns: 9,
    result: report,
    session_id: PROVIDER_SESSION_ID,
    requested_model: MODEL,
    terminal_reason: "completed",
    usage: {
      input_tokens: 100,
      cache_read_input_tokens: 20,
      output_tokens: 30,
      reasoning_output_tokens: 10,
    },
    modelUsage: {
      [MODEL]: {
        inputTokens: 100,
        cacheReadInputTokens: 20,
        outputTokens: 30,
        reasoningOutputTokens: 10,
      },
    },
    ...overrides,
  })}\n`;
}

function bind(overrides: Partial<Parameters<typeof bindPureCodexReceipt>[0]> = {}) {
  const report = reportWith();
  return bindPureCodexReceipt({
    playMode: "pure",
    provider: "codex",
    agentExitStatus: 0,
    verifierExitStatus: 5,
    attempt: 0,
    requestedModel: MODEL,
    expectedRunSeed: 4244,
    expectedGitCommit: BUILD.git_commit,
    expectedTrackedWorktreeClean: true,
    primaryEnvelopeBytes: bytes(envelope(report)),
    runEvidenceBytes: bytes(evidence()),
    reportBytes: bytes(report),
    ...overrides,
  });
}

describe("pure Codex receipt binding", () => {
  it("replaces only the malformed receipt value and passes the unchanged verifier", () => {
    const original = reportWith();
    const result = bind();
    expect(result.ok, result.ok ? undefined : result.reason).toBe(true);
    if (!result.ok) return;

    const bound = Buffer.from(result.reportBytes).toString("utf8");
    const originalReceiptText = JSON.stringify(MALFORMED_RECEIPT);
    const receiptOffset = original.indexOf(originalReceiptText);
    expect(receiptOffset).toBeGreaterThan(0);
    expect(bound.startsWith(original.slice(0, receiptOffset))).toBe(true);
    expect(bound.endsWith(original.slice(receiptOffset + originalReceiptText.length))).toBe(true);
    expect(
      verifyBlindReportText(bound, {
        requiredPlayMode: "pure",
        runEvidenceText: evidence(),
      }).ok,
    ).toBe(true);
    expect(result.metadata).toMatchObject({
      schema_version: 1,
      binding_kind: "server_exit_receipt",
      binding_count: 1,
      render_version: 1,
      provider: "codex",
      provider_session_id: PROVIDER_SESSION_ID,
      requested_model: MODEL,
      run_seed: 4244,
      build: BUILD,
      game_session_id: "ow-receipt-binding",
      replaced_field: "journey_exit_receipt",
      initial_failure: "receipt_invalid",
      ratings: { clarity: 4, enjoyment: 5 },
      receipt_hash: receipt().receiptHash,
    });
  });

  it("deterministically reproduces the exact bound bytes and strict metadata", () => {
    const original = reportWith();
    const primary = envelope(original);
    const rawEvidence = evidence();
    const result = bind({
      primaryEnvelopeBytes: bytes(primary),
      runEvidenceBytes: bytes(rawEvidence),
      reportBytes: bytes(original),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const reproduced = reproducePureCodexReceiptBinding({
      primaryEnvelopeBytes: bytes(primary),
      originalReportBytes: bytes(original),
      runEvidenceBytes: bytes(rawEvidence),
      metadata: result.metadata,
    });
    expect(reproduced.ok, reproduced.ok ? undefined : reproduced.reason).toBe(true);
    if (!reproduced.ok) return;
    expect(reproduced.reportBytes).toEqual(result.reportBytes);
    expect(reproduced.metadata).toEqual(result.metadata);
  });

  it("binds an otherwise valid but mismatched receipt", () => {
    const wrongReceipt = { ...receipt(), acceptedDecisions: 41 };
    const original = reportWith(wrongReceipt);
    const result = bind({
      primaryEnvelopeBytes: bytes(envelope(original)),
      reportBytes: bytes(original),
    });
    expect(result.ok, result.ok ? undefined : result.reason).toBe(true);
    if (!result.ok) return;
    expect(result.metadata.initial_failure).toBe("receipt_invalid");
  });

  it.each([
    ["structural mode", { playMode: "structural" }],
    ["non-Codex provider", { provider: "claude" }],
    ["nonzero agent exit", { agentExitStatus: 1 }],
    ["successful initial verifier", { verifierExitStatus: 0 }],
    ["later attempt", { attempt: 1 }],
    ["no journey exit", { runEvidenceBytes: bytes(evidence("no-exit")) }],
    ["duplicate journey exit", { runEvidenceBytes: bytes(evidence("duplicate-exit")) }],
    ["wrong seed", { expectedRunSeed: 4245 }],
    ["wrong commit", { expectedGitCommit: "d".repeat(40) }],
    ["wrong cleanliness", { expectedTrackedWorktreeClean: false }],
  ])("rejects %s", (_label, overrides) => {
    expect(bind(overrides).ok).toBe(false);
  });

  it("rejects an already valid report", () => {
    const valid = reportWith(receipt());
    expect(
      bind({
        primaryEnvelopeBytes: bytes(envelope(valid)),
        reportBytes: bytes(valid),
      }).ok,
    ).toBe(false);
  });

  it("requires an exact, internally consistent completed Codex envelope", () => {
    const original = reportWith();
    expect(
      bind({ primaryEnvelopeBytes: bytes(envelope(original, { provider: "claude" })) }).ok,
    ).toBe(false);
    expect(
      bind({ primaryEnvelopeBytes: bytes(envelope(original, { requested_model: "other" })) }).ok,
    ).toBe(false);
    expect(
      bind({
        primaryEnvelopeBytes: bytes(
          envelope(original, {
            modelUsage: {
              [MODEL]: {
                inputTokens: 99,
                cacheReadInputTokens: 20,
                outputTokens: 30,
                reasoningOutputTokens: 10,
              },
            },
          }),
        ),
      }).ok,
    ).toBe(false);
    expect(
      bind({ primaryEnvelopeBytes: bytes(envelope(original, { result: `${original}\n` })) }).ok,
    ).toBe(false);
    expect(bind({ primaryEnvelopeBytes: bytes(envelope(original, { unexpected: true })) }).ok).toBe(
      false,
    );

    const duplicateResult = envelope(original).replace(
      '"result":',
      '"result":"forged report","result":',
    );
    expect(bind({ primaryEnvelopeBytes: bytes(duplicateResult) })).toMatchObject({
      ok: false,
      reason: expect.stringMatching(/duplicate JSON object key "result"/i),
    });
  });

  it("rejects conflicting duplicate receipt keys in raw run evidence", () => {
    const duplicateReceipt = evidence().replace(
      '"receipt":',
      '"receipt":{"receiptHash":"forged"},"receipt":',
    );
    expect(bind({ runEvidenceBytes: bytes(duplicateReceipt) })).toMatchObject({
      ok: false,
      reason: expect.stringMatching(/duplicate JSON object key "receipt"/i),
    });
  });

  it("rejects non-receipt report failures and subjective drift", () => {
    const noPlaythrough = reportWith().replace("## Playthrough log", "## Journey notes");
    expect(
      bind({
        primaryEnvelopeBytes: bytes(envelope(noPlaythrough)),
        reportBytes: bytes(noPlaythrough),
      }).ok,
    ).toBe(false);

    const mismatchedRating = reportWith(MALFORMED_RECEIPT, { ...SUBJECTIVE, clarity: 3 });
    expect(
      bind({
        primaryEnvelopeBytes: bytes(envelope(mismatchedRating)),
        reportBytes: bytes(mismatchedRating),
      }).ok,
    ).toBe(false);
  });

  it("requires exactly one final unambiguous exit-interview block", () => {
    const original = reportWith();
    const duplicate = `${original}\n${original.slice(original.indexOf("```json exit-interview"))}`;
    expect(
      bind({
        primaryEnvelopeBytes: bytes(envelope(duplicate)),
        reportBytes: bytes(duplicate),
      }).ok,
    ).toBe(false);

    const trailing = `${original}trailing provider text`;
    expect(
      bind({
        primaryEnvelopeBytes: bytes(envelope(trailing)),
        reportBytes: bytes(trailing),
      }).ok,
    ).toBe(false);

    const duplicateKey = original.replace('"clarity":4', '"clarity":4,"clarity":4');
    expect(
      bind({
        primaryEnvelopeBytes: bytes(envelope(duplicateKey)),
        reportBytes: bytes(duplicateKey),
      }).ok,
    ).toBe(false);
  });

  it("fails closed when any hashed input or metadata changes", () => {
    const original = reportWith();
    const primary = envelope(original);
    const result = bind();
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(
      reproducePureCodexReceiptBinding({
        primaryEnvelopeBytes: bytes(primary),
        originalReportBytes: bytes(original),
        runEvidenceBytes: bytes(`${evidence()}\n`),
        metadata: result.metadata,
      }).ok,
    ).toBe(false);
    expect(
      reproducePureCodexReceiptBinding({
        primaryEnvelopeBytes: bytes(primary),
        originalReportBytes: bytes(original),
        runEvidenceBytes: bytes(evidence()),
        metadata: { ...result.metadata, bound_report_sha256: "d".repeat(64) },
      }).ok,
    ).toBe(false);
  });

  it("uses a zero-model attempt-zero launcher path", () => {
    const runner = readFileSync(new URL("../../blind-tester/run.sh", import.meta.url), "utf8");
    const start = runner.indexOf("# Codex has no resumed report turn.");
    const end = runner.indexOf("# The sole repairable case", start);
    expect(start).toBeGreaterThan(0);
    expect(end).toBeGreaterThan(start);
    const bindingBranch = runner.slice(start, end);
    expect(bindingBranch).toContain("scripts/blind-receipt-binding.ts bind");
    expect(bindingBranch).toContain("--attempt 0");
    expect(bindingBranch).toContain("scripts/verify-blind-report.ts");
    expect(bindingBranch).not.toMatch(/\bcodex exec\b|\bclaude\b|--resume|mcp__adventureforge__/u);
  });
});
