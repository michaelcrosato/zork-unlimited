import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { hashState } from "../../src/core/hash.js";
import {
  bytesMatchHash,
  extractRecoveredReport,
  isRecoverableBlindReportReason,
  preparePureReportRecovery,
} from "../../src/blind/report_recovery.js";
import { verifyBlindReportText } from "../../src/blind/report_verifier.js";
import {
  INITIAL_JOURNEY_GOAL,
  JOURNEY_CONTRACT_VERSION,
} from "../../src/world/journey_contract.js";

const SESSION_ID = "10852ae5-43b1-424a-aa39-7ba347361cec";
const HASH = "a".repeat(64);
const BUILD = {
  git_commit: "b".repeat(40),
  tracked_worktree_clean: true,
  world_id: "new_york_overworld",
  world_hash: "c".repeat(64),
};

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
    session_id: "ow-recovery",
    run_seed: 2734,
    build: BUILD,
  };
  const exit = {
    schema_version: 2,
    play_mode: "pure",
    event: "journey_exit",
    start_surface: "fresh_overworld",
    session_id: "ow-recovery",
    run_seed: 2734,
    build: BUILD,
    quest_outcomes: [["wolf_winter", "ending_pack_diverted"]],
    receipt: receipt(),
  };
  const events =
    rows === "no-exit" ? [start] : rows === "duplicate-exit" ? [start, exit, exit] : [start, exit];
  return events.map((event) => JSON.stringify(event)).join("\n");
}

const REPORT = `## Playthrough log
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

function primaryEnvelope(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    type: "result",
    subtype: "success",
    is_error: false,
    session_id: SESSION_ID,
    result: REPORT,
    stop_reason: "end_turn",
    terminal_reason: "completed",
    permission_denials: [],
    modelUsage: { "claude-sonnet-5": {} },
    ...overrides,
  });
}

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

function recoveryEnvelope(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    type: "result",
    subtype: "success",
    is_error: false,
    session_id: SESSION_ID,
    result: JSON.stringify(SUBJECTIVE),
    structured_output: SUBJECTIVE,
    stop_reason: "tool_use",
    terminal_reason: "completed",
    permission_denials: [],
    modelUsage: { "claude-sonnet-5": {} },
    ...overrides,
  });
}

function prepare(overrides: Partial<Parameters<typeof preparePureReportRecovery>[0]> = {}) {
  return preparePureReportRecovery({
    playMode: "pure",
    agentExitStatus: 0,
    verifierExitStatus: 5,
    attempt: 0,
    requestedModel: "sonnet",
    expectedRunSeed: 2734,
    expectedGitCommit: BUILD.git_commit,
    expectedTrackedWorktreeClean: true,
    claudeEnvelopeBytes: bytes(primaryEnvelope()),
    runEvidenceBytes: bytes(evidence()),
    reportBytes: bytes(REPORT),
    ...overrides,
  });
}

describe("pure blind report-only recovery gate", () => {
  it("authorizes exactly one missing-interview repair after a real v2 exit", () => {
    const decision = prepare();
    expect(decision.ok, decision.ok ? undefined : decision.reason).toBe(true);
    if (!decision.ok) return;
    expect(decision.metadata).toMatchObject({
      schema_version: 1,
      recovery_count: 1,
      claude_session_id: SESSION_ID,
      requested_model: "sonnet",
      model_usage_key: "claude-sonnet-5",
      run_seed: 2734,
      build: BUILD,
      ratings: { clarity: 4, enjoyment: 5 },
    });
    expect(decision.prompt).toContain("Do not call any tool");
    expect(decision.prompt).toContain("clarity must be 4 and enjoyment must be 5");
    expect(decision.prompt).not.toContain("receiptHash");
  });

  it.each([
    ["structural mode", { playMode: "structural" }],
    ["nonzero Claude exit", { agentExitStatus: 124 }],
    ["already valid verifier", { verifierExitStatus: 0 }],
    ["second attempt", { attempt: 1 }],
    ["no journey exit", { runEvidenceBytes: bytes(evidence("no-exit")) }],
    ["duplicate journey exit", { runEvidenceBytes: bytes(evidence("duplicate-exit")) }],
    ["wrong launch seed", { expectedRunSeed: 2735 }],
    ["wrong launch commit", { expectedGitCommit: "d".repeat(40) }],
    ["wrong launch cleanliness", { expectedTrackedWorktreeClean: false }],
  ])("rejects %s", (_label, overrides) => {
    expect(prepare(overrides).ok).toBe(false);
  });

  it("rejects MCP/mechanical and substantive report failures", () => {
    const mcpFailure = REPORT.replace(
      "Yes. The game tools and state transitions worked throughout.",
      "Required AdventureForge MCP tools are unavailable.",
    );
    expect(
      prepare({
        reportBytes: bytes(mcpFailure),
        claudeEnvelopeBytes: bytes(primaryEnvelope({ result: mcpFailure })),
      }).ok,
    ).toBe(false);

    const missingVerdict = REPORT.replace(/\n\n## Verdict[\s\S]*/, "");
    expect(
      prepare({
        reportBytes: bytes(missingVerdict),
        claudeEnvelopeBytes: bytes(primaryEnvelope({ result: missingVerdict })),
      }).ok,
    ).toBe(false);
  });

  it("requires a completed exact primary envelope and the requested singleton model", () => {
    expect(
      prepare({ claudeEnvelopeBytes: bytes(primaryEnvelope({ stop_reason: "tool_use" })) }).ok,
    ).toBe(false);
    expect(
      prepare({ claudeEnvelopeBytes: bytes(primaryEnvelope({ terminal_reason: "error" })) }).ok,
    ).toBe(false);
    expect(
      prepare({
        claudeEnvelopeBytes: bytes(
          primaryEnvelope({
            modelUsage: { "claude-sonnet-5": {}, "claude-haiku-4-5": {} },
          }),
        ),
      }).ok,
    ).toBe(false);
    expect(prepare({ requestedModel: "haiku" }).ok).toBe(false);
    expect(
      prepare({ claudeEnvelopeBytes: bytes(primaryEnvelope({ result: `${REPORT}\n` })) }).ok,
    ).toBe(false);
  });

  it("recovers verifier-compatible ratings written before their labels", () => {
    const reverseRatings = REPORT.replace(
      "Clarity: 4/5. Enjoyment: 5/5.",
      "4/5 clarity. 5/5 enjoyment.",
    );
    const decision = prepare({
      reportBytes: bytes(reverseRatings),
      claudeEnvelopeBytes: bytes(primaryEnvelope({ result: reverseRatings })),
    });
    expect(decision.ok, decision.ok ? undefined : decision.reason).toBe(true);
  });

  it("permits only the exact missing-interview verifier reason", () => {
    expect(
      isRecoverableBlindReportReason(
        "missing exit interview (a ```json exit-interview fenced block is mandatory)",
      ),
    ).toBe(true);
    expect(isRecoverableBlindReportReason("report is empty")).toBe(false);
    expect(isRecoverableBlindReportReason("missing clarity rating")).toBe(false);
  });
});

