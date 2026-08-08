import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { verifyCyclePlaytest } from "../../scripts/verify-cycle-playtest.js";
import { hashState } from "../../src/core/hash.js";
import { loadOverworldManifest } from "../../src/world/source.js";

const EXPECTED_COMMIT = "a".repeat(40);
const CURRENT_WORLD = loadOverworldManifest(process.cwd());
const CURRENT_WORLD_HASH = hashState(CURRENT_WORLD);

function fixture(expectedCommit = EXPECTED_COMMIT): {
  report: string;
  evidence: string;
  sidecar: string;
} {
  const decisionProofHash = "b".repeat(64);
  const receiptPayload = {
    contractVersion: 1,
    exitReason: "player_ended_at_choice",
    goalVersion: 1,
    goalId: "albany_local_lead",
    goalStatus: "active",
    acceptedDecisions: 40,
    exitReasons: ["checkpoint"],
    checkpoint: 40,
    decisionProofHash,
    retentionHistory: [
      {
        sequence: 1,
        atDecision: 40,
        reasons: ["checkpoint"],
        checkpoint: 40,
        choice: "end",
        decisionProofHash,
      },
    ],
  };
  const receipt = { ...receiptPayload, receiptHash: hashState(receiptPayload) };
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
    best_moment: "Following the local lead.",
    worst_moment: "The opening was dense.",
    would_replay: true,
    verdict: "The journey was coherent and worth continuing.",
  };
  const report = `# Cycle playtest

## Playthrough log

I followed the fresh-overworld goal until the journey checkpoint, then chose to end.

Clarity: 4/5. Enjoyment: 4/5.

## Verdict

The journey was coherent and worth continuing.

\`\`\`json exit-interview
${JSON.stringify(interview, null, 2)}
\`\`\`
`;
  const build = {
    git_commit: expectedCommit,
    tracked_worktree_clean: true,
    world_id: CURRENT_WORLD.id,
    world_hash: CURRENT_WORLD_HASH,
  };
  const evidence = `${JSON.stringify({
    schema_version: 2,
    play_mode: "pure",
    event: "fresh_start",
    start_surface: "fresh_overworld",
    session_id: "o-cycle-gate",
    run_seed: 17,
    build,
  })}\n${JSON.stringify({
    schema_version: 2,
    play_mode: "pure",
    event: "journey_exit",
    start_surface: "fresh_overworld",
    session_id: "o-cycle-gate",
    run_seed: 17,
    build,
    quest_outcomes: [],
    receipt,
  })}\n`;
  const sidecar = JSON.stringify({
    schema_version: 2,
    report_schema_version: 2,
    play_mode: "pure",
    start_surface: "fresh_overworld",
    retention_eligible: true,
    evidence_status: "verified",
    session_id: "o-cycle-gate",
    run_seed: 17,
    build,
    quest_outcomes: [],
    receipt,
  });
  return { report, evidence, sidecar };
}

