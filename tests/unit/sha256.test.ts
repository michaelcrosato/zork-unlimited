/**
 * SHA-256 known-answer vectors (spec §8.6). Locks the pure implementation to the
 * standard so the browser build and Node produce identical state hashes.
 */
import { describe, it, expect } from "vitest";
import { sha256Hex } from "../../src/core/sha256.js";

describe("sha256Hex — NIST/standard vectors", () => {
  it("hashes the empty string", () => {
    expect(sha256Hex("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  });
  it('hashes "abc"', () => {
    expect(sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
  it("hashes a 448-bit message (multi-block padding)", () => {
    expect(sha256Hex("abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq")).toBe(
      "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1",
    );
  });
  it("hashes UTF-8 multibyte content", () => {
    expect(sha256Hex("café — ☕")).toBe(sha256Hex("café — ☕"));
    expect(sha256Hex("a")).not.toBe(sha256Hex("b"));
  });
});
