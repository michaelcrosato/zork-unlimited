import { describe, it, expect } from "vitest";
import { assertTraceMode } from "../../src/trace/replay.js";
import { SAVE_MODE, SaveIntegrityError } from "../../src/persist/save_load.js";
import { microInitState, MICRO_CONTENT_HASH } from "../../src/demo/micro.js";

describe("assertTraceMode", () => {
  const initState = microInitState();
  const validTrace = {
    mode: SAVE_MODE,
    trace_id: "tr_test",
    content_hash: MICRO_CONTENT_HASH,
    seed: initState.seed,
    initial_state: initState,
    actions: [],
    expected_final_hash: "0".repeat(64),
    source_ref: ["wq", "sunken_barrow"],
  };

  it("accepts a valid trace", () => {
    expect(() => assertTraceMode(validTrace)).not.toThrow();
  });

  it("throws SaveIntegrityError when trace mode is missing", () => {
    const { mode: _mode, ...traceWithoutMode } = validTrace;
    expect(() => assertTraceMode(traceWithoutMode as unknown as Parameters<typeof assertTraceMode>[0])).toThrow(SaveIntegrityError);
    expect(() => assertTraceMode(traceWithoutMode as unknown as Parameters<typeof assertTraceMode>[0])).toThrow(/Trace mode must be/);
  });

  it("throws SaveIntegrityError when trace mode is invalid", () => {
    const invalidTrace = { ...validTrace, mode: "parser" };
    expect(() => assertTraceMode(invalidTrace as unknown as Parameters<typeof assertTraceMode>[0])).toThrow(SaveIntegrityError);
    expect(() => assertTraceMode(invalidTrace as unknown as Parameters<typeof assertTraceMode>[0])).toThrow(/Trace mode must be/);
  });

  it("delegates to assertTraceIdentityFields", () => {
    const invalidTrace = { ...validTrace, trace_id: 123 };
    expect(() => assertTraceMode(invalidTrace as unknown as Parameters<typeof assertTraceMode>[0])).toThrow(SaveIntegrityError);
    expect(() => assertTraceMode(invalidTrace as unknown as Parameters<typeof assertTraceMode>[0])).toThrow(/trace_id/);
  });

  it("delegates to assertTraceState", () => {
    const invalidTrace = { ...validTrace, seed: "not-a-number" };
    expect(() => assertTraceMode(invalidTrace as unknown as Parameters<typeof assertTraceMode>[0])).toThrow(SaveIntegrityError);
    expect(() => assertTraceMode(invalidTrace as unknown as Parameters<typeof assertTraceMode>[0])).toThrow(/seed/);
  });

  it("delegates to assertTraceActions", () => {
    const invalidTrace = { ...validTrace, actions: "not-an-array" };
    expect(() => assertTraceMode(invalidTrace as unknown as Parameters<typeof assertTraceMode>[0])).toThrow(SaveIntegrityError);
    expect(() => assertTraceMode(invalidTrace as unknown as Parameters<typeof assertTraceMode>[0])).toThrow(/actions/);
  });

  it("delegates to assertTraceExpectedFinalHash", () => {
    const invalidTrace = { ...validTrace, expected_final_hash: 123 };
    expect(() => assertTraceMode(invalidTrace as unknown as Parameters<typeof assertTraceMode>[0])).toThrow(SaveIntegrityError);
    expect(() => assertTraceMode(invalidTrace as unknown as Parameters<typeof assertTraceMode>[0])).toThrow(/expected_final_hash/);
  });

  it("delegates to assertTraceStepHashes", () => {
    const invalidTrace = { ...validTrace, per_step_hashes: "not-an-array" };
    expect(() => assertTraceMode(invalidTrace as unknown as Parameters<typeof assertTraceMode>[0])).toThrow(SaveIntegrityError);
    expect(() => assertTraceMode(invalidTrace as unknown as Parameters<typeof assertTraceMode>[0])).toThrow(/per_step_hashes/);
  });

  it("delegates to assertTraceSourceRefConsistency", () => {
    const invalidTrace = { ...validTrace, worldQuestId: "a", generatedRpgSeed: 1 };
    expect(() => assertTraceMode(invalidTrace as unknown as Parameters<typeof assertTraceMode>[0])).toThrow(SaveIntegrityError);
    expect(() => assertTraceMode(invalidTrace as unknown as Parameters<typeof assertTraceMode>[0])).toThrow(/Trace source cannot carry both/);
  });
});
