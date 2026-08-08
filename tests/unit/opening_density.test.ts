import { describe, expect, it } from "vitest";

import {
  MAX_OPENING_ACTIONABLE_OPTIONS,
  MAX_OPENING_WORD_TOKENS,
  measureCanonicalOpening,
  measureOpeningDensity,
  openingDensityFindings,
} from "../../scripts/verify-opening-density.js";

describe("opening density counter-metric", () => {
  it("keeps the real compact opening at or below its measured regression ceilings", () => {
    const density = measureCanonicalOpening(process.cwd());

    expect(MAX_OPENING_WORD_TOKENS).toBe(732);
    expect(MAX_OPENING_ACTIONABLE_OPTIONS).toBe(12);
    expect(density.wordTokens).toBeLessThanOrEqual(MAX_OPENING_WORD_TOKENS);
    expect(density.actionableOptions).toBeLessThanOrEqual(MAX_OPENING_ACTIONABLE_OPTIONS);
    expect(density.sectionWordTokens.tutorial).toBeGreaterThan(0);
    expect(density.sectionWordTokens.goal).toBeGreaterThan(0);
    expect(density.sectionWordTokens.legend).toBeGreaterThan(0);
    expect(density.sectionWordTokens.context).toBeGreaterThan(0);
  });

  it("counts only available service rows while counting every immediate action collection", () => {
    const density = measureOpeningDensity({
      tutorial: { text: "one two" },
      journey: { goal: { text: "three" }, goalGuidance: "four" },
      legend: { sample: "five six" },
      context: {
        roads: [["road_a", "Seven Road"]],
        areas: [["area_a", "Eight Area"]],
        service_actions: [
          ["rest", "ordinary", null, true],
          ["care", "ordinary", null, false],
        ],
      },
    });

    expect(density.actionableOptions).toBe(3);
    expect(density.wordTokens).toBe(18);
  });

  it("reports either dimension independently when a future opening exceeds the ceiling", () => {
    const baseline = measureCanonicalOpening(process.cwd());

    expect(
      openingDensityFindings({
        ...baseline,
        wordTokens: MAX_OPENING_WORD_TOKENS + 1,
        actionableOptions: MAX_OPENING_ACTIONABLE_OPTIONS + 1,
      }).map((finding) => finding.code),
    ).toEqual(["OPENING_WORD_BUDGET_EXCEEDED", "OPENING_OPTION_BUDGET_EXCEEDED"]);
  });
});
