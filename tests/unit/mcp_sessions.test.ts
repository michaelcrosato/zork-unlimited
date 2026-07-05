import { describe, expect, it } from "vitest";
import { makeStep, type Rules } from "../../src/core/engine.js";
import type { GameState } from "../../src/core/state.js";
import { initState } from "../../src/core/state.js";
import { hashState } from "../../src/core/hash.js";
import {
  MCP_SESSION_STORE_LIMIT,
  SessionStore,
  type SessionInit,
  type TranscriptSummary,
  type TranscriptTurn,
} from "../../src/mcp/sessions.js";
import {
  MCP_ACTION_LABEL_CHAR_LIMIT,
  MCP_TRANSCRIPT_ACTION_ID_CHAR_LIMIT,
  MCP_TRANSCRIPT_SCENE_ID_CHAR_LIMIT,
  MCP_TRANSCRIPT_TITLE_CHAR_LIMIT,
} from "../../src/mcp/action_labels.js";
import {
  TRANSCRIPT_TURN_LIMIT_DEFAULT,
  transcriptTurnsFor,
  transcriptTurnsOmitted,
} from "../../src/mcp/transcript_projection.js";
import { runRpgGetTranscript } from "../../src/mcp/rpg_session_tools.js";
import type { RpgActionOption } from "../../src/rpg/legal_actions.js";
import type { RpgObservation } from "../../src/rpg/observation.js";
import type { RpgIndex } from "../../src/rpg/runner.js";
import type { RpgAction } from "../../src/api/types.js";

const rules: Rules<RpgAction> = {
  legalActions: () => [],
  resolve: () => null,
};

function state(current = "start"): GameState {
  return initState({ seed: 7, start: current });
}

function sessionInit(overrides: Partial<SessionInit> = {}): SessionInit {
  return {
    packId: "test-pack",
    contentHash: "0".repeat(64),
    index: {} as RpgIndex,
    rules,
    step: makeStep(rules),
    state: state(),
    transcript: [],
    ...overrides,
  };
}

function transcriptTurn(step: number, actionId: string | null = `action_${step}`): TranscriptTurn {
  return {
    step,
    scene_id: `scene_${step}`,
    title: `Scene ${step}`,
    action_id: actionId,
    action_text: actionId,
    events: [],
    result_scene_id: `scene_${step + 1}`,
    ended: false,
    ending_id: null,
  };
}

function rollingTranscriptHash(turns: readonly TranscriptTurn[]): string {
  return turns.reduce((previous, turn) => hashState({ previous, turn }), hashState([]));
}

function observation(room: string): RpgObservation {
  return {
    mode: "rpg",
    room,
    title: room,
    description: room,
    visible_objects: [],
    npcs_present: [],
    exits: [],
    blocked_exits: [],
    inventory: [],
    state: { flags: [], vars: {}, journal: [] },
    dialogue: null,
    enemies_present: [],
    stats: { hp: 0, attack: 0, defense: 0 },
    available_actions: [],
    score: 0,
    max_score: 0,
    ended: false,
    ending_id: null,
    ending: null,
  };
}