function withCycle(
  run: (paths: {
    root: string;
    runId: string;
    report: string;
    evidence: string;
    sidecar: string;
  }) => void,
): void {
  const root = mkdtempSync(join(tmpdir(), "cycle-playtest-"));
  const runId = "2026-08-05T12-00-00-000Z";
  const runDir = join(root, "ai-runs", runId);
  mkdirSync(runDir, { recursive: true });
  const report = join(runDir, "playtest.md");
  const evidence = join(runDir, "playtest.evidence.jsonl");
  const sidecar = join(runDir, "playtest.run.json");
  writeFileSync(
    join(root, "ai-runs", "latest-cycle.json"),
    JSON.stringify({ runId, playtestRecord: `ai-runs/${runId}/playtest.md` }),
  );
  try {
    run({ root, runId, report, evidence, sidecar });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function verify(root: string, expectedCommit = EXPECTED_COMMIT) {
  return verifyCyclePlaytest({
    root,
    worldRoot: process.cwd(),
    expectedCommit,
  });
}

describe("cycle playtest gate", () => {
  it("accepts a sidecar-last V2 pure report bound to the provisional commit", () => {
    withCycle(({ root, report, evidence, sidecar }) => {
      const valid = fixture();
      writeFileSync(report, valid.report);
      writeFileSync(evidence, valid.evidence);
      writeFileSync(sidecar, valid.sidecar);

      expect(verify(root)).toMatchObject({ ok: true });
    });
  });

  it("rejects a sidecar-only fabrication without runner-published raw evidence", () => {
    withCycle(({ root, report, sidecar }) => {
      const fabricated = fixture();
      writeFileSync(report, fabricated.report);
      writeFileSync(sidecar, fabricated.sidecar);

      const result = verify(root);
      expect(result).toMatchObject({ ok: false });
      if (!result.ok) expect(result.reason).toContain("raw run evidence is missing");
    });
  });

  it("rejects stale-revision evidence and out-of-order runner publication", () => {
    withCycle(({ root, report, evidence, sidecar }) => {
      const stale = fixture("d".repeat(40));
      writeFileSync(report, stale.report);
      writeFileSync(evidence, stale.evidence);
      writeFileSync(sidecar, stale.sidecar);

      const revisionResult = verify(root);
      expect(revisionResult).toMatchObject({ ok: false });
      if (!revisionResult.ok) expect(revisionResult.reason).toContain("expected");

      const valid = fixture();
      writeFileSync(evidence, valid.evidence);
      writeFileSync(sidecar, valid.sidecar);
      const old = new Date("2020-01-01T00:00:00.000Z");
      const recent = new Date("2020-01-01T00:00:10.000Z");
      utimesSync(evidence, old, old);
      utimesSync(report, recent, recent);
      const evidenceOrderingResult = verify(root);
      expect(evidenceOrderingResult).toMatchObject({ ok: false });
      if (!evidenceOrderingResult.ok) {
        expect(evidenceOrderingResult.reason).toContain("raw run evidence predates its report");
      }

      utimesSync(evidence, recent, recent);
      utimesSync(sidecar, old, old);
      const sidecarOrderingResult = verify(root);
      expect(sidecarOrderingResult).toMatchObject({ ok: false });
      if (!sidecarOrderingResult.ok) {
        expect(sidecarOrderingResult.reason).toContain("sidecar predates its raw run evidence");
      }
    });
  });

  it("rejects a sidecar whose build was edited after different raw evidence", () => {
    withCycle(({ root, report, evidence, sidecar }) => {
      const stale = fixture("d".repeat(40));
      const transplanted = JSON.parse(stale.sidecar) as {
        build: { git_commit: string };
      };
      transplanted.build.git_commit = EXPECTED_COMMIT;
      writeFileSync(report, stale.report);
      writeFileSync(evidence, stale.evidence);
      writeFileSync(sidecar, JSON.stringify(transplanted));

      const result = verify(root);
      expect(result).toMatchObject({ ok: false });
      if (!result.ok) expect(result.reason).toContain("does not reproduce");
    });
  });

  it("rejects mutually consistent evidence that names a different current world hash", () => {
    withCycle(({ root, report, evidence, sidecar }) => {
      const valid = fixture();
      const wrongWorldHash = "e".repeat(64);
      writeFileSync(report, valid.report);
      writeFileSync(evidence, valid.evidence.replaceAll(CURRENT_WORLD_HASH, wrongWorldHash));
      writeFileSync(sidecar, valid.sidecar.replaceAll(CURRENT_WORLD_HASH, wrongWorldHash));

      const result = verify(root);
      expect(result).toMatchObject({ ok: false });
      if (!result.ok) expect(result.reason).toContain("expected current world hash");
    });
  });

  it("rejects a metadata pointer outside its own run directory", () => {
    withCycle(({ root, runId, report, evidence, sidecar }) => {
      const valid = fixture();
      writeFileSync(report, valid.report);
      writeFileSync(evidence, valid.evidence);
      writeFileSync(sidecar, valid.sidecar);
      writeFileSync(
        join(root, "ai-runs", "latest-cycle.json"),
        JSON.stringify({ runId, playtestRecord: "ai-runs/older/playtest.md" }),
      );

      const result = verify(root);
      expect(result).toMatchObject({ ok: false });
      if (!result.ok) expect(result.reason).toContain("current run path");
    });
  });

  it("rejects a report whose receipt differs from the runner sidecar", () => {
    withCycle(({ root, report, evidence, sidecar }) => {
      const valid = fixture();
      writeFileSync(
        report,
        valid.report.replace('"acceptedDecisions": 40', '"acceptedDecisions": 41'),
      );
      writeFileSync(evidence, valid.evidence);
      writeFileSync(sidecar, valid.sidecar);

      const result = verify(root);
      expect(result).toMatchObject({ ok: false });
      if (!result.ok) expect(result.reason).toMatch(/receipt|interview/);
    });
  });
});
