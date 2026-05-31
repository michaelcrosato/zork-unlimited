import { describe, it, expect } from "vitest";
import { canonicalize, hashState, shortHash } from "../../src/core/hash.js";
import { mulberry32, rngForStep } from "../../src/core/rng.js";

describe("canonical hash", () => {
  it("is insensitive to object key order", () => {
    expect(canonicalize({ b: 1, a: 2 })).toBe(canonicalize({ a: 2, b: 1 }));
    expect(hashState({ b: 1, a: 2 })).toBe(hashState({ a: 2, b: 1 }));
  });

  it("is sensitive to array order (list order is meaningful)", () => {
    expect(hashState([1, 2])).not.toBe(hashState([2, 1]));
  });

  it("sorts keys recursively", () => {
    expect(canonicalize({ x: { d: 1, c: 2 } })).toBe('{"x":{"c":2,"d":1}}');
  });

  it("shortHash is the first 8 chars of the full hash", () => {
    const v = { a: 1 };
    expect(shortHash(v)).toBe(hashState(v).slice(0, 8));
  });
});

describe("seeded rng", () => {
  it("same seed ⇒ same stream", () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    const seqA = [a.next(), a.next(), a.next()];
    const seqB = [b.next(), b.next(), b.next()];
    expect(seqA).toEqual(seqB);
  });

  it("different seeds ⇒ different streams", () => {
    expect(mulberry32(1).next()).not.toBe(mulberry32(2).next());
  });

  it("rngForStep is reproducible per (seed, step)", () => {
    expect(rngForStep(7, 3).next()).toBe(rngForStep(7, 3).next());
    expect(rngForStep(7, 3).next()).not.toBe(rngForStep(7, 4).next());
  });

  it("int stays in range", () => {
    const r = mulberry32(99);
    for (let i = 0; i < 1000; i++) {
      const n = r.int(1, 6);
      expect(n).toBeGreaterThanOrEqual(1);
      expect(n).toBeLessThanOrEqual(6);
    }
  });
});
