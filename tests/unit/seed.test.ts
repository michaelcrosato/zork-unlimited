import { describe, it, expect } from "vitest";
import {
  assertGeneratedRpgSeed,
  isGeneratedRpgSeed,
  generatedRpgSeedValidationMessage,
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

    it("returns false for non-integers", () => {
      expect(isGeneratedRpgSeed(1.5)).toBe(false);
      expect(isGeneratedRpgSeed(NaN)).toBe(false);
      expect(isGeneratedRpgSeed(Infinity)).toBe(false);
      expect(isGeneratedRpgSeed(-Infinity)).toBe(false);
    });

    it("returns false for unsafe integers", () => {
      expect(isGeneratedRpgSeed(Number.MAX_SAFE_INTEGER + 1)).toBe(false);
      expect(isGeneratedRpgSeed(Number.MIN_SAFE_INTEGER - 1)).toBe(false);
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

  describe("assertGeneratedRpgSeed", () => {
    it("does not throw for valid seeds", () => {
      expect(() => assertGeneratedRpgSeed(42, "test")).not.toThrow();
      expect(() => assertGeneratedRpgSeed(0, "test")).not.toThrow();
    });

    it("throws for invalid seeds", () => {
      expect(() => assertGeneratedRpgSeed(1.5, "testLabel")).toThrowError(
        generatedRpgSeedValidationMessage("testLabel", 1.5),
      );
      expect(() => assertGeneratedRpgSeed("42", "testLabel")).toThrowError(
        generatedRpgSeedValidationMessage("testLabel", "42"),
      );
      expect(() => assertGeneratedRpgSeed(null, "testLabel")).toThrowError(
        generatedRpgSeedValidationMessage("testLabel", null),
      );
    });
  });
});
