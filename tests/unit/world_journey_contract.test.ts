import { describe, expect, it } from "vitest";

import { hashState } from "../../src/core/hash.js";
import {
  INITIAL_JOURNEY_GOAL,
  JOURNEY_BASELINE_DECISIONS,
  JOURNEY_CONTRACT_VERSION,
  JOURNEY_EXIT_REASON,
  JourneyContractSnapshotSchema,
  assertJourneyGoalCompletionProof,
  chooseJourney,
  cloneJourneyContractSnapshot,
  createInitialJourneyContractSnapshot,
  journeyExitReceipt,
  journeyPresentation,
  recordJourneyAcceptedDecision,
  recordJourneyGoalCompleted,
  type JourneyContractSnapshot,
} from "../../src/world/journey_contract.js";
import type { OverworldManifest, OverworldQuest } from "../../src/world/overworld.js";
import { OverworldSession } from "../../src/world/session.js";
import { loadOverworldManifest } from "../../src/world/source.js";
import {
  countedJourneyDecision,
  excludedJourneyDecision,
} from "../../src/world/journey_decision.js";

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
    next = decide(next, `action:${next.acceptedDecisions + 1}`);
  }
  return next;
}

function quest(id: string, home: string): OverworldQuest {
  return {
    id,
    title: `${id} title`,
    source: `content/rpg/quests/${id}.yaml`,
    home,
    area: `${home}:area`,
    discovery: `${id} discovery`,
    visibility: "local_notice_board",
  };
}

function oneQuestWorld(): OverworldManifest {
  return {
    id: "new_york_overworld",
    name: "One-Quest New York",
    start: "albany_city",
    premise: "A compact journey-contract fixture.",
    sources: [],
    scale: {
      population_floor: 10_000,
      distance_model: "fixture",
      travel_time_model: "fixture",
      road_class_speed_mph: {
        interstate: 60,
        parkway: 35,
        state_route: 40,
        regional_connector: 25,
      },
    },
    design_rules: [],
    regions: [
      {
        id: "capital",
        name: "Capital",
        summary: "Fixture region.",
        gameplay_role: "Fixture role.",
      },
    ],
    regional_arcs: [],
    nodes: [
      {
        id: "albany_city",
        name: "Albany",
        kind: "city",
        source_geography: "incorporated_place",
        geoid: "fixture",
        county_fips: "001",
        population_2025: 100_000,
        lat: 42.65,
        lon: -73.75,
        region: "Capital",
        services: [],
        description: "Fixture Albany.",
      },
    ],
    edges: [],
    areas: [
      {
        id: "albany_area",
        home: "albany_city",
        name: "Albany Notice Hall",
        kind: "civic_core",
        summary: "A fixture notice hall.",
        discovery: "The hall is immediately visible.",
        travel_minutes: 5,
        services: [],
      },
    ],
    area_edges: [],
    points_of_interest: [
      {
        id: "albany_notice",
        home: "albany_city",
        area: "albany_area",
        kind: "landmark",
        title: "Albany Notice Board",
        summary: "One local lead is posted here.",
      },
    ],
    characters: [],
    local_events: [],
    local_jobs: [],
    road_events: [],
    exploration_sites: [],
    quests: [
      {
        id: "albany_quest",
        title: "Albany Quest",
        source: "content/rpg/quests/albany_quest.yaml",
        home: "albany_city",
        area: "albany_area",
        discovery: "See the Albany lead through.",
        visibility: "local_notice_board",
      },
    ],
  };
}

