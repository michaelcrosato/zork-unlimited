import { describe, expect, it } from "vitest";

import {
  renderTerminalStoryChoiceComparison,
  runTerminalStoryChoiceController,
} from "../../bin/terminal_story_choice.js";
import type { JourneyStoryChoicePrompt } from "../../src/world/journey_contract.js";

function prompt(kind: JourneyStoryChoicePrompt["kind"]): JourneyStoryChoicePrompt {
  return {
    id: "test:registration",
    kind,
    message: "Choose a starting role.",
    options: [
      {
        id: "custom-scout",
        label: "Scout",
        group: "custom_role",
        summary: { commitment: "Scout ahead.", immediateCost: "None", tradeoff: "No doctrine." },
        consequence: "Scout ahead. Actual cost: None. No doctrine.",
      },
      {
        id: "doctrine-keeper",
        label: "Keeper doctrine",
        group: "doctrine",
        summary: { commitment: "Keep faith.", immediateCost: "None", tradeoff: "No custom role." },
        consequence: "Keep faith. Actual cost: None. No custom role.",
      },
      {
        id: "custom-medic",
        label: "Medic",
        group: "custom_role",
        summary: { commitment: "Treat wounds.", immediateCost: "None", tradeoff: "No doctrine." },
        consequence: "Treat wounds. Actual cost: None. No doctrine.",
      },
      {
        id: "doctrine-warden",
        label: "Warden doctrine",
        group: "doctrine",
        summary: { commitment: "Guard roads.", immediateCost: "None", tradeoff: "No custom role." },
        consequence: "Guard roads. Actual cost: None. No custom role.",
      },
    ],
  } as JourneyStoryChoicePrompt;
}

describe("terminal registration story-choice groups", () => {
  it("labels doctrine and custom-role cards without changing generic comparisons", async () => {
    const grouped = renderTerminalStoryChoiceComparison(prompt("registration"));

    expect(grouped).toContain("  Start with a doctrine");
    expect(grouped).toContain("  Build a custom role");
    expect(grouped.indexOf("Start with a doctrine")).toBeLessThan(
      grouped.indexOf("Build a custom role"),
    );
    expect(grouped.match(/^ {4}\d+\. /gm)).toHaveLength(4);
    expect(grouped.indexOf("1. Keeper doctrine")).toBeLessThan(grouped.indexOf("3. Scout"));
    expect(grouped).toContain("4. Medic");

    const generic = renderTerminalStoryChoiceComparison(prompt("preparation"));
    expect(generic).not.toContain("Start with a doctrine");
    expect(generic).not.toContain("Build a custom role");
    expect(generic.match(/^ {4}\d+\. /gm)).toHaveLength(4);
    expect(generic.indexOf("1. Scout")).toBeLessThan(generic.indexOf("2. Keeper doctrine"));

    const selected: string[] = [];
    const result = await runTerminalStoryChoiceController({
      prompt: prompt("registration"),
      reader: { read: async () => "choose 1" },
      write: () => undefined,
      reject: (message) => {
        throw new Error(message);
      },
      choose: (option) => selected.push(option.id),
    });
    expect(result).toMatchObject({ kind: "chosen", option: { id: "doctrine-keeper" } });
    expect(selected).toEqual(["doctrine-keeper"]);
  });
});
