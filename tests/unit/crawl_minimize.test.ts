import { describe, expect, it } from "vitest";
import { minimizeActions } from "../../src/crawl/minimize.js";

describe("ddmin", () => {
  it("shrinks to the single culprit", () => {
    const actions = Array.from({ length: 60 }, (_, i) => i);
    const reproduces = (c: readonly number[]) => c.includes(41);
    const min = minimizeActions(actions, reproduces);
    expect(min).toEqual([41]);
  });
  it("keeps an order-dependent pair", () => {
    const actions = Array.from({ length: 40 }, (_, i) => i);
    const reproduces = (c: readonly number[]) =>
      c.includes(7) && c.includes(31) && c.indexOf(7) < c.indexOf(31);
    const min = minimizeActions(actions, reproduces);
    expect(min).toEqual([7, 31]);
  });
  it("returns input when nothing smaller reproduces", () => {
    const reproduces = (c: readonly number[]) => c.length === 3;
    expect(minimizeActions([1, 2, 3], reproduces)).toEqual([1, 2, 3]);
  });
});
