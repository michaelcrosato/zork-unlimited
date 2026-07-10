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
import { execFileSync, spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";

const ROOT = process.cwd();
const TSX_CLI = join(ROOT, "node_modules", "tsx", "dist", "cli.mjs");

function runCrawl(args: string[]): { status: number | null; output: string } {
  const result = spawnSync(process.execPath, [TSX_CLI, "bin/crawl.ts", ...args], {
    cwd: ROOT,
    encoding: "utf8",
    timeout: 60_000,
  });
  return {
    status: result.status,
    output: `${result.stdout ?? ""}\n${result.stderr ?? ""}\n${result.error?.message ?? ""}`,
  };
}

/**
 * Parses a `summary.json` and strips the two fields that are legitimately
 * invocation-specific rather than worker-count-invariant PAYLOAD: `meta`
 * (`argv` differs by `--workers`/`--out`, `startedAt` is wall-clock) and
 * `timing` (`wallMs`/`stepsPerSec`, also wall-clock). Re-serializing with the
 * SAME formatting (`JSON.stringify(_, null, 2)`) turns the remaining
 * `findings`/`countsByCode`/`questCoverage`/`steps`/(`overworld`)/
 * (`truncated`/`skippedItems`) fields back into a string whose byte content
 * — including array/object key ORDER, not just deep-equal values — must
 * match between a `--workers 1` and a `--workers 2` run of the same seeds.
 * That array/key order is exactly what the review's underlying bug broke
 * (see `finalizeFindings` in `src/crawl/run.ts`).
 */
function normalizeSummaryForDiff(raw: string): string {
  const parsed = JSON.parse(raw) as Record<string, unknown>;
  delete parsed.meta;
  delete parsed.timing;
  return JSON.stringify(parsed, null, 2);
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

  /**
   * Review fix (Task 10 follow-up): `findings.jsonl` was already proven safe
   * above (`writeRunArtifacts` always re-sorts before writing it), but
   * `summary.json` embeds `findings`/`countsByCode` AS BUILT by
   * `runPlanInProcess`/`mergeSummaries` — before the fix, those two functions
   * disagreed on array/key order (fingerprint/code-first vs. questId-first),
   * so a `--workers 2` run's `summary.json` could byte-differ from a
   * `--workers 1` run's even though every VALUE agreed. TWO quests
   * (`advocates_case`, `breaking_weir`) are used — not one — because a
   * single-quest run can't distinguish questId-first from
   * fingerprint/code-first ordering (see `finalizeFindings`'s unit test in
   * `tests/unit/crawl_run.test.ts` for the minimal ordering counterexample).
   * Budgets stay tiny (`--steps 80`) so this stays fast; it is fine if both
   * runs happen to produce zero findings at this scale — the byte-diff still
   * exercises `countsByCode` (`{}` on both sides), `questCoverage`, and
   * `steps`, which is exactly what the bug could have desynced.
   */
  it("workers=2 over 2 quests produces a byte-identical summary.json (minus meta/timing) to workers=1", () => {
    const outSingle = mkdtempSync(join(tmpdir(), "af-crawl-sumw1-"));
    const outWorkers = mkdtempSync(join(tmpdir(), "af-crawl-sumw2-"));
    dirs.push(outSingle, outWorkers);

    const args = (out: string, workers: string): string[] => [
      "--quest",
      "advocates_case",
      "--quest",
      "breaking_weir",
      "--seeds",
      "5..6",
      "--steps",
      "80",
      "--workers",
      workers,
      "--no-overworld",
      "--out",
      out,
    ];

    const single = runCrawl(args(outSingle, "1"));
    const workers = runCrawl(args(outWorkers, "2"));
    expect(workers.status, workers.output).toBe(single.status);

    const singleSummary = normalizeSummaryForDiff(
      readFileSync(join(outSingle, "summary.json"), "utf8"),
    );
    const workersSummary = normalizeSummaryForDiff(
      readFileSync(join(outWorkers, "summary.json"), "utf8"),
    );
    expect(workersSummary).toBe(singleSummary);
  });
});

/**
 * Review fix (Task 10 follow-up): worker crash propagation was manually
 * verified but never pinned by a test. `--quest doesnotexist123` makes
 * `prepareShippedQuest` throw INSIDE a worker thread (`worker_entry.ts`'s
 * `runPlanInProcess` call); the worker's `error` event should reject
 * `runWorkerShard`'s promise, which should reject `Promise.all` in
 * `runPlanWithWorkers`, which should reach `bin/crawl.ts`'s top-level
 * `main().catch(...)` handler — printing the error and exiting non-zero,
 * rather than hanging or silently exiting 0.
 */
describe("bin/crawl --workers propagates a worker crash", () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  });

  it("--quest doesnotexist123 --workers 2 exits nonzero with an error message", () => {
    const out = mkdtempSync(join(tmpdir(), "af-crawl-crash-"));
    dirs.push(out);

    let status: number | null = null;
    let combined: string;
    try {
      combined = execFileSync(
        process.execPath,
        [
          TSX_CLI,
          "bin/crawl.ts",
          "--quest",
          "doesnotexist123",
          "--steps",
          "10",
          "--workers",
          "2",
          "--no-overworld",
          "--out",
          out,
        ],
        { cwd: ROOT, encoding: "utf8", timeout: 60_000 },
      );
    } catch (err) {
      const e = err as { status: number | null; stdout?: string; stderr?: string };
      status = e.status;
      combined = `${e.stdout ?? ""}\n${e.stderr ?? ""}`;
    }

    expect(status, combined).not.toBeNull();
    expect(status).not.toBe(0);
    expect(combined).toMatch(/doesnotexist123/);
    // No summary.json should have been written — the run failed before
    // `writeRunArtifacts` ever ran.
    expect(existsSync(join(out, "summary.json"))).toBe(false);
  });
});
