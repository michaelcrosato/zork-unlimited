import { z } from "zod";
import { PureRunBuildSchema } from "../blind/run_evidence.js";
import { parseJsonRejectingDuplicateKeys } from "../blind/strict_json.js";
import { CertifiedCodexModelSchema } from "./fleet_run_artifacts.js";

export const PURE_FLEET_ATTESTATION_SCHEMA_VERSION = 2;
export const HISTORICAL_PURE_FLEET_CODEX_ATTESTATION_SCHEMA_VERSION = 3;
export const HISTORICAL_RECEIPT_BOUND_CODEX_ATTESTATION_SCHEMA_VERSION = 4;
export const HISTORICAL_STRICT_CODEX_ATTESTATION_SCHEMA_VERSION = 5;
export const PURE_FLEET_CODEX_ATTESTATION_SCHEMA_VERSION = 6;
export const HISTORICAL_PURE_FLEET_CODE_MODE_CONTRACT = "strict-code-mode-v1" as const;
export const PURE_FLEET_CODE_MODE_CONTRACT = "strict-code-mode-v2" as const;

export const PureFleetClaudeAttestationSchema = z
  .object({
    schema_version: z.literal(PURE_FLEET_ATTESTATION_SCHEMA_VERSION),
    run_seed: z.number().int().safe(),
    model: z.enum(["haiku", "sonnet", "opus"]),
    persona: z.literal("default"),
    target: z.literal("overworld"),
    play_mode: z.literal("pure"),
    start_surface: z.literal("fresh_overworld"),
    build: PureRunBuildSchema.extend({ tracked_worktree_clean: z.literal(true) }),
    game_session_id: z.string().min(1),
    claude_session_id: z.string().uuid(),
    actual_model: z.string().min(1),
    report_recovered: z.boolean(),
    receipt_hash: z.string().regex(/^[0-9a-f]{64}$/),
    report_sha256: z.string().regex(/^[0-9a-f]{64}$/),
    run_sidecar_sha256: z.string().regex(/^[0-9a-f]{64}$/),
    run_evidence_sha256: z.string().regex(/^[0-9a-f]{64}$/),
    primary_envelope_sha256: z.string().regex(/^[0-9a-f]{64}$/),
    initial_report_sha256: z
      .string()
      .regex(/^[0-9a-f]{64}$/)
      .nullable(),
    recovery_metadata_sha256: z
      .string()
      .regex(/^[0-9a-f]{64}$/)
      .nullable(),
    recovery_envelope_sha256: z
      .string()
      .regex(/^[0-9a-f]{64}$/)
      .nullable(),
  })
  .strict();

const HistoricalPureFleetCodexAttestationSchema = z
  .object({
    schema_version: z.literal(HISTORICAL_PURE_FLEET_CODEX_ATTESTATION_SCHEMA_VERSION),
    provider: z.literal("codex"),
    run_seed: z.number().int().safe(),
    model: CertifiedCodexModelSchema,
    persona: z.literal("default"),
    target: z.literal("overworld"),
    play_mode: z.literal("pure"),
    start_surface: z.literal("fresh_overworld"),
    build: PureRunBuildSchema.extend({ tracked_worktree_clean: z.literal(true) }),
    game_session_id: z.string().min(1),
    provider_session_id: z.string().uuid(),
    actual_provider: z.literal("openai"),
    actual_model: CertifiedCodexModelSchema,
    reasoning_effort: z.literal("xhigh"),
    provider_turn_id: z.string().uuid(),
    provider_cwd: z.string().min(1),
    report_recovered: z.literal(false),
    receipt_hash: z.string().regex(/^[0-9a-f]{64}$/),
    report_sha256: z.string().regex(/^[0-9a-f]{64}$/),
    run_sidecar_sha256: z.string().regex(/^[0-9a-f]{64}$/),
    run_evidence_sha256: z.string().regex(/^[0-9a-f]{64}$/),
    primary_envelope_sha256: z.string().regex(/^[0-9a-f]{64}$/),
    provider_events_sha256: z.string().regex(/^[0-9a-f]{64}$/),
    provider_rollout_sha256: z.string().regex(/^[0-9a-f]{64}$/),
    provider_capture_sha256: z.string().regex(/^[0-9a-f]{64}$/),
    initial_report_sha256: z.null(),
    recovery_metadata_sha256: z.null(),
    recovery_envelope_sha256: z.null(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.actual_model !== value.model) {
      context.addIssue({
        code: "custom",
        path: ["actual_model"],
        message: "actual Codex rollout model must equal the exact planned model",
      });
    }
  });