describe("journey contract", () => {
  it("starts with a versioned Albany goal, fixed baseline, and immutable presentation", () => {
    const state = createInitialJourneyContractSnapshot();
    const view = journeyPresentation(state);

    expect(JourneyContractSnapshotSchema.parse(state)).toEqual(state);
    expect(view).toMatchObject({
      contractVersion: JOURNEY_CONTRACT_VERSION,
      status: "active",
      goal: {
        version: INITIAL_JOURNEY_GOAL.version,
        id: INITIAL_JOURNEY_GOAL.id,
        text: "Find one local lead in Albany and see it through.",
        status: "active",
        completedAtDecision: null,
      },
      acceptedDecisions: 0,
      baselineDecisions: JOURNEY_BASELINE_DECISIONS,
      nextCheckpoint: 40,
      pendingChoice: null,
      retentionHistory: [],
    });
    expect(Object.isFrozen(view)).toBe(true);
    expect(Object.isFrozen(view.goal)).toBe(true);
    expect(Object.isFrozen(view.decisionProof)).toBe(true);
    expect(Object.isFrozen(view.retentionHistory)).toBe(true);
    expect(() => JourneyContractSnapshotSchema.parse({ ...state, nextCheckpoint: 80 })).toThrow(
      /Next fixed journey checkpoint must be 40/i,
    );
  });

  it("stops exactly at 40, then 80/120/160 after each continuation", () => {
    let state = decideUntil(createInitialJourneyContractSnapshot(), 40);

    for (const checkpoint of [40, 80, 120, 160]) {
      const view = journeyPresentation(state);
      expect(view.status).toBe("awaiting_choice");
      expect(view.acceptedDecisions).toBe(checkpoint);
      expect(view.pendingChoice).toMatchObject({
        atDecision: checkpoint,
        reasons: ["checkpoint"],
        checkpoint,
        options: [
          {
            id: "continue",
            label: "Continue for 40 more decisions",
            consequence: `Play remains open; the next fixed checkpoint is decision ${checkpoint + 40}.`,
          },
          {
            id: "end",
            consequence: expect.stringMatching(/read-only.*receipt/i),
          },
        ],
      });
      expect(() => decide(state, "blocked")).toThrow(/Choose whether to continue or end/i);
      if (checkpoint === 160) break;
      const continued = chooseJourney(state, "continue");
      state = continued.state;
      expect(continued.result.exitReceipt).toBeNull();
      expect(state.acceptedDecisions).toBe(checkpoint);
      expect(state.nextCheckpoint).toBe(checkpoint + 40);
      state = decideUntil(state, checkpoint + 40);
    }
  });

  it("offers an honest early goal choice without moving the fixed checkpoint", () => {
    let state = decide(createInitialJourneyContractSnapshot(), "quest_step:ending", "quest");
    state = recordJourneyGoalCompleted(state);

    expect(journeyPresentation(state).pendingChoice).toMatchObject({
      atDecision: 1,
      reasons: ["goal_completed"],
      checkpoint: null,
      options: [
        {
          id: "continue",
          label: "Continue to decision 40",
          consequence: "Play remains open; the next fixed checkpoint is decision 40.",
        },
        { id: "end" },
      ],
    });

    const continued = chooseJourney(state, "continue");
    expect(continued.state.nextCheckpoint).toBe(40);
    expect(continued.state.acceptedDecisions).toBe(1);
    expect(continued.result.retentionEvent).toMatchObject({
      atDecision: 1,
      reasons: ["goal_completed"],
      choice: "continue",
    });
  });

  it("merges goal completion with an already-pending fixed checkpoint", () => {
    let state = decideUntil(createInitialJourneyContractSnapshot(), 40);
    state = recordJourneyGoalCompleted(state);

    expect(journeyPresentation(state).pendingChoice).toMatchObject({
      atDecision: 40,
      reasons: ["checkpoint", "goal_completed"],
      checkpoint: 40,
    });
    expect(JourneyContractSnapshotSchema.parse(state)).toEqual(state);
  });

  it("ends read-only with proof-covered immutable retention evidence and a stable receipt", () => {
    const pending = decideUntil(createInitialJourneyContractSnapshot(), 40);
    const ended = chooseJourney(pending, "end");
    const receipt = ended.result.exitReceipt;

    expect(receipt).not.toBeNull();
    expect(receipt).toMatchObject({
      contractVersion: JOURNEY_CONTRACT_VERSION,
      exitReason: JOURNEY_EXIT_REASON,
      goalVersion: 1,
      goalId: INITIAL_JOURNEY_GOAL.id,
      goalStatus: "active",
      acceptedDecisions: 40,
      exitReasons: ["checkpoint"],
      checkpoint: 40,
      decisionProofHash: pending.decisionProof.hash,
      retentionHistory: [
        {
          sequence: 1,
          atDecision: 40,
          reasons: ["checkpoint"],
          checkpoint: 40,
          choice: "end",
          decisionProofHash: pending.decisionProof.hash,
        },
      ],
    });
    expect(receipt!.receiptHash).toMatch(/^[0-9a-f]{64}$/);
    expect(Object.isFrozen(receipt)).toBe(true);
    expect(Object.isFrozen(receipt!.exitReasons)).toBe(true);
    expect(Object.isFrozen(receipt!.retentionHistory)).toBe(true);
    expect(journeyExitReceipt(ended.state)).toEqual(receipt);
    expect(JourneyContractSnapshotSchema.parse(ended.state)).toEqual(ended.state);
    const forgedEvidence = cloneJourneyContractSnapshot(ended.state);
    forgedEvidence.retentionHistory[0]!.decisionProofHash = "f".repeat(64);
    expect(() => JourneyContractSnapshotSchema.parse(forgedEvidence)).toThrow(
      /must match the journey decision proof/i,
    );
    expect(() => decide(ended.state, "after_end")).toThrow(/journey has ended/i);

    const { receiptHash, ...receiptPayload } = receipt!;
    expect(hashState(receiptPayload)).toBe(receiptHash);
    expect(
      hashState({
        ...receiptPayload,
        acceptedDecisions: receiptPayload.acceptedDecisions + 1,
      }),
    ).not.toBe(receiptHash);
  });

  it("clones persisted journey state without sharing nested proof or retention data", () => {
    const ended = chooseJourney(
      decideUntil(createInitialJourneyContractSnapshot(), 40),
      "end",
    ).state;
    const clone = cloneJourneyContractSnapshot(ended);

    clone.goal.status = "completed";
    clone.decisionProof.last = { ...clone.decisionProof.last!, actionId: "changed" };
    clone.retentionHistory[0]!.reasons.push("goal_completed");

    expect(ended.goal.status).toBe("active");
    expect(ended.decisionProof.last!.actionId).not.toBe("changed");
    expect(ended.retentionHistory[0]!.reasons).toEqual(["checkpoint"]);
  });

  it("pins goal proof to a completed quest from the starting town only", () => {
    const albanyQuest = quest("albany_quest", "albany_city");
    const otherQuest = quest("other_quest", "other_town");
    const questsById = new Map([
      [albanyQuest.id, albanyQuest],
      [otherQuest.id, otherQuest],
    ]);
    const active = createInitialJourneyContractSnapshot();
    const completed = recordJourneyGoalCompleted(decide(active, "quest_step:end", "quest"));

    expect(() =>
      assertJourneyGoalCompletionProof({
        journey: completed,
        completedQuestIds: new Set([otherQuest.id]),
        questsById,
        startTownId: "albany_city",
      }),
    ).toThrow(/without a completed quest from the starting town/i);
    expect(() =>
      assertJourneyGoalCompletionProof({
        journey: completed,
        completedQuestIds: new Set([albanyQuest.id]),
        questsById,
        startTownId: "albany_city",
      }),
    ).not.toThrow();
    expect(() =>
      assertJourneyGoalCompletionProof({
        journey: active,
        completedQuestIds: new Set([albanyQuest.id]),
        questsById,
        startTownId: "albany_city",
      }),
    ).toThrow(/active despite a completed quest/i);
  });
});

