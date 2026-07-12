/**
 * Structured blind-playtest exit interviews.
 *
 * Historical reports shipped before the session contract are deliberately
 * still accepted as an unversioned legacy shape. They remain useful experience
 * evidence, but they are never retention evidence. New reports are explicitly
 * V2 and discriminate pure human-equivalent runs from structural mock runs.
 */
import { z } from "zod";
import { hashState } from "../core/hash.js";
import {
  INITIAL_JOURNEY_GOAL,
  JOURNEY_BASELINE_DECISIONS,
  JOURNEY_CONTRACT_VERSION,
  JOURNEY_EXIT_REASON,
} from "../world/journey_contract.js";

const ExitInterviewFields = {
  clarity: z.number().int().min(1).max(5),
  enjoyment: z.number().int().min(1).max(5),
  goal_understood: z.boolean(),
  got_stuck: z.boolean(),
  confusions: z.array(z.string().min(1)).default([]),
  bugs: z
    .array(
      z
        .object({
          where: z.string().min(1),
          severity: z.enum(["S0", "S1", "S2", "S3", "S4"]),
          note: z.string().min(1),
        })
        .strict(),
    )
    .default([]),
  best_moment: z.string().min(1),
  worst_moment: z.string().min(1),
  would_replay: z.boolean(),
  verdict: z.string().min(20),
} as const;

/** Pre-contract reports. Absence of schema_version is the durable legacy tag. */
export const LegacyExitInterviewSchema = z.object(ExitInterviewFields).strict();

const JourneyChoiceReasonSchema = z.enum(["checkpoint", "goal_completed"]);
const HashSchema = z.string().regex(/^[0-9a-f]{64}$/);
const JourneyCheckpointSchema = z
  .number()
  .int()
  .min(JOURNEY_BASELINE_DECISIONS)
  .refine(
    (value) => value % JOURNEY_BASELINE_DECISIONS === 0,
    `checkpoints must be positive multiples of ${JOURNEY_BASELINE_DECISIONS}`,
  );

export const JourneyRetentionEventSchema = z
  .object({
    sequence: z.number().int().positive(),
    atDecision: z.number().int().nonnegative(),
    reasons: z.array(JourneyChoiceReasonSchema).min(1).max(2),
    checkpoint: JourneyCheckpointSchema.nullable(),
    choice: z.enum(["continue", "end"]),
    decisionProofHash: HashSchema,
  })
  .strict()
  .superRefine((event, ctx) => {
    if (
      event.reasons.length === 2 &&
      (event.reasons[0] !== "checkpoint" || event.reasons[1] !== "goal_completed")
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["reasons"],
        message: "combined reasons must be checkpoint then goal_completed",
      });
    }
    const hasCheckpoint = event.reasons.includes("checkpoint");
    if (hasCheckpoint && event.checkpoint !== event.atDecision) {
      ctx.addIssue({
        code: "custom",
        path: ["checkpoint"],
        message: "checkpoint retention events must occur at that checkpoint",
      });
    }
    if (!hasCheckpoint && event.checkpoint !== null) {
      ctx.addIssue({
        code: "custom",
        path: ["checkpoint"],
        message: "early goal-completion choices must not carry a checkpoint",
      });
    }
  });

/**
 * Runtime validator for the core engine's JourneyExitReceipt. The report must
 * copy this object verbatim from the game; run-evidence verification below then
 * compares it with the server-side receipt rather than trusting prose.
 */
export const JourneyExitReceiptSchema = z
  .object({
    // Contract-v1 pure reports are immutable historical retention evidence.
    // New sessions emit the current v2 receipt, while re-verification and
    // feedback compilation must continue to accept frozen v1 sidecars.
    contractVersion: z.union([z.literal(1), z.literal(JOURNEY_CONTRACT_VERSION)]),
    exitReason: z.literal(JOURNEY_EXIT_REASON),
    goalVersion: z.literal(INITIAL_JOURNEY_GOAL.version),
    goalId: z.literal(INITIAL_JOURNEY_GOAL.id),
    goalStatus: z.enum(["active", "completed"]),
    acceptedDecisions: z.number().int().nonnegative(),
    exitReasons: z.array(JourneyChoiceReasonSchema).min(1).max(2),
    checkpoint: JourneyCheckpointSchema.nullable(),
    decisionProofHash: HashSchema,
    retentionHistory: z.array(JourneyRetentionEventSchema).min(1),
    receiptHash: HashSchema,
  })
  .strict()
  .superRefine((receipt, ctx) => {
    const { receiptHash, ...payload } = receipt;
    if (hashState(payload) !== receiptHash) {
      ctx.addIssue({
        code: "custom",
        path: ["receiptHash"],
        message: "receipt hash does not match the canonical journey receipt payload",
      });
    }
    let previousDecision = -1;
    let expectedCheckpoint = JOURNEY_BASELINE_DECISIONS;
    let sawGoalCompletionChoice = false;
    for (const [index, event] of receipt.retentionHistory.entries()) {
      if (event.sequence !== index + 1) {
        ctx.addIssue({
          code: "custom",
          path: ["retentionHistory", index, "sequence"],
          message: "retention event sequences must be contiguous and one-based",
        });
      }
      if (event.atDecision < previousDecision || event.atDecision > receipt.acceptedDecisions) {
        ctx.addIssue({
          code: "custom",
          path: ["retentionHistory", index, "atDecision"],
          message: "retention event decision counts must be ordered and within the receipt total",
        });
      }
      if (index < receipt.retentionHistory.length - 1 && event.choice !== "continue") {
        ctx.addIssue({
          code: "custom",
          path: ["retentionHistory", index, "choice"],
          message: "only the final retention event may end the journey",
        });
      }
      if (event.reasons.includes("checkpoint")) {
        if (event.checkpoint !== expectedCheckpoint) {
          ctx.addIssue({
            code: "custom",
            path: ["retentionHistory", index, "checkpoint"],
            message: `expected fixed journey checkpoint ${expectedCheckpoint}`,
          });
        }
        if (event.choice === "continue") expectedCheckpoint += JOURNEY_BASELINE_DECISIONS;
      }
      if (event.reasons.includes("goal_completed")) sawGoalCompletionChoice = true;
      previousDecision = event.atDecision;
    }
    if (sawGoalCompletionChoice && receipt.goalStatus !== "completed") {
      ctx.addIssue({
        code: "custom",
        path: ["goalStatus"],
        message: "a goal-completion retention choice requires completed goal status",
      });
    }

    const finalEvent = receipt.retentionHistory.at(-1);
    if (finalEvent?.choice !== "end") {
      ctx.addIssue({
        code: "custom",
        path: ["retentionHistory"],
        message: "an exit receipt must end with the player's end choice",
      });
    }
    if (finalEvent?.atDecision !== receipt.acceptedDecisions) {
      ctx.addIssue({
        code: "custom",
        path: ["acceptedDecisions"],
        message: "acceptedDecisions must equal the final retention event decision count",
      });
    }
    if (finalEvent?.decisionProofHash !== receipt.decisionProofHash) {
      ctx.addIssue({
        code: "custom",
        path: ["decisionProofHash"],
        message: "decision proof must match the final retention event",
      });
    }
    if (finalEvent?.checkpoint !== receipt.checkpoint) {
      ctx.addIssue({
        code: "custom",
        path: ["checkpoint"],
        message: "receipt checkpoint must match the final retention event",
      });
    }
    if (
      finalEvent !== undefined &&
      (finalEvent.reasons.length !== receipt.exitReasons.length ||
        finalEvent.reasons.some((reason, index) => receipt.exitReasons[index] !== reason))
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["exitReasons"],
        message: "exit reasons must match the final retention event",
      });
    }
  });

