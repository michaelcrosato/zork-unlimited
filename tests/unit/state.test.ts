import { describe, expect, it } from "vitest";
import { initState } from "../../src/core/state.js";

describe("GameState seed domain", () => {
  it("rejects unsafe integer runtime seeds before state creation", () => {
    expect(() => initState({ seed: Number.MAX_SAFE_INTEGER + 1, start: "room" })).toThrow(
      /safe range/,
    );
  });

  it("keeps signed safe runtime seeds valid", () => {
    expect(initState({ seed: -3, start: "room" }).seed).toBe(-3);
    expect(initState({ seed: Number.MAX_SAFE_INTEGER, start: "room" }).seed).toBe(
      Number.MAX_SAFE_INTEGER,
    );
  });
});
