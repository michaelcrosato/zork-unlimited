#!/usr/bin/env node
/**
 * blind-tester/fleet.mjs — one command that runs N independent blind playtests
 * with bounded concurrency, pacing/backoff, resume, and a manifest.
 *
 * Each run is a `blind-tester/run.sh` spawn (same script a solo `npm run blind`
 * uses), given a distinct seed/persona/model/target combination. There is NO
 * temperature/top_p knob — those flags do not exist on the `claude` CLI
 * invocation inside run.sh (see run.sh's default path). Seed × model is the
 * live diversity mechanism here; pure live retention uses
 * the neutral default persona so a test-directed role cannot bias continuation.
 *
 * `--mock` asks run.sh to use its bundled mock agent (zero tokens). Only this
 * explicit structural mode may plan a targeted quest; every live fleet starts
 * each agent from a fresh overworld game.
 */
import { spawn, execFileSync } from "node:child_process";
import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { isDeepStrictEqual } from "node:util";
import { parseJsonRejectingDuplicateKeys } from "./strict-json.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const GAME_DIR = resolve(HERE, "..");
const RUN_SH = join(HERE, "run.sh");
// Standalone JS mirror of src/world/journey_contract.ts; pure reports are
// independently schema-checked against these values before a row is verified.
export const PURE_SESSION_CONTRACT_VERSION = 3;
export const PURE_BASELINE_DECISIONS = 40;
export const PURE_FLEET_EVIDENCE_SCHEMA_VERSION = 2;
export const PURE_FLEET_ATTESTATION_SCHEMA_VERSION = 2;
export const HISTORICAL_PURE_FLEET_CODEX_ATTESTATION_SCHEMA_VERSION = 3;
export const HISTORICAL_RECEIPT_BOUND_CODEX_ATTESTATION_SCHEMA_VERSION = 4;
export const HISTORICAL_STRICT_CODEX_ATTESTATION_SCHEMA_VERSION = 5;
export const PURE_FLEET_CODEX_ATTESTATION_SCHEMA_VERSION = 6;
export const HISTORICAL_PURE_FLEET_CODE_MODE_CONTRACT = "strict-code-mode-v1";
export const PURE_FLEET_CODE_MODE_CONTRACT = "strict-code-mode-v2";
export const CERTIFIED_CODEX_MODELS = [
  "gpt-5.6-sol",
  "gpt-5.6-terra",
  "gpt-5.6-luna",
  "gpt-5.3-codex-spark",
];

// Rotation order for explicit structural `--mock --personas mixed`; live pure
// fleets reject mixed/non-default personas.
const PERSONA_ROTATION = ["explorer", "speedrunner", "breaker", "casual", "lore-reader"];

// Explicit Claude diagnostic `--model mix` weighting: 9 haiku : 1 sonnet.
// Codex fleets require one exact model id and never permit aliases, mixing, or
// fallback.
const DEFAULT_MODEL_MIX = [
  { model: "haiku", weight: 9 },
  { model: "sonnet", weight: 1 },
];

/** Throw a usage error for an out-of-range/non-integer numeric flag. `min` is
 * the sensible floor per the brief (count/concurrency >= 1, maxRetries >= 0);
 * pass `undefined` for flags with no floor (seedBase — negative seeds are
 * legal, see reportPathFor's `-?\d+` ledger regex). */
function assertFleetInt(value, flag, min) {
  if (!Number.isSafeInteger(value) || (min !== undefined && value < min)) {
    const bound = min !== undefined ? `a safe integer >= ${min}` : "a safe integer";
    throw new Error(`fleet: --${flag} must be ${bound} (got ${value})`);
  }
}

export function assertFleetSeedRange(opts) {
  assertFleetInt(opts.count, "count", 1);
  assertFleetInt(opts.seedBase, "seed-base", undefined);
  const offset = opts.count - 1;
  const finalSeed = opts.seedBase + offset;
  if (!Number.isSafeInteger(finalSeed) || finalSeed - opts.seedBase !== offset) {
    throw new Error(
      `fleet: seed range ${opts.seedBase}..${String(finalSeed)} must contain only safe integers`,
    );
  }
}

export function validateFleetLabel(label) {
  const windowsBase = typeof label === "string" ? label.split(".", 1)[0].toUpperCase() : "";
  if (
    typeof label !== "string" ||
    label === "." ||
    label === ".." ||
    label.endsWith(".") ||
    /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/.test(windowsBase) ||
    !/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(label)
  ) {
    throw new Error(
      "fleet: --label must be one non-reserved 1-80 character path segment using only letters, numbers, '.', '_', or '-', beginning with a letter or number, and not ending in '.'",
    );
  }
  return label;
}

/** Parse fleet CLI args into a plain options object (pure; exported for tests).
 * Throws a plain Error (message prefixed "fleet: ") on invalid numeric flags —
 * callers (main()) catch it, print the message, and exit 2 before spawning
 * anything. Valid-input shape is unchanged/backward-compatible. */
