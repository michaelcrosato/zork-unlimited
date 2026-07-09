import { describe, it, expect } from "vitest";
import { generatedEvalSeedBase } from "../../src/afk/generated_eval.js";

describe("generatedEvalSeedBase", () => {
  it("returns 0 for an empty string", () => {
    expect(generatedEvalSeedBase("")).toBe(0);
  });

  it("returns the number of '### Cycle result' entries when no historical count is present", () => {
    const text = `
# AI Loop State

### Cycle result
foo

### Cycle result
bar
`;
    expect(generatedEvalSeedBase(text)).toBe(2);
  });

  it("adds the historical count to the number of '### Cycle result' entries", () => {
    const text = `
# AI Loop State

<!-- historical_cycle_count: 10 -->

### Cycle result
foo

### Cycle result
bar
`;
    expect(generatedEvalSeedBase(text)).toBe(12);
  });

  it("ignores malformed historical counts and only counts cycle results", () => {
    const text = `
# AI Loop State

<!-- historical_cycle_count: abc -->

### Cycle result
foo
`;
    expect(generatedEvalSeedBase(text)).toBe(1);
  });
});
