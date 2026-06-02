import { describe, it, expect } from "vitest";
import { save, load, SaveIntegrityError } from "../../src/persist/save_load.js";
import { hashState } from "../../src/core/hash.js";
import { recordTrace } from "../../src/trace/record.js";
import { replayTrace } from "../../src/trace/replay.js";
import type { Action } from "../../src/api/types.js";
import {
  microRules,
  microInitState,
  MICRO_PACK_ID,
  MICRO_CONTENT_HASH,
} from "../../src/demo/micro.js";

const WIN: Action[] = [
  { type: "CHOOSE", choiceId: "take_torch" },
  { type: "CHOOSE", choiceId: "enter_cave" },
  { type: "CHOOSE", choiceId: "grab_gold" },
  { type: "CHOOSE", choiceId: "win" },
];

describe("save / load (§8.7)", () => {
  it("round-trips to an identical state hash", () => {
    const s = microInitState();
    const bytes = save(s, MICRO_PACK_ID, MICRO_CONTENT_HASH);
    const loaded = load(bytes, MICRO_CONTENT_HASH);
    expect(hashState(loaded.state)).toBe(hashState(s));
    expect(loaded.packId).toBe(MICRO_PACK_ID);
  });

  it("rejects a content-hash mismatch as a hard error", () => {
    const bytes = save(microInitState(), MICRO_PACK_ID, MICRO_CONTENT_HASH);
    expect(() => load(bytes, "deadbeef")).toThrow(SaveIntegrityError);
  });

  it("loads without verification when no expected hash is supplied", () => {
    const bytes = save(microInitState(), MICRO_PACK_ID, MICRO_CONTENT_HASH);
    expect(load(bytes).contentHash).toBe(MICRO_CONTENT_HASH);
  });
});

describe("trace record / replay (§8.8)", () => {
  it("a hand-written trace round-trips: record then replay reproduces the hash", () => {
    const trace = recordTrace(microRules, microInitState(), WIN, {
      trace_id: "tr_test",
      pack_id: MICRO_PACK_ID,
      content_hash: MICRO_CONTENT_HASH,
    });
    expect(trace.expected_final_hash).toBeDefined();
    const result = replayTrace(trace, microRules);
    expect(result.ok).toBe(true);
    expect(result.finalHash).toBe(trace.expected_final_hash);
  });

  it("detects divergence when the expected hash is wrong", () => {
    const trace = recordTrace(microRules, microInitState(), WIN, {
      trace_id: "tr_test",
      pack_id: MICRO_PACK_ID,
      content_hash: MICRO_CONTENT_HASH,
    });
    const tampered = { ...trace, expected_final_hash: "0".repeat(64) };
    const result = replayTrace(tampered, microRules);
    expect(result.ok).toBe(false);
    expect(result.message).toContain("!=");
  });
});

describe("trace v2: per-step divergence localization (§8.8)", () => {
  const newTrace = () =>
    recordTrace(microRules, microInitState(), WIN, {
      trace_id: "tr_v2",
      pack_id: MICRO_PACK_ID,
      content_hash: MICRO_CONTENT_HASH,
    });

  it("records a per-step hash for every action", () => {
    const trace = newTrace();
    expect(trace.per_step_hashes).toBeDefined();
    expect(trace.per_step_hashes).toHaveLength(WIN.length);
  });

  it("a faithful replay reports no divergence", () => {
    const result = replayTrace(newTrace(), microRules);
    expect(result.ok).toBe(true);
    expect(result.divergedAtStep).toBeUndefined();
  });

  it("localizes the FIRST divergent action when a per-step baseline is tampered", () => {
    const trace = newTrace();
    const hashes = [...trace.per_step_hashes!];
    hashes[2] = "0".repeat(64); // corrupt the 3rd step's recorded baseline
    const tampered = { ...trace, per_step_hashes: hashes };
    const result = replayTrace(tampered, microRules);
    expect(result.ok).toBe(false);
    expect(result.divergedAtStep).toBe(2);
    expect(result.message).toContain("step 2");
  });

  it("a v1 trace (no per_step_hashes) replays exactly as before — backward compatible", () => {
    const { per_step_hashes: _omit, ...v1 } = newTrace();
    const result = replayTrace(v1, microRules);
    expect(result.ok).toBe(true);
    expect(result.divergedAtStep).toBeUndefined();
  });
});
