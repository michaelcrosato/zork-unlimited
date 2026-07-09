import { describe, it, expect } from "vitest";
import {
  isGeneratedRpgSeed,
  generatedRpgSeedValidationMessage,
  assertGeneratedRpgSeed,
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
      expect(isGeneratedRpgSeed(Math.PI)).toBe(false);
    });

    it("returns false for unsafe integers", () => {
      expect(isGeneratedRpgSeed(Number.MAX_SAFE_INTEGER + 1)).toBe(false);
      expect(isGeneratedRpgSeed(Number.MIN_SAFE_INTEGER - 1)).toBe(false);
    });

    it("returns false for non-number types", () => {
      expect(isGeneratedRpgSeed("1")).toBe(false);
      expect(isGeneratedRpgSeed(true)).toBe(false);
      expect(isGeneratedRpgSeed(null)).toBe(false);
      expect(isGeneratedRpgSeed(undefined)).toBe(false);
      expect(isGeneratedRpgSeed({})).toBe(false);
      expect(isGeneratedRpgSeed([])).toBe(false);
    });

    it("returns false for NaN and Infinity", () => {
      expect(isGeneratedRpgSeed(NaN)).toBe(false);
      expect(isGeneratedRpgSeed(Infinity)).toBe(false);
      expect(isGeneratedRpgSeed(-Infinity)).toBe(false);
    });
  });

  describe("generatedRpgSeedValidationMessage", () => {
    it("returns a formatted validation message", () => {
      expect(generatedRpgSeedValidationMessage("Seed", "bad")).toBe(
        `Seed must be an integer within JavaScript's safe range, got "bad".`,
      );
      expect(generatedRpgSeedValidationMessage("RandomSeed", 1.5)).toBe(
        `RandomSeed must be an integer within JavaScript's safe range, got 1.5.`,
      );
    });
  });

  describe("assertGeneratedRpgSeed", () => {
    it("does not throw for valid seeds", () => {
      expect(() => assertGeneratedRpgSeed(123, "Seed")).not.toThrow();
      expect(() => assertGeneratedRpgSeed(0, "Seed")).not.toThrow();
    });

    it("throws an error for invalid seeds", () => {
      expect(() => assertGeneratedRpgSeed("123", "Seed")).toThrow(
        `Seed must be an integer within JavaScript's safe range, got "123".`,
      );
      expect(() => assertGeneratedRpgSeed(1.5, "MySeed")).toThrow(
        `MySeed must be an integer within JavaScript's safe range, got 1.5.`,
      );
    });
  });
});
