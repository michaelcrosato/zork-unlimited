import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import { verifyBlindReportText } from "../blind/report_verifier.js";
import {
  PureReportRecoveryMetadataSchema,
  extractRecoveredReport,
} from "../blind/report_recovery.js";
import {
  parseBlindRunSidecar,
  parseRunEvidenceJsonl,
  PureRunBuildSchema,
  type PureBlindRunSidecar,
} from "../blind/run_evidence.js";

const HASH_PATTERN = /^[0-9a-f]{64}$/;

export const PureFleetPrimaryClaudeEnvelopeSchema = z
  .object({
    type: z.literal("result"),
    subtype: z.literal("success"),
    is_error: z.literal(false),
    session_id: z.string().uuid(),
    result: z.string(),
    stop_reason: z.literal("end_turn"),
    terminal_reason: z.literal("completed"),
    permission_denials: z.array(z.unknown()).length(0),
    modelUsage: z.record(z.unknown()),
  })
  .passthrough();

export interface PureFleetRunArtifactBytes {
  report: Uint8Array;
  runSidecar: Uint8Array;
  runEvidence: Uint8Array;
  primaryEnvelope: Uint8Array;
  initialReport: Uint8Array | null;
  recoveryMetadata: Uint8Array | null;
  recoveryEnvelope: Uint8Array | null;
}

export interface PureFleetRunArtifactPaths {
  report: string;
  runSidecar: string;
  runEvidence: string;
  primaryEnvelope: string;
  initialReport: string;
  recoveryMetadata: string;
  recoveryEnvelope: string;
}

export function pureFleetRunArtifactPaths(reportPath: string): PureFleetRunArtifactPaths {
  const prefix = reportPath.endsWith(".md") ? reportPath.slice(0, -".md".length) : reportPath;
  return {
    report: reportPath,
    runSidecar: `${prefix}.run.json`,
    runEvidence: `${prefix}.evidence.jsonl`,
    primaryEnvelope: `${prefix}.json`,
    initialReport: `${prefix}.initial-report.txt`,
    recoveryMetadata: `${prefix}.repair.meta.json`,
    recoveryEnvelope: `${prefix}.repair.json`,
  };
}

export interface PureFleetRunArtifactExpectation {
  seed: number;
  model: "haiku" | "sonnet" | "opus";
  build: z.infer<typeof PureRunBuildSchema> & { tracked_worktree_clean: true };
}

export interface PureFleetRunArtifactHashes {
  report_sha256: string;
  run_sidecar_sha256: string;
  run_evidence_sha256: string;
  primary_envelope_sha256: string;
  initial_report_sha256: string | null;
  recovery_metadata_sha256: string | null;
  recovery_envelope_sha256: string | null;
}

export interface PureFleetRunArtifactFacts {
  run: Extract<PureBlindRunSidecar, { schema_version: 2 }>;
  game_session_id: string;
  claude_session_id: string;
  actual_model: string;
  report_recovered: boolean;
  hashes: PureFleetRunArtifactHashes;
}

export type PureFleetRunArtifactValidation =
  | { ok: true; facts: PureFleetRunArtifactFacts }
  | { ok: false; reason: string };

const decoder = new TextDecoder("utf-8", { fatal: true });

function decodeUtf8(
  bytes: Uint8Array,
  label: string,
): { ok: true; text: string } | { ok: false; reason: string } {
  try {
    return { ok: true, text: decoder.decode(bytes) };
  } catch {
    return { ok: false, reason: `${label} is not valid UTF-8` };
  }
}

