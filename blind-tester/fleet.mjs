#!/usr/bin/env node
/**
 * blind-tester/fleet.mjs — one command that runs N independent blind playtests
 * with bounded concurrency, pacing/backoff, resume, and a manifest.
 *
 * Each run is a `blind-tester/run.sh` spawn (same script a solo `npm run blind`
 * uses), given a distinct seed/persona/model/target combination. There is NO
 * temperature/top_p knob — those flags do not exist on the `claude` CLI
 * invocation inside run.sh (see run.sh's default path). persona × model ×
 * seed × target IS the diversity mechanism here; do not invent sampling flags.
 *
 * `--mock` sets BLIND_AGENT_CMD to `blind-tester/mock-agent.mjs` (Task 13,
 * zero tokens) in the child env; this module does not care whether that file
 * exists yet — a missing mock agent just makes every run.sh spawn fail, which
 * this orchestrator already treats as an ordinary retryable/failed run.
 */
import { spawn, execFileSync } from "node:child_process";
import { existsSync, mkdirSync, appendFileSync, writeFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const GAME_DIR = resolve(HERE, "..");
const RUN_SH = join(HERE, "run.sh");
const MOCK_AGENT = join(HERE, "mock-agent.mjs");

// Rotation order for `--personas mixed`; must match the shipped persona files
// in blind-tester/personas/ (see fill-prompt.mjs / run.sh's --persona flag).
const PERSONA_ROTATION = ["explorer", "speedrunner", "breaker", "casual", "lore-reader"];

// `--model mix` weighting: 9 haiku : 1 sonnet by default. There is no
// temperature/top_p axis to spend instead — see the module docstring.
const DEFAULT_MODEL_MIX = [
  { model: "haiku", weight: 9 },
  { model: "sonnet", weight: 1 },
];

/** Throw a usage error for an out-of-range/non-integer numeric flag. `min` is
 * the sensible floor per the brief (count/concurrency >= 1, maxRetries >= 0);
 * pass `undefined` for flags with no floor (seedBase — negative seeds are
 * legal, see reportPathFor's `-?\d+` ledger regex). */
function assertFleetInt(value, flag, min) {
  if (!Number.isInteger(value) || (min !== undefined && value < min)) {
    const bound = min !== undefined ? `an integer >= ${min}` : "an integer";
    throw new Error(`fleet: --${flag} must be ${bound} (got ${value})`);
  }
}

/** Parse fleet CLI args into a plain options object (pure; exported for tests).
 * Throws a plain Error (message prefixed "fleet: ") on invalid numeric flags —
 * callers (main()) catch it, print the message, and exit 2 before spawning
 * anything. Valid-input shape is unchanged/backward-compatible. */
export function parseFleetArgs(argv) {
  const opts = {
    count: 100,
    concurrency: 4,
    model: "haiku",
    personas: "mixed",
    target: "overworld",
    seedBase: 1000,
    mock: false,
    label: null,
    maxRetries: 2,
    out: null,
    modelMix: DEFAULT_MODEL_MIX,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case "--count":
        opts.count = Number(argv[++i]);
        break;
      case "--concurrency":
        opts.concurrency = Number(argv[++i]);
        break;
      case "--model":
        opts.model = argv[++i];
        break;
      case "--personas":
        opts.personas = argv[++i];
        break;
      case "--target":
        opts.target = argv[++i];
        break;
      case "--seed-base":
        opts.seedBase = Number(argv[++i]);
        break;
      case "--mock":
        opts.mock = true;
        break;
      case "--label":
        opts.label = argv[++i];
        break;
      case "--max-retries":
        opts.maxRetries = Number(argv[++i]);
        break;
      case "--out":
        opts.out = argv[++i];
        break;
      default:
        // Unknown flag — ignored (forward-compatible; there is no
        // temperature/top_p flag to accidentally accept here either).
        break;
    }
  }
  assertFleetInt(opts.count, "count", 1);
  assertFleetInt(opts.concurrency, "concurrency", 1);
  assertFleetInt(opts.seedBase, "seed-base", undefined);
  assertFleetInt(opts.maxRetries, "max-retries", 0);
  return opts;
}

/** Deterministic (never random) model pick for `--model mix`, by run index. */
function modelForMixIndex(modelMix, i) {
  // i % 10 === 9 → the stronger slice (index 1, sonnet by default); otherwise
  // the base slice (index 0, haiku by default). Fixed by index, not sampled —
  // reproducible fleets are the point.
  return i % 10 === 9 ? modelMix[1].model : modelMix[0].model;
}

