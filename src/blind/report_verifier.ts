import { readFileSync } from "node:fs";
import { extractExitInterview, type ExitInterview } from "./exit_interview.js";

export type BlindReportVerification =
  | { ok: true; interview: ExitInterview }
  | { ok: false; reason: string };

const MCP_FAILURE_PATTERNS: ReadonlyArray<RegExp> = [
  /\badventureforge\b[\s\S]{0,80}\bMCP server has failed to connect\b/i,
  /\bMCP server has failed to connect\b/i,
  /\bMCP server (?:hasn'?t|has not) finished connecting\b/i,
  /\b(?:adventureforge|MCP server|ToolSearch|tools)\b[\s\S]{0,120}\bstill connecting\b/i,
  /\bstill connecting\b[\s\S]{0,120}\b(?:adventureforge|MCP server|ToolSearch|tools)\b/i,
  /\btools never became available\b/i,
  /\btools (?:are|were) not (?:yet )?available\b/i,
  /\bRequired AdventureForge MCP tools are unavailable\b/i,
  /\bToolSearch returned 0 tools\b/i,
  /\bToolSearch\b[\s\S]{0,80}\bzero results\b/i,
  /\bToolSearch\b[\s\S]{0,120}\bevery query returns nothing\b/i,
  /\bevery query returns nothing[\s\S]{0,120}\bToolSearch\b/i,
  /\bcannot play through the adventure\b/i,
  /\bcannot play the game\b/i,
  /\bcannot .*produce .*playtest(?:ing)? report\b/i,
  /\bwithout (?:the|those|these) tools\b/i,
];

function ratingPattern(label: string): RegExp {
  return new RegExp(
    [
      `\\b${label}\\b[\\s\\S]{0,80}\\b[1-5]\\s*(?:\\/\\s*5)?\\b`,
      `\\b[1-5]\\s*\\/\\s*5\\b[\\s\\S]{0,40}\\b${label}\\b`,
    ].join("|"),
    "i",
  );
}

const REQUIRED_REPORT_PATTERNS: ReadonlyArray<[RegExp, string]> = [
  [/\bPlaythrough log\b/i, "missing Playthrough log section"],
  [/\bVerdict\b/i, "missing Verdict section"],
  [ratingPattern("clarity"), "missing clarity rating"],
  [ratingPattern("enjoyment"), "missing enjoyment rating"],
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
  // The structured exit interview is mandatory: prose sections keep the
  // report human-readable, but only the validated JSON block lets the dev
  // loop RANK feedback (sort by clarity, aggregate S3+ bugs) instead of
  // re-reading markdown. No valid interview ⇒ the playtest doesn't count.
  const interview = extractExitInterview(text);
  if (!interview.ok) {
    return { ok: false, reason: interview.reason };
  }
  return { ok: true, interview: interview.interview };
}

export function verifyBlindReportFile(path: string): BlindReportVerification {
  return verifyBlindReportText(readFileSync(path, "utf8"));
}
