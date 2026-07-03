/**
 * The autonomous loop's shell driver is a safety boundary, not just glue: it must
 * run the verification bar before committing and must refuse commits without the
 * mandatory blind-playtest report. Blind game agents cannot observe this layer, so
 * the test suite has to lock it directly.
 */
import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const loopText = readFileSync("loop.sh", "utf8");

function sectionBetween(start: string, end: string): string {
  const startAt = loopText.indexOf(start);
  const endAt = loopText.indexOf(end, startAt);
  expect(startAt, `missing ${start}`).toBeGreaterThanOrEqual(0);
  expect(endAt, `missing ${end}`).toBeGreaterThan(startAt);
  return loopText.slice(startAt, endAt);
}

function runGateHarness(
  body: string,
  env: Record<string, string> = {},
): {
  status: number | null;
  output: string;
} {
  const root = mkdtempSync(join(tmpdir(), "loop-gate-"));
  try {
    const exports = Object.entries(env).map(([key, value]) => {
      expect(key).toMatch(/^[A-Z0-9_]+$/);
      return `${key}='${value.replaceAll("'", "'\\''")}'; export ${key}`;
    });
    const script = ["set -uo pipefail", ...exports, body, "require_playtest_record"].join("\n");
    const result = spawnSync("bash", ["-s"], {
      cwd: root,
      env: process.env,
      input: script,
      encoding: "utf8",
    });
    return {
      status: result.status,
      output: `${result.stdout ?? ""}\n${result.stderr ?? ""}\n${result.error?.message ?? ""}`,
    };
  } finally {
    try {
      rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    } catch {
      // Git Bash can briefly retain its cwd handle on Windows after spawnSync returns.
      // The directory is under the OS temp root and contains only this test harness.
    }
  }
}

describe("loop.sh verification gates", () => {
  it("is syntactically valid bash", () => {
    const result = spawnSync("bash", ["-n", "loop.sh"], {
      cwd: process.cwd(),
      encoding: "utf8",
    });
    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
  });

  it("keeps commits and pushes behind health, integrity drift, and playtest-record gates", () => {
    const runCycle = sectionBetween("run_cycle() {", "\n}\n\ncount=0");
    const ordered = [
      "npm run ai:loop",
      "run_agent",
      "npm run health",
      'npm run verify:integrity -- --against "$start_ref"',
      "require_playtest_record",
      "safe_commit_if_enabled",
      "git push",
    ];

    let previous = -1;
    for (const needle of ordered) {
      const index = runCycle.indexOf(needle, previous + 1);
      expect(index, `run_cycle is missing ${needle}`).toBeGreaterThan(previous);
      previous = index;
    }
  });

  it("safe_commit_if_enabled is inert unless AI_LOOP_COMMIT=1", () => {
    const safeCommit = sectionBetween(
      "safe_commit_if_enabled() {",
      "\n}\n\nrequire_playtest_record()",
    );

    expect(safeCommit.indexOf('[[ "${AI_LOOP_COMMIT:-0}" != "1" ]]')).toBeLessThan(
      safeCommit.indexOf("git add -A"),
    );
    expect(safeCommit.indexOf("git add -A")).toBeLessThan(safeCommit.indexOf("git commit"));
  });
});

describe("require_playtest_record", () => {
  const gate = `${sectionBetween("require_playtest_record() {", "\n}\n\nrun_cycle()")}\n}`;

  it("is a no-op for evidence-only runs", () => {
    const result = runGateHarness(gate, { AI_LOOP_COMMIT: "0" });

    expect(result.status, result.output).toBe(0);
  });

  it("refuses to commit when latest-cycle metadata is missing", () => {
    const result = runGateHarness(gate, { AI_LOOP_COMMIT: "1" });

    expect(result.status).toBe(1);
    expect(result.output).toContain("No cycle metadata");
    expect(result.output).toContain("Refusing to commit");
  });

  it("refuses to commit when the recorded playtest report is absent or empty", () => {
    const missing = runGateHarness(
      [
        "mkdir -p ai-runs/2026",
        "printf '%s\\n' '{\"playtestRecord\":\"ai-runs/2026/playtest.md\"}' > ai-runs/latest-cycle.json",
        gate,
      ].join("\n"),
      { AI_LOOP_COMMIT: "1" },
    );
    expect(missing.status).toBe(1);
    expect(missing.output).toContain("Mandatory LLM playtest record missing or empty");

    const empty = runGateHarness(
      [
        "mkdir -p ai-runs/2026",
        "printf '%s\\n' '{\"playtestRecord\":\"ai-runs/2026/playtest.md\"}' > ai-runs/latest-cycle.json",
        "touch ai-runs/2026/playtest.md",
        gate,
      ].join("\n"),
      { AI_LOOP_COMMIT: "1" },
    );
    expect(empty.status).toBe(1);
    expect(empty.output).toContain("Mandatory LLM playtest record missing or empty");
  });

  it("allows a commit only when the recorded playtest report exists and is non-empty", () => {
    const result = runGateHarness(
      [
        "mkdir -p ai-runs/2026",
        "printf '%s\\n' '{\"playtestRecord\":\"ai-runs/2026/playtest.md\"}' > ai-runs/latest-cycle.json",
        "printf '%s\\n' 'structured blind report' > ai-runs/2026/playtest.md",
        gate,
      ].join("\n"),
      { AI_LOOP_COMMIT: "1" },
    );

    expect(result.status, result.output).toBe(0);
    expect(result.output).toContain("mandatory playtest record present");
  });
});