/** Expand parsed fleet options into the concrete list of runs (pure; exported for tests). */
export function planFleetRuns(opts) {
  const runs = [];
  for (let i = 0; i < opts.count; i++) {
    const seed = opts.seedBase + i;
    const persona =
      opts.personas === "mixed" ? PERSONA_ROTATION[i % PERSONA_ROTATION.length] : opts.personas;
    const model = opts.model === "mix" ? modelForMixIndex(opts.modelMix, i) : opts.model;
    runs.push({ seed, persona, model, target: opts.target });
  }
  return runs;
}

/** "overworld" stays as-is; "quest:<id>" → run.sh's SOURCE_SLUG, the bare quest id. */
function sourceSlugFor(target) {
  return target === "overworld" ? "overworld" : target.replace(/^quest:/, "");
}

function questIdFor(target) {
  return target === "overworld" ? null : target.replace(/^quest:/, "");
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Build the report .md path for one run. Matches the ledger regex the
 * assessor + feedback ledger parse: ^(\d{8}T\d{6}Z)_(.+)_seed(-?\d+)\.md$
 * (pure; exported for tests). run.sh's --out takes a PREFIX and appends
 * .md/.json/.log itself — callers that spawn run.sh must strip this ".md".
 */
export function reportPathFor(reportsDir, stamp, target, seed) {
  const slug = sourceSlugFor(target);
  return join(reportsDir, `${stamp}_${slug}_seed${seed}.md`);
}

/** UTC wall-clock stamp yyyymmddThhmmssZ — run metadata, not simulation state. */
function utcStamp(now = new Date()) {
  const pad = (n) => String(n).padStart(2, "0");
  return (
    `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}` +
    `T${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}Z`
  );
}

// --- Windows Git-Bash resolution, copied from blind-tester/blind-launch.mjs
// (isRealBash / gitBash) rather than imported: blind-launch.mjs only exports
// recoverNpmEatenFlags, and the brief for this task says copy-with-a-comment
// instead of modifying that file's exports. Keep in sync by hand if that
// resolution logic ever changes there.

/** A usable bash: exists and is NOT the System32 WSL launcher. */
function isRealBash(p) {
  return typeof p === "string" && p !== "" && existsSync(p) && !/system32/i.test(p);
}

function gitBash() {
  if (isRealBash(process.env.BLIND_BASH)) return process.env.BLIND_BASH;
  if (
    process.env.SHELL &&
    /bash(\.exe)?$/i.test(process.env.SHELL) &&
    isRealBash(process.env.SHELL)
  )
    return process.env.SHELL;
  if (process.env.EXEPATH && isRealBash(join(process.env.EXEPATH, "bash.exe")))
    return join(process.env.EXEPATH, "bash.exe");
  const candidates = [];
  try {
    const lines = execFileSync("where", ["git"], { encoding: "utf8" })
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    for (const git of lines) {
      for (const up of ["..", join("..", "..")]) {
        const root = resolve(dirname(git), up);
        candidates.push(join(root, "bin", "bash.exe"), join(root, "usr", "bin", "bash.exe"));
      }
    }
  } catch {
    // fall through to the well-known install locations
  }
  candidates.push(
    "C:\\Program Files\\Git\\bin\\bash.exe",
    "C:\\Program Files (x86)\\Git\\bin\\bash.exe",
    join(process.env.LOCALAPPDATA ?? "", "Programs", "Git", "bin", "bash.exe"),
  );
  return candidates.find(isRealBash) ?? null;
}

// --- Async process helpers (spawnSync would serialize the whole pool; the
// fleet's bounded concurrency needs a real async child_process.spawn).

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function spawnAsync(cmd, args, opts) {
  return new Promise((resolvePromise) => {
    let child;
    try {
      child = spawn(cmd, args, opts);
    } catch (err) {
      resolvePromise({ status: 1, stdout: "", stderr: String(err) });
      return;
    }
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (d) => {
      stdout += d;
    });
    child.stderr?.on("data", (d) => {
      stderr += d;
    });
    child.on("close", (code) => resolvePromise({ status: code ?? 1, stdout, stderr }));
    child.on("error", (err) => resolvePromise({ status: 1, stdout, stderr: String(err) }));
  });
}

/** Belt-and-braces re-verification: run.sh already ran the verifier as its own
 * last step, but this is a second, independent pass, per the brief. Returns
 * stdout/stderr too (not just ok) so failed-attempt diagnostics can surface
 * *why* the reverify rejected an exit-0 run.sh. */
