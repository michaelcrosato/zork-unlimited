/**
 * Adversarial / forged-save rejection suite for the §16 load-integrity gate
 * (src/persist/save_load.ts `GameStateSchema` + the `load()` guard).
 *
 * This is the SoundnessBench (arXiv:2412.03154) REJECTION-DIRECTION oracle for
 * the load boundary: a verifier is only credibly sound if it rejects instances
 * that are known-bad BY CONSTRUCTION, not merely accepts the ones it is fed.
 * The pre-existing tests/unit/save_trace.test.ts only exercise the ACCEPTANCE
 * direction (version, hash-mismatch, clean round-trip). `load()` was the
 * ASL (arXiv:2510.14253) "present-but-incomplete checker fed only well-behaved
 * input" — this suite plants the forged saves it MUST hard-error on.
 *
 * Each forged save is built by serializing a VALID bundle, then poisoning ONE
 * field, and asserting `load()` throws `SaveIntegrityError`. Two GREEN cases
 * (the false-rejection guard) prove every valid state still round-trips
 * byte-identically (so no hash moves).
 */
import { describe, it, expect } from "vitest";
import { save, load, SaveIntegrityError } from "../../src/persist/save_load.js";
import { hashState } from "../../src/core/hash.js";
import type { GameState } from "../../src/core/state.js";
import { microInitState, MICRO_PACK_ID, MICRO_CONTENT_HASH } from "../../src/demo/micro.js";

/** Build the canonical clean save bytes for the micro pack. */
function cleanBytes(state: GameState = microInitState()): string {
  return save(state, MICRO_PACK_ID, MICRO_CONTENT_HASH);
}

function forgeState(mutate: (state: Record<string, unknown>) => void): string {
  const bundle = JSON.parse(cleanBytes()) as { state: Record<string, unknown> };
  mutate(bundle.state);
  return JSON.stringify(bundle);
}

/**
 * Forge a save string carrying a NON-FINITE numeric token that no JSON encoder
 * would emit (JSON.stringify(Infinity) === "null", JSON.stringify(NaN) ===
 * "null"). We splice the literal token into the serialized JSON at a unique
 * sentinel, then SANITY-CHECK that the forged bytes really parse back to the
 * intended non-finite value before the test asserts the throw.
 */
function forgeWithToken(buildState: (sentinel: number) => GameState, token: string): string {
  const SENTINEL = 4242421337; // unlikely-to-collide marker we replace with `token`
  const state = buildState(SENTINEL);
  const bytes = cleanBytes(state);
  const forged = bytes.replace(String(SENTINEL), token);
  return forged;
}

