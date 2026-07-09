import { describe, it, expect } from "vitest";
import { replayTrace, assertTraceMode } from "../../src/trace/replay.js";
import {
  microRules,
  microInitState,
  MICRO_ACTIONS,
  MICRO_CONTENT_HASH,
} from "../../src/demo/micro.js";
import { recordTrace, type Trace } from "../../src/trace/record.js";
import { SaveIntegrityError } from "../../src/persist/save_load.js";
import type { RpgAction } from "../../src/api/types.js";

const WIN: RpgAction[] = [
  MICRO_ACTIONS.takeTorch,
  MICRO_ACTIONS.enterCave,
  MICRO_ACTIONS.grabGold,
  MICRO_ACTIONS.claimTreasure,
];

const traceOptions = (overrides = {}) => ({
  trace_id: "tr_test",
  content_hash: MICRO_CONTENT_HASH,
  worldQuestId: "sunken_barrow",
  ...overrides,
});

describe("replayTrace", () => {
  it("returns ok when the trace matches expectations", () => {
    const trace = recordTrace(microRules, microInitState(), WIN, traceOptions());
    const result = replayTrace(trace, microRules);
    expect(result.ok).toBe(true);
    expect(result.expectedFinalHash).toBe(trace.expected_final_hash);
    expect(result.divergedAtStep).toBeUndefined();
  });

  it("handles traces with no expected_final_hash", () => {
    const trace = recordTrace(microRules, microInitState(), WIN, traceOptions());
    const { expected_final_hash: _, ...noExpected } = trace;
    const result = replayTrace(noExpected as unknown as Trace<RpgAction>, microRules);
    expect(result.ok).toBe(true);
    expect(result.message).toContain("no expected final hash");
    expect(result.expectedFinalHash).toBeUndefined();
  });

  it("detects when final hash mismatches", () => {
    const trace = recordTrace(microRules, microInitState(), WIN, traceOptions());
    const tampered = { ...trace, expected_final_hash: "0".repeat(64) };
    const result = replayTrace(tampered, microRules);
    expect(result.ok).toBe(false);
    expect(result.message).toContain("!=");
  });

  it("detects per_step_hashes divergence", () => {
    const trace = recordTrace(microRules, microInitState(), WIN, traceOptions());
    const hashes = [...trace.per_step_hashes!];
    hashes[1] = "0".repeat(64);
    const tampered = { ...trace, per_step_hashes: hashes };
    const result = replayTrace(tampered, microRules);
    expect(result.ok).toBe(false);
    expect(result.divergedAtStep).toBe(1);
    expect(result.message).toContain("First divergence at step 1");
  });

  it("formats action description when action lacks id", () => {
    const trace = recordTrace(microRules, microInitState(), WIN, traceOptions());
    const actionWithoutId = { type: "custom_type_only" } as unknown as RpgAction;
    const customActions = [...trace.actions];
    customActions[1] = actionWithoutId;
    const tampered = { ...trace, actions: customActions };

    const result = replayTrace(tampered as unknown as Trace<RpgAction>, microRules);

    expect(result.ok).toBe(false);
    expect(result.divergedAtStep).toBe(1);
    expect(result.message).toContain("custom_type_only");
  });

  it("formats action description when action is out of range", () => {
    const trace = recordTrace(microRules, microInitState(), WIN, traceOptions());

    const customActions = [WIN[0]!, WIN[1]!];
    // Make it sparse
    delete customActions[1];

    const tampered = {
      ...trace,
      actions: customActions,
      per_step_hashes: [trace.per_step_hashes![0], "0".repeat(64)], // match length, pass step 0, fail step 1
    };

    const result = replayTrace(tampered as unknown as Trace<RpgAction>, microRules);
    expect(result.ok).toBe(false);
    expect(result.divergedAtStep).toBe(1); // Fails at step 1 since it diverges
    expect(result.message).toContain("out of range");
  });

  it("detects when final hash mismatches but step hashes match (e.g. final hash manually altered but trace v1)", () => {
    const trace = recordTrace(microRules, microInitState(), WIN, traceOptions());
    const { per_step_hashes: _, ...v1 } = trace;
    const tampered = { ...v1, expected_final_hash: "0".repeat(64) };
    const result = replayTrace(tampered as unknown as Trace<RpgAction>, microRules);
    expect(result.ok).toBe(false);
    expect(result.divergedAtStep).toBeUndefined();
    expect(result.message).toContain("!=");
  });

  it("formats action description using JSON.stringify for actions missing both id and type", () => {
    const trace = recordTrace(microRules, microInitState(), WIN, traceOptions());

    let accesses = 0;
    // We use a getter that always returns valid during the check loop.
    // The check loops twice: once in assertTraceActions directly, once in assertTraceStepHashes -> assertTraceActions.
    const customAction = {
      get type() {
        accesses++;
        if (accesses <= 2) return "valid";
        return undefined;
      },
      otherData: "present",
    };

    const customActions = [...trace.actions];
    customActions[1] = customAction as unknown as RpgAction;

    const tampered = {
      ...trace,
      actions: customActions,
      per_step_hashes: [
        trace.per_step_hashes![0],
        "0".repeat(64),
        ...trace.per_step_hashes!.slice(2),
      ],
    };

    const result = replayTrace(tampered as unknown as Trace<RpgAction>, microRules);
    expect(result.ok).toBe(false);
    expect(result.divergedAtStep).toBe(1);
    expect(result.message).toContain('{"otherData":"present"}');
  });
});

describe("assertTraceMode", () => {
  it("throws if mode is missing", () => {
    const trace = recordTrace(microRules, microInitState(), WIN, traceOptions());
    const { mode: _, ...noMode } = trace;
    expect(() => assertTraceMode(noMode as unknown as Trace<RpgAction>)).toThrow(
      SaveIntegrityError,
    );
  });
});
