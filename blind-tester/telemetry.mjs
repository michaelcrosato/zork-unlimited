#!/usr/bin/env node
/**
 * blind-tester/telemetry — lightweight token/cost telemetry for blind runs
 * (the ROADMAP lever: "measure loop efficiency instead of guessing").
 *
 * `claude -p --output-format json` already returns everything worth measuring
 * (duration, turns, token usage, nominal cost) in the envelope run.sh saves as
 * <out>.json. This records one compact JSONL row per run under the gitignored
 * ai-runs/ evidence root, and summarizes what has accumulated:
 *
 *   node blind-tester/telemetry.mjs record <out.json> --source overworld --seed 7 --model sonnet
 *   node blind-tester/telemetry.mjs summary            # or: npm run blind:telemetry
 *
 * run.sh records one terminal gameplay outcome after verification/recovery and
 * records any report-only repair as a separately phased row. A telemetry
 * failure never fails the run (measurement must not gate the thing it measures).
 * The BLIND_AGENT_CMD override path produces no claude envelope, so it is not
 * recorded here. total_cost_usd is the NOMINAL API price of the run — the
 * subscription covers it; it is tracked as an efficiency signal, not a bill.
 */
import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
export const DEFAULT_TELEMETRY_FILE = join(HERE, "..", "ai-runs", "blind-telemetry.jsonl");

const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const PLAYTHROUGH_SUCCESS_OUTCOMES = new Set([
  "success",
  "verified",
  "verified_receipt_bound",
  "verified_recovered",
]);
const RECOVERY_SUCCESS_OUTCOMES = new Set(["passed", "success"]);

/**
 * Reduce a claude CLI JSON envelope + run metadata to one flat telemetry row
 * (pure; exported for tests). Missing/foreign envelope fields become nulls —
 * a row is always produced so a weird envelope still leaves a trace.
 */
export function extractBlindTelemetry(envelope, meta = {}) {
  const usage = envelope?.usage ?? {};
  return {
    ts: meta.ts ?? null,
    source: meta.source ?? null,
    phase: meta.phase ?? "playthrough",
    report_outcome: meta.outcome ?? null,
    seed: num(Number(meta.seed)),
    model: meta.model ?? null,
    ok: envelope?.is_error === undefined ? null : envelope.is_error !== true,
    duration_ms: num(envelope?.duration_ms),
    num_turns: num(envelope?.num_turns),
    total_cost_usd: num(envelope?.total_cost_usd),
    input_tokens: num(usage.input_tokens),
    output_tokens: num(usage.output_tokens),
    cache_read_input_tokens: num(usage.cache_read_input_tokens),
    cache_creation_input_tokens: num(usage.cache_creation_input_tokens),
  };
}

export function parseBlindTelemetryEnvelope(text) {
  try {
    return text.trim().length === 0 ? {} : JSON.parse(text);
  } catch {
    return {};
  }
}

/**
 * Aggregate rows per source (pure; exported for tests). Nulls are skipped per
 * metric, so a partial row still counts toward the metrics it does carry.
 */
export function summarizeBlindTelemetry(rows) {
  const bySource = new Map();
  for (const row of rows) {
    const key = row.source ?? "(unknown)";
    const s = bySource.get(key) ?? {
      source: key,
      runs: 0,
      failed: 0,
      total_cost_usd: 0,
      turns: [],
      minutes: [],
      output_tokens: 0,
      recovery_attempts: 0,
      recovery_failed: 0,
      recovery_total_cost_usd: 0,
      recovery_output_tokens: 0,
    };
    if (row.phase === "report_recovery") {
      s.recovery_attempts += 1;
      const recoveryOutcome =
        typeof row.report_outcome === "string" && row.report_outcome.length > 0
          ? row.report_outcome
          : null;
      if (
        row.ok === false ||
        (recoveryOutcome !== null && !RECOVERY_SUCCESS_OUTCOMES.has(recoveryOutcome))
      ) {
        s.recovery_failed += 1;
      }
      if (row.total_cost_usd !== null) s.recovery_total_cost_usd += row.total_cost_usd;
      if (row.output_tokens !== null) s.recovery_output_tokens += row.output_tokens;
      bySource.set(key, s);
      continue;
    }
    s.runs += 1;
    const terminalOutcome =
      typeof row.report_outcome === "string" && row.report_outcome.length > 0
        ? row.report_outcome
        : null;
    if (
      row.ok === false ||
      (terminalOutcome !== null && !PLAYTHROUGH_SUCCESS_OUTCOMES.has(terminalOutcome))
    ) {
      s.failed += 1;
    }
    if (row.total_cost_usd !== null) s.total_cost_usd += row.total_cost_usd;
    if (row.num_turns !== null) s.turns.push(row.num_turns);
    if (row.duration_ms !== null) s.minutes.push(row.duration_ms / 60_000);
    if (row.output_tokens !== null) s.output_tokens += row.output_tokens;
    bySource.set(key, s);
  }
  const mean = (xs) => (xs.length === 0 ? null : xs.reduce((a, b) => a + b, 0) / xs.length);
  return [...bySource.values()]
    .sort((a, b) => a.source.localeCompare(b.source))
    .map((s) => ({
      source: s.source,
      runs: s.runs,
      failed: s.failed,
      total_cost_usd: Math.round(s.total_cost_usd * 100) / 100,
      mean_turns: mean(s.turns) === null ? null : Math.round(mean(s.turns) * 10) / 10,
      mean_minutes: mean(s.minutes) === null ? null : Math.round(mean(s.minutes) * 10) / 10,
      output_tokens: s.output_tokens,
      recovery_attempts: s.recovery_attempts,
      recovery_failed: s.recovery_failed,
      recovery_total_cost_usd: Math.round(s.recovery_total_cost_usd * 100) / 100,
      recovery_output_tokens: s.recovery_output_tokens,
    }));
}

