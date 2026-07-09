import { describe, it, expect } from "vitest";
import { historicalCycleCount } from "../../src/afk/loop_state.js";

describe("historicalCycleCount", () => {
  it("returns 0 when no marker is present", () => {
    expect(historicalCycleCount("just some text\nno marker here")).toBe(0);
    expect(historicalCycleCount("")).toBe(0);
  });

  it("extracts the count from a valid marker", () => {
    expect(historicalCycleCount("<!-- historical_cycle_count: 42 -->")).toBe(42);
    expect(historicalCycleCount("<!--historical_cycle_count:100-->")).toBe(100);
    expect(historicalCycleCount("<!--   historical_cycle_count:   7   -->")).toBe(7);
  });

  it("extracts the count when marker is within multiline text", () => {
    const text = `
# AI Loop State

<!-- historical_cycle_count: 15 -->

### Cycle result
    `;
    expect(historicalCycleCount(text)).toBe(15);
  });

  it("returns 0 for negative counts", () => {
    expect(historicalCycleCount("<!-- historical_cycle_count: -5 -->")).toBe(0);
  });

  it("returns 0 for non-integer counts", () => {
    // Though regex \d+ doesn't match floats, just in case
    expect(historicalCycleCount("<!-- historical_cycle_count: 3.14 -->")).toBe(0);
  });

  it("returns 0 for invalid markers", () => {
    expect(historicalCycleCount("<!-- historical_cycle_count: NaN -->")).toBe(0);
    expect(historicalCycleCount("<!-- historical_cycle_count: abc -->")).toBe(0);
  });
});
