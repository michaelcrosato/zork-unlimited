/**
 * Machine-readable evidence accounting for a feedback compile.
 *
 * Hotspots intentionally continue to use every verified report as experience
 * or QA evidence. Retention is narrower: only independently reverified pure
 * reports enter this summary, and incompatible journey-contract versions are
 * never pooled into one decision curve.
 */
import { z } from "zod";
import {
  exitInterviewPlayMode,
  isPureExitInterviewV2,
  type ExitInterview,
  type PureExitInterviewV2,
} from "../blind/exit_interview.js";

const ChoiceCountsSchema = z
  .object({
    continue: z.number().int().nonnegative(),
    end: z.number().int().nonnegative(),
  })
  .strict();

const ContractRetentionSchema = z
  .object({
    contract_version: z.number().int().positive(),
    eligible_reports: z.number().int().positive(),
    continued_reports: z.number().int().nonnegative(),
    ended_at_first_choice_reports: z.number().int().nonnegative(),
    forced_character_death_reports: z.number().int().nonnegative(),
    accepted_decisions: z
      .object({
        minimum: z.number().int().nonnegative(),
        maximum: z.number().int().nonnegative(),
        mean: z.number().nonnegative(),
      })
      .strict(),
    choices: ChoiceCountsSchema,
    choice_triggers: z
      .object({
        checkpoint: ChoiceCountsSchema,
        goal_completed: ChoiceCountsSchema,
        checkpoint_and_goal_completed: ChoiceCountsSchema,
      })
      .strict(),
    checkpoints: z.array(
      z
        .object({
          decision: z.number().int().positive(),
          continue: z.number().int().nonnegative(),
          end: z.number().int().nonnegative(),
        })
        .strict(),
    ),
    exit_reasons: z.array(
      z
        .object({
          reason: z.string().min(1),
          count: z.number().int().positive(),
        })
        .strict(),
    ),
  })
  .strict();

export const FeedbackEvidenceSummarySchema = z
  .object({
    schema_version: z.literal(2),
    report_modes: z
      .object({
        pure: z.number().int().nonnegative(),
        structural: z.number().int().nonnegative(),
        legacy_guided: z.number().int().nonnegative(),
      })
      .strict(),
    pure_retention: z
      .object({
        eligible_reports: z.number().int().nonnegative(),
        contract_versions: z.array(ContractRetentionSchema),
      })
      .strict(),
  })
  .strict()
  .superRefine((summary, ctx) => {
    const retention = summary.pure_retention;
    if (retention.eligible_reports !== summary.report_modes.pure) {
      ctx.addIssue({
        code: "custom",
        path: ["pure_retention", "eligible_reports"],
        message: "eligible retention reports must equal verified pure reports",
      });
    }
    const versionTotal = retention.contract_versions.reduce(
      (sum, version) => sum + version.eligible_reports,
      0,
    );
    if (versionTotal !== retention.eligible_reports) {
      ctx.addIssue({
        code: "custom",
        path: ["pure_retention", "contract_versions"],
        message: "contract-version cohorts must cover every eligible pure report",
      });
    }
    const versions = retention.contract_versions.map((version) => version.contract_version);
    if (new Set(versions).size !== versions.length) {
      ctx.addIssue({
        code: "custom",
        path: ["pure_retention", "contract_versions"],
        message: "contract-version cohorts must be unique",
      });
    }

    retention.contract_versions.forEach((version, index) => {
      const path = ["pure_retention", "contract_versions", index] as const;
      const voluntarilyClassifiedReports =
        version.continued_reports + version.ended_at_first_choice_reports;
      if (voluntarilyClassifiedReports > version.eligible_reports) {
        ctx.addIssue({
          code: "custom",
          path: [...path, "continued_reports"],
          message: "voluntary report classifications cannot exceed eligible pure reports",
        });
      }
      const reportsWithoutVoluntaryChoice = version.eligible_reports - voluntarilyClassifiedReports;
      if (
        version.forced_character_death_reports < reportsWithoutVoluntaryChoice ||
        version.forced_character_death_reports >
          reportsWithoutVoluntaryChoice + version.continued_reports
      ) {
        ctx.addIssue({
          code: "custom",
          path: [...path, "forced_character_death_reports"],
          message:
            "forced character-death reports must cover every report without a voluntary choice",
        });
      }
      if (
        version.choices.end !==
        version.eligible_reports - version.forced_character_death_reports
      ) {
        ctx.addIssue({
          code: "custom",
          path: [...path, "choices", "end"],
          message: "only non-death exits contribute a voluntary end choice",
        });
      }
      const exitReasonTotal = version.exit_reasons.reduce((sum, row) => sum + row.count, 0);
      if (exitReasonTotal !== version.eligible_reports) {
        ctx.addIssue({
          code: "custom",
          path: [...path, "exit_reasons"],
          message: "exit reason counts must cover every eligible pure report",
        });
      }
      const triggerChoiceTotal = Object.values(version.choice_triggers).reduce(
        (sum, counts) => sum + counts.continue + counts.end,
        0,
      );
      if (triggerChoiceTotal !== version.choices.continue + version.choices.end) {
        ctx.addIssue({
          code: "custom",
          path: [...path, "choice_triggers"],
          message: "trigger counts must cover every retention choice exactly once",
        });
      }
      if (version.accepted_decisions.minimum > version.accepted_decisions.maximum) {
        ctx.addIssue({
          code: "custom",
          path: [...path, "accepted_decisions"],
          message: "accepted-decision minimum cannot exceed maximum",
        });
      }
    });
  });

