import { z } from "zod";

import { hashState } from "../core/hash.js";
import type { OverworldQuest } from "./overworld.js";

export const JOURNEY_CONTRACT_VERSION = 2 as const;
export const JOURNEY_BASELINE_DECISIONS = 40 as const;
export const JOURNEY_EXIT_REASON = "player_ended_at_choice" as const;

export const INITIAL_JOURNEY_GOAL = Object.freeze({
  version: 1 as const,
  id: "albany_local_lead",
  text: "Find one local lead in Albany and see it through.",
} as const);

export type JourneyChoice = "continue" | "end";
export type JourneyChoiceReason = "checkpoint" | "goal_completed";
export type JourneyStatus = "active" | "awaiting_choice" | "ended";
export type JourneyGoalStatus = "active" | "completed";
export type JourneyDecisionSurface = "overworld" | "quest";

export type JourneyCountedDecisionReason =
  | "movement"
  | "stateful_clue"
  | "substantive_dialogue"
  | "combat"
  | "skill_check"
  | "preparation"
  | "situation_changed";

export type JourneyExcludedDecisionReason =
  | "context_only"
  | "repeated_context"
  | "dialogue_opening"
  | "dialogue_navigation"
  | "dialogue_closure"
  | "unchanged_service"
  | "technical_quest_foldback"
  | "rejected";

export type JourneyDecisionClassification = Readonly<
  | { countsTowardJourney: true; reason: JourneyCountedDecisionReason }
  | { countsTowardJourney: false; reason: JourneyExcludedDecisionReason }
>;

export type JourneyAcceptedDecision = Readonly<{
  surface: JourneyDecisionSurface;
  actionId: string;
  reason: JourneyCountedDecisionReason;
}>;

export type JourneyDecisionProofLast = Readonly<{
  number: number;
  surface: JourneyDecisionSurface;
  actionId: string;
  reason: JourneyCountedDecisionReason;
}>;

export type JourneyDecisionProof = Readonly<{
  hash: string;
  last: JourneyDecisionProofLast | null;
}>;

export type JourneyGoalSnapshot = {
  version: typeof INITIAL_JOURNEY_GOAL.version;
  id: typeof INITIAL_JOURNEY_GOAL.id;
  status: JourneyGoalStatus;
  completedAtDecision: number | null;
};

export type JourneyPendingChoiceSnapshot = {
  atDecision: number;
  reasons: JourneyChoiceReason[];
  checkpoint: number | null;
};

export type JourneyRetentionEvent = Readonly<{
  sequence: number;
  atDecision: number;
  reasons: readonly JourneyChoiceReason[];
  checkpoint: number | null;
  choice: JourneyChoice;
  decisionProofHash: string;
}>;

type JourneyRetentionEventSnapshot = {
  sequence: number;
  atDecision: number;
  reasons: JourneyChoiceReason[];
  checkpoint: number | null;
  choice: JourneyChoice;
  decisionProofHash: string;
};

export type JourneyContractSnapshot = {
  version: typeof JOURNEY_CONTRACT_VERSION;
  status: JourneyStatus;
  goal: JourneyGoalSnapshot;
  acceptedDecisions: number;
  nextCheckpoint: number | null;
  decisionProof: {
    hash: string;
    last: JourneyDecisionProofLast | null;
  };
  pendingChoice: JourneyPendingChoiceSnapshot | null;
  retentionHistory: JourneyRetentionEventSnapshot[];
};

export type JourneyGoalPresentation = Readonly<{
  version: typeof INITIAL_JOURNEY_GOAL.version;
  id: typeof INITIAL_JOURNEY_GOAL.id;
  text: typeof INITIAL_JOURNEY_GOAL.text;
  status: JourneyGoalStatus;
  completedAtDecision: number | null;
}>;

export type JourneyChoiceOption = Readonly<{
  id: JourneyChoice;
  label: string;
  consequence: string;
}>;

export type JourneyChoicePrompt = Readonly<{
  id: string;
  atDecision: number;
  reasons: readonly JourneyChoiceReason[];
  checkpoint: number | null;
  message: string;
  options: readonly [JourneyChoiceOption, JourneyChoiceOption];
}>;

