import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import {
  buildBlindFeedbackLedger,
  DEFAULT_FEEDBACK_RECENT_LIMIT,
  renderBlindFeedbackLedgerMarkdown,
} from "../src/blind/feedback_ledger.js";

function readOption(name: string): string | undefined {
  const prefix = `--${name}=`;
  const inline = process.argv.find((arg) => arg.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = process.argv.indexOf(`--${name}`);
  if (index >= 0) return process.argv[index + 1];
  return undefined;
}

function readNumberOption(name: string, fallback: number): number {
  const raw = readOption(name);
  if (raw === undefined) return fallback;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`--${name} must be a positive integer`);
  }
  return parsed;
}

function main(): void {
  const cwd = process.cwd();
  const reportsDir = resolve(readOption("reports") ?? join(cwd, "blind-tester", "reports"));
  const outPath = resolve(readOption("out") ?? join(cwd, "docs", "BLIND_FEEDBACK_LEDGER.md"));
  const recentLimit = readNumberOption("recent-limit", DEFAULT_FEEDBACK_RECENT_LIMIT);

  if (!existsSync(reportsDir)) {
    throw new Error(`Reports directory does not exist: ${reportsDir}`);
  }

  const ledger = buildBlindFeedbackLedger(reportsDir, { recentLimit, cwd });
  const markdown = renderBlindFeedbackLedgerMarkdown(ledger);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, markdown);
  console.log(
    `Wrote ${outPath} from ${ledger.accepted_reports} accepted report(s), ${ledger.rejected_reports} rejected/ignored.`,
  );
}

main();
