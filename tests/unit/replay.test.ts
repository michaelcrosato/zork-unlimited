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

const traceOptions = (overrides?: Partial<Parameters<typeof recordTrace>[3]>) => ({
  trace_id: "tr_test",
  content_hash: MICRO_CONTENT_HASH,
  worldQuestId: MICRO_WORLD_QUEST_ID,
  ...overrides,
});

describe("assertTraceMode", () => {
  it("does not throw for a valid trace", () => {
    const trace = recordTrace(microRules, microInitState(), WIN, traceOptions());
    expect(() => assertTraceMode(trace)).not.toThrow();
  });

  it("throws SaveIntegrityError if mode is missing or invalid", () => {
    const trace = recordTrace(microRules, microInitState(), WIN, traceOptions());
    const { mode: _mode, ...withoutMode } = trace;

    expect(() => assertTraceMode(withoutMode as unknown as typeof trace)).toThrow(
      SaveIntegrityError,
    );
    expect(() => assertTraceMode(withoutMode as unknown as typeof trace)).toThrow(
      /Trace mode must be/,
    );

    const invalidMode = { ...trace, mode: "INVALID_MODE" };
    expect(() => assertTraceMode(invalidMode as unknown as typeof trace)).toThrow(
      SaveIntegrityError,
    );
    expect(() => assertTraceMode(invalidMode as unknown as typeof trace)).toThrow(
      /Trace mode must be/,
    );
  });

  it("throws SaveIntegrityError for missing trace identity fields", () => {
    const trace = recordTrace(microRules, microInitState(), WIN, traceOptions());

    const { trace_id: _trace_id, ...withoutTraceId } = trace;
    expect(() => assertTraceMode(withoutTraceId as unknown as typeof trace)).toThrow(
      SaveIntegrityError,
    );

    const { content_hash: _content_hash, ...withoutContentHash } = trace;
    expect(() => assertTraceMode(withoutContentHash as unknown as typeof trace)).toThrow(
      SaveIntegrityError,
    );
  });
});