describe("OverworldSession journey integration", () => {
  it("completes the goal only after a successful non-death starting-town quest foldback", () => {
    const session = new OverworldSession(oneQuestWorld());
    session.scoutPoi("albany_notice");
    session.startQuest("albany_quest");

    expect(() =>
      session.completeQuest("albany_quest", {
        endingId: "ending_fallen",
        endingTitle: "Fallen",
        death: true,
      }),
    ).toThrow(/death ending/i);
    expect(session.journey().goal.status).toBe("active");

    const beforeFoldback = session.journey().acceptedDecisions;
    const completed = session.completeQuest("albany_quest", {
      endingId: "ending_victory",
      endingTitle: "Victory",
      death: false,
    });
    expect(completed.journeyDecision).toEqual({
      countsTowardJourney: false,
      reason: "technical_quest_foldback",
    });
    expect(session.journey()).toMatchObject({
      status: "awaiting_choice",
      acceptedDecisions: beforeFoldback,
      nextCheckpoint: 40,
      goal: {
        version: 1,
        status: "completed",
        completedAtDecision: beforeFoldback,
      },
      pendingChoice: {
        atDecision: beforeFoldback,
        reasons: ["goal_completed"],
        checkpoint: null,
      },
    });

    const ended = session.chooseJourney("end");
    const restored = OverworldSession.restore(oneQuestWorld(), session.snapshot());
    expect(restored.journey().goal).toEqual(session.journey().goal);
    expect(restored.journeyExitReceipt()).toEqual(ended.exitReceipt);
    expect(restored.journeyExitReceipt()).toMatchObject({
      exitReason: "player_ended_at_choice",
      goalVersion: 1,
      goalStatus: "completed",
      exitReasons: ["goal_completed"],
    });
  });

  it("excludes context, unchanged outcomes, and rejections while counting consequential decisions", () => {
    const session = new OverworldSession(loadOverworldManifest(process.cwd()));
    const initialHash = session.snapshotHash();
    const initialView = session.view();

    session.journey();
    session.view();
    session.compactView();
    session.snapshot();
    session.planRoute(initialView.exits[0]!.destination.id);
    expect(session.journey().acceptedDecisions).toBe(0);
    expect(session.snapshotHash()).toBe(initialHash);

    expect(() => session.travel("not-a-road")).toThrow(/not reachable/i);
    expect(session.journey().acceptedDecisions).toBe(0);
    expect(session.snapshotHash()).toBe(initialHash);

    const rested = session.restAtTown();
    expect(rested.changed).toBe(false);
    expect(rested.journeyDecision).toEqual({
      countsTowardJourney: false,
      reason: "unchanged_service",
    });
    expect(session.journey()).toMatchObject({
      acceptedDecisions: 0,
      decisionProof: { last: null },
    });
    expect(session.snapshotHash()).toBe(initialHash);

    session.recordQuestDecision("look:around", excludedJourneyDecision("context_only"));
    expect(session.journey().acceptedDecisions).toBe(0);
    expect(session.snapshotHash()).toBe(initialHash);

    session.recordQuestDecision("ask_wolves", countedJourneyDecision("substantive_dialogue"));
    expect(session.journey()).toMatchObject({
      acceptedDecisions: 1,
      decisionProof: {
        last: {
          number: 1,
          surface: "quest",
          actionId: "ask_wolves",
          reason: "substantive_dialogue",
        },
      },
    });
  });

  it("persists checkpoint state, goal version, retention proof, and exit reason across restore", () => {
    const world = loadOverworldManifest(process.cwd());
    const session = new OverworldSession(world);
    for (let decision = 1; decision <= 40; decision += 1) {
      session.recordQuestDecision(
        `quest_action:${decision}`,
        countedJourneyDecision("situation_changed"),
      );
    }
    const ended = session.chooseJourney("end");
    const snapshot = session.snapshot();
    const restored = OverworldSession.restore(world, snapshot);

    expect(snapshot.version).toBe(7);
    expect(snapshot.journey.goal.version).toBe(1);
    expect(restored.snapshotHash()).toBe(session.snapshotHash());
    expect(restored.journey()).toEqual(session.journey());
    expect(restored.journey().decisionProof.last?.reason).toBe("situation_changed");
    expect(restored.journeyExitReceipt()).toEqual(ended.exitReceipt);
    expect(restored.journeyExitReceipt()).toMatchObject({
      exitReason: "player_ended_at_choice",
      goalVersion: 1,
      decisionProofHash: snapshot.journey.decisionProof.hash,
    });
  });

  it("does not let excluded accepted outcomes trigger the decision-40 checkpoint", () => {
    const session = new OverworldSession(loadOverworldManifest(process.cwd()));
    for (let decision = 1; decision < 40; decision += 1) {
      session.recordQuestDecision(
        `quest_action:${decision}`,
        countedJourneyDecision("situation_changed"),
      );
    }
    const before = session.snapshotHash();
    expect(session.journey()).toMatchObject({ status: "active", acceptedDecisions: 39 });

    expect(session.restAtTown().journeyDecision).toEqual({
      countsTowardJourney: false,
      reason: "unchanged_service",
    });
    session.recordQuestDecision("ask_leave", excludedJourneyDecision("dialogue_closure"));
    expect(session.snapshotHash()).toBe(before);
    expect(session.journey()).toMatchObject({
      status: "active",
      acceptedDecisions: 39,
      pendingChoice: null,
    });

    session.recordQuestDecision("move_next", countedJourneyDecision("movement"));
    expect(session.journey()).toMatchObject({
      status: "awaiting_choice",
      acceptedDecisions: 40,
      pendingChoice: { checkpoint: 40 },
    });
  });
});
