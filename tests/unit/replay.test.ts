import { describe, it, expect } from "vitest";
import { assertTraceMode } from "../../src/trace/replay.js";
import { SaveIntegrityError } from "../../src/persist/save_load.js";
import { recordTrace } from "../../src/trace/record.js";
import {
  MICRO_ACTIONS,
  microRules,
  microInitState,
  MICRO_CONTENT_HASH,
} from "../../src/demo/micro.js";
import type { RpgAction } from "../../src/api/types.js";

const WIN: RpgAction[] = [
  MICRO_ACTIONS.takeTorch,
  MICRO_ACTIONS.enterCave,
  MICRO_ACTIONS.grabGold,
  MICRO_ACTIONS.claimTreasure,
];
const MICRO_WORLD_QUEST_ID = "sunken_barrow";

describe("assertTraceMode", () => {
  function getValidTrace() {
    return recordTrace(microRules, microInitState(), WIN, {
      trace_id: "tr_test",
      content_hash: MICRO_CONTENT_HASH,
      worldQuestId: MICRO_WORLD_QUEST_ID,
    });
  }

  it("passes for a valid trace", () => {
    const trace = getValidTrace();
    expect(() => assertTraceMode(trace)).not.toThrow();
  });

  it("throws if mode is missing", () => {
    const { mode: _mode, ...trace } = getValidTrace();
    expect(() =>
      assertTraceMode(trace as unknown as Parameters<typeof assertTraceMode>[0]),
    ).toThrow(SaveIntegrityError);
    expect(() =>
      assertTraceMode(trace as unknown as Parameters<typeof assertTraceMode>[0]),
    ).toThrow(/Trace mode/);
  });

  it("throws if mode is incorrect", () => {
    const trace = getValidTrace();
    expect(() =>
      assertTraceMode({ ...trace, mode: "rpg_invalid" } as unknown as Parameters<
        typeof assertTraceMode
      >[0]),
    ).toThrow(SaveIntegrityError);
    expect(() =>
      assertTraceMode({ ...trace, mode: "rpg_invalid" } as unknown as Parameters<
        typeof assertTraceMode
      >[0]),
    ).toThrow(/Trace mode/);
  });

  it("throws if trace_id is missing", () => {
    const { trace_id: _trace_id, ...trace } = getValidTrace();
    expect(() =>
      assertTraceMode(trace as unknown as Parameters<typeof assertTraceMode>[0]),
    ).toThrow(SaveIntegrityError);
    expect(() =>
      assertTraceMode(trace as unknown as Parameters<typeof assertTraceMode>[0]),
    ).toThrow(/trace_id/);
  });

  it("throws if initial_state is missing (or malformed)", () => {
    const { initial_state: _initial_state, ...trace } = getValidTrace();
    expect(() =>
      assertTraceMode(trace as unknown as Parameters<typeof assertTraceMode>[0]),
    ).toThrow(SaveIntegrityError);
    expect(() =>
      assertTraceMode(trace as unknown as Parameters<typeof assertTraceMode>[0]),
    ).toThrow(/State is malformed/);
  });

  it("throws if actions are missing", () => {
    const { actions: _actions, ...trace } = getValidTrace();
    expect(() =>
      assertTraceMode(trace as unknown as Parameters<typeof assertTraceMode>[0]),
    ).toThrow(SaveIntegrityError);
    expect(() =>
      assertTraceMode(trace as unknown as Parameters<typeof assertTraceMode>[0]),
    ).toThrow(/actions/);
  });

  it("does not throw if expected_final_hash is missing", () => {
    const { expected_final_hash: _expected_final_hash, ...trace } = getValidTrace();
    expect(() =>
      assertTraceMode(trace as unknown as Parameters<typeof assertTraceMode>[0]),
    ).not.toThrow();
  });

  it("throws if expected_final_hash is present but invalid", () => {
    const trace = getValidTrace();
    expect(() =>
      assertTraceMode({ ...trace, expected_final_hash: 123 } as unknown as Parameters<
        typeof assertTraceMode
      >[0]),
    ).toThrow(SaveIntegrityError);
    expect(() =>
      assertTraceMode({ ...trace, expected_final_hash: "" } as unknown as Parameters<
        typeof assertTraceMode
      >[0]),
    ).toThrow(SaveIntegrityError);
  });

  it("throws if source_ref is missing", () => {
    const { source_ref: _source_ref, ...trace } = getValidTrace();
    expect(() =>
      assertTraceMode(trace as unknown as Parameters<typeof assertTraceMode>[0]),
    ).toThrow(SaveIntegrityError);
    expect(() =>
      assertTraceMode(trace as unknown as Parameters<typeof assertTraceMode>[0]),
    ).toThrow(/source_ref/);
  });
});
