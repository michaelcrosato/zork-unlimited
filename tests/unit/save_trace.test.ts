import { describe, it, expect } from "vitest";
import {
  save,
  load,
  assertSaveContentHash,
  SaveIntegrityError,
  SAVE_MODE,
  type SaveMetadata,
} from "../../src/persist/save_load.js";
import { hashState } from "../../src/core/hash.js";
import { recordTrace, traceSourceLabel, type RecordOptions } from "../../src/trace/record.js";
import { assertTraceMode, replayTrace } from "../../src/trace/replay.js";
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
const UNSAFE_GENERATED_RPG_SEED = Number.MAX_SAFE_INTEGER + 1;
const MICRO_WORLD_QUEST_ID = "sunken_barrow";
const MICRO_SAVE_SOURCE: SaveMetadata = { worldQuestId: MICRO_WORLD_QUEST_ID };

function saveMicro(state = microInitState(), metadata: SaveMetadata = MICRO_SAVE_SOURCE): string {
  return save(state, MICRO_CONTENT_HASH, SAVE_MODE, metadata);
}

function traceOptions(overrides: Partial<RecordOptions> = {}): RecordOptions {
  const source =
    overrides.generatedRpgSeed === undefined && overrides.worldQuestId === undefined
      ? { worldQuestId: MICRO_WORLD_QUEST_ID }
      : {};
  return {
    trace_id: "tr_test",
    content_hash: MICRO_CONTENT_HASH,
    ...source,
    ...overrides,
  };
}