describe("SessionStore", () => {
  it("allocates deterministic monotonically increasing session ids", () => {
    const store = new SessionStore();

    const first = store.create(sessionInit({ packId: "first" }));
    const second = store.create(sessionInit({ packId: "second" }));

    expect(first.id).toBe("sess_1");
    expect(second.id).toBe("sess_2");
    expect(first.stateHash).toBe(hashState(first.state));
    expect(second.stateHash).toBe(hashState(second.state));
    expect("mode" in first).toBe(false);
    expect(store.get("sess_1").packId).toBe("first");
    expect(store.get("sess_2").packId).toBe("second");

    const forged = store.create({
      ...sessionInit({ packId: "forged" }),
      id: "forged_session",
    } as unknown as SessionInit);
    expect(forged.id).toBe("sess_3");
    expect(store.get("sess_3")).toBe(forged);
    expect(() => store.get("forged_session")).toThrow('Unknown session "forged_session".');
  });

  it("keeps session ids monotonic past the safe integer boundary", () => {
    const store = new SessionStore();
    (store as unknown as { counter: bigint }).counter = BigInt(Number.MAX_SAFE_INTEGER);

    const first = store.create(sessionInit({ packId: "first" }));
    const second = store.create(sessionInit({ packId: "second" }));

    expect(first.id).toBe("sess_9007199254740992");
    expect(second.id).toBe("sess_9007199254740993");
    expect(store.get(first.id)).toBe(first);
    expect(store.get(second.id)).toBe(second);
  });

  it("rejects unknown sessions with the id in the error message", () => {
    const store = new SessionStore();

    expect(() => store.get("missing-session")).toThrow('Unknown session "missing-session".');
    expect(() => store.update("missing-session", state("next"))).toThrow(
      'Unknown session "missing-session".',
    );
  });

  it("bounds stored sessions and keeps recently accessed sessions", () => {
    const store = new SessionStore(2);

    const first = store.create(sessionInit({ packId: "first" }));
    const second = store.create(sessionInit({ packId: "second" }));
    expect(store.get(first.id)).toBe(first);

    const third = store.create(sessionInit({ packId: "third" }));

    expect(store.get(first.id)).toBe(first);
    expect(store.get(third.id)).toBe(third);
    expect(() => store.get(second.id)).toThrow('Unknown session "sess_2".');
  });

  it("updates only the addressed session while preserving session metadata", () => {
    const store = new SessionStore();
    const transcript = [
      {
        step: 0,
        scene_id: "start",
        title: "Start",
        action_id: null,
        action_text: null,
        events: [],
        result_scene_id: "start",
        ended: false,
        ending_id: null,
      },
    ];
    const first = store.create(sessionInit({ transcript, hideGraph: true }));
    const second = store.create(sessionInit({ packId: "other", state: state("other") }));

    const nextState = state("next");
    const updated = store.update(first.id, nextState);

    expect(updated).toBe(first);
    expect(store.get(first.id).state).toEqual(nextState);
    expect(store.get(first.id).state).not.toBe(nextState);
    expect(store.get(first.id).stateHash).toBe(hashState(nextState));
    expect(store.get(first.id).transcript).toEqual(transcript);
    expect(store.get(first.id).transcript).not.toBe(transcript);
    expect(store.get(first.id).hideGraph).toBe(true);
    expect(store.get(second.id).state.current).toBe("other");
    expect(store.get(second.id).stateHash).toBe(hashState(store.get(second.id).state));
    expect(store.get(second.id).packId).toBe("other");

    nextState.current = "mutated_after_update";
    transcript[0]!.scene_id = "mutated_after_create";
    expect(store.get(first.id).state.current).toBe("next");
    expect(store.get(first.id).transcript[0]?.scene_id).toBe("start");
  });

  it("compacts transcript fields at the storage boundary", () => {
    const store = new SessionStore();
    const session = store.create(sessionInit());
    const longTurn: TranscriptTurn = {
      ...transcriptTurn(1, `action_${"x".repeat(400)}a`),
      scene_id: `scene_${"x".repeat(400)}a`,
      title: `Scene ${"x".repeat(400)}a`,
      action_text: `do ${"x".repeat(400)}a`,
      result_scene_id: `result_${"x".repeat(400)}a`,
    };
    const replacement: TranscriptTurn = {
      ...transcriptTurn(2, `action_${"x".repeat(400)}b`),
      scene_id: `scene_${"x".repeat(400)}b`,
      title: `Scene ${"x".repeat(400)}b`,
      action_text: `do ${"x".repeat(400)}b`,
      result_scene_id: `result_${"x".repeat(400)}b`,
    };

    store.appendTranscript(session.id, longTurn);
    const stored = session.transcript[0]!;

    expect(stored.scene_id).not.toBe(longTurn.scene_id);
    expect(stored.scene_id).toHaveLength(MCP_TRANSCRIPT_SCENE_ID_CHAR_LIMIT);
    expect(stored.title).not.toBe(longTurn.title);
    expect(stored.title).toHaveLength(MCP_TRANSCRIPT_TITLE_CHAR_LIMIT);
    expect(stored.action_id).not.toBe(longTurn.action_id);
    expect(stored.action_id).toHaveLength(MCP_TRANSCRIPT_ACTION_ID_CHAR_LIMIT);
    expect(stored.action_text).not.toBe(longTurn.action_text);
    expect(stored.action_text).toHaveLength(MCP_ACTION_LABEL_CHAR_LIMIT);
    expect(stored.result_scene_id).not.toBe(longTurn.result_scene_id);
    expect(stored.result_scene_id).toHaveLength(MCP_TRANSCRIPT_SCENE_ID_CHAR_LIMIT);
    expect(stored.action_id).toMatch(/\.\.\.\(\+\d+ chars\)#[0-9a-f]{12}$/);

    store.replaceTranscript(session.id, [replacement]);
    const replaced = session.transcript[0]!;

    expect(replaced.scene_id).toHaveLength(MCP_TRANSCRIPT_SCENE_ID_CHAR_LIMIT);
    expect(replaced.title).toHaveLength(MCP_TRANSCRIPT_TITLE_CHAR_LIMIT);
    expect(replaced.action_id).toHaveLength(MCP_TRANSCRIPT_ACTION_ID_CHAR_LIMIT);
    expect(replaced.action_text).toHaveLength(MCP_ACTION_LABEL_CHAR_LIMIT);
    expect(replaced.action_id).not.toBe(stored.action_id);
  });

  it("preserves state-derived caches when the canonical state hash is unchanged", () => {
    const store = new SessionStore();
    const initialState = state();
    const session = store.create(sessionInit({ state: initialState }));
    const actions: RpgActionOption[] = [{ id: "look", command: "look", action: { type: "LOOK" } }];
    const actionProjection = ["look"];
    const obs = observation("start");
    const observationProjection = { here: ["start", "Start"] };
    const summary: TranscriptSummary = {
      steps: 0,
      scenes: ["start"],
      ended: false,
      ending_id: null,
      inventory: [],
      flags: [],
      journal: [],
    };
    const summaryProjection = { steps: 0, scenes: ["start"] };

    store.legalActions(session.id, () => actions);
    store.legalActionProjection(session.id, "rows:compact:1", () => actionProjection);
    store.observation(session.id, {}, () => obs);
    store.observationProjection(session.id, "compact:v6", () => observationProjection);
    store.transcriptSummary(session.id, () => summary);
    store.transcriptSummaryProjection(session.id, "summary:compact:1", () => summaryProjection);

    const stateHash = session.stateHash;
    const equalState = JSON.parse(JSON.stringify(initialState)) as GameState;
    const updated = store.update(session.id, equalState);

    expect(updated).toBe(session);
    expect(session.state).toEqual(equalState);
    expect(session.state).not.toBe(equalState);
    expect(session.stateHash).toBe(stateHash);
    expect(session.legalActionsCache).toBeDefined();
    expect(session.legalActionProjectionCaches).toBeDefined();
    expect(session.observationCache).toBeDefined();
    expect(session.observationProjectionCaches).toBeDefined();
    expect(session.transcriptSummaryCache).toBeDefined();
    expect(session.transcriptSummaryProjectionCaches).toBeDefined();

    let rebuilds = 0;
    expect(
      store.legalActions(session.id, () => {
        rebuilds += 1;
        return [];
      }),
    ).toBe(actions);
    expect(
      store.legalActionProjection(session.id, "rows:compact:1", () => {
        rebuilds += 1;
        return [];
      }),
    ).toBe(actionProjection);
    expect(
      store.observation(session.id, {}, () => {
        rebuilds += 1;
        return observation("rebuilt");
      }),
    ).toBe(obs);
    expect(
      store.observationProjection(session.id, "compact:v6", () => {
        rebuilds += 1;
        return { here: ["rebuilt", "Rebuilt"] };
      }),
    ).toBe(observationProjection);
    expect(
      store.transcriptSummary(session.id, () => {
        rebuilds += 1;
        return { ...summary, steps: 1 };
      }),
    ).toBe(summary);
    expect(
      store.transcriptSummaryProjection(session.id, "summary:compact:1", () => {
        rebuilds += 1;
        return { steps: 1 };
      }),
    ).toBe(summaryProjection);
    expect(rebuilds).toBe(0);
  });

  it("freezes session state snapshots against external mutation", () => {
    const store = new SessionStore();
    const session = store.create(sessionInit());
    const actions: RpgActionOption[] = [{ id: "look", command: "look", action: { type: "LOOK" } }];
    store.legalActions(session.id, () => actions);
    store.observation(session.id, {}, () => observation("start"));

    const previousHash = session.stateHash;
    expect(Object.isFrozen(session.state)).toBe(true);
    expect(Object.isFrozen(session.state.visited)).toBe(true);
    expect(Object.isFrozen(session.state.inventory)).toBe(true);
    expect(Object.isFrozen(session.state.objectState)).toBe(true);
    expect(() => {
      session.state.current = "mutated_in_place";
    }).toThrow();
    expect(() => {
      session.state.inventory.push("mutated_item");
    }).toThrow();

    const updated = store.update(session.id, {
      ...session.state,
      current: "mutated_through_update",
    });

    expect(updated).toBe(session);
    expect(session.state.current).toBe("mutated_through_update");
    expect(session.stateHash).toBe(hashState(session.state));
    expect(session.stateHash).not.toBe(previousHash);
    expect(Object.isFrozen(session.state)).toBe(true);
    expect(Object.isFrozen(session.state.inventory)).toBe(true);
    expect(session.legalActionsCache).toBeUndefined();
    expect(session.observationCache).toBeUndefined();
  });

  it("locks session metadata while leaving runtime state and caches writable", () => {
    const store = new SessionStore();
    const replacementStep = makeStep(rules);
    const session = store.create(
      sessionInit({
        packPath: "content/rpg/pack/test.yaml",
        worldQuestId: "test_quest",
        overworldSessionId: "ow_1",
        generatedRpgSeed: 9,
        hideGraph: true,
      }),
    );
    const immutableFields = [
      "id",
      "packId",
      "contentHash",
      "packPath",
      "worldQuestId",
      "overworldSessionId",
      "generatedRpgSeed",
      "index",
      "rules",
      "step",
      "hideGraph",
    ] as const;

    for (const field of immutableFields) {
      expect(Object.getOwnPropertyDescriptor(session, field)).toMatchObject({
        configurable: false,
        writable: false,
      });
    }
    expect(Object.isExtensible(session)).toBe(true);
    expect(Object.getOwnPropertyDescriptor(session, "state")).toMatchObject({ writable: true });
    expect(() => {
      (session as { packId: string }).packId = "mutated_pack";
    }).toThrow();
    expect(() => {
      (session as { overworldSessionId: string }).overworldSessionId = "ow_2";
    }).toThrow();
    expect(() => {
      (session as { generatedRpgSeed: number }).generatedRpgSeed = 10;
    }).toThrow();
    expect(() => {
      (session as { hideGraph: boolean }).hideGraph = false;
    }).toThrow();
    expect(() => {
      (session as { step: typeof replacementStep }).step = replacementStep;
    }).toThrow();

    store.legalActions(session.id, () => []);
    expect(session.legalActionsCache).toBeDefined();

    const updated = store.update(session.id, state("next"));
    expect(updated).toBe(session);
    expect(session.state.current).toBe("next");
    expect(session.stateHash).toBe(hashState(session.state));
    expect(session.legalActionsCache).toBeUndefined();
  });

  it("keeps transcript log hashes in sync with store-owned writes", () => {
    const store = new SessionStore();
    const session = store.create(sessionInit());
    const emptyHash = session.transcriptLogHash;

    const turn = {
      step: 0,
      scene_id: "start",
      title: "Start",
      action_id: null,
      action_text: null,
      events: [],
      result_scene_id: "start",
      ended: false,
      ending_id: null,
    };
    store.appendTranscript(session.id, turn);
    expect(session.transcript).toEqual([turn]);
    expect(session.transcript[0]).not.toBe(turn);
    expect(session.transcriptLogHash).toBe(
      hashState({
        previous: emptyHash,
        turn,
      }),
    );
    turn.scene_id = "mutated_after_append";
    expect(session.transcript[0]?.scene_id).toBe("start");

    store.replaceTranscript(session.id, []);
    expect(session.transcript).toEqual([]);
    expect(session.transcriptLogHash).toBe(hashState([]));
  });

  it("freezes retained transcript rows against external mutation", () => {
    const store = new SessionStore(MCP_SESSION_STORE_LIMIT, 2);
    const session = store.create(sessionInit());
    const event = {
      type: "state_change",
      effect: "custom_payload",
      value: { nested: ["original"] },
    } as const;

    store.appendTranscript(session.id, {
      ...transcriptTurn(1),
      events: [event],
    });

    expect(Object.isFrozen(session.transcript)).toBe(true);
    expect(Object.isFrozen(session.transcript[0])).toBe(true);
    expect(Object.isFrozen(session.transcript[0]?.events)).toBe(true);
    expect(Object.isFrozen((session.transcript[0]?.events[0] as typeof event).value.nested)).toBe(
      true,
    );
    expect(() => {
      (session.transcript as TranscriptTurn[]).push(transcriptTurn(99));
    }).toThrow();
    expect(() => {
      session.transcript[0]!.scene_id = "mutated_session_row";
    }).toThrow();
    expect(() => {
      ((session.transcript[0]?.events[0] as typeof event).value.nested as unknown as string[]).push(
        "mutated_event",
      );
    }).toThrow();

    store.appendTranscript(session.id, transcriptTurn(2));
    expect(session.transcript.map((turn) => turn.step)).toEqual([1, 2]);

    store.replaceTranscript(session.id, [transcriptTurn(3)]);
    expect(session.transcript.map((turn) => turn.step)).toEqual([3]);
    expect(Object.isFrozen(session.transcript)).toBe(true);
    expect(Object.isFrozen(session.transcript[0])).toBe(true);
  });

  it("keeps transcript reads detached from retained nested event payloads", () => {
    const store = new SessionStore();
    const session = store.create(sessionInit());
    const event = {
      type: "state_change",
      effect: "custom_payload",
      value: { nested: ["original"] },
    } as const;
    store.appendTranscript(session.id, {
      ...transcriptTurn(1),
      events: [event],
    });

    const first = runRpgGetTranscript({ sessions: store }, { session_id: session.id });
    const value = first.turns[0]?.events[0] as { value?: { nested?: string[] } } | undefined;
    value?.value?.nested?.push("mutated_response");

    const second = runRpgGetTranscript({ sessions: store }, { session_id: session.id });
    const rereadValue = second.turns[0]?.events[0] as { value?: { nested?: string[] } } | undefined;
    expect(rereadValue?.value?.nested).toEqual(["original"]);
  });

  it("bounds retained transcript rows while preserving hashes and aggregate stats", () => {
    const store = new SessionStore(MCP_SESSION_STORE_LIMIT, 3);
    const session = store.create(sessionInit());
    const emptyHash = session.transcriptLogHash;
    const turns = [
      transcriptTurn(0, null),
      transcriptTurn(1),
      transcriptTurn(2),
      transcriptTurn(3),
    ];

    for (const turn of turns) store.appendTranscript(session.id, turn);

    const rollingHash = turns.reduce((previous, turn) => hashState({ previous, turn }), emptyHash);
    expect(session.transcript.map((turn) => turn.step)).toEqual([1, 2, 3]);
    expect(session.transcriptLogHash).toBe(rollingHash);
    expect(session.transcriptStats.turns).toBe(4);
    expect(session.transcriptStats.actionTurns).toBe(3);
    expect(session.transcriptStats.scenes).toEqual([
      "scene_0",
      "scene_1",
      "scene_2",
      "scene_3",
      "scene_4",
    ]);
    expect(transcriptTurnsOmitted(session, { session_id: session.id })).toBe(1);
    expect(
      transcriptTurnsFor(store, session, {
        session_id: session.id,
        compact_turns: true,
      }),
    ).toEqual([
      [1, "scene_1", "action_1", "scene_2"],
      [2, "scene_2", "action_2", "scene_3"],
      [3, "scene_3", "action_3", "scene_4"],
    ]);
    expect(transcriptTurnsOmitted(session, { session_id: session.id, turn_limit: 2 })).toBe(2);
  });

  it("freezes transcript aggregate stats against external mutation", () => {
    const store = new SessionStore(MCP_SESSION_STORE_LIMIT, 2);
    const session = store.create(sessionInit({ transcript: [transcriptTurn(0, null)] }));

    expect(Object.isFrozen(session.transcriptStats)).toBe(true);
    expect(Object.isFrozen(session.transcriptStats.scenes)).toBe(true);
    expect(() => {
      (session.transcriptStats as { turns: number }).turns = 999;
    }).toThrow();
    expect(() => {
      (session.transcriptStats.scenes as string[]).push("fake_scene");
    }).toThrow();

    store.appendTranscript(session.id, transcriptTurn(1));

    expect(session.transcriptStats.turns).toBe(2);
    expect(session.transcriptStats.actionTurns).toBe(1);
    expect(session.transcriptStats.scenes).toEqual(["scene_0", "scene_1", "scene_2"]);
    expect(Object.isFrozen(session.transcriptStats)).toBe(true);
    expect(Object.isFrozen(session.transcriptStats.scenes)).toBe(true);

    store.replaceTranscript(session.id, [transcriptTurn(2), transcriptTurn(3)]);

    expect(session.transcriptStats.turns).toBe(2);
    expect(session.transcriptStats.actionTurns).toBe(2);
    expect(session.transcriptStats.scenes).toEqual(["scene_2", "scene_3", "scene_4"]);
    expect(Object.isFrozen(session.transcriptStats)).toBe(true);
    expect(Object.isFrozen(session.transcriptStats.scenes)).toBe(true);
  });

  it("caps default transcript turn windows while allowing explicit retained reads", () => {
    const store = new SessionStore(MCP_SESSION_STORE_LIMIT, TRANSCRIPT_TURN_LIMIT_DEFAULT + 4);
    const session = store.create(sessionInit());
    const turns = Array.from({ length: TRANSCRIPT_TURN_LIMIT_DEFAULT + 2 }, (_, index) =>
      transcriptTurn(index),
    );

    for (const turn of turns) store.appendTranscript(session.id, turn);

    const defaultTurns = transcriptTurnsFor(store, session, {
      session_id: session.id,
      compact_turns: true,
    });
    expect(defaultTurns).toHaveLength(TRANSCRIPT_TURN_LIMIT_DEFAULT);
    expect(defaultTurns[0]?.[0]).toBe(2);
    expect(transcriptTurnsOmitted(session, { session_id: session.id })).toBe(2);

    const fullRetainedTurns = transcriptTurnsFor(store, session, {
      session_id: session.id,
      compact_turns: true,
      turn_limit: turns.length,
    });
    expect(fullRetainedTurns).toHaveLength(turns.length);
    expect(fullRetainedTurns[0]?.[0]).toBe(0);
    expect(
      transcriptTurnsOmitted(session, {
        session_id: session.id,
        turn_limit: turns.length,
      }),
    ).toBe(0);
  });

  it("rebuilds transcript retention and aggregate stats on replacement", () => {
    const store = new SessionStore(MCP_SESSION_STORE_LIMIT, 2);
    const session = store.create(sessionInit());
    const turns = [transcriptTurn(0, null), transcriptTurn(1), transcriptTurn(2)];

    store.replaceTranscript(session.id, turns);

    expect(session.transcript).toEqual(turns.slice(-2));
    expect(session.transcript[0]).not.toBe(turns[1]);
    expect(session.transcript[1]).not.toBe(turns[2]);
    expect(session.transcriptLogHash).toBe(rollingTranscriptHash(turns));
    expect(session.transcriptStats.turns).toBe(3);
    expect(session.transcriptStats.actionTurns).toBe(2);
    expect(session.transcriptStats.scenes).toEqual(["scene_0", "scene_1", "scene_2", "scene_3"]);
    expect(transcriptTurnsOmitted(session, { session_id: session.id })).toBe(1);
    turns[2]!.scene_id = "mutated_after_replace";
    expect(session.transcript[1]?.scene_id).toBe("scene_2");
  });

  it("uses the same transcript log hash for create, append, and replacement paths", () => {
    const turns = [transcriptTurn(0, null), transcriptTurn(1), transcriptTurn(2)];
    const created = new SessionStore().create(sessionInit({ transcript: turns }));
    const appendStore = new SessionStore();
    const replaceStore = new SessionStore();
    const appended = appendStore.create(sessionInit());
    const replaced = replaceStore.create(sessionInit());

    for (const turn of turns) appendStore.appendTranscript(appended.id, turn);
    replaceStore.replaceTranscript(replaced.id, turns);

    expect(created.transcriptLogHash).toBe(rollingTranscriptHash(turns));
    expect(appended.transcriptLogHash).toBe(created.transcriptLogHash);
    expect(replaced.transcriptLogHash).toBe(created.transcriptLogHash);
  });

  it("reports transcript summaries from aggregate stats when old rows are pruned", () => {
    const store = new SessionStore(MCP_SESSION_STORE_LIMIT, 2);
    const session = store.create(sessionInit());
    const turns = [transcriptTurn(0, null), transcriptTurn(1), transcriptTurn(2)];
    for (const turn of turns) store.appendTranscript(session.id, turn);

    const transcript = runRpgGetTranscript(
      { sessions: store },
      { session_id: session.id, summary_only: true },
    );

    expect(transcript.summary.steps).toBe(2);
    expect(transcript.summary.scenes).toEqual(["scene_0", "scene_1", "scene_2", "scene_3"]);
    expect(transcript.turns_omitted).toBeUndefined();
    expect("turns" in transcript).toBe(false);
  });

  it("keeps compact transcript summary reads out of the full-summary cache", () => {
    const store = new SessionStore();
    const journal = Array.from({ length: 10 }, (_, index) => `journal_${index}`);
    const session = store.create(
      sessionInit({
        state: {
          ...state(),
          journal,
        },
      }),
    );

    const compact = runRpgGetTranscript(
      { sessions: store },
      { session_id: session.id, summary_only: true, compact_summary: true },
    );

    expect(compact.summary.journal).toEqual(journal.slice(-5));
    expect(compact.summary.more).toEqual([0, 0, 0, 5]);
    expect(session.transcriptSummaryCache).toBeUndefined();
    expect(session.transcriptSummaryProjectionCaches?.size).toBe(1);

    const full = runRpgGetTranscript(
      { sessions: store },
      { session_id: session.id, summary_only: true },
    );

    expect(full.summary.journal).toEqual(journal);
    expect(session.transcriptSummaryCache?.summary.journal).toEqual(journal);
  });

  it("caches legal actions until the session state is replaced", () => {
    const store = new SessionStore();
    const session = store.create(sessionInit());
    const firstActions: RpgActionOption[] = [
      { id: "look", command: "look", action: { type: "LOOK" } },
    ];
    const nextActions: RpgActionOption[] = [
      { id: "inventory", command: "inventory", action: { type: "INVENTORY" } },
    ];
    let enumerations = 0;

    const first = store.legalActions(session.id, () => {
      enumerations += 1;
      return firstActions;
    });
    const cached = store.legalActions(session.id, () => {
      enumerations += 1;
      return nextActions;
    });

    expect(first).toBe(firstActions);
    expect(cached).toBe(firstActions);
    expect(enumerations).toBe(1);
    expect(session.legalActionsCache?.stateHash).toBe(session.stateHash);

    const nextState = state("next");
    store.update(session.id, nextState);

    expect(session.legalActionsCache).toBeUndefined();
    expect(session.observationCache).toBeUndefined();
    expect(session.stateHash).toBe(hashState(nextState));

    const afterUpdate = store.legalActions(session.id, () => {
      enumerations += 1;
      return nextActions;
    });

    expect(afterUpdate).toBe(nextActions);
    expect(enumerations).toBe(2);
    expect(session.legalActionsCache?.stateHash).toBe(session.stateHash);
  });

  it("caches legal action projections until the session state is replaced", () => {
    const store = new SessionStore();
    const session = store.create(sessionInit());
    const firstProjection = ["look"];
    const nextProjection = ["inventory"];
    const fullProjection = [{ id: "look", command: "look" }];
    let builds = 0;

    const first = store.legalActionProjection(session.id, "rows:compact:1", () => {
      builds += 1;
      return firstProjection;
    });
    const cached = store.legalActionProjection(session.id, "rows:compact:1", () => {
      builds += 1;
      return nextProjection;
    });
    const full = store.legalActionProjection(session.id, "rows:compact:0", () => {
      builds += 1;
      return fullProjection;
    });

    expect(first).toBe(firstProjection);
    expect(cached).toBe(firstProjection);
    expect(full).toBe(fullProjection);
    expect(builds).toBe(2);
    expect(session.legalActionProjectionCaches?.get("rows:compact:1")?.stateHash).toBe(
      session.stateHash,
    );

    const turn: TranscriptTurn = {
      step: 1,
      scene_id: "start",
      title: "Start",
      action_id: "look",
      action_text: "look",
      events: [],
      result_scene_id: "start",
      ended: false,
      ending_id: null,
    };
    store.appendTranscript(session.id, turn);
    const afterTranscript = store.legalActionProjection(session.id, "rows:compact:1", () => {
      builds += 1;
      return nextProjection;
    });

    expect(afterTranscript).toBe(firstProjection);
    expect(builds).toBe(2);

    const nextState = state("next");
    store.update(session.id, nextState);

    expect(session.legalActionProjectionCaches).toBeUndefined();
    expect(session.stateHash).toBe(hashState(nextState));

    const afterUpdate = store.legalActionProjection(session.id, "rows:compact:1", () => {
      builds += 1;
      return nextProjection;
    });

    expect(afterUpdate).toBe(nextProjection);
    expect(builds).toBe(3);
  });

  it("caches observations by state hash and graph options", () => {
    const store = new SessionStore();
    const session = store.create(sessionInit());
    const firstObservation = observation("start");
    const hiddenObservation = observation("hidden");
    const nextObservation = observation("next");
    let builds = 0;

    const first = store.observation(session.id, {}, () => {
      builds += 1;
      return firstObservation;
    });
    const cached = store.observation(session.id, {}, () => {
      builds += 1;
      return hiddenObservation;
    });

    expect(first).toBe(firstObservation);
    expect(cached).toBe(firstObservation);
    expect(builds).toBe(1);
    expect(session.observationCache?.stateHash).toBe(session.stateHash);

    const hidden = store.observation(session.id, { hideGraph: true }, () => {
      builds += 1;
      return hiddenObservation;
    });

    expect(hidden).toBe(hiddenObservation);
    expect(builds).toBe(2);
    expect(session.observationCache?.hideGraph).toBe(true);

    const nextState = state("next");
    store.update(session.id, nextState);
    expect(session.observationCache).toBeUndefined();

    const afterUpdate = store.observation(session.id, { hideGraph: true }, () => {
      builds += 1;
      return nextObservation;
    });

    expect(afterUpdate).toBe(nextObservation);
    expect(builds).toBe(3);
    expect(session.observationCache?.stateHash).toBe(hashState(nextState));
  });

  it("caches observation projections until state changes", () => {
    const store = new SessionStore();
    const session = store.create(sessionInit());
    const firstProjection = { here: ["start", "Start"] };
    const nextProjection = { here: ["next", "Next"] };
    let builds = 0;

    const first = store.observationProjection(session.id, "compact:v5:hide:false", () => {
      builds += 1;
      return firstProjection;
    });
    const cached = store.observationProjection(session.id, "compact:v5:hide:false", () => {
      builds += 1;
      return nextProjection;
    });
    const otherShape = store.observationProjection(
      session.id,
      "public:compact-actions:true",
      () => {
        builds += 1;
        return nextProjection;
      },
    );

    expect(first).toBe(firstProjection);
    expect(cached).toBe(firstProjection);
    expect(otherShape).toBe(nextProjection);
    expect(builds).toBe(2);
    expect(session.observationProjectionCaches?.get("compact:v5:hide:false")?.stateHash).toBe(
      session.stateHash,
    );

    store.appendTranscript(session.id, {
      step: 1,
      scene_id: "start",
      title: "Start",
      action_id: "look",
      action_text: "look",
      events: [],
      result_scene_id: "start",
      ended: false,
      ending_id: null,
    });
    expect(session.observationProjectionCaches).toBeDefined();

    store.update(session.id, state("next"));
    expect(session.observationProjectionCaches).toBeUndefined();

    const afterState = store.observationProjection(session.id, "compact:v5:hide:false", () => {
      builds += 1;
      return nextProjection;
    });
    expect(afterState).toBe(nextProjection);
    expect(builds).toBe(3);
  });

  it("freezes cached session payloads against in-process mutation", () => {
    const store = new SessionStore();
    const session = store.create(sessionInit());
    const actions: RpgActionOption[] = [
      { id: "look", command: "look", action: { type: "LOOK", target: "glyph" } },
    ];
    const observed: RpgObservation = {
      ...observation("start"),
      available_actions: [
        { id: "look", command: "look", action: { type: "LOOK", target: "glyph" } },
      ],
    };
    const summary: TranscriptSummary = {
      steps: 0,
      scenes: ["start"],
      ended: false,
      ending_id: null,
      inventory: ["lamp"],
      flags: ["lit"],
      journal: ["read_glyph"],
    };

    const legal = store.legalActions(session.id, () => actions);
    const legalProjection = store.legalActionProjection(session.id, "rows:full", () => [
      { id: "look", command: "look", skill_check: { skill: "lore", difficulty: 7, die: "d20" } },
    ]);
    const obs = store.observation(session.id, {}, () => observed);
    const observationProjection = store.observationProjection(session.id, "compact", () => ({
      here: ["start", "Start"],
      vars: { lore: 2 },
    }));
    const transcriptSummary = store.transcriptSummary(session.id, () => summary);
    const summaryProjection = store.transcriptSummaryProjection(session.id, "summary", () => ({
      scenes: ["start"],
    }));
    const transcriptProjection = store.transcriptProjection(session.id, "turns", () => [
      { step: 0, events: [{ type: "narrated", text: "Start." }] },
    ]);
    const collectionProjection = store.observationProjection(session.id, "collections", () => ({
      map: new Map([["town", { flags: new Set(["visited"]) }]]),
      set: new Set([{ id: "site" }]),
    }));

    expect(Object.isFrozen(legal)).toBe(true);
    expect(Object.isFrozen(legal[0])).toBe(true);
    expect(Object.isFrozen(legal[0]!.action)).toBe(true);
    expect(() =>
      legal.push({ id: "inventory", command: "inventory", action: { type: "INVENTORY" } }),
    ).toThrow();
    expect(Object.isFrozen(legalProjection)).toBe(true);
    expect(Object.isFrozen(legalProjection[0])).toBe(true);
    expect(Object.isFrozen(legalProjection[0]!.skill_check)).toBe(true);
    expect(Object.isFrozen(obs)).toBe(true);
    expect(Object.isFrozen(obs.available_actions)).toBe(true);
    expect(Object.isFrozen(obs.available_actions[0]!.action)).toBe(true);
    expect(Object.isFrozen(obs.state.vars)).toBe(true);
    expect(Object.isFrozen(observationProjection)).toBe(true);
    expect(Object.isFrozen(observationProjection.here)).toBe(true);
    expect(Object.isFrozen(observationProjection.vars)).toBe(true);
    expect(Object.isFrozen(transcriptSummary)).toBe(true);
    expect(Object.isFrozen(transcriptSummary.scenes)).toBe(true);
    expect(Object.isFrozen(summaryProjection)).toBe(true);
    expect(Object.isFrozen(summaryProjection.scenes)).toBe(true);
    expect(Object.isFrozen(transcriptProjection)).toBe(true);
    expect(Object.isFrozen(transcriptProjection[0]!.events)).toBe(true);
    expect(Object.isFrozen(collectionProjection.map)).toBe(true);
    expect(Object.isFrozen(collectionProjection.map.get("town"))).toBe(true);
    expect(Object.isFrozen(collectionProjection.map.get("town")!.flags)).toBe(true);
    expect(Object.isFrozen(collectionProjection.set)).toBe(true);
    expect(Object.isFrozen([...collectionProjection.set][0])).toBe(true);
    expect(() =>
      collectionProjection.map.set("next", {
        flags: new Set(),
      }),
    ).toThrow(TypeError);
    expect(() => collectionProjection.map.get("town")!.flags.add("mutated")).toThrow(TypeError);
    expect(() => collectionProjection.set.add({ id: "other" })).toThrow(TypeError);
  });

  it("caches transcript summaries until transcript or state changes", () => {
    const store = new SessionStore();
    const session = store.create(sessionInit());
    const firstSummary: TranscriptSummary = {
      steps: 0,
      scenes: ["start"],
      ended: false,
      ending_id: null,
      inventory: [],
      flags: [],
      journal: [],
    };
    const nextSummary: TranscriptSummary = {
      ...firstSummary,
      steps: 1,
      scenes: ["next", "start"],
    };
    const stateSummary: TranscriptSummary = {
      ...nextSummary,
      inventory: ["lamp"],
    };
    const turn = {
      step: 1,
      scene_id: "start",
      title: "Start",
      action_id: "look",
      action_text: "look",
      events: [],
      result_scene_id: "start",
      ended: false,
      ending_id: null,
    };
    let builds = 0;

    const first = store.transcriptSummary(session.id, () => {
      builds += 1;
      return firstSummary;
    });
    const cached = store.transcriptSummary(session.id, () => {
      builds += 1;
      return nextSummary;
    });

    expect(first).toBe(firstSummary);
    expect(cached).toBe(firstSummary);
    expect(builds).toBe(1);
    expect(session.transcriptSummaryCache?.stateHash).toBe(session.stateHash);
    expect(session.transcriptSummaryCache?.transcriptLogHash).toBe(session.transcriptLogHash);

    store.appendTranscript(session.id, turn);
    expect(session.transcriptSummaryCache).toBeUndefined();

    const afterTranscript = store.transcriptSummary(session.id, () => {
      builds += 1;
      return nextSummary;
    });
    expect(afterTranscript).toBe(nextSummary);
    expect(builds).toBe(2);

    store.update(session.id, state("next"));
    expect(session.transcriptSummaryCache).toBeUndefined();

    const afterState = store.transcriptSummary(session.id, () => {
      builds += 1;
      return stateSummary;
    });
    expect(afterState).toBe(stateSummary);
    expect(builds).toBe(3);

    store.replaceTranscript(session.id, []);
    expect(session.transcriptSummaryCache).toBeUndefined();
  });

  it("caches transcript summary projections until state or transcript changes", () => {
    const store = new SessionStore();
    const session = store.create(sessionInit());
    const firstProjection = { steps: 0, scenes: ["start"] };
    const nextProjection = { steps: 1, scenes: ["next", "start"] };
    const turn = {
      step: 1,
      scene_id: "start",
      title: "Start",
      action_id: "look",
      action_text: "look",
      events: [],
      result_scene_id: "start",
      ended: false,
      ending_id: null,
    };
    let builds = 0;

    const first = store.transcriptSummaryProjection(session.id, "compact-summary:v1", () => {
      builds += 1;
      return firstProjection;
    });
    const cached = store.transcriptSummaryProjection(session.id, "compact-summary:v1", () => {
      builds += 1;
      return nextProjection;
    });
    const otherShape = store.transcriptSummaryProjection(session.id, "audit-summary:v1", () => {
      builds += 1;
      return nextProjection;
    });

    expect(first).toBe(firstProjection);
    expect(cached).toBe(firstProjection);
    expect(otherShape).toBe(nextProjection);
    expect(builds).toBe(2);
    expect(session.transcriptSummaryProjectionCaches?.get("compact-summary:v1")?.stateHash).toBe(
      session.stateHash,
    );
    expect(
      session.transcriptSummaryProjectionCaches?.get("compact-summary:v1")?.transcriptLogHash,
    ).toBe(session.transcriptLogHash);

    store.update(session.id, state("next"));
    expect(session.transcriptSummaryProjectionCaches).toBeUndefined();

    const afterState = store.transcriptSummaryProjection(session.id, "compact-summary:v1", () => {
      builds += 1;
      return nextProjection;
    });
    expect(afterState).toBe(nextProjection);
    expect(builds).toBe(3);

    store.appendTranscript(session.id, turn);
    expect(session.transcriptSummaryProjectionCaches).toBeUndefined();

    store.replaceTranscript(session.id, []);
    expect(session.transcriptSummaryProjectionCaches).toBeUndefined();
  });

  it("caches transcript projections until transcript rows change", () => {
    const store = new SessionStore();
    const session = store.create(sessionInit());
    const firstProjection = [{ step: 0, scene_id: "start" }];
    const nextProjection = [{ step: 1, scene_id: "next" }];
    const turn = {
      step: 1,
      scene_id: "start",
      title: "Start",
      action_id: "look",
      action_text: "look",
      events: [],
      result_scene_id: "start",
      ended: false,
      ending_id: null,
    };
    let builds = 0;

    const first = store.transcriptProjection(session.id, "compact-turns:v1", () => {
      builds += 1;
      return firstProjection;
    });
    const cached = store.transcriptProjection(session.id, "compact-turns:v1", () => {
      builds += 1;
      return nextProjection;
    });
    const otherShape = store.transcriptProjection(session.id, "visible-events:v1", () => {
      builds += 1;
      return nextProjection;
    });

    expect(first).toBe(firstProjection);
    expect(cached).toBe(firstProjection);
    expect(otherShape).toBe(nextProjection);
    expect(builds).toBe(2);
    expect(session.transcriptProjectionCaches?.get("compact-turns:v1")?.transcriptLogHash).toBe(
      session.transcriptLogHash,
    );

    store.update(session.id, state("next"));
    expect(session.transcriptProjectionCaches).toBeDefined();

    store.appendTranscript(session.id, turn);
    expect(session.transcriptProjectionCaches).toBeUndefined();

    const afterTranscript = store.transcriptProjection(session.id, "compact-turns:v1", () => {
      builds += 1;
      return nextProjection;
    });
    expect(afterTranscript).toBe(nextProjection);
    expect(builds).toBe(3);

    store.replaceTranscript(session.id, []);
    expect(session.transcriptProjectionCaches).toBeUndefined();
  });
});