export type JourneyPresentation = Readonly<{
  contractVersion: typeof JOURNEY_CONTRACT_VERSION;
  status: JourneyStatus;
  goal: JourneyGoalPresentation;
  acceptedDecisions: number;
  baselineDecisions: typeof JOURNEY_BASELINE_DECISIONS;
  nextCheckpoint: number | null;
  decisionProof: JourneyDecisionProof;
  pendingChoice: JourneyChoicePrompt | null;
  retentionHistory: readonly JourneyRetentionEvent[];
}>;

export type JourneyExitReceipt = Readonly<{
  contractVersion: typeof JOURNEY_CONTRACT_VERSION;
  exitReason: typeof JOURNEY_EXIT_REASON;
  goalVersion: typeof INITIAL_JOURNEY_GOAL.version;
  goalId: typeof INITIAL_JOURNEY_GOAL.id;
  goalStatus: JourneyGoalStatus;
  acceptedDecisions: number;
  exitReasons: readonly JourneyChoiceReason[];
  checkpoint: number | null;
  decisionProofHash: string;
  retentionHistory: readonly JourneyRetentionEvent[];
  receiptHash: string;
}>;

export type JourneyChoiceResult = Readonly<{
  journey: JourneyPresentation;
  retentionEvent: JourneyRetentionEvent;
  exitReceipt: JourneyExitReceipt | null;
}>;

export const JOURNEY_INITIAL_DECISION_PROOF_HASH = hashState({
  contractVersion: JOURNEY_CONTRACT_VERSION,
  goalVersion: INITIAL_JOURNEY_GOAL.version,
  goalId: INITIAL_JOURNEY_GOAL.id,
  baselineDecisions: JOURNEY_BASELINE_DECISIONS,
  acceptedDecisions: 0,
});

const HASH_PATTERN = /^[0-9a-f]{64}$/;
const SAFE_NONNEGATIVE_INT = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const POSITIVE_SAFE_INT = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const JourneyChoiceSchema = z.enum(["continue", "end"]);
const JourneyChoiceReasonSchema = z.enum(["checkpoint", "goal_completed"]);
const JourneyCountedDecisionReasonSchema = z.enum([
  "movement",
  "stateful_clue",
  "substantive_dialogue",
  "combat",
  "skill_check",
  "preparation",
  "situation_changed",
]);
const JourneyDecisionProofLastSchema = z
  .object({
    number: POSITIVE_SAFE_INT,
    surface: z.enum(["overworld", "quest"]),
    actionId: z.string().min(1),
    reason: JourneyCountedDecisionReasonSchema,
  })
  .strict();
const JourneyRetentionEventSchema = z
  .object({
    sequence: POSITIVE_SAFE_INT,
    atDecision: SAFE_NONNEGATIVE_INT,
    reasons: z.array(JourneyChoiceReasonSchema).min(1).max(2),
    checkpoint: POSITIVE_SAFE_INT.nullable(),
    choice: JourneyChoiceSchema,
    decisionProofHash: z.string().regex(HASH_PATTERN),
  })
  .strict();

function reasonsAreCanonical(reasons: readonly JourneyChoiceReason[]): boolean {
  if (reasons.length === 1) return true;
  return reasons.length === 2 && reasons[0] === "checkpoint" && reasons[1] === "goal_completed";
}

function hasReason(
  value: { reasons: readonly JourneyChoiceReason[] },
  reason: JourneyChoiceReason,
): boolean {
  return value.reasons.includes(reason);
}

function addIssue(ctx: z.RefinementCtx, path: (string | number)[], message: string): void {
  ctx.addIssue({ code: z.ZodIssueCode.custom, path, message });
}

