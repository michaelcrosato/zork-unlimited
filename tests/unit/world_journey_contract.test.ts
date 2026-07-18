import { describe, expect, it } from "vitest";

import { hashState } from "../../src/core/hash.js";
import {
  INITIAL_JOURNEY_GOAL,
  INITIAL_JOURNEY_GOAL_GUIDANCE,
  JOURNEY_BASELINE_DECISIONS,
  JOURNEY_CONTRACT_VERSION,
  JOURNEY_EXIT_REASON,
  JourneyContractSnapshotSchema,
  activateJourneyGoal,
  chooseJourney,
  cloneJourneyContractSnapshot,
  createInitialJourneyContractSnapshot,
  hasContinuedJourneyGoal,
  journeyExitReceipt,
  journeyPresentation,
  recordJourneyAcceptedDecision,
  recordJourneyCharacterDied,
  recordJourneyDecision,
  recordJourneyGoalCompleted,
  type JourneyContractSnapshot,
  type JourneyGoalDefinition,
  type JourneyAllyStoryChoiceOptions,
  type JourneyReliefOathStoryChoiceOptions,
  type JourneyRegistrationStoryChoiceOptions,
  type JourneyStoryChoicePrompt,
} from "../../src/world/journey_contract.js";
import {
  countedJourneyDecision,
  excludedJourneyDecision,
} from "../../src/world/journey_decision.js";

const GOAL_TWO = Object.freeze({
  version: 2,
  id: "queensbury_gallowmere",
  text: "Carry Albany's lead to Queensbury and see The Gallowmere through.",
}) satisfies JourneyGoalDefinition;

const GOAL_THREE = Object.freeze({
  version: 3,
  id: "north_country_aftermath",
  text: "Follow the Queensbury evidence north and settle what remains.",
}) satisfies JourneyGoalDefinition;

function decide(
  state: JourneyContractSnapshot,
  actionId: string,
  surface: "overworld" | "quest" = "overworld",
): JourneyContractSnapshot {
  return recordJourneyAcceptedDecision(state, {
    surface,
    actionId,
    reason: "situation_changed",
  });
}

function decideUntil(state: JourneyContractSnapshot, target: number): JourneyContractSnapshot {
  let next = state;
  while (next.acceptedDecisions < target) {
    next = decide(next, `action:${String(next.acceptedDecisions + 1)}`);
  }
  return next;
}

function completeContinueAndActivate(
  state: JourneyContractSnapshot,
  nextGoal: JourneyGoalDefinition,
): JourneyContractSnapshot {
  const completed = recordJourneyGoalCompleted(state);
  const continued = chooseJourney(completed, "continue").state;
  return activateJourneyGoal(continued, nextGoal);
}