describe("save / load (§8.7)", () => {
  it("round-trips to an identical state hash", () => {
    const s = microInitState();
    const bytes = saveMicro(s);
    const loaded = load(bytes, MICRO_CONTENT_HASH);
    expect(hashState(loaded.state)).toBe(hashState(s));
    expect(loaded.mode).toBe(SAVE_MODE);
    expect(loaded.source_ref).toEqual(["wq", MICRO_WORLD_QUEST_ID]);
    expect("packId" in loaded).toBe(false);
    const raw = JSON.parse(bytes) as Record<string, unknown>;
    expect("packId" in raw).toBe(false);
    expect("worldQuestId" in raw).toBe(false);
    expect("generatedRpgSeed" in raw).toBe(false);
  });

  it("returns immutable loaded bundles after validation", () => {
    const bytes = saveMicro({
      ...microInitState(),
      inventory: ["torch"],
      objectState: { chest: { contents: ["ruby"] } },
    });
    const loaded = load(bytes, MICRO_CONTENT_HASH);

    expect(Object.isFrozen(loaded)).toBe(true);
    expect(Object.isFrozen(loaded.source_ref)).toBe(true);
    expect(Object.isFrozen(loaded.state)).toBe(true);
    expect(Object.isFrozen(loaded.state.inventory)).toBe(true);
    expect(Object.isFrozen(loaded.state.objectState)).toBe(true);
    expect(Object.isFrozen(loaded.state.objectState["chest"])).toBe(true);
    expect(Object.isFrozen(loaded.state.objectState["chest"]?.contents)).toBe(true);
    expect(() => {
      loaded.contentHash = "deadbeef";
    }).toThrow(TypeError);
    expect(() => {
      (loaded.source_ref as [string, string])[1] = "cold_forge";
    }).toThrow(TypeError);
    expect(() => {
      loaded.state.inventory.push("mutated");
    }).toThrow(TypeError);
    expect(() => {
      loaded.state.objectState["chest"]!.contents!.push("mutated");
    }).toThrow(TypeError);
  });

  it("rejects malformed state at the save write boundary", () => {
    const poisoned = {
      ...microInitState(),
      vars: { hp: Infinity },
    };
    const write = () => saveMicro(poisoned);
    expect(write).toThrow(SaveIntegrityError);
    expect(write).toThrow(/malformed or non-finite/);
  });

  it("rejects malformed save envelope identity at the write boundary", () => {
    expect(() => save(microInitState(), "")).toThrow(SaveIntegrityError);
    expect(() => save(microInitState(), 12 as unknown as string)).toThrow(SaveIntegrityError);
  });

  it("rejects package-only source fallback at the write boundary", () => {
    expect(() => save(microInitState(), MICRO_CONTENT_HASH)).toThrow(SaveIntegrityError);
    expect(() => save(microInitState(), MICRO_CONTENT_HASH)).toThrow(
      /worldQuestId or generatedRpgSeed/,
    );
  });

  it("rejects a content-hash mismatch as a hard error", () => {
    const bytes = saveMicro();
    expect(() => load(bytes, "deadbeef")).toThrow(SaveIntegrityError);
  });

  it("rejects malformed save envelope identity at the load boundary", () => {
    for (const field of ["contentHash"] as const) {
      for (const value of ["", 12, null]) {
        const bundle = JSON.parse(saveMicro()) as { [key: string]: unknown };
        bundle[field] = value;

        expect(() => load(JSON.stringify(bundle))).toThrow(SaveIntegrityError);
        expect(() => load(JSON.stringify(bundle))).toThrow(field);
      }
    }
  });

  it("rejects retired package identity at the load boundary", () => {
    const bundle = JSON.parse(saveMicro()) as Record<string, unknown>;
    bundle.packId = MICRO_PACK_ID;

    expect(() => load(JSON.stringify(bundle), MICRO_CONTENT_HASH)).toThrow(SaveIntegrityError);
    expect(() => load(JSON.stringify(bundle), MICRO_CONTENT_HASH)).toThrow(/packId is retired/);
  });

  it("checks a loaded save bundle against a resolved source hash", () => {
    const bytes = saveMicro();
    const loaded = load(bytes);
    expect(() => assertSaveContentHash(loaded, MICRO_CONTENT_HASH)).not.toThrow();
    expect(() => assertSaveContentHash(loaded, "deadbeef")).toThrow(SaveIntegrityError);
  });

  it("loads without verification when no expected hash is supplied", () => {
    const bytes = saveMicro();
    expect(load(bytes).contentHash).toBe(MICRO_CONTENT_HASH);
  });

  it("emits only compact world quest identity", () => {
    const bytes = saveMicro();
    const loaded = load(bytes, MICRO_CONTENT_HASH);
    expect(loaded.source_ref).toEqual(["wq", MICRO_WORLD_QUEST_ID]);
    expect("worldQuestId" in loaded).toBe(false);
    expect("generatedRpgSeed" in loaded).toBe(false);
  });

  it("emits only compact generated RPG identity", () => {
    const bytes = save(microInitState(), MICRO_CONTENT_HASH, SAVE_MODE, {
      generatedRpgSeed: 3,
    });
    const loaded = load(bytes, MICRO_CONTENT_HASH);
    expect(loaded.source_ref).toEqual(["gen", 3]);
    expect("worldQuestId" in loaded).toBe(false);
    expect("generatedRpgSeed" in loaded).toBe(false);
  });

  it("rejects unsafe generated RPG source identities", () => {
    expect(() =>
      save(microInitState(), MICRO_CONTENT_HASH, SAVE_MODE, {
        generatedRpgSeed: UNSAFE_GENERATED_RPG_SEED,
      }),
    ).toThrow(SaveIntegrityError);

    const bytes = save(microInitState(), MICRO_CONTENT_HASH, SAVE_MODE, {
      generatedRpgSeed: 3,
    });
    const bundle = JSON.parse(bytes) as Record<string, unknown>;
    bundle.source_ref = ["gen", UNSAFE_GENERATED_RPG_SEED];

    expect(() => load(JSON.stringify(bundle), MICRO_CONTENT_HASH)).toThrow(SaveIntegrityError);
    expect(() => load(JSON.stringify(bundle), MICRO_CONTENT_HASH)).toThrow(/safe range/);
  });

  it("rejects saves that omit the RPG mode", () => {
    const bytes = saveMicro();
    const bundle = JSON.parse(bytes) as Record<string, unknown>;
    delete bundle.mode;
    expect(() => load(JSON.stringify(bundle), MICRO_CONTENT_HASH)).toThrow(SaveIntegrityError);
    expect(() => load(JSON.stringify(bundle), MICRO_CONTENT_HASH)).toThrow(/Save mode/);
  });

  it("rejects explicit legacy save modes", () => {
    const bytes = saveMicro();
    for (const mode of ["parser", "cyoa"]) {
      const bundle = JSON.parse(bytes) as Record<string, unknown>;
      bundle.mode = mode;
      expect(() => load(JSON.stringify(bundle), MICRO_CONTENT_HASH)).toThrow(SaveIntegrityError);
      expect(() => load(JSON.stringify(bundle), MICRO_CONTENT_HASH)).toThrow(/Save mode/);
    }
  });

  it("rejects malformed world quest identity", () => {
    const bytes = saveMicro();
    const bundle = JSON.parse(bytes) as Record<string, unknown>;
    bundle.worldQuestId = null;
    expect(() => load(JSON.stringify(bundle), MICRO_CONTENT_HASH)).toThrow(SaveIntegrityError);
    expect(() => load(JSON.stringify(bundle), MICRO_CONTENT_HASH)).toThrow(/worldQuestId/);
  });

  it("rejects conflicting legacy save source mirrors", () => {
    const bytes = saveMicro();
    const bundle = JSON.parse(bytes) as Record<string, unknown>;
    bundle.worldQuestId = MICRO_WORLD_QUEST_ID;
    bundle.source_ref = ["wq", "cold_forge"];
    expect(() => load(JSON.stringify(bundle), MICRO_CONTENT_HASH)).toThrow(SaveIntegrityError);
    expect(() => load(JSON.stringify(bundle), MICRO_CONTENT_HASH)).toThrow(/source_ref/);
  });

  it("rejects malformed compact save source identity", () => {
    const bytes = saveMicro();
    const bundle = JSON.parse(bytes) as Record<string, unknown>;
    bundle.source_ref = ["gen", 3.5];
    expect(() => load(JSON.stringify(bundle), MICRO_CONTENT_HASH)).toThrow(SaveIntegrityError);
    expect(() => load(JSON.stringify(bundle), MICRO_CONTENT_HASH)).toThrow(/source_ref/);
  });

  it("rejects saves without compact source identity at the load boundary", () => {
    const bytes = saveMicro();
    const bundle = JSON.parse(bytes) as Record<string, unknown>;
    delete bundle.source_ref;
    expect(() => load(JSON.stringify(bundle), MICRO_CONTENT_HASH)).toThrow(SaveIntegrityError);
    expect(() => load(JSON.stringify(bundle), MICRO_CONTENT_HASH)).toThrow(/source_ref/);
  });

  it("rejects package-only source fallback saves at the load boundary", () => {
    const bytes = JSON.stringify({
      version: 1,
      contentHash: MICRO_CONTENT_HASH,
      mode: SAVE_MODE,
      source_ref: ["pack", MICRO_PACK_ID],
      state: microInitState(),
    });

    expect(() => load(bytes, MICRO_CONTENT_HASH)).toThrow(SaveIntegrityError);
    expect(() => load(bytes, MICRO_CONTENT_HASH)).toThrow(/source_ref/);
  });

  it("rejects attempts to write a non-RPG mode", () => {
    expect(() =>
      save(microInitState(), MICRO_CONTENT_HASH, "parser" as unknown as typeof SAVE_MODE),
    ).toThrow(SaveIntegrityError);
  });
});

