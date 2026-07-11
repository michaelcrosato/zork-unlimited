import { readFileSync } from "node:fs";
import { isDeepStrictEqual } from "node:util";
import {
  extractExitInterview,
  isPureExitInterviewV2,
  isStructuralExitInterviewV2,
  type ExitInterview,
} from "./exit_interview.js";
import {
  parseRunEvidenceJsonl,
  type BlindRunSidecar,
  type PureBlindRunSidecar,
  type StructuralBlindRunSidecar,
} from "./run_evidence.js";

export type RequiredBlindPlayMode = "pure" | "structural";

export interface BlindReportVerificationOptions {
  requiredPlayMode?: RequiredBlindPlayMode;
  /** Raw private JSONL emitted by the MCP server for this run. */
  runEvidenceText?: string;
  /** Previously verified durable sidecar, used by fleet resume/re-verification. */
  runSidecar?: BlindRunSidecar;
}

export type BlindReportVerification =
  | { ok: true; interview: ExitInterview; run: BlindRunSidecar | null }
  | { ok: false; reason: string };

const MCP_FAILURE_PATTERNS: ReadonlyArray<RegExp> = [
  /\badventureforge\b[\s\S]{0,80}\bMCP server has failed to connect\b/i,
  /\bMCP server has failed to connect\b/i,
  /\bMCP server (?:hasn'?t|has not) finished connecting\b/i,
  /\b(?:adventureforge|MCP server|ToolSearch|tools)\b[\s\S]{0,120}\bstill connecting\b/i,
  /\bstill connecting\b[\s\S]{0,120}\b(?:adventureforge|MCP server|ToolSearch|tools)\b/i,
  /\btools never became available\b/i,
  /\btools (?:are|were) not (?:yet )?available\b/i,
  /\b(?:required\s+)?(?:deferred\s+)?AdventureForge tools did not load\b/i,
  /\bRequired AdventureForge MCP tools are unavailable\b/i,
  /\bToolSearch returned 0 tools\b/i,
  /\bToolSearch\b[\s\S]{0,120}\b(?:returned|found)\s+(?:0|zero)\s+(?:tools|matches|results)\b/i,
  /\bToolSearch\b[\s\S]{0,80}\bzero results\b/i,
  /\bToolSearch\b[\s\S]{0,120}\bevery query returns nothing\b/i,
  /\bevery query returns nothing[\s\S]{0,120}\bToolSearch\b/i,
  /\bno (?:callable )?mcp__adventureforge__\*? tools? (?:are |were )?available\b/i,
  /\bno mcp__adventureforge__\*? calls? (?:are |were )?available\b/i,
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

function verifyPureRun(
  interview: ExitInterview,
  options: BlindReportVerificationOptions,
): BlindReportVerification {
  if (!isPureExitInterviewV2(interview)) {
    return {
      ok: false,
      reason: "pure blind runs require a V2 pure/fresh_overworld exit interview",
    };
  }

  let sidecar: PureBlindRunSidecar;
  if (options.runEvidenceText !== undefined) {
    const evidence = parseRunEvidenceJsonl(options.runEvidenceText);
    if (!evidence.ok) return { ok: false, reason: evidence.reason };
    sidecar = evidence.sidecar;
  } else if (options.runSidecar?.play_mode === "pure") {
    sidecar = options.runSidecar;
  } else {
    return {
      ok: false,
      reason: "pure blind runs require verified fresh_start + journey_exit run evidence",
    };
  }

  if (!isDeepStrictEqual(interview.journey_exit_receipt, sidecar.receipt)) {
    return {
      ok: false,
      reason: "exit interview journey_exit_receipt does not match server run evidence",
    };
  }
  return { ok: true, interview, run: sidecar };
}

function verifyStructuralRun(
  interview: ExitInterview,
  options: BlindReportVerificationOptions,
): BlindReportVerification {
  if (!isStructuralExitInterviewV2(interview)) {
    return {
      ok: false,
      reason: "structural blind runs require a V2 structural exit interview",
    };
  }
  const generated: StructuralBlindRunSidecar = {
    schema_version: 1,
    report_schema_version: 2,
    play_mode: "structural",
    start_surface: interview.start_surface,
    retention_eligible: false,
    evidence_status: "not_applicable",
    structural_kind: interview.structural_kind,
  };
  if (options.runSidecar !== undefined && !isDeepStrictEqual(options.runSidecar, generated)) {
    return { ok: false, reason: "structural report metadata does not match its run sidecar" };
  }
  return { ok: true, interview, run: generated };
}

export function verifyBlindReportText(
  text: string,
  options: BlindReportVerificationOptions = {},
): BlindReportVerification {
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
  if (options.requiredPlayMode === "pure") {
    return verifyPureRun(interview.interview, options);
  }
  if (options.requiredPlayMode === "structural") {
    return verifyStructuralRun(interview.interview, options);
  }
  return { ok: true, interview: interview.interview, run: null };
}

export function verifyBlindReportFile(
  path: string,
  options: BlindReportVerificationOptions = {},
): BlindReportVerification {
  return verifyBlindReportText(readFileSync(path, "utf8"), options);
}
