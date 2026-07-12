#!/usr/bin/env -S npx tsx
/**
 * bin/feedback — CLI front end for the feedback compiler (Task 16): compiles
 * verified blind-tester reports + crawler findings into ranked
 * `hotspots.json` / `hotspots.md` plus the mode-separated `retention.json`.
 *
 * Usage:
 *   npm run feedback:compile -- [--in <path>]... [--out <dir>] [--top K]
 *                                [--prev <dir>] [--llm-labels]
 *
 * Thin main: parse flags -> resolve defaults -> compileFeedback (all the
 * actual logic lives in src/feedback/compile.ts, unit-tested there) -> print
 * a short summary + the artifact paths.
 */
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { compileFeedback, type CompileOptions } from "../src/feedback/compile.js";

class FeedbackUsageError extends Error {}

type ParsedArgs = {
  inputs: string[];
  outDir: string | null;
  topK: number;
  llmLabels: boolean;
  prevDir: string | null;
};

function requireValue(flag: string, raw: string | undefined): string {
  if (raw === undefined) throw new FeedbackUsageError(`${flag} requires a value`);
  return raw;
}

function parseFeedbackArgs(argv: string[]): ParsedArgs {
  const inputs: string[] = [];
  let outDir: string | null = null;
  let topK = 10;
  let llmLabels = false;
  let prevDir: string | null = null;

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    switch (a) {
      case "--in":
        inputs.push(requireValue("--in", argv[++i]));
        break;
      case "--out":
        outDir = requireValue("--out", argv[++i]);
        break;
      case "--top": {
        const raw = requireValue("--top", argv[++i]);
        const n = Number(raw);
        if (!Number.isInteger(n) || n < 1) {
          throw new FeedbackUsageError(`--top must be a positive integer, got "${raw}"`);
        }
        topK = n;
        break;
      }
      case "--prev":
        prevDir = requireValue("--prev", argv[++i]);
        break;
      case "--llm-labels":
        llmLabels = true;
        break;
      default:
        throw new FeedbackUsageError(`unrecognized flag "${a}"`);
    }
  }
  return { inputs, outDir, topK, llmLabels, prevDir };
}

/** yyyymmddThhmmssZ — matches loadPreviousHotspots' lexicographic-sort assumption. */
function utcStamp(now: Date = new Date()): string {
  const pad = (n: number): string => String(n).padStart(2, "0");
  return (
    `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}` +
    `T${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}Z`
  );
}

function defaultOutDir(): string {
  return join("ai-runs", "feedback", utcStamp());
}

/** Newest (lexicographically last) `ai-runs/crawl/<stamp>/findings.jsonl` under
 *  `root`, or null if `ai-runs/crawl` doesn't exist or holds no findings.jsonl —
 *  used only to fill in the default `--in` set when the caller passes none. */
function findNewestCrawlFindings(root: string): string | null {
  const crawlRoot = join(root, "ai-runs", "crawl");
  if (!existsSync(crawlRoot)) return null;
  const dirNames = readdirSync(crawlRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => existsSync(join(crawlRoot, name, "findings.jsonl")))
    .sort();
  const newest = dirNames[dirNames.length - 1];
  return newest ? join("ai-runs", "crawl", newest, "findings.jsonl") : null;
}

function defaultInputs(root: string): string[] {
  const inputs = ["blind-tester/reports"];
  const crawlFindings = findNewestCrawlFindings(root);
  if (crawlFindings) inputs.push(crawlFindings);
  return inputs;
}

function main(): void {
  let parsed: ParsedArgs;
  try {
    parsed = parseFeedbackArgs(process.argv.slice(2));
  } catch (err) {
    if (err instanceof FeedbackUsageError) {
      console.error(`usage error: ${err.message}`);
      process.exit(2);
    }
    throw err;
  }

  const root = process.cwd();
  const inputs = parsed.inputs.length > 0 ? parsed.inputs : defaultInputs(root);
  const outDir = parsed.outDir ?? defaultOutDir();

  if (parsed.llmLabels) {
    console.log("labels pass skipped (not configured)");
  }

  const opts: CompileOptions = {
    root,
    inputs,
    outDir,
    topK: parsed.topK,
    llmLabels: parsed.llmLabels,
    prevDir: parsed.prevDir,
  };

  const { file, evidence, jsonPath, mdPath, retentionPath } = compileFeedback(opts);

  console.log(
    `feedback:compile — ${file.inputs.verified_reports} verified reports ` +
      `(${file.inputs.rejected_reports} rejected), ${file.inputs.crawl_findings} crawl findings, ` +
      `${file.hotspots.length} hot spots.`,
  );
  console.log(
    `Retention evidence: ${evidence.pure_retention.eligible_reports} pure exits, ` +
      `${evidence.pure_retention.continued_reports} continued at least once; ` +
      `other verified modes: ${evidence.report_modes.structural} structural, ` +
      `${evidence.report_modes.legacy_guided} legacy-guided.`,
  );
  if (file.recommended_next_fix) {
    console.log(`Recommended next fix: ${file.recommended_next_fix.hotspot_id}`);
  }
  console.log(`Wrote ${jsonPath}`);
  console.log(`Wrote ${mdPath}`);
  console.log(`Wrote ${retentionPath}`);
}

try {
  main();
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
}
