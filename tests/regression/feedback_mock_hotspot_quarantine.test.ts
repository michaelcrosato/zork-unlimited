/**
 * bug_0541 — deterministic structural mocks verify the blind fleet pipeline,
 * but their planted findings and ratings are not observations about the game.
 * Keep them accounted as verified structural artifacts without letting them
 * steer product hot spots, experience metrics, or assessor recommendations.
 */
import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { compileFeedback } from "../../src/feedback/compile.js";

function structuralReport(
  kind: "mock" | "smoke",
  bug: { where: string; severity: "S1" | "S4"; note: string },
): string {
  const interview = {
    schema_version: 2,
    play_mode: "structural",
    start_surface: "fresh_overworld",
    retention_eligible: false,
    structural_kind: kind,
    clarity: kind === "mock" ? 1 : 4,
    enjoyment: kind === "mock" ? 1 : 4,
    goal_understood: true,
    got_stuck: kind === "mock",
    confusions: [],
    bugs: [bug],
    best_moment: "The structural path exercised its intended boundary.",
    worst_moment: "This report exists to test evidence provenance.",
    would_replay: kind === "smoke",
    verdict: `${kind} structural evidence completed.`,
  };
  return `# Structural report

## Playthrough log

Ran the ${kind} structural path.

## Did it work mechanically?

The intended structural boundary completed.

## Understandable & fun?

The numeric ratings are present only to satisfy the report contract.

## Verdict

This is structural QA evidence.

\`\`\`json exit-interview
${JSON.stringify(interview, null, 2)}
\`\`\`
`;
}

describe("bug_0541 — mock feedback provenance quarantine", () => {
  it("counts mocks as verified structural QA but excludes them from product evidence", () => {
    const reports = mkdtempSync(join(tmpdir(), "feedback-mock-quarantine-input-"));
    const output = mkdtempSync(join(tmpdir(), "feedback-mock-quarantine-output-"));
    const mockRef = "20260808T000000Z_overworld_seed1.md";
    const smokeRef = "20260808T000001Z_overworld_seed2.md";
    writeFileSync(
      join(reports, mockRef),
      structuralReport("mock", {
        where: "Albany Station Quarter",
        severity: "S4",
        note: "PLANTED_MOCK_SENTINEL must never become a product hot spot",
      }),
    );
    writeFileSync(
      join(reports, smokeRef),
      structuralReport("smoke", {
        where: "Albany Station Quarter",
        severity: "S1",
        note: "Observed smoke boundary remains actionable QA evidence",
      }),
    );

    const { file, evidence, excludedMockReports, mdPath } = compileFeedback({
      root: process.cwd(),
      inputs: [reports],
      outDir: output,
      topK: 10,
      llmLabels: false,
      prevDir: null,
    });

    expect(file.inputs).toMatchObject({
      verified_reports: 2,
      actionable_reports: 1,
      excluded_mock_reports: 1,
      rejected_reports: 0,
    });
    expect(evidence.report_modes).toEqual({ pure: 0, structural: 2, legacy_guided: 0 });
    expect(excludedMockReports).toBe(1);
    expect(file.hotspots).toHaveLength(1);
    expect(file.hotspots[0]!.evidence.map((row) => row.ref)).toEqual([
      expect.stringMatching(
        new RegExp(`^external/[0-9a-f]{8}/${smokeRef.replace(".", "\\.")}$`, "u"),
      ),
    ]);
    expect(JSON.stringify(file)).not.toContain("PLANTED_MOCK_SENTINEL");
    expect(file.metrics).toHaveLength(1);
    expect(file.metrics[0]!.reports).toBe(1);
    expect(file.sycophancy.reports).toBe(1);
    expect(readFileSync(mdPath, "utf8")).toContain(
      "Deterministic structural mocks excluded from this product cohort: 1",
    );
  });
});
