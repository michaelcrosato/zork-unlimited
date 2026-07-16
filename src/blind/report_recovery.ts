import { createHash } from "node:crypto";
import { Buffer } from "node:buffer";
import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import { SubjectiveExitInterviewSchema } from "./exit_interview.js";
import { verifyBlindReportText } from "./report_verifier.js";
import { parseRunEvidenceJsonl, PureRunBuildSchema } from "./run_evidence.js";

const ModelUsageSchema = z.record(z.unknown());

const PrimaryClaudeEnvelopeSchema = z
  .object({
    type: z.literal("result"),
    subtype: z.literal("success"),
    is_error: z.literal(false),
    session_id: z.string().uuid(),
    result: z.string(),
    stop_reason: z.literal("end_turn"),
    terminal_reason: z.literal("completed"),
    permission_denials: z.array(z.unknown()).length(0),
    modelUsage: ModelUsageSchema,
  })
  .passthrough();

const RecoveryClaudeEnvelopeSchema = z
  .object({
    type: z.literal("result"),
    subtype: z.literal("success"),
    is_error: z.literal(false),
    session_id: z.string().uuid(),
    result: z.string(),
    structured_output: z.unknown(),
    stop_reason: z.literal("tool_use"),
    terminal_reason: z.literal("completed"),
    permission_denials: z.array(z.unknown()).length(0),
    modelUsage: ModelUsageSchema,
  })
  .passthrough();

const RatingSchema = z
  .object({ clarity: z.number().int().min(1).max(5), enjoyment: z.number().int().min(1).max(5) })
  .strict();

export const PureReportRecoveryMetadataSchema = z
  .object({
    schema_version: z.literal(1),
    recovery_count: z.literal(1),
    claude_session_id: z.string().uuid(),
    requested_model: z.string().min(1),
    model_usage_key: z.string().min(1),
    run_seed: z.number().int().safe(),
    build: PureRunBuildSchema,
    ratings: RatingSchema,
    initial_report_sha256: z.string().regex(/^[0-9a-f]{64}$/),
    primary_envelope_sha256: z.string().regex(/^[0-9a-f]{64}$/),
    run_evidence_sha256: z.string().regex(/^[0-9a-f]{64}$/),
  })
  .strict();

export type PureReportRecoveryMetadata = z.infer<typeof PureReportRecoveryMetadataSchema>;

export interface PureReportRecoveryInput {
  playMode: string;
  agentExitStatus: number;
  verifierExitStatus: number;
  attempt: number;
  requestedModel: string;
  expectedRunSeed: number;
  expectedGitCommit: string;
  expectedTrackedWorktreeClean: boolean;
  claudeEnvelopeBytes: Uint8Array;
  runEvidenceBytes: Uint8Array;
  reportBytes: Uint8Array;
}

export type PureReportRecoveryDecision =
  | {
      ok: true;
      metadata: PureReportRecoveryMetadata;
      prompt: string;
    }
  | {
      ok: false;
      reason: string;
    };

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function exactUtf8(
  bytes: Uint8Array,
  label: string,
): { ok: true; text: string } | { ok: false; reason: string } {
  const raw = Buffer.from(bytes);
  const text = raw.toString("utf8");
  if (!Buffer.from(text, "utf8").equals(raw)) {
    return { ok: false, reason: `${label} is not canonical UTF-8` };
  }
  return { ok: true, text };
}

function singletonModelUsageKey(
  modelUsage: Record<string, unknown>,
): { ok: true; key: string } | { ok: false; reason: string } {
  const keys = Object.keys(modelUsage);
  return keys.length === 1
    ? { ok: true, key: keys[0]! }
    : {
        ok: false,
        reason: `Claude modelUsage must contain exactly one model (found ${keys.length})`,
      };
}

function modelMatchesRequest(actual: string, requested: string): boolean {
  const normalized = requested.toLowerCase();
  if (["haiku", "sonnet", "opus"].includes(normalized)) {
    return actual.toLowerCase().split("-").includes(normalized);
  }
  return actual === requested;
}

