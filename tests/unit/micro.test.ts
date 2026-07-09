import { describe, expect, it } from "vitest";
import { microInitState, MICRO_SEED, MICRO_START } from "../../src/demo/micro.js";

describe("microInitState", () => {
  it("initializes state with default seed", () => {
    const state = microInitState();
    expect(state.seed).toBe(MICRO_SEED);
    expect(state.current).toBe(MICRO_START);
    expect(state.step).toBe(0);
    expect(state.visited).toEqual({ [MICRO_START]: true });
    expect(state.inventory).toEqual([]);
    expect(state.journal).toEqual([]);
  });

  it("initializes state with provided custom seed", () => {
    const customSeed = 9999;
    const state = microInitState(customSeed);
    expect(state.seed).toBe(customSeed);
    expect(state.current).toBe(MICRO_START);
    expect(state.step).toBe(0);
    expect(state.visited).toEqual({ [MICRO_START]: true });
  });
});
