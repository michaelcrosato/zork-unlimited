import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { parseJsonRejectingDuplicateKeys } from "../src/blind/strict_json.js";

const DEFAULT_MAX_ENTRIES = 100;
const MAX_ALLOWED_ENTRIES = 1_000;

export const LoopFailureEntrySchema = z
  .object({
    timestamp: z.string().datetime(),
    cycle_number: z.number().int().positive(),
    run_id: z.string().min(1).nullable(),
    start_ref: z
      .string()
      .regex(/^[0-9a-f]{40}$/)
      .nullable(),
    stage: z.string().min(1),
    reason: z.string().min(1),
    consecutive_failures: z.number().int().positive(),
    total_failures: z.number().int().positive(),
  })
  .strict();

export const LoopFailureLedgerSchema = z
  .object({
    schema_version: z.literal(1),
    max_entries: z.number().int().min(1).max(MAX_ALLOWED_ENTRIES),
    failures: z.array(LoopFailureEntrySchema),
  })
  .strict()
  .superRefine((ledger, ctx) => {
    if (ledger.failures.length > ledger.max_entries) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["failures"],
        message: "retained failures exceed max_entries",
      });
    }
  });

export type LoopFailureEntry = z.infer<typeof LoopFailureEntrySchema>;
export type LoopFailureLedger = z.infer<typeof LoopFailureLedgerSchema>;

export function readFailureLedger(path: string): LoopFailureLedger {
  if (!existsSync(path)) {
    return { schema_version: 1, max_entries: DEFAULT_MAX_ENTRIES, failures: [] };
  }
  const parsedJson = parseJsonRejectingDuplicateKeys(readFileSync(path, "utf8"), "failure ledger");
  if (!parsedJson.ok) throw new Error(parsedJson.reason);
  const parsed = LoopFailureLedgerSchema.safeParse(parsedJson.value);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new Error(
      `failure ledger invalid: ${issue?.path.join(".") ?? "?"} — ${issue?.message ?? "schema mismatch"}`,
    );
  }
  return parsed.data;
}

export function appendLoopFailure(
  path: string,
  entry: LoopFailureEntry,
  maxEntries = DEFAULT_MAX_ENTRIES,
): LoopFailureLedger {
  const boundedMax = Math.max(1, Math.min(MAX_ALLOWED_ENTRIES, Math.trunc(maxEntries)));
  const parsedEntry = LoopFailureEntrySchema.parse(entry);
  const current = readFailureLedger(path);
  const ledger: LoopFailureLedger = {
    schema_version: 1,
    max_entries: boundedMax,
    failures: [...current.failures, parsedEntry].slice(-boundedMax),
  };
  mkdirSync(dirname(path), { recursive: true });
  const temporaryPath = `${path}.tmp-${process.pid}-${randomUUID()}`;
  try {
    writeFileSync(temporaryPath, `${JSON.stringify(ledger, null, 2)}\n`, {
      encoding: "utf8",
      flag: "wx",
    });
    renameSync(temporaryPath, path);
  } finally {
    rmSync(temporaryPath, { force: true });
  }
  return ledger;
}

export function formatFailureLedgerSummary(ledger: LoopFailureLedger): string {
  if (ledger.failures.length === 0) return "  (no recorded failures)";
  const latest = ledger.failures.at(-1)!;
  const run = latest.run_id ?? "none";
  return [
    `  retained=${ledger.failures.length}/${ledger.max_entries}`,
    `  latest=${latest.timestamp} cycle=${latest.cycle_number} stage=${latest.stage}`,
    `  run=${run} consecutive=${latest.consecutive_failures} total=${latest.total_failures}`,
    `  reason=${latest.reason}`,
  ].join("\n");
}

function valueOf(argv: string[], flag: string): string | undefined {
  const index = argv.indexOf(flag);
  return index >= 0 ? argv[index + 1] : undefined;
}

function requiredValue(argv: string[], flag: string): string {
  const value = valueOf(argv, flag);
  if (value === undefined || value.length === 0) throw new Error(`missing ${flag}`);
  return value;
}

function positiveInteger(value: string, label: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) throw new Error(`${label} must be positive`);
  return parsed;
}

function main(): void {
  const argv = process.argv.slice(2);
  const command = argv[0];
  const ledgerPath = resolve(valueOf(argv, "--file") ?? "ai-runs/failure-ledger.json");
  try {
    if (command === "summary") {
      console.log(formatFailureLedgerSummary(readFailureLedger(ledgerPath)));
      return;
    }
    if (command !== "append") {
      throw new Error(
        "usage: loop-failure-ledger.ts append --cycle N --stage NAME --reason TEXT --consecutive N --total N [--run-id ID] [--start-ref SHA] [--max N] | summary",
      );
    }
    const startRef = valueOf(argv, "--start-ref");
    const runId = valueOf(argv, "--run-id");
    const entry: LoopFailureEntry = {
      timestamp: new Date().toISOString(),
      cycle_number: positiveInteger(requiredValue(argv, "--cycle"), "cycle"),
      run_id: runId && runId !== "none" ? runId : null,
      start_ref: startRef && startRef !== "none" ? startRef : null,
      stage: requiredValue(argv, "--stage"),
      reason: requiredValue(argv, "--reason"),
      consecutive_failures: positiveInteger(
        requiredValue(argv, "--consecutive"),
        "consecutive failures",
      ),
      total_failures: positiveInteger(requiredValue(argv, "--total"), "total failures"),
    };
    const max = positiveInteger(valueOf(argv, "--max") ?? String(DEFAULT_MAX_ENTRIES), "max");
    appendLoopFailure(ledgerPath, entry, max);
  } catch (error) {
    console.error(
      `✗ loop failure ledger: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exit(5);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
