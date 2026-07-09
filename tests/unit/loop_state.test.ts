import { describe, it, expect } from "vitest";
import { completedCycleCount } from "../../src/afk/loop_state.js";

describe("completedCycleCount", () => {
  it("returns 0 for empty text", () => {
    expect(completedCycleCount("")).toBe(0);
  });

  it("returns historical cycle count when there are no rich entries", () => {
    expect(completedCycleCount("<!-- historical_cycle_count: 5 -->")).toBe(5);
  });

  it("returns rich entry count when there is no historical count", () => {
    const text = `
### Cycle result
detail 1

### Cycle result
detail 2
    `;
    expect(completedCycleCount(text)).toBe(2);
  });

  it("returns the sum of historical and rich entries", () => {
    const text = `
<!-- historical_cycle_count: 10 -->

### Cycle result
detail 1

### Cycle result
detail 2
    `;
    expect(completedCycleCount(text)).toBe(12);
  });

  it("handles negative historical cycle counts as 0", () => {
    expect(completedCycleCount("<!-- historical_cycle_count: -5 -->")).toBe(0);
  });

  it("handles non-integer historical cycle counts as 0", () => {
    expect(completedCycleCount("<!-- historical_cycle_count: 5.5 -->")).toBe(0);
  });
});
