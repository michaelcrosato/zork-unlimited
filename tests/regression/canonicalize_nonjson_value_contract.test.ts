import { describe, it, expect } from "vitest";
import { canonicalize, hashState } from "../../src/core/hash.js";

/**
 * bug_0230 — the non-JSON-safe value contract for the canonicalizer
 * (src/core/hash.ts), the determinism-keystone leg the bug_0228 RNG
 * known-answer-vector cycle named as the last open small key-free lever.
 *
 * `hashState` rests entirely on `canonicalize(value) = JSON.stringify(sortDeep(value))`.
 * The existing coverage (tests/unit/hash_rng.test.ts) pins only the JSON-SAFE happy
 * path: key-order insensitivity, array-order sensitivity, recursive sort, shortHash
 * slicing. It says NOTHING about the values JSON.stringify treats specially —
 * undefined, functions, NaN/±Infinity, BigInt — even though those are exactly the
 * values that decide whether two distinct-looking GameStates COLLIDE to one hash or
 * the canonicalizer THROWS. This is load-bearing on the untrusted-input boundary:
 * traces/bug_0190_infinity.json loads `vars.hp: 1e999` (= Infinity) straight off disk
 * into a GameState that gets hashed (the bug_0181/0190 load-integrity arc), and a
 * non-finite var silently collapses to the same hash as `null`. Pinning these is the
 * SoundnessBench absolute-witness discipline (parity with bug_0228's RNG KAT and the
 * bug_0182/0218/0227 negative corpus): the contract is FROZEN, so any future change to
 * the canonicalizer (a replacer that preserves Infinity, BigInt support, a uniform-null
 * serializer) becomes a CONSCIOUS, surfaced decision that re-pins every dependent trace
 * hash — never a silent hash-discontinuity that invalidates pinned traces with no
 * attributable cause.
 *
 * NOT a discovered defect: `canonicalize` is correct today. These are the missing
 * absolute witnesses for already-correct code. Frozen vectors verified against the
 * live module before committing.
 */

// SHA-256 of the empty string — the famous, portable known-answer vector. The
// canonicalizer maps a non-serializable TOP-LEVEL value (undefined / a function) to a
// bare `undefined`, which sha256Hex coerces to the empty string before hashing.
const SHA256_EMPTY = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

describe("canonicalize — non-JSON-safe value contract (bug_0230)", () => {
  it("a non-serializable TOP-LEVEL value yields the bare `undefined` (not a string)", () => {
    // JSON.stringify(undefined) and JSON.stringify(fn) both return the value `undefined`.
    expect(canonicalize(undefined)).toBeUndefined();
    expect(typeof canonicalize(undefined)).toBe("undefined");
    expect(canonicalize(() => {})).toBeUndefined();
  });

  it('non-finite numbers serialize to the string "null"', () => {
    expect(canonicalize(NaN)).toBe("null");
    expect(canonicalize(Infinity)).toBe("null");
    expect(canonicalize(-Infinity)).toBe("null");
  });

  it("BigInt is NOT canonicalizable — it throws (the canonicalizer is not total)", () => {
    // Pins that GameState vars must stay JSON-number-safe: a BigInt would crash the
    // hash, so supporting one is a deliberate, witnessed change, never an accident.
    expect(() => canonicalize(BigInt(10))).toThrow(TypeError);
    expect(() => canonicalize({ b: BigInt(1), a: 1 })).toThrow(TypeError);
  });

  it("OBJECT: undefined- and function-valued keys are DROPPED entirely", () => {
    expect(canonicalize({ a: undefined, b: 1 })).toBe('{"b":1}');
    expect(canonicalize({ f: () => {}, a: 1 })).toBe('{"a":1}');
  });

  it("OBJECT: non-finite values become null, and keys stay recursively sorted", () => {
    // Combines two contracts in one witness: the NaN→null coercion AND the
    // sort-keys-then-serialize order (b sorts after a even with a null value).
    expect(canonicalize({ b: NaN, a: 1 })).toBe('{"a":1,"b":null}');
  });

  it("ARRAY: non-serializable elements become positional null (length preserved)", () => {
    // Arrays are positional, so order is meaningful — holes become null, not dropped.
    expect(canonicalize([undefined, 1])).toBe("[null,1]");
    expect(canonicalize([NaN, Infinity])).toBe("[null,null]");
  });

  it("the OBJECT-drop vs ARRAY-null collapse modes are genuinely distinct", () => {
    // Non-vacuity guard: an undefined element collapses two different ways depending on
    // container. A future uniform-null serializer would erase this asymmetry and fail here.
    expect(canonicalize({ a: undefined })).toBe("{}");
    expect(canonicalize([undefined])).toBe("[null]");
    expect(canonicalize({ a: undefined })).not.toBe(canonicalize([undefined]));
  });
});

describe("hashState — the untrusted-Infinity load-integrity witness (bug_0230)", () => {
  it("a non-finite numeric var collapses to the SAME hash as null (the bug_0190 hp:1e999 case)", () => {
    // traces/bug_0190_infinity.json loads vars.hp = 1e999 (Infinity) off disk. Hashing
    // it canonicalizes Infinity -> null, so it is hash-indistinguishable from hp:null.
    // The numeric-range VALIDATORS (the .int() gate, save-integrity) are what reject such
    // states; the hash deliberately does not, and this pins that boundary contract.
    const hNull = hashState({ vars: { hp: null } });
    expect(hashState({ vars: { hp: Infinity } })).toBe(hNull);
    expect(hashState({ vars: { hp: -Infinity } })).toBe(hNull);
    expect(hashState({ vars: { hp: NaN } })).toBe(hNull);
  });

  it("but that collapse does NOT swallow finite values (non-vacuity)", () => {
    // Proves the equality above is the Infinity→null contract, not "everything hashes
    // the same": a real finite value hashes differently from the null/Infinity class.
    const hNull = hashState({ vars: { hp: null } });
    expect(hashState({ vars: { hp: 0 } })).not.toBe(hNull);
    expect(hashState({ vars: { hp: 1 } })).not.toBe(hNull);
  });

  it("a non-serializable top-level value hashes the empty string's SHA-256 (portable KAT)", () => {
    // canonicalize(undefined) === undefined -> sha256Hex coerces to "" -> the empty-string
    // digest. A fixed, machine-independent known-answer vector.
    expect(hashState(undefined)).toBe(SHA256_EMPTY);
    expect(hashState(() => {})).toBe(SHA256_EMPTY);
  });
});
