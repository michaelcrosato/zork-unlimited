import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

/**
 * Buckets every measured test file by what it costs and prints the staging picture:
 * which cohort is cheap enough to run on every commit, what each next threshold adds,
 * and what the resulting lane costs in wall clock at a given worker count.
 *
 * Reads the JSON Lines that `scripts/test-duration-reporter.ts` streams. Pass one file
 * per lane — the lanes are measured separately because `vitest.config.ts` deliberately
 * runs the census proofs one or two workers wide, so measuring them alongside the
 * standard project would price both under a concurrency neither actually gets.
 */

export interface DurationRecord {
  file: string;
  project: string;
  state: string;
  tests: number;
  totalMs: number;
  durationMs: number;
  collectMs: number;
  setupMs: number;
  environmentMs: number;
  prepareMs: number;
  cases: { name: string; ms: number; state: string }[];
}

/** The thresholds the staging question is asked in. Each is an upper bound, exclusive. */
export const BUCKET_BOUNDS_MS: readonly number[] = [
  10_000,
  60_000,
  300_000,
  600_000,
  1_200_000,
  Number.POSITIVE_INFINITY,
];

export const BUCKET_LABELS: readonly string[] = [
  "< 10s",
  "10s – 1min",
  "1 – 5min",
  "5 – 10min",
  "10 – 20min",
  "> 20min",
];

/** The same bounds named as thresholds, for the cumulative "everything under X" view. */
export const THRESHOLD_LABELS: readonly string[] = ["10s", "1min", "5min", "10min", "20min"];

export function bucketIndex(ms: number): number {
  const index = BUCKET_BOUNDS_MS.findIndex((bound) => ms < bound);
  return index === -1 ? BUCKET_BOUNDS_MS.length - 1 : index;
}

export function formatMs(ms: number): string {
  if (ms < 1_000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) return `${(ms / 1_000).toFixed(1)}s`;
  return `${(ms / 60_000).toFixed(1)}min`;
}

/**
 * Longest-processing-time packing — the same shape `scripts/ci-test-groups.ts` already
 * uses to split shards, so a projected lane wall clock here is comparable to what that
 * allocator produces. LPT is within 4/3 of optimal, and the bound that actually matters
 * for this suite is simpler: no worker count can beat the single longest file.
 */
export function packedWallClockMs(costs: readonly number[], workers: number): number {
  if (workers < 1) throw new Error(`Worker count must be at least 1, received ${workers}.`);
  if (costs.length === 0) return 0;
  const lanes = new Array<number>(workers).fill(0);
  for (const cost of [...costs].sort((left, right) => right - left)) {
    let lightest = 0;
    for (let index = 1; index < lanes.length; index += 1) {
      if ((lanes[index] ?? 0) < (lanes[lightest] ?? 0)) lightest = index;
    }
    lanes[lightest] = (lanes[lightest] ?? 0) + cost;
  }
  return Math.max(...lanes);
}

export function readDurationRecords(paths: readonly string[]): DurationRecord[] {
  const records: DurationRecord[] = [];
  for (const path of paths) {
    const raw = readFileSync(path, "utf8");
    for (const line of raw.split("\n")) {
      if (line.trim() === "") continue;
      records.push(JSON.parse(line) as DurationRecord);
    }
  }
  const seen = new Set<string>();
  for (const record of records) {
    if (seen.has(record.file)) {
      throw new Error(
        `${record.file} appears in more than one duration file — measure each lane once.`,
      );
    }
    seen.add(record.file);
  }
  return records;
}

function renderTable(headers: readonly string[], rows: readonly (readonly string[])[]): string {
  const widths = headers.map((header, column) =>
    Math.max(header.length, ...rows.map((row) => (row[column] ?? "").length)),
  );
  const line = (cells: readonly string[]): string =>
    cells
      .map((cell, column) => cell.padEnd(widths[column] ?? 0))
      .join("  ")
      .trimEnd();
  return [
    line(headers),
    line(widths.map((width) => "-".repeat(width))),
    ...rows.map((row) => line(row)),
  ].join("\n");
}

const sum = (values: readonly number[]): number => values.reduce((a, b) => a + b, 0);
const percent = (part: number, whole: number): string =>
  whole === 0 ? "0.0%" : `${((part / whole) * 100).toFixed(1)}%`;

