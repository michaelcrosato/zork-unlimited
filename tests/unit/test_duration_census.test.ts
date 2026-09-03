import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  LANE_PROJECT_FLAGS,
  defaultOutputPath,
  parseMeasureArguments,
  vitestArgumentsFor,
} from "../../scripts/measure-test-durations.js";
import {
  BUCKET_BOUNDS_MS,
  BUCKET_LABELS,
  THRESHOLD_LABELS,
  bucketIndex,
  formatMs,
  packedWallClockMs,
  parseCensusArguments,
  readDurationRecords,
  renderCensus,
  type DurationRecord,
} from "../../scripts/test-duration-census.js";

function record(file: string, totalMs: number, tests = 1): DurationRecord {
  return {
    file,
    project: "standard",
    state: "passed",
    tests,
    totalMs,
    durationMs: totalMs / 2,
    collectMs: totalMs / 2,
    setupMs: 0,
    environmentMs: 0,
    prepareMs: 0,
    cases: Array.from({ length: tests }, (_unused, index) => ({
      name: `case ${index}`,
      ms: totalMs / 2 / tests,
      state: "passed",
    })),
  };
}

describe("duration buckets", () => {
  it("puts a file in the band its cost falls in, on the exclusive upper bound", () => {
    expect(bucketIndex(0)).toBe(0);
    expect(bucketIndex(9_999)).toBe(0);
    // Exactly at a bound belongs to the NEXT band: the thresholds read "under 10s",
    // so a file that takes exactly 10s is not one of them.
    expect(bucketIndex(10_000)).toBe(1);
    expect(bucketIndex(59_999)).toBe(1);
    expect(bucketIndex(60_000)).toBe(2);
    expect(bucketIndex(299_999)).toBe(2);
    expect(bucketIndex(600_000)).toBe(4);
    expect(bucketIndex(1_200_000)).toBe(5);
    // The top band is open-ended, so nothing can fall off the end of the table.
    expect(bucketIndex(Number.MAX_SAFE_INTEGER)).toBe(BUCKET_LABELS.length - 1);
  });

  it("keeps the band, bound, and threshold lists in step", () => {
    expect(BUCKET_LABELS).toHaveLength(BUCKET_BOUNDS_MS.length);
    expect(THRESHOLD_LABELS).toHaveLength(BUCKET_BOUNDS_MS.length - 1);
    expect(BUCKET_BOUNDS_MS.at(-1)).toBe(Number.POSITIVE_INFINITY);
  });

  it("formats a duration at the scale a reader is deciding in", () => {
    expect(formatMs(412)).toBe("412ms");
    expect(formatMs(8_222)).toBe("8.2s");
    expect(formatMs(1_592_521)).toBe("26.5min");
  });
});

describe("packed wall clock", () => {
  it("packs the longest files first, so the projection matches the CI allocator", () => {
    // 5+3 and 4+4 both fill to 8; LPT places 5,4,4,3 as [5,3] and [4,4].
    expect(packedWallClockMs([5, 4, 4, 3], 2)).toBe(8);
    expect(packedWallClockMs([10, 1, 1, 1], 4)).toBe(10);
    expect(packedWallClockMs([], 4)).toBe(0);
  });

  it("never reports a wall clock below the single longest file", () => {
    const costs = [1_592_521, 794_613, 704_596, 684_074];
    for (const workers of [1, 2, 4, 8, 64]) {
      expect(packedWallClockMs(costs, workers)).toBeGreaterThanOrEqual(Math.max(...costs));
    }
    // More workers than files cannot beat that floor — the point the staging
    // recommendation rests on for the census proofs.
    expect(packedWallClockMs(costs, 64)).toBe(1_592_521);
  });

  it("serializes everything into one worker", () => {
    expect(packedWallClockMs([5, 4, 3], 1)).toBe(12);
  });

  it("rejects a worker count that cannot run anything", () => {
    expect(() => packedWallClockMs([1], 0)).toThrow(/at least 1/);
  });
});