export const JourneyContractSnapshotSchema = z
  .object({
    version: z.literal(JOURNEY_CONTRACT_VERSION),
    status: z.enum(["active", "awaiting_choice", "ended"]),
    goal: z
      .object({
        version: z.literal(INITIAL_JOURNEY_GOAL.version),
        id: z.literal(INITIAL_JOURNEY_GOAL.id),
        status: z.enum(["active", "completed"]),
        completedAtDecision: SAFE_NONNEGATIVE_INT.nullable(),
      })
      .strict(),
    acceptedDecisions: SAFE_NONNEGATIVE_INT,
    nextCheckpoint: POSITIVE_SAFE_INT.nullable(),
    decisionProof: z
      .object({
        hash: z.string().regex(HASH_PATTERN),
        last: JourneyDecisionProofLastSchema.nullable(),
      })
      .strict(),
    pendingChoice: z
      .object({
        atDecision: SAFE_NONNEGATIVE_INT,
        reasons: z.array(JourneyChoiceReasonSchema).min(1).max(2),
        checkpoint: POSITIVE_SAFE_INT.nullable(),
      })
      .strict()
      .nullable(),
    retentionHistory: z.array(JourneyRetentionEventSchema),
  })
  .strict()
  .superRefine((state, ctx) => {
    const { acceptedDecisions, decisionProof, goal, pendingChoice, retentionHistory } = state;

    if (acceptedDecisions === 0) {
      if (decisionProof.last !== null) {
        addIssue(ctx, ["decisionProof", "last"], "Zero decisions cannot have a last decision.");
      }
      if (decisionProof.hash !== JOURNEY_INITIAL_DECISION_PROOF_HASH) {
        addIssue(
          ctx,
          ["decisionProof", "hash"],
          "Initial journey decision proof hash does not match the contract.",
        );
      }
    } else if (decisionProof.last?.number !== acceptedDecisions) {
      addIssue(
        ctx,
        ["decisionProof", "last"],
        "Last decision number must equal acceptedDecisions.",
      );
    }

    if (goal.status === "active" && goal.completedAtDecision !== null) {
      addIssue(ctx, ["goal", "completedAtDecision"], "An active goal cannot be completed.");
    }
    if (
      goal.status === "completed" &&
      (goal.completedAtDecision === null || goal.completedAtDecision > acceptedDecisions)
    ) {
      addIssue(
        ctx,
        ["goal", "completedAtDecision"],
        "Completed goal decision must exist and cannot exceed acceptedDecisions.",
      );
    }

    let expectedCheckpoint = JOURNEY_BASELINE_DECISIONS;
    let sawGoalReason = false;
    let sawEnd = false;
    retentionHistory.forEach((event, index) => {
      if (event.sequence !== index + 1) {
        addIssue(
          ctx,
          ["retentionHistory", index, "sequence"],
          "Retention sequence is not contiguous.",
        );
      }
      if (event.atDecision > acceptedDecisions) {
        addIssue(
          ctx,
          ["retentionHistory", index, "atDecision"],
          "Retention event cannot follow the accepted decision count.",
        );
      }
      if (
        event.atDecision === acceptedDecisions &&
        event.decisionProofHash !== decisionProof.hash
      ) {
        addIssue(
          ctx,
          ["retentionHistory", index, "decisionProofHash"],
          "Retention evidence at the current decision must match the journey decision proof.",
        );
      }
      if (!reasonsAreCanonical(event.reasons)) {
        addIssue(
          ctx,
          ["retentionHistory", index, "reasons"],
          "Retention reasons must be unique and in canonical order.",
        );
      }
      const checkpointReason = hasReason(event, "checkpoint");
      if (checkpointReason) {
        if (event.checkpoint !== expectedCheckpoint || event.atDecision !== expectedCheckpoint) {
          addIssue(
            ctx,
            ["retentionHistory", index, "checkpoint"],
            `Expected fixed journey checkpoint ${expectedCheckpoint}.`,
          );
        }
        if (event.choice === "continue") expectedCheckpoint += JOURNEY_BASELINE_DECISIONS;
      } else if (event.checkpoint !== null) {
        addIssue(
          ctx,
          ["retentionHistory", index, "checkpoint"],
          "Only checkpoint prompts may carry a checkpoint number.",
        );
      }
      if (hasReason(event, "goal_completed")) {
        sawGoalReason = true;
        if (event.atDecision !== goal.completedAtDecision) {
          addIssue(
            ctx,
            ["retentionHistory", index, "atDecision"],
            "Goal retention event must match the goal completion decision.",
          );
        }
      }
      if (event.choice === "end") {
        sawEnd = true;
        if (index !== retentionHistory.length - 1) {
          addIssue(ctx, ["retentionHistory", index], "Ending must be the final retention event.");
        }
      } else if (sawEnd) {
        addIssue(ctx, ["retentionHistory", index], "Retention cannot continue after ending.");
      }
    });

    if (pendingChoice) {
      if (state.status !== "awaiting_choice") {
        addIssue(ctx, ["status"], "A pending choice requires awaiting_choice status.");
      }
      if (pendingChoice.atDecision !== acceptedDecisions) {
        addIssue(
          ctx,
          ["pendingChoice", "atDecision"],
          "Pending choice must occur at the current accepted decision count.",
        );
      }
      if (!reasonsAreCanonical(pendingChoice.reasons)) {
        addIssue(
          ctx,
          ["pendingChoice", "reasons"],
          "Pending reasons must be unique and in canonical order.",
        );
      }
      const checkpointReason = hasReason(pendingChoice, "checkpoint");
      if (checkpointReason) {
        if (
          pendingChoice.checkpoint !== expectedCheckpoint ||
          pendingChoice.atDecision !== expectedCheckpoint
        ) {
          addIssue(
            ctx,
            ["pendingChoice", "checkpoint"],
            `Pending checkpoint must be the fixed journey checkpoint ${expectedCheckpoint}.`,
          );
        }
      } else if (pendingChoice.checkpoint !== null) {
        addIssue(
          ctx,
          ["pendingChoice", "checkpoint"],
          "Only a checkpoint prompt may carry a checkpoint number.",
        );
      }
      if (hasReason(pendingChoice, "goal_completed")) {
        sawGoalReason = true;
        if (pendingChoice.atDecision !== goal.completedAtDecision) {
          addIssue(
            ctx,
            ["pendingChoice", "atDecision"],
            "Goal prompt must match the goal completion decision.",
          );
        }
      }
    } else if (state.status === "awaiting_choice") {
      addIssue(ctx, ["pendingChoice"], "awaiting_choice status requires a pending choice.");
    }

    if (state.status === "ended") {
      if (pendingChoice !== null || state.nextCheckpoint !== null || !sawEnd) {
        addIssue(
          ctx,
          ["status"],
          "Ended journeys require a final end event and no pending/next checkpoint.",
        );
      }
    } else {
      if (sawEnd)
        addIssue(ctx, ["retentionHistory"], "Only an ended journey may retain an end choice.");
      if (state.nextCheckpoint !== expectedCheckpoint) {
        addIssue(
          ctx,
          ["nextCheckpoint"],
          `Next fixed journey checkpoint must be ${expectedCheckpoint}.`,
        );
      }
      const pendingCheckpoint = pendingChoice && hasReason(pendingChoice, "checkpoint");
      if (pendingCheckpoint) {
        if (acceptedDecisions !== expectedCheckpoint) {
          addIssue(ctx, ["acceptedDecisions"], "Checkpoint prompt must stop on its fixed count.");
        }
      } else if (acceptedDecisions >= expectedCheckpoint) {
        addIssue(
          ctx,
          ["acceptedDecisions"],
          "An active journey cannot pass its next fixed checkpoint.",
        );
      }
    }

    if (goal.status === "completed" && !sawGoalReason) {
      addIssue(ctx, ["goal"], "A completed goal requires a goal-completion retention prompt.");
    }
    if (goal.status === "active" && sawGoalReason) {
      addIssue(ctx, ["goal"], "An active goal cannot have goal-completion retention evidence.");
    }
  });

