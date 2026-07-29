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

function progressiveReliefOathPrompt(): JourneyStoryChoicePrompt {
  return {
    id: "test:relief-oath",
    kind: "relief_oath",
    message: "Choose duty and evidence.",
    options: [
      {
        id: "standard-packet",
        label: "Standard packet",
        summary: {
          commitment: "Bind the standard duty and evidence.",
          immediateCost: "10 minutes",
          tradeoff: "Other duty/source choices close.",
        },
        consequence: "Standard receipt.",
      },
      {
        id: "custom-full",
        label: "Full duty",
        summary: {
          commitment: "Take full duty.",
          immediateCost: "10 minutes",
          tradeoff: "Public seals bind you.",
        },
        consequence: "Full receipt.",
      },
      {
        id: "custom-limited",
        label: "Limited duty",
        summary: {
          commitment: "Take limited duty.",
          immediateCost: "5 minutes",
          tradeoff: "Cade keeps property authority.",
        },
        consequence: "Limited receipt.",
      },
      {
        id: "custom-bond",
        label: "Personal bond",
        summary: {
          commitment: "Take a personal bond.",
          immediateCost: "No time",
          tradeoff: "No public warrant.",
        },
        consequence: "Bond receipt.",
      },
    ],
    progressiveDisclosure: {
      initialOptionIds: ["standard-packet"],
      reveal: {
        id: "custom-duty-evidence",
        label: "Compare individual duties",
        description: "Reveal the three original duty cards before choosing one.",
        optionIds: ["custom-full", "custom-limited", "custom-bond"],
      },
    },
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

  it("reveals custom relief terms locally before their exact commands become available", async () => {
    const prompt = progressiveReliefOathPrompt();
    const initial = renderTerminalStoryChoiceComparison(prompt);
    expect(initial).toContain("1. Standard packet");
    expect(initial).toContain("Customize: `customize` — Compare individual duties.");
    expect(initial).not.toContain("Full duty");
    expect(initial).not.toContain("custom-full");

    const revealed = renderTerminalStoryChoiceComparison(prompt, {
      revealId: prompt.progressiveDisclosure!.reveal.id,
    });
    expect(revealed).toContain("1. Standard packet");
    expect(revealed).toContain("2. Full duty");
    expect(revealed).toContain("3. Limited duty");
    expect(revealed).toContain("4. Personal bond");
    expect(revealed).not.toContain("Customize: `customize`");

    const commands = [
      "choose custom-full",
      "customize",
      "inspect custom-full",
      "choose custom-full",
    ];
    const selected: string[] = [];
    const rejected: string[] = [];
    const written: string[] = [];
    const result = await runTerminalStoryChoiceController({
      prompt,
      reader: { read: async () => commands.shift() ?? null },
      write: (text) => written.push(text),
      reject: (message) => rejected.push(message),
      choose: (option) => selected.push(option.id),
    });

    expect(rejected).toEqual([
      "Use `customize` to reveal the individual duties before choosing that card.",
    ]);
    expect(written).toHaveLength(3);
    expect(written[0]).toBe(initial);
    expect(written[1]).toBe(revealed);
    expect(written[2]).toContain("Story choice detail — Full duty");
    expect(result).toMatchObject({ kind: "chosen", option: { id: "custom-full" } });
    expect(selected).toEqual(["custom-full"]);
  });
});
