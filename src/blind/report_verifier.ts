import { readFileSync } from "node:fs";

export type BlindReportVerification = { ok: true } | { ok: false; reason: string };

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
  return { ok: true };
}

export function verifyBlindReportFile(path: string): BlindReportVerification {
  return verifyBlindReportText(readFileSync(path, "utf8"));
}
