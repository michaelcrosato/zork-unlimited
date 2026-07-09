import { describe, it, expect } from "vitest";
import { historicalCycleCount } from "../../src/afk/loop_state.js";

describe("historicalCycleCount", () => {
  it("returns 0 when no marker is present", () => {
    expect(historicalCycleCount("")).toBe(0);
    expect(historicalCycleCount("# AI Loop State\n\nSome other content.")).toBe(0);
  });

  it("parses valid markers", () => {
    expect(historicalCycleCount("<!-- historical_cycle_count: 42 -->")).toBe(42);
    expect(
      historicalCycleCount(
        "# AI Loop State\n\n<!-- historical_cycle_count: 100 -->\n\nMore content",
      ),
    ).toBe(100);
  });

  it("handles varying amounts of whitespace within the marker", () => {
    expect(historicalCycleCount("<!--historical_cycle_count:7-->")).toBe(7);
    expect(historicalCycleCount("<!--   historical_cycle_count:   15   -->")).toBe(15);
  });

  it("only matches at the start of a line", () => {
    // Should match if it's at the start of the string
    expect(historicalCycleCount("<!-- historical_cycle_count: 50 -->")).toBe(50);
    // Should match if it's after a newline
    expect(historicalCycleCount("Prefix\n<!-- historical_cycle_count: 50 -->")).toBe(50);
    // Should NOT match if it's not at the start of a line
    expect(historicalCycleCount("Not at start <!-- historical_cycle_count: 50 -->")).toBe(0);
  });
});
