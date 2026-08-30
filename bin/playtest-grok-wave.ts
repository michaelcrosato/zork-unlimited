#!/usr/bin/env -S npx tsx
/**
 * Run a Grok Build MCP playtest wave. Each player gets a private pure-mode
 * AdventureForge server and server-authored evidence, while the client remains
 * conservatively operator-attested until this checkout can audit Grok's session log.
 *
 *   npm run playtest:grok-wave -- --plan-only
 *   npm run playtest:grok-wave -- --count 100 --concurrency 4
 */
import { execFileSync, spawn } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseRunEvidenceJsonl, type PureBlindRunSidecar } from "../src/blind/run_evidence.js";
import {
  GROK_MCP_WAVE_COUNT,
  grokMcpProjectConfig,
  parseGrokMcpWaveArgs,
  parseGrokStreamingOutput,
  type GrokMcpWavePlan,
} from "../src/qa/grok_mcp_wave.js";
import { savePlaytestReport } from "../src/qa/save_playtest_report.js";
import type { PlaytestOutcome } from "../src/qa/session_record.js";

const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url));
const PLAYER_TIMEOUT_MS = 20 * 60 * 1000;

type GrokChildResult = {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut: boolean;
};

type ManifestRow = {
  index: number;
  seed: number;
  model: string;
  effort: string;
  playSurface: "mcp";
  outcome: string;
  extractOk: boolean;
  recordId: string | null;
  gameSessionId: string | null;
  clientSessionId: string | null;
  buildCommit: string;
  dir: string | null;
  error: string | null;
};

function git(args: string[]): string {
  return execFileSync("git", args, { cwd: REPO_ROOT, encoding: "utf8" }).trim();
}

function grokExecutable(): string {
  return process.env.BLIND_GROK_BIN ?? (process.platform === "win32" ? "grok.exe" : "grok");
}

function runGrokPlayer(plan: GrokMcpWavePlan, workDir: string): Promise<GrokChildResult> {
  const promptPath = resolve(REPO_ROOT, plan.promptPath);
  const args = [
    "--prompt-file",
    promptPath,
    "--model",
    plan.model,
    "--reasoning-effort",
    plan.effort,
    "--always-approve",
    "--output-format",
    "streaming-json",
    "--no-subagents",
    "--no-plan",
    "--verbatim",
    "--tools",
    "search_tool,use_tool",
    "--disable-web-search",
    "--cwd",
    workDir,
  ];
  return new Promise((resolveResult, reject) => {
    const child = spawn(grokExecutable(), args, {
      cwd: workDir,
      windowsHide: true,
      env: { ...process.env, GROK_DISABLE_AUTOUPDATER: "1" },
    });
    const chunks: Buffer[] = [];
    const errChunks: Buffer[] = [];
    let timedOut = false;
    let settled = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, PLAYER_TIMEOUT_MS);
    child.stdout.on("data", (data: Buffer) => chunks.push(data));
    child.stderr.on("data", (data: Buffer) => errChunks.push(data));
    child.on("error", (error) => {
      clearTimeout(timer);
      if (settled) return;
      settled = true;
      reject(error);
    });
    child.on("close", (exitCode) => {
      clearTimeout(timer);
      if (settled) return;
      settled = true;
      resolveResult({
        stdout: Buffer.concat(chunks).toString("utf8"),
        stderr: Buffer.concat(errChunks).toString("utf8"),
        exitCode,
        timedOut,
      });
    });
  });
}

function v2Sidecar(evidenceText: string): {
  sidecar: Extract<PureBlindRunSidecar, { schema_version: 2 }> | null;
  error: string | null;
} {
  const parsed = parseRunEvidenceJsonl(evidenceText);
  if (!parsed.ok) return { sidecar: null, error: parsed.reason };
  if (parsed.sidecar.schema_version !== 2) {
    return { sidecar: null, error: "Grok wave requires V2 run evidence" };
  }
  return { sidecar: parsed.sidecar, error: null };
}

function transcriptEnvelope(result: GrokChildResult, evidenceText: string): string {
  const rows = result.stdout.trimEnd().length > 0 ? [result.stdout.trimEnd()] : [];
  rows.push(
    JSON.stringify({
      type: "adventureforge_grok_harness",
      exitCode: result.exitCode,
      timedOut: result.timedOut,
      stderr: result.stderr,
      runEvidence: evidenceText,
    }),
  );
  return `${rows.join("\n")}\n`;
}

