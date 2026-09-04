import { describe, expect, it } from "vitest";
import { pureFleetModelMatchesRequest } from "../../src/starting_slice/fleet_run_artifacts.js";

describe("pureFleetModelMatchesRequest", () => {
  describe("Claude aliases (haiku, sonnet, opus)", () => {
    it("matches exact Claude alias against full model names containing the alias as a hyphenated token", () => {
      expect(pureFleetModelMatchesRequest("claude-3-5-sonnet-20241022", "sonnet")).toBe(true);
      expect(pureFleetModelMatchesRequest("claude-3-haiku-20240307", "haiku")).toBe(true);
      expect(pureFleetModelMatchesRequest("claude-3-opus-20240229", "opus")).toBe(true);
    });

    it("handles case insensitivity for requested Claude aliases and actual model strings", () => {
      expect(pureFleetModelMatchesRequest("Claude-3-5-SONNET-20241022", "sonnet")).toBe(true);
      expect(pureFleetModelMatchesRequest("claude-3-5-sonnet-20241022", "SONNET")).toBe(true);
      expect(pureFleetModelMatchesRequest("CLAUDE-3-HAIKU-20240307", "Haiku")).toBe(true);
    });

    it("returns false when actual model string does not contain the requested Claude alias", () => {
      expect(pureFleetModelMatchesRequest("claude-3-haiku-20240307", "sonnet")).toBe(false);
      expect(pureFleetModelMatchesRequest("claude-3-5-sonnet-20241022", "opus")).toBe(false);
      expect(pureFleetModelMatchesRequest("gpt-4o", "haiku")).toBe(false);
    });

    it("returns false when alias is part of a substring but not a separate hyphen-delimited token", () => {
      expect(pureFleetModelMatchesRequest("claude-3-haikuning-20240307", "haiku")).toBe(false);
      expect(pureFleetModelMatchesRequest("claude-3-sonneteer-20241022", "sonnet")).toBe(false);
      expect(pureFleetModelMatchesRequest("opuscule-3-20240229", "opus")).toBe(false);
    });
  });

  describe("Non-alias exact model comparisons", () => {
    it("returns true for exact string matches on non-alias model names", () => {
      expect(pureFleetModelMatchesRequest("gpt-5.6-terra", "gpt-5.6-terra")).toBe(true);
      expect(pureFleetModelMatchesRequest("custom-model-v1", "custom-model-v1")).toBe(true);
      expect(pureFleetModelMatchesRequest("", "")).toBe(true);
    });

    it("returns false for non-matching non-alias model names", () => {
      expect(pureFleetModelMatchesRequest("gpt-5.6-terra", "gpt-5.6-sol")).toBe(false);
      expect(pureFleetModelMatchesRequest("gpt-4o", "gpt-4o-mini")).toBe(false);
    });

    it("requires exact case match for non-alias model names", () => {
      expect(pureFleetModelMatchesRequest("GPT-5.6-TERRA", "gpt-5.6-terra")).toBe(false);
      expect(pureFleetModelMatchesRequest("gpt-5.6-terra", "GPT-5.6-TERRA")).toBe(false);
    });
  });
});