function cloneReasons(reasons: readonly JourneyChoiceReason[]): JourneyChoiceReason[] {
  return [...reasons];
}

function cloneRetentionEvent(event: JourneyRetentionEvent): JourneyRetentionEventSnapshot {
  return {
    ...event,
    reasons: cloneReasons(event.reasons),
  };
}

export function cloneJourneyContractSnapshot(
  state: JourneyContractSnapshot,
): JourneyContractSnapshot {
  return {
    ...state,
    goal: { ...state.goal },
    decisionProof: {
      ...state.decisionProof,
      last: state.decisionProof.last ? { ...state.decisionProof.last } : null,
    },
    pendingChoice: state.pendingChoice
      ? { ...state.pendingChoice, reasons: cloneReasons(state.pendingChoice.reasons) }
      : null,
    retentionHistory: state.retentionHistory.map(cloneRetentionEvent),
  };
}

export function createInitialJourneyContractSnapshot(): JourneyContractSnapshot {
  return {
    version: JOURNEY_CONTRACT_VERSION,
    status: "active",
    goal: {
      version: INITIAL_JOURNEY_GOAL.version,
      id: INITIAL_JOURNEY_GOAL.id,
      status: "active",
      completedAtDecision: null,
    },
    acceptedDecisions: 0,
    nextCheckpoint: JOURNEY_BASELINE_DECISIONS,
    decisionProof: {
      hash: JOURNEY_INITIAL_DECISION_PROOF_HASH,
      last: null,
    },
    pendingChoice: null,
    retentionHistory: [],
  };
}