async function verifyReport(reportMdPath) {
  if (!existsSync(reportMdPath)) return { ok: false, stdout: "", stderr: "" };
  const result = await spawnAsync(
    "npm",
    ["--silent", "exec", "tsx", "--", "scripts/verify-blind-report.ts", reportMdPath],
    { cwd: GAME_DIR, shell: process.platform === "win32" },
  );
  return { ok: result.status === 0, stdout: result.stdout, stderr: result.stderr };
}

/** Pure matcher (exported for tests): which `readdirSync` entries are resume
 * candidates for (sourceSlug, seed), newest-stamp-first. The regex is fully
 * anchored (`^...$`) so e.g. seed `1` can never match a `seed10` filename —
 * the literal `\.md$` immediately after the seed digits rules that out.
 * Filenames sort newest-first by plain string descending order because the
 * leading stamp (yyyymmddThhmmssZ) is lexicographically monotonic with time. */
export function resumeCandidatesFor(entries, sourceSlug, seed) {
  const re = new RegExp(
    `^\\d{8}T\\d{6}Z_${escapeRegExp(sourceSlug)}_seed${escapeRegExp(String(seed))}\\.md$`,
  );
  return entries.filter((f) => re.test(f)).sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));
}

/** Stamp-agnostic resume lookup: ALL existing reports matching this run's
 * source slug + seed, regardless of which fleet stamp produced them, newest
 * first — a stale FAILED report from an earlier invocation must not shadow a
 * later VERIFIED one from a subsequent invocation. */
function findExistingReport(reportsDir, target, seed) {
  const slug = sourceSlugFor(target);
  let entries;
  try {
    entries = readdirSync(reportsDir);
  } catch {
    return [];
  }
  return resumeCandidatesFor(entries, slug, seed).map((f) => join(reportsDir, f));
}

/** Last ~n chars of a string — bounded tail for per-attempt diagnostic logs. */
function tail(s, n = 2000) {
  return s.length > n ? s.slice(-n) : s;
}

/** First error-looking line of stderr (falls back to the first non-blank
 * line, then a placeholder) — the one-line summary printed to fleet's own
 * stderr on a failed attempt. */
function firstErrorLine(text) {
  if (!text) return "(no stderr)";
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  return lines.find((l) => /error/i.test(l)) ?? lines[0] ?? "(empty stderr)";
}

/** A promise pool of bounded size — the fleet's concurrency knob. */
async function runPool(items, size, worker) {
  let next = 0;
  const laneCount = Math.max(1, Math.min(size, items.length || 1));
  const lanes = new Array(laneCount).fill(0).map(async () => {
    while (next < items.length) {
      const i = next++;
      await worker(items[i], i);
    }
  });
  await Promise.all(lanes);
}

/** Run one fleet slot to completion: resume check, then launch (with pacing
 * retries up to opts.maxRetries), returning the manifest row for this run. */
