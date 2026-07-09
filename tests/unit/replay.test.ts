import { describe, it, expect } from "vitest";
import { replayTrace } from "../../src/trace/replay.js";
import { recordTrace } from "../../src/trace/record.js";
import {
  MICRO_ACTIONS,
  microRules,
  microInitState,
  MICRO_CONTENT_HASH,
} from "../../src/demo/micro.js";
import type { RpgAction } from "../../src/api/types.js";
import type { Trace } from "../../src/trace/record.js";

const WIN: RpgAction[] = [
  MICRO_ACTIONS.takeTorch,
  MICRO_ACTIONS.enterCave,
  MICRO_ACTIONS.grabGold,
  MICRO_ACTIONS.claimTreasure,
];

describe("replayTrace", () => {
  it("returns ok: true when replayed successfully with no expected_final_hash", () => {
    const trace = recordTrace(microRules, microInitState(), WIN, {
      trace_id: "tr_test",
      content_hash: MICRO_CONTENT_HASH,
      worldQuestId: "test_quest",
    });

    // Remove the expected_final_hash
    const { expected_final_hash: _expected_final_hash, ...traceWithoutHash } = trace;

    const result = replayTrace(traceWithoutHash as Trace<RpgAction>, microRules);

    expect(result.ok).toBe(true);
    expect(result.message).toContain("no expected final hash to assert");
    expect(result.finalHash).toBe(trace.expected_final_hash);
  });

  it("returns ok: true when final hash matches and no divergence at step", () => {
    const trace = recordTrace(microRules, microInitState(), WIN, {
      trace_id: "tr_test",
      content_hash: MICRO_CONTENT_HASH,
      worldQuestId: "test_quest",
    });

    const result = replayTrace(trace, microRules);

    expect(result.ok).toBe(true);
    expect(result.finalHash).toBe(trace.expected_final_hash);
    expect(result.expectedFinalHash).toBe(trace.expected_final_hash);
    expect(result.divergedAtStep).toBeUndefined();
  });

  it("formats action label using [type, id] when both are present", () => {
    const actionsWithId = [...WIN];
    const customAction = { type: "USE", id: "potion" };
    actionsWithId[1] = customAction as unknown as RpgAction;

    const trace = recordTrace(microRules, microInitState(), actionsWithId, {
      trace_id: "tr_test",
      content_hash: MICRO_CONTENT_HASH,
      worldQuestId: "test_quest",
    });

    const hashes = [...trace.per_step_hashes!];
    hashes[1] = "0".repeat(64);
    const tampered = { ...trace, per_step_hashes: hashes };

    const result = replayTrace(tampered, microRules);

    expect(result.ok).toBe(false);
    expect(result.divergedAtStep).toBe(1);
    expect(result.message).toContain("action USE:potion");
  });

  it("formats action label using type when id is not a string", () => {
    const actionsWithId = [...WIN];
    const customAction = { type: "USE", id: 123 };
    actionsWithId[1] = customAction as unknown as RpgAction;

    const trace = recordTrace(microRules, microInitState(), actionsWithId, {
      trace_id: "tr_test",
      content_hash: MICRO_CONTENT_HASH,
      worldQuestId: "test_quest",
    });

    const hashes = [...trace.per_step_hashes!];
    hashes[1] = "0".repeat(64);
    const tampered = { ...trace, per_step_hashes: hashes };

    const result = replayTrace(tampered, microRules);

    expect(result.ok).toBe(false);
    expect(result.message).toContain("action USE");
    expect(result.message).not.toContain("123");
  });
});