describe("pure blind recovered interview renderer", () => {
  it("preserves original prose bytes, injects canonical receipt, and verifies", () => {
    const decision = prepare();
    expect(decision.ok).toBe(true);
    if (!decision.ok) return;
    const runEvidenceText = evidence();
    const result = extractRecoveredReport({
      recoveryEnvelopeBytes: bytes(recoveryEnvelope()),
      primaryEnvelopeBytes: bytes(primaryEnvelope()),
      originalReportBytes: bytes(REPORT),
      runEvidenceBytes: bytes(runEvidenceText),
      metadata: decision.metadata,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const report = Buffer.from(result.reportBytes).toString("utf8");
    expect(Buffer.from(result.reportBytes).subarray(0, bytes(REPORT).length)).toEqual(
      bytes(REPORT),
    );
    expect(report).toContain("<!-- adventureforge-report-recovery");
    expect(report).toContain(decision.metadata.run_evidence_sha256);
    expect(report).toContain('"journey_exit_receipt"');
    expect(
      verifyBlindReportText(report, {
        requiredPlayMode: "pure",
        runEvidenceText,
      }).ok,
    ).toBe(true);
  });

  it("rejects changed evidence, prose ratings, session, model, and non-structured output", () => {
    const decision = prepare();
    expect(decision.ok).toBe(true);
    if (!decision.ok) return;
    const base = {
      recoveryEnvelopeBytes: bytes(recoveryEnvelope()),
      primaryEnvelopeBytes: bytes(primaryEnvelope()),
      originalReportBytes: bytes(REPORT),
      runEvidenceBytes: bytes(evidence()),
      metadata: decision.metadata,
    };
    expect(extractRecoveredReport({ ...base, runEvidenceBytes: bytes(`${evidence()}\n`) }).ok).toBe(
      false,
    );
    expect(
      extractRecoveredReport({
        ...base,
        recoveryEnvelopeBytes: bytes(recoveryEnvelope({ session_id: crypto.randomUUID() })),
      }).ok,
    ).toBe(false);
    expect(
      extractRecoveredReport({
        ...base,
        recoveryEnvelopeBytes: bytes(recoveryEnvelope({ modelUsage: { "claude-haiku-4-5": {} } })),
      }).ok,
    ).toBe(false);
    const changedRatings = { ...SUBJECTIVE, clarity: 3 };
    expect(
      extractRecoveredReport({
        ...base,
        recoveryEnvelopeBytes: bytes(
          recoveryEnvelope({
            result: JSON.stringify(changedRatings),
            structured_output: changedRatings,
          }),
        ),
      }).ok,
    ).toBe(false);
    expect(
      extractRecoveredReport({
        ...base,
        recoveryEnvelopeBytes: bytes(
          recoveryEnvelope({
            structured_output: { ...SUBJECTIVE, bugs: undefined },
          }),
        ),
      }).ok,
    ).toBe(false);
  });

  it("hashes raw evidence bytes rather than parsed semantics", () => {
    const decision = prepare();
    expect(decision.ok).toBe(true);
    if (!decision.ok) return;
    expect(bytesMatchHash(bytes(evidence()), decision.metadata.run_evidence_sha256)).toBe(true);
    expect(bytesMatchHash(bytes(`${evidence()}\n`), decision.metadata.run_evidence_sha256)).toBe(
      false,
    );

    // Both invalid bytes decode to U+FFFD under lossy UTF-8 string conversion;
    // raw-byte hashing must still distinguish them.
    const invalidA = Buffer.from([0x80]);
    const invalidB = Buffer.from([0x81]);
    expect(invalidA.toString("utf8")).toBe(invalidB.toString("utf8"));
    const invalidAHash = createHash("sha256").update(invalidA).digest("hex");
    expect(bytesMatchHash(invalidA, invalidAHash)).toBe(true);
    expect(bytesMatchHash(invalidB, invalidAHash)).toBe(false);
    expect(prepare({ reportBytes: Buffer.concat([bytes(REPORT), invalidA]) }).ok).toBe(false);
  });
});