function freezeRetentionEvent(event: JourneyRetentionEvent): JourneyRetentionEvent {
  return Object.freeze({ ...event, reasons: Object.freeze(cloneReasons(event.reasons)) });
}

function pendingChoiceMessage(state: JourneyContractSnapshot): string {
  const pending = state.pendingChoice;
  if (!pending) throw new Error("Journey has no pending choice.");
  const checkpoint = hasReason(pending, "checkpoint");
  const goal = hasReason(pending, "goal_completed");
  if (checkpoint && goal) {
    return `You completed your current goal at the ${String(pending.checkpoint)}-decision checkpoint. Continue for ${JOURNEY_BASELINE_DECISIONS} more decisions, or end this journey?`;
  }
  if (checkpoint) {
    return `You have reached the ${String(pending.checkpoint)}-decision checkpoint. Continue for ${JOURNEY_BASELINE_DECISIONS} more decisions, or end this journey?`;
  }
  return `You completed your current goal after ${pending.atDecision} meaningful decisions. Continue to the fixed checkpoint at ${String(state.nextCheckpoint)}, or end this journey?`;
}

function pendingChoicePresentation(state: JourneyContractSnapshot): JourneyChoicePrompt | null {
  const pending = state.pendingChoice;
  if (!pending) return null;
  const checkpoint = hasReason(pending, "checkpoint");
  const continueTo = checkpoint
    ? (state.nextCheckpoint ?? 0) + JOURNEY_BASELINE_DECISIONS
    : state.nextCheckpoint;
  const continueLabel = checkpoint
    ? `Continue for ${JOURNEY_BASELINE_DECISIONS} more decisions`
    : `Continue to decision ${String(state.nextCheckpoint)}`;
  return Object.freeze({
    id: `journey:${pending.atDecision}:${pending.reasons.join("+")}`,
    atDecision: pending.atDecision,
    reasons: Object.freeze(cloneReasons(pending.reasons)),
    checkpoint: pending.checkpoint,
    message: pendingChoiceMessage(state),
    options: Object.freeze([
      Object.freeze({
        id: "continue" as const,
        label: continueLabel,
        consequence: `Play remains open; the next fixed checkpoint is decision ${String(continueTo)}.`,
      }),
      Object.freeze({
        id: "end" as const,
        label: "End this journey",
        consequence: "This journey becomes read-only and its exit receipt is ready for review.",
      }),
    ]) as readonly [JourneyChoiceOption, JourneyChoiceOption],
  });
}

