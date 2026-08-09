import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  EMPTY_FEEDBACK_ACCEPTANCE_STATE,
  loadAcceptedFeedbackBundle,
  parseFeedbackAcceptanceStateText,
  pendingAcceptedCycleReportPaths,
  readAcceptedHotspots,
  readCommittedFeedbackAcceptanceState,
  readFeedbackAcceptanceState,
  upsertFeedbackAcceptanceStateText,
  type FeedbackAcceptanceState,
} from "../../src/feedback/acceptance.js";
import {
  serializeReportManifest,
  sha256File as manifestSha256File,
  type ReportManifest,
} from "../../src/feedback/report_manifest.js";

function sha256File(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function stateWithPending(runId: string, root: string): FeedbackAcceptanceState {
  const base = join(root, "ai-runs", runId, "playtest");
  return {
    schema_version: 1,
    accepted_compile: null,
    pending_cycle_reports: [
      {
        run_id: runId,
        tested_commit: "c".repeat(40),
        report_id: `pure:${"a".repeat(64)}`,
        report_sha256: sha256File(`${base}.md`),
        evidence_sha256: sha256File(`${base}.evidence.jsonl`),
        sidecar_sha256: sha256File(`${base}.run.json`),
      },
    ],
  };
}

type AcceptedBundleFixture = {
  root: string;
  state: FeedbackAcceptanceState;
  manifestPath: string;
  hotspotsPath: string;
  retentionPath: string;
  markdownPath: string;
};

function acceptedHotspotsFile(hotspotId = "accepted-fixture"): unknown {
  return {
    version: 2,
    generated_at: "2026-08-08T22:00:00.000Z",
    commit: "fixture-commit",
    inputs: {
      report_dirs: ["blind-tester/reports"],
      crawl_files: [],
      verified_reports: 1,
      actionable_reports: 1,
      excluded_mock_reports: 0,
      rejected_reports: 0,
      crawl_findings: 0,
    },
    metrics: [],
    sycophancy: {
      reports: 1,
      zero_negative_rate: 0,
      clarity_histogram: [0, 0, 0, 1, 0],
      enjoyment_histogram: [0, 0, 0, 1, 0],
      by_persona_zero_negative: {},
    },
    hotspots: [
      {
        id: hotspotId,
        title: "accepted feedback fixture",
        location: {
          kind: "quest",
          questId: "fixture_quest",
          region: null,
          node: null,
          sceneId: null,
          raw: ["Fixture Quest"],
        },
        severity_band: "moderate",
        max_severity: "S2",
        count: 1,
        sources: ["fleet"],
        personas: ["explorer"],
        score: 4,
        fix_layer: "content",
        evidence: [{ source: "fleet", ref: "fixture.md", excerpt: "fixture issue" }],
        trend: "new",
        prev_score: null,
      },
    ],
    recommended_next_fix: {
      hotspot_id: hotspotId,
      rationale: "accepted fixture recommendation",
    },
  };
}

function commitLoopState(root: string): void {
  execFileSync("git", ["init", "--quiet"], { cwd: root });
  execFileSync("git", ["config", "user.email", "feedback-fixture@example.invalid"], { cwd: root });
  execFileSync("git", ["config", "user.name", "Feedback Fixture"], { cwd: root });
  execFileSync("git", ["add", "--", "AI_LOOP_STATE.md"], { cwd: root });
  execFileSync("git", ["commit", "--quiet", "-m", "fixture acceptance"], { cwd: root });
}

function createAcceptedBundleFixture(consumedByRunId: string | null = null): AcceptedBundleFixture {
  const root = mkdtempSync(join(tmpdir(), "feedback-accepted-bundle-"));
  const stamp = "20260808T220000Z";
  const dir = join(root, "ai-runs", "feedback", stamp);
  mkdirSync(dir, { recursive: true });
  const hotspotsPath = join(dir, "hotspots.json");
  const retentionPath = join(dir, "retention.json");
  const markdownPath = join(dir, "hotspots.md");
  const manifestPath = join(dir, "report-manifest.json");
  writeFileSync(hotspotsPath, `${JSON.stringify(acceptedHotspotsFile())}\n`);
  writeFileSync(
    retentionPath,
    `${JSON.stringify({
      schema_version: 2,
      report_modes: { pure: 0, structural: 0, legacy_guided: 1 },
      pure_retention: { eligible_reports: 0, contract_versions: [] },
    })}\n`,
  );
  writeFileSync(markdownPath, "# Accepted feedback fixture\n");

  const reportId = `report:${"a".repeat(64)}`;
  const manifest: ReportManifest = {
    schema_version: 1,
    kind: "initial",
    generated_at: "2026-08-08T22:00:00.000Z",
    commit: "fixture-commit",
    previous_manifest_sha256: null,
    corpus: {
      verified_report_ids: [reportId],
      actionable_report_ids: [reportId],
      excluded_mock_report_ids: [],
      seen_report_ids: [reportId],
    },
    cohort: {
      verified_report_ids: [reportId],
      actionable_report_ids: [reportId],
      excluded_mock_report_ids: [],
    },
    outputs: {
      hotspots_sha256: manifestSha256File(hotspotsPath),
      retention_sha256: manifestSha256File(retentionPath),
      markdown_sha256: manifestSha256File(markdownPath),
    },
  };
  writeFileSync(manifestPath, serializeReportManifest(manifest));
  const state: FeedbackAcceptanceState = {
    schema_version: 1,
    accepted_compile: {
      manifest_path: `ai-runs/feedback/${stamp}/report-manifest.json`,
      manifest_sha256: manifestSha256File(manifestPath),
      hotspots_path: `ai-runs/feedback/${stamp}/hotspots.json`,
      hotspots_sha256: manifestSha256File(hotspotsPath),
      consumed_by_run_id: consumedByRunId,
    },
    pending_cycle_reports: [],
  };
  writeFileSync(
    join(root, "AI_LOOP_STATE.md"),
    upsertFeedbackAcceptanceStateText("# AI Loop State\n", state),
  );
  commitLoopState(root);
  return { root, state, manifestPath, hotspotsPath, retentionPath, markdownPath };
}

describe("tracked feedback acceptance state", () => {
  it("treats a missing marker as the explicit empty migration state", () => {
    expect(parseFeedbackAcceptanceStateText("# AI Loop State\n")).toEqual({
      ok: true,
      found: false,
      state: EMPTY_FEEDBACK_ACCEPTANCE_STATE,
    });
  });

  it("upserts one canonical marker without disturbing the cycle log", () => {
    const initial = [
      "# AI Loop State",
      "",
      "<!-- historical_cycle_count: 7 -->",
      "",
      "### Cycle result - current",
      "",
      "- Guard: green.",
      "",
    ].join("\n");
    const state: FeedbackAcceptanceState = {
      schema_version: 1,
      accepted_compile: {
        manifest_path: "ai-runs/feedback/20260808T220000Z/report-manifest.json",
        manifest_sha256: "b".repeat(64),
        hotspots_path: "ai-runs/feedback/20260808T220000Z/hotspots.json",
        hotspots_sha256: "c".repeat(64),
        consumed_by_run_id: null,
      },
      pending_cycle_reports: [],
    };
    const updated = upsertFeedbackAcceptanceStateText(initial, state);
    expect(updated).toContain("<!-- historical_cycle_count: 7 -->\n<!-- feedback_acceptance:");
    expect(updated).toContain("### Cycle result - current");
    expect(parseFeedbackAcceptanceStateText(updated)).toEqual({ ok: true, found: true, state });
    expect(upsertFeedbackAcceptanceStateText(updated, state)).toBe(updated);
  });

  it("loads an intact accepted bundle from the marker committed at HEAD", () => {
    const fixture = createAcceptedBundleFixture();
    try {
      expect(readCommittedFeedbackAcceptanceState(fixture.root)).toEqual({
        ok: true,
        found: true,
        state: fixture.state,
      });
      expect(
        loadAcceptedFeedbackBundle(fixture.root, fixture.state)?.hotspots.recommended_next_fix
          ?.hotspot_id,
      ).toBe("accepted-fixture");
      expect(readAcceptedHotspots(fixture.root)?.recommended_next_fix?.hotspot_id).toBe(
        "accepted-fixture",
      );
    } finally {
      rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  it("ignores a dirty worktree marker and retains the committed authority", () => {
    const fixture = createAcceptedBundleFixture();
    try {
      writeFileSync(
        join(fixture.root, "AI_LOOP_STATE.md"),
        upsertFeedbackAcceptanceStateText(
          readFileSync(join(fixture.root, "AI_LOOP_STATE.md"), "utf8"),
          EMPTY_FEEDBACK_ACCEPTANCE_STATE,
        ),
      );
      expect(readFeedbackAcceptanceState(fixture.root)).toEqual({
        ok: true,
        found: true,
        state: EMPTY_FEEDBACK_ACCEPTANCE_STATE,
      });
      expect(readAcceptedHotspots(fixture.root)?.recommended_next_fix?.hotspot_id).toBe(
        "accepted-fixture",
      );
    } finally {
      rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  it("treats a consumed accepted compile as inert assessor evidence", () => {
    const fixture = createAcceptedBundleFixture("2026-08-08T22-00-00-001Z");
    try {
      expect(loadAcceptedFeedbackBundle(fixture.root, fixture.state)).not.toBeNull();
      expect(readAcceptedHotspots(fixture.root)).toBeNull();
    } finally {
      rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  it("requires the tracked manifest and hotspot digests to match exactly", () => {
    const fixture = createAcceptedBundleFixture();
    try {
      const wrongManifest = structuredClone(fixture.state);
      wrongManifest.accepted_compile!.manifest_sha256 = "b".repeat(64);
      expect(loadAcceptedFeedbackBundle(fixture.root, wrongManifest)).toBeNull();

      const wrongHotspots = structuredClone(fixture.state);
      wrongHotspots.accepted_compile!.hotspots_sha256 = "c".repeat(64);
      expect(loadAcceptedFeedbackBundle(fixture.root, wrongHotspots)).toBeNull();
    } finally {
      rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  it.each([
    [
      "manifest bytes",
      (fixture: AcceptedBundleFixture) => writeFileSync(fixture.manifestPath, "{}\n"),
    ],
    [
      "hotspots bytes",
      (fixture: AcceptedBundleFixture) => writeFileSync(fixture.hotspotsPath, "{}\n"),
    ],
    [
      "retention bytes",
      (fixture: AcceptedBundleFixture) => writeFileSync(fixture.retentionPath, "{}\n"),
    ],
    ["missing markdown", (fixture: AcceptedBundleFixture) => rmSync(fixture.markdownPath)],
  ])("fails closed for tampered or missing %s", (_label, mutate) => {
    const fixture = createAcceptedBundleFixture();
    try {
      mutate(fixture);
      expect(loadAcceptedFeedbackBundle(fixture.root, fixture.state)).toBeNull();
      expect(readAcceptedHotspots(fixture.root)).toBeNull();
    } finally {
      rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  it("rejects duplicate, unsorted, and malformed tracked markers", () => {
    const marker =
      '<!-- feedback_acceptance: {"accepted_compile":null,"pending_cycle_reports":[],"schema_version":1} -->';
    expect(parseFeedbackAcceptanceStateText(`${marker}\n${marker}\n`)).toMatchObject({ ok: false });
    const pending = (runId: string, fill: string) => ({
      run_id: runId,
      tested_commit: fill.repeat(40),
      report_id: `pure:${fill.repeat(64)}`,
      report_sha256: fill.repeat(64),
      evidence_sha256: fill.repeat(64),
      sidecar_sha256: fill.repeat(64),
    });
    const unsorted = {
      schema_version: 1,
      accepted_compile: null,
      pending_cycle_reports: [
        pending("2026-08-08T22-00-00-002Z", "a"),
        pending("2026-08-08T22-00-00-001Z", "b"),
      ],
    };
    expect(
      parseFeedbackAcceptanceStateText(`<!-- feedback_acceptance: ${JSON.stringify(unsorted)} -->`),
    ).toMatchObject({ ok: false });
    expect(parseFeedbackAcceptanceStateText("<!-- feedback_acceptance: { -->")).toMatchObject({
      ok: false,
    });
  });

  it("admits only pending cycle bundles whose three accepted byte hashes still match", () => {
    const root = mkdtempSync(join(tmpdir(), "feedback-acceptance-pending-"));
    const runId = "2026-08-08T22-00-00-003Z";
    const dir = join(root, "ai-runs", runId);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "playtest.md"), "report\n");
    writeFileSync(join(dir, "playtest.evidence.jsonl"), "evidence\n");
    writeFileSync(join(dir, "playtest.run.json"), "sidecar\n");
    const state = stateWithPending(runId, root);

    expect(pendingAcceptedCycleReportPaths(root, state, sha256File)).toEqual([
      `ai-runs/${runId}/playtest.md`,
    ]);
    writeFileSync(join(dir, "playtest.md"), "tampered\n");
    expect(pendingAcceptedCycleReportPaths(root, state, sha256File)).toEqual([]);
  });

  it("fails closed for linked artifacts and reads a valid tracked marker from disk", () => {
    const root = mkdtempSync(join(tmpdir(), "feedback-acceptance-linked-"));
    const runId = "2026-08-08T22-00-00-004Z";
    const dir = join(root, "ai-runs", runId);
    mkdirSync(dir, { recursive: true });
    const target = join(root, "report-target.md");
    writeFileSync(target, "report\n");
    symlinkSync(
      target,
      join(dir, "playtest.md"),
      process.platform === "win32" ? "file" : undefined,
    );
    writeFileSync(join(dir, "playtest.evidence.jsonl"), "evidence\n");
    writeFileSync(join(dir, "playtest.run.json"), "sidecar\n");
    const state = stateWithPending(runId, root);
    const loopState = upsertFeedbackAcceptanceStateText("# AI Loop State\n", state);
    writeFileSync(join(root, "AI_LOOP_STATE.md"), loopState);

    expect(readFeedbackAcceptanceState(root)).toEqual({ ok: true, found: true, state });
    expect(pendingAcceptedCycleReportPaths(root, state, sha256File)).toEqual([]);
  });
});
