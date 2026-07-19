import { z } from "zod";
import { PureRunBuildSchema } from "../blind/run_evidence.js";
import { CertifiedCodexModelSchema } from "./fleet_run_artifacts.js";

export const PURE_FLEET_ATTESTATION_SCHEMA_VERSION = 2;
export const PURE_FLEET_CODEX_ATTESTATION_SCHEMA_VERSION = 3;

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

export const PureFleetCodexAttestationSchema = z
  .object({
    schema_version: z.literal(PURE_FLEET_CODEX_ATTESTATION_SCHEMA_VERSION),
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
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, reason: "pure fleet attestation is not valid JSON" };
  }
  const parsed = PureFleetAttestationSchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      ok: false,
      reason: `pure fleet attestation invalid: ${issue?.path.join(".") ?? "?"} — ${issue?.message ?? "schema mismatch"}`,
    };
  }
  return { ok: true, attestation: parsed.data };
}
