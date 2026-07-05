import { describe, it, expect } from "vitest";
import {
  save,
  load,
  assertSaveContentHash,
  SaveIntegrityError,
  SAVE_MODE,
} from "../../src/persist/save_load.js";
import { hashState } from "../../src/core/hash.js";
import { recordTrace } from "../../src/trace/record.js";
import { replayTrace } from "../../src/trace/replay.js";
import type { RpgAction } from "../../src/api/types.js";
import {
  MICRO_ACTIONS,
  microRules,
  microInitState,
  MICRO_PACK_ID,
  MICRO_CONTENT_HASH,
} from "../../src/demo/micro.js";

const WIN: RpgAction[] = [
  MICRO_ACTIONS.takeTorch,
  MICRO_ACTIONS.enterCave,
  MICRO_ACTIONS.grabGold,
  MICRO_ACTIONS.claimTreasure,
];

describe("save / load (§8.7)", () => {
  it("round-trips to an identical state hash", () => {
    const s = microInitState();
    const bytes = save(s, MICRO_PACK_ID, MICRO_CONTENT_HASH);
    const loaded = load(bytes, MICRO_CONTENT_HASH);
    expect(hashState(loaded.state)).toBe(hashState(s));
    expect(loaded.packId).toBe(MICRO_PACK_ID);
    expect(loaded.mode).toBe(SAVE_MODE);
    expect(loaded.source_ref).toEqual(["pack", MICRO_PACK_ID]);
  });

  it("rejects malformed state at the save write boundary", () => {
    const poisoned = {
      ...microInitState(),
      vars: { hp: Infinity },
    };
    const write = () => save(poisoned, MICRO_PACK_ID, MICRO_CONTENT_HASH);
    expect(write).toThrow(SaveIntegrityError);
    expect(write).toThrow(/malformed or non-finite/);
  });

  it("rejects a content-hash mismatch as a hard error", () => {
    const bytes = save(microInitState(), MICRO_PACK_ID, MICRO_CONTENT_HASH);
    expect(() => load(bytes, "deadbeef")).toThrow(SaveIntegrityError);
  });

  it("checks a loaded save bundle against a resolved pack hash", () => {
    const bytes = save(microInitState(), MICRO_PACK_ID, MICRO_CONTENT_HASH);
    const loaded = load(bytes);
    expect(() => assertSaveContentHash(loaded, MICRO_CONTENT_HASH)).not.toThrow();
    expect(() => assertSaveContentHash(loaded, "deadbeef")).toThrow(SaveIntegrityError);
  });

  it("loads without verification when no expected hash is supplied", () => {
    const bytes = save(microInitState(), MICRO_PACK_ID, MICRO_CONTENT_HASH);
    expect(load(bytes).contentHash).toBe(MICRO_CONTENT_HASH);
  });

  it("round-trips optional world quest identity", () => {
    const bytes = save(microInitState(), MICRO_PACK_ID, MICRO_CONTENT_HASH, SAVE_MODE, {
      worldQuestId: "sunken_barrow",
    });
    const loaded = load(bytes, MICRO_CONTENT_HASH);
    expect(loaded.worldQuestId).toBe("sunken_barrow");
    expect(loaded.source_ref).toEqual(["wq", "sunken_barrow"]);
  });

  it("round-trips optional generated RPG identity", () => {
    const bytes = save(microInitState(), MICRO_PACK_ID, MICRO_CONTENT_HASH, SAVE_MODE, {
      generatedRpgSeed: 3,
    });
    const loaded = load(bytes, MICRO_CONTENT_HASH);
    expect(loaded.generatedRpgSeed).toBe(3);
    expect(loaded.source_ref).toEqual(["gen", 3]);
  });

  it("rejects saves that omit the RPG mode", () => {
    const bytes = save(microInitState(), MICRO_PACK_ID, MICRO_CONTENT_HASH);
    const bundle = JSON.parse(bytes) as Record<string, unknown>;
    delete bundle.mode;
    expect(() => load(JSON.stringify(bundle), MICRO_CONTENT_HASH)).toThrow(SaveIntegrityError);
    expect(() => load(JSON.stringify(bundle), MICRO_CONTENT_HASH)).toThrow(/Save mode/);
  });

  it("rejects explicit legacy save modes", () => {
    const bytes = save(microInitState(), MICRO_PACK_ID, MICRO_CONTENT_HASH);
    for (const mode of ["parser", "cyoa"]) {
      const bundle = JSON.parse(bytes) as Record<string, unknown>;
      bundle.mode = mode;
      expect(() => load(JSON.stringify(bundle), MICRO_CONTENT_HASH)).toThrow(SaveIntegrityError);
      expect(() => load(JSON.stringify(bundle), MICRO_CONTENT_HASH)).toThrow(/Save mode/);
    }
  });

  it("rejects malformed world quest identity", () => {
    const bytes = save(microInitState(), MICRO_PACK_ID, MICRO_CONTENT_HASH);
    const bundle = JSON.parse(bytes) as Record<string, unknown>;
    bundle.worldQuestId = null;
    expect(() => load(JSON.stringify(bundle), MICRO_CONTENT_HASH)).toThrow(SaveIntegrityError);
    expect(() => load(JSON.stringify(bundle), MICRO_CONTENT_HASH)).toThrow(/worldQuestId/);
  });

  it("rejects conflicting compact save source identity", () => {
    const bytes = save(microInitState(), MICRO_PACK_ID, MICRO_CONTENT_HASH, SAVE_MODE, {
      worldQuestId: "sunken_barrow",
    });
    const bundle = JSON.parse(bytes) as Record<string, unknown>;
    bundle.source_ref = ["wq", "cold_forge"];
    expect(() => load(JSON.stringify(bundle), MICRO_CONTENT_HASH)).toThrow(SaveIntegrityError);
    expect(() => load(JSON.stringify(bundle), MICRO_CONTENT_HASH)).toThrow(/source_ref/);
  });

  it("rejects malformed compact save source identity", () => {
    const bytes = save(microInitState(), MICRO_PACK_ID, MICRO_CONTENT_HASH);
    const bundle = JSON.parse(bytes) as Record<string, unknown>;
    bundle.source_ref = ["gen", 3.5];
    expect(() => load(JSON.stringify(bundle), MICRO_CONTENT_HASH)).toThrow(SaveIntegrityError);
    expect(() => load(JSON.stringify(bundle), MICRO_CONTENT_HASH)).toThrow(/source_ref/);
  });

  it("rejects attempts to write a non-RPG mode", () => {
    expect(() =>
      save(
        microInitState(),
        MICRO_PACK_ID,
        MICRO_CONTENT_HASH,
        "parser" as unknown as typeof SAVE_MODE,
      ),
    ).toThrow(SaveIntegrityError);
  });
});

