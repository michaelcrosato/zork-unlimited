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
