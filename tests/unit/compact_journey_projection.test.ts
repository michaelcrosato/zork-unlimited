import { describe, expect, it } from "vitest";

import {
  compactJourneyPresentation,
  compactJourneyStoryChoicePrompt,
} from "../../src/mcp/journey_projection.js";
import {
  createInitialJourneyContractSnapshot,
  journeyPresentation,
  recordJourneyAcceptedDecision,
} from "../../src/world/journey_contract.js";
import type {
  JourneyPresentation,
  JourneyStoryChoiceOption,
  JourneyStoryChoiceOptions,
  JourneyStoryChoicePrompt,
} from "../../src/world/journey_contract.js";
import { presentOpeningPreparation } from "../../src/world/opening_preparation_presentation.js";
import { loadOverworldManifest } from "../../src/world/source.js";

const WORLD = loadOverworldManifest(process.cwd());

function twoOptionPrompt(option: JourneyStoryChoiceOption): JourneyStoryChoicePrompt {
  return Object.freeze({
    id: "test:story",
    kind: undefined,
    message: "Choose the disclosed terms.",
    options: Object.freeze([
      Object.freeze(option),
      Object.freeze({
        id: "test:unchanged",
        label: "An unchanged aftermath",
        consequence: "This option has no structured summary.",
      }),
    ]) as JourneyStoryChoiceOptions,
  });
}