export function sha256ArtifactBytes(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function singletonModelUsageKey(
  modelUsage: Record<string, unknown>,
): { ok: true; key: string } | { ok: false; reason: string } {
  const keys = Object.keys(modelUsage);
  return keys.length === 1
    ? { ok: true, key: keys[0]! }
    : {
        ok: false,
        reason: `primary Claude modelUsage must contain exactly one model (found ${keys.length})`,
      };
}

export function pureFleetModelMatchesRequest(actual: string, requested: string): boolean {
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
      envelope: z.infer<typeof PureFleetPrimaryClaudeEnvelopeSchema>;
      actualModel: string;
    }
  | { ok: false; reason: string } {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, reason: "primary Claude envelope is not valid JSON" };
  }
  const parsed = PureFleetPrimaryClaudeEnvelopeSchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      ok: false,
      reason: `primary Claude envelope is not a completed clean turn: ${issue?.path.join(".") ?? "?"} — ${issue?.message ?? "schema mismatch"}`,
    };
  }
  const model = singletonModelUsageKey(parsed.data.modelUsage);
  if (!model.ok) return model;
  if (!pureFleetModelMatchesRequest(model.key, requestedModel)) {
    return {
      ok: false,
      reason: `primary Claude model ${model.key} does not match planned model ${requestedModel}`,
    };
  }
  return { ok: true, envelope: parsed.data, actualModel: model.key };
}

function bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
  return left.byteLength === right.byteLength && left.every((byte, index) => byte === right[index]);
}

function exactUtf8Bytes(text: string): Uint8Array {
  return Buffer.from(text, "utf8");
}

function artifactHashes(input: PureFleetRunArtifactBytes): PureFleetRunArtifactHashes {
  return {
    report_sha256: sha256ArtifactBytes(input.report),
    run_sidecar_sha256: sha256ArtifactBytes(input.runSidecar),
    run_evidence_sha256: sha256ArtifactBytes(input.runEvidence),
    primary_envelope_sha256: sha256ArtifactBytes(input.primaryEnvelope),
    initial_report_sha256:
      input.initialReport === null ? null : sha256ArtifactBytes(input.initialReport),
    recovery_metadata_sha256:
      input.recoveryMetadata === null ? null : sha256ArtifactBytes(input.recoveryMetadata),
    recovery_envelope_sha256:
      input.recoveryEnvelope === null ? null : sha256ArtifactBytes(input.recoveryEnvelope),
  };
}