describe("assertTraceMode", () => {
  it("rejects traces that omit the RPG mode", () => {
    expect(() => assertTraceMode({} as Parameters<typeof assertTraceMode>[0])).toThrow(
      SaveIntegrityError,
    );
    expect(() => assertTraceMode({} as Parameters<typeof assertTraceMode>[0])).toThrow(
      /Trace mode/,
    );
  });

  it("rejects traces with the wrong RPG mode", () => {
    expect(() =>
      assertTraceMode({ mode: "wrong" } as Parameters<typeof assertTraceMode>[0]),
    ).toThrow(SaveIntegrityError);
    expect(() =>
      assertTraceMode({ mode: "wrong" } as Parameters<typeof assertTraceMode>[0]),
    ).toThrow(/Trace mode/);
  });

  it("accepts a valid trace", () => {
    const trace = recordTrace(microRules, microInitState(), WIN, traceOptions());
    expect(() => assertTraceMode(trace)).not.toThrow();
  });
});

describe("trace record / replay (§8.8)", () => {
  it("a hand-written trace round-trips: record then replay reproduces the hash", () => {
    const trace = recordTrace(microRules, microInitState(), WIN, traceOptions());
    expect(trace.mode).toBe(SAVE_MODE);
    expect(trace.source_ref).toEqual(["wq", MICRO_WORLD_QUEST_ID]);
    expect("worldQuestId" in trace).toBe(false);
    expect("generatedRpgSeed" in trace).toBe(false);
    expect("pack_id" in trace).toBe(false);
    expect(trace.expected_final_hash).toBeDefined();
    const result = replayTrace(trace, microRules);
    expect(result.ok).toBe(true);
    expect(result.finalHash).toBe(trace.expected_final_hash);
  });

  it("round-trips generated RPG trace identity", () => {
    const trace = recordTrace(microRules, microInitState(), WIN, {
      trace_id: "tr_generated",
      content_hash: MICRO_CONTENT_HASH,
      generatedRpgSeed: 3,
    });
    expect(trace.source_ref).toEqual(["gen", 3]);
    expect("generatedRpgSeed" in trace).toBe(false);
    expect("worldQuestId" in trace).toBe(false);
    expect(traceSourceLabel(trace)).toBe("generate_rpg_seed:3");
    expect(replayTrace(trace, microRules).ok).toBe(true);
  });

  it("rejects traces that omit the RPG mode", () => {
    const trace = recordTrace(microRules, microInitState(), WIN, traceOptions());
    expect(trace.source_ref).toEqual(["wq", MICRO_WORLD_QUEST_ID]);
    const { mode: _drop, ...withoutMode } = trace;
    expect(() => replayTrace(withoutMode as typeof trace, microRules)).toThrow(SaveIntegrityError);
    expect(() => replayTrace(withoutMode as typeof trace, microRules)).toThrow(/Trace mode/);
  });

  it("rejects traces without source identity at the recording boundary", () => {
    expect(() =>
      recordTrace(microRules, microInitState(), WIN, {
        trace_id: "tr_test",
        content_hash: MICRO_CONTENT_HASH,
      }),
    ).toThrow(SaveIntegrityError);
    expect(() =>
      recordTrace(microRules, microInitState(), WIN, {
        trace_id: "tr_test",
        content_hash: MICRO_CONTENT_HASH,
      }),
    ).toThrow(/worldQuestId or generatedRpgSeed/);
  });

  it("rejects traces without compact source identity at the replay boundary", () => {
    const trace = recordTrace(microRules, microInitState(), WIN, traceOptions());
    const { source_ref: _drop, ...withoutSourceRef } = trace;

    expect(() => replayTrace(withoutSourceRef as typeof trace, microRules)).toThrow(
      SaveIntegrityError,
    );
    expect(() => replayTrace(withoutSourceRef as typeof trace, microRules)).toThrow(/source_ref/);
  });

  it("rejects malformed trace identity at the recording boundary", () => {
    const base = traceOptions();

    for (const field of ["trace_id", "content_hash"] as const) {
      for (const value of ["", 12, null]) {
        const malformed = { ...base, [field]: value } as typeof base;

        expect(() => recordTrace(microRules, microInitState(), WIN, malformed)).toThrow(
          SaveIntegrityError,
        );
        expect(() => recordTrace(microRules, microInitState(), WIN, malformed)).toThrow(field);
      }
    }
  });

  it("rejects malformed trace identity at the replay boundary", () => {
    const trace = recordTrace(microRules, microInitState(), WIN, traceOptions());

    for (const field of ["trace_id", "content_hash"] as const) {
      for (const value of ["", 12, null]) {
        const malformed = { ...trace, [field]: value } as unknown as typeof trace;

        expect(() => replayTrace(malformed, microRules)).toThrow(SaveIntegrityError);
        expect(() => replayTrace(malformed, microRules)).toThrow(field);
      }
    }
  });

  it("rejects malformed trace action lists at the replay boundary", () => {
    const trace = recordTrace(microRules, microInitState(), WIN, traceOptions());

    for (const value of [undefined, null, "not-actions", { 0: MICRO_ACTIONS.takeTorch }]) {
      const malformed = { ...trace, actions: value } as unknown as typeof trace;

      expect(() => replayTrace(malformed, microRules)).toThrow(SaveIntegrityError);
      expect(() => replayTrace(malformed, microRules)).toThrow(/actions/);
    }
  });

  it("rejects malformed trace action entries at the replay boundary", () => {
    const trace = recordTrace(microRules, microInitState(), WIN, traceOptions());

    for (const value of [null, "look", [], { type: "" }, { type: 12 }]) {
      const malformed = { ...trace, actions: [value] } as unknown as typeof trace;

      expect(() => replayTrace(malformed, microRules)).toThrow(SaveIntegrityError);
      expect(() => replayTrace(malformed, microRules)).toThrow(/actions\[0\]/);
    }
  });

  it("rejects malformed trace initial state at the replay boundary", () => {
    const trace = recordTrace(microRules, microInitState(), WIN, traceOptions());
    const malformed = {
      ...trace,
      initial_state: {
        ...trace.initial_state,
        vars: { ...trace.initial_state.vars, hp: Number.POSITIVE_INFINITY },
      },
    } as unknown as typeof trace;

    expect(() => replayTrace(malformed, microRules)).toThrow(SaveIntegrityError);
    expect(() => replayTrace(malformed, microRules)).toThrow(/initial_state|non-finite/);
  });

  it("rejects traces whose reported seed is detached from initial_state.seed", () => {
    const trace = recordTrace(microRules, microInitState(), WIN, traceOptions());

    for (const value of [trace.seed + 1, Number.MAX_SAFE_INTEGER + 1, 3.5, null]) {
      const malformed = { ...trace, seed: value } as unknown as typeof trace;

      expect(() => replayTrace(malformed, microRules)).toThrow(SaveIntegrityError);
      expect(() => replayTrace(malformed, microRules)).toThrow(/seed/);
    }
  });

  it("rejects malformed expected final hashes at the replay boundary", () => {
    const trace = recordTrace(microRules, microInitState(), WIN, traceOptions());

    for (const value of ["", null, 12, ["not-a-hash"]]) {
      const malformed = { ...trace, expected_final_hash: value } as unknown as typeof trace;

      expect(() => replayTrace(malformed, microRules)).toThrow(SaveIntegrityError);
      expect(() => replayTrace(malformed, microRules)).toThrow(/expected_final_hash/);
    }
  });

  it("rejects ambiguous trace source metadata", () => {
    expect(() =>
      recordTrace(microRules, microInitState(), WIN, {
        trace_id: "tr_test",
        content_hash: MICRO_CONTENT_HASH,
        worldQuestId: "sunken_barrow",
        generatedRpgSeed: 3,
      }),
    ).toThrow(/both worldQuestId and generatedRpgSeed/);
  });

  it("rejects unsafe generated trace source identities", () => {
    expect(() =>
      recordTrace(microRules, microInitState(), WIN, {
        trace_id: "tr_test",
        content_hash: MICRO_CONTENT_HASH,
        generatedRpgSeed: UNSAFE_GENERATED_RPG_SEED,
      }),
    ).toThrow(/safe range/);
  });

  it("rejects conflicting compact trace source identity at the replay boundary", () => {
    const trace = recordTrace(microRules, microInitState(), WIN, {
      trace_id: "tr_generated",
      content_hash: MICRO_CONTENT_HASH,
      generatedRpgSeed: 3,
    });

    const mismatchedGenerated = {
      ...trace,
      generatedRpgSeed: 3,
      source_ref: ["gen", 4],
    } as unknown as typeof trace;
    expect(() => replayTrace(mismatchedGenerated, microRules)).toThrow(SaveIntegrityError);
    expect(() => replayTrace(mismatchedGenerated, microRules)).toThrow(/source_ref/);

    const conflictingWorldQuest = {
      ...trace,
      generatedRpgSeed: 3,
      source_ref: ["wq", "sunken_barrow"],
    } as unknown as typeof trace;
    expect(() => replayTrace(conflictingWorldQuest, microRules)).toThrow(SaveIntegrityError);
    expect(() => replayTrace(conflictingWorldQuest, microRules)).toThrow(/source_ref/);
  });

  it("rejects malformed generated trace metadata at the replay boundary", () => {
    const trace = recordTrace(microRules, microInitState(), WIN, {
      trace_id: "tr_generated",
      content_hash: MICRO_CONTENT_HASH,
      generatedRpgSeed: 3,
    });

    for (const value of [Number.MAX_SAFE_INTEGER + 1, 3.5, null]) {
      const malformed = { ...trace, generatedRpgSeed: value } as unknown as typeof trace;
      expect(() => replayTrace(malformed, microRules)).toThrow(SaveIntegrityError);
      expect(() => replayTrace(malformed, microRules)).toThrow(/generatedRpgSeed/);
    }
  });

  it("detects divergence when the expected hash is wrong", () => {
    const trace = recordTrace(microRules, microInitState(), WIN, traceOptions());
    const tampered = { ...trace, expected_final_hash: "0".repeat(64) };
    const result = replayTrace(tampered, microRules);
    expect(result.ok).toBe(false);
    expect(result.message).toContain("!=");
  });

  it("rejects package-only source fallback traces at the replay boundary", () => {
    const canonical = recordTrace(microRules, microInitState(), WIN, traceOptions());
    const legacyTrace = {
      ...canonical,
      source_ref: ["pack", MICRO_PACK_ID],
      worldQuestId: undefined,
    } as unknown as typeof canonical;

    expect(() => replayTrace(legacyTrace, microRules)).toThrow(SaveIntegrityError);
    expect(() => replayTrace(legacyTrace, microRules)).toThrow(/source_ref/);
  });
});

