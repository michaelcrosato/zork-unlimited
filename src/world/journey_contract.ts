import { z } from "zod";

import { hashState } from "../core/hash.js";

export const JOURNEY_CONTRACT_VERSION = 3 as const;
export const JOURNEY_BASELINE_DECISIONS = 40 as const;
export const JOURNEY_EXIT_REASON = "player_ended_at_choice" as const;

export const INITIAL_JOURNEY_GOAL = Object.freeze({
  version: 1,
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

export type JourneyGoalIdentity = Readonly<{
  version: number;
  id: string;
}>;

export type JourneyGoalDefinition = Readonly<{
  version: number;
  id: string;
  text: string;
}>;

export type JourneyGoalSnapshot = {
  version: number;
  id: string;
  text: string;
  status: JourneyGoalStatus;
  completedAtDecision: number | null;
};

export type JourneyCompletedGoalSnapshot = {
  version: number;
  id: string;
  text: string;
  status: "completed";
  completedAtDecision: number;
};

export type JourneyPendingChoiceSnapshot = {
  atDecision: number;
  reasons: JourneyChoiceReason[];
  checkpoint: number | null;
  goalVersion: number | null;
  goalId: string | null;
};

export type JourneyRetentionEvent = Readonly<{
  sequence: number;
  atDecision: number;
  reasons: readonly JourneyChoiceReason[];
  checkpoint: number | null;
  goalVersion: number | null;
  goalId: string | null;
  choice: JourneyChoice;
  decisionProofHash: string;
}>;

type JourneyRetentionEventSnapshot = {
  sequence: number;
  atDecision: number;
  reasons: JourneyChoiceReason[];
  checkpoint: number | null;
  goalVersion: number | null;
  goalId: string | null;
  choice: JourneyChoice;
  decisionProofHash: string;
};

export type JourneyContractSnapshot = {
  version: typeof JOURNEY_CONTRACT_VERSION;
  status: JourneyStatus;
  goal: JourneyGoalSnapshot;
  goalHistory: JourneyCompletedGoalSnapshot[];
  acceptedDecisions: number;
  nextCheckpoint: number | null;
  decisionProof: {
    hash: string;
    last: JourneyDecisionProofLast | null;
  };
  pendingChoice: JourneyPendingChoiceSnapshot | null;
  retentionHistory: JourneyRetentionEventSnapshot[];
};

export type JourneyGoalPresentation = Readonly<JourneyGoalSnapshot>;
export type JourneyCompletedGoalPresentation = Readonly<JourneyCompletedGoalSnapshot>;

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
  goalVersion: number | null;
  goalId: string | null;
  message: string;
  options: readonly [JourneyChoiceOption, JourneyChoiceOption];
}>;

export type JourneyStoryChoiceOption = Readonly<{
  id: string;
  label: string;
  consequence: string;
}>;

export type JourneyStoryChoicePresentationKind = "registration";

export type JourneyStoryChoiceOptions = readonly [
  JourneyStoryChoiceOption,
  JourneyStoryChoiceOption,
];

export type JourneyRegistrationStoryChoiceOptions = readonly [
  JourneyStoryChoiceOption,
  JourneyStoryChoiceOption,
  JourneyStoryChoiceOption,
  JourneyStoryChoiceOption,
  ...JourneyStoryChoiceOption[],
];

type JourneyStoryChoicePromptBase = Readonly<{
  id: string;
  message: string;
}>;

export type JourneyStoryChoicePrompt = JourneyStoryChoicePromptBase &
  Readonly<
    | {
        /** Omitted for the existing two-option post-goal aftermath presentation. */
        kind?: undefined;
        options: JourneyStoryChoiceOptions;
      }
    | {
        kind: JourneyStoryChoicePresentationKind;
        options: JourneyRegistrationStoryChoiceOptions;
      }
  >;

export type JourneyGoalCompletionPresentationContext = Readonly<{
  goalVersion: number;
  goalId: string;
  messagePrefix?: string;
  messageSuffix?: string;
  continueConsequencePrefix?: string;
  continueConsequenceSuffix?: string;
}>;

/**
 * A player-facing, game-owned passage toward the current authored objective.
 * It deliberately carries no town ids, road ids, intermediate path, or event
 * details: those become visible only as the player actually travels them.
 */
export type JourneyGoalPassagePresentation = Readonly<{
  id: "follow_current_goal";
  label: string;
  destination: string;
  roadCount: number;
  baseMinutes: number;
  estimatedMinutes: number;
  suppliesNeeded: number;
  supplyDeficit: number;
  suppliesAfter: number;
  fatigueAfter: number;
  travelConditionAfter: string;
  consequence: string;
  stopRule: string;
}>;

export type JourneyPresentationContext = Readonly<{
  goalCompletion?: JourneyGoalCompletionPresentationContext;
  goalGuidance?: string | null;
  goalPassage?: JourneyGoalPassagePresentation | null;
  storyChoice?: JourneyStoryChoicePrompt | null;
}>;

export type JourneyPresentation = Readonly<{
  contractVersion: typeof JOURNEY_CONTRACT_VERSION;
  status: JourneyStatus;
  goal: JourneyGoalPresentation;
  completedGoals: readonly JourneyCompletedGoalPresentation[];
  acceptedDecisions: number;
  baselineDecisions: typeof JOURNEY_BASELINE_DECISIONS;
  nextCheckpoint: number | null;
  decisionProof: JourneyDecisionProof;
  goalGuidance: string | null;
  goalPassage: JourneyGoalPassagePresentation | null;
  pendingChoice: JourneyChoicePrompt | null;
  storyChoice: JourneyStoryChoicePrompt | null;
  retentionHistory: readonly JourneyRetentionEvent[];
}>;

export type JourneyExitReceipt = Readonly<{
  contractVersion: typeof JOURNEY_CONTRACT_VERSION;
  exitReason: typeof JOURNEY_EXIT_REASON;
  goalVersion: number;
  goalId: string;
  goalText: string;
  goalStatus: JourneyGoalStatus;
  goalCompletedAtDecision: number | null;
  completedGoals: readonly JourneyCompletedGoalPresentation[];
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

function initialDecisionProofHash(goal: JourneyGoalDefinition): string {
  return hashState({
    contractVersion: JOURNEY_CONTRACT_VERSION,
    goalVersion: goal.version,
    goalId: goal.id,
    goalText: goal.text,
    baselineDecisions: JOURNEY_BASELINE_DECISIONS,
    acceptedDecisions: 0,
  });
}

export const JOURNEY_INITIAL_DECISION_PROOF_HASH = initialDecisionProofHash(INITIAL_JOURNEY_GOAL);

const HASH_PATTERN = /^[0-9a-f]{64}$/;
const SAFE_NONNEGATIVE_INT = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const POSITIVE_SAFE_INT = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const JourneyChoiceSchema = z.enum(["continue", "end"]);
const JourneyChoiceReasonSchema = z.enum(["checkpoint", "goal_completed"]);
const JourneyGoalStatusSchema = z.enum(["active", "completed"]);
const JourneyCountedDecisionReasonSchema = z.enum([
  "movement",
  "stateful_clue",
  "substantive_dialogue",
  "combat",
  "skill_check",
  "preparation",
  "situation_changed",
]);

export const JourneyGoalDefinitionSchema = z
  .object({
    version: POSITIVE_SAFE_INT,
    id: z.string().min(1),
    text: z.string().min(1),
  })
  .strict();

const JourneyGoalSnapshotSchema = JourneyGoalDefinitionSchema.extend({
  status: JourneyGoalStatusSchema,
  completedAtDecision: SAFE_NONNEGATIVE_INT.nullable(),
}).strict();

const JourneyCompletedGoalSnapshotSchema = JourneyGoalDefinitionSchema.extend({
  status: z.literal("completed"),
  completedAtDecision: SAFE_NONNEGATIVE_INT,
}).strict();

const JourneyDecisionProofLastSchema = z
  .object({
    number: POSITIVE_SAFE_INT,
    surface: z.enum(["overworld", "quest"]),
    actionId: z.string().min(1),
    reason: JourneyCountedDecisionReasonSchema,
  })
  .strict();

const JourneyGoalBindingSchema = {
  goalVersion: POSITIVE_SAFE_INT.nullable(),
  goalId: z.string().min(1).nullable(),
} as const;

const JourneyPendingChoiceSchema = z
  .object({
    atDecision: SAFE_NONNEGATIVE_INT,
    reasons: z.array(JourneyChoiceReasonSchema).min(1).max(2),
    checkpoint: POSITIVE_SAFE_INT.nullable(),
    ...JourneyGoalBindingSchema,
  })
  .strict();

const JourneyRetentionEventSchema = z
  .object({
    sequence: POSITIVE_SAFE_INT,
    atDecision: SAFE_NONNEGATIVE_INT,
    reasons: z.array(JourneyChoiceReasonSchema).min(1).max(2),
    checkpoint: POSITIVE_SAFE_INT.nullable(),
    ...JourneyGoalBindingSchema,
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

function sameCompletedGoal(
  left: JourneyGoalSnapshot,
  right: JourneyCompletedGoalSnapshot,
): boolean {
  return (
    left.version === right.version &&
    left.id === right.id &&
    left.text === right.text &&
    left.status === right.status &&
    left.completedAtDecision === right.completedAtDecision
  );
}

function addIssue(ctx: z.RefinementCtx, path: (string | number)[], message: string): void {
  ctx.addIssue({ code: z.ZodIssueCode.custom, path, message });
}

type CompletionBinding = {
  choice: JourneyChoice | null;
  path: (string | number)[];
};

export const JourneyContractSnapshotSchema = z
  .object({
    version: z.literal(JOURNEY_CONTRACT_VERSION),
    status: z.enum(["active", "awaiting_choice", "ended"]),
    goal: JourneyGoalSnapshotSchema,
    goalHistory: z.array(JourneyCompletedGoalSnapshotSchema),
    acceptedDecisions: SAFE_NONNEGATIVE_INT,
    nextCheckpoint: POSITIVE_SAFE_INT.nullable(),
    decisionProof: z
      .object({
        hash: z.string().regex(HASH_PATTERN),
        last: JourneyDecisionProofLastSchema.nullable(),
      })
      .strict(),
    pendingChoice: JourneyPendingChoiceSchema.nullable(),
    retentionHistory: z.array(JourneyRetentionEventSchema),
  })
  .strict()
  .superRefine((state, ctx) => {
    const { acceptedDecisions, decisionProof, goal, goalHistory, pendingChoice, retentionHistory } =
      state;

    if (acceptedDecisions === 0) {
      if (decisionProof.last !== null) {
        addIssue(ctx, ["decisionProof", "last"], "Zero decisions cannot have a last decision.");
      }
      const initialGoal = goalHistory[0] ?? goal;
      if (decisionProof.hash !== initialDecisionProofHash(initialGoal)) {
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

    let previousGoalCompletion = -1;
    goalHistory.forEach((completed, index) => {
      const expectedVersion = index + 1;
      if (completed.version !== expectedVersion) {
        addIssue(
          ctx,
          ["goalHistory", index, "version"],
          `Completed goal versions must form the sequence 1..N; expected ${expectedVersion}.`,
        );
      }
      if (completed.completedAtDecision > acceptedDecisions) {
        addIssue(
          ctx,
          ["goalHistory", index, "completedAtDecision"],
          "A completed goal cannot follow the accepted decision count.",
        );
      }
      if (completed.completedAtDecision < previousGoalCompletion) {
        addIssue(
          ctx,
          ["goalHistory", index, "completedAtDecision"],
          "Completed goal decisions must be nondecreasing.",
        );
      }
      previousGoalCompletion = completed.completedAtDecision;
    });

    if (goal.status === "active") {
      if (goal.completedAtDecision !== null) {
        addIssue(ctx, ["goal", "completedAtDecision"], "An active goal cannot be completed.");
      }
      const expectedVersion = goalHistory.length + 1;
      if (goal.version !== expectedVersion) {
        addIssue(
          ctx,
          ["goal", "version"],
          `The active goal must be version ${expectedVersion}, immediately after completed history.`,
        );
      }
    } else {
      const latest = goalHistory.at(-1);
      if (!latest || !sameCompletedGoal(goal, latest)) {
        addIssue(
          ctx,
          ["goal"],
          "The completed current goal must exactly equal the latest completed goal history entry.",
        );
      }
      if (goal.completedAtDecision === null || goal.completedAtDecision > acceptedDecisions) {
        addIssue(
          ctx,
          ["goal", "completedAtDecision"],
          "Completed goal decision must exist and cannot exceed acceptedDecisions.",
        );
      }
    }

    const completionBindings = new Map<number, CompletionBinding[]>();
    const validateGoalBinding = (
      value: {
        atDecision: number;
        reasons: readonly JourneyChoiceReason[];
        goalVersion: number | null;
        goalId: string | null;
      },
      path: (string | number)[],
      choice: JourneyChoice | null,
    ): void => {
      const completesGoal = hasReason(value, "goal_completed");
      if (!completesGoal) {
        if (value.goalVersion !== null || value.goalId !== null) {
          addIssue(
            ctx,
            path,
            "Checkpoint-only retention evidence must use null goalVersion and goalId.",
          );
        }
        return;
      }
      if (value.goalVersion === null || value.goalId === null) {
        addIssue(ctx, path, "Goal-completion retention evidence must bind goalVersion and goalId.");
        return;
      }
      const completed = goalHistory[value.goalVersion - 1];
      if (!completed || completed.version !== value.goalVersion || completed.id !== value.goalId) {
        addIssue(ctx, path, "Goal-completion retention evidence references no completed goal.");
        return;
      }
      if (value.atDecision !== completed.completedAtDecision) {
        addIssue(
          ctx,
          [...path, "atDecision"],
          "Goal-completion retention evidence must match its goal completion decision.",
        );
      }
      const bindings = completionBindings.get(completed.version) ?? [];
      bindings.push({ choice, path });
      completionBindings.set(completed.version, bindings);
    };

    let expectedCheckpoint = JOURNEY_BASELINE_DECISIONS;
    let sawEnd = false;
    let previousRetentionDecision = -1;
    retentionHistory.forEach((event, index) => {
      const path: (string | number)[] = ["retentionHistory", index];
      if (event.sequence !== index + 1) {
        addIssue(ctx, [...path, "sequence"], "Retention sequence is not contiguous.");
      }
      if (event.atDecision < previousRetentionDecision || event.atDecision > acceptedDecisions) {
        addIssue(
          ctx,
          [...path, "atDecision"],
          "Retention event decisions must be ordered and cannot exceed acceptedDecisions.",
        );
      }
      previousRetentionDecision = event.atDecision;
      if (
        event.atDecision === acceptedDecisions &&
        event.decisionProofHash !== decisionProof.hash
      ) {
        addIssue(
          ctx,
          [...path, "decisionProofHash"],
          "Retention evidence at the current decision must match the journey decision proof.",
        );
      }
      if (!reasonsAreCanonical(event.reasons)) {
        addIssue(
          ctx,
          [...path, "reasons"],
          "Retention reasons must be unique and in canonical order.",
        );
      }
      const checkpointReason = hasReason(event, "checkpoint");
      if (checkpointReason) {
        if (event.checkpoint !== expectedCheckpoint || event.atDecision !== expectedCheckpoint) {
          addIssue(
            ctx,
            [...path, "checkpoint"],
            `Expected fixed journey checkpoint ${expectedCheckpoint}.`,
          );
        }
        if (event.choice === "continue") expectedCheckpoint += JOURNEY_BASELINE_DECISIONS;
      } else if (event.checkpoint !== null) {
        addIssue(
          ctx,
          [...path, "checkpoint"],
          "Only checkpoint prompts may carry a checkpoint number.",
        );
      }
      validateGoalBinding(event, path, event.choice);
      if (event.choice === "end") {
        sawEnd = true;
        if (index !== retentionHistory.length - 1) {
          addIssue(ctx, path, "Ending must be the final retention event.");
        }
      } else if (sawEnd) {
        addIssue(ctx, path, "Retention cannot continue after ending.");
      }
    });

    if (pendingChoice) {
      const path: (string | number)[] = ["pendingChoice"];
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
      validateGoalBinding(pendingChoice, path, null);
      if (hasReason(pendingChoice, "goal_completed")) {
        if (
          goal.status !== "completed" ||
          pendingChoice.goalVersion !== goal.version ||
          pendingChoice.goalId !== goal.id
        ) {
          addIssue(
            ctx,
            ["pendingChoice"],
            "A pending goal-completion choice must bind the completed current goal.",
          );
        }
      }
    } else if (state.status === "awaiting_choice") {
      addIssue(ctx, ["pendingChoice"], "awaiting_choice status requires a pending choice.");
    }

    goalHistory.forEach((completed, index) => {
      const bindings = completionBindings.get(completed.version) ?? [];
      if (bindings.length !== 1) {
        addIssue(
          ctx,
          ["goalHistory", index],
          "Every completed goal must have exactly one bound retention prompt or event.",
        );
      }
      if (completed.version < goal.version && bindings[0]?.choice !== "continue") {
        addIssue(
          ctx,
          ["goalHistory", index],
          "Activating a later goal requires a continued completion event for this goal.",
        );
      }
    });

    if (state.status === "ended") {
      if (pendingChoice !== null || state.nextCheckpoint !== null || !sawEnd) {
        addIssue(
          ctx,
          ["status"],
          "Ended journeys require a final end event and no pending/next checkpoint.",
        );
      }
    } else {
      if (sawEnd) {
        addIssue(ctx, ["retentionHistory"], "Only an ended journey may retain an end choice.");
      }
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
  });

function cloneReasons(reasons: readonly JourneyChoiceReason[]): JourneyChoiceReason[] {
  return [...reasons];
}

function cloneCompletedGoal(goal: JourneyCompletedGoalSnapshot): JourneyCompletedGoalSnapshot {
  return { ...goal };
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
    goalHistory: state.goalHistory.map(cloneCompletedGoal),
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

function assertGoalDefinition(goal: JourneyGoalDefinition, expectedVersion?: number): void {
  const parsed = JourneyGoalDefinitionSchema.parse(goal);
  if (expectedVersion !== undefined && parsed.version !== expectedVersion) {
    throw new Error(`Journey goal version must be ${expectedVersion}, got ${parsed.version}.`);
  }
}

export function createInitialJourneyContractSnapshot(
  initialGoal: JourneyGoalDefinition = INITIAL_JOURNEY_GOAL,
): JourneyContractSnapshot {
  assertGoalDefinition(initialGoal, 1);
  return {
    version: JOURNEY_CONTRACT_VERSION,
    status: "active",
    goal: {
      ...initialGoal,
      status: "active",
      completedAtDecision: null,
    },
    goalHistory: [],
    acceptedDecisions: 0,
    nextCheckpoint: JOURNEY_BASELINE_DECISIONS,
    decisionProof: {
      hash: initialDecisionProofHash(initialGoal),
      last: null,
    },
    pendingChoice: null,
    retentionHistory: [],
  };
}

function freezeGoal(goal: JourneyGoalSnapshot): JourneyGoalPresentation {
  return Object.freeze({ ...goal });
}

function freezeCompletedGoal(goal: JourneyCompletedGoalSnapshot): JourneyCompletedGoalPresentation {
  return Object.freeze({ ...goal });
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

function affix(base: string, prefix: string | undefined, suffix: string | undefined): string {
  return [prefix, base, suffix].filter((value): value is string => Boolean(value)).join(" ");
}

function matchingGoalCompletionContext(
  pending: JourneyPendingChoiceSnapshot,
  context: JourneyPresentationContext | undefined,
): JourneyGoalCompletionPresentationContext | undefined {
  const goalContext = context?.goalCompletion;
  if (
    !goalContext ||
    !hasReason(pending, "goal_completed") ||
    goalContext.goalVersion !== pending.goalVersion ||
    goalContext.goalId !== pending.goalId
  ) {
    return undefined;
  }
  return goalContext;
}

function pendingChoicePresentation(
  state: JourneyContractSnapshot,
  context?: JourneyPresentationContext,
): JourneyChoicePrompt | null {
  const pending = state.pendingChoice;
  if (!pending) return null;
  const checkpoint = hasReason(pending, "checkpoint");
  const goalContext = matchingGoalCompletionContext(pending, context);
  const continueTo = checkpoint
    ? (state.nextCheckpoint ?? 0) + JOURNEY_BASELINE_DECISIONS
    : state.nextCheckpoint;
  const continueLabel = checkpoint
    ? `Continue for ${JOURNEY_BASELINE_DECISIONS} more decisions`
    : `Continue to decision ${String(state.nextCheckpoint)}`;
  return Object.freeze({
    id: `journey:${pending.atDecision}:${pending.reasons.join("+")}:${String(pending.goalVersion ?? "none")}:${pending.goalId ?? "none"}`,
    atDecision: pending.atDecision,
    reasons: Object.freeze(cloneReasons(pending.reasons)),
    checkpoint: pending.checkpoint,
    goalVersion: pending.goalVersion,
    goalId: pending.goalId,
    message: affix(
      pendingChoiceMessage(state),
      goalContext?.messagePrefix,
      goalContext?.messageSuffix,
    ),
    options: Object.freeze([
      Object.freeze({
        id: "continue" as const,
        label: continueLabel,
        consequence: affix(
          `Play remains open; the next fixed checkpoint is decision ${String(continueTo)}.`,
          goalContext?.continueConsequencePrefix,
          goalContext?.continueConsequenceSuffix,
        ),
      }),
      Object.freeze({
        id: "end" as const,
        label: "End this journey",
        consequence: "This journey becomes read-only and its exit receipt is ready for review.",
      }),
    ]) as readonly [JourneyChoiceOption, JourneyChoiceOption],
  });
}

function freezeStoryChoice(
  storyChoice: JourneyStoryChoicePrompt | null | undefined,
): JourneyStoryChoicePrompt | null {
  if (!storyChoice) return null;
  if (storyChoice.id.length === 0 || storyChoice.message.length === 0) {
    throw new Error("Journey story choice id and message cannot be empty.");
  }
  const presentationKind = (storyChoice as { kind?: unknown }).kind;
  if (presentationKind !== undefined && presentationKind !== "registration") {
    throw new Error(
      `Journey story choice has unknown presentation kind "${String(presentationKind)}".`,
    );
  }
  if (presentationKind === "registration") {
    if (storyChoice.options.length < 4 || storyChoice.options.length > 8) {
      throw new Error("Journey registration choice requires between four and eight options.");
    }
  } else if (storyChoice.options.length !== 2) {
    throw new Error("Journey aftermath story choice requires exactly two options.");
  }
  const optionIds = new Set<string>();
  const options = storyChoice.options.map((option) => {
    if (option.id.length === 0 || option.label.length === 0 || option.consequence.length === 0) {
      throw new Error("Journey story choice option fields cannot be empty.");
    }
    if (optionIds.has(option.id)) {
      throw new Error("Journey story choice option ids must be unique.");
    }
    optionIds.add(option.id);
    return Object.freeze({ ...option });
  });
  const frozenOptions = Object.freeze(options);
  return Object.freeze({
    ...storyChoice,
    options: frozenOptions,
  }) as JourneyStoryChoicePrompt;
}

function freezeGoalPassage(
  goalPassage: JourneyGoalPassagePresentation | null | undefined,
): JourneyGoalPassagePresentation | null {
  if (!goalPassage) return null;
  if (goalPassage.id !== "follow_current_goal") {
    throw new Error("Journey goal passage has an unknown action id.");
  }
  if (
    goalPassage.label.trim().length === 0 ||
    goalPassage.destination.trim().length === 0 ||
    goalPassage.consequence.trim().length === 0 ||
    goalPassage.stopRule.trim().length === 0 ||
    goalPassage.travelConditionAfter.trim().length === 0
  ) {
    throw new Error("Journey goal passage text fields cannot be empty.");
  }
  for (const value of [
    goalPassage.roadCount,
    goalPassage.baseMinutes,
    goalPassage.estimatedMinutes,
    goalPassage.suppliesNeeded,
    goalPassage.supplyDeficit,
    goalPassage.suppliesAfter,
    goalPassage.fatigueAfter,
  ]) {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new Error("Journey goal passage estimates must be non-negative safe integers.");
    }
  }
  if (goalPassage.roadCount === 0) {
    throw new Error("Journey goal passage requires at least one road.");
  }
  return Object.freeze({
    id: goalPassage.id,
    label: goalPassage.label,
    destination: goalPassage.destination,
    roadCount: goalPassage.roadCount,
    baseMinutes: goalPassage.baseMinutes,
    estimatedMinutes: goalPassage.estimatedMinutes,
    suppliesNeeded: goalPassage.suppliesNeeded,
    supplyDeficit: goalPassage.supplyDeficit,
    suppliesAfter: goalPassage.suppliesAfter,
    fatigueAfter: goalPassage.fatigueAfter,
    travelConditionAfter: goalPassage.travelConditionAfter,
    consequence: goalPassage.consequence,
    stopRule: goalPassage.stopRule,
  });
}

export function journeyPresentation(
  state: JourneyContractSnapshot,
  context?: JourneyPresentationContext,
): JourneyPresentation {
  const goalGuidance = context?.goalGuidance ?? null;
  if (goalGuidance !== null && goalGuidance.trim().length === 0) {
    throw new Error("Journey goal guidance cannot be empty.");
  }
  return Object.freeze({
    contractVersion: JOURNEY_CONTRACT_VERSION,
    status: state.status,
    goal: freezeGoal(state.goal),
    completedGoals: Object.freeze(state.goalHistory.map(freezeCompletedGoal)),
    acceptedDecisions: state.acceptedDecisions,
    baselineDecisions: JOURNEY_BASELINE_DECISIONS,
    nextCheckpoint: state.nextCheckpoint,
    decisionProof: Object.freeze({
      hash: state.decisionProof.hash,
      last: state.decisionProof.last ? Object.freeze({ ...state.decisionProof.last }) : null,
    }),
    goalGuidance,
    goalPassage: freezeGoalPassage(context?.goalPassage),
    pendingChoice: pendingChoicePresentation(state, context),
    storyChoice: freezeStoryChoice(context?.storyChoice),
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
  if (decision.actionId.length === 0) {
    throw new Error("Accepted journey action id cannot be empty.");
  }
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
          goalVersion: null,
          goalId: null,
        }
      : null,
  };
}

/** Apply one accepted gameplay outcome to the versioned journey contract. */
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
  const goal: JourneyCompletedGoalSnapshot = {
    ...state.goal,
    status: "completed",
    completedAtDecision: state.acceptedDecisions,
  };
  const goalHistory = [...state.goalHistory, goal];
  if (state.pendingChoice) {
    return {
      ...state,
      goal,
      goalHistory,
      pendingChoice: {
        ...state.pendingChoice,
        reasons: canonicalReasons([...state.pendingChoice.reasons, "goal_completed"]),
        goalVersion: goal.version,
        goalId: goal.id,
      },
    };
  }
  return {
    ...state,
    status: "awaiting_choice",
    goal,
    goalHistory,
    pendingChoice: {
      atDecision: state.acceptedDecisions,
      reasons: ["goal_completed"],
      checkpoint: null,
      goalVersion: goal.version,
      goalId: goal.id,
    },
  };
}

export function hasContinuedJourneyGoal(
  state: JourneyContractSnapshot,
  goal: JourneyGoalIdentity,
): boolean {
  return state.retentionHistory.some(
    (event) =>
      event.choice === "continue" &&
      hasReason(event, "goal_completed") &&
      event.goalVersion === goal.version &&
      event.goalId === goal.id,
  );
}

export function activateJourneyGoal(
  state: JourneyContractSnapshot,
  definition: JourneyGoalDefinition,
): JourneyContractSnapshot {
  if (state.status === "ended") throw new Error("This journey has ended.");
  if (state.status !== "active" || state.pendingChoice !== null) {
    throw new Error("Answer the current journey choice before activating another goal.");
  }
  if (state.goal.status !== "completed") {
    throw new Error("The current journey goal must be completed before activating another goal.");
  }
  if (!hasContinuedJourneyGoal(state, state.goal)) {
    throw new Error(
      "Activating another journey goal requires continuing from the completed goal's choice.",
    );
  }
  const expectedVersion = state.goal.version + 1;
  assertGoalDefinition(definition, expectedVersion);
  return {
    ...state,
    goal: {
      ...definition,
      status: "active",
      completedAtDecision: null,
    },
  };
}

function buildJourneyExitReceipt(state: JourneyContractSnapshot): JourneyExitReceipt | null {
  if (state.status !== "ended") return null;
  const last = state.retentionHistory.at(-1);
  if (!last || last.choice !== "end") {
    throw new Error("Ended journey is missing its final retention event.");
  }
  const completedGoalsPayload = state.goalHistory.map(cloneCompletedGoal);
  const retentionHistoryPayload = state.retentionHistory.map((event) => ({
    ...event,
    reasons: cloneReasons(event.reasons),
  }));
  const payload = {
    contractVersion: JOURNEY_CONTRACT_VERSION,
    exitReason: JOURNEY_EXIT_REASON,
    goalVersion: state.goal.version,
    goalId: state.goal.id,
    goalText: state.goal.text,
    goalStatus: state.goal.status,
    goalCompletedAtDecision: state.goal.completedAtDecision,
    completedGoals: completedGoalsPayload,
    acceptedDecisions: state.acceptedDecisions,
    exitReasons: cloneReasons(last.reasons),
    checkpoint: last.checkpoint,
    decisionProofHash: state.decisionProof.hash,
    retentionHistory: retentionHistoryPayload,
  };
  return Object.freeze({
    ...payload,
    completedGoals: Object.freeze(state.goalHistory.map(freezeCompletedGoal)),
    exitReasons: Object.freeze(payload.exitReasons),
    retentionHistory: Object.freeze(state.retentionHistory.map(freezeRetentionEvent)),
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
    goalVersion: pending.goalVersion,
    goalId: pending.goalId,
    choice,
    decisionProofHash: state.decisionProof.hash,
  };
  const answeredCheckpoint = hasReason(pending, "checkpoint");
  if (answeredCheckpoint && state.nextCheckpoint === null) {
    throw new Error("Journey checkpoint choice is missing its next checkpoint.");
  }
  const nextCheckpoint =
    choice === "end"
      ? null
      : answeredCheckpoint
        ? state.nextCheckpoint! + JOURNEY_BASELINE_DECISIONS
        : state.nextCheckpoint;
  if (nextCheckpoint !== null && nextCheckpoint > Number.MAX_SAFE_INTEGER) {
    throw new Error("The next journey checkpoint exceeds JavaScript's safe integer range.");
  }
  const nextState: JourneyContractSnapshot = {
    ...state,
    status: choice === "end" ? "ended" : "active",
    nextCheckpoint,
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
