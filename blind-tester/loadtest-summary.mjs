#!/usr/bin/env node
// Summarize ai-runs/loadtest.jsonl — playthrough count, completion/error rate,
// token economy (per-run + cumulative), server tool-call stats, and cost. Used to
// monitor the load/soak test and pace it under the subscription rate limit.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const GAME_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const path = process.argv[2]
  ? resolve(process.argv[2])
  : join(GAME_DIR, "ai-runs", "loadtest.jsonl");

let lines = [];
try {
  lines = readFileSync(path, "utf8")
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l));
} catch {
  console.log(`(no records at ${path})`);
  process.exit(0);
}

const n = lines.length;
const completed = lines.filter((r) => r.completed && !r.is_error).length;
const errored = lines.filter((r) => r.is_error || r.status !== 0).length;
const toolErrRuns = lines.filter((r) => (r.tool_errors ?? 0) > 0).length;
const sum = (f) => lines.reduce((a, r) => a + (Number(f(r)) || 0), 0);
const arr = (f) => lines.map((r) => Number(f(r)) || 0).sort((a, b) => a - b);
const med = (a) => (a.length ? a[Math.floor(a.length / 2)] : 0);
const avg = (f) => (n ? Math.round(sum(f) / n) : 0);

const billable = arr((r) => r.billable_tokens);
const wall = arr((r) => r.wall_s);

console.log(`=== loadtest summary (${path}) ===`);
console.log(
  `playthroughs: ${n}   completed: ${completed}   errored: ${errored}   runs-with-tool-errors: ${toolErrRuns}`,
);
console.log(
  `billable tokens: total=${sum((r) => r.billable_tokens).toLocaleString()}  avg=${avg((r) => r.billable_tokens).toLocaleString()}  median=${med(billable).toLocaleString()}  max=${(billable.at(-1) ?? 0).toLocaleString()}`,
);
console.log(
  `  input=${sum((r) => r.input_tokens).toLocaleString()}  output=${sum((r) => r.output_tokens).toLocaleString()}  cacheCreate=${sum((r) => r.cache_creation_input_tokens).toLocaleString()}  cacheRead=${sum((r) => r.cache_read_input_tokens).toLocaleString()}`,
);
console.log(
  `gross tokens (incl cache reads): total=${sum((r) => r.gross_tokens).toLocaleString()}  avg=${avg((r) => r.gross_tokens).toLocaleString()}`,
);
console.log(`wall: avg=${avg((r) => r.wall_s)}s  median=${med(wall)}s  max=${wall.at(-1) ?? 0}s`);
console.log(
  `tool calls: total=${sum((r) => r.tool_calls)}  avg=${avg((r) => r.tool_calls)}   tool errors: ${sum((r) => r.tool_errors)}`,
);
console.log(
  `num_turns: avg=${avg((r) => r.num_turns)}   cost: total=$${sum((r) => r.cost_usd).toFixed(2)}  avg=$${(n ? sum((r) => r.cost_usd) / n : 0).toFixed(3)}`,
);
console.log(`progress: ${n}/50 playthroughs`);