describe("trace v2: per-step divergence localization (§8.8)", () => {
  const newTrace = () =>
    recordTrace(microRules, microInitState(), WIN, traceOptions({ trace_id: "tr_v2" }));

  it("records a per-step hash for every action", () => {
    const trace = newTrace();
    expect(trace.per_step_hashes).toBeDefined();
    expect(trace.per_step_hashes).toHaveLength(WIN.length);
  });

  it("rejects malformed per-step baselines instead of comparing only their overlap", () => {
    const trace = newTrace();
    const hashes = trace.per_step_hashes!;
    const malformed = [
      { ...trace, per_step_hashes: hashes.slice(0, -1) },
      { ...trace, per_step_hashes: [...hashes, hashes[0]!] },
      { ...trace, per_step_hashes: "not-an-array" },
      { ...trace, per_step_hashes: hashes.map((hash, i) => (i === 1 ? "" : hash)) },
    ] as unknown as (typeof trace)[];

    for (const candidate of malformed) {
      expect(() => replayTrace(candidate, microRules)).toThrow(SaveIntegrityError);
      expect(() => replayTrace(candidate, microRules)).toThrow(/per_step_hashes/);
    }
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

  it("rejects malformed v1 trace action lists before replaying", () => {
    const { per_step_hashes: _omit, ...v1 } = newTrace();
    const malformed = { ...v1, actions: "not-actions" } as unknown as typeof v1;

    expect(() => replayTrace(malformed, microRules)).toThrow(SaveIntegrityError);
    expect(() => replayTrace(malformed, microRules)).toThrow(/actions/);
  });
});
