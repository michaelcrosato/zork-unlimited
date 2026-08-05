/**
 * Seeded PRNG (spec §4.1, §8.5).
 *
 * The engine's ONLY source of randomness. `Math.random`, clocks, and any global
 * RNG are forbidden in engine code. All randomness derives from the seed carried
 * in GameState plus the step counter, so a (seed, step) pair always yields the
 * same stream — which is what makes combat/skill-checks (Stage 4) replayable.
 */

export type Rng = {
  /** Next float in [0, 1). */
  next(): number;
  /** Integer in [min, max] inclusive. */
  int(min: number, max: number): number;
};

/** mulberry32 — tiny, fast, fully deterministic 32-bit PRNG. */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  const next = (): number => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int(min: number, max: number): number {
      const lo = Math.ceil(min);
      const hi = Math.floor(max);
      return lo + Math.floor(next() * (hi - lo + 1));
    },
  };
}

/**
 * Derive a PRNG for a specific step from the game seed. Mixing in `step` means
 * each step gets an independent, reproducible stream regardless of replay entry
 * point. Uses a simple integer hash (no randomness, no clock).
 */
export function rngForStep(seed: number, step: number): Rng {
  // 32-bit mix of (seed, step) so adjacent steps don't share a stream.
  //
  // `seed >>> 0` alone DISCARDED the seed's high bits. `isRuntimeSeed` accepts any
  // safe integer, so seeds 1 and 4294967297 — and -1 and 4294967295 — produced
  // byte-identical play while hashing differently: two runs behaviourally the same
  // while claiming distinct identities. Fold the high word in as well.
  //
  // Math.floor, not Math.trunc: `-1 >>> 0` is 4294967295, so trunc — which gives -0 for
  // both — would leave every negative seed aliased to its unsigned twin. floor gives -1
  // there and 0 for every seed in [0, 2**32), which is the whole range any shipped
  // artifact uses: no negative seed and no seed at or above 2**32 appears in content,
  // corpus, traces, saves, or fixtures, so every pinned trace hash and every RNG
  // known-answer vector stays byte-identical.
  //
  // Widening is the right direction rather than narrowing the accepted domain: the
  // seed gate's signed, above-32-bit range is a recorded decision (bug_0208) with its
  // own over-restriction guards, and those guards pin acceptance and the STATE hash,
  // which is independent of this stream.
  const high = Math.floor(seed / 0x100000000);
  let h = (seed >>> 0) ^ Math.imul(step >>> 0, 0x9e3779b1) ^ Math.imul(high, 0x27d4eb2f);
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0;
  return mulberry32(h);
}