export function journeyPresentation(state: JourneyContractSnapshot): JourneyPresentation {
  return Object.freeze({
    contractVersion: JOURNEY_CONTRACT_VERSION,
    status: state.status,
    goal: Object.freeze({
      version: INITIAL_JOURNEY_GOAL.version,
      id: INITIAL_JOURNEY_GOAL.id,
      text: INITIAL_JOURNEY_GOAL.text,
      status: state.goal.status,
      completedAtDecision: state.goal.completedAtDecision,
    }),
    acceptedDecisions: state.acceptedDecisions,
    baselineDecisions: JOURNEY_BASELINE_DECISIONS,
    nextCheckpoint: state.nextCheckpoint,
    decisionProof: Object.freeze({
      hash: state.decisionProof.hash,
      last: state.decisionProof.last ? Object.freeze({ ...state.decisionProof.last }) : null,
    }),
    pendingChoice: pendingChoicePresentation(state),
    retentionHistory: Object.freeze(state.retentionHistory.map(freezeRetentionEvent)),
  });
}

export function assertJourneyAcceptingDecision(state: JourneyContractSnapshot): void {
  if (state.status === "ended") {
    throw new Error("This journey has ended.");
  }
  if (state.status === "awaiting_choice") {
    throw new Error(
      "Choose whether to continue or end this journey before taking another gameplay action.",
    );
  }
  if (state.acceptedDecisions >= Number.MAX_SAFE_INTEGER) {
    throw new Error("The journey has reached the maximum safe accepted-decision count.");
  }
}

export function recordJourneyAcceptedDecision(
  state: JourneyContractSnapshot,
  decision: JourneyAcceptedDecision,
): JourneyContractSnapshot {
  assertJourneyAcceptingDecision(state);
  if (decision.actionId.length === 0)
    throw new Error("Accepted journey action id cannot be empty.");
  const acceptedDecisions = state.acceptedDecisions + 1;
  const last: JourneyDecisionProofLast = {
    number: acceptedDecisions,
    surface: decision.surface,
    actionId: decision.actionId,
    reason: decision.reason,
  };
  const decisionProof = {
    hash: hashState({ previous: state.decisionProof.hash, ...last }),
    last,
  };
  const reachedCheckpoint = acceptedDecisions === state.nextCheckpoint;
  return {
    ...state,
    acceptedDecisions,
    decisionProof,
    status: reachedCheckpoint ? "awaiting_choice" : "active",
    pendingChoice: reachedCheckpoint
      ? {
          atDecision: acceptedDecisions,
          reasons: ["checkpoint"],
          checkpoint: state.nextCheckpoint,
        }
      : null,
  };
}

/**
 * Apply one accepted gameplay outcome to the versioned journey contract. The
 * classifier is authoritative: excluded context/no-op outcomes leave the
 * counter and proof byte-identical, while counted outcomes extend the proof
 * with the engine-owned reason that made the decision consequential.
 */
export function recordJourneyDecision(
  state: JourneyContractSnapshot,
  decision: Omit<JourneyAcceptedDecision, "reason">,
  classification: JourneyDecisionClassification,
): JourneyContractSnapshot {
  assertJourneyAcceptingDecision(state);
  if (!classification.countsTowardJourney) return state;
  return recordJourneyAcceptedDecision(state, {
    ...decision,
    reason: classification.reason,
  });
}

function canonicalReasons(reasons: readonly JourneyChoiceReason[]): JourneyChoiceReason[] {
  return ["checkpoint", "goal_completed"].filter((reason) =>
    reasons.includes(reason as JourneyChoiceReason),
  ) as JourneyChoiceReason[];
}

export function recordJourneyGoalCompleted(
  state: JourneyContractSnapshot,
): JourneyContractSnapshot {
  if (state.status === "ended") throw new Error("This journey has ended.");
  if (state.goal.status === "completed") return state;
  const goal: JourneyGoalSnapshot = {
    ...state.goal,
    status: "completed",
    completedAtDecision: state.acceptedDecisions,
  };
  if (state.pendingChoice) {
    return {
      ...state,
      goal,
      pendingChoice: {
        ...state.pendingChoice,
        reasons: canonicalReasons([...state.pendingChoice.reasons, "goal_completed"]),
      },
    };
  }
  return {
    ...state,
    status: "awaiting_choice",
    goal,
    pendingChoice: {
      atDecision: state.acceptedDecisions,
      reasons: ["goal_completed"],
      checkpoint: null,
    },
  };
}

