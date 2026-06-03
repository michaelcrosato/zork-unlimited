/**
 * The AFK loop driver's saturation-triggered ultraplan gate (docs/afk_loop.md).
 * Importing src/ai-loop.ts must NOT run a cycle — main() is entry-point guarded —
 * so we can unit-test the pure decision in isolation.
 */
import { describe, it, expect } from "vitest";
import { shouldRunUltraplan } from "../../src/ai-loop.js";

describe("shouldRunUltraplan", () => {
  it("fires only when SATURATED and the cooldown has elapsed", () => {
    expect(shouldRunUltraplan(true, 8, 8)).toBe(true); // saturated, exactly at cooldown
    expect(shouldRunUltraplan(true, 12, 8)).toBe(true); // saturated, well past cooldown
  });

  it("does NOT fire while saturated but still on cooldown", () => {
    expect(shouldRunUltraplan(true, 0, 8)).toBe(false);
    expect(shouldRunUltraplan(true, 7, 8)).toBe(false);
  });

  it("never fires when not saturated, regardless of cooldown", () => {
    expect(shouldRunUltraplan(false, 0, 8)).toBe(false);
    expect(shouldRunUltraplan(false, 9999, 8)).toBe(false);
  });

  it("a cooldown of 0 means every saturated cycle fires (no throttle)", () => {
    expect(shouldRunUltraplan(true, 0, 0)).toBe(true);
    expect(shouldRunUltraplan(false, 0, 0)).toBe(false);
  });
});