describe("journey contract v3 goals", () => {
  it("starts with a dynamic version-1 goal and an immutable player presentation", () => {
    const state = createInitialJourneyContractSnapshot();
    const view = journeyPresentation(state);

    expect(JourneyContractSnapshotSchema.parse(state)).toEqual(state);
    expect(view).toMatchObject({
      contractVersion: JOURNEY_CONTRACT_VERSION,
      status: "active",
      goal: {
        ...INITIAL_JOURNEY_GOAL,
        status: "active",
        completedAtDecision: null,
      },
      completedGoals: [],
      acceptedDecisions: 0,
      baselineDecisions: JOURNEY_BASELINE_DECISIONS,
      nextCheckpoint: 40,
      goalGuidance: INITIAL_JOURNEY_GOAL_GUIDANCE,
      pendingChoice: null,
      storyChoice: null,
      retentionHistory: [],
    });
    expect(Object.isFrozen(view)).toBe(true);
    expect(Object.isFrozen(view.goal)).toBe(true);
    expect(Object.isFrozen(view.completedGoals)).toBe(true);
    expect(Object.isFrozen(view.decisionProof)).toBe(true);
    expect(Object.isFrozen(view.retentionHistory)).toBe(true);
    expect(view.goal.text).toBe(INITIAL_JOURNEY_GOAL.text);
    expect(state.decisionProof.hash).toBe(
      createInitialJourneyContractSnapshot().decisionProof.hash,
    );

    const customGoal = {
      version: 1,
      id: "custom_opening",
      text: "Follow one local lead and decide what it means.",
    } satisfies JourneyGoalDefinition;
    const custom = createInitialJourneyContractSnapshot(customGoal);
    expect(JourneyContractSnapshotSchema.parse(custom)).toEqual(custom);
    expect(custom.goal).toMatchObject(customGoal);
    expect(journeyPresentation(custom).goalGuidance).toBeNull();
    expect(custom.decisionProof.hash).not.toBe(state.decisionProof.hash);
    expect(() => createInitialJourneyContractSnapshot({ ...customGoal, version: 2 })).toThrow(
      /version must be 1/i,
    );

    const zeroDecisionFollowup = activateJourneyGoal(
      chooseJourney(recordJourneyGoalCompleted(state), "continue").state,
      GOAL_TWO,
    );
    expect(JourneyContractSnapshotSchema.parse(zeroDecisionFollowup)).toEqual(zeroDecisionFollowup);
  });

  it("offers checkpoint-only choices at 40, 80, 120, and 160 decisions", () => {
    let state = decideUntil(createInitialJourneyContractSnapshot(), 40);

    for (const checkpoint of [40, 80, 120, 160]) {
      const view = journeyPresentation(state);
      expect(view).toMatchObject({
        status: "awaiting_choice",
        acceptedDecisions: checkpoint,
        pendingChoice: {
          atDecision: checkpoint,
          reasons: ["checkpoint"],
          checkpoint,
          goalVersion: null,
          goalId: null,
          options: [
            {
              id: "continue",
              label: "Continue for 40 more decisions",
              consequence: `Play remains open; the next fixed checkpoint is decision ${String(checkpoint + 40)}.`,
            },
            { id: "end" },
          ],
        },
      });
      expect(view.goalGuidance).toBe(INITIAL_JOURNEY_GOAL_GUIDANCE);
      expect(JourneyContractSnapshotSchema.parse(state)).toEqual(state);
      expect(() => decide(state, "blocked")).toThrow(/choose whether to continue or end/i);

      if (checkpoint === 160) break;
      const continued = chooseJourney(state, "continue");
      expect(continued.result.retentionEvent).toMatchObject({
        checkpoint,
        goalVersion: null,
        goalId: null,
        choice: "continue",
      });
      state = decideUntil(continued.state, checkpoint + JOURNEY_BASELINE_DECISIONS);
    }
  });

  it("binds an early completion choice to the completed goal before activating the next goal", () => {
    const played = decide(createInitialJourneyContractSnapshot(), "quest:ending", "quest");
    const completed = recordJourneyGoalCompleted(played);

    expect(completed.goalHistory).toEqual([
      {
        ...INITIAL_JOURNEY_GOAL,
        status: "completed",
        completedAtDecision: 1,
      },
    ]);
    expect(journeyPresentation(completed).pendingChoice).toMatchObject({
      atDecision: 1,
      reasons: ["goal_completed"],
      checkpoint: null,
      goalVersion: 1,
      goalId: INITIAL_JOURNEY_GOAL.id,
      options: [
        {
          id: "continue",
          label: "Continue to decision 40",
          consequence: "Play remains open; the next fixed checkpoint is decision 40.",
        },
        { id: "end" },
      ],
    });
    expect(() => activateJourneyGoal(completed, GOAL_TWO)).toThrow(/answer.*choice/i);

    const continued = chooseJourney(completed, "continue");
    expect(continued.result.retentionEvent).toMatchObject({
      sequence: 1,
      atDecision: 1,
      reasons: ["goal_completed"],
      checkpoint: null,
      goalVersion: 1,
      goalId: INITIAL_JOURNEY_GOAL.id,
      choice: "continue",
    });
    expect(hasContinuedJourneyGoal(continued.state, INITIAL_JOURNEY_GOAL)).toBe(true);
    expect(() => activateJourneyGoal(continued.state, GOAL_THREE)).toThrow(/version must be 2/i);

    const activated = activateJourneyGoal(continued.state, GOAL_TWO);
    expect(activated).toMatchObject({
      status: "active",
      acceptedDecisions: 1,
      nextCheckpoint: 40,
      goal: { ...GOAL_TWO, status: "active", completedAtDecision: null },
      goalHistory: [{ version: 1, id: INITIAL_JOURNEY_GOAL.id, status: "completed" }],
    });
    expect(JourneyContractSnapshotSchema.parse(activated)).toEqual(activated);
  });

  it("tracks two completed goals and emits goal-bound retention evidence in the end receipt", () => {
    let state = decide(createInitialJourneyContractSnapshot(), "wolf:ending", "quest");
    state = completeContinueAndActivate(state, GOAL_TWO);
    state = decide(state, "gallowmere:ending", "quest");
    state = recordJourneyGoalCompleted(state);

    expect(state.pendingChoice).toMatchObject({
      reasons: ["goal_completed"],
      goalVersion: 2,
      goalId: GOAL_TWO.id,
    });
    expect(state.goalHistory).toEqual([
      { ...INITIAL_JOURNEY_GOAL, status: "completed", completedAtDecision: 1 },
      { ...GOAL_TWO, status: "completed", completedAtDecision: 2 },
    ]);

    const ended = chooseJourney(state, "end");
    const receipt = ended.result.exitReceipt;
    expect(receipt).toMatchObject({
      contractVersion: JOURNEY_CONTRACT_VERSION,
      exitReason: JOURNEY_EXIT_REASON,
      goalVersion: 2,
      goalId: GOAL_TWO.id,
      goalText: GOAL_TWO.text,
      goalStatus: "completed",
      goalCompletedAtDecision: 2,
      acceptedDecisions: 2,
      completedGoals: [
        { version: 1, id: INITIAL_JOURNEY_GOAL.id, completedAtDecision: 1 },
        { version: 2, id: GOAL_TWO.id, completedAtDecision: 2 },
      ],
      exitReasons: ["goal_completed"],
      checkpoint: null,
      retentionHistory: [
        {
          sequence: 1,
          goalVersion: 1,
          goalId: INITIAL_JOURNEY_GOAL.id,
          choice: "continue",
        },
        { sequence: 2, goalVersion: 2, goalId: GOAL_TWO.id, choice: "end" },
      ],
    });
    expect(receipt?.receiptHash).toMatch(/^[0-9a-f]{64}$/);
    expect(Object.isFrozen(receipt)).toBe(true);
    expect(Object.isFrozen(receipt?.completedGoals)).toBe(true);
    expect(Object.isFrozen(receipt?.completedGoals[0])).toBe(true);
    expect(Object.isFrozen(receipt?.retentionHistory)).toBe(true);
    expect(Object.isFrozen(receipt?.retentionHistory[0]?.reasons)).toBe(true);
    expect(journeyExitReceipt(ended.state)).toEqual(receipt);
    expect(JourneyContractSnapshotSchema.parse(ended.state)).toEqual(ended.state);

    const { receiptHash, ...payload } = receipt!;
    expect(hashState(payload)).toBe(receiptHash);
  });

  it("preserves completed goal history when the player ends at a later checkpoint", () => {
    let state = decide(createInitialJourneyContractSnapshot(), "wolf:ending", "quest");
    state = completeContinueAndActivate(state, GOAL_TWO);
    state = decideUntil(state, 40);

    expect(state.pendingChoice).toMatchObject({
      reasons: ["checkpoint"],
      checkpoint: 40,
      goalVersion: null,
      goalId: null,
    });
    const receipt = chooseJourney(state, "end").result.exitReceipt;
    expect(receipt).toMatchObject({
      goalVersion: 2,
      goalId: GOAL_TWO.id,
      goalStatus: "active",
      goalCompletedAtDecision: null,
      completedGoals: [{ version: 1, id: INITIAL_JOURNEY_GOAL.id }],
      retentionHistory: [
        { sequence: 1, goalVersion: 1, goalId: INITIAL_JOURNEY_GOAL.id },
        { sequence: 2, checkpoint: 40, goalVersion: null, goalId: null, choice: "end" },
      ],
    });
  });

  it("merges a second goal completion into an already-pending fixed checkpoint", () => {
    let state = decide(createInitialJourneyContractSnapshot(), "wolf:ending", "quest");
    state = completeContinueAndActivate(state, GOAL_TWO);
    state = decideUntil(state, 40);
    state = chooseJourney(state, "continue").state;
    state = decideUntil(state, 80);
    state = recordJourneyGoalCompleted(state);

    expect(state.pendingChoice).toEqual({
      atDecision: 80,
      reasons: ["checkpoint", "goal_completed"],
      checkpoint: 80,
      goalVersion: 2,
      goalId: GOAL_TWO.id,
    });
    expect(JourneyContractSnapshotSchema.parse(state)).toEqual(state);

    const continued = chooseJourney(state, "continue").state;
    expect(continued.nextCheckpoint).toBe(120);
    expect(hasContinuedJourneyGoal(continued, GOAL_TWO)).toBe(true);
    expect(
      JourneyContractSnapshotSchema.parse(activateJourneyGoal(continued, GOAL_THREE)),
    ).toBeTruthy();
  });

  it("turns character death into an end-only pause with an unfinished-goal receipt", () => {
    const active = decideUntil(createInitialJourneyContractSnapshot(), 7);
    const died = recordJourneyCharacterDied(active);

    expect(JourneyContractSnapshotSchema.safeParse(died).success).toBe(true);
    expect(journeyPresentation(died)).toMatchObject({
      status: "awaiting_choice",
      goal: { status: "active", completedAtDecision: null },
      pendingChoice: {
        atDecision: 7,
        reasons: ["character_died"],
        checkpoint: null,
        goalVersion: null,
        goalId: null,
        options: [{ id: "end" }],
      },
    });
    expect(journeyPresentation(died).pendingChoice?.options).toHaveLength(1);
    expect(journeyPresentation(died).goalGuidance).toBeNull();
    expect(() => chooseJourney(died, "continue")).toThrow(/character died/i);

    const ended = chooseJourney(died, "end").state;
    expect(JourneyContractSnapshotSchema.safeParse(ended).success).toBe(true);
    expect(journeyExitReceipt(ended)).toMatchObject({
      goalStatus: "active",
      goalCompletedAtDecision: null,
      exitReasons: ["character_died"],
      checkpoint: null,
      retentionHistory: [{ choice: "end", reasons: ["character_died"] }],
    });

    const forgedContinue = cloneJourneyContractSnapshot(ended);
    forgedContinue.retentionHistory[0]!.choice = "continue";
    const forged = JourneyContractSnapshotSchema.safeParse(forgedContinue);
    expect(forged.success).toBe(false);
    if (!forged.success) {
      expect(forged.error.issues.map((issue) => issue.message).join("\n")).toMatch(
        /character death can only end/i,
      );
    }
  });

  it("preserves a fixed checkpoint when character death lands on its exact decision", () => {
    const checkpoint = decideUntil(
      createInitialJourneyContractSnapshot(),
      JOURNEY_BASELINE_DECISIONS,
    );
    const died = recordJourneyCharacterDied(checkpoint);

    expect(JourneyContractSnapshotSchema.safeParse(died).success).toBe(true);
    expect(died.pendingChoice).toMatchObject({
      atDecision: JOURNEY_BASELINE_DECISIONS,
      reasons: ["checkpoint", "character_died"],
      checkpoint: JOURNEY_BASELINE_DECISIONS,
      goalVersion: null,
      goalId: null,
    });
    expect(journeyPresentation(died).goalGuidance).toBeNull();
    expect(chooseJourney(died, "end").result.exitReceipt).toMatchObject({
      goalStatus: "active",
      exitReasons: ["checkpoint", "character_died"],
      checkpoint: JOURNEY_BASELINE_DECISIONS,
    });

    const completed = recordJourneyGoalCompleted(
      decide(createInitialJourneyContractSnapshot(), "finish-goal"),
    );
    expect(() => recordJourneyCharacterDied(completed)).toThrow(/completed-goal choice/i);
  });
});

