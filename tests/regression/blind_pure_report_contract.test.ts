import { describe, expect, it } from "vitest";
import { CurrentJourneyExitReceiptSchema } from "../../src/blind/exit_interview.js";
import { verifyBlindReportText } from "../../src/blind/report_verifier.js";
import { parseBlindRunSidecar, parseRunEvidenceJsonl } from "../../src/blind/run_evidence.js";
import { hashState } from "../../src/core/hash.js";
import {
  INITIAL_JOURNEY_GOAL,
  JOURNEY_CONTRACT_VERSION,
} from "../../src/world/journey_contract.js";
import { ALBANY_DAWN_DISPATCH_GOALS } from "../../src/world/journey_campaign.js";

const HASH_A = "a".repeat(64);
const V2_BUILD = {
  git_commit: "b".repeat(40),
  tracked_worktree_clean: true,
  world_id: "new_york_overworld",
  world_hash: "c".repeat(64),
};

function receipt(atDecision = 40, contractVersion: 1 | 2 | 3 = JOURNEY_CONTRACT_VERSION) {
  const retentionHistory = [];
  for (let checkpoint = 40, sequence = 1; checkpoint <= atDecision; checkpoint += 40, sequence++) {
    retentionHistory.push({
      sequence,
      atDecision: checkpoint,
      reasons: ["checkpoint"],
      checkpoint,
      ...(contractVersion === JOURNEY_CONTRACT_VERSION ? { goalVersion: null, goalId: null } : {}),
      choice: checkpoint === atDecision ? "end" : "continue",
      decisionProofHash: HASH_A,
    });
  }
  const commonPayload = {
    contractVersion,
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
  const payload =
    contractVersion === JOURNEY_CONTRACT_VERSION
      ? {
          ...commonPayload,
          goalText: INITIAL_JOURNEY_GOAL.text,
          goalCompletedAtDecision: null,
          completedGoals: [],
        }
      : commonPayload;
  return { ...payload, receiptHash: hashState(payload) };
}

function earlyGoalReceipt() {
  const payload = {
    contractVersion: JOURNEY_CONTRACT_VERSION,
    exitReason: "player_ended_at_choice",
    goalVersion: 1,
    goalId: "albany_local_lead",
    goalText: INITIAL_JOURNEY_GOAL.text,
    goalStatus: "completed",
    goalCompletedAtDecision: 17,
    completedGoals: [
      {
        version: 1,
        id: INITIAL_JOURNEY_GOAL.id,
        text: INITIAL_JOURNEY_GOAL.text,
        status: "completed",
        completedAtDecision: 17,
      },
    ],
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
        goalVersion: 1,
        goalId: INITIAL_JOURNEY_GOAL.id,
        choice: "end",
        decisionProofHash: HASH_A,
      },
    ],
  };
  return { ...payload, receiptHash: hashState(payload) };
}