describe("reading measured records", () => {
  it("reads one lane per file and concatenates them", () => {
    const dir = mkdtempSync(join(tmpdir(), "af-durations-"));
    const fast = join(dir, "fast.jsonl");
    const exhaustive = join(dir, "exhaustive.jsonl");
    writeFileSync(fast, `${JSON.stringify(record("tests/unit/a.test.ts", 500))}\n\n`);
    writeFileSync(exhaustive, `${JSON.stringify(record("tests/regression/b.test.ts", 900_000))}\n`);
    const records = readDurationRecords([fast, exhaustive]);
    expect(records.map((r) => r.file)).toEqual([
      "tests/unit/a.test.ts",
      "tests/regression/b.test.ts",
    ]);
  });

  it("refuses a file measured twice rather than double-counting its cost", () => {
    const dir = mkdtempSync(join(tmpdir(), "af-durations-"));
    const path = join(dir, "both.jsonl");
    writeFileSync(
      path,
      `${JSON.stringify(record("tests/unit/a.test.ts", 500))}\n${JSON.stringify(record("tests/unit/a.test.ts", 700))}\n`,
    );
    // Measuring one lane twice would inflate every total and quietly move files
    // between bands — the exact failure this census exists to replace.
    expect(() => readDurationRecords([path])).toThrow(/more than one duration file/);
  });
});

describe("census arguments", () => {
  it("reads the worker count, the json flag, and the input files", () => {
    expect(parseCensusArguments(["--workers", "2", "a.jsonl", "b.jsonl"])).toEqual({
      files: ["a.jsonl", "b.jsonl"],
      workers: 2,
      json: false,
    });
    expect(parseCensusArguments(["--json", "a.jsonl"]).json).toBe(true);
    expect(parseCensusArguments(["a.jsonl"]).workers).toBe(4);
  });

  it("rejects a call that would measure nothing or pack into no workers", () => {
    expect(() => parseCensusArguments([])).toThrow(/Usage/);
    expect(() => parseCensusArguments(["--workers", "0", "a.jsonl"])).toThrow(/Usage/);
    expect(() => parseCensusArguments(["--nope", "a.jsonl"])).toThrow(/Usage/);
  });
});

describe("rendering", () => {
  it("reports every file exactly once across the bands", () => {
    const records = [
      record("tests/unit/a.test.ts", 400, 3),
      record("tests/unit/b.test.ts", 45_000, 2),
      record("tests/regression/c.test.ts", 1_592_521, 1),
    ];
    const rendered = renderCensus(records, 4);
    expect(rendered).toContain("Measured 3 test files / 6 test cases");
    // The longest file bounds the whole-suite wall clock no matter the worker count.
    expect(rendered).toContain("26.5min");
    for (const file of records) expect(rendered).toContain(file.file);
  });
});

describe("measurement driver", () => {
  it("defaults to the fast lane and a lane-named output file", () => {
    expect(parseMeasureArguments([])).toEqual({
      lane: "fast",
      out: "ai-runs/test-durations-fast.jsonl",
    });
    expect(parseMeasureArguments(["--lane", "exhaustive"]).out).toBe(
      defaultOutputPath("exhaustive"),
    );
    expect(parseMeasureArguments(["--out", "x.jsonl"]).out).toBe("x.jsonl");
  });

  it("rejects an unknown lane rather than silently measuring the wrong one", () => {
    expect(() => parseMeasureArguments(["--lane", "nightly"])).toThrow(/Expected one of/);
    expect(() => parseMeasureArguments(["--lane"])).toThrow(/Usage/);
  });

  it("selects each lane's real vitest projects", () => {
    // The exhaustive lane is four projects, not one: vitest.config.ts splits the six
    // census proofs across them precisely so they do not run concurrently.
    expect(LANE_PROJECT_FLAGS.exhaustive.filter((flag) => flag !== "--project")).toEqual([
      "exhaustive-rpg",
      "variant-liveness-proof",
      "ending-render-proof",
      "metamorphic-observation",
    ]);
    expect(vitestArgumentsFor("fast")).toContain("standard");
    expect(vitestArgumentsFor("fast")).toContain("--reporter=./scripts/test-duration-reporter.ts");
  });
});
