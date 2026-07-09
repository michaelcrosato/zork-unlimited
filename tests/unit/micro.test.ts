import { describe, expect, it } from "vitest";
import { microInitState, MICRO_SEED, MICRO_START } from "../../src/demo/micro.js";

describe("microInitState", () => {
  it("initializes state with default MICRO_SEED and MICRO_START", () => {
    const state = microInitState();
    expect(state.seed).toBe(MICRO_SEED);
    expect(state.current).toBe(MICRO_START);
  });

  it("initializes state with a provided seed", () => {
    const customSeed = 9999;
    const state = microInitState(customSeed);
    expect(state.seed).toBe(customSeed);
    expect(state.current).toBe(MICRO_START);
  });
});
