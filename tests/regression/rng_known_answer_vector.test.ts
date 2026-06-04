import { describe, it, expect } from "vitest";
import { mulberry32, rngForStep } from "../../src/core/rng.js";

/**
 * ABSOLUTE known-answer vector (KAT) for the engine's only RNG (spec §4.1, §8.5).
 *
 * THE GAP THIS CLOSES (a verification-depth asymmetry, NOT a defect — parity with
 * the SoundnessBench negative-corpus discipline bug_0182/0218/0227 brought to the
 * determinism keystone). The whole benchmark's reproducibility claim — "identical
 * seed ⇒ identical state hashes", re-confirmed live by every blind playtest — rests
 * on `mulberry32`/`rngForStep` emitting one specific, frozen byte-stream. Every pinned
 * trace `expected_final_hash`, every best/worst-roll reachability bracket
 * (rpg_all_endings_reachable et al.), every scorecard row, and every save-replay hash
 * is computed THROUGH this stream. Yet the only existing RNG tests (tests/unit/hash_rng.test.ts)
 * assert nothing but RELATIVE properties: same seed ⇒ same stream (self-consistency),
 * different seeds ⇒ different streams, rngForStep reproducible per (seed,step), int in
 * range. ALL FOUR survive a wholesale swap of mulberry32 for a different PRNG — or a
 * silent change to a mixing constant (0x6d2b79f5 / 0x9e3779b1 / 0x85ebca6b), the shift
 * amounts, or the `int()` floor/range mapping. Such a change would invalidate every
 * pinned trace hash at once, surfacing only as a confusing cascade of trace-replay
 * failures with no single attributable cause. This KAT freezes the actual numeric
 * output so any drift in the PRNG itself fails loudly, HERE, at the root.
 *
 * The vectors below were generated from this exact implementation and frozen. They are
 * deterministic IEEE-754 doubles (integer ops via Math.imul, then an exact divide by
 * 2^32), reproducible bit-for-bit across every conforming JS engine — so `toBe`/`toEqual`
 * equality is correct and portable, not brittle. If a vector ever fails, the RNG stream
 * changed: either re-derive deliberately (and re-pin EVERY dependent trace hash) or
 * revert — never relax the assertion to pass. Locked by
 * traces/bugs/bug_0228_rng_known_answer_vector.yaml.
 */
describe("rng absolute known-answer vector (determinism keystone, §4.1/§8.5)", () => {
  it("mulberry32(0) emits the frozen zero-seed float stream", () => {
    const r = mulberry32(0);
    const seq = [r.next(), r.next(), r.next(), r.next(), r.next()];
    expect(seq).toEqual([
      0.26642920868471265, 0.0003297457005828619, 0.2232720274478197, 0.1462021479383111,
      0.46732782293111086,
    ]);
  });

  it("mulberry32(42) emits the frozen float stream", () => {
    const r = mulberry32(42);
    const seq = [r.next(), r.next(), r.next(), r.next(), r.next()];
    expect(seq).toEqual([
      0.6011037519201636, 0.44829055899754167, 0.8524657934904099, 0.6697340414393693,
      0.17481389874592423,
    ]);
  });

  it("int(1,6) maps the seed-7 stream to a frozen d6 sequence (the die-roll layer combat/skill-checks use)", () => {
    // Pins not just the float stream but the `lo + floor(next()*(hi-lo+1))` mapping:
    // an off-by-one in the range or a floor→round swap moves this vector.
    const r = mulberry32(7);
    const rolls = Array.from({ length: 10 }, () => r.int(1, 6));
    expect(rolls).toEqual([1, 1, 6, 5, 4, 3, 3, 2, 4, 5]);
    // First-principles bound (non-vacuity: a constant array that drifted out of [1,6]
    // would be caught here too).
    for (const n of rolls) {
      expect(n).toBeGreaterThanOrEqual(1);
      expect(n).toBeLessThanOrEqual(6);
    }
  });

  it("rngForStep(123,456) emits the frozen per-step stream (the engine's actual per-step entry point)", () => {
    // Pins the (seed,step) mix (h = seed ^ imul(step,0x9e3779b1); h = imul(h^h>>>16,0x85ebca6b)>>>0)
    // on a NON-degenerate (seed,step) — a change to either mixing constant moves this.
    const r = rngForStep(123, 456);
    const seq = [r.next(), r.next(), r.next()];
    expect(seq).toEqual([0.9709298182278872, 0.8582580885849893, 0.4226024318486452]);
  });

  it("rngForStep(7,3) emits the frozen per-step stream at the canonical benchmark seed", () => {
    const r = rngForStep(7, 3);
    const seq = [r.next(), r.next(), r.next()];
    expect(seq).toEqual([0.20060697104781866, 0.6069631821010262, 0.647779667051509]);
  });

  it("the pinned streams differ from each other (the vectors are genuinely distinct witnesses, not a copy-paste)", () => {
    // Guards against the failure mode where a careless re-pin makes every vector identical
    // (which would make the per-stream asserts vacuously co-satisfiable).
    const a = mulberry32(0).next();
    const b = mulberry32(42).next();
    const c = rngForStep(123, 456).next();
    const d = rngForStep(7, 3).next();
    expect(new Set([a, b, c, d]).size).toBe(4);
  });
});
