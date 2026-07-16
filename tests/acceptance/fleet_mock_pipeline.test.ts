import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { verifyBlindReportText } from "../../src/blind/report_verifier.js";
import { extractExitInterview } from "../../src/blind/exit_interview.js";

// npx resolves to npx.cmd on Windows — execFile{,Sync} never goes through a
// shell by default, and Node cannot spawn a .cmd directly without one (bare
// "npx" ⇒ ENOENT). Mirrors blind-tester/fleet.mjs's own `verifyReport`, which
// spawns "npm" the same conditional way for the same reason.
const SHELL_ON_WINDOWS = process.platform === "win32";

// Reports directory produced by the first test, reused by the compiler leg
// (Task 16) so the pipeline's clustering has a realistic multi-report fleet
// to work with instead of a fresh, smaller one.
let reportsDir = "";

describe("fleet:mock end to end (zero tokens)", () => {
  it("produces N verifier-passing reports with planted overlap", () => {
    const out = mkdtempSync(join(tmpdir(), "fleet-mock-"));
    execFileSync(
      "node",
      [
        "blind-tester/fleet.mjs",
        "--mock",
        "--count",
        "4",
        "--concurrency",
        "2",
        "--seed-base",
        "100",
        "--out",
        out,
        "--label",
        "citest",
      ],
      { stdio: "pipe", timeout: 240_000 },
    );
    reportsDir = out;
    const reports = readdirSync(out).filter((f) => f.endsWith(".md"));
    expect(reports).toHaveLength(4);
    const fleetDir = join(process.cwd(), "ai-runs", "fleet", "citest");
    const manifestRows = readFileSync(join(fleetDir, "manifest.jsonl"), "utf8")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    expect(manifestRows).toHaveLength(4);
    expect(
      manifestRows.every(
        (row) =>
          row.attempts === 1 &&
          row.report_recovered === false &&
          row.attempt_history?.length === 1 &&
          row.attempt_history[0]?.classification === "verified" &&
          row.attempt_history[0]?.archive === null,
      ),
    ).toBe(true);
    expect(JSON.parse(readFileSync(join(fleetDir, "summary.json"), "utf8"))).toMatchObject({
      total_attempts: 4,
      failed_attempts: 0,
      technical_timeouts: 0,
      report_recovered_runs: 0,
    });
    let overlap = 0;
    for (const f of reports) {
      const text = readFileSync(join(out, f), "utf8");
      const v = verifyBlindReportText(text);
      expect(v.ok, `${f}: ${(v as { reason?: string }).reason ?? ""}`).toBe(true);
      const sidecar = JSON.parse(readFileSync(join(out, f.replace(/\.md$/, ".run.json")), "utf8"));
      expect(sidecar).toMatchObject({
        report_schema_version: 2,
        play_mode: "structural",
        retention_eligible: false,
        evidence_status: "not_applicable",
      });
      const i = extractExitInterview(text);
      if (i.ok && i.interview.bugs.some((b) => b.where.includes("Albany Station Quarter")))
        overlap += 1;
    }
    expect(overlap).toBe(2); // seeds 100,102 of 100..103
  }, 300_000);

  it("honors a MOCK_PLAN override end to end, pinning the plan-injection seam", () => {
    // Task 13 review requirement: prove the MOCK_PLAN env seam actually
    // overrides the seed-derived synthetic findings, not just that the mock
    // agent parses the file without error.
    const out = mkdtempSync(join(tmpdir(), "fleet-mock-plan-"));
    const planPath = join(out, "plan.json");
    const overridePlan = {
      clarity: 5,
      enjoyment: 5,
      goal_understood: true,
      got_stuck: false,
      confusions: [],
      bugs: [
        {
          where: "Override Canyon",
          severity: "S4",
          note: "forced by MOCK_PLAN to pin the override seam",
        },
      ],
      best_moment: "The override landed exactly as scripted.",
      worst_moment: "Nothing — this run is scripted end to end.",
      would_replay: true,
      verdict:
        "MOCK_PLAN replaced the seed-derived plan wholesale, proven end to end by this report.",
    };
    writeFileSync(planPath, JSON.stringify(overridePlan));

    execFileSync(
      "node",
      [
        "blind-tester/fleet.mjs",
        "--mock",
        "--count",
        "2",
        "--concurrency",
        "2",
        "--seed-base",
        "900",
        "--out",
        out,
        "--label",
        "mockplan-citest",
      ],
      { stdio: "pipe", timeout: 120_000, env: { ...process.env, MOCK_PLAN: planPath } },
    );

    const reports = readdirSync(out).filter((f) => f.endsWith(".md"));
    expect(reports).toHaveLength(2);
    for (const f of reports) {
      const text = readFileSync(join(out, f), "utf8");
      const v = verifyBlindReportText(text);
      expect(v.ok, `${f}: ${(v as { reason?: string }).reason ?? ""}`).toBe(true);
      if (!v.ok) continue;
      // The seed-derived plan would never produce "Override Canyon" (only
      // "Albany Station Quarter" / "road to Colonie" / "seed-<n> corner") —
      // its presence, verbatim, proves MOCK_PLAN replaced the plan wholesale.
      expect(v.interview.bugs).toEqual(overridePlan.bugs);
      expect(v.interview.clarity).toBe(5);
      expect(v.interview.verdict).toBe(overridePlan.verdict);
    }
  }, 180_000);

  it("allows an explicit mock quest target and ignores an ambient agent override", () => {
    const out = mkdtempSync(join(tmpdir(), "fleet-mock-quest-"));
    const label = `mock-quest-policy-${process.pid}-${Date.now()}`;
    execFileSync(
      "node",
      [
        "blind-tester/fleet.mjs",
        "--mock",
        "--target",
        "quest:breaking_weir",
        "--count",
        "1",
        "--concurrency",
        "1",
        "--max-retries",
        "0",
        "--seed-base",
        "777",
        "--out",
        out,
        "--label",
        label,
      ],
      {
        stdio: "pipe",
        timeout: 120_000,
        env: { ...process.env, BLIND_AGENT_CMD: "exit 97" },
      },
    );

    const reports = readdirSync(out).filter((f) => f.endsWith(".md"));
    expect(reports).toHaveLength(1);
    const report = reports[0]!;
    expect(report).toContain("breaking_weir_seed777");
    expect(verifyBlindReportText(readFileSync(join(out, report), "utf8")).ok).toBe(true);

    const manifest = readFileSync(
      join(process.cwd(), "ai-runs", "fleet", label, "manifest.jsonl"),
      "utf8",
    );
    const row = JSON.parse(manifest.trim());
    expect(row).toMatchObject({
      target: "quest:breaking_weir",
      status: "verified",
      attempts: 1,
      report_recovered: false,
      attempt_history: [
        {
          attempt: 1,
          exit: 0,
          classification: "verified",
          report_recovered: false,
          archive: null,
        },
      ],
      report_schema_version: 2,
      play_mode: "structural",
      start_surface: "direct_quest",
      retention_eligible: false,
      evidence_status: "not_applicable",
    });
  }, 180_000);

  it("compiles mock reports + crawl findings into ranked hotspots with the planted overlap on top", () => {
    // reuse the tmp report dir from the previous test via a module-level variable, or regenerate --count 6
    const out2 = mkdtempSync(join(tmpdir(), "hotspots-"));
    execFileSync(
      "npx",
      ["tsx", "bin/feedback.ts", "--in", reportsDir, "--out", out2, "--top", "5"],
      { stdio: "pipe", timeout: 120_000, shell: SHELL_ON_WINDOWS },
    );
    const hs = JSON.parse(readFileSync(join(out2, "hotspots.json"), "utf8"));
    expect(hs.hotspots[0].title).toMatch(/notice board|albany station/i); // planted overlap ranks #1
    expect(hs.recommended_next_fix.hotspot_id).toBe(hs.hotspots[0].id);
    expect(hs.sycophancy.reports).toBeGreaterThan(0);

    // second compile with the SAME inputs → all trends flat, and prev linkage works
    // trends read ai-runs/feedback/ by default — pass the previous dir explicitly instead: implement --prev <dir> for testability
    const out3 = mkdtempSync(join(tmpdir(), "hotspots2-"));
    execFileSync(
      "npx",
      ["tsx", "bin/feedback.ts", "--in", reportsDir, "--out", out3, "--top", "5", "--prev", out2],
      { stdio: "pipe", timeout: 120_000, shell: SHELL_ON_WINDOWS },
    );
    const hs2 = JSON.parse(readFileSync(join(out3, "hotspots.json"), "utf8"));
    expect(hs2.hotspots.length).toBeGreaterThan(0);
    const prevScoreById = new Map(
      hs.hotspots.map((h: { id: string; score: number }) => [h.id, h.score]),
    );
    for (const h of hs2.hotspots as { id: string; trend: string; prev_score: number | null }[]) {
      expect(h.trend).toBe("flat");
      expect(h.prev_score).toBe(prevScoreById.get(h.id));
    }
  }, 180_000);
});