function parsePrimaryEnvelope(
  text: string,
  requestedModel: string,
):
  | {
      ok: true;
      envelope: z.infer<typeof PrimaryClaudeEnvelopeSchema>;
      modelUsageKey: string;
    }
  | { ok: false; reason: string } {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, reason: "primary Claude result envelope is not valid JSON" };
  }
  const parsed = PrimaryClaudeEnvelopeSchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      ok: false,
      reason: `primary Claude envelope is not a completed resumable turn: ${issue?.path.join(".") ?? "?"} — ${issue?.message ?? "schema mismatch"}`,
    };
  }
  const model = singletonModelUsageKey(parsed.data.modelUsage);
  if (!model.ok) return model;
  if (!modelMatchesRequest(model.key, requestedModel)) {
    return {
      ok: false,
      reason: `primary Claude model ${model.key} does not match requested model ${requestedModel}`,
    };
  }
  return { ok: true, envelope: parsed.data, modelUsageKey: model.key };
}

function uniqueProseRating(
  report: string,
  label: "clarity" | "enjoyment",
): { ok: true; value: number } | { ok: false; reason: string } {
  const values = new Set<number>();
  const patterns = [
    new RegExp(`\\b${label}\\b[^\\r\\n.;]{0,80}?\\b([1-5])\\s*(?:\\/\\s*5)?\\b`, "gi"),
    new RegExp(`\\b([1-5])\\s*\\/\\s*5\\b[^\\r\\n.;]{0,40}?\\b${label}\\b`, "gi"),
  ];
  for (const pattern of patterns) {
    for (const match of report.matchAll(pattern)) values.add(Number(match[1]));
  }
  if (values.size !== 1) {
    return {
      ok: false,
      reason: `report recovery requires exactly one unambiguous ${label} rating (found ${values.size})`,
    };
  }
  return { ok: true, value: [...values][0]! };
}

export function isRecoverableBlindReportReason(reason: string): boolean {
  return reason === "missing exit interview (a ```json exit-interview fenced block is mandatory)";
}

function recoveryPrompt(ratings: z.infer<typeof RatingSchema>): string {
  return `REPORT-ONLY RECOVERY

The gameplay journey in this same conversation has already ended. Runner-owned private evidence authenticated its exit, but your final Markdown omitted the mandatory structured exit interview.

Do not call any tool. Do not continue, replay, revise, or invent gameplay. Return only one JSON object containing the subjective exit-interview fields listed below. Do not return Markdown and do not include journey_exit_receipt; the runner owns and injects the authenticated receipt. Extract these values faithfully from the report and gameplay already in this conversation.

The report's unique prose ratings are binding: clarity must be ${ratings.clarity} and enjoyment must be ${ratings.enjoyment}.

Required fields: clarity, enjoyment, goal_understood, got_stuck, confusions, bugs, best_moment, worst_moment, would_replay, verdict. Each bug must contain exactly where, severity (S0-S4), and note.
`;
}