export function validatePureFleetRunArtifactBytes(
  input: PureFleetRunArtifactBytes,
  expected: PureFleetRunArtifactExpectation,
): PureFleetRunArtifactValidation {
  const decoded = {
    report: decodeUtf8(input.report, "report"),
    runSidecar: decodeUtf8(input.runSidecar, "run sidecar"),
    runEvidence: decodeUtf8(input.runEvidence, "run evidence"),
    primaryEnvelope: decodeUtf8(input.primaryEnvelope, "primary Claude envelope"),
  };
  if (!decoded.report.ok) return decoded.report;
  if (!decoded.runSidecar.ok) return decoded.runSidecar;
  if (!decoded.runEvidence.ok) return decoded.runEvidence;
  if (!decoded.primaryEnvelope.ok) return decoded.primaryEnvelope;

  const parsedSidecar = parseBlindRunSidecar(decoded.runSidecar.text);
  if (!parsedSidecar.ok) return parsedSidecar;
  if (parsedSidecar.sidecar.play_mode !== "pure" || parsedSidecar.sidecar.schema_version !== 2) {
    return { ok: false, reason: "run sidecar is not current pure evidence schema v2" };
  }
  const run = parsedSidecar.sidecar;
  const parsedEvidence = parseRunEvidenceJsonl(decoded.runEvidence.text);
  if (!parsedEvidence.ok) return { ok: false, reason: parsedEvidence.reason };
  if (parsedEvidence.sidecar.schema_version !== 2) {
    return { ok: false, reason: "raw run evidence is not current schema v2" };
  }
  if (!isDeepStrictEqual(parsedEvidence.sidecar, run)) {
    return { ok: false, reason: "raw run evidence does not reproduce the adjacent run sidecar" };
  }
  if (run.run_seed !== expected.seed) {
    return { ok: false, reason: "run evidence seed does not match the planned slot" };
  }
  if (!isDeepStrictEqual(run.build, expected.build)) {
    return { ok: false, reason: "run evidence build does not match the frozen fleet build" };
  }

  const reportVerification = verifyBlindReportText(decoded.report.text, {
    requiredPlayMode: "pure",
    runSidecar: run,
  });
  if (!reportVerification.ok) {
    return { ok: false, reason: `report verification failed: ${reportVerification.reason}` };
  }

  const primary = parsePrimaryEnvelope(decoded.primaryEnvelope.text, expected.model);
  if (!primary.ok) return primary;

  const recoveryPresence = [
    input.initialReport !== null,
    input.recoveryMetadata !== null,
    input.recoveryEnvelope !== null,
  ];
  const recoveryCount = recoveryPresence.filter(Boolean).length;
  if (recoveryCount !== 0 && recoveryCount !== recoveryPresence.length) {
    return {
      ok: false,
      reason: "report recovery artifacts must be either all absent or all present",
    };
  }
  const reportRecovered = recoveryCount === recoveryPresence.length;

  if (!reportRecovered) {
    if (!bytesEqual(input.report, exactUtf8Bytes(primary.envelope.result))) {
      return { ok: false, reason: "primary Claude result bytes do not equal the final report" };
    }
  } else {
    const decodedInitial = decodeUtf8(input.initialReport!, "initial report");
    const decodedMetadata = decodeUtf8(input.recoveryMetadata!, "recovery metadata");
    const decodedRecovery = decodeUtf8(input.recoveryEnvelope!, "recovery Claude envelope");
    if (!decodedInitial.ok) return decodedInitial;
    if (!decodedMetadata.ok) return decodedMetadata;
    if (!decodedRecovery.ok) return decodedRecovery;
    if (!bytesEqual(input.initialReport!, exactUtf8Bytes(primary.envelope.result))) {
      return { ok: false, reason: "primary Claude result bytes do not equal the initial report" };
    }
    let rawMetadata: unknown;
    try {
      rawMetadata = JSON.parse(decodedMetadata.text);
    } catch {
      return { ok: false, reason: "report recovery metadata is not valid JSON" };
    }
    const parsedMetadata = PureReportRecoveryMetadataSchema.safeParse(rawMetadata);
    if (!parsedMetadata.success) {
      return { ok: false, reason: "report recovery metadata does not match its strict schema" };
    }
    const metadata = parsedMetadata.data;
    if (
      metadata.requested_model !== expected.model ||
      metadata.claude_session_id !== primary.envelope.session_id ||
      metadata.model_usage_key !== primary.actualModel ||
      metadata.run_seed !== expected.seed ||
      !isDeepStrictEqual(metadata.build, expected.build)
    ) {
      return { ok: false, reason: "report recovery metadata differs from the planned primary run" };
    }
    const recovered = extractRecoveredReport({
      recoveryEnvelopeBytes: input.recoveryEnvelope!,
      primaryEnvelopeBytes: input.primaryEnvelope,
      originalReportBytes: input.initialReport!,
      runEvidenceBytes: input.runEvidence,
      metadata,
    });
    if (!recovered.ok) return recovered;
    if (!bytesEqual(input.report, recovered.reportBytes)) {
      return { ok: false, reason: "final report is not the deterministic recovered report" };
    }
  }

  const hashes = artifactHashes(input);
  for (const hash of Object.values(hashes)) {
    if (hash !== null && !HASH_PATTERN.test(hash)) {
      return { ok: false, reason: "artifact hashing produced an invalid digest" };
    }
  }
  return {
    ok: true,
    facts: {
      run,
      game_session_id: run.session_id,
      claude_session_id: primary.envelope.session_id,
      actual_model: primary.actualModel,
      report_recovered: reportRecovered,
      hashes,
    },
  };
}
