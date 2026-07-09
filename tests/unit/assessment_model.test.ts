import { describe, it, expect } from "vitest";
import { score } from "../../src/afk/assessment_model";

describe("assessment_model", () => {
  describe("score", () => {
    it("calculates score correctly for content_fix with effort S", () => {
      // (1 / 1) * 1.0 = 1.0
      expect(score(1, "S", "content_fix")).toBe(1);
      // (5 / 1) * 1.0 = 5.0
      expect(score(5, "S", "content_fix")).toBe(5);
    });

    it("calculates score correctly for content_new with effort M", () => {
      // (2 / 2) * 0.85 = 0.85
      expect(score(2, "M", "content_new")).toBe(0.85);
      // (5 / 2) * 0.85 = 2.125
      expect(score(5, "M", "content_new")).toBe(2.125);
    });

    it("calculates score correctly for engine with effort L", () => {
      // (3 / 3) * 0.8 = 0.8
      expect(score(3, "L", "engine")).toBe(0.8);
      // (5 / 3) * 0.8 = 1.33333333... -> rounded to 1.333
      expect(score(5, "L", "engine")).toBe(1.333);
    });

    it("calculates score correctly for repo with effort S", () => {
      // (1 / 1) * 0.6 = 0.6
      expect(score(1, "S", "repo")).toBe(0.6);
      // (5 / 1) * 0.6 = 3.0
      expect(score(5, "S", "repo")).toBe(3);
    });

    it("correctly rounds to 3 decimal places", () => {
      // Math.round((4 / 3) * 0.85 * 1000) / 1000
      // 1.3333... * 0.85 = 1.1333333...
      // Math.round(1133.333...) / 1000 = 1.133
      expect(score(4, "L", "content_new")).toBe(1.133);

      // (5 / 3) * 0.6 = 1.6666... * 0.6 = 1
      expect(score(5, "L", "repo")).toBe(1);
    });
  });
});
