import { describe, it, expect } from "vitest";
import {
  isGeneratedRpgSeed,
  generatedRpgSeedValidationMessage,
  assertGeneratedRpgSeed,
} from "../../src/gen/seed.js";

describe("isGeneratedRpgSeed", () => {
  it("returns true for safe integers", () => {
    expect(isGeneratedRpgSeed(0)).toBe(true);
    expect(isGeneratedRpgSeed(42)).toBe(true);
    expect(isGeneratedRpgSeed(-123)).toBe(true);
    expect(isGeneratedRpgSeed(Number.MAX_SAFE_INTEGER)).toBe(true);
    expect(isGeneratedRpgSeed(Number.MIN_SAFE_INTEGER)).toBe(true);
  });

  it("returns false for unsafe integers", () => {
    expect(isGeneratedRpgSeed(Number.MAX_SAFE_INTEGER + 1)).toBe(false);
    expect(isGeneratedRpgSeed(Number.MIN_SAFE_INTEGER - 1)).toBe(false);
  });

  it("returns false for floats", () => {
    expect(isGeneratedRpgSeed(1.5)).toBe(false);
    expect(isGeneratedRpgSeed(-0.5)).toBe(false);
    expect(isGeneratedRpgSeed(Math.PI)).toBe(false);
  });

  it("returns false for special number values", () => {
    expect(isGeneratedRpgSeed(NaN)).toBe(false);
    expect(isGeneratedRpgSeed(Infinity)).toBe(false);
    expect(isGeneratedRpgSeed(-Infinity)).toBe(false);
  });

  it("returns false for non-number types", () => {
    expect(isGeneratedRpgSeed("42")).toBe(false);
    expect(isGeneratedRpgSeed(null)).toBe(false);
    expect(isGeneratedRpgSeed(undefined)).toBe(false);
    expect(isGeneratedRpgSeed({})).toBe(false);
    expect(isGeneratedRpgSeed([])).toBe(false);
    expect(isGeneratedRpgSeed(true)).toBe(false);
    expect(isGeneratedRpgSeed(BigInt(42))).toBe(false);
  });
});

describe("generatedRpgSeedValidationMessage", () => {
  it("formats message correctly for different seed types", () => {
    expect(generatedRpgSeedValidationMessage("WorldSeed", "foo")).toBe(
      `WorldSeed must be an integer within JavaScript's safe range, got "foo".`,
    );
    expect(generatedRpgSeedValidationMessage("TestSeed", 1.5)).toBe(
      `TestSeed must be an integer within JavaScript's safe range, got 1.5.`,
    );
    expect(generatedRpgSeedValidationMessage("MySeed", null)).toBe(
      `MySeed must be an integer within JavaScript's safe range, got null.`,
    );
  });
});

describe("assertGeneratedRpgSeed", () => {
  it("does not throw for valid seeds", () => {
    expect(() => assertGeneratedRpgSeed(42, "TestLabel")).not.toThrow();
    expect(() => assertGeneratedRpgSeed(0, "TestLabel")).not.toThrow();
  });

  it("throws Error with correct message for invalid seeds", () => {
    expect(() => assertGeneratedRpgSeed(1.5, "MyLabel")).toThrowError(
      `MyLabel must be an integer within JavaScript's safe range, got 1.5.`,
    );
    expect(() => assertGeneratedRpgSeed("abc", "OtherLabel")).toThrowError(
      `OtherLabel must be an integer within JavaScript's safe range, got "abc".`,
    );
  });
});