function buildJourneyExitReceipt(state: JourneyContractSnapshot): JourneyExitReceipt | null {
  if (state.status !== "ended") return null;
  const last = state.retentionHistory.at(-1);
  if (!last || last.choice !== "end") {
    throw new Error("Ended journey is missing its final retention event.");
  }
  const retentionHistory = state.retentionHistory.map(freezeRetentionEvent);
  const payload = {
    contractVersion: JOURNEY_CONTRACT_VERSION,
    exitReason: JOURNEY_EXIT_REASON,
    goalVersion: INITIAL_JOURNEY_GOAL.version,
    goalId: INITIAL_JOURNEY_GOAL.id,
    goalStatus: state.goal.status,
    acceptedDecisions: state.acceptedDecisions,
    exitReasons: cloneReasons(last.reasons),
    checkpoint: last.checkpoint,
    decisionProofHash: state.decisionProof.hash,
    retentionHistory: retentionHistory.map((event) => ({
      ...event,
      reasons: [...event.reasons],
    })),
  };
  return Object.freeze({
    ...payload,
    exitReasons: Object.freeze(payload.exitReasons),
    retentionHistory: Object.freeze(retentionHistory),
    receiptHash: hashState(payload),
  });
}

export function journeyExitReceipt(state: JourneyContractSnapshot): JourneyExitReceipt | null {
  return buildJourneyExitReceipt(state);
}

export function chooseJourney(
  state: JourneyContractSnapshot,
  choice: JourneyChoice,
): { state: JourneyContractSnapshot; result: JourneyChoiceResult } {
  if (choice !== "continue" && choice !== "end") {
    throw new Error(`Unknown journey choice "${String(choice)}".`);
  }
  if (state.status !== "awaiting_choice" || !state.pendingChoice) {
    throw new Error("There is no journey continuation choice to make right now.");
  }
  const pending = state.pendingChoice;
  const retentionEvent: JourneyRetentionEventSnapshot = {
    sequence: state.retentionHistory.length + 1,
    atDecision: state.acceptedDecisions,
    reasons: cloneReasons(pending.reasons),
    checkpoint: pending.checkpoint,
    choice,
    decisionProofHash: state.decisionProof.hash,
  };
  const answeredCheckpoint = hasReason(pending, "checkpoint");
  if (answeredCheckpoint && state.nextCheckpoint === null) {
    throw new Error("Journey checkpoint choice is missing its next checkpoint.");
  }
  const nextState: JourneyContractSnapshot = {
    ...state,
    status: choice === "end" ? "ended" : "active",
    nextCheckpoint:
      choice === "end"
        ? null
        : answeredCheckpoint
          ? state.nextCheckpoint! + JOURNEY_BASELINE_DECISIONS
          : state.nextCheckpoint,
    pendingChoice: null,
    retentionHistory: [...state.retentionHistory, retentionEvent],
  };
  const frozenEvent = freezeRetentionEvent(retentionEvent);
  return {
    state: nextState,
    result: Object.freeze({
      journey: journeyPresentation(nextState),
      retentionEvent: frozenEvent,
      exitReceipt: buildJourneyExitReceipt(nextState),
    }),
  };
}

export function assertJourneyGoalCompletionProof(args: {
  journey: JourneyContractSnapshot;
  completedQuestIds: ReadonlySet<string>;
  questsById: ReadonlyMap<string, OverworldQuest>;
  startTownId: string;
}): void {
  const hasCompletedStartQuest = [...args.completedQuestIds].some(
    (questId) => args.questsById.get(questId)?.home === args.startTownId,
  );
  if (args.journey.goal.status === "completed" && !hasCompletedStartQuest) {
    throw new Error(
      "Journey goal is marked complete without a completed quest from the starting town.",
    );
  }
  if (args.journey.goal.status === "active" && hasCompletedStartQuest) {
    throw new Error("Journey goal is active despite a completed quest from the starting town.");
  }
}
