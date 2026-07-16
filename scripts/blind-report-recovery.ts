import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  extractRecoveredReport,
  preparePureReportRecovery,
  PureReportRecoveryMetadataSchema,
  bytesMatchHash,
} from "../src/blind/report_recovery.js";

function failUsage(message: string): never {
  console.error(message);
  console.error(
    "Usage: tsx scripts/blind-report-recovery.ts prepare --play-mode pure --agent-status 0 --verifier-status <n> --attempt 0 --model <model> --seed <n> --git-commit <sha> --tracked-worktree-clean true|false --envelope <file> --run-evidence <file> --report <file> --prompt-out <file> --metadata-out <file>",
  );
  console.error(
    "   or: tsx scripts/blind-report-recovery.ts extract --envelope <file> --primary-envelope <file> --run-evidence <file> --report <file> --metadata <file> --report-out <file>",
  );
  console.error(
    "   or: tsx scripts/blind-report-recovery.ts assert-evidence --run-evidence <file> --metadata <file> [--initial-report <file>]",
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

function optionalValue(argv: readonly string[], flag: string): string | undefined {
  const indexes = argv.flatMap((value, index) => (value === flag ? [index] : []));
  if (indexes.length > 1) failUsage(`Expected at most one ${flag}.`);
  if (indexes.length === 0) return undefined;
  const value = argv[indexes[0]! + 1];
  if (value === undefined || value.startsWith("--")) failUsage(`${flag} requires a value.`);
  return value;
}

function integerValue(argv: readonly string[], flag: string): number {
  const raw = oneValue(argv, flag);
  if (!/^-?[0-9]+$/.test(raw)) failUsage(`${flag} requires an integer.`);
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
  if (command === "prepare") {
    const decision = preparePureReportRecovery({
      playMode: oneValue(argv, "--play-mode"),
      agentExitStatus: integerValue(argv, "--agent-status"),
      verifierExitStatus: integerValue(argv, "--verifier-status"),
      attempt: integerValue(argv, "--attempt"),
      requestedModel: oneValue(argv, "--model"),
      expectedRunSeed: integerValue(argv, "--seed"),
      expectedGitCommit: oneValue(argv, "--git-commit"),
      expectedTrackedWorktreeClean: booleanValue(argv, "--tracked-worktree-clean"),
      claudeEnvelopeBytes: readFileSync(oneValue(argv, "--envelope")),
      runEvidenceBytes: readFileSync(oneValue(argv, "--run-evidence")),
      reportBytes: readFileSync(oneValue(argv, "--report")),
    });
    if (!decision.ok) {
      console.error(`Report recovery unavailable: ${decision.reason}`);
      process.exit(6);
    }
    writeFileSync(oneValue(argv, "--prompt-out"), decision.prompt, "utf8");
    writeFileSync(
      oneValue(argv, "--metadata-out"),
      `${JSON.stringify(decision.metadata, null, 2)}\n`,
      "utf8",
    );
    process.stdout.write(decision.metadata.claude_session_id);
    return;
  }

  if (command === "extract") {
    const metadata = PureReportRecoveryMetadataSchema.parse(
      JSON.parse(readFileSync(oneValue(argv, "--metadata"), "utf8")),
    );
    const result = extractRecoveredReport({
      recoveryEnvelopeBytes: readFileSync(oneValue(argv, "--envelope")),
      primaryEnvelopeBytes: readFileSync(oneValue(argv, "--primary-envelope")),
      originalReportBytes: readFileSync(oneValue(argv, "--report")),
      runEvidenceBytes: readFileSync(oneValue(argv, "--run-evidence")),
      metadata,
    });
    if (!result.ok) {
      console.error(`Report recovery rejected: ${result.reason}`);
      process.exit(7);
    }
    writeFileSync(oneValue(argv, "--report-out"), result.reportBytes);
    return;
  }

  if (command === "assert-evidence") {
    const metadata = PureReportRecoveryMetadataSchema.parse(
      JSON.parse(readFileSync(oneValue(argv, "--metadata"), "utf8")),
    );
    const evidenceBytes = readFileSync(oneValue(argv, "--run-evidence"));
    if (!bytesMatchHash(evidenceBytes, metadata.run_evidence_sha256)) {
      console.error("Report recovery rejected: run evidence changed during report recovery");
      process.exit(8);
    }
    const initialReportPath = optionalValue(argv, "--initial-report");
    if (
      initialReportPath !== undefined &&
      !bytesMatchHash(readFileSync(initialReportPath), metadata.initial_report_sha256)
    ) {
      console.error("Report recovery rejected: initial report marker bytes do not match metadata");
      process.exit(8);
    }
    return;
  }

  failUsage(`Unknown report recovery command: ${command ?? "(missing)"}.`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