describe("save/load integrity gate — forged-save REJECTION (§16, SoundnessBench oracle)", () => {
  it("WITNESS: vars.hp = 1e999 (parses to Infinity) is a hard SaveIntegrityError", () => {
    // Without this gate, an Infinity hp flows into conditions.ts:75
    //   var_gte: (state.vars[name] ?? 0) >= value
    // and makes EVERY `{var_gte:{name:"hp",value:N}}` gate always-true for any
    // finite N — a forged save would unlock every var_gte-gated route/ending/win.
    const forged = forgeWithToken((s) => ({ ...microInitState(), vars: { hp: s } }), "1e999");
    // Sanity: the forged bytes really carry Infinity, not the sentinel.
    expect((JSON.parse(forged) as { state: { vars: { hp: number } } }).state.vars.hp).toBe(
      Number.POSITIVE_INFINITY,
    );
    expect(() => load(forged, MICRO_CONTENT_HASH)).toThrow(SaveIntegrityError);
  });

  it("vars.x = NaN is a hard SaveIntegrityError", () => {
    // JSON has no NaN/Infinity literal at the *token* level for NaN
    // (JSON.stringify(NaN) === "null"), and the bare token `NaN` is itself
    // not valid JSON. So we forge the bytes via a `replacer` that emits the
    // literal token `NaN` inside the JSON text, proving the gate rejects it
    // whether NaN slips in as a non-finite-parsing token OR (defensively) as
    // an invalid-JSON token — either way `load()` MUST hard-error. NaN would
    // make every conditions.ts:75-77 var_gte/var_lte/var_eq silently FALSE.
    const valid = JSON.parse(cleanBytes()) as { state: { vars: Record<string, unknown> } };
    valid.state.vars = { x: "__NAN__" };
    const forged = JSON.stringify(valid).replace('"__NAN__"', "NaN");
    expect(() => load(forged, MICRO_CONTENT_HASH)).toThrow(SaveIntegrityError);
  });

  it("vars.x = -Infinity (-1e999) is a hard SaveIntegrityError", () => {
    const forged = forgeWithToken((s) => ({ ...microInitState(), vars: { x: s } }), "-1e999");
    expect((JSON.parse(forged) as { state: { vars: { x: number } } }).state.vars.x).toBe(
      Number.NEGATIVE_INFINITY,
    );
    expect(() => load(forged, MICRO_CONTENT_HASH)).toThrow(SaveIntegrityError);
  });

  it("seed = Infinity is a hard SaveIntegrityError", () => {
    const forged = forgeWithToken((s) => ({ ...microInitState(), seed: s }), "1e999");
    expect((JSON.parse(forged) as { state: { seed: number } }).state.seed).toBe(
      Number.POSITIVE_INFINITY,
    );
    expect(() => load(forged, MICRO_CONTENT_HASH)).toThrow(SaveIntegrityError);
  });

  it("WITNESS: seed = 1.5 (fractional, truncates to a different stream) is a hard SaveIntegrityError", () => {
    // 1.5 is finite, so the old `.finite()` gate accepted it — but `rngForStep`
    // consumes `seed >>> 0`, and `1.5 >>> 0 === 1`, so the loaded game would run
    // a DIFFERENT deterministic stream than the value the save's content hash
    // committed to (hash.ts canonicalizes the raw 1.5). The `.int()` gate rejects.
    const forged = forgeWithToken((s) => ({ ...microInitState(), seed: s }), "1.5");
    expect((JSON.parse(forged) as { state: { seed: number } }).state.seed).toBe(1.5);
    expect(() => load(forged, MICRO_CONTENT_HASH)).toThrow(SaveIntegrityError);
  });

  it("WITNESS: seed = 4294967301.5 (fractional, > 2^32-1) is a hard SaveIntegrityError", () => {
    // A fractional seed ABOVE the 2^32 range: finite (so the old `.finite()` gate
    // accepted it) but non-integer, and `>>> 0` both truncates the fraction AND
    // wraps the magnitude (4294967301.5 >>> 0 === 5) — doubly divergent from the
    // hash-committed value. NOTE: a bare INTEGER above 2^32-1 (e.g. 4294967301)
    // is a legitimate `.int()` value and is intentionally NOT rejected (see
    // CRITICAL #1: no sign/range bound on seed); only the non-integer is forged here.
    const forged = forgeWithToken((s) => ({ ...microInitState(), seed: s }), "4294967301.5");
    expect((JSON.parse(forged) as { state: { seed: number } }).state.seed).toBe(4294967301.5);
    expect(() => load(forged, MICRO_CONTENT_HASH)).toThrow(SaveIntegrityError);
  });

  it("WITNESS: step = 1.5 (fractional, truncates to a different stream) is a hard SaveIntegrityError", () => {
    // step is consumed as `step >>> 0` too (rngForStep); a fractional step
    // diverges from the hash-committed value. The `.int().nonnegative()` gate rejects.
    const forged = forgeWithToken((s) => ({ ...microInitState(), step: s }), "1.5");
    expect((JSON.parse(forged) as { state: { step: number } }).state.step).toBe(1.5);
    expect(() => load(forged, MICRO_CONTENT_HASH)).toThrow(SaveIntegrityError);
  });

  it("wrong-type flag (flags.lever = string, not boolean) is a hard SaveIntegrityError", () => {
    const bytes = forgeState((state) => {
      state.flags = { lever: "yes" };
    });
    expect(() => load(bytes, MICRO_CONTENT_HASH)).toThrow(SaveIntegrityError);
  });

  it("missing required field (no `current`) is a hard SaveIntegrityError", () => {
    const bytes = forgeState((state) => {
      delete state.current;
    });
    expect(() => load(bytes, MICRO_CONTENT_HASH)).toThrow(SaveIntegrityError);
  });

  it("malformed objectState (box.open = string) is a hard SaveIntegrityError", () => {
    const bytes = forgeState((state) => {
      state.objectState = { box: { open: "true" } };
    });
    expect(() => load(bytes, MICRO_CONTENT_HASH)).toThrow(SaveIntegrityError);
  });

  it("unknown objectState key is a hard SaveIntegrityError (.strict mirrors ObjectRuntime)", () => {
    const bytes = forgeState((state) => {
      state.objectState = { box: { open: true, sabotage: 1 } };
    });
    expect(() => load(bytes, MICRO_CONTENT_HASH)).toThrow(SaveIntegrityError);
  });
});

describe("save/load integrity gate — GREEN round-trip (no false rejection)", () => {
  it("the clean micro round-trip loads without throwing and the state hash is unchanged", () => {
    const s = microInitState();
    const bytes = cleanBytes(s);
    let loaded!: ReturnType<typeof load>;
    expect(() => {
      loaded = load(bytes, MICRO_CONTENT_HASH);
    }).not.toThrow();
    // validation runs BEFORE hashing — valid-state bytes/hash stay byte-identical.
    expect(hashState(loaded.state)).toBe(hashState(s));
  });

  it("OVER-RESTRICTION GUARD: a NEGATIVE integer seed (seed:-3) still round-trips with hash unchanged", () => {
    // The new `.int()` gate must match the entry boundary (server.ts:147 bare
    // .int()) EXACTLY — a negative seed is legitimate (`mulberry32(-3 >>> 0)` is
    // well-defined), so it MUST NOT be false-rejected. This proves the gate did
    // NOT over-restrict to `gte(0)` / a 2^32 range bound.
    const s: GameState = { ...microInitState(), seed: -3, step: 0 };
    const bytes = cleanBytes(s);
    let loaded!: ReturnType<typeof load>;
    expect(() => {
      loaded = load(bytes, MICRO_CONTENT_HASH);
    }).not.toThrow();
    expect(hashState(loaded.state)).toBe(hashState(s));
  });

  it("a RICH finite state (populated vars/flags/inventory/objectState/...) round-trips cleanly", () => {
    const rich: GameState = {
      seed: 7,
      step: 12,
      current: "treasure",
      visited: { start: true, cave: true, treasure: true },
      flags: { has_torch: true, lever_pulled: false },
      vars: { score: 30, hp: 18, gold: -5 }, // includes a negative — finite, must pass
      inventory: ["torch", "gold", "map"],
      objectState: {
        chest: { open: true, locked: false, contents: ["ruby"], room: "vault" },
        gate: { locked: true, takenBy: "world" },
      },
      journal: ["The cave breathes cold air.", "You grab the gold."],
      questStage: { main: "stage_2", side: "intro" },
      ended: false,
      endingId: null,
    };
    const bytes = cleanBytes(rich);
    let loaded!: ReturnType<typeof load>;
    expect(() => {
      loaded = load(bytes, MICRO_CONTENT_HASH);
    }).not.toThrow();
    expect(hashState(loaded.state)).toBe(hashState(rich));
  });
});
