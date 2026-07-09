import { describe, it, expect } from "vitest";
import {
  isGeneratedRpgSeed,
  generatedRpgSeedValidationMessage,
  assertGeneratedRpgSeed
} from "../../src/gen/seed.js";

describe("seed", () => {
  describe("isGeneratedRpgSeed", () => {
    it("returns true for safe integers", () => {
      expect(isGeneratedRpgSeed(0)).toBe(true);
      expect(isGeneratedRpgSeed(1)).toBe(true);
      expect(isGeneratedRpgSeed(-1)).toBe(true);
      expect(isGeneratedRpgSeed(Number.MAX_SAFE_INTEGER)).toBe(true);
      expect(isGeneratedRpgSeed(Number.MIN_SAFE_INTEGER)).toBe(true);
    });

    it("returns false for non-safe integers", () => {
      expect(isGeneratedRpgSeed(1.5)).toBe(false);
      expect(isGeneratedRpgSeed(Number.MAX_SAFE_INTEGER + 1)).toBe(false);
      expect(isGeneratedRpgSeed(Number.MIN_SAFE_INTEGER - 1)).toBe(false);
      expect(isGeneratedRpgSeed(Infinity)).toBe(false);
      expect(isGeneratedRpgSeed(-Infinity)).toBe(false);
      expect(isGeneratedRpgSeed(NaN)).toBe(false);
    });

    it("returns false for non-numbers", () => {
      expect(isGeneratedRpgSeed("1")).toBe(false);
      expect(isGeneratedRpgSeed(true)).toBe(false);
      expect(isGeneratedRpgSeed(null)).toBe(false);
      expect(isGeneratedRpgSeed(undefined)).toBe(false);
      expect(isGeneratedRpgSeed({})).toBe(false);
      expect(isGeneratedRpgSeed([])).toBe(false);
    });
  });

  describe("generatedRpgSeedValidationMessage", () => {
    it("formats the message correctly", () => {
      expect(generatedRpgSeedValidationMessage("testLabel", "testSeed")).toBe(
        `testLabel must be an integer within JavaScript's safe range, got "testSeed".`
      );
    });

    it("handles undefined gracefully", () => {
      expect(generatedRpgSeedValidationMessage("testLabel", undefined)).toBe(
        `testLabel must be an integer within JavaScript's safe range, got undefined.`
      );
    });

    it("handles objects gracefully", () => {
      expect(generatedRpgSeedValidationMessage("MyField", { a: 1 })).toBe(
        `MyField must be an integer within JavaScript's safe range, got {"a":1}.`
      );
    });
  });

  describe("assertGeneratedRpgSeed", () => {
    it("does not throw for valid seeds", () => {
      expect(() => assertGeneratedRpgSeed(123, "test")).not.toThrow();
    });

    it("throws for invalid seeds with the correct message", () => {
      expect(() => assertGeneratedRpgSeed(1.5, "testLabel")).toThrow(
        "testLabel must be an integer within JavaScript's safe range, got 1.5."
      );
    });
  });
});
