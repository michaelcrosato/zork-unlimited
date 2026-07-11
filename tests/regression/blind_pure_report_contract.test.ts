import { describe, expect, it } from "vitest";
import { verifyBlindReportText } from "../../src/blind/report_verifier.js";
import { parseRunEvidenceJsonl } from "../../src/blind/run_evidence.js";
import { hashState } from "../../src/core/hash.js";

const HASH_A = "a".repeat(64);

function receipt(atDecision = 40) {
  const retentionHistory = [];
  for (let checkpoint = 40, sequence = 1; checkpoint <= atDecision; checkpoint += 40, sequence++) {
    retentionHistory.push({
      sequence,
      atDecision: checkpoint,
      reasons: ["checkpoint"],
      checkpoint,
      choice: checkpoint === atDecision ? "end" : "continue",
      decisionProofHash: HASH_A,
    });
  }
  const payload = {
    contractVersion: 1,
    exitReason: "player_ended_at_choice",
    goalVersion: 1,
    goalId: "albany_local_lead",
    goalStatus: "active",
    acceptedDecisions: atDecision,
    exitReasons: ["checkpoint"],
    checkpoint: atDecision,
    decisionProofHash: HASH_A,
    retentionHistory,
  };
  return { ...payload, receiptHash: hashState(payload) };
}

function earlyGoalReceipt() {
  const payload = {
    contractVersion: 1,
    exitReason: "player_ended_at_choice",
    goalVersion: 1,
    goalId: "albany_local_lead",
    goalStatus: "completed",
    acceptedDecisions: 17,
    exitReasons: ["goal_completed"],
    checkpoint: null,
    decisionProofHash: HASH_A,
    retentionHistory: [
      {
        sequence: 1,
        atDecision: 17,
        reasons: ["goal_completed"],
        checkpoint: null,
        choice: "end",
        decisionProofHash: HASH_A,
      },
    ],
  };
  return { ...payload, receiptHash: hashState(payload) };
}

function report(interview: Record<string, unknown>): string {
  return `
## 1. Playthrough log
I made natural player decisions until the game offered its journey choice, then ended it.

## 2. Did it work mechanically?
No rejected calls or soft-locks.

## 3. Understandable & fun?
Clarity 4/5. Enjoyment 4/5.

## 4. Confusion / friction points
None noted.

## 5. Bugs or design flaws
None found.

## 6. Verdict
A real new player could understand this journey and make an informed decision to continue.

## 7. Exit interview

\`\`\`json exit-interview
${JSON.stringify(interview, null, 2)}
\`\`\`
`;
}

function common() {
  return {
    clarity: 4,
    enjoyment: 4,
    goal_understood: true,
    got_stuck: false,
    confusions: [],
    bugs: [],
    best_moment: "Choosing a visible lead without outside knowledge.",
    worst_moment: "One transition was slower than expected.",
    would_replay: true,
    verdict: "A real new player could understand this journey and make an informed choice.",
  };
}

function pureInterview(overrides: Record<string, unknown> = {}) {
  return {
    schema_version: 2,
    play_mode: "pure",
    start_surface: "fresh_overworld",
    retention_eligible: true,
    journey_exit_receipt: receipt(),
    ...common(),
    ...overrides,
  };
}

function evidence(receiptValue: Record<string, unknown> = receipt()): string {
  return [
    {
      schema_version: 1,
      play_mode: "pure",
      event: "fresh_start",
      start_surface: "fresh_overworld",
      session_id: "ow-test",
    },
    {
      schema_version: 1,
      play_mode: "pure",
      event: "journey_exit",
      start_surface: "fresh_overworld",
      session_id: "ow-test",
      receipt: receiptValue,
    },
  ]
    .map((row) => JSON.stringify(row))
    .join("\n");
}