const HistoricalReceiptBoundPureFleetCodexAttestationSchema = z
  .object({
    schema_version: z.literal(HISTORICAL_RECEIPT_BOUND_CODEX_ATTESTATION_SCHEMA_VERSION),
    provider: z.literal("codex"),
    run_seed: z.number().int().safe(),
    model: CertifiedCodexModelSchema,
    persona: z.literal("default"),
    target: z.literal("overworld"),
    play_mode: z.literal("pure"),
    start_surface: z.literal("fresh_overworld"),
    build: PureRunBuildSchema.extend({ tracked_worktree_clean: z.literal(true) }),
    game_session_id: z.string().min(1),
    provider_session_id: z.string().uuid(),
    actual_provider: z.literal("openai"),
    actual_model: CertifiedCodexModelSchema,
    reasoning_effort: z.literal("xhigh"),
    provider_turn_id: z.string().uuid(),
    provider_cwd: z.string().min(1),
    report_recovered: z.literal(false),
    report_receipt_bound: z.boolean(),
    receipt_hash: z.string().regex(/^[0-9a-f]{64}$/),
    report_sha256: z.string().regex(/^[0-9a-f]{64}$/),
    run_sidecar_sha256: z.string().regex(/^[0-9a-f]{64}$/),
    run_evidence_sha256: z.string().regex(/^[0-9a-f]{64}$/),
    primary_envelope_sha256: z.string().regex(/^[0-9a-f]{64}$/),
    provider_events_sha256: z.string().regex(/^[0-9a-f]{64}$/),
    provider_rollout_sha256: z.string().regex(/^[0-9a-f]{64}$/),
    provider_capture_sha256: z.string().regex(/^[0-9a-f]{64}$/),
    initial_report_sha256: z
      .string()
      .regex(/^[0-9a-f]{64}$/)
      .nullable(),
    receipt_binding_sha256: z
      .string()
      .regex(/^[0-9a-f]{64}$/)
      .nullable(),
    recovery_metadata_sha256: z.null(),
    recovery_envelope_sha256: z.null(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.actual_model !== value.model) {
      context.addIssue({
        code: "custom",
        path: ["actual_model"],
        message: "actual Codex rollout model must equal the exact planned model",
      });
    }
    if (
      value.report_receipt_bound !==
      (value.initial_report_sha256 !== null && value.receipt_binding_sha256 !== null)
    ) {
      context.addIssue({
        code: "custom",
        path: ["report_receipt_bound"],
        message: "receipt-bound status must match its original report and binding metadata hashes",
      });
    }
    if ((value.initial_report_sha256 === null) !== (value.receipt_binding_sha256 === null)) {
      context.addIssue({
        code: "custom",
        path: ["receipt_binding_sha256"],
        message: "receipt-binding artifact hashes must be both present or both absent",
      });
    }
  });

const HistoricalStrictPureFleetCodexAttestationSchema = z
  .object({
    schema_version: z.literal(HISTORICAL_STRICT_CODEX_ATTESTATION_SCHEMA_VERSION),
    provider: z.literal("codex"),
    code_mode_contract: z.literal(HISTORICAL_PURE_FLEET_CODE_MODE_CONTRACT),
    run_seed: z.number().int().safe(),
    model: CertifiedCodexModelSchema,
    persona: z.literal("default"),
    target: z.literal("overworld"),
    play_mode: z.literal("pure"),
    start_surface: z.literal("fresh_overworld"),
    build: PureRunBuildSchema.extend({ tracked_worktree_clean: z.literal(true) }),
    game_session_id: z.string().min(1),
    provider_session_id: z.string().uuid(),
    actual_provider: z.literal("openai"),
    actual_model: CertifiedCodexModelSchema,
    reasoning_effort: z.literal("xhigh"),
    provider_turn_id: z.string().uuid(),
    provider_cwd: z.string().min(1),
    report_recovered: z.literal(false),
    report_receipt_bound: z.boolean(),
    receipt_hash: z.string().regex(/^[0-9a-f]{64}$/),
    report_sha256: z.string().regex(/^[0-9a-f]{64}$/),
    run_sidecar_sha256: z.string().regex(/^[0-9a-f]{64}$/),
    run_evidence_sha256: z.string().regex(/^[0-9a-f]{64}$/),
    primary_envelope_sha256: z.string().regex(/^[0-9a-f]{64}$/),
    provider_events_sha256: z.string().regex(/^[0-9a-f]{64}$/),
    provider_rollout_sha256: z.string().regex(/^[0-9a-f]{64}$/),
    provider_capture_sha256: z.string().regex(/^[0-9a-f]{64}$/),
    initial_report_sha256: z
      .string()
      .regex(/^[0-9a-f]{64}$/)
      .nullable(),
    receipt_binding_sha256: z
      .string()
      .regex(/^[0-9a-f]{64}$/)
      .nullable(),
    recovery_metadata_sha256: z.null(),
    recovery_envelope_sha256: z.null(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.actual_model !== value.model) {
      context.addIssue({
        code: "custom",
        path: ["actual_model"],
        message: "actual Codex rollout model must equal the exact planned model",
      });
    }
    if (
      value.report_receipt_bound !==
      (value.initial_report_sha256 !== null && value.receipt_binding_sha256 !== null)
    ) {
      context.addIssue({
        code: "custom",
        path: ["report_receipt_bound"],
        message: "receipt-bound status must match its original report and binding metadata hashes",
      });
    }
    if ((value.initial_report_sha256 === null) !== (value.receipt_binding_sha256 === null)) {
      context.addIssue({
        code: "custom",
        path: ["receipt_binding_sha256"],
        message: "receipt-binding artifact hashes must be both present or both absent",
      });
    }
  });

