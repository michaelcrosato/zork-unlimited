import { describe, it, expect } from "vitest";
import { replayTrace, describeAction } from "../../src/trace/replay.js";
import { recordTrace } from "../../src/trace/record.js";
import {
  MICRO_ACTIONS,
  microRules,
  microInitState,
  MICRO_CONTENT_HASH,
} from "../../src/demo/micro.js";
import type { RpgAction } from "../../src/api/types.js";
import { SaveIntegrityError } from "../../src/persist/save_load.js";

const WIN: RpgAction[] = [
  MICRO_ACTIONS.takeTorch,
  MICRO_ACTIONS.enterCave,
  MICRO_ACTIONS.grabGold,
  MICRO_ACTIONS.claimTreasure,
];

describe("replayTrace", () => {
  it("replays a trace successfully when expected_final_hash is missing", () => {
    const trace = recordTrace(microRules, microInitState(), WIN, {
      trace_id: "test_trace",
      content_hash: MICRO_CONTENT_HASH,
      worldQuestId: "test_quest",
    });

    const { expected_final_hash: _omit, ...traceWithoutHash } = trace;
    const result = replayTrace<RpgAction>(traceWithoutHash as any, microRules);

    expect(result.ok).toBe(true);
    expect(result.message).toBe("Replayed with no expected final hash to assert.");
    expect(result.expectedFinalHash).toBeUndefined();
    expect(result.finalHash).toBeDefined();
  });

  // Re-enable the sparse array test, but instead of checking if replayTrace handles it correctly
  // verify it correctly throws the SaveIntegrityError because assertTraceActions checks it.
  it("throws SaveIntegrityError on sparse actions array", () => {
    const trace = recordTrace(microRules, microInitState(), [MICRO_ACTIONS.takeTorch, MICRO_ACTIONS.enterCave], {
      trace_id: "test_trace",
      content_hash: MICRO_CONTENT_HASH,
      worldQuestId: "test_quest",
    });

    // Create a sparse array
    const sparseActions = [];
    sparseActions[0] = MICRO_ACTIONS.takeTorch;
    sparseActions[1] = undefined; // sparse
    sparseActions[2] = MICRO_ACTIONS.enterCave;

    const tampered = {
      ...trace,
      actions: sparseActions,
      per_step_hashes: ["badhash", "badhash", "badhash"],
    };

    expect(() => replayTrace<RpgAction>(tampered as any, microRules)).toThrow(SaveIntegrityError);
  });

  it("returns ok when final matches and no divergence", () => {
    const trace = recordTrace(microRules, microInitState(), WIN, {
      trace_id: "test_trace",
      content_hash: MICRO_CONTENT_HASH,
      worldQuestId: "test_quest",
    });

    const result = replayTrace<RpgAction>(trace as any, microRules);

    expect(result.ok).toBe(true);
    expect(result.expectedFinalHash).toBe(trace.expected_final_hash);
  });

  it("detects divergence when finalHash matches but there is step divergence", () => {
    const trace = recordTrace(microRules, microInitState(), WIN, {
      trace_id: "test_trace",
      content_hash: MICRO_CONTENT_HASH,
      worldQuestId: "test_quest",
    });

    // Make per_step_hashes differ, but keep expected_final_hash the same.
    const tampered = {
      ...trace,
      per_step_hashes: ["badhash", ...trace.per_step_hashes!.slice(1)],
    };

    const result = replayTrace<RpgAction>(tampered as any, microRules);

    expect(result.ok).toBe(false);
    expect(result.divergedAtStep).toBe(0);
  });
});


describe("describeAction", () => {
  it("returns 'out of range' when action is undefined", () => {
    const trace = { actions: [] };
    expect(describeAction<RpgAction>(trace as any, 0)).toBe("out of range");
  });

  it("returns type and id correctly", () => {
    const trace = { actions: [{ type: "MOVE", id: "north" }] };
    expect(describeAction<RpgAction>(trace as any, 0)).toBe("MOVE:north");
  });

  it("returns stringified JSON when type and id are not strings", () => {
    // Though trace.actions[i].type is checked by assertTraceMode to be a string,
    // describeAction's fallback handles other cases.
    const action = { type: 123, id: 456 };
    const trace = { actions: [action] };
    expect(describeAction<RpgAction>(trace as any, 0)).toBe(JSON.stringify(action));
  });
});
