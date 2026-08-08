import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { parseJsonRejectingDuplicateKeys } from "../src/blind/strict_json.js";
import { npmCliInvocation } from "./npm-cli.js";

const ROLLING_SAMPLE_COUNT = 5;
const ROLLING_MULTIPLIER = 1.5;

const PerformanceHistorySchema = z
  .object({
    schema_version: z.literal(1),
    samples_seconds: z.record(
      z.string().min(1),
      z.array(z.number().finite().nonnegative()).max(ROLLING_SAMPLE_COUNT),
    ),
  })
  .strict();

type PerformanceHistory = z.infer<typeof PerformanceHistorySchema>;

export interface SoftBudgetEvaluation {
  exceeded: boolean;
  fixedBudgetSeconds: number;
  rollingMedianSeconds: number | null;
  rollingLimitSeconds: number | null;
  reasons: string[];
}

interface CommandInvocation {
  command: string;
  args: string[];
}

export function resolveSoftBudgetInvocation(
  command: string,
  commandArgs: readonly string[],
  platform: NodeJS.Platform,
  npmInvocation?: Readonly<CommandInvocation>,
): CommandInvocation {
  if (platform !== "win32" || (command !== "npm" && command !== "npm.cmd")) {
    return { command, args: [...commandArgs] };
  }
  if (!npmInvocation) {
    throw new Error("Windows npm commands require npm's JavaScript CLI entrypoint");
  }
  return {
    command: npmInvocation.command,
    args: [...npmInvocation.args, ...commandArgs],
  };
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)]!;
}

export function evaluateSoftBudget(
  elapsedSeconds: number,
  fixedBudgetSeconds: number,
  priorCleanDurations: readonly number[],
): SoftBudgetEvaluation {
  const reasons: string[] = [];
  if (elapsedSeconds > fixedBudgetSeconds) {
    reasons.push(`fixed soft budget ${fixedBudgetSeconds}s exceeded`);
  }
  const baseline =
    priorCleanDurations.length >= ROLLING_SAMPLE_COUNT
      ? median(priorCleanDurations.slice(-ROLLING_SAMPLE_COUNT))
      : null;
  const rollingLimit = baseline === null ? null : baseline * ROLLING_MULTIPLIER;
  if (rollingLimit !== null && elapsedSeconds > rollingLimit) {
    reasons.push(`1.5x rolling median ${rollingLimit.toFixed(1)}s exceeded`);
  }
  return {
    exceeded: reasons.length > 0,
    fixedBudgetSeconds,
    rollingMedianSeconds: baseline,
    rollingLimitSeconds: rollingLimit,
    reasons,
  };
}

function readHistory(path: string): PerformanceHistory {
  if (!existsSync(path)) return { schema_version: 1, samples_seconds: {} };
  const raw = parseJsonRejectingDuplicateKeys(readFileSync(path, "utf8"), "performance history");
  if (!raw.ok) throw new Error(raw.reason);
  const parsed = PerformanceHistorySchema.safeParse(raw.value);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new Error(
      `performance history invalid: ${issue?.path.join(".") ?? "?"} — ${issue?.message ?? "schema mismatch"}`,
    );
  }
  return parsed.data;
}

function appendCleanDuration(path: string, label: string, elapsedSeconds: number): void {
  const history = readHistory(path);
  history.samples_seconds[label] = [
    ...(history.samples_seconds[label] ?? []),
    elapsedSeconds,
  ].slice(-ROLLING_SAMPLE_COUNT);
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.tmp-${process.pid}-${randomUUID()}`;
  try {
    writeFileSync(temporary, `${JSON.stringify(history, null, 2)}\n`, {
      encoding: "utf8",
      flag: "wx",
    });
    renameSync(temporary, path);
  } finally {
    rmSync(temporary, { force: true });
  }
}

function valueOf(argv: string[], flag: string): string | undefined {
  const index = argv.indexOf(flag);
  return index >= 0 ? argv[index + 1] : undefined;
}

function githubEscape(value: string): string {
  return value.replaceAll("%", "%25").replaceAll("\r", "%0D").replaceAll("\n", "%0A");
}

function emitWarning(message: string): void {
  console.warn(`::warning title=Performance soft budget::${githubEscape(message)}`);
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const separator = argv.indexOf("--");
  const command = separator >= 0 ? argv[separator + 1] : undefined;
  const commandArgs = separator >= 0 ? argv.slice(separator + 2) : [];
  const label = valueOf(argv, "--label");
  const budget = Number(valueOf(argv, "--seconds"));
  const historyArg = valueOf(argv, "--history");
  if (!label || !command || !Number.isFinite(budget) || budget <= 0) {
    console.error(
      "Usage: run-with-soft-budget.ts --label NAME --seconds N [--history FILE] -- COMMAND [ARGS...]",
    );
    process.exit(2);
  }
  const historyPath = historyArg ? resolve(historyArg) : null;
  let prior: number[] = [];
  if (historyPath !== null) {
    try {
      prior = readHistory(historyPath).samples_seconds[label] ?? [];
    } catch (error) {
      emitWarning(`Cannot read ${label} timing history: ${String(error)}`);
    }
  }

  const invocation = resolveSoftBudgetInvocation(
    command,
    commandArgs,
    process.platform,
    process.platform === "win32" && (command === "npm" || command === "npm.cmd")
      ? npmCliInvocation()
      : undefined,
  );
  const started = process.hrtime.bigint();
  const status = await new Promise<{ code: number; signal: NodeJS.Signals | null }>((done) => {
    const child = spawn(invocation.command, invocation.args, { stdio: "inherit", shell: false });
    child.once("error", (error) => {
      console.error(`Could not start ${command}: ${String(error)}`);
      done({ code: 1, signal: null });
    });
    child.once("close", (code, signal) => done({ code: code ?? 1, signal }));
  });
  const elapsedSeconds = Number(process.hrtime.bigint() - started) / 1_000_000_000;
  const evaluation = evaluateSoftBudget(elapsedSeconds, budget, prior);
  const timing = `${label} took ${elapsedSeconds.toFixed(1)}s`;
  if (evaluation.exceeded) {
    emitWarning(
      `${timing}; ${evaluation.reasons.join("; ")}. This warning does not relax any test or timeout.`,
    );
  } else {
    console.log(`✓ ${timing} (soft budget ${budget}s)`);
  }

  if (status.code === 0 && historyPath !== null) {
    try {
      appendCleanDuration(historyPath, label, elapsedSeconds);
    } catch (error) {
      emitWarning(`Cannot persist ${label} timing history: ${String(error)}`);
    }
  }
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (summaryPath) {
    const rolling =
      evaluation.rollingMedianSeconds === null
        ? `${prior.length}/${ROLLING_SAMPLE_COUNT} baseline samples`
        : `rolling median ${evaluation.rollingMedianSeconds.toFixed(1)}s`;
    appendFileSync(
      summaryPath,
      `- ${label}: ${elapsedSeconds.toFixed(1)}s (soft budget ${budget}s; ${rolling})\n`,
    );
  }
  if (status.signal !== null) console.error(`${label} ended from signal ${status.signal}`);
  process.exit(status.code);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  void main();
}