const CurrentPureFleetCodexAttestationSchema = z
  .object({
    schema_version: z.literal(PURE_FLEET_CODEX_ATTESTATION_SCHEMA_VERSION),
    provider: z.literal("codex"),
    code_mode_contract: z.literal(PURE_FLEET_CODE_MODE_CONTRACT),
    run_seed: z.number().int().safe(),
    model: CertifiedCodexModelSchema,
    persona: z.literal("default"),
    target: z.literal("overworld"),
    play_mode: z.literal("pure"),
    start_surface: z.literal("fresh_overworld"),
    build: PureRunBuildSchema.extend({ tracked_worktree_clean: z.literal(true) }),
    game_session_id: z.string().min(1),
    provider_session_id: z.string().uuid(),
    actual_provider: z.literal("openai"),
    actual_model: CertifiedCodexModelSchema,
    reasoning_effort: z.literal("xhigh"),
    provider_turn_id: z.string().uuid(),
    provider_cwd: z.string().min(1),
    report_recovered: z.literal(false),
    report_receipt_bound: z.boolean(),
    receipt_hash: z.string().regex(/^[0-9a-f]{64}$/),
    report_sha256: z.string().regex(/^[0-9a-f]{64}$/),
    run_sidecar_sha256: z.string().regex(/^[0-9a-f]{64}$/),
    run_evidence_sha256: z.string().regex(/^[0-9a-f]{64}$/),
    primary_envelope_sha256: z.string().regex(/^[0-9a-f]{64}$/),
    provider_events_sha256: z.string().regex(/^[0-9a-f]{64}$/),
    provider_rollout_sha256: z.string().regex(/^[0-9a-f]{64}$/),
    provider_capture_sha256: z.string().regex(/^[0-9a-f]{64}$/),
    initial_report_sha256: z
      .string()
      .regex(/^[0-9a-f]{64}$/)
      .nullable(),
    receipt_binding_sha256: z
      .string()
      .regex(/^[0-9a-f]{64}$/)
      .nullable(),
    recovery_metadata_sha256: z.null(),
    recovery_envelope_sha256: z.null(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.actual_model !== value.model) {
      context.addIssue({
        code: "custom",
        path: ["actual_model"],
        message: "actual Codex rollout model must equal the exact planned model",
      });
    }
    if (
      value.report_receipt_bound !==
      (value.initial_report_sha256 !== null && value.receipt_binding_sha256 !== null)
    ) {
      context.addIssue({
        code: "custom",
        path: ["report_receipt_bound"],
        message: "receipt-bound status must match its original report and binding metadata hashes",
      });
    }
    if ((value.initial_report_sha256 === null) !== (value.receipt_binding_sha256 === null)) {
      context.addIssue({
        code: "custom",
        path: ["receipt_binding_sha256"],
        message: "receipt-binding artifact hashes must be both present or both absent",
      });
    }
  });

export const PureFleetCodexAttestationSchema = z.union([
  HistoricalPureFleetCodexAttestationSchema,
  HistoricalReceiptBoundPureFleetCodexAttestationSchema,
  HistoricalStrictPureFleetCodexAttestationSchema,
  CurrentPureFleetCodexAttestationSchema,
]);

export const PureFleetAttestationSchema = z.union([
  PureFleetClaudeAttestationSchema,
  PureFleetCodexAttestationSchema,
]);

export type PureFleetAttestation = z.infer<typeof PureFleetAttestationSchema>;

export function pureFleetAttestationPathFor(reportMarkdownPath: string): string {
  return reportMarkdownPath.endsWith(".md")
    ? `${reportMarkdownPath.slice(0, -".md".length)}.fleet.json`
    : `${reportMarkdownPath}.fleet.json`;
}

export function parsePureFleetAttestation(
  text: string,
): { ok: true; attestation: PureFleetAttestation } | { ok: false; reason: string } {
  const raw = parseJsonRejectingDuplicateKeys(text, "pure fleet attestation");
  if (!raw.ok) return raw;
  const parsed = PureFleetAttestationSchema.safeParse(raw.value);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      ok: false,
      reason: `pure fleet attestation invalid: ${issue?.path.join(".") ?? "?"} — ${issue?.message ?? "schema mismatch"}`,
    };
  }
  return { ok: true, attestation: parsed.data };
}