describe("compact journey projection", () => {
  it("retains structured summaries while removing only their exact repeated prose", () => {
    const commitment = "Take the Works charter.";
    const fieldTrigger = "At first pressure, lower alarm.";
    const immediateCost = "20 minutes and 1 supply";
    const option = Object.freeze({
      id: "test:works",
      label: "Works charter",
      summary: Object.freeze({ commitment, fieldTrigger, immediateCost }),
      consequence:
        `${commitment} ${fieldTrigger} Sponsor concession remains. ` +
        `Actual cost: ${immediateCost}. The Works will remember it.`,
    });
    const prompt = twoOptionPrompt(option);
    const before = JSON.stringify(prompt);

    const compact = compactJourneyStoryChoicePrompt(prompt);

    expect(compact).not.toBe(prompt);
    expect(compact.options[0]).toEqual({
      ...option,
      consequence: "Sponsor concession remains. The Works will remember it.",
    });
    expect(compact.options[0]!.summary).toBe(option.summary);
    expect(compact.options[1]).toBe(prompt.options[1]);
    expect(JSON.stringify(prompt)).toBe(before);
    expect(prompt.options[0]).toBe(option);
  });

  it("removes the exact repeated lead when a summary has no immediate cost", () => {
    const option = Object.freeze({
      id: "test:registration",
      label: "Register",
      summary: Object.freeze({
        commitment: "Register as a public advocate.",
        fieldTrigger: "Witnesses expect an open accounting.",
      }),
      consequence:
        "Register as a public advocate. Witnesses expect an open accounting. Rowan records the role.",
    });

    expect(compactJourneyStoryChoicePrompt(twoOptionPrompt(option)).options[0]!.consequence).toBe(
      "Rowan records the role.",
    );
  });

  it("passes ally and other no-summary prompts through by identity", () => {
    const ally = Object.freeze({
      id: "test:ally",
      kind: "ally" as const,
      message: "Choose a field ally.",
      options: Object.freeze([
        Object.freeze({ id: "a", label: "A", consequence: "A consequence." }),
        Object.freeze({ id: "b", label: "B", consequence: "B consequence." }),
        Object.freeze({ id: "c", label: "C", consequence: "C consequence." }),
      ]),
    }) as JourneyStoryChoicePrompt;

    expect(compactJourneyStoryChoicePrompt(ally)).toBe(ally);
  });

  it("keeps exact Station preparation terms behind the concise compact comparison", () => {
    const preparation = WORLD.opening_preparation;
    const character = WORLD.opening_registration?.profiles[0]?.character;
    if (!preparation || !character) {
      throw new Error("Albany must retain registration and opening preparation.");
    }
    const full = presentOpeningPreparation(preparation, character);
    const compact = compactJourneyStoryChoicePrompt(full);

    for (const profile of preparation.profiles) {
      const triggerCategory = profile.trigger_category;
      if (!triggerCategory) throw new Error(`Preparation ${profile.id} needs a trigger category.`);
      const option = compact.options.find((candidate) => candidate.id === profile.id);
      expect(option?.summary).toEqual({
        commitment: profile.summary,
        fieldTrigger: triggerCategory,
        fieldTriggerScope: "category",
        immediateCost: expect.any(String),
      });
      expect(option?.consequence).toContain(`Full field terms: ${profile.preview}`);
      expect(option?.consequence).toContain(profile.consequence);
      expect(option?.consequence).not.toContain(profile.summary);
      expect(option?.consequence).not.toContain(triggerCategory);
    }
  });

  it.each([
    {
      name: "the structured lead is not at the beginning",
      consequence:
        "Other prose first. Commit. Trigger. Actual cost: 5 minutes. Remaining consequence.",
    },
    {
      name: "the exact cost sentence is absent",
      consequence: "Commit. Trigger. Actual cost — 5 minutes. Remaining consequence.",
    },
    {
      name: "the exact cost sentence occurs more than once",
      consequence:
        "Commit. Trigger. Actual cost: 5 minutes. Remaining consequence. Actual cost: 5 minutes.",
    },
  ])("fails closed when $name", ({ consequence }) => {
    const option = Object.freeze({
      id: "test:closed",
      label: "Fail closed",
      summary: Object.freeze({
        commitment: "Commit.",
        fieldTrigger: "Trigger.",
        immediateCost: "5 minutes",
      }),
      consequence,
    });
    const prompt = twoOptionPrompt(option);

    expect(compactJourneyStoryChoicePrompt(prompt)).toBe(prompt);
    expect(prompt.options[0]).toBe(option);
  });

  it("fails closed when the sole cost sentence belongs to the structured lead", () => {
    const repeatedCost = "Actual cost: 5 minutes.";
    const commitment = `Commit. ${repeatedCost}`;
    const fieldTrigger = "Trigger.";
    const option = Object.freeze({
      id: "test:lead-cost",
      label: "Fail closed on lead cost",
      summary: Object.freeze({ commitment, fieldTrigger, immediateCost: "5 minutes" }),
      consequence: `${commitment} ${fieldTrigger} Remaining consequence.`,
    });
    const prompt = twoOptionPrompt(option);

    expect(compactJourneyStoryChoicePrompt(prompt)).toBe(prompt);
    expect(prompt.options[0]).toBe(option);
  });

  it("projects only storyChoice and shares every other journey field", () => {
    const prompt = twoOptionPrompt(
      Object.freeze({
        id: "test:projected",
        label: "Projected",
        summary: Object.freeze({ commitment: "Commit.", fieldTrigger: "Trigger." }),
        consequence: "Commit. Trigger. Unique consequence.",
      }),
    );
    const journey = Object.freeze({
      storyChoice: prompt,
      goal: Object.freeze({ id: "goal" }),
      pendingChoice: null,
      retentionHistory: Object.freeze([]),
    }) as unknown as JourneyPresentation;

    const compact = compactJourneyPresentation(journey);

    expect(compact).not.toBe(journey);
    expect(compact.storyChoice?.options[0]!.consequence).toBe("Unique consequence.");
    expect(compact.goal).toBe(journey.goal);
    expect(compact.pendingChoice).toBe(journey.pendingChoice);
    expect(compact.retentionHistory).toBe(journey.retentionHistory);

    const withoutStory = Object.freeze({ ...journey, storyChoice: null });
    expect(compactJourneyPresentation(withoutStory)).toBe(withoutStory);
  });

  it("preserves truthful checkpoint continuation copy in the compact MCP projection", () => {
    let state = createInitialJourneyContractSnapshot();
    while (state.acceptedDecisions < 40) {
      state = recordJourneyAcceptedDecision(
        state,
        {
          surface: "overworld",
          actionId: `action:${String(state.acceptedDecisions + 1)}`,
          reason: "situation_changed",
        },
        true,
      );
    }
    const full = journeyPresentation(state);
    const compact = compactJourneyPresentation(full);

    expect(compact).toBe(full);
    expect(compact.pendingChoice?.options[0]).toEqual({
      id: "continue",
      label: "Continue toward checkpoint 80",
      consequence:
        "Play remains open; you may end again when an active goal completes or at the first safe break at or after checkpoint threshold 80, whichever comes first.",
    });
  });
});