export function parseFleetArgs(argv) {
  const opts = {
    count: 100,
    concurrency: 4,
    provider: "codex",
    model: null,
    personas: "default",
    target: "overworld",
    seedBase: 1000,
    mock: false,
    label: null,
    maxRetries: 2,
    resume: true,
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
      case "--provider":
        opts.provider = argv[++i];
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
      case "--no-resume":
        opts.resume = false;
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
  assertFleetSeedRange(opts);
  if (opts.provider !== "claude" && opts.provider !== "codex") {
    throw new Error("fleet: --provider must be exactly claude or codex");
  }
  if (opts.model === null)
    opts.model = opts.provider === "codex" ? "gpt-5.3-codex-spark" : "sonnet";
  if (opts.label !== null) validateFleetLabel(opts.label);
  assertFleetTargetPolicy(opts);
  return opts;
}

function assertFleetTargetPolicy(opts) {
  const provider = opts.provider ?? "claude";
  if (
    opts.target !== "overworld" &&
    !/^quest:[a-z0-9]+(?:_[a-z0-9]+)*$/.test(String(opts.target ?? ""))
  ) {
    throw new Error(
      `fleet: --target must be overworld or quest:<id> using a lowercase shipped quest id (got ${opts.target})`,
    );
  }
  if (!opts.mock && opts.target !== "overworld") {
    throw new Error(
      "fleet: live blind LLM runs must target overworld; quest targets require explicit --mock",
    );
  }
  if (!opts.mock && opts.personas !== "default") {
    throw new Error(
      "fleet: pure live runs use the default first-time-player persona; non-default or mixed personas require explicit --mock structural mode",
    );
  }
  if (!opts.mock && !isProviderModel(provider, opts.model, true)) {
    throw new Error(
      provider === "codex"
        ? "fleet: Codex pure fleets require exact model gpt-5.6-sol, gpt-5.6-terra, gpt-5.6-luna, or gpt-5.3-codex-spark; aliases, mix, and fallback are forbidden"
        : "fleet: Claude pure fleets require haiku, sonnet, opus, or diagnostic mix",
    );
  }
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
  // Programmatic callers do not necessarily pass through parseFleetArgs; keep
  // the fresh-world live contract at the planning boundary as well.
  assertFleetTargetPolicy(opts);
  assertFleetSeedRange(opts);
  const provider = opts.provider ?? "claude";
  const runs = [];
  for (let i = 0; i < opts.count; i++) {
    const seed = opts.seedBase + i;
    const persona =
      opts.personas === "mixed" ? PERSONA_ROTATION[i % PERSONA_ROTATION.length] : opts.personas;
    const model = opts.model === "mix" ? modelForMixIndex(opts.modelMix, i) : opts.model;
    if (!opts.mock && !isProviderModel(provider, model, false)) {
      throw new Error("fleet: pure live plans require an exact provider/model allowlist match");
    }
    runs.push({
      seed,
      persona,
      // Structural mode still launches run.sh through one valid built-in
      // provider selector; --mock replaces the agent after runner validation.
      provider,
      model,
      target: opts.target,
    });
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
export function runSidecarPathFor(reportMdPath) {
  return reportMdPath.endsWith(".md")
    ? `${reportMdPath.slice(0, -".md".length)}.run.json`
    : `${reportMdPath}.run.json`;
}

export function fleetAttestationPathFor(reportMdPath) {
  return reportMdPath.endsWith(".md")
    ? `${reportMdPath.slice(0, -".md".length)}.fleet.json`
    : `${reportMdPath}.fleet.json`;
}

export function pureFleetRunArtifactPathsFor(reportMdPath) {
  const prefix = reportMdPath.endsWith(".md") ? reportMdPath.slice(0, -".md".length) : reportMdPath;
  return {
    report: reportMdPath,
    run_sidecar: `${prefix}.run.json`,
    run_evidence: `${prefix}.evidence.jsonl`,
    primary_envelope: `${prefix}.json`,
    initial_report: `${prefix}.initial-report.txt`,
    receipt_binding: `${prefix}.receipt-bind.json`,
    recovery_metadata: `${prefix}.repair.meta.json`,
    recovery_envelope: `${prefix}.repair.json`,
    provider_events: `${prefix}.codex.jsonl`,
    provider_rollout: `${prefix}.codex-rollout.jsonl`,
    provider_capture: `${prefix}.codex-capture.json`,
  };
}

/** A resumable artifact must be an ordinary file, never a symlink, whose
 * resolved path stays within the selected reports directory. */
export function isTrustedFleetArtifactFile(filePath, reportsDir) {
  try {
    const metadata = lstatSync(filePath);
    if (metadata.isSymbolicLink() || !metadata.isFile() || metadata.nlink !== 1) return false;
    const reportsRoot = realpathSync(reportsDir);
    const artifact = realpathSync(filePath);
    const fromRoot = relative(reportsRoot, artifact);
    return (
      fromRoot !== "" &&
      fromRoot !== ".." &&
      !fromRoot.startsWith(`..${sep}`) &&
      !isAbsolute(fromRoot)
    );
  } catch {
    return false;
  }
}

function trustedArtifactIdentity(filePath) {
  const metadata = lstatSync(filePath);
  if (metadata.ino !== 0) return `${String(metadata.dev)}:${String(metadata.ino)}`;
  // realpathSync.native returns the filesystem's canonical spelling. Keep it
  // exact: lowercasing would alias distinct entries on case-sensitive Windows
  // directories.
  return `path:${realpathSync.native(filePath)}`;
}

const PURE_BUILD_KEYS = ["git_commit", "tracked_worktree_clean", "world_hash", "world_id"].sort();

function isExactPureFleetBuild(build) {
  if (build === null || typeof build !== "object" || Array.isArray(build)) return false;
  const keys = Object.keys(build).sort();
  return (
    keys.length === PURE_BUILD_KEYS.length &&
    keys.every((key, index) => key === PURE_BUILD_KEYS[index]) &&
    /^[0-9a-f]{40}$/.test(build.git_commit) &&
    build.tracked_worktree_clean === true &&
    typeof build.world_id === "string" &&
    build.world_id.length > 0 &&
    /^[0-9a-f]{64}$/.test(build.world_hash)
  );
}

function samePureFleetBuild(actual, expected) {
  return (
    isExactPureFleetBuild(actual) &&
    isExactPureFleetBuild(expected) &&
    actual.git_commit === expected.git_commit &&
    actual.tracked_worktree_clean === expected.tracked_worktree_clean &&
    actual.world_id === expected.world_id &&
    actual.world_hash === expected.world_hash
  );
}

const PURE_FLEET_CLAUDE_ATTESTATION_KEYS = [
  "actual_model",
  "build",
  "claude_session_id",
  "game_session_id",
  "initial_report_sha256",
  "model",
  "persona",
  "play_mode",
  "primary_envelope_sha256",
  "receipt_hash",
  "recovery_envelope_sha256",
  "recovery_metadata_sha256",
  "report_recovered",
  "report_sha256",
  "run_evidence_sha256",
  "run_seed",
  "run_sidecar_sha256",
  "schema_version",
  "start_surface",
  "target",
].sort();

const PURE_FLEET_CODEX_ATTESTATION_KEYS = [
  "actual_model",
  "actual_provider",
  "build",
  "code_mode_contract",
  "game_session_id",
  "initial_report_sha256",
  "model",
  "persona",
  "play_mode",
  "primary_envelope_sha256",
  "provider",
  "provider_cwd",
  "provider_events_sha256",
  "provider_rollout_sha256",
  "provider_capture_sha256",
  "provider_session_id",
  "provider_turn_id",
  "reasoning_effort",
  "receipt_hash",
  "receipt_binding_sha256",
  "recovery_envelope_sha256",
  "recovery_metadata_sha256",
  "report_receipt_bound",
  "report_recovered",
  "report_sha256",
  "run_evidence_sha256",
  "run_seed",
  "run_sidecar_sha256",
  "schema_version",
  "start_surface",
  "target",
].sort();

const HISTORICAL_RECEIPT_BOUND_CODEX_ATTESTATION_KEYS = PURE_FLEET_CODEX_ATTESTATION_KEYS.filter(
  (key) => key !== "code_mode_contract",
);

const HISTORICAL_PURE_FLEET_CODEX_ATTESTATION_KEYS =
  HISTORICAL_RECEIPT_BOUND_CODEX_ATTESTATION_KEYS.filter(
    (key) => key !== "receipt_binding_sha256" && key !== "report_receipt_bound",
  );

const HISTORICAL_STRICT_CODEX_ATTESTATION_KEYS = PURE_FLEET_CODEX_ATTESTATION_KEYS;

function isFleetModel(model) {
  return model === "haiku" || model === "sonnet" || model === "opus";
}

function isCodexFleetModel(model) {
  return CERTIFIED_CODEX_MODELS.includes(model);
}

function isProviderModel(provider, model, allowMix) {
  if (provider === "codex") return isCodexFleetModel(model);
  if (provider === "claude") return isFleetModel(model) || (allowMix && model === "mix");
  return false;
}

function isExactPureFleetAttestation(attestation) {
  if (attestation === null || typeof attestation !== "object" || Array.isArray(attestation)) {
    return false;
  }
  const keys = Object.keys(attestation).sort();
  const common =
    Number.isSafeInteger(attestation.run_seed) &&
    attestation.persona === "default" &&
    attestation.target === "overworld" &&
    attestation.play_mode === "pure" &&
    attestation.start_surface === "fresh_overworld" &&
    isExactPureFleetBuild(attestation.build) &&
    typeof attestation.game_session_id === "string" &&
    attestation.game_session_id.length > 0 &&
    /^[0-9a-f]{64}$/.test(attestation.receipt_hash) &&
    /^[0-9a-f]{64}$/.test(attestation.report_sha256) &&
    /^[0-9a-f]{64}$/.test(attestation.run_sidecar_sha256) &&
    /^[0-9a-f]{64}$/.test(attestation.run_evidence_sha256) &&
    /^[0-9a-f]{64}$/.test(attestation.primary_envelope_sha256);
  if (!common) return false;
  if (attestation.schema_version === PURE_FLEET_ATTESTATION_SCHEMA_VERSION) {
    return (
      keys.length === PURE_FLEET_CLAUDE_ATTESTATION_KEYS.length &&
      keys.every((key, index) => key === PURE_FLEET_CLAUDE_ATTESTATION_KEYS[index]) &&
      attestation.schema_version === PURE_FLEET_ATTESTATION_SCHEMA_VERSION &&
      isFleetModel(attestation.model) &&
      typeof attestation.claude_session_id === "string" &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        attestation.claude_session_id,
      ) &&
      typeof attestation.actual_model === "string" &&
      attestation.actual_model.length > 0 &&
      typeof attestation.report_recovered === "boolean" &&
      (attestation.initial_report_sha256 === null ||
        /^[0-9a-f]{64}$/.test(attestation.initial_report_sha256)) &&
      (attestation.recovery_metadata_sha256 === null ||
        /^[0-9a-f]{64}$/.test(attestation.recovery_metadata_sha256)) &&
      (attestation.recovery_envelope_sha256 === null ||
        /^[0-9a-f]{64}$/.test(attestation.recovery_envelope_sha256)) &&
      (attestation.report_recovered
        ? attestation.initial_report_sha256 !== null &&
          attestation.recovery_metadata_sha256 !== null &&
          attestation.recovery_envelope_sha256 !== null
        : attestation.initial_report_sha256 === null &&
          attestation.recovery_metadata_sha256 === null &&
          attestation.recovery_envelope_sha256 === null)
    );
  }
  const currentCodex =
    attestation.schema_version === PURE_FLEET_CODEX_ATTESTATION_SCHEMA_VERSION &&
    keys.length === PURE_FLEET_CODEX_ATTESTATION_KEYS.length &&
    keys.every((key, index) => key === PURE_FLEET_CODEX_ATTESTATION_KEYS[index]);
  const historicalReceiptBoundCodex =
    attestation.schema_version === HISTORICAL_RECEIPT_BOUND_CODEX_ATTESTATION_SCHEMA_VERSION &&
    keys.length === HISTORICAL_RECEIPT_BOUND_CODEX_ATTESTATION_KEYS.length &&
    keys.every((key, index) => key === HISTORICAL_RECEIPT_BOUND_CODEX_ATTESTATION_KEYS[index]);
  const historicalCodex =
    attestation.schema_version === HISTORICAL_PURE_FLEET_CODEX_ATTESTATION_SCHEMA_VERSION &&
    keys.length === HISTORICAL_PURE_FLEET_CODEX_ATTESTATION_KEYS.length &&
    keys.every((key, index) => key === HISTORICAL_PURE_FLEET_CODEX_ATTESTATION_KEYS[index]);
  const historicalStrictCodex =
    attestation.schema_version === HISTORICAL_STRICT_CODEX_ATTESTATION_SCHEMA_VERSION &&
    keys.length === HISTORICAL_STRICT_CODEX_ATTESTATION_KEYS.length &&
    keys.every((key, index) => key === HISTORICAL_STRICT_CODEX_ATTESTATION_KEYS[index]);
  return (
    (currentCodex || historicalStrictCodex || historicalReceiptBoundCodex || historicalCodex) &&
    attestation.provider === "codex" &&
    isCodexFleetModel(attestation.model) &&
    attestation.actual_provider === "openai" &&
    attestation.actual_model === attestation.model &&
    attestation.reasoning_effort === "xhigh" &&
    typeof attestation.provider_session_id === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      attestation.provider_session_id,
    ) &&
    typeof attestation.provider_turn_id === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      attestation.provider_turn_id,
    ) &&
    typeof attestation.provider_cwd === "string" &&
    attestation.provider_cwd.length > 0 &&
    attestation.report_recovered === false &&
    /^[0-9a-f]{64}$/.test(attestation.provider_events_sha256) &&
    /^[0-9a-f]{64}$/.test(attestation.provider_rollout_sha256) &&
    /^[0-9a-f]{64}$/.test(attestation.provider_capture_sha256) &&
    attestation.recovery_metadata_sha256 === null &&
    attestation.recovery_envelope_sha256 === null &&
    (currentCodex
      ? attestation.code_mode_contract === PURE_FLEET_CODE_MODE_CONTRACT
      : historicalStrictCodex
        ? attestation.code_mode_contract === HISTORICAL_PURE_FLEET_CODE_MODE_CONTRACT
        : true) &&
    (historicalCodex
      ? attestation.initial_report_sha256 === null
      : typeof attestation.report_receipt_bound === "boolean" &&
        (attestation.receipt_binding_sha256 === null ||
          /^[0-9a-f]{64}$/.test(attestation.receipt_binding_sha256)) &&
        (attestation.initial_report_sha256 === null ||
          /^[0-9a-f]{64}$/.test(attestation.initial_report_sha256)) &&
        attestation.report_receipt_bound ===
          (attestation.initial_report_sha256 !== null &&
            attestation.receipt_binding_sha256 !== null) &&
        (attestation.initial_report_sha256 === null) ===
          (attestation.receipt_binding_sha256 === null))
  );
}

