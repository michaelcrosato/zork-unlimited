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

  it('hashes standard "The quick brown fox..." vectors', () => {
    expect(sha256Hex("The quick brown fox jumps over the lazy dog")).toBe(
      "d7a8fbb307d7809469ca9abcb0082e4f8d5651e46d3cdb762d02d0bf37c9e592",
    );
    expect(sha256Hex("The quick brown fox jumps over the lazy dog.")).toBe(
      "ef537f25c895bfa782526529a9b63d97aa631564d5d789c2b765448c8635fb6c",
    );
  });

  it("hashes a 448-bit message (multi-block padding)", () => {
    expect(sha256Hex("abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq")).toBe(
      "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1",
    );
  });

  it("hashes UTF-8 multibyte content to exact known digests", () => {
    expect(sha256Hex("café — ☕")).toBe(
      "a1055edc70a681bb5a44e6b6e6120db7f8424919a2eccb002a1427ffbdf53a8a",
    );
    expect(sha256Hex("日本語のテキスト")).toBe(
      "d4192d3b01dfa9f5b08388f13e5c7492e3cfdc5611bf8c77784dc97523f03efb",
    );
    expect(sha256Hex("😀😀😀 emoji and combining é")).toBe(
      "2aa557810a76549cd2d36e5eae92be5cb69e2a0d37b5eb8362f38b9d9a8055c8",
    );
  });

  it("handles block boundary padding lengths", () => {
    // 55 bytes fits in one 64-byte block with 1-byte delimiter + 8-byte length.
    expect(sha256Hex("x".repeat(55))).toBe(
      "d5e285683cd4efc02d021a5c62014694958901005d6f71e89e0989fac77e4072",
    );
    // 56 bytes pushes padding to a second block.
    expect(sha256Hex("x".repeat(56))).toBe(
      "04c26261370ee7541549d16dee320c723e3fd14671e66a099afe0a377c16888e",
    );
    // Exact block boundary.
    expect(sha256Hex("x".repeat(64))).toBe(
      "7ce100971f64e7001e8fe5a51973ecdfe1ced42befe7ee8d5fd6219506b5393c",
    );
    // 119 and 120 bytes boundary.
    expect(sha256Hex("x".repeat(119))).toBe(
      "000b48d4edf0fa7bee3c6236ecd2785baa5db4eeb8bb54341b029e0d9fa5fb0c",
    );
    expect(sha256Hex("x".repeat(120))).toBe(
      "13f05a0b594787f5ecd315edc96141bd3243203d1b7d4f0836f37308b276ba98",
    );
  });

  it("hashes long messages across many blocks", () => {
    expect(sha256Hex("a".repeat(1000))).toBe(
      "41edece42d63e8d9bf515a9ba6932e1c20cbc9f5a5d134645adb5db1b9737ea3",
    );
  });
});