async function executeRun(run, { reportsDir, stamp, opts, bashPath, fleetDir }) {
  const target = run.target;
  const questId = questIdFor(target);

  // Check ALL stamp-agnostic candidates, newest-stamp-first, stopping at the
  // first that re-verifies — a stale FAILED report must never shadow a later
  // VERIFIED one produced by a prior fleet invocation.
  for (const candidate of findExistingReport(reportsDir, target, run.seed)) {
    const verify = await verifyReport(candidate);
    if (verify.ok) {
      return { report: candidate, status: "skipped-resume", attempts: 0, exit: 0 };
    }
  }

  const reportMd = reportPathFor(reportsDir, stamp, target, run.seed);
  const outPrefix = reportMd.slice(0, -".md".length); // run.sh appends .md/.json/.log itself
  const maxAttempts = Math.max(1, opts.maxRetries + 1);

  let lastExit = 1;
  let lastLogPath = null;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const args = [
      "--seed",
      String(run.seed),
      "--model",
      run.model,
      "--persona",
      run.persona,
      "--out",
      outPrefix,
    ];
    args.push(...(questId ? ["--quest", questId] : ["--overworld"]));

    const env = { ...process.env };
    if (opts.mock) {
      // Forward-slashed to be a safe bash -c command-line fragment on Windows
      // (run.sh does `bash -c "$BLIND_AGENT_CMD"`, so this value is parsed as
      // shell syntax, not pre-split argv).
      env.BLIND_AGENT_CMD = `node "${MOCK_AGENT.replace(/\\/g, "/")}"`;
    }

    const bashResult = await spawnAsync(bashPath, [RUN_SH, ...args], { cwd: GAME_DIR, env });
    lastExit = bashResult.status ?? 1;
    let verifyResult = null;

    if (lastExit === 0) {
      verifyResult = await verifyReport(reportMd);
      if (verifyResult.ok) {
        return { report: reportMd, status: "verified", attempts: attempt + 1, exit: 0 };
      }
      lastExit = 5; // run.sh exited 0 but the belt-and-braces re-verify rejected it
    }

    // Failed attempt: persist stdout/stderr tails to a per-attempt log file
    // (verified runs never reach here — they returned above) and print a
    // one-line stderr summary to the fleet's own stderr for live monitoring.
    const logPath = join(fleetDir, `seed_${run.seed}_attempt_${attempt + 1}.log`);
    const sections = [
      `run.sh exit=${bashResult.status ?? "null"}`,
      "--- run.sh stdout (tail) ---",
      tail(bashResult.stdout),
      "--- run.sh stderr (tail) ---",
      tail(bashResult.stderr),
    ];
    if (verifyResult) {
      sections.push(
        "--- verify stdout (tail) ---",
        tail(verifyResult.stdout),
        "--- verify stderr (tail) ---",
        tail(verifyResult.stderr),
      );
    }
    writeFileSync(logPath, `${sections.join("\n")}\n`);
    lastLogPath = logPath;
    const summarySource =
      verifyResult && verifyResult.stderr ? verifyResult.stderr : bashResult.stderr;
    console.error(
      `[fleet] seed=${run.seed} attempt=${attempt + 1} failed (exit ${lastExit}): ${firstErrorLine(summarySource)}`,
    );

    const isLastAttempt = attempt === maxAttempts - 1;
    if (!isLastAttempt) {
      const delayMs = opts.mock ? 0 : 20_000 * 2 ** attempt;
      if (delayMs > 0) await sleep(delayMs);
    }
  }
  return {
    report: reportMd,
    status: "failed",
    attempts: maxAttempts,
    exit: lastExit,
    log: lastLogPath,
  };
}

async function main() {
  let opts;
  try {
    opts = parseFleetArgs(process.argv.slice(2));
  } catch (err) {
    // Usage error (non-finite/out-of-range numeric flag, e.g. --count 0):
    // exit 2 before touching the filesystem or spawning anything.
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(2);
    return;
  }
  const runs = planFleetRuns(opts);

  const reportsDir = opts.out ? resolve(opts.out) : join(HERE, "reports");
  mkdirSync(reportsDir, { recursive: true });

  const stamp = utcStamp();
  const label = opts.label ?? stamp;
  const fleetDir = join(GAME_DIR, "ai-runs", "fleet", label);
  mkdirSync(fleetDir, { recursive: true });
  const manifestPath = join(fleetDir, "manifest.jsonl");
  const summaryPath = join(fleetDir, "summary.json");

  let bashPath = "bash";
  if (process.platform === "win32") {
    const found = gitBash();
    if (!found) {
      console.error(
        "Could not find Git Bash (looked via `where git`; System32 bash.exe is the WSL launcher and cannot run this harness against a Windows checkout).",
      );
      console.error("Install Git for Windows or set BLIND_BASH to a bash.exe path.");
      process.exit(3);
    }
    bashPath = found;
  }

  const counts = { verified: 0, "skipped-resume": 0, failed: 0 };

  await runPool(runs, Math.max(1, opts.concurrency), async (run) => {
    const result = await executeRun(run, { reportsDir, stamp, opts, bashPath, fleetDir });
    counts[result.status] += 1;
    const row = {
      seed: run.seed,
      persona: run.persona,
      model: run.model,
      target: run.target,
      report: result.report,
      status: result.status,
      attempts: result.attempts,
      exit: result.exit,
      log: result.log ?? null, // per-attempt diagnostic log path; null for verified/skipped-resume
    };
    appendFileSync(manifestPath, `${JSON.stringify(row)}\n`);
    console.log(
      `[fleet] seed=${run.seed} persona=${run.persona} model=${run.model} → ${result.status}`,
    );
  });

  const summary = {
    label,
    stamp,
    count: runs.length,
    concurrency: opts.concurrency,
    reportsDir,
    verified: counts.verified,
    "skipped-resume": counts["skipped-resume"],
    failed: counts.failed,
  };
  writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`);

  const ok = counts.verified + counts["skipped-resume"] === runs.length;
  console.log(
    `Fleet ${label}: ${counts.verified} verified, ${counts["skipped-resume"]} skipped-resume, ${counts.failed} failed (of ${runs.length})`,
  );
  console.log(`Manifest: ${manifestPath}`);
  process.exitCode = ok ? 0 : 1;
}

// Entry guard so tests can import the pure planning functions without
// launching a fleet.
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
