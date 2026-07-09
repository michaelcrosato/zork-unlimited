import { describe, it, expect } from "vitest";
import { score } from "../../src/afk/assessment_model.js";

describe("assessment_model score", () => {
  it("calculates score correctly for S effort and content_fix", () => {
    // S = 1, content_fix = 1.0
    // impact 5 => (5 / 1) * 1.0 = 5.0
    expect(score(5, "S", "content_fix")).toBe(5.0);
  });

  it("calculates score correctly for M effort and content_new", () => {
    // M = 2, content_new = 0.85
    // impact 3 => (3 / 2) * 0.85 = 1.275
    expect(score(3, "M", "content_new")).toBe(1.275);
  });

  it("calculates score correctly for L effort and engine, rounding to 3 decimal places", () => {
    // L = 3, engine = 0.8
    // impact 4 => (4 / 3) * 0.8 = 1.06666... => 1.067
    expect(score(4, "L", "engine")).toBe(1.067);
  });

  it("calculates score correctly for L effort and repo", () => {
    // L = 3, repo = 0.6
    // impact 2 => (2 / 3) * 0.6 = 0.4
    expect(score(2, "L", "repo")).toBe(0.4);
  });

  it("rounds down when the 4th decimal is less than 5", () => {
    // impact 1, effort L (3), content_new (0.85)
    // 1 / 3 * 0.85 = 0.28333... => 0.283
    expect(score(1, "L", "content_new")).toBe(0.283);
  });
});
