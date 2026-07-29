import { describe, expect, it } from "vitest";

import {
  compactJourneyStoryChoiceComparison,
  compactJourneyStoryChoicePrompt,
} from "../../src/mcp/journey_projection.js";
import type { JourneyStoryChoicePrompt } from "../../src/world/journey_contract.js";

describe("MCP journey story-choice grouping", () => {
  it("preserves optional registration groups in full, compact, and inspected cards", () => {
    const prompt = Object.freeze({
      id: "test:grouped-registration",
      kind: "registration" as const,
      message: "Choose a starting role.",
      options: Object.freeze([
        Object.freeze({
          id: "doctrine",
          label: "Doctrine",
          group: "doctrine" as const,
          consequence: "Start with a doctrine.",
        }),
        Object.freeze({
          id: "custom",
          label: "Custom role",
          group: "custom_role" as const,
          consequence: "Build a custom role.",
        }),
      ]),
    }) as JourneyStoryChoicePrompt;

    const compact = compactJourneyStoryChoicePrompt(prompt);
    const comparison = compactJourneyStoryChoiceComparison(prompt);
    const detail = compactJourneyStoryChoiceComparison(prompt, "custom").inspectedOption;

    expect(prompt.options.map((option) => option.group)).toEqual(["doctrine", "custom_role"]);
    expect(compact.options.map((option) => option.group)).toEqual(["doctrine", "custom_role"]);
    expect(comparison.options.map((option) => option.group)).toEqual(["doctrine", "custom_role"]);
    expect(detail).toMatchObject({ id: "custom", group: "custom_role" });
  });
});
