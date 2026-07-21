import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  bindPureCodexReceipt,
  PureReceiptBindingMetadataSchema,
  reproducePureCodexReceiptBinding,
} from "../src/blind/receipt_binding.js";
import { parseJsonRejectingDuplicateKeys } from "../src/blind/strict_json.js";

function failUsage(message: string): never {
  console.error(message);
  console.error(
    "Usage: tsx scripts/blind-receipt-binding.ts bind --play-mode pure --provider codex --agent-status 0 --verifier-status <n> --attempt 0 --model <model> --seed <n> --git-commit <sha> --tracked-worktree-clean true|false --envelope <file> --run-evidence <file> --report <file> --report-out <file> --metadata-out <file>",
  );
  console.error(
    "   or: tsx scripts/blind-receipt-binding.ts verify --envelope <file> --run-evidence <file> --original-report <file> --bound-report <file> --metadata <file>",
  );
  process.exit(2);
}

function oneValue(argv: readonly string[], flag: string): string {
  const indexes = argv.flatMap((value, index) => (value === flag ? [index] : []));
  if (indexes.length !== 1) failUsage(`Expected exactly one ${flag}.`);
  const value = argv[indexes[0]! + 1];
  if (value === undefined || value.startsWith("--")) failUsage(`${flag} requires a value.`);
  return value;
}

function integerValue(argv: readonly string[], flag: string): number {
  const raw = oneValue(argv, flag);
  if (!/^-?[0-9]+$/u.test(raw)) failUsage(`${flag} requires an integer.`);
  const value = Number(raw);
  if (!Number.isSafeInteger(value)) failUsage(`${flag} requires a safe integer.`);
  return value;
}

function booleanValue(argv: readonly string[], flag: string): boolean {
  const raw = oneValue(argv, flag);
  if (raw !== "true" && raw !== "false") failUsage(`${flag} requires true or false.`);
  return raw === "true";
}

function main(): void {
  const [command, ...argv] = process.argv.slice(2);
  if (command === "bind") {
    const result = bindPureCodexReceipt({
      playMode: oneValue(argv, "--play-mode"),
      provider: oneValue(argv, "--provider"),
      agentExitStatus: integerValue(argv, "--agent-status"),
      verifierExitStatus: integerValue(argv, "--verifier-status"),
      attempt: integerValue(argv, "--attempt"),
      requestedModel: oneValue(argv, "--model"),
      expectedRunSeed: integerValue(argv, "--seed"),
      expectedGitCommit: oneValue(argv, "--git-commit"),
      expectedTrackedWorktreeClean: booleanValue(argv, "--tracked-worktree-clean"),
      primaryEnvelopeBytes: readFileSync(oneValue(argv, "--envelope")),
      runEvidenceBytes: readFileSync(oneValue(argv, "--run-evidence")),
      reportBytes: readFileSync(oneValue(argv, "--report")),
    });
    if (!result.ok) {
      console.error(`Receipt binding rejected: ${result.reason}`);
      process.exit(6);
    }
    writeFileSync(oneValue(argv, "--report-out"), result.reportBytes);
    writeFileSync(
      oneValue(argv, "--metadata-out"),
      `${JSON.stringify(result.metadata, null, 2)}\n`,
      "utf8",
    );
    return;
  }

  if (command === "verify") {
    const rawMetadata = parseJsonRejectingDuplicateKeys(
      readFileSync(oneValue(argv, "--metadata"), "utf8"),
      "receipt binding metadata",
    );
    if (!rawMetadata.ok) {
      console.error(`Receipt binding rejected: ${rawMetadata.reason}`);
      process.exit(7);
    }
    const parsedMetadata = PureReceiptBindingMetadataSchema.safeParse(rawMetadata.value);
    if (!parsedMetadata.success) {
      console.error("Receipt binding rejected: receipt binding metadata is invalid");
      process.exit(7);
    }
    const result = reproducePureCodexReceiptBinding({
      primaryEnvelopeBytes: readFileSync(oneValue(argv, "--envelope")),
      runEvidenceBytes: readFileSync(oneValue(argv, "--run-evidence")),
      originalReportBytes: readFileSync(oneValue(argv, "--original-report")),
      metadata: parsedMetadata.data,
    });
    if (!result.ok) {
      console.error(`Receipt binding rejected: ${result.reason}`);
      process.exit(7);
    }
    if (!Buffer.from(result.reportBytes).equals(readFileSync(oneValue(argv, "--bound-report")))) {
      console.error("Receipt binding rejected: bound report does not reproduce exactly");
      process.exit(7);
    }
    return;
  }

  failUsage(`Unknown receipt binding command: ${command ?? "(missing)"}.`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
