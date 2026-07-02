import { describe, expect, it } from "vitest";
import type { Rules } from "../../src/core/engine.js";
import type { GameState } from "../../src/core/state.js";
import { initState } from "../../src/core/state.js";
import { hashState } from "../../src/core/hash.js";
import { SessionStore, type SessionInit, type TranscriptSummary } from "../../src/mcp/sessions.js";
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
    state: state(),
    transcript: [],
    ...overrides,
  };
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
  });

  it("rejects unknown sessions with the id in the error message", () => {
    const store = new SessionStore();

    expect(() => store.get("missing-session")).toThrow('Unknown session "missing-session".');
    expect(() => store.update("missing-session", state("next"))).toThrow(
      'Unknown session "missing-session".',
    );
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
    expect(store.get(first.id).state).toBe(nextState);
    expect(store.get(first.id).stateHash).toBe(hashState(nextState));
    expect(store.get(first.id).transcript).toBe(transcript);
    expect(store.get(first.id).hideGraph).toBe(true);
    expect(store.get(second.id).state.current).toBe("other");
    expect(store.get(second.id).stateHash).toBe(hashState(store.get(second.id).state));
    expect(store.get(second.id).packId).toBe("other");
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
    expect(session.transcriptLogHash).toBe(
      hashState({
        previous: emptyHash,
        turn,
      }),
    );

    store.replaceTranscript(session.id, []);
    expect(session.transcript).toEqual([]);
    expect(session.transcriptLogHash).toBe(hashState([]));
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