describe("journey contract presentation context", () => {
  it("applies only the matching completion hook and deep-freezes a content-owned story choice", () => {
    const pending = recordJourneyGoalCompleted(
      decide(createInitialJourneyContractSnapshot(), "wolf:ending", "quest"),
    );
    const storyChoice: JourneyStoryChoicePrompt = {
      id: "wolf_winter_aftermath",
      message: "One relief wagon waits at dawn. Where should it go?",
      options: [
        {
          id: "repair_cade",
          label: "Repair Cade's line",
          consequence: "The wagon returns to Cade while you carry the packet north.",
        },
        {
          id: "send_wardens",
          label: "Send wardens north",
          consequence: "The wagon follows the new lead while Cade holds with what remains.",
        },
      ],
    };
    const baseMessage = journeyPresentation(pending).pendingChoice!.message;
    const view = journeyPresentation(pending, {
      goalGuidance: "Objective route: take the north road.",
      goalCompletion: {
        goalVersion: 1,
        goalId: INITIAL_JOURNEY_GOAL.id,
        messagePrefix: "Cade's cattle survived.",
        messageSuffix: "Hayden has another live packet.",
        continueConsequencePrefix: "Continue to allocate the wagon.",
        continueConsequenceSuffix: "Your choice will shape the next lead.",
      },
      storyChoice,
    });

    expect(view.pendingChoice?.message).toBe(
      `Cade's cattle survived. ${baseMessage} Hayden has another live packet.`,
    );
    expect(view.pendingChoice?.options[0].consequence).toBe(
      "Continue to allocate the wagon. Play remains open; the next fixed checkpoint is decision 40. Your choice will shape the next lead.",
    );
    expect(view.storyChoice).toEqual(storyChoice);
    expect(Object.keys(view.storyChoice!).sort()).toEqual(["id", "message", "options"]);
    expect(view.goalGuidance).toBe("Objective route: take the north road.");
    expect(view.storyChoice).not.toBe(storyChoice);
    expect(Object.isFrozen(view.storyChoice)).toBe(true);
    expect(Object.isFrozen(view.storyChoice?.options)).toBe(true);
    expect(Object.isFrozen(view.storyChoice?.options[0])).toBe(true);
    expect(() => {
      (view.storyChoice as unknown as { message: string }).message = "forged";
    }).toThrow(TypeError);

    const mismatched = journeyPresentation(pending, {
      goalCompletion: {
        goalVersion: 2,
        goalId: GOAL_TWO.id,
        messagePrefix: "Must not appear.",
      },
    });
    expect(mismatched.pendingChoice?.message).toBe(baseMessage);
    expect(() => journeyPresentation(pending, { goalGuidance: "   " })).toThrow(
      /goal guidance cannot be empty/i,
    );
  });

  it("rejects malformed story choices instead of exposing ambiguous content", () => {
    const state = createInitialJourneyContractSnapshot();
    const duplicateIds = {
      id: "duplicate",
      message: "Choose.",
      options: [
        { id: "same", label: "One", consequence: "First." },
        { id: "same", label: "Two", consequence: "Second." },
      ],
    } satisfies JourneyStoryChoicePrompt;
    expect(() => journeyPresentation(state, { storyChoice: duplicateIds })).toThrow(
      /option ids must be unique/i,
    );
    expect(() =>
      journeyPresentation(state, {
        storyChoice: {
          ...duplicateIds,
          options: [duplicateIds.options[0]],
        } as unknown as JourneyStoryChoicePrompt,
      }),
    ).toThrow(/exactly two options/i);

    const nineOptions = Array.from({ length: 9 }, (_, index) => ({
      id: `choice_${String(index)}`,
      label: `Choice ${String(index)}`,
      consequence: `Consequence ${String(index)}.`,
    }));
    expect(() =>
      journeyPresentation(state, {
        storyChoice: {
          id: "too_many",
          message: "Choose.",
          options: nineOptions,
        } as unknown as JourneyStoryChoicePrompt,
      }),
    ).toThrow(/exactly two options/i);

    expect(() =>
      journeyPresentation(state, {
        storyChoice: {
          id: "unknown_kind",
          message: "Choose.",
          kind: "aftermath",
          options: duplicateIds.options,
        } as unknown as JourneyStoryChoicePrompt,
      }),
    ).toThrow(/unknown presentation kind/i);
  });

  it("deep-freezes a typed registration presentation with up to eight unique options", () => {
    const state = createInitialJourneyContractSnapshot();
    const registration = {
      id: "albany_registration",
      kind: "registration",
      message: "Which lived history do you put on Rowan's relief docket?",
      options: Array.from({ length: 8 }, (_, index) => ({
        id: `background_${String(index)}`,
        label: `Background ${String(index)}`,
        consequence: `Carry background ${String(index)} into the journey.`,
      })) as unknown as JourneyRegistrationStoryChoiceOptions,
    } satisfies JourneyStoryChoicePrompt;

    const view = journeyPresentation(state, { storyChoice: registration });

    expect(view.storyChoice).toEqual(registration);
    expect(Object.keys(view.storyChoice!).sort()).toEqual(["id", "kind", "message", "options"]);
    expect(view.storyChoice?.options).toHaveLength(8);
    expect(new Set(view.storyChoice?.options.map((option) => option.id)).size).toBe(8);
    expect(Object.isFrozen(view.storyChoice)).toBe(true);
    expect(Object.isFrozen(view.storyChoice?.options)).toBe(true);
    expect(view.storyChoice?.options.every((option) => Object.isFrozen(option))).toBe(true);
  });

  it("deep-freezes a typed ally commitment with three or four unique options", () => {
    const state = createInitialJourneyContractSnapshot();
    const ally = {
      id: "albany_wolf_ally",
      kind: "ally",
      message: "Capability: June can hold the cattle line. Condition: cattle come first.",
      options: Array.from({ length: 4 }, (_, index) => ({
        id: `ally_${String(index)}`,
        label: `Commitment ${String(index)}`,
        consequence: `Field consequence ${String(index)}. Actual cost: ${String(index)} minutes.`,
      })) as unknown as JourneyAllyStoryChoiceOptions,
    } satisfies JourneyStoryChoicePrompt;

    const view = journeyPresentation(state, { storyChoice: ally });

    expect(view.storyChoice).toEqual(ally);
    expect(view.storyChoice?.options).toHaveLength(4);
    expect(Object.isFrozen(view.storyChoice)).toBe(true);
    expect(Object.isFrozen(view.storyChoice?.options)).toBe(true);
    expect(view.storyChoice?.options.every((option) => Object.isFrozen(option))).toBe(true);

    expect(() =>
      journeyPresentation(state, {
        storyChoice: {
          ...ally,
          options: ally.options.slice(0, 2),
        } as unknown as JourneyStoryChoicePrompt,
      }),
    ).toThrow(/ally choice requires between three and four options/i);
    expect(() =>
      journeyPresentation(state, {
        storyChoice: {
          ...ally,
          options: [...ally.options, { ...ally.options[0], id: "ally_4" }],
        } as unknown as JourneyStoryChoicePrompt,
      }),
    ).toThrow(/ally choice requires between three and four options/i);
  });

  it("requires and deep-freezes exactly three relief-oath terms", () => {
    const state = createInitialJourneyContractSnapshot();
    const reliefOath = {
      id: "albany_relief_oath",
      kind: "relief_oath",
      message: "Choose the exact term that binds this dispatch.",
      options: Array.from({ length: 3 }, (_, index) => ({
        id: `oath_${String(index)}`,
        label: `Term ${String(index)}`,
        consequence: `Access and duty ${String(index)}.`,
      })) as unknown as JourneyReliefOathStoryChoiceOptions,
    } satisfies JourneyStoryChoicePrompt;

    const view = journeyPresentation(state, { storyChoice: reliefOath });
    expect(view.storyChoice).toEqual(reliefOath);
    expect(view.storyChoice?.options).toHaveLength(3);
    expect(Object.isFrozen(view.storyChoice)).toBe(true);
    expect(view.storyChoice?.options.every((option) => Object.isFrozen(option))).toBe(true);

    expect(() =>
      journeyPresentation(state, {
        storyChoice: {
          ...reliefOath,
          options: reliefOath.options.slice(0, 2),
        } as unknown as JourneyStoryChoicePrompt,
      }),
    ).toThrow(/relief-oath choice requires exactly three options/i);
  });
});