function argValue(argv, flag) {
  const i = argv.indexOf(flag);
  return i >= 0 ? argv[i + 1] : undefined;
}

/** First token that is neither a --flag nor a --flag's value. */
function firstPositional(argv) {
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i].startsWith("--")) {
      i += 1; // every flag here takes a value
      continue;
    }
    return argv[i];
  }
  return undefined;
}

function readRows(file) {
  let raw;
  try {
    raw = readFileSync(file, "utf8");
  } catch {
    return [];
  }
  return raw
    .split(/\r?\n/)
    .filter((line) => line.trim() !== "")
    .flatMap((line) => {
      try {
        return [JSON.parse(line)];
      } catch {
        return []; // a mangled row must not kill the whole summary
      }
    });
}

function main() {
  const [command, ...rest] = process.argv.slice(2);
  const file = argValue(rest, "--file") ?? DEFAULT_TELEMETRY_FILE;

  if (command === "record") {
    const envelopePath = firstPositional(rest);
    if (!envelopePath) {
      console.error("Usage: telemetry.mjs record <out.json> --source <s> [--seed n] [--model m]");
      process.exit(2);
    }
    let envelope = {};
    try {
      envelope = parseBlindTelemetryEnvelope(readFileSync(resolve(envelopePath), "utf8"));
    } catch {
      // A timeout commonly leaves the single-result envelope empty, and a
      // launcher failure may leave it partial. Terminal outcome metadata still
      // records the attempt with null usage rather than silently losing it.
    }
    const row = extractBlindTelemetry(envelope, {
      ts: new Date().toISOString(),
      source: argValue(rest, "--source"),
      seed: argValue(rest, "--seed"),
      model: argValue(rest, "--model"),
      phase: argValue(rest, "--phase") ?? "playthrough",
      outcome: argValue(rest, "--outcome"),
    });
    mkdirSync(dirname(file), { recursive: true });
    appendFileSync(file, `${JSON.stringify(row)}\n`);
    console.log(
      `telemetry: ${row.source} · ${row.phase} · ${row.num_turns ?? "?"} turns · ` +
        `${row.duration_ms === null ? "?" : (row.duration_ms / 60_000).toFixed(1)} min · ` +
        `$${row.total_cost_usd === null ? "?" : row.total_cost_usd.toFixed(2)} nominal → ${file}`,
    );
    return;
  }

  if (command === "summary" || command === undefined) {
    const rows = readRows(file);
    if (rows.length === 0) {
      console.log(`No blind-run telemetry yet (${file}). Runs record here automatically.`);
      return;
    }
    console.log(`Blind-run telemetry — ${rows.length} row(s)  (${file})`);
    for (const s of summarizeBlindTelemetry(rows)) {
      console.log(
        `  ${s.source}: ${s.runs} run(s)${s.failed ? ` (${s.failed} failed)` : ""} · ` +
          `mean ${s.mean_turns ?? "?"} turns · mean ${s.mean_minutes ?? "?"} min · ` +
          `${s.output_tokens} output tok · $${s.total_cost_usd} nominal total` +
          (s.recovery_attempts > 0
            ? ` · ${s.recovery_attempts} report repair(s), ${s.recovery_output_tokens} output tok, $${s.recovery_total_cost_usd} nominal${s.recovery_failed ? ` (${s.recovery_failed} failed)` : ""}`
            : ""),
      );
    }
    return;
  }

  console.error(`Unknown telemetry command "${command}" (expected: record | summary).`);
  process.exit(2);
}

// Entry guard so tests can import the pure functions without side effects.
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main();
}
