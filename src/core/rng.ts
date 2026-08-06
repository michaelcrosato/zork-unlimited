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

const UINT32_RANGE = 0x100000000;
const UINT64_MASK = 0xffffffffffffffffn;
const UINT53_RANGE = 9007199254740992;
const SPLITMIX64_GAMMA = 0x9e3779b97f4a7c15n;
const WIDE_STEP_MIX = 0xd1b54a32d192ed03n;

/**
 * SplitMix64 for runtime seeds that cannot be represented injectively by one
 * unsigned 32-bit word. BigInt makes every operation an explicit modulo-2^64
 * integer operation in Node and modern browsers; converting the upper 53 bits
 * produces an exactly representable float in [0, 1).
 */
function splitmix64(initialState: bigint): Rng {
  let state = initialState & UINT64_MASK;
  const next = (): number => {
    state = (state + SPLITMIX64_GAMMA) & UINT64_MASK;
    let word = state;
    word = ((word ^ (word >> 30n)) * 0xbf58476d1ce4e5b9n) & UINT64_MASK;
    word = ((word ^ (word >> 27n)) * 0x94d049bb133111ebn) & UINT64_MASK;
    word ^= word >> 31n;
    return Number(word >> 11n) / UINT53_RANGE;
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
 * point. Uses deterministic integer operations only (no ambient randomness or clock).
 */
export function rngForStep(seed: number, step: number): Rng {
  // Preserve the original 32-bit derivation for every nonnegative seed below
  // 2**32. All shipped traces and known-answer vectors use this domain, so their
  // streams remain byte-identical.
  if (seed >= 0 && seed < UINT32_RANGE) {
    let h = (seed >>> 0) ^ Math.imul(step >>> 0, 0x9e3779b1);
    h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0;
    return mulberry32(h);
  }

  // A high-word XOR fold is not injective: for example, 0 and
  // 2**32 + 0x27d4eb2f collapsed to the same 32-bit state at every step. Runtime
  // seeds span 54 signed bits, so signed and >=2**32 seeds use a real 64-bit state.
  // For any fixed step, modular addition by the step term is a bijection; two
  // accepted seeds cannot collide because their difference is strictly below 2**64.
  const initialState = (BigInt(seed) + BigInt(step) * WIDE_STEP_MIX) & UINT64_MASK;
  return splitmix64(initialState);
}
