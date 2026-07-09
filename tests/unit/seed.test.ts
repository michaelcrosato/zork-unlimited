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
      expect(isGeneratedRpgSeed(42)).toBe(true);
      expect(isGeneratedRpgSeed(-42)).toBe(true);
      expect(isGeneratedRpgSeed(Number.MAX_SAFE_INTEGER)).toBe(true);
      expect(isGeneratedRpgSeed(Number.MIN_SAFE_INTEGER)).toBe(true);
    });

    it("returns false for unsafe integers", () => {
      expect(isGeneratedRpgSeed(Number.MAX_SAFE_INTEGER + 1)).toBe(false);
      expect(isGeneratedRpgSeed(Number.MIN_SAFE_INTEGER - 1)).toBe(false);
    });

    it("returns false for floats", () => {
      expect(isGeneratedRpgSeed(3.14)).toBe(false);
    });

    it("returns false for non-numbers", () => {
      expect(isGeneratedRpgSeed("42")).toBe(false);
      expect(isGeneratedRpgSeed(null)).toBe(false);
      expect(isGeneratedRpgSeed(undefined)).toBe(false);
      expect(isGeneratedRpgSeed({})).toBe(false);
      expect(isGeneratedRpgSeed([])).toBe(false);
      expect(isGeneratedRpgSeed(true)).toBe(false);
    });
  });

  describe("generatedRpgSeedValidationMessage", () => {
    it("formats the message correctly for numbers", () => {
      expect(generatedRpgSeedValidationMessage("MySeed", 3.14)).toBe(
        "MySeed must be an integer within JavaScript's safe range, got 3.14.",
      );
    });

    it("formats the message correctly for strings", () => {
      expect(generatedRpgSeedValidationMessage("SeedLabel", "invalid")).toBe(
        `SeedLabel must be an integer within JavaScript's safe range, got "invalid".`,
      );
    });

    it("formats the message correctly for objects", () => {
      expect(generatedRpgSeedValidationMessage("Label", { a: 1 })).toBe(
        `Label must be an integer within JavaScript's safe range, got {"a":1}.`,
      );
    });

    it("formats the message correctly for null", () => {
      expect(generatedRpgSeedValidationMessage("Label", null)).toBe(
        `Label must be an integer within JavaScript's safe range, got null.`,
      );
    });

    it("formats the message correctly for undefined", () => {
      expect(generatedRpgSeedValidationMessage("Label", undefined)).toBe(
        `Label must be an integer within JavaScript's safe range, got undefined.`,
      );
    });
  });

  describe("assertGeneratedRpgSeed", () => {
    it("does not throw for valid seeds", () => {
      expect(() => assertGeneratedRpgSeed(42, "Seed")).not.toThrow();
      expect(() => assertGeneratedRpgSeed(0, "Seed")).not.toThrow();
    });

    it("throws an error with the correct message for invalid seeds", () => {
      expect(() => assertGeneratedRpgSeed(3.14, "MySeed")).toThrowError(
        "MySeed must be an integer within JavaScript's safe range, got 3.14.",
      );

      expect(() => assertGeneratedRpgSeed("42", "StringSeed")).toThrowError(
        `StringSeed must be an integer within JavaScript's safe range, got "42".`,
      );
    });
  });
});