describe("journey contract persistence and validation", () => {
  it("deep-clones and restores multi-goal snapshots without shared nested state", () => {
    let state = decide(createInitialJourneyContractSnapshot(), "wolf:ending", "quest");
    state = completeContinueAndActivate(state, GOAL_TWO);
    state = decide(state, "gallowmere:progress", "quest");
    const source = recordJourneyGoalCompleted(state);
    const clone = cloneJourneyContractSnapshot(source);

    clone.goal.text = "changed current goal";
    clone.goalHistory[0]!.text = "changed history";
    clone.decisionProof.last = { ...clone.decisionProof.last!, actionId: "changed proof" };
    clone.pendingChoice!.reasons.reverse();
    clone.retentionHistory[0]!.reasons.push("checkpoint");

    expect(source.goal.text).toBe(GOAL_TWO.text);
    expect(source.goalHistory[0]!.text).toBe(INITIAL_JOURNEY_GOAL.text);
    expect(source.decisionProof.last?.actionId).toBe("gallowmere:progress");
    expect(source.pendingChoice?.reasons).toEqual(["goal_completed"]);
    expect(source.retentionHistory[0]!.reasons).toEqual(["goal_completed"]);

    const restored = JourneyContractSnapshotSchema.parse(JSON.parse(JSON.stringify(source)));
    expect(restored).toEqual(source);
    expect(restored).not.toBe(source);
    expect(restored.goalHistory).not.toBe(source.goalHistory);
    expect(restored.retentionHistory).not.toBe(source.retentionHistory);
  });

  it("rejects unbound, duplicate, out-of-sequence, and non-continued goal history", () => {
    const checkpoint = decideUntil(createInitialJourneyContractSnapshot(), 40);
    const forgedCheckpoint = cloneJourneyContractSnapshot(checkpoint);
    forgedCheckpoint.pendingChoice!.goalVersion = 1;
    forgedCheckpoint.pendingChoice!.goalId = INITIAL_JOURNEY_GOAL.id;
    expect(() => JourneyContractSnapshotSchema.parse(forgedCheckpoint)).toThrow(
      /without goal completion.*null/i,
    );

    const completion = recordJourneyGoalCompleted(
      decide(createInitialJourneyContractSnapshot(), "wolf:ending", "quest"),
    );
    const unbound = cloneJourneyContractSnapshot(completion);
    unbound.pendingChoice!.goalId = null;
    expect(() => JourneyContractSnapshotSchema.parse(unbound)).toThrow(
      /must bind goalVersion and goalId/i,
    );

    const continued = chooseJourney(completion, "continue").state;
    const duplicate = cloneJourneyContractSnapshot(continued);
    duplicate.retentionHistory.push({
      ...duplicate.retentionHistory[0]!,
      sequence: 2,
      reasons: [...duplicate.retentionHistory[0]!.reasons],
    });
    expect(() => JourneyContractSnapshotSchema.parse(duplicate)).toThrow(/exactly one bound/i);

    const activated = activateJourneyGoal(continued, GOAL_TWO);
    const skippedVersion = cloneJourneyContractSnapshot(activated);
    skippedVersion.goal.version = 3;
    expect(() => JourneyContractSnapshotSchema.parse(skippedVersion)).toThrow(
      /active goal must be version 2/i,
    );

    const notContinued = cloneJourneyContractSnapshot(activated);
    notContinued.retentionHistory[0]!.choice = "end";
    expect(() => JourneyContractSnapshotSchema.parse(notContinued)).toThrow(
      /activating a later goal requires a continued completion event/i,
    );

    const secondCompletion = recordJourneyGoalCompleted(
      decide(activated, "gallowmere:ending", "quest"),
    );
    const divergentCurrent = cloneJourneyContractSnapshot(secondCompletion);
    divergentCurrent.goal.text = "forged latest goal";
    expect(() => JourneyContractSnapshotSchema.parse(divergentCurrent)).toThrow(
      /exactly equal the latest completed goal history/i,
    );

    const wrongBinding = cloneJourneyContractSnapshot(secondCompletion);
    wrongBinding.pendingChoice!.goalId = "some_other_goal";
    expect(() => JourneyContractSnapshotSchema.parse(wrongBinding)).toThrow(
      /references no completed goal/i,
    );
  });

  it("does not count accepted context refreshes or rejected calls as player decisions", () => {
    const initial = createInitialJourneyContractSnapshot();
    const contextOnly = recordJourneyDecision(
      initial,
      { surface: "overworld", actionId: "view:refresh" },
      excludedJourneyDecision("context_only"),
    );
    const rejected = recordJourneyDecision(
      contextOnly,
      { surface: "overworld", actionId: "travel:not-a-road" },
      excludedJourneyDecision("rejected"),
    );

    expect(contextOnly).toBe(initial);
    expect(rejected).toBe(initial);
    expect(rejected.decisionProof).toEqual(initial.decisionProof);

    const counted = recordJourneyDecision(
      rejected,
      { surface: "quest", actionId: "ask:live-lead" },
      countedJourneyDecision("substantive_dialogue"),
    );
    expect(counted).toMatchObject({
      acceptedDecisions: 1,
      decisionProof: {
        last: {
          number: 1,
          surface: "quest",
          actionId: "ask:live-lead",
          reason: "substantive_dialogue",
        },
      },
    });
  });
});
