import { describe, expect, it } from "vitest";
import { pureFleetRunArtifactPaths } from "../../src/starting_slice/fleet_run_artifacts.js";

describe("pureFleetRunArtifactPaths", () => {
  it("constructs expected artifact paths for a lowercase .md report path", () => {
    const reportPath = "runs/run_123/report.md";
    const paths = pureFleetRunArtifactPaths(reportPath);

    expect(paths).toEqual({
      report: "runs/run_123/report.md",
      runSidecar: "runs/run_123/report.run.json",
      runEvidence: "runs/run_123/report.evidence.jsonl",
      primaryEnvelope: "runs/run_123/report.json",
      initialReport: "runs/run_123/report.initial-report.txt",
      receiptBinding: "runs/run_123/report.receipt-bind.json",
      recoveryMetadata: "runs/run_123/report.repair.meta.json",
      recoveryEnvelope: "runs/run_123/report.repair.json",
      providerEvents: "runs/run_123/report.codex.jsonl",
      providerRollout: "runs/run_123/report.codex-rollout.jsonl",
      providerCapture: "runs/run_123/report.codex-capture.json",
    });
  });

  it("handles uppercase .MD report extensions case-insensitively", () => {
    const reportPath = "C:/evidence/PLAYTEST.MD";
    const paths = pureFleetRunArtifactPaths(reportPath);

    expect(paths.report).toBe("C:/evidence/PLAYTEST.MD");
    expect(paths.runSidecar).toBe("C:/evidence/PLAYTEST.run.json");
    expect(paths.primaryEnvelope).toBe("C:/evidence/PLAYTEST.json");
  });

  it("appends extensions directly if the path does not end in .md case-insensitively", () => {
    const reportPath = "runs/run_456/report";
    const paths = pureFleetRunArtifactPaths(reportPath);

    expect(paths).toEqual({
      report: "runs/run_456/report",
      runSidecar: "runs/run_456/report.run.json",
      runEvidence: "runs/run_456/report.evidence.jsonl",
      primaryEnvelope: "runs/run_456/report.json",
      initialReport: "runs/run_456/report.initial-report.txt",
      receiptBinding: "runs/run_456/report.receipt-bind.json",
      recoveryMetadata: "runs/run_456/report.repair.meta.json",
      recoveryEnvelope: "runs/run_456/report.repair.json",
      providerEvents: "runs/run_456/report.codex.jsonl",
      providerRollout: "runs/run_456/report.codex-rollout.jsonl",
      providerCapture: "runs/run_456/report.codex-capture.json",
    });
  });

  it("handles non-.md extensions such as .txt by appending to full path without stripping extension", () => {
    const reportPath = "logs/report.txt";
    const paths = pureFleetRunArtifactPaths(reportPath);

    expect(paths.report).toBe("logs/report.txt");
    expect(paths.runSidecar).toBe("logs/report.txt.run.json");
    expect(paths.primaryEnvelope).toBe("logs/report.txt.json");
  });
});
