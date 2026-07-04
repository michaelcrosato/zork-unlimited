import { describe, expect, it } from "vitest";

import {
  compactHead,
  compactRecent,
  compactTrailingOmissionCounts,
  omittedCount,
} from "../../src/mcp/compact_truncation.js";

describe("compact truncation helpers", () => {
  it("caps head and recent slices without mutating callers", () => {
    const values = ["a", "b", "c", "d"];

    expect(compactHead(values, 2)).toEqual(["a", "b"]);
    expect(compactRecent(values, 2)).toEqual(["c", "d"]);
    expect(values).toEqual(["a", "b", "c", "d"]);
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
  });
});
