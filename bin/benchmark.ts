#!/usr/bin/env -S npx tsx
/**
 * bin/benchmark — print the objective benchmark scorecard (ULTRAPLAN 2026-06-02).
 *
 * Usage:
 *   npm run benchmark                       # markdown to stdout
 *   npm run benchmark -- --json             # JSON to stdout
 *   npm run benchmark -- --runs 100         # runs per (pack, strategy) cell
 *   npm run benchmark -- --out traces/benchmark/scorecard   # write .md + .json
 *
 * Deterministic: plays every playable pack with the seeded coverage/random bot via
 * the same tool API external agents use, and emits one comparable row per
 * (pack, strategy). The structure is ready for real frontier-model rows to slot in.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { buildScorecard, renderJson, renderMarkdown } from "../src/afk/benchmark.js";

function argValue(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function main(): void {
  const runsArg = argValue("--runs");
  const runs = runsArg !== undefined ? Number(runsArg) : undefined;
  if (runs !== undefined && (!Number.isFinite(runs) || runs <= 0)) {
    throw new Error(`--runs must be a positive number, got "${runsArg}"`);
  }
  const card = buildScorecard({ root: process.cwd(), ...(runs !== undefined ? { runs } : {}) });

  const out = argValue("--out");
  if (out !== undefined) {
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(`${out}.json`, renderJson(card) + "\n");
    writeFileSync(`${out}.md`, renderMarkdown(card) + "\n");
    console.log(`Wrote ${out}.json and ${out}.md`);
    return;
  }
  console.log(process.argv.includes("--json") ? renderJson(card) : renderMarkdown(card));
}

main();
