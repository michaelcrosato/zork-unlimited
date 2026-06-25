import { describe, expect, it } from "vitest";
import type { Rules } from "../../src/core/engine.js";
import type { GameState } from "../../src/core/state.js";
import { initState } from "../../src/core/state.js";
import { SessionStore, type Session } from "../../src/mcp/sessions.js";
import type { AnyIndex } from "../../src/mcp/types.js";

const rules: Rules = {
  legalActions: () => [],
  resolve: () => null,
};

function state(current = "start"): GameState {
  return initState({ seed: 7, start: current });
}

function sessionInit(overrides: Partial<Omit<Session, "id">> = {}): Omit<Session, "id"> {
  return {
    packId: "test-pack",
    contentHash: "0".repeat(64),
    mode: "cyoa",
    index: {} as AnyIndex,
    rules,
    state: state(),
    transcript: [],
    ...overrides,
  };
}

describe("SessionStore", () => {
  it("allocates deterministic monotonically increasing session ids", () => {
    const store = new SessionStore();

    const first = store.create(sessionInit({ packId: "first" }));
    const second = store.create(sessionInit({ packId: "second" }));

    expect(first.id).toBe("sess_1");
    expect(second.id).toBe("sess_2");
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
    expect(store.get(first.id).transcript).toBe(transcript);
    expect(store.get(first.id).hideGraph).toBe(true);
    expect(store.get(second.id).state.current).toBe("other");
    expect(store.get(second.id).packId).toBe("other");
  });
});
