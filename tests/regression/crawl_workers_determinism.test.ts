/**
 * Task 10's hard invariant: worker fan-out must never leak into findings
 * content — only into timing. Runs `bin/crawl.ts` for real (spawned, not
 * imported) twice over the SAME two seeds of one quest — once single-process
 * (`--workers 1`), once fanned out (`--workers 2`, one seed per worker) — and
 * diffs `findings.jsonl`. Budgets are kept tiny (`--steps 100`) so this stays
 * fast; `--no-overworld` keeps the comparison to the quest-crawler/worker path
 * this task actually changed (the overworld item is Task 8's single-process
 * sweep, unaffected by `--workers`).
 */
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";

const ROOT = process.cwd();

function runCrawl(args: string[]): { status: number | null; output: string } {
  const result = spawnSync(
    process.execPath,
    [join(ROOT, "node_modules", "tsx", "dist", "cli.mjs"), "bin/crawl.ts", ...args],
    { cwd: ROOT, encoding: "utf8", timeout: 60_000 },
  );
  return {
    status: result.status,
    output: `${result.stdout ?? ""}\n${result.stderr ?? ""}\n${result.error?.message ?? ""}`,
  };
}

describe("bin/crawl --workers fan-out determinism", () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  });

  it("workers=2 over 2 seeds produces the same findings.jsonl as workers=1 over the same seeds", () => {
    const outSingle = mkdtempSync(join(tmpdir(), "af-crawl-w1-"));
    const outWorkers = mkdtempSync(join(tmpdir(), "af-crawl-w2-"));
    dirs.push(outSingle, outWorkers);

    const single = runCrawl([
      "--quest",
      "sunken_barrow",
      "--seeds",
      "5..6",
      "--steps",
      "100",
      "--workers",
      "1",
      "--no-overworld",
      "--out",
      outSingle,
    ]);
    const workers = runCrawl([
      "--quest",
      "sunken_barrow",
      "--seeds",
      "5..6",
      "--steps",
      "100",
      "--workers",
      "2",
      "--no-overworld",
      "--out",
      outWorkers,
    ]);

    // Exit code is findings-driven (1 iff a non-ORPHAN finding exists) — both
    // runs see the exact same seeds, so they must agree.
    expect(workers.status, workers.output).toBe(single.status);

    const singleFindings = readFileSync(join(outSingle, "findings.jsonl"), "utf8");
    const workersFindings = readFileSync(join(outWorkers, "findings.jsonl"), "utf8");
    expect(workersFindings).toBe(singleFindings);

    // Coverage for the one quest must also agree byte-for-byte: the same two
    // seeds fully partition 1-seed-per-worker, so the union `mergeSummaries`
    // computes must equal the single-process run's own coverage exactly.
    const singleSummary = JSON.parse(readFileSync(join(outSingle, "summary.json"), "utf8")) as {
      questCoverage: unknown;
    };
    const workersSummary = JSON.parse(readFileSync(join(outWorkers, "summary.json"), "utf8")) as {
      questCoverage: unknown;
    };
    expect(workersSummary.questCoverage).toEqual(singleSummary.questCoverage);
  });

  it("workers=1 is itself repeatable byte-for-byte across two runs (baseline determinism)", () => {
    const outA = mkdtempSync(join(tmpdir(), "af-crawl-a-"));
    const outB = mkdtempSync(join(tmpdir(), "af-crawl-b-"));
    dirs.push(outA, outB);

    const args = (out: string): string[] => [
      "--quest",
      "sunken_barrow",
      "--seeds",
      "5..5",
      "--steps",
      "100",
      "--workers",
      "1",
      "--no-overworld",
      "--out",
      out,
    ];
    const a = runCrawl(args(outA));
    const b = runCrawl(args(outB));
    expect(a.status, a.output).toBe(b.status);
    expect(existsSync(join(outA, "findings.jsonl"))).toBe(true);
    expect(readFileSync(join(outA, "findings.jsonl"), "utf8")).toBe(
      readFileSync(join(outB, "findings.jsonl"), "utf8"),
    );
  });
});