/** Authorize one narrowly scoped structured-interview repair. */
export function preparePureReportRecovery(
  input: PureReportRecoveryInput,
): PureReportRecoveryDecision {
  if (input.playMode !== "pure") {
    return { ok: false, reason: "report recovery is available only for pure live runs" };
  }
  if (input.agentExitStatus !== 0) {
    return {
      ok: false,
      reason: `report recovery requires a normally exited Claude run (exit ${input.agentExitStatus})`,
    };
  }
  if (input.verifierExitStatus === 0) {
    return { ok: false, reason: "report recovery requires an initial verifier failure" };
  }
  if (input.attempt !== 0) {
    return { ok: false, reason: "only one report recovery attempt is permitted" };
  }

  const envelopeText = exactUtf8(input.claudeEnvelopeBytes, "primary Claude envelope");
  if (!envelopeText.ok) return envelopeText;
  const runEvidenceText = exactUtf8(input.runEvidenceBytes, "run evidence");
  if (!runEvidenceText.ok) return runEvidenceText;
  const reportText = exactUtf8(input.reportBytes, "original report");
  if (!reportText.ok) return reportText;

  const evidence = parseRunEvidenceJsonl(runEvidenceText.text);
  if (!evidence.ok) {
    return { ok: false, reason: `run evidence is not recovery-eligible: ${evidence.reason}` };
  }
  if (evidence.sidecar.schema_version !== 2) {
    return { ok: false, reason: "report recovery requires current v2 run evidence" };
  }
  if (evidence.sidecar.run_seed !== input.expectedRunSeed) {
    return { ok: false, reason: "run evidence seed does not match the runner launch" };
  }
  if (evidence.sidecar.build.git_commit !== input.expectedGitCommit) {
    return { ok: false, reason: "run evidence commit does not match the runner launch" };
  }
  if (evidence.sidecar.build.tracked_worktree_clean !== input.expectedTrackedWorktreeClean) {
    return { ok: false, reason: "run evidence cleanliness does not match the runner launch" };
  }

  const verification = verifyBlindReportText(reportText.text, {
    requiredPlayMode: "pure",
    runEvidenceText: runEvidenceText.text,
  });
  if (verification.ok) {
    return { ok: false, reason: "the original report passes verification" };
  }
  if (!isRecoverableBlindReportReason(verification.reason)) {
    return {
      ok: false,
      reason: `verifier failure is not the recoverable missing-interview case: ${verification.reason}`,
    };
  }

  const clarity = uniqueProseRating(reportText.text, "clarity");
  if (!clarity.ok) return clarity;
  const enjoyment = uniqueProseRating(reportText.text, "enjoyment");
  if (!enjoyment.ok) return enjoyment;

  const envelope = parsePrimaryEnvelope(envelopeText.text, input.requestedModel);
  if (!envelope.ok) return envelope;
  if (envelope.envelope.result !== reportText.text) {
    return { ok: false, reason: "primary envelope result does not exactly match report bytes" };
  }

  const ratings = { clarity: clarity.value, enjoyment: enjoyment.value };
  return {
    ok: true,
    metadata: {
      schema_version: 1,
      recovery_count: 1,
      claude_session_id: envelope.envelope.session_id,
      requested_model: input.requestedModel,
      model_usage_key: envelope.modelUsageKey,
      run_seed: evidence.sidecar.run_seed,
      build: evidence.sidecar.build,
      ratings,
      initial_report_sha256: sha256(input.reportBytes),
      primary_envelope_sha256: sha256(input.claudeEnvelopeBytes),
      run_evidence_sha256: sha256(input.runEvidenceBytes),
    },
    prompt: recoveryPrompt(ratings),
  };
}

const SUBJECTIVE_KEYS = [
  "clarity",
  "enjoyment",
  "goal_understood",
  "got_stuck",
  "confusions",
  "bugs",
  "best_moment",
  "worst_moment",
  "would_replay",
  "verdict",
] as const;

function parseStrictSubjective(
  value: unknown,
): ReturnType<typeof SubjectiveExitInterviewSchema.safeParse> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return SubjectiveExitInterviewSchema.safeParse(value);
  }
  const keys = Object.keys(value);
  if (keys.length !== SUBJECTIVE_KEYS.length || SUBJECTIVE_KEYS.some((key) => !(key in value))) {
    return SubjectiveExitInterviewSchema.safeParse({ __invalid_recovery_shape: true });
  }
  return SubjectiveExitInterviewSchema.safeParse(value);
}

export function bytesMatchHash(bytes: Uint8Array, expectedSha256: string): boolean {
  return /^[0-9a-f]{64}$/.test(expectedSha256) && sha256(bytes) === expectedSha256;
}

export interface ExtractRecoveredReportInput {
  recoveryEnvelopeBytes: Uint8Array;
  primaryEnvelopeBytes: Uint8Array;
  originalReportBytes: Uint8Array;
  runEvidenceBytes: Uint8Array;
  metadata: PureReportRecoveryMetadata;
}

export type RecoveryEnvelopeResult =
  | { ok: true; reportBytes: Uint8Array }
  | { ok: false; reason: string };