export const PureExitInterviewV2Schema = z
  .object({
    schema_version: z.literal(2),
    play_mode: z.literal("pure"),
    start_surface: z.literal("fresh_overworld"),
    retention_eligible: z.literal(true),
    journey_exit_receipt: JourneyExitReceiptSchema,
    ...ExitInterviewFields,
  })
  .strict();

export const StructuralExitInterviewV2Schema = z
  .object({
    schema_version: z.literal(2),
    play_mode: z.literal("structural"),
    start_surface: z.enum(["fresh_overworld", "direct_quest"]),
    retention_eligible: z.literal(false),
    structural_kind: z.enum(["mock", "smoke"]),
    ...ExitInterviewFields,
  })
  .strict();

export const ExitInterviewSchema = z.union([
  PureExitInterviewV2Schema,
  StructuralExitInterviewV2Schema,
  LegacyExitInterviewSchema,
]);

export type LegacyExitInterview = z.infer<typeof LegacyExitInterviewSchema>;
export type PureExitInterviewV2 = z.infer<typeof PureExitInterviewV2Schema>;
export type StructuralExitInterviewV2 = z.infer<typeof StructuralExitInterviewV2Schema>;
export type ExitInterview = z.infer<typeof ExitInterviewSchema>;

export function isPureExitInterviewV2(interview: ExitInterview): interview is PureExitInterviewV2 {
  return "schema_version" in interview && interview.play_mode === "pure";
}

export function isStructuralExitInterviewV2(
  interview: ExitInterview,
): interview is StructuralExitInterviewV2 {
  return "schema_version" in interview && interview.play_mode === "structural";
}

export function exitInterviewPlayMode(
  interview: ExitInterview,
): "pure" | "structural" | "legacy_guided" {
  if (isPureExitInterviewV2(interview)) return "pure";
  if (isStructuralExitInterviewV2(interview)) return "structural";
  return "legacy_guided";
}

const BLOCK = /```json exit-interview\s*\n([\s\S]*?)```/;

export type ExitInterviewExtraction =
  | { ok: true; interview: ExitInterview }
  | { ok: false; reason: string };

function schemaForParsedInterview(parsed: unknown): typeof ExitInterviewSchema | z.ZodTypeAny {
  if (typeof parsed !== "object" || parsed === null || !("schema_version" in parsed)) {
    return LegacyExitInterviewSchema;
  }
  const candidate = parsed as { schema_version?: unknown; play_mode?: unknown };
  if (candidate.schema_version !== 2) return ExitInterviewSchema;
  if (candidate.play_mode === "pure") return PureExitInterviewV2Schema;
  if (candidate.play_mode === "structural") return StructuralExitInterviewV2Schema;
  return ExitInterviewSchema;
}

export function extractExitInterview(text: string): ExitInterviewExtraction {
  const body = BLOCK.exec(text)?.[1];
  if (body === undefined) {
    return {
      ok: false,
      reason: "missing exit interview (a ```json exit-interview fenced block is mandatory)",
    };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return { ok: false, reason: "exit interview block is not valid JSON" };
  }
  const res = schemaForParsedInterview(parsed).safeParse(parsed);
  if (!res.success) {
    const first = res.error.issues[0];
    return {
      ok: false,
      reason: `exit interview invalid: ${first?.path.join(".") ?? "?"} — ${first?.message ?? "schema mismatch"}`,
    };
  }
  return { ok: true, interview: res.data as ExitInterview };
}
