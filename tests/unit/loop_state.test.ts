import { describe, it, expect } from "vitest";
import { completedCycleCount } from "../../src/afk/loop_state.js";

describe("completedCycleCount", () => {
  it("returns 0 for empty string", () => {
    expect(completedCycleCount("")).toBe(0);
  });

  it("returns the count of cycle entries when no historical count is present", () => {
    const text = `
# AI Loop State

### Cycle result
First cycle

### Cycle result
Second cycle
    `;
    expect(completedCycleCount(text)).toBe(2);
  });

  it("returns the historical count when no cycle entries are present", () => {
    const text = `
# AI Loop State

<!-- historical_cycle_count: 42 -->
    `;
    expect(completedCycleCount(text)).toBe(42);
  });

  it("returns the sum of historical count and cycle entries", () => {
    const text = `
# AI Loop State

<!-- historical_cycle_count: 10 -->

### Cycle result
Cycle 11

### Cycle result
Cycle 12

### Cycle result
Cycle 13
    `;
    expect(completedCycleCount(text)).toBe(13);
  });

  it("returns 0 when there are invalid matches", () => {
    const text = `
# AI Loop State

<!-- historical_cycle_count: invalid -->
### Not a Cycle result
    `;
    expect(completedCycleCount(text)).toBe(0);
  });
});
