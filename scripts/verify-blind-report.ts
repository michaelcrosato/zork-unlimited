import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export type BlindReportVerification = { ok: true } | { ok: false; reason: string };

const MCP_FAILURE_PATTERNS: ReadonlyArray<RegExp> = [
  /\badventureforge\b[\s\S]{0,80}\bMCP server has failed to connect\b/i,
  /\bMCP server has failed to connect\b/i,
  /\btools never became available\b/i,
  /\bRequired AdventureForge MCP tools are unavailable\b/i,
  /\bToolSearch returned 0 tools\b/i,
  /\bcannot play through the adventure\b/i,
  /\bcannot .*produce .*playtest(?:ing)? report\b/i,
  /\bwithout (?:the|those|these) tools\b/i,
];

const REQUIRED_REPORT_PATTERNS: ReadonlyArray<[RegExp, string]> = [
  [/\bPlaythrough log\b/i, "missing Playthrough log section"],
  [/\bVerdict\b/i, "missing Verdict section"],
  [/\bclarity\b[\s\S]{0,80}\b[1-5]\s*(?:\/\s*5)?\b/i, "missing clarity rating"],
  [/\benjoyment\b[\s\S]{0,80}\b[1-5]\s*(?:\/\s*5)?\b/i, "missing enjoyment rating"],
];

export function verifyBlindReportText(text: string): BlindReportVerification {
  if (text.trim().length === 0) {
    return { ok: false, reason: "report is empty" };
  }
  for (const pattern of MCP_FAILURE_PATTERNS) {
    if (pattern.test(text)) {
      return { ok: false, reason: "report says AdventureForge MCP tools were unavailable" };
    }
  }
  for (const [pattern, reason] of REQUIRED_REPORT_PATTERNS) {
    if (!pattern.test(text)) {
      return { ok: false, reason };
    }
  }
  return { ok: true };
}

export function verifyBlindReportFile(path: string): BlindReportVerification {
  return verifyBlindReportText(readFileSync(path, "utf8"));
}

function main(): void {
  const reportPath = process.argv[2];
  if (!reportPath) {
    console.error("Usage: tsx scripts/verify-blind-report.ts <report.md>");
    process.exit(2);
  }
  const result = verifyBlindReportFile(reportPath);
  if (!result.ok) {
    console.error(`✗ blind report rejected: ${result.reason}`);
    process.exit(5);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