describe("trace record / replay (§8.8)", () => {
  it("a hand-written trace round-trips: record then replay reproduces the hash", () => {
    const trace = recordTrace(microRules, microInitState(), WIN, {
      trace_id: "tr_test",
      pack_id: MICRO_PACK_ID,
      content_hash: MICRO_CONTENT_HASH,
      worldQuestId: "sunken_barrow",
    });
    expect(trace.mode).toBe(SAVE_MODE);
    expect(trace.source_ref).toEqual(["wq", "sunken_barrow"]);
    expect(trace.worldQuestId).toBe("sunken_barrow");
    expect(trace.expected_final_hash).toBeDefined();
    const result = replayTrace(trace, microRules);
    expect(result.ok).toBe(true);
    expect(result.finalHash).toBe(trace.expected_final_hash);
  });

  it("rejects traces that omit the RPG mode", () => {
    const trace = recordTrace(microRules, microInitState(), WIN, {
      trace_id: "tr_test",
      pack_id: MICRO_PACK_ID,
      content_hash: MICRO_CONTENT_HASH,
    });
    expect(trace.source_ref).toEqual(["pack", MICRO_PACK_ID]);
    const { mode: _drop, ...withoutMode } = trace;
    expect(() => replayTrace(withoutMode as typeof trace, microRules)).toThrow(SaveIntegrityError);
    expect(() => replayTrace(withoutMode as typeof trace, microRules)).toThrow(/Trace mode/);
  });

  it("rejects ambiguous trace source metadata", () => {
    expect(() =>
      recordTrace(microRules, microInitState(), WIN, {
        trace_id: "tr_test",
        pack_id: MICRO_PACK_ID,
        content_hash: MICRO_CONTENT_HASH,
        worldQuestId: "sunken_barrow",
        generatedRpgSeed: 3,
      }),
    ).toThrow(/both worldQuestId and generatedRpgSeed/);
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
