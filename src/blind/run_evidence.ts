import { z } from "zod";
import { JourneyExitReceiptSchema } from "./exit_interview.js";

export const FreshStartRunEvidenceSchema = z
  .object({
    schema_version: z.literal(1),
    play_mode: z.literal("pure"),
    event: z.literal("fresh_start"),
    start_surface: z.literal("fresh_overworld"),
    session_id: z.string().min(1),
  })
  .strict();

export const JourneyExitRunEvidenceSchema = z
  .object({
    schema_version: z.literal(1),
    play_mode: z.literal("pure"),
    event: z.literal("journey_exit"),
    start_surface: z.literal("fresh_overworld"),
    session_id: z.string().min(1),
    receipt: JourneyExitReceiptSchema,
  })
  .strict();

export const RunEvidenceEventSchema = z.discriminatedUnion("event", [
  FreshStartRunEvidenceSchema,
  JourneyExitRunEvidenceSchema,
]);

export const PureBlindRunSidecarSchema = z
  .object({
    schema_version: z.literal(1),
    report_schema_version: z.literal(2),
    play_mode: z.literal("pure"),
    start_surface: z.literal("fresh_overworld"),
    retention_eligible: z.literal(true),
    evidence_status: z.literal("verified"),
    session_id: z.string().min(1),
    receipt: JourneyExitReceiptSchema,
  })
  .strict();

export const StructuralBlindRunSidecarSchema = z
  .object({
    schema_version: z.literal(1),
    report_schema_version: z.literal(2),
    play_mode: z.literal("structural"),
    start_surface: z.enum(["fresh_overworld", "direct_quest"]),
    retention_eligible: z.literal(false),
    evidence_status: z.literal("not_applicable"),
    structural_kind: z.enum(["mock", "smoke"]),
  })
  .strict();

export const BlindRunSidecarSchema = z.discriminatedUnion("play_mode", [
  PureBlindRunSidecarSchema,
  StructuralBlindRunSidecarSchema,
]);

export type PureBlindRunSidecar = z.infer<typeof PureBlindRunSidecarSchema>;
export type StructuralBlindRunSidecar = z.infer<typeof StructuralBlindRunSidecarSchema>;
export type BlindRunSidecar = z.infer<typeof BlindRunSidecarSchema>;

export type RunEvidenceParseResult =
  | { ok: true; sidecar: PureBlindRunSidecar }
  | { ok: false; reason: string };

/**
 * Parse the private server JSONL audit. Pure evidence is intentionally tiny:
 * exactly one fresh start followed by exactly one journey exit for the same
 * session. The exit must be last, so a report cannot hide later gameplay.
 */
export function parseRunEvidenceJsonl(text: string): RunEvidenceParseResult {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const events: Array<z.infer<typeof RunEvidenceEventSchema>> = [];
  for (const [index, line] of lines.entries()) {
    let raw: unknown;
    try {
      raw = JSON.parse(line);
    } catch {
      return { ok: false, reason: `run evidence line ${index + 1} is not valid JSON` };
    }
    const parsed = RunEvidenceEventSchema.safeParse(raw);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return {
        ok: false,
        reason: `run evidence line ${index + 1} invalid: ${issue?.path.join(".") ?? "?"} — ${issue?.message ?? "schema mismatch"}`,
      };
    }
    events.push(parsed.data);
  }

  const starts = events.filter((event) => event.event === "fresh_start");
  const exits = events.filter((event) => event.event === "journey_exit");
  if (starts.length !== 1) {
    return {
      ok: false,
      reason: `run evidence requires exactly one fresh_start (found ${starts.length})`,
    };
  }
  if (exits.length !== 1) {
    return {
      ok: false,
      reason: `run evidence requires exactly one journey_exit (found ${exits.length})`,
    };
  }
  if (events.at(-1)?.event !== "journey_exit") {
    return { ok: false, reason: "run evidence journey_exit must be the final event" };
  }
  if (events.length !== 2 || events[0]?.event !== "fresh_start") {
    return {
      ok: false,
      reason: "run evidence may contain only fresh_start followed by journey_exit",
    };
  }

  const start = starts[0]!;
  const exit = exits[0]!;
  if (start.session_id !== exit.session_id) {
    return { ok: false, reason: "run evidence fresh_start and journey_exit session ids differ" };
  }

  return {
    ok: true,
    sidecar: {
      schema_version: 1,
      report_schema_version: 2,
      play_mode: "pure",
      start_surface: "fresh_overworld",
      retention_eligible: true,
      evidence_status: "verified",
      session_id: start.session_id,
      receipt: exit.receipt,
    },
  };
}

export function parseBlindRunSidecar(
  text: string,
): { ok: true; sidecar: BlindRunSidecar } | { ok: false; reason: string } {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, reason: "run sidecar is not valid JSON" };
  }
  const parsed = BlindRunSidecarSchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      ok: false,
      reason: `run sidecar invalid: ${issue?.path.join(".") ?? "?"} — ${issue?.message ?? "schema mismatch"}`,
    };
  }
  return { ok: true, sidecar: parsed.data };
}