/** Build a final report while preserving every original report byte as its prefix. */
export function extractRecoveredReport(input: ExtractRecoveredReportInput): RecoveryEnvelopeResult {
  const metadataParsed = PureReportRecoveryMetadataSchema.safeParse(input.metadata);
  if (!metadataParsed.success) return { ok: false, reason: "report recovery metadata is invalid" };
  const metadata = metadataParsed.data;
  if (!bytesMatchHash(input.runEvidenceBytes, metadata.run_evidence_sha256)) {
    return { ok: false, reason: "run evidence changed during report recovery" };
  }
  if (!bytesMatchHash(input.originalReportBytes, metadata.initial_report_sha256)) {
    return { ok: false, reason: "original report changed during report recovery" };
  }
  if (!bytesMatchHash(input.primaryEnvelopeBytes, metadata.primary_envelope_sha256)) {
    return { ok: false, reason: "primary Claude envelope changed during report recovery" };
  }

  const recoveryEnvelopeText = exactUtf8(input.recoveryEnvelopeBytes, "report recovery envelope");
  if (!recoveryEnvelopeText.ok) return recoveryEnvelopeText;
  const runEvidenceText = exactUtf8(input.runEvidenceBytes, "run evidence");
  if (!runEvidenceText.ok) return runEvidenceText;
  const originalReportText = exactUtf8(input.originalReportBytes, "original report");
  if (!originalReportText.ok) return originalReportText;

  const evidence = parseRunEvidenceJsonl(runEvidenceText.text);
  if (!evidence.ok || evidence.sidecar.schema_version !== 2) {
    return { ok: false, reason: "current v2 run evidence no longer verifies" };
  }
  if (
    evidence.sidecar.run_seed !== metadata.run_seed ||
    !isDeepStrictEqual(evidence.sidecar.build, metadata.build)
  ) {
    return { ok: false, reason: "run evidence provenance disagrees with recovery metadata" };
  }

  let raw: unknown;
  try {
    raw = JSON.parse(recoveryEnvelopeText.text);
  } catch {
    return { ok: false, reason: "report recovery envelope is not valid JSON" };
  }
  const envelope = RecoveryClaudeEnvelopeSchema.safeParse(raw);
  if (!envelope.success) {
    const issue = envelope.error.issues[0];
    return {
      ok: false,
      reason: `report recovery envelope is not a completed structured turn: ${issue?.path.join(".") ?? "?"} — ${issue?.message ?? "schema mismatch"}`,
    };
  }
  if (envelope.data.session_id !== metadata.claude_session_id) {
    return { ok: false, reason: "report recovery response did not come from the resumed session" };
  }
  const model = singletonModelUsageKey(envelope.data.modelUsage);
  if (!model.ok) return model;
  if (model.key !== metadata.model_usage_key) {
    return { ok: false, reason: "report recovery response used a different actual model" };
  }

  const subjective = parseStrictSubjective(envelope.data.structured_output);
  if (!subjective.success) {
    const issue = subjective.error.issues[0];
    return {
      ok: false,
      reason: `report recovery subjective fields are invalid: ${issue?.path.join(".") ?? "?"} — ${issue?.message ?? "schema mismatch"}`,
    };
  }
  let resultJson: unknown;
  try {
    resultJson = JSON.parse(envelope.data.result);
  } catch {
    return { ok: false, reason: "report recovery result is not valid JSON" };
  }
  if (!isDeepStrictEqual(resultJson, envelope.data.structured_output)) {
    return { ok: false, reason: "report recovery result disagrees with structured_output" };
  }
  if (
    subjective.data.clarity !== metadata.ratings.clarity ||
    subjective.data.enjoyment !== metadata.ratings.enjoyment
  ) {
    return { ok: false, reason: "report recovery ratings do not match the original prose" };
  }

  const provenance = {
    schema_version: 1,
    recovery_count: 1,
    claude_session_id: metadata.claude_session_id,
    model_usage_key: metadata.model_usage_key,
    initial_report_sha256: metadata.initial_report_sha256,
    primary_envelope_sha256: metadata.primary_envelope_sha256,
    run_evidence_sha256: metadata.run_evidence_sha256,
    recovery_envelope_sha256: sha256(input.recoveryEnvelopeBytes),
  } as const;
  const interview = {
    schema_version: 2,
    play_mode: "pure",
    start_surface: "fresh_overworld",
    retention_eligible: true,
    journey_exit_receipt: evidence.sidecar.receipt,
    ...subjective.data,
  } as const;
  const separator = originalReportText.text.endsWith("\n\n")
    ? ""
    : originalReportText.text.endsWith("\n")
      ? "\n"
      : "\n\n";
  const appended = `${separator}<!-- adventureforge-report-recovery ${JSON.stringify(provenance)} -->\n\n## Exit interview\n\n\`\`\`json exit-interview\n${JSON.stringify(interview, null, 2)}\n\`\`\`\n`;
  return {
    ok: true,
    reportBytes: Buffer.concat([
      Buffer.from(input.originalReportBytes),
      Buffer.from(appended, "utf8"),
    ]),
  };
}
