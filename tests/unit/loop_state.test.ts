import { describe, it, expect } from "vitest";
import { countCycleEntries } from "../../src/afk/loop_state.js";

describe("countCycleEntries", () => {
  it("returns 0 for an empty string", () => {
    expect(countCycleEntries("")).toBe(0);
  });

  it("returns 0 for text without cycle entries", () => {
    expect(countCycleEntries("Some random text\nNo cycles here.")).toBe(0);
  });

  it("counts a single cycle entry at the start", () => {
    expect(countCycleEntries("### Cycle result\nSome details")).toBe(1);
  });

  it("counts multiple cycle entries", () => {
    const text = `
### Cycle result
Details 1

### Cycle result
Details 2

### Cycle result - extended
Details 3
`;
    expect(countCycleEntries(text)).toBe(3);
  });

  it("does not count cycle entries that do not start at the beginning of a line", () => {
    const text = `
  ### Cycle result
This one above was indented.
Here is one inline: ### Cycle result
`;
    expect(countCycleEntries(text)).toBe(0);
  });

  it("counts mixed valid and invalid cycle entries", () => {
    const text = `
### Cycle result
Valid

 ### Cycle result
Invalid (indented)

### Cycle result
Valid
`;
    expect(countCycleEntries(text)).toBe(2);
  });
});
