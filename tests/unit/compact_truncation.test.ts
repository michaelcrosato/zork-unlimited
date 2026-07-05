import { describe, expect, it } from "vitest";

import {
  compactHead,
  compactRecent,
  compactText,
  compactTextWithHash,
  compactTrailingOmissionCounts,
  omittedCount,
} from "../../src/mcp/compact_truncation.js";

describe("compact truncation helpers", () => {
  it("caps head and recent slices without mutating callers", () => {
    const values = ["a", "b", "c", "d"];

    expect(compactHead(values, 2)).toEqual(["a", "b"]);
    expect(compactRecent(values, 2)).toEqual(["c", "d"]);
    expect(compactHead(values, 0)).toEqual([]);
    expect(compactRecent(values, 0)).toEqual([]);
    expect(values).toEqual(["a", "b", "c", "d"]);
  });

  it("rejects invalid list limits before they can bypass compaction", () => {
    for (const limit of [Number.NaN, Number.POSITIVE_INFINITY, -1, 1.5]) {
      expect(() => compactHead(["a"], limit)).toThrow(/non-negative finite integer/);
      expect(() => compactRecent(["a"], limit)).toThrow(/non-negative finite integer/);
    }
  });

  it("reports omitted counts only when compaction drops values", () => {
    expect(omittedCount(["a", "b", "c"], ["a", "b"])).toBe(1);
    expect(omittedCount(["a", "b"], ["a", "b"])).toBeUndefined();
  });

  it("trims trailing zero omission buckets while preserving interior positions", () => {
    expect(compactTrailingOmissionCounts([4, 0, 0])).toEqual([4]);
    expect(compactTrailingOmissionCounts([4, 4, 0])).toEqual([4, 4]);
    expect(compactTrailingOmissionCounts([0, 0, 5])).toEqual([0, 0, 5]);
    expect(compactTrailingOmissionCounts([0, 0, 0])).toBeUndefined();

    for (const count of [Number.NaN, Number.POSITIVE_INFINITY, -1, 1.5]) {
      expect(() => compactTrailingOmissionCounts([count])).toThrow(/non-negative finite integer/);
    }
  });

  it("caps long text with deterministic omission metadata", () => {
    const value = `${"a".repeat(40)}${"b".repeat(40)}`;
    const compact = compactText(value, 50);

    expect(compact).toHaveLength(50);
    expect(compact.startsWith("a".repeat(30))).toBe(true);
    expect(compact).toMatch(/\.\.\.\(\+\d+ chars\)$/);
    expect(compactText(value, value.length)).toBe(value);
    expect(compactText(value, 0)).toBe("");
  });

  it("rejects invalid text limits before truncation", () => {
    for (const limit of [Number.NaN, Number.POSITIVE_INFINITY, -1, 1.5]) {
      expect(() => compactText("abc", limit)).toThrow(/non-negative finite integer/);
    }
  });

  it("caps long text with a deterministic collision-resistant suffix", () => {
    const first = `label ${"x".repeat(300)}a`;
    const second = `label ${"x".repeat(300)}b`;
    const compact = compactTextWithHash(first, 80, 12);
    const samePrefixCompact = compactTextWithHash(second, 80, 12);

    expect(compact).toHaveLength(80);
    expect(compact).toMatch(/^label x+/);
    expect(compact).toMatch(/\.\.\.\(\+\d+ chars\)#[0-9a-f]{12}$/);
    expect(samePrefixCompact).not.toBe(compact);
    expect(compactTextWithHash("short", 80, 12)).toBe("short");

    for (const limit of [Number.NaN, Number.POSITIVE_INFINITY, -1, 1.5]) {
      expect(() => compactTextWithHash("abc", limit, 12)).toThrow(/non-negative finite integer/);
    }
    for (const hashLength of [Number.NaN, Number.POSITIVE_INFINITY, 0, -1, 1.5]) {
      expect(() => compactTextWithHash("abc", 80, hashLength)).toThrow(/positive finite integer/);
    }
  });
});