function multiGoalReceipt(completedAt: readonly [number, number] = [17, 25]) {
  const completedGoals = [
    {
      version: 1,
      id: INITIAL_JOURNEY_GOAL.id,
      text: INITIAL_JOURNEY_GOAL.text,
      status: "completed" as const,
      completedAtDecision: completedAt[0],
    },
    {
      version: 2,
      id: ALBANY_DAWN_DISPATCH_GOALS.send_wagon_to_cade.id,
      text: ALBANY_DAWN_DISPATCH_GOALS.send_wagon_to_cade.text,
      status: "completed" as const,
      completedAtDecision: completedAt[1],
    },
  ];
  const goalEvents = [...completedGoals]
    .sort((left, right) => left.completedAtDecision - right.completedAtDecision)
    .map((goal, index) => ({
      sequence: index + 1,
      atDecision: goal.completedAtDecision,
      reasons: ["goal_completed"],
      checkpoint: null,
      goalVersion: goal.version,
      goalId: goal.id,
      choice: "continue",
      decisionProofHash: HASH_A,
    }));
  const payload = {
    contractVersion: JOURNEY_CONTRACT_VERSION,
    exitReason: "player_ended_at_choice",
    goalVersion: 3,
    goalId: "oneonta_tanners_fever",
    goalText:
      "Travel to Oneonta Market Streets, find the lead for The Tanner's Fever, and see it through.",
    goalStatus: "active",
    goalCompletedAtDecision: null,
    completedGoals,
    acceptedDecisions: 40,
    exitReasons: ["checkpoint"],
    checkpoint: 40,
    decisionProofHash: HASH_A,
    retentionHistory: [
      ...goalEvents,
      {
        sequence: goalEvents.length + 1,
        atDecision: 40,
        reasons: ["checkpoint"],
        checkpoint: 40,
        goalVersion: null,
        goalId: null,
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

function evidenceV2(receiptValue: Record<string, unknown> = receipt()): string {
  return [
    {
      schema_version: 2,
      play_mode: "pure",
      event: "fresh_start",
      start_surface: "fresh_overworld",
      session_id: "ow-v2",
      run_seed: 2731,
      build: V2_BUILD,
    },
    {
      schema_version: 2,
      play_mode: "pure",
      event: "journey_exit",
      start_surface: "fresh_overworld",
      session_id: "ow-v2",
      run_seed: 2731,
      build: V2_BUILD,
      quest_outcomes: [["wolf_winter", "ending_pack_diverted"]],
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

  it("keeps a frozen contract-v1 pure receipt verifiable as historical evidence", () => {
    const historical = receipt(40, 1);
    const result = verifyBlindReportText(
      report(pureInterview({ journey_exit_receipt: historical })),
      { requiredPlayMode: "pure", runEvidenceText: evidence(historical) },
    );
    expect(result.ok).toBe(true);
    if (result.ok && result.run?.play_mode === "pure") {
      expect(result.run.receipt.contractVersion).toBe(1);
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

  it("accepts ordered multi-goal evidence and rejects a reversed completion timeline", () => {
    const ordered = multiGoalReceipt();
    const result = verifyBlindReportText(report(pureInterview({ journey_exit_receipt: ordered })), {
      requiredPlayMode: "pure",
      runEvidenceText: evidence(ordered),
    });
    expect(result.ok).toBe(true);

    const reversed = CurrentJourneyExitReceiptSchema.safeParse(multiGoalReceipt([25, 17]));
    expect(reversed.success).toBe(false);
    if (!reversed.success) {
      expect(reversed.error.issues.some((issue) => /nondecreasing/.test(issue.message))).toBe(true);
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

  it("preserves private v2 seed, build, and authoritative quest outcomes", () => {
    const parsed = parseRunEvidenceJsonl(evidenceV2());
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.sidecar).toMatchObject({
      schema_version: 2,
      run_seed: 2731,
      build: V2_BUILD,
      quest_outcomes: [["wolf_winter", "ending_pack_diverted"]],
    });

    const verified = verifyBlindReportText(report(pureInterview()), {
      requiredPlayMode: "pure",
      runEvidenceText: evidenceV2(),
    });
    expect(verified.ok).toBe(true);
    expect(parseBlindRunSidecar(JSON.stringify(parsed.sidecar)).ok).toBe(true);

    const punctuationIds = ["a_b", "a-b"].sort((left, right) => left.localeCompare(right));
    const punctuationRows = evidenceV2()
      .split("\n")
      .map((line) => JSON.parse(line));
    punctuationRows[1].quest_outcomes = punctuationIds.map((questId) => [questId, "ending"]);
    expect(
      parseRunEvidenceJsonl(punctuationRows.map((row) => JSON.stringify(row)).join("\n")).ok,
    ).toBe(true);

    const historical = parseRunEvidenceJsonl(evidence());
    expect(historical.ok).toBe(true);
    if (historical.ok) {
      expect(historical.sidecar.schema_version).toBe(1);
      expect(parseBlindRunSidecar(JSON.stringify(historical.sidecar)).ok).toBe(true);
    }
  });

  it("rejects mixed, detached, or noncanonical v2 provenance", () => {
    const rows = evidenceV2()
      .split("\n")
      .map((line) => JSON.parse(line));

    const mismatchedSeed = structuredClone(rows);
    mismatchedSeed[1].run_seed = 2732;
    const seedResult = parseRunEvidenceJsonl(
      mismatchedSeed.map((row) => JSON.stringify(row)).join("\n"),
    );
    expect(seedResult.ok).toBe(false);
    if (!seedResult.ok) expect(seedResult.reason).toContain("seeds differ");

    const mismatchedBuild = structuredClone(rows);
    mismatchedBuild[1].build.git_commit = "d".repeat(40);
    const buildResult = parseRunEvidenceJsonl(
      mismatchedBuild.map((row) => JSON.stringify(row)).join("\n"),
    );
    expect(buildResult.ok).toBe(false);
    if (!buildResult.ok) expect(buildResult.reason).toContain("builds differ");

    const mixed = structuredClone(rows);
    mixed[0] = JSON.parse(evidence().split("\n")[0]!);
    mixed[0].session_id = "ow-v2";
    const mixedResult = parseRunEvidenceJsonl(mixed.map((row) => JSON.stringify(row)).join("\n"));
    expect(mixedResult.ok).toBe(false);
    if (!mixedResult.ok) expect(mixedResult.reason).toContain("schema versions differ");

    for (const mutate of [
      (candidate: typeof rows) => {
        candidate[0].run_seed = Number.MAX_SAFE_INTEGER + 1;
      },
      (candidate: typeof rows) => {
        candidate[0].build.world_hash = "not-a-world-hash";
      },
      (candidate: typeof rows) => {
        candidate[1].quest_outcomes = [
          ["wolf_winter", "ending_held"],
          ["sunken_barrow", "ending_treasure"],
        ];
      },
      (candidate: typeof rows) => {
        candidate[1].quest_outcomes = [
          ["wolf_winter", "ending_held"],
          ["wolf_winter", "ending_pack_diverted"],
        ];
      },
    ]) {
      const candidate = structuredClone(rows);
      mutate(candidate);
      expect(parseRunEvidenceJsonl(candidate.map((row) => JSON.stringify(row)).join("\n")).ok).toBe(
        false,
      );
    }
  });
});