async function playOne(
  plan: GrokMcpWavePlan,
  index: number,
  buildCommit: string,
): Promise<ManifestRow> {
  const seed = plan.seedBase + index;
  const workRoot = join(REPO_ROOT, "ai-runs", "playtest", ".grok-wave-work");
  mkdirSync(workRoot, { recursive: true });
  const workDir = mkdtempSync(join(workRoot, `player-${index}-`));
  const evidencePath = join(workDir, "run-evidence.jsonl");
  const configDir = join(workDir, ".grok");
  mkdirSync(configDir, { recursive: true });
  writeFileSync(
    join(configDir, "config.toml"),
    grokMcpProjectConfig({
      repoRoot: REPO_ROOT,
      evidencePath,
      seed,
      buildCommit,
      trackedWorktreeClean: true,
    }),
    "utf8",
  );
  const recordedAt = new Date().toISOString();
  try {
    const child = await runGrokPlayer(plan, workDir);
    const stream = parseGrokStreamingOutput(child.stdout);
    const evidenceText = existsSync(evidencePath) ? readFileSync(evidencePath, "utf8") : "";
    const evidence = v2Sidecar(evidenceText);
    let requestedOutcome: PlaytestOutcome | undefined;
    if (child.timedOut) requestedOutcome = "timed_out";
    else if (child.exitCode !== 0 || stream.error !== null || evidence.error !== null) {
      requestedOutcome = "failed";
    }
    const gameSessionId = evidence.sidecar?.session_id ?? `unknown-grok-wave-${index}`;
    const saved = savePlaytestReport({
      reportText: stream.reportText,
      transcript: transcriptEnvelope(child, evidenceText),
      store: plan.store,
      providerId: plan.provider,
      modelId: plan.model,
      seed,
      gameSessionId,
      attestedBy: "playtest-grok-wave",
      method:
        "Grok Build CLI with a private pure AdventureForge MCP server; client tool boundary prompt-restricted but not independently audited",
      recordedAt,
      ...(requestedOutcome === undefined ? {} : { requestedOutcome }),
      turns: stream.gameToolCalls,
      buildCommit,
      trackedWorktreeClean: true,
      transcriptFilename: "grok-stream.jsonl",
      runEvidenceText: evidenceText,
      ...(evidence.sidecar === null ? {} : { build: evidence.sidecar.build }),
    });
    return {
      index,
      seed,
      model: plan.model,
      effort: plan.effort,
      playSurface: "mcp",
      outcome: saved.record.outcome,
      extractOk:
        saved.record.outcome === "completed" &&
        saved.record.exit_interview !== null &&
        saved.record.journey_receipt !== null,
      recordId: saved.record.record_id,
      gameSessionId: saved.record.game_session_id,
      clientSessionId: stream.clientSessionId,
      buildCommit: saved.record.build.git_commit,
      dir: saved.dir,
      error: saved.record.failure_note ?? stream.error ?? evidence.error,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      index,
      seed,
      model: plan.model,
      effort: plan.effort,
      playSurface: "mcp",
      outcome: "failed",
      extractOk: false,
      recordId: null,
      gameSessionId: null,
      clientSessionId: null,
      buildCommit,
      dir: null,
      error: message,
    };
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
}

function writeManifest(path: string, rows: Array<ManifestRow | undefined>): void {
  const completeRows = rows.filter((row): row is ManifestRow => row !== undefined);
  const temporaryPath = `${path}.tmp`;
  writeFileSync(temporaryPath, `${JSON.stringify(completeRows, null, 2)}\n`, "utf8");
  try {
    renameSync(temporaryPath, path);
  } catch (error) {
    const code =
      typeof error === "object" && error !== null && "code" in error ? String(error.code) : null;
    // POSIX rename replaces the destination atomically. Windows can instead report
    // EEXIST/EPERM when the previous checkpoint is present, so remove that exact
    // ignored manifest and retry. Other failures still surface unchanged.
    if (!existsSync(path) || (code !== "EEXIST" && code !== "EPERM")) throw error;
    rmSync(path, { force: true });
    renameSync(temporaryPath, path);
  } finally {
    if (existsSync(temporaryPath)) rmSync(temporaryPath, { force: true });
  }
}

async function runPool(
  plan: GrokMcpWavePlan,
  buildCommit: string,
  manifestPath: string,
): Promise<ManifestRow[]> {
  const rows: Array<ManifestRow | undefined> = new Array(plan.count);
  let next = 0;
  async function worker(): Promise<void> {
    while (true) {
      const index = next;
      next += 1;
      if (index >= plan.count) return;
      rows[index] = await playOne(plan, index, buildCommit);
      writeManifest(manifestPath, rows);
      process.stderr.write(
        `  player ${index + 1}/${plan.count} outcome=${rows[index]!.outcome} extractOk=${rows[index]!.extractOk}\n`,
      );
    }
  }
  const concurrency = Math.min(plan.concurrency, plan.count);
  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return rows.filter((row): row is ManifestRow => row !== undefined);
}

async function main(): Promise<void> {
  const plan = parseGrokMcpWaveArgs(process.argv.slice(2));
  const payload = {
    count: plan.count,
    model: plan.model,
    effort: plan.effort,
    instantThinking: plan.instantThinking,
    playSurface: plan.playSurface,
    provider: plan.provider,
    promptPath: plan.promptPath,
    concurrency: plan.concurrency,
    store: plan.store,
    manifest: plan.manifest,
    seedBase: plan.seedBase,
    defaultCount: GROK_MCP_WAVE_COUNT,
  };
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
  if (plan.planOnly) return;

  const dirty = git(["status", "--porcelain"]);
  if (dirty.length > 0) {
    throw new Error(
      "Refusing to spend a Grok wave against a dirty worktree: commit the exact build first.",
    );
  }
  const buildCommit = git(["rev-parse", "HEAD"]);
  execFileSync(grokExecutable(), ["--version"], { cwd: REPO_ROOT, stdio: "ignore" });
  const manifestPath = resolve(REPO_ROOT, plan.manifest);
  mkdirSync(dirname(manifestPath), { recursive: true });
  const rows = await runPool(plan, buildCommit, manifestPath);
  const incomplete = rows.filter((row) => row.outcome !== "completed" || !row.extractOk);
  if (incomplete.length > 0) {
    throw new Error(
      `${incomplete.length}/${rows.length} Grok players did not produce completed, evidence-bound reports; inspect ${manifestPath}`,
    );
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