export function parsePureFleetAttestation(text) {
  const raw = parseJsonRejectingDuplicateKeys(text, "pure fleet attestation");
  if (!raw.ok) return raw;
  if (!isExactPureFleetAttestation(raw.value)) {
    return { ok: false, reason: "pure fleet attestation does not match its strict schema" };
  }
  return { ok: true, attestation: raw.value };
}

function sha256FileBytes(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

export function pureFleetArtifactHashes(reportMdPath) {
  const paths = pureFleetRunArtifactPathsFor(reportMdPath);
  return {
    report_sha256: sha256FileBytes(paths.report),
    run_sidecar_sha256: sha256FileBytes(paths.run_sidecar),
    run_evidence_sha256: sha256FileBytes(paths.run_evidence),
    primary_envelope_sha256: sha256FileBytes(paths.primary_envelope),
    initial_report_sha256: artifactEntryExists(paths.initial_report)
      ? sha256FileBytes(paths.initial_report)
      : null,
    receipt_binding_sha256: artifactEntryExists(paths.receipt_binding)
      ? sha256FileBytes(paths.receipt_binding)
      : null,
    recovery_metadata_sha256: artifactEntryExists(paths.recovery_metadata)
      ? sha256FileBytes(paths.recovery_metadata)
      : null,
    recovery_envelope_sha256: artifactEntryExists(paths.recovery_envelope)
      ? sha256FileBytes(paths.recovery_envelope)
      : null,
    provider_events_sha256: artifactEntryExists(paths.provider_events)
      ? sha256FileBytes(paths.provider_events)
      : null,
    provider_rollout_sha256: artifactEntryExists(paths.provider_rollout)
      ? sha256FileBytes(paths.provider_rollout)
      : null,
    provider_capture_sha256: artifactEntryExists(paths.provider_capture)
      ? sha256FileBytes(paths.provider_capture)
      : null,
  };
}

function isExactFleetArtifactHashes(hashes) {
  return (
    hashes !== null &&
    typeof hashes === "object" &&
    /^[0-9a-f]{64}$/.test(hashes.report_sha256) &&
    /^[0-9a-f]{64}$/.test(hashes.run_sidecar_sha256) &&
    /^[0-9a-f]{64}$/.test(hashes.run_evidence_sha256) &&
    /^[0-9a-f]{64}$/.test(hashes.primary_envelope_sha256) &&
    (hashes.initial_report_sha256 === null ||
      /^[0-9a-f]{64}$/.test(hashes.initial_report_sha256)) &&
    (hashes.receipt_binding_sha256 === null ||
      /^[0-9a-f]{64}$/.test(hashes.receipt_binding_sha256)) &&
    (hashes.recovery_metadata_sha256 === null ||
      /^[0-9a-f]{64}$/.test(hashes.recovery_metadata_sha256)) &&
    (hashes.recovery_envelope_sha256 === null ||
      /^[0-9a-f]{64}$/.test(hashes.recovery_envelope_sha256)) &&
    (hashes.provider_events_sha256 === null ||
      /^[0-9a-f]{64}$/.test(hashes.provider_events_sha256)) &&
    (hashes.provider_rollout_sha256 === null ||
      /^[0-9a-f]{64}$/.test(hashes.provider_rollout_sha256)) &&
    (hashes.provider_capture_sha256 === null ||
      /^[0-9a-f]{64}$/.test(hashes.provider_capture_sha256))
  );
}

function artifactEntryExists(path) {
  try {
    lstatSync(path);
    return true;
  } catch {
    return false;
  }
}

function isExactPureFleetRunArtifactFacts(facts) {
  return (
    facts !== null &&
    typeof facts === "object" &&
    facts.run !== null &&
    typeof facts.run === "object" &&
    typeof facts.game_session_id === "string" &&
    facts.game_session_id.length > 0 &&
    (facts.provider === "claude" || facts.provider === "codex") &&
    typeof facts.provider_session_id === "string" &&
    facts.provider_session_id.length > 0 &&
    typeof facts.actual_model === "string" &&
    facts.actual_model.length > 0 &&
    (facts.actual_provider === "anthropic" || facts.actual_provider === "openai") &&
    typeof facts.report_recovered === "boolean" &&
    typeof facts.report_receipt_bound === "boolean" &&
    (facts.code_mode_contract === null ||
      facts.code_mode_contract === HISTORICAL_PURE_FLEET_CODE_MODE_CONTRACT ||
      facts.code_mode_contract === PURE_FLEET_CODE_MODE_CONTRACT) &&
    isExactFleetArtifactHashes(facts.hashes)
  );
}

async function validatePureFleetRunArtifacts(reportMdPath, expected, reportsDir) {
  const expectedProvider = expected.provider ?? "claude";
  const paths = pureFleetRunArtifactPathsFor(reportMdPath);
  for (const [label, path] of [
    ["report", paths.report],
    ["run sidecar", paths.run_sidecar],
    ["raw run evidence", paths.run_evidence],
    ["primary provider envelope", paths.primary_envelope],
  ]) {
    if (!isTrustedFleetArtifactFile(path, reportsDir)) {
      return { ok: false, reason: `${label} must be a contained private regular file` };
    }
  }
  const codexEntries = [
    ["Codex provider events", paths.provider_events],
    ["Codex rollout", paths.provider_rollout],
    ["Codex capture receipt", paths.provider_capture],
  ];
  if (expectedProvider === "codex") {
    for (const [label, path] of codexEntries) {
      if (!isTrustedFleetArtifactFile(path, reportsDir)) {
        return { ok: false, reason: `${label} must be a contained private regular file` };
      }
    }
  } else if (codexEntries.some(([, path]) => artifactEntryExists(path))) {
    return { ok: false, reason: "Claude fleet slot must not contain Codex provider artifacts" };
  }
  if (expectedProvider === "codex") {
    const bindingEntries = [
      ["initial Codex report", paths.initial_report],
      ["receipt binding metadata", paths.receipt_binding],
    ];
    const bindingPresence = bindingEntries.map(([, path]) => artifactEntryExists(path));
    if (bindingPresence.some(Boolean) && !bindingPresence.every(Boolean)) {
      return {
        ok: false,
        reason: "Codex receipt-binding artifacts must be all present or all absent",
      };
    }
    if (
      artifactEntryExists(paths.recovery_metadata) ||
      artifactEntryExists(paths.recovery_envelope)
    ) {
      return { ok: false, reason: "Codex fleet slot must not contain report recovery artifacts" };
    }
    if (bindingPresence.every(Boolean)) {
      for (const [label, path] of bindingEntries) {
        if (!isTrustedFleetArtifactFile(path, reportsDir)) {
          return { ok: false, reason: `${label} must be a contained private regular file` };
        }
      }
    }
  } else {
    const recoveryEntries = [
      ["initial report", paths.initial_report],
      ["recovery metadata", paths.recovery_metadata],
      ["recovery Claude envelope", paths.recovery_envelope],
    ];
    const recoveryPresence = recoveryEntries.map(([, path]) => artifactEntryExists(path));
    if (recoveryPresence.some(Boolean) && !recoveryPresence.every(Boolean)) {
      return { ok: false, reason: "report recovery artifacts must be all present or all absent" };
    }
    if (artifactEntryExists(paths.receipt_binding)) {
      return { ok: false, reason: "Claude fleet slot must not contain receipt binding metadata" };
    }
    if (recoveryPresence.every(Boolean)) {
      for (const [label, path] of recoveryEntries) {
        if (!isTrustedFleetArtifactFile(path, reportsDir)) {
          return { ok: false, reason: `${label} must be a contained private regular file` };
        }
      }
    }
  }

  const tsxCli = join(GAME_DIR, "node_modules", "tsx", "dist", "cli.mjs");
  const validatorScript = join(GAME_DIR, "scripts", "validate-pure-fleet-run.ts");
  const result = await spawnAsync(
    process.execPath,
    [
      tsxCli,
      validatorScript,
      "--report",
      reportMdPath,
      "--seed",
      String(expected.seed),
      "--provider",
      expectedProvider,
      "--model",
      expected.model,
      "--git-commit",
      expected.build.git_commit,
      "--world-id",
      expected.build.world_id,
      "--world-hash",
      expected.build.world_hash,
    ],
    { cwd: GAME_DIR, env: { ...process.env } },
  );
  let parsed;
  try {
    parsed = JSON.parse(result.stdout.trim());
  } catch {
    return {
      ok: false,
      reason: `pure fleet artifact validator returned invalid JSON: ${firstErrorLine(result.stderr)}`,
    };
  }
  if (
    result.status !== 0 ||
    parsed?.ok !== true ||
    !isExactPureFleetRunArtifactFacts(parsed.facts)
  ) {
    return {
      ok: false,
      reason:
        typeof parsed?.reason === "string"
          ? parsed.reason
          : `pure fleet artifact validator failed: ${firstErrorLine(result.stderr)}`,
    };
  }
  return { ok: true, facts: parsed.facts };
}

export function pureFleetAttestationMismatch(attestation, run, expected, artifactFacts) {
  const expectedProvider = expected?.provider ?? "claude";
  if (!isExactPureFleetAttestation(attestation)) {
    return "pure resume requires a valid adjacent fleet attestation";
  }
  if (
    expected === null ||
    typeof expected !== "object" ||
    !Number.isSafeInteger(expected.seed) ||
    !isProviderModel(expectedProvider, expected.model, false) ||
    !isExactPureFleetBuild(expected.build)
  ) {
    return "pure resume requires an exact expected seed, model, and clean fleet build";
  }
  if (attestation.run_seed !== expected.seed || attestation.run_seed !== run?.run_seed) {
    return "pure fleet attestation seed does not match the plan and run evidence";
  }
  if (attestation.model !== expected.model) {
    return "pure fleet attestation model does not match the planned model";
  }
  const attestationProvider = attestation.schema_version === 2 ? "claude" : attestation.provider;
  if (attestationProvider !== expectedProvider || artifactFacts.provider !== expectedProvider) {
    return "pure fleet attestation provider does not match the planned provider";
  }
  if (
    expectedProvider === "codex" &&
    attestation.schema_version !== PURE_FLEET_CODEX_ATTESTATION_SCHEMA_VERSION
  ) {
    return `current Codex resume requires attestation v${PURE_FLEET_CODEX_ATTESTATION_SCHEMA_VERSION}`;
  }
  if (
    !samePureFleetBuild(attestation.build, expected.build) ||
    !samePureFleetBuild(attestation.build, run?.build)
  ) {
    return "pure fleet attestation build does not match the plan and run evidence";
  }
  if (!isExactPureFleetRunArtifactFacts(artifactFacts)) {
    return "pure fleet attestation requires semantically validated run artifacts";
  }
  if (!isDeepStrictEqual(artifactFacts.run, run)) {
    return "raw run evidence does not reproduce the verifier run sidecar";
  }
  if (
    attestation.game_session_id !== run?.session_id ||
    attestation.game_session_id !== artifactFacts.game_session_id
  ) {
    return "pure fleet attestation game session does not match the run evidence";
  }
  const attestedProviderSession =
    attestation.schema_version === 2
      ? attestation.claude_session_id
      : attestation.provider_session_id;
  if (attestedProviderSession !== artifactFacts.provider_session_id) {
    return "pure fleet attestation provider session does not match authenticated artifacts";
  }
  if (attestation.actual_model !== artifactFacts.actual_model) {
    return "pure fleet attestation actual model does not match the primary envelope";
  }
  if (
    expectedProvider === "codex" &&
    (attestation.actual_provider !== artifactFacts.actual_provider ||
      attestation.reasoning_effort !== artifactFacts.reasoning_effort ||
      attestation.provider_turn_id !== artifactFacts.provider_turn_id ||
      attestation.provider_cwd !== artifactFacts.provider_cwd)
  ) {
    return "pure fleet attestation Codex rollout facts do not match authenticated artifacts";
  }
  if (
    attestation.schema_version === PURE_FLEET_CODEX_ATTESTATION_SCHEMA_VERSION &&
    (attestation.code_mode_contract !== PURE_FLEET_CODE_MODE_CONTRACT ||
      artifactFacts.code_mode_contract !== PURE_FLEET_CODE_MODE_CONTRACT)
  ) {
    return "current Codex attestation requires authenticated strict code-mode evidence";
  }
  if (attestation.report_recovered !== artifactFacts.report_recovered) {
    return "pure fleet attestation recovery status does not match durable recovery evidence";
  }
  const attestedReceiptBound =
    attestation.schema_version === PURE_FLEET_CODEX_ATTESTATION_SCHEMA_VERSION ||
    attestation.schema_version === HISTORICAL_STRICT_CODEX_ATTESTATION_SCHEMA_VERSION ||
    attestation.schema_version === HISTORICAL_RECEIPT_BOUND_CODEX_ATTESTATION_SCHEMA_VERSION
      ? attestation.report_receipt_bound
      : false;
  if (attestedReceiptBound !== artifactFacts.report_receipt_bound) {
    return "pure fleet attestation receipt-binding status does not match durable artifacts";
  }
  if (attestation.receipt_hash !== run?.receipt?.receiptHash) {
    return "pure fleet attestation receipt hash does not match the verified receipt";
  }
  if (
    !isExactFleetArtifactHashes(artifactFacts.hashes) ||
    attestation.report_sha256 !== artifactFacts.hashes.report_sha256 ||
    attestation.run_sidecar_sha256 !== artifactFacts.hashes.run_sidecar_sha256 ||
    attestation.run_evidence_sha256 !== artifactFacts.hashes.run_evidence_sha256 ||
    attestation.primary_envelope_sha256 !== artifactFacts.hashes.primary_envelope_sha256 ||
    attestation.initial_report_sha256 !== artifactFacts.hashes.initial_report_sha256 ||
    (attestation.schema_version === PURE_FLEET_CODEX_ATTESTATION_SCHEMA_VERSION ||
    attestation.schema_version === HISTORICAL_STRICT_CODEX_ATTESTATION_SCHEMA_VERSION ||
    attestation.schema_version === HISTORICAL_RECEIPT_BOUND_CODEX_ATTESTATION_SCHEMA_VERSION
      ? attestation.receipt_binding_sha256 !== artifactFacts.hashes.receipt_binding_sha256
      : artifactFacts.hashes.receipt_binding_sha256 !== null) ||
    attestation.recovery_metadata_sha256 !== artifactFacts.hashes.recovery_metadata_sha256 ||
    attestation.recovery_envelope_sha256 !== artifactFacts.hashes.recovery_envelope_sha256 ||
    (expectedProvider === "codex" &&
      (attestation.provider_events_sha256 !== artifactFacts.hashes.provider_events_sha256 ||
        attestation.provider_rollout_sha256 !== artifactFacts.hashes.provider_rollout_sha256 ||
        attestation.provider_capture_sha256 !== artifactFacts.hashes.provider_capture_sha256))
  ) {
    return "pure fleet attestation artifact hashes do not match the authenticated run bytes";
  }
  return null;
}

function buildPureFleetAttestation(run, expected, artifactFacts) {
  const expectedProvider = expected.provider ?? "claude";
  const common = {
    run_seed: expected.seed,
    model: expected.model,
    persona: "default",
    target: "overworld",
    play_mode: "pure",
    start_surface: "fresh_overworld",
    build: expected.build,
    game_session_id: run.session_id,
    actual_model: artifactFacts.actual_model,
    report_recovered: artifactFacts.report_recovered,
    receipt_hash: run.receipt.receiptHash,
    report_sha256: artifactFacts.hashes.report_sha256,
    run_sidecar_sha256: artifactFacts.hashes.run_sidecar_sha256,
    run_evidence_sha256: artifactFacts.hashes.run_evidence_sha256,
    primary_envelope_sha256: artifactFacts.hashes.primary_envelope_sha256,
    initial_report_sha256: artifactFacts.hashes.initial_report_sha256,
    recovery_metadata_sha256: artifactFacts.hashes.recovery_metadata_sha256,
    recovery_envelope_sha256: artifactFacts.hashes.recovery_envelope_sha256,
  };
  const attestation =
    expectedProvider === "codex"
      ? {
          ...common,
          schema_version: PURE_FLEET_CODEX_ATTESTATION_SCHEMA_VERSION,
          provider: "codex",
          code_mode_contract: artifactFacts.code_mode_contract,
          provider_session_id: artifactFacts.provider_session_id,
          actual_provider: artifactFacts.actual_provider,
          reasoning_effort: artifactFacts.reasoning_effort,
          provider_turn_id: artifactFacts.provider_turn_id,
          provider_cwd: artifactFacts.provider_cwd,
          report_receipt_bound: artifactFacts.report_receipt_bound,
          receipt_binding_sha256: artifactFacts.hashes.receipt_binding_sha256,
          provider_events_sha256: artifactFacts.hashes.provider_events_sha256,
          provider_rollout_sha256: artifactFacts.hashes.provider_rollout_sha256,
          provider_capture_sha256: artifactFacts.hashes.provider_capture_sha256,
        }
      : {
          ...common,
          schema_version: PURE_FLEET_ATTESTATION_SCHEMA_VERSION,
          claude_session_id: artifactFacts.provider_session_id,
        };
  const mismatch = pureFleetAttestationMismatch(attestation, run, expected, artifactFacts);
  if (mismatch !== null) throw new Error(mismatch);
  return attestation;
}

export async function writeFreshPureFleetAttestation(
  reportMdPath,
  run,
  expected,
  reportsDir = dirname(reportMdPath),
) {
  const validation = await validatePureFleetRunArtifacts(reportMdPath, expected, reportsDir);
  if (!validation.ok) throw new Error(validation.reason);
  const attestation = buildPureFleetAttestation(run, expected, validation.facts);
  writeFileSync(
    fleetAttestationPathFor(reportMdPath),
    `${JSON.stringify(attestation, null, 2)}\n`,
    { encoding: "utf8", flag: "wx" },
  );
  return attestation;
}

function pureFleetEvidenceMismatch(run, expected) {
  const expectedProvider = expected?.provider ?? "claude";
  if (
    expected === null ||
    typeof expected !== "object" ||
    !Number.isSafeInteger(expected.seed) ||
    !isProviderModel(expectedProvider, expected.model, false) ||
    !isExactPureFleetBuild(expected.build)
  ) {
    return "pure resume requires an exact expected seed, model, and clean fleet build";
  }
  if (run?.schema_version !== PURE_FLEET_EVIDENCE_SCHEMA_VERSION) {
    return `pure resume requires evidence schema v${PURE_FLEET_EVIDENCE_SCHEMA_VERSION}`;
  }
  if (run?.receipt?.contractVersion !== PURE_SESSION_CONTRACT_VERSION) {
    return `pure resume requires journey contract v${PURE_SESSION_CONTRACT_VERSION}`;
  }
  if (run.run_seed !== expected.seed) {
    return `pure resume evidence seed ${String(run.run_seed)} does not match planned seed ${expected.seed}`;
  }
  if (!samePureFleetBuild(run.build, expected.build)) {
    return "pure resume evidence build does not match the authenticated fleet build";
  }
  return null;
}

async function verifyReportEvidence(
  reportMdPath,
  requiredMode,
  expectedPure = null,
  reportsDir = dirname(reportMdPath),
) {
  const runSidecarPath = runSidecarPathFor(reportMdPath);
  if (
    !isTrustedFleetArtifactFile(reportMdPath, reportsDir) ||
    !isTrustedFleetArtifactFile(runSidecarPath, reportsDir)
  ) {
    return {
      ok: false,
      stdout: "",
      stderr: "fleet report and run sidecar must be contained regular non-symlink files",
      run: null,
    };
  }
  const tsxCli = join(GAME_DIR, "node_modules", "tsx", "dist", "cli.mjs");
  const verifierScript = join(GAME_DIR, "scripts", "verify-blind-report.ts");
  const result = await spawnAsync(
    process.execPath,
    [
      tsxCli,
      verifierScript,
      reportMdPath,
      "--require-mode",
      requiredMode,
      "--run-sidecar",
      runSidecarPath,
      "--json",
    ],
    { cwd: GAME_DIR, env: { ...process.env } },
  );
  let run = null;
  if (result.status === 0) {
    try {
      run = JSON.parse(result.stdout.trim()).run ?? null;
    } catch {
      return {
        ok: false,
        stdout: result.stdout,
        stderr: "verifier returned invalid JSON",
        run: null,
      };
    }
    const pureMismatch =
      requiredMode === "pure" ? pureFleetEvidenceMismatch(run, expectedPure) : null;
    if (pureMismatch !== null) {
      return {
        ok: false,
        stdout: result.stdout,
        stderr: pureMismatch,
        run,
      };
    }
  }
  return { ok: result.status === 0, stdout: result.stdout, stderr: result.stderr, run };
}

export async function verifyReportForResume(
  reportMdPath,
  requiredMode,
  expectedPure = null,
  reportsDir = dirname(reportMdPath),
) {
  const verified = await verifyReportEvidence(reportMdPath, requiredMode, expectedPure, reportsDir);
  if (!verified.ok || requiredMode !== "pure") {
    return { ...verified, attestation: null };
  }
  const attestationPath = fleetAttestationPathFor(reportMdPath);
  if (!isTrustedFleetArtifactFile(attestationPath, reportsDir)) {
    return {
      ...verified,
      ok: false,
      stderr:
        "pure resume requires an adjacent contained regular non-symlink runner-owned fleet attestation",
      attestation: null,
    };
  }
  let parsed;
  try {
    parsed = parsePureFleetAttestation(readFileSync(attestationPath, "utf8"));
  } catch (error) {
    return {
      ...verified,
      ok: false,
      stderr: `pure fleet attestation could not be read: ${error instanceof Error ? error.message : String(error)}`,
      attestation: null,
    };
  }
  if (!parsed.ok) {
    return { ...verified, ok: false, stderr: parsed.reason, attestation: null };
  }
  if (
    (expectedPure?.provider ?? "claude") === "codex" &&
    parsed.attestation.schema_version !== PURE_FLEET_CODEX_ATTESTATION_SCHEMA_VERSION
  ) {
    return {
      ...verified,
      ok: false,
      stderr: `current Codex resume requires attestation v${PURE_FLEET_CODEX_ATTESTATION_SCHEMA_VERSION}`,
      attestation: parsed.attestation,
    };
  }
  const artifactValidation = await validatePureFleetRunArtifacts(
    reportMdPath,
    expectedPure,
    reportsDir,
  );
  if (!artifactValidation.ok) {
    return {
      ...verified,
      ok: false,
      stderr: artifactValidation.reason,
      attestation: parsed.attestation,
    };
  }
  const mismatch = pureFleetAttestationMismatch(
    parsed.attestation,
    verified.run,
    expectedPure,
    artifactValidation.facts,
  );
  if (mismatch !== null) {
    return { ...verified, ok: false, stderr: mismatch, attestation: parsed.attestation };
  }
  return { ...verified, attestation: parsed.attestation };
}

async function captureExpectedPureFleetBuild() {
  const tsxCli = join(GAME_DIR, "node_modules", "tsx", "dist", "cli.mjs");
  const script = join(GAME_DIR, "scripts", "print-pure-fleet-build.ts");
  const result = await spawnAsync(process.execPath, [tsxCli, script, GAME_DIR], {
    cwd: GAME_DIR,
    env: { ...process.env },
  });
  if (result.status !== 0) {
    throw new Error(
      `fleet: pure build preflight failed: ${firstErrorLine(result.stderr || result.stdout)}`,
    );
  }
  let build;
  try {
    build = JSON.parse(result.stdout.trim());
  } catch {
    throw new Error("fleet: pure build preflight returned invalid JSON");
  }
  if (!isExactPureFleetBuild(build)) {
    throw new Error("fleet: pure build preflight returned an invalid or dirty build identity");
  }
  return build;
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
  return [...new Set(entries.filter((f) => re.test(f)))].sort((a, b) =>
    a < b ? 1 : a > b ? -1 : 0,
  );
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
  const seenFiles = new Set();
  return resumeCandidatesFor(entries, slug, seed)
    .map((f) => join(reportsDir, f))
    .filter((candidate) => {
      if (!isTrustedFleetArtifactFile(candidate, reportsDir)) return false;
      try {
        const identity = trustedArtifactIdentity(candidate);
        if (seenFiles.has(identity)) return false;
        seenFiles.add(identity);
        return true;
      } catch {
        return false;
      }
    });
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

export const FLEET_ATTEMPT_CLASSIFICATIONS = Object.freeze([
  "technical_timeout",
  "launcher_or_run_failure",
  "verifier_failure",
  "verified",
]);

/** Classify one launcher attempt from durable process/evidence facts. A
 * timeout wins over the stage marker because report-recovery itself may time
 * out after the first verifier ran. */
export function classifyFleetAttempt({ runnerExit, verifierAttempted, verified }) {
  if (verified) return "verified";
  if (runnerExit === 124 || runnerExit === 137) return "technical_timeout";
  if (runnerExit === 0 || verifierAttempted) return "verifier_failure";
  return "launcher_or_run_failure";
}

function reportPrefixFor(reportMdPath) {
  return reportMdPath.endsWith(".md") ? reportMdPath.slice(0, -".md".length) : reportMdPath;
}

function recoveryMarkerPathFor(reportMdPath) {
  return `${reportPrefixFor(reportMdPath)}.initial-report.txt`;
}

/** `run.sh` writes `.initial-report.txt` before its one permitted same-session,
 * report-only repair. On an exit-0 run that regular adjacent file is the
 * durable fact that the accepted Markdown was recovered rather than the
 * model's first response. The `.txt` suffix deliberately keeps the rejected
 * response outside feedback compiler `*.md` discovery. */
export function pureFleetReportWasRecovered(reportMdPath, reportsDir = dirname(reportMdPath)) {
  const marker = recoveryMarkerPathFor(reportMdPath);
  if (!existsSync(marker)) return false;
  if (!isTrustedFleetArtifactFile(marker, reportsDir)) {
    throw new Error("report-recovery marker must be a contained regular non-symlink file");
  }
  const receiptBinding = `${reportPrefixFor(reportMdPath)}.receipt-bind.json`;
  if (existsSync(receiptBinding)) {
    if (!isTrustedFleetArtifactFile(receiptBinding, reportsDir)) {
      throw new Error("receipt-binding metadata must be a contained regular non-symlink file");
    }
    return false;
  }
  return true;
}

function sha256Bytes(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function fleetRelativePath(fleetDir, path) {
  return relative(fleetDir, path).split(sep).join("/");
}

/** Copy every artifact owned by a failed out-prefix into a unique per-slot,
 * per-attempt directory before the next launcher can overwrite it. Only after
 * every exclusive copy and its diagnostic log exist are the source files
 * removed. The returned closed index is embedded in the final manifest. */
export function archiveFailedFleetAttemptArtifacts({
  outPrefix,
  fleetDir,
  seed,
  attempt,
  diagnostic,
}) {
  const sourceDir = dirname(outPrefix);
  const sourceBase = basename(outPrefix);
  const attemptDir = join(fleetDir, "attempts", `seed_${seed}`, `attempt_${attempt}`);
  mkdirSync(dirname(attemptDir), { recursive: true });
  mkdirSync(attemptDir);

  const sources = readdirSync(sourceDir, { withFileTypes: true })
    .filter((entry) => entry.name.startsWith(`${sourceBase}.`))
    .sort((left, right) => left.name.localeCompare(right.name))
    .map((entry) => {
      const source = join(sourceDir, entry.name);
      const metadata = lstatSync(source);
      if (
        entry.isSymbolicLink() ||
        metadata.isSymbolicLink() ||
        !entry.isFile() ||
        !metadata.isFile() ||
        metadata.nlink !== 1
      ) {
        throw new Error(`fleet: failed-attempt artifact is not a private regular file: ${source}`);
      }
      return { source, name: entry.name, bytes: readFileSync(source) };
    });

  const archived = [];
  for (const source of sources) {
    const destination = join(attemptDir, source.name);
    writeFileSync(destination, source.bytes, { flag: "wx" });
    archived.push({
      name: source.name,
      bytes: source.bytes.byteLength,
      sha256: sha256Bytes(source.bytes),
    });
  }
  const diagnosticName = "fleet-diagnostic.log";
  const diagnosticBytes = Buffer.from(diagnostic, "utf8");
  writeFileSync(join(attemptDir, diagnosticName), diagnosticBytes, { flag: "wx" });
  archived.push({
    name: diagnosticName,
    bytes: diagnosticBytes.byteLength,
    sha256: sha256Bytes(diagnosticBytes),
  });

  for (const source of sources) unlinkSync(source.source);
  archived.sort((left, right) => left.name.localeCompare(right.name));
  return {
    directory: fleetRelativePath(fleetDir, attemptDir),
    artifacts: archived,
  };
}

/** Summary counters are always reduced from every closed per-slot attempt,
 * never from only the terminal result. */
export function summarizeFleetAttemptHistory(rows) {
  let totalAttempts = 0;
  let failedAttempts = 0;
  let technicalTimeouts = 0;
  let reportRecoveredRuns = 0;
  let receiptBoundRuns = 0;
  for (const row of rows) {
    if (row?.report_recovered === true) reportRecoveredRuns += 1;
    if (row?.report_receipt_bound === true) receiptBoundRuns += 1;
    for (const attempt of row?.attempt_history ?? []) {
      totalAttempts += 1;
      if (attempt.classification !== "verified") failedAttempts += 1;
      if (attempt.classification === "technical_timeout") technicalTimeouts += 1;
    }
  }
  return {
    total_attempts: totalAttempts,
    failed_attempts: failedAttempts,
    technical_timeouts: technicalTimeouts,
    report_recovered_runs: reportRecoveredRuns,
    receipt_bound_runs: receiptBoundRuns,
  };
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
async function executeRun(run, { reportsDir, stamp, opts, bashPath, fleetDir, fleetBuild }) {
  const target = run.target;
  const questId = questIdFor(target);
  const requiredMode = opts.mock ? "structural" : "pure";
  const expectedPure = opts.mock
    ? null
    : { seed: run.seed, provider: run.provider, model: run.model, build: fleetBuild };

  // Check ALL stamp-agnostic candidates, newest-stamp-first, stopping at the
  // first that re-verifies — a stale FAILED report must never shadow a later
  // VERIFIED one produced by a prior fleet invocation.
  if (opts.resume) {
    for (const candidate of findExistingReport(reportsDir, target, run.seed)) {
      const verify = await verifyReportForResume(candidate, requiredMode, expectedPure, reportsDir);
      if (verify.ok) {
        const reportRecovered =
          requiredMode === "pure" ? verify.attestation.report_recovered : false;
        const reportReceiptBound =
          requiredMode === "pure" ? (verify.attestation.report_receipt_bound ?? false) : false;
        return {
          report: candidate,
          status: "skipped-resume",
          attempts: 0,
          attempt_history: [],
          exit: 0,
          run: verify.run,
          attestation: verify.attestation,
          report_recovered: reportRecovered,
          report_receipt_bound: reportReceiptBound,
        };
      }
    }
  }

  const reportMd = reportPathFor(reportsDir, stamp, target, run.seed);
  const outPrefix = reportMd.slice(0, -".md".length); // run.sh appends .md/.json/.log itself
  const maxAttempts = Math.max(1, opts.maxRetries + 1);

  let lastExit = 1;
  let lastLogPath = null;
  const attemptHistory = [];
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const args = [
      "--seed",
      String(run.seed),
      "--model",
      run.model,
      "--provider",
      run.provider,
      "--persona",
      run.persona,
      "--out",
      outPrefix,
    ];
    args.push(...(questId ? ["--quest", questId] : ["--overworld"]));
    if (opts.mock) args.push("--mock");

    const bashResult = await spawnAsync(bashPath, [RUN_SH, ...args], {
      cwd: GAME_DIR,
      env: { ...process.env },
    });
    lastExit = bashResult.status ?? 1;
    let verifyResult = null;

    if (lastExit === 0) {
      verifyResult = await verifyReportEvidence(reportMd, requiredMode, expectedPure, reportsDir);
      if (verifyResult.ok) {
        let attestation = null;
        if (!opts.mock) {
          try {
            attestation = await writeFreshPureFleetAttestation(
              reportMd,
              verifyResult.run,
              expectedPure,
              reportsDir,
            );
          } catch (error) {
            verifyResult = {
              ...verifyResult,
              ok: false,
              stderr: `pure fleet attestation could not be created exclusively: ${error instanceof Error ? error.message : String(error)}`,
            };
          }
        }
        if (!verifyResult.ok) {
          lastExit = 5;
        } else {
          const reportRecovered = attestation?.report_recovered ?? false;
          const reportReceiptBound = attestation?.report_receipt_bound ?? false;
          attemptHistory.push({
            attempt: attempt + 1,
            exit: 0,
            classification: "verified",
            report_recovered: reportRecovered,
            report_receipt_bound: reportReceiptBound,
            archive: null,
          });
          return {
            report: reportMd,
            status: "verified",
            attempts: attempt + 1,
            attempt_history: attemptHistory,
            exit: 0,
            run: verifyResult.run,
            attestation,
            report_recovered: reportRecovered,
            report_receipt_bound: reportReceiptBound,
          };
        }
      } else {
        lastExit = 5; // run.sh exited 0 but the belt-and-braces re-verify rejected it
      }
    }

    // Failed attempt: persist stdout/stderr tails to a per-attempt log file
    // (verified runs never reach here — they returned above) and print a
    // one-line stderr summary to the fleet's own stderr for live monitoring.
    const verifierAttempted =
      verifyResult !== null || existsSync(`${outPrefix}.verify.initial.log`);
    const classification = classifyFleetAttempt({
      runnerExit: bashResult.status ?? 1,
      verifierAttempted,
      verified: false,
    });
    const sections = [
      `attempt=${attempt + 1}`,
      `classification=${classification}`,
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
    const archive = archiveFailedFleetAttemptArtifacts({
      outPrefix,
      fleetDir,
      seed: run.seed,
      attempt: attempt + 1,
      diagnostic: `${sections.join("\n")}\n`,
    });
    lastLogPath = join(fleetDir, archive.directory, "fleet-diagnostic.log");
    attemptHistory.push({
      attempt: attempt + 1,
      exit: lastExit,
      classification,
      report_recovered: false,
      report_receipt_bound: false,
      archive,
    });
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
    attempt_history: attemptHistory,
    exit: lastExit,
    log: lastLogPath,
    run: null,
    attestation: null,
    report_recovered: false,
    report_receipt_bound: false,
    failure_reason:
      lastExit === 124 || lastExit === 137 ? "technical_timeout" : "run_or_verification_failed",
  };
}

/** Render a complete manifest in planned order, independent of pool completion order. */
export function renderClosedFleetManifest(rows) {
  if (
    !Array.isArray(rows) ||
    rows.length === 0 ||
    Array.from({ length: rows.length }, (_, index) => rows[index]).some((row) => row === undefined)
  ) {
    throw new Error("fleet: closed manifest requires a complete nonempty row set");
  }
  const sorted = [...rows].sort((a, b) => a.planned_index - b.planned_index || a.seed - b.seed);
  for (const [expectedIndex, row] of sorted.entries()) {
    if (!Number.isSafeInteger(row.planned_index) || row.planned_index !== expectedIndex) {
      throw new Error("fleet: closed manifest planned indexes must be contiguous from zero");
    }
  }
  return `${sorted.map((row) => JSON.stringify(row)).join("\n")}\n`;
}

export function fleetReportLockSpec(reportsDir, stamp, runs) {
  if (!Array.isArray(runs) || runs.length === 0) {
    throw new Error("fleet: report lock requires at least one planned run");
  }
  const target = runs[0].target;
  if (runs.some((run) => run.target !== target)) {
    throw new Error("fleet: one report lock cannot cover mixed targets");
  }
  const identity = {
    schema_version: 1,
    stamp,
    target,
    seed_start: runs[0].seed,
    seed_end: runs.at(-1).seed,
    seeds: runs.map((run) => run.seed),
    model_plan: runs.map((run) => ({ seed: run.seed, provider: run.provider, model: run.model })),
  };
  // The exclusive filename intentionally covers the entire stamp+target report
  // namespace, so different labels, overlapping ranges, and different model
  // plans cannot race on ledger-compatible report paths. The full range/model
  // key remains inspectable in the lock payload.
  const namespace = createHash("sha256").update(JSON.stringify({ stamp, target })).digest("hex");
  return {
    path: join(reportsDir, `.fleet-report-${namespace}.lock`),
    identity,
  };
}

export function acquireFleetReportLock(reportsDir, stamp, runs) {
  const lock = fleetReportLockSpec(reportsDir, stamp, runs);
  try {
    writeFileSync(lock.path, `${JSON.stringify(lock.identity, null, 2)}\n`, {
      encoding: "utf8",
      flag: "wx",
    });
  } catch (error) {
    if (error && typeof error === "object" && error.code === "EEXIST") {
      throw new Error(`fleet: report namespace is already locked by another fleet: ${lock.path}`, {
        cause: error,
      });
    }
    throw error;
  }
  return lock;
}

export function releaseFleetReportLock(lock) {
  unlinkSync(lock.path);
}

function npmCliInvocation() {
  if (process.env.npm_execpath) {
    return { command: process.execPath, args: [process.env.npm_execpath] };
  }

  const bundledNpmCli = join(dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js");
  if (existsSync(bundledNpmCli)) {
    return { command: process.execPath, args: [bundledNpmCli] };
  }

  if (process.platform !== "win32") {
    return { command: "npm", args: [] };
  }

  throw new Error("fleet: could not resolve npm's JavaScript CLI entrypoint");
}

function resolveFleetBashPath() {
  let bashPath;
  if (process.platform === "win32") {
    const found = gitBash();
    if (!found) {
      throw new Error(
        "fleet: could not find Git Bash; install Git for Windows or set BLIND_BASH to a real bash.exe path",
      );
    }
    bashPath = found;
  } else {
    try {
      execFileSync("bash", ["--version"], { stdio: "ignore" });
    } catch (error) {
      throw new Error("fleet: bash runtime is unavailable", { cause: error });
    }
    bashPath = "bash";
  }
  if (!existsSync(RUN_SH)) {
    throw new Error(`fleet: blind runner is unavailable: ${RUN_SH}`);
  }
  try {
    const npm = npmCliInvocation();
    execFileSync(npm.command, [...npm.args, "--version"], { stdio: "ignore" });
  } catch (error) {
    throw new Error("fleet: npm runtime is unavailable", { cause: error });
  }
  return bashPath;
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

  // Resolve every launcher prerequisite before reserving a report namespace or
  // label directory. A missing runtime must leave no misleading fleet shell.
  const bashPath = resolveFleetBashPath();

  // One fail-closed build identity is captured before any live launcher can
  // spend tokens. Structural mocks retain their historical no-provenance path.
  const fleetBuild = opts.mock ? null : await captureExpectedPureFleetBuild();

  const reportsDir = opts.out ? resolve(opts.out) : join(HERE, "reports");
  const stamp = utcStamp();
  const label = validateFleetLabel(opts.label ?? stamp);

  mkdirSync(reportsDir, { recursive: true });
  const reportLock = acquireFleetReportLock(reportsDir, stamp, runs);
  try {
    const fleetDir = join(GAME_DIR, "ai-runs", "fleet", label);
    mkdirSync(dirname(fleetDir), { recursive: true });
    if (opts.mock) {
      // Mock fleets are structural QA and preserve their historical reusable
      // labels; their closed manifest is replaced wholesale below, never appended.
      mkdirSync(fleetDir, { recursive: true });
    } else {
      try {
        mkdirSync(fleetDir);
      } catch (error) {
        if (error && typeof error === "object" && error.code === "EEXIST") {
          throw new Error(
            `fleet: label directory already exists; choose a fresh label: ${fleetDir}`,
            { cause: error },
          );
        }
        throw error;
      }
    }
    const manifestPath = join(fleetDir, "manifest.jsonl");
    const summaryPath = join(fleetDir, "summary.json");
    const counts = { verified: 0, "skipped-resume": 0, failed: 0 };
    const rows = new Array(runs.length);

    await runPool(runs, Math.max(1, opts.concurrency), async (run, plannedIndex) => {
      const result = await executeRun(run, {
        reportsDir,
        stamp,
        opts,
        bashPath,
        fleetDir,
        fleetBuild,
      });
      counts[result.status] += 1;
      const runMeta = result.run;
      const row = {
        planned_index: plannedIndex,
        seed: run.seed,
        persona: run.persona,
        provider: run.provider,
        model: run.model,
        target: run.target,
        report: result.report,
        status: result.status,
        attempts: result.attempts,
        attempt_history: result.attempt_history,
        report_recovered: result.report_recovered,
        report_receipt_bound: result.report_receipt_bound,
        exit: result.exit,
        log: result.log ?? null,
        model_attestation: result.attestation ?? null,
        evidence_schema_version: runMeta?.schema_version ?? null,
        run_seed: runMeta?.run_seed ?? null,
        build: runMeta?.build ?? null,
        quest_outcomes: runMeta?.quest_outcomes ?? null,
        report_schema_version: runMeta?.report_schema_version ?? null,
        play_mode: runMeta?.play_mode ?? (opts.mock ? "structural" : "pure"),
        start_surface:
          runMeta?.start_surface ??
          (run.target === "overworld" ? "fresh_overworld" : "direct_quest"),
        retention_eligible: runMeta?.retention_eligible ?? false,
        evidence_status: runMeta?.evidence_status ?? "unverified",
        session_contract_version: runMeta?.receipt?.contractVersion ?? null,
        baseline_decisions: opts.mock ? null : PURE_BASELINE_DECISIONS,
        accepted_decisions: runMeta?.receipt?.acceptedDecisions ?? null,
        retention_choices: runMeta?.receipt?.retentionHistory ?? [],
        checkpoint: runMeta?.receipt?.checkpoint ?? null,
        exit_reason: runMeta?.receipt?.exitReason ?? null,
        exit_reasons: runMeta?.receipt?.exitReasons ?? [],
        receipt_hash: runMeta?.receipt?.receiptHash ?? null,
        failure_reason: result.failure_reason ?? null,
      };
      rows[plannedIndex] = row;
      console.log(
        `[fleet] seed=${run.seed} persona=${run.persona} model=${run.model} → ${result.status}`,
      );
    });

    writeFileSync(manifestPath, renderClosedFleetManifest(rows), {
      encoding: "utf8",
      flag: opts.mock ? "w" : "wx",
    });

    const attemptSummary = summarizeFleetAttemptHistory(rows);
    const summary = {
      label,
      stamp,
      count: runs.length,
      concurrency: opts.concurrency,
      reportsDir,
      seed_base: opts.seedBase,
      provider: opts.mock ? "mock" : opts.provider,
      model: opts.model,
      personas: opts.personas,
      target: opts.target,
      resume_enabled: opts.resume,
      evidence_schema_version: opts.mock ? 1 : PURE_FLEET_EVIDENCE_SCHEMA_VERSION,
      model_attestation_schema_version: opts.mock
        ? null
        : opts.provider === "codex"
          ? PURE_FLEET_CODEX_ATTESTATION_SCHEMA_VERSION
          : PURE_FLEET_ATTESTATION_SCHEMA_VERSION,
      build: fleetBuild,
      report_schema_version: 2,
      play_mode: opts.mock ? "structural" : "pure",
      start_surface: opts.target === "overworld" ? "fresh_overworld" : "direct_quest",
      retention_contract_eligible: !opts.mock,
      retention_eligible_verified_runs: opts.mock ? 0 : counts.verified + counts["skipped-resume"],
      retention_ineligible_or_unverified_runs:
        runs.length - (opts.mock ? 0 : counts.verified + counts["skipped-resume"]),
      session_contract_version: opts.mock ? null : PURE_SESSION_CONTRACT_VERSION,
      baseline_decisions: opts.mock ? null : PURE_BASELINE_DECISIONS,
      verified: counts.verified,
      "skipped-resume": counts["skipped-resume"],
      failed: counts.failed,
      ...attemptSummary,
    };
    writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, {
      encoding: "utf8",
      flag: opts.mock ? "w" : "wx",
    });

    const ok =
      counts.verified + counts["skipped-resume"] === runs.length &&
      attemptSummary.failed_attempts === 0;
    console.log(
      `Fleet ${label}: ${counts.verified} verified, ${counts["skipped-resume"]} skipped-resume, ${counts.failed} failed slots, ${attemptSummary.failed_attempts} failed attempts (of ${runs.length})`,
    );
    console.log(`Manifest: ${manifestPath}`);
    process.exitCode = ok ? 0 : 1;
  } finally {
    releaseFleetReportLock(reportLock);
  }
}

// Entry guard so tests can import the pure planning functions without
// launching a fleet.
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
