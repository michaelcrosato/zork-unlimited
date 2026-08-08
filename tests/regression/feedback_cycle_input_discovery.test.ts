import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { hashState } from "../../src/core/hash.js";
import {
  canonicalCycleReportRef,
  discoverCanonicalCycleReports,
  isCycleStamp,
  resolveFeedbackInputs,
} from "../../src/feedback/inputs.js";

function pureSidecarV2(sessionId = "o-cycle-1"): Record<string, unknown> {
  const decisionProofHash = "a".repeat(64);
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
  return {
    schema_version: 2,
    report_schema_version: 2,
    play_mode: "pure",
    start_surface: "fresh_overworld",
    retention_eligible: true,
    evidence_status: "verified",
    session_id: sessionId,
    run_seed: 7,
    build: {
      git_commit: "b".repeat(40),
      tracked_worktree_clean: true,
      world_id: "new_york_overworld",
      world_hash: "c".repeat(64),
    },
    quest_outcomes: [],
    receipt: { ...receiptPayload, receiptHash: hashState(receiptPayload) },
  };
}

function writeCandidate(root: string, stamp: string, sidecar: unknown = pureSidecarV2()): string {
  const dir = join(root, "ai-runs", stamp);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "playtest.md"), "verified later by collectInputs\n");
  writeFileSync(join(dir, "playtest.run.json"), `${JSON.stringify(sidecar)}\n`);
  return dir;
}

describe("feedback cycle input discovery regression", () => {
  it("discovers only immediate report + parseable pure-V2 sidecar candidates", () => {
    const root = mkdtempSync(join(tmpdir(), "feedback-inputs-"));
    writeCandidate(root, "2026-08-08T20-00-00-002Z", pureSidecarV2("o-later"));
    writeCandidate(root, "2026-08-08T20-00-00-001Z", pureSidecarV2("o-earlier"));

    const v1 = pureSidecarV2("o-v1");
    delete v1.run_seed;
    delete v1.build;
    delete v1.quest_outcomes;
    v1.schema_version = 1;
    writeCandidate(root, "2026-08-08T20-00-00-003Z", v1);

    writeCandidate(root, "2026-08-08T20-00-00-004Z", {
      schema_version: 1,
      report_schema_version: 2,
      play_mode: "structural",
      start_surface: "fresh_overworld",
      retention_eligible: false,
      evidence_status: "not_applicable",
      structural_kind: "smoke",
    });
    writeCandidate(root, "2026-02-30T20-00-00-005Z");
    writeCandidate(root, "2026-08-08T20-00-00-009Z", "not a sidecar object");

    const partial = join(root, "ai-runs", "2026-08-08T20-00-00-006Z");
    mkdirSync(partial, { recursive: true });
    writeFileSync(join(partial, "playtest.md"), "no publication sidecar\n");

    const alternate = join(root, "ai-runs", "2026-08-08T20-00-00-007Z");
    mkdirSync(alternate, { recursive: true });
    writeFileSync(join(alternate, "postchange-playtest.md"), "alternate report\n");
    writeFileSync(
      join(alternate, "postchange-playtest.run.json"),
      JSON.stringify(pureSidecarV2("o-alternate")),
    );

    writeCandidate(
      join(root, "ai-runs", "feedback"),
      "2026-08-08T20-00-00-008Z",
      pureSidecarV2("o-nested"),
    );

    expect(discoverCanonicalCycleReports(root)).toEqual([
      "ai-runs/2026-08-08T20-00-00-001Z/playtest.md",
      "ai-runs/2026-08-08T20-00-00-002Z/playtest.md",
    ]);
  });

  it("round-trips cycle stamps and canonical refs instead of accepting lookalikes", () => {
    const root = mkdtempSync(join(tmpdir(), "feedback-refs-"));
    const report = join(root, "ai-runs", "2026-08-08T20-00-00-001Z", "playtest.md");
    expect(isCycleStamp("2026-08-08T20-00-00-001Z")).toBe(true);
    expect(isCycleStamp("2026-02-30T20-00-00-001Z")).toBe(false);
    expect(isCycleStamp("20260808T200000Z")).toBe(false);
    expect(canonicalCycleReportRef(root, report)).toBe(
      "ai-runs/2026-08-08T20-00-00-001Z/playtest.md",
    );
    expect(
      canonicalCycleReportRef(root, report.replace("playtest.md", "postchange-playtest.md")),
    ).toBe(null);
  });

  it("keeps explicit inputs isolated and orders no-flags defaults deterministically", () => {
    const root = mkdtempSync(join(tmpdir(), "feedback-defaults-"));
    writeCandidate(root, "2026-08-08T20-00-00-001Z");
    for (const stamp of ["20260808T190000Z", "20260808T200000Z"]) {
      const crawl = join(root, "ai-runs", "crawl", stamp);
      mkdirSync(crawl, { recursive: true });
      writeFileSync(join(crawl, "findings.jsonl"), "\n");
    }

    expect(resolveFeedbackInputs(root, [])).toEqual([
      "blind-tester/reports",
      "ai-runs/2026-08-08T20-00-00-001Z/playtest.md",
      "ai-runs/crawl/20260808T200000Z/findings.jsonl",
    ]);
    expect(resolveFeedbackInputs(root, ["only-this.md"])).toEqual(["only-this.md"]);
  });

  it("does not follow a symlinked or junction-backed ai-runs root", () => {
    const root = mkdtempSync(join(tmpdir(), "feedback-linked-root-"));
    const outside = mkdtempSync(join(tmpdir(), "feedback-linked-outside-"));
    writeCandidate(outside, "2026-08-08T20-00-00-011Z");
    symlinkSync(
      join(outside, "ai-runs"),
      join(root, "ai-runs"),
      process.platform === "win32" ? "junction" : "dir",
    );
    expect(discoverCanonicalCycleReports(root)).toEqual([]);
  });
});