export type FeedbackEvidenceSummary = z.infer<typeof FeedbackEvidenceSummarySchema>;

type EvidenceInterview = { ref: string; interview: ExitInterview };
type PureReceipt = PureExitInterviewV2["journey_exit_receipt"];
type ChoiceCounts = { continue: number; end: number };
type ContractRetention = FeedbackEvidenceSummary["pure_retention"]["contract_versions"][number];
type ChoiceTrigger = keyof ContractRetention["choice_triggers"];

function emptyChoiceCounts(): ChoiceCounts {
  return { continue: 0, end: 0 };
}

function triggerFor(reasons: readonly string[]): ChoiceTrigger {
  return reasons.length === 2
    ? "checkpoint_and_goal_completed"
    : reasons[0] === "checkpoint"
      ? "checkpoint"
      : "goal_completed";
}

function summarizeContractVersion(
  contractVersion: number,
  receipts: readonly PureReceipt[],
): ContractRetention {
  const choices = emptyChoiceCounts();
  const choiceTriggers: ContractRetention["choice_triggers"] = {
    checkpoint: emptyChoiceCounts(),
    goal_completed: emptyChoiceCounts(),
    checkpoint_and_goal_completed: emptyChoiceCounts(),
  };
  const checkpointChoices = new Map<number, ChoiceCounts>();
  const exitReasons = new Map<string, number>();
  const decisionCounts: number[] = [];
  let continuedReports = 0;
  let endedAtFirstChoiceReports = 0;
  let forcedCharacterDeathReports = 0;

  for (const receipt of receipts) {
    decisionCounts.push(receipt.acceptedDecisions);
    exitReasons.set(receipt.exitReason, (exitReasons.get(receipt.exitReason) ?? 0) + 1);
    let continued = false;
    let firstVoluntaryChoice: "continue" | "end" | null = null;
    let characterDied = false;
    for (const event of receipt.retentionHistory) {
      const reasons: readonly string[] = event.reasons;
      if (reasons.includes("character_died")) {
        characterDied = true;
        continue;
      }
      if (firstVoluntaryChoice === null) firstVoluntaryChoice = event.choice;
      choices[event.choice] += 1;
      choiceTriggers[triggerFor(reasons)][event.choice] += 1;
      if (event.choice === "continue") continued = true;
      if (event.checkpoint !== null) {
        const counts = checkpointChoices.get(event.checkpoint) ?? emptyChoiceCounts();
        counts[event.choice] += 1;
        checkpointChoices.set(event.checkpoint, counts);
      }
    }
    if (continued) continuedReports += 1;
    else if (firstVoluntaryChoice === "end") endedAtFirstChoiceReports += 1;
    if (characterDied) forcedCharacterDeathReports += 1;
  }

  return {
    contract_version: contractVersion,
    eligible_reports: receipts.length,
    continued_reports: continuedReports,
    ended_at_first_choice_reports: endedAtFirstChoiceReports,
    forced_character_death_reports: forcedCharacterDeathReports,
    accepted_decisions: {
      minimum: Math.min(...decisionCounts),
      maximum: Math.max(...decisionCounts),
      mean: decisionCounts.reduce((sum, count) => sum + count, 0) / decisionCounts.length,
    },
    choices,
    choice_triggers: choiceTriggers,
    checkpoints: [...checkpointChoices.entries()]
      .sort(([a], [b]) => a - b)
      .map(([decision, counts]) => ({ decision, ...counts })),
    exit_reasons: [...exitReasons.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([reason, count]) => ({ reason, count })),
  };
}

/**
 * Summarize only already-gated interviews. `collectInputs` requires a matching
 * verified sidecar before any pure interview reaches this function.
 */
export function summarizeFeedbackEvidence(
  interviews: readonly EvidenceInterview[],
): FeedbackEvidenceSummary {
  const reportModes = { pure: 0, structural: 0, legacy_guided: 0 };
  const receiptsByContract = new Map<number, PureReceipt[]>();

  for (const { interview } of interviews) {
    reportModes[exitInterviewPlayMode(interview)] += 1;
    if (!isPureExitInterviewV2(interview)) continue;
    const receipt = interview.journey_exit_receipt;
    const receipts = receiptsByContract.get(receipt.contractVersion) ?? [];
    receipts.push(receipt);
    receiptsByContract.set(receipt.contractVersion, receipts);
  }

  return FeedbackEvidenceSummarySchema.parse({
    schema_version: 2,
    report_modes: reportModes,
    pure_retention: {
      eligible_reports: reportModes.pure,
      contract_versions: [...receiptsByContract.entries()]
        .sort(([a], [b]) => a - b)
        .map(([contractVersion, receipts]) => summarizeContractVersion(contractVersion, receipts)),
    },
  });
}