export function renderCensus(records: readonly DurationRecord[], workers: number): string {
  const totalCost = sum(records.map((r) => r.totalMs));
  const totalCases = sum(records.map((r) => r.tests));
  const out: string[] = [];

  out.push(
    `Measured ${records.length} test files / ${totalCases} test cases; ` +
      `${formatMs(totalCost)} of summed worker time.`,
  );

  out.push("\n## Files per duration band\n");
  out.push(
    renderTable(
      ["band", "files", "% files", "cases", "summed cost", "% cost"],
      BUCKET_LABELS.map((label, index) => {
        const band = records.filter((r) => bucketIndex(r.totalMs) === index);
        const cost = sum(band.map((r) => r.totalMs));
        return [
          label,
          String(band.length),
          percent(band.length, records.length),
          String(sum(band.map((r) => r.tests))),
          formatMs(cost),
          percent(cost, totalCost),
        ];
      }),
    ),
  );

  out.push("\n## Cumulative — a lane holding every file under the threshold\n");
  let previousCount = 0;
  let previousCost = 0;
  out.push(
    renderTable(
      [
        "lane = every file under",
        "files",
        "% suite",
        "serial cost",
        `wall @${workers}w`,
        "vs. previous row",
      ],
      BUCKET_BOUNDS_MS.slice(0, -1).map((bound, index) => {
        const cohort = records.filter((r) => r.totalMs < bound);
        const cost = sum(cohort.map((r) => r.totalMs));
        const added = `+${cohort.length - previousCount} files, +${formatMs(cost - previousCost)}`;
        previousCount = cohort.length;
        previousCost = cost;
        return [
          THRESHOLD_LABELS[index] ?? "",
          String(cohort.length),
          percent(cohort.length, records.length),
          formatMs(cost),
          formatMs(
            packedWallClockMs(
              cohort.map((r) => r.totalMs),
              workers,
            ),
          ),
          added,
        ];
      }),
    ),
  );

  const cases = records.flatMap((r) => r.cases);
  out.push("\n## Individual test cases, by body time (import cost excluded)\n");
  out.push(
    renderTable(
      ["band", "cases", "% cases", "summed body time"],
      BUCKET_LABELS.map((label, index) => {
        const band = cases.filter((c) => bucketIndex(c.ms) === index);
        return [
          label,
          String(band.length),
          percent(band.length, cases.length),
          formatMs(sum(band.map((c) => c.ms))),
        ];
      }),
    ),
  );

  const body = sum(records.map((r) => r.durationMs));
  const collect = sum(records.map((r) => r.collectMs));
  const fixed = sum(records.map((r) => r.setupMs + r.environmentMs + r.prepareMs));
  out.push(
    `\n## Cost shape\n\ntest bodies ${formatMs(body)} (${percent(body, totalCost)})  |  ` +
      `imports/transform ${formatMs(collect)} (${percent(collect, totalCost)})  |  ` +
      `worker + env setup ${formatMs(fixed)} (${percent(fixed, totalCost)})`,
  );

  out.push("\n## The staging trade at each threshold\n");
  const suiteWall = packedWallClockMs(
    records.map((r) => r.totalMs),
    workers,
  );
  out.push(
    renderTable(
      [
        "gate = every file under",
        `gate wall @${workers}w`,
        "machine-time/day @30 commits",
        "files deferred",
        "cases deferred",
        "deferred cost",
      ],
      BUCKET_BOUNDS_MS.slice(0, -1).map((bound, index) => {
        const cohort = records.filter((r) => r.totalMs < bound);
        const deferred = records.filter((r) => r.totalMs >= bound);
        const wall = packedWallClockMs(
          cohort.map((r) => r.totalMs),
          workers,
        );
        return [
          THRESHOLD_LABELS[index] ?? "",
          formatMs(wall),
          formatMs(wall * 30),
          String(deferred.length),
          String(sum(deferred.map((r) => r.tests))),
          formatMs(sum(deferred.map((r) => r.totalMs))),
        ];
      }),
    ),
  );
  out.push(
    `\nRunning the whole measured set costs ${formatMs(suiteWall)} at ${workers} workers ` +
      `(${formatMs(suiteWall * 30)}/day at 30 commits, ${formatMs(suiteWall)}/day once nightly). ` +
      `The single longest file is ${formatMs(Math.max(...records.map((r) => r.totalMs)))}, ` +
      `which no worker count can go below.`,
  );

  const top = [...records].sort((l, r) => r.totalMs - l.totalMs).slice(0, 25);
  out.push("\n## The 25 most expensive files\n");
  out.push(
    renderTable(
      ["file", "total", "body", "imports", "cases", "project"],
      top.map((r) => [
        r.file,
        formatMs(r.totalMs),
        formatMs(r.durationMs),
        formatMs(r.collectMs),
        String(r.tests),
        r.project,
      ]),
    ),
  );

  return out.join("\n");
}

const USAGE =
  "Usage: tsx scripts/test-duration-census.ts [--workers <n>] [--json] <durations.jsonl...>";

export function parseCensusArguments(args: readonly string[]): {
  files: string[];
  workers: number;
  json: boolean;
} {
  const files: string[] = [];
  let workers = 4;
  let json = false;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--json") {
      json = true;
    } else if (arg === "--workers") {
      const value = Number(args[index + 1]);
      if (!Number.isInteger(value) || value < 1) throw new Error(USAGE);
      workers = value;
      index += 1;
    } else if (arg !== undefined && arg.startsWith("--")) {
      throw new Error(USAGE);
    } else if (arg !== undefined) {
      files.push(arg);
    }
  }
  if (files.length === 0) throw new Error(USAGE);
  return { files, workers, json };
}

function main(): void {
  const { files, workers, json } = parseCensusArguments(process.argv.slice(2));
  const records = readDurationRecords(files);
  if (json) {
    process.stdout.write(
      `${JSON.stringify(
        records.map((r) => ({ file: r.file, totalMs: r.totalMs, tests: r.tests })),
        null,
        2,
      )}\n`,
    );
    return;
  }
  console.log(renderCensus(records, workers));
}

if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main();
}
