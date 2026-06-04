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

describe("canonicalize — the ±0 sign-of-zero collapse (bug_0240)", () => {
  // The bug_0230 family froze the non-finite numeric collapse (NaN/±Infinity → the
  // string "null"). It left ONE member of the same numeric-collapse family unpinned:
  // the sign of zero. `JSON.stringify(-0) === "0"`, so negative zero serializes
  // IDENTICALLY to positive zero and is hash-indistinguishable from it — but, unlike
  // the non-finite class, it collapses to "0", NOT to "null". A future canonicalizer
  // that preserved -0 (e.g. a replacer emitting "-0") would silently shift the digest
  // of any state holding a negative zero while every bug_0230 test stayed GREEN. This
  // pins that last numeric-collapse member, same SoundnessBench absolute-witness
  // discipline (parity with bug_0228/0230).
  it('-0 serializes to "0" — identical to +0, at every nesting depth', () => {
    expect(canonicalize(-0)).toBe("0");
    expect(canonicalize(-0)).toBe(canonicalize(0));
    expect(canonicalize({ a: -0, b: 0 })).toBe('{"a":0,"b":0}');
    expect(canonicalize([-0, 0])).toBe("[0,0]");
  });

  it('the ±0 collapse is the "0" class, NOT the non-finite "null" class (non-vacuity)', () => {
    // Separates the sign-of-zero collapse from the NaN/±Infinity → null collapse: a
    // future uniform-null serializer would fail HERE by turning -0 into "null".
    expect(canonicalize(-0)).not.toBe("null");
    expect(canonicalize(-0)).not.toBe(canonicalize(NaN));
  });
});

describe("hashState — the ±0 sign-of-zero collapse witness (bug_0240)", () => {
  it("a -0 var collapses to the SAME hash as +0", () => {
    expect(hashState({ vars: { score: -0 } })).toBe(hashState({ vars: { score: 0 } }));
  });

  it("but that collapse does NOT swallow distinct finite values (non-vacuity)", () => {
    // Proves the equality above is the sign-of-zero contract, not "all numbers hash
    // the same": a real negative value hashes differently from the ±0 class.
    const hZero = hashState({ vars: { score: 0 } });
    expect(hashState({ vars: { score: -1 } })).not.toBe(hZero);
    expect(hashState({ vars: { score: 1 } })).not.toBe(hZero);
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

describe('canonicalize — the "__proto__" state-key collision contract (bug_0247)', () => {
  // A DISCOVERED defect (unlike the bug_0230/0240 absolute witnesses above): the
  // sortDeep accumulator used a normal `{}`, so `out["__proto__"] = v` hit Object's
  // __proto__ SETTER instead of creating a key — a primitive v was silently dropped,
  // an object v re-pointed the accumulator's prototype — and JSON.stringify then
  // omitted it either way. Two DISTINCT states then canonicalized to the SAME string,
  // colliding their hashes and breaking the §8.6 "equal hash ⇒ equal state" invariant
  // the save-integrity check rests on. A "__proto__" key is reachable off the
  // untrusted-save boundary: JSON.parse('{"__proto__":...}') makes it an OWN enumerable
  // property (the bug_0190 load-integrity threat model). Fixed with a null-prototype
  // accumulator. These witnesses fail RED against the pre-fix `{}` accumulator.

  // JSON.parse, not an object literal: a literal `{ __proto__: 5 }` sets the prototype
  // rather than a key, so we must build the inputs exactly as the untrusted boundary does.
  const withProto = JSON.parse('{"score":10,"__proto__":5}');
  const withoutProto = JSON.parse('{"score":10}');

  it('a primitive "__proto__"-valued key is PRESERVED, not dropped', () => {
    // The pre-fix code returned '{"score":10}' here (the key silently swallowed by the
    // __proto__ setter), colliding with the key-less state below.
    expect(canonicalize(withProto)).toBe('{"__proto__":5,"score":10}');
  });

  it('a state with a "__proto__" key does NOT collide with the same state lacking it', () => {
    expect(canonicalize(withProto)).not.toBe(canonicalize(withoutProto));
    expect(hashState(withProto)).not.toBe(hashState(withoutProto));
  });

  it('an OBJECT-valued "__proto__" key is preserved (no prototype pollution / drop)', () => {
    const nested = JSON.parse('{"score":1,"__proto__":{"polluted":true}}');
    // Pre-fix: '{"score":1}' — the object value re-pointed the accumulator's prototype.
    expect(canonicalize(nested)).toBe('{"__proto__":{"polluted":true},"score":1}');
    // And the live runtime prototype is never touched (the canonicalizer pollutes nothing).
    expect(Object.prototype.hasOwnProperty.call({}, "polluted")).toBe(false);
  });

  it('a NESTED "__proto__" key (the GameState vars/flags shape) is preserved too', () => {
    const a = JSON.parse('{"vars":{"score":10}}');
    const b = JSON.parse('{"vars":{"score":10,"__proto__":5}}');
    expect(canonicalize(b)).toBe('{"vars":{"__proto__":5,"score":10}}');
    expect(hashState(a)).not.toBe(hashState(b));
  });

  it("normal states without a __proto__ key hash byte-identically (no churn)", () => {
    // The null-prototype accumulator changes NOTHING for ordinary states: key-sort,
    // recursive sort and array-order are unaffected. Frozen so the fix carries no
    // collateral hash discontinuity for any real pack/save/trace.
    expect(canonicalize({ b: 2, a: 1, c: { z: 1, a: 2 } })).toBe('{"a":1,"b":2,"c":{"a":2,"z":1}}');
    expect(canonicalize({ constructor: 9, score: 1 })).toBe('{"constructor":9,"score":1}');
  });
});