describe("blind V2 pure/structural report contract", () => {
  it("accepts a 40-decision pure receipt only with matching private run evidence", () => {
    const result = verifyBlindReportText(report(pureInterview()), {
      requiredPlayMode: "pure",
      runEvidenceText: evidence(),
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.run?.play_mode).toBe("pure");
      expect(result.run?.retention_eligible).toBe(true);
      if (result.run?.play_mode === "pure") {
        expect(result.run.receipt.acceptedDecisions).toBe(40);
      }
    }
  });

  it("rejects pure reports without evidence or with a mismatched receipt", () => {
    const noEvidence = verifyBlindReportText(report(pureInterview()), {
      requiredPlayMode: "pure",
    });
    expect(noEvidence.ok).toBe(false);
    if (!noEvidence.ok) expect(noEvidence.reason).toContain("run evidence");

    const mismatch = verifyBlindReportText(report(pureInterview()), {
      requiredPlayMode: "pure",
      runEvidenceText: evidence(earlyGoalReceipt()),
    });
    expect(mismatch.ok).toBe(false);
    if (!mismatch.ok) expect(mismatch.reason).toContain("does not match");
  });

  it("accepts an honest early goal-completion exit without inventing a checkpoint", () => {
    const early = earlyGoalReceipt();
    const result = verifyBlindReportText(report(pureInterview({ journey_exit_receipt: early })), {
      requiredPlayMode: "pure",
      runEvidenceText: evidence(early),
    });
    expect(result.ok).toBe(true);
    if (result.ok && result.run?.play_mode === "pure") {
      expect(result.run.receipt.acceptedDecisions).toBe(17);
      expect(result.run.receipt.checkpoint).toBeNull();
    }
  });

  it("retains the player's continue-at-40 decision before an end-at-80 receipt", () => {
    const continued = receipt(80);
    const result = verifyBlindReportText(
      report(pureInterview({ journey_exit_receipt: continued })),
      { requiredPlayMode: "pure", runEvidenceText: evidence(continued) },
    );
    expect(result.ok).toBe(true);
    if (result.ok && result.run?.play_mode === "pure") {
      expect(result.run.receipt.retentionHistory.map((event) => event.choice)).toEqual([
        "continue",
        "end",
      ]);
      expect(result.run.receipt.acceptedDecisions).toBe(80);
    }
  });

  it("keeps legacy interviews readable but never qualifies them as pure", () => {
    const legacy = report(common());
    expect(verifyBlindReportText(legacy).ok).toBe(true);
    const pure = verifyBlindReportText(legacy, {
      requiredPlayMode: "pure",
      runEvidenceText: evidence(),
    });
    expect(pure.ok).toBe(false);
    if (!pure.ok) expect(pure.reason).toContain("V2 pure");
  });

  it("labels explicit mocks structural and retention-ineligible", () => {
    const structural = report({
      schema_version: 2,
      play_mode: "structural",
      start_surface: "fresh_overworld",
      retention_eligible: false,
      structural_kind: "mock",
      ...common(),
    });
    const accepted = verifyBlindReportText(structural, { requiredPlayMode: "structural" });
    expect(accepted.ok).toBe(true);
    if (accepted.ok) {
      expect(accepted.run?.play_mode).toBe("structural");
      expect(accepted.run?.retention_eligible).toBe(false);
    }
    expect(
      verifyBlindReportText(structural, {
        requiredPlayMode: "pure",
        runEvidenceText: evidence(),
      }).ok,
    ).toBe(false);
  });

  it("requires one fresh start followed by a same-session final exit", () => {
    expect(parseRunEvidenceJsonl(evidence()).ok).toBe(true);
    const duplicateStart = `${evidence().split("\n")[0]}\n${evidence()}`;
    const duplicate = parseRunEvidenceJsonl(duplicateStart);
    expect(duplicate.ok).toBe(false);
    if (!duplicate.ok) expect(duplicate.reason).toContain("exactly one fresh_start");

    const rows = evidence()
      .split("\n")
      .map((line) => JSON.parse(line));
    rows[1].session_id = "other";
    const wrongSession = parseRunEvidenceJsonl(rows.map((row) => JSON.stringify(row)).join("\n"));
    expect(wrongSession.ok).toBe(false);
    if (!wrongSession.ok) expect(wrongSession.reason).toContain("session ids differ");
  });
});
