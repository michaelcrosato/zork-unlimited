import { describe, expect, it } from "vitest";
import {
  isGeneratedRpgSeed,
  generatedRpgSeedValidationMessage,
  assertGeneratedRpgSeed,
} from "../../src/gen/seed.js";

describe("seed utilities", () => {
  describe("isGeneratedRpgSeed", () => {
    it("returns true for safe integers", () => {
      expect(isGeneratedRpgSeed(0)).toBe(true);
      expect(isGeneratedRpgSeed(1)).toBe(true);
      expect(isGeneratedRpgSeed(-1)).toBe(true);
      expect(isGeneratedRpgSeed(Number.MAX_SAFE_INTEGER)).toBe(true);
      expect(isGeneratedRpgSeed(Number.MIN_SAFE_INTEGER)).toBe(true);
    });

    it("returns false for non-integers, unsafe integers, and non-numbers", () => {
      expect(isGeneratedRpgSeed(0.5)).toBe(false);
      expect(isGeneratedRpgSeed(Number.MAX_SAFE_INTEGER + 1)).toBe(false);
      expect(isGeneratedRpgSeed(Number.MIN_SAFE_INTEGER - 1)).toBe(false);
      expect(isGeneratedRpgSeed(NaN)).toBe(false);
      expect(isGeneratedRpgSeed(Infinity)).toBe(false);
      expect(isGeneratedRpgSeed(-Infinity)).toBe(false);
      expect(isGeneratedRpgSeed("1")).toBe(false);
      expect(isGeneratedRpgSeed(null)).toBe(false);
      expect(isGeneratedRpgSeed(undefined)).toBe(false);
      expect(isGeneratedRpgSeed({})).toBe(false);
    });
  });

  describe("generatedRpgSeedValidationMessage", () => {
    it("formats the message correctly with different labels and values", () => {
      expect(generatedRpgSeedValidationMessage("World Seed", 0.5)).toBe(
        `World Seed must be an integer within JavaScript's safe range, got 0.5.`,
      );
      expect(generatedRpgSeedValidationMessage("test_seed", "foo")).toBe(
        `test_seed must be an integer within JavaScript's safe range, got "foo".`,
      );
      expect(generatedRpgSeedValidationMessage("seed", undefined)).toBe(
        `seed must be an integer within JavaScript's safe range, got undefined.`,
      );
    });
  });

  describe("assertGeneratedRpgSeed", () => {
    it("does not throw for valid seeds", () => {
      expect(() => assertGeneratedRpgSeed(42, "Seed")).not.toThrow();
      expect(() => assertGeneratedRpgSeed(0, "Seed")).not.toThrow();
      expect(() => assertGeneratedRpgSeed(-100, "Seed")).not.toThrow();
    });

    it("throws correctly formatted error for invalid seeds", () => {
      expect(() => assertGeneratedRpgSeed(0.5, "World Seed")).toThrowError(
        `World Seed must be an integer within JavaScript's safe range, got 0.5.`,
      );
      expect(() => assertGeneratedRpgSeed("abc", "Bad Seed")).toThrowError(
        `Bad Seed must be an integer within JavaScript's safe range, got "abc".`,
      );
      expect(() => assertGeneratedRpgSeed(Number.MAX_SAFE_INTEGER + 1, "Unsafe Seed")).toThrowError(
        `Unsafe Seed must be an integer within JavaScript's safe range, got ${Number.MAX_SAFE_INTEGER + 1}.`,
      );
    });
  });
});
