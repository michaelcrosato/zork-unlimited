import { describe, expect, it } from "vitest";

import {
  compactJourneyPresentation,
  compactJourneyStoryChoiceComparison,
  compactJourneyStoryChoicePrompt,
  JOURNEY_STORY_CHOICE_STAGED_CONSEQUENCE,
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
import { presentOpeningReliefAllocation } from "../../src/world/opening_relief_allocation_presentation.js";
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

function structuredPrompt(option: JourneyStoryChoiceOption): JourneyStoryChoicePrompt {
  return Object.freeze({
    id: "test:structured-story",
    kind: undefined,
    message: "Choose the disclosed terms.",
    options: Object.freeze([
      Object.freeze(option),
      Object.freeze({
        id: "test:other-card",
        label: "Another comparison card",
        summary: Object.freeze({
          commitment: "Carry another term.",
          fieldTrigger: "At another trigger.",
          immediateCost: "No time",
          tradeoff: "The first term stays behind.",
        }),
        consequence:
          "Carry another term. At another trigger. Actual cost: No time. Another consequence.",
      }),
    ]) as JourneyStoryChoiceOptions,
  });
}

describe("compact journey projection", () => {
  it("stages active compact consequences while preserving one exact inspected detail", () => {
    const commitment = "Take the Works charter.";
    const fieldTrigger = "At first pressure, lower alarm.";
    const immediateCost = "20 minutes and 1 supply";
    const tradeoff = "The road kit stays behind.";
    const option = Object.freeze({
      id: "test:works",
      label: "Works charter",
      summary: Object.freeze({ commitment, fieldTrigger, immediateCost, tradeoff }),
      consequence:
        `${commitment} ${fieldTrigger} Sponsor concession remains. ` +
        `Actual cost: ${immediateCost}. The Works will remember it.`,
    });
    const prompt = structuredPrompt(option);
    const before = JSON.stringify(prompt);

    const compact = compactJourneyStoryChoicePrompt(prompt);
    const inspected = compactJourneyStoryChoiceComparison(prompt, option.id).inspectedOption;

    expect(compact).not.toBe(prompt);
    expect(compact.options[0]).toEqual({
      ...option,
      consequence: JOURNEY_STORY_CHOICE_STAGED_CONSEQUENCE,
    });
    expect(compact.options[0]!.summary).toBe(option.summary);
    expect(compact.options[1]).not.toBe(prompt.options[1]);
    expect(compact.options[1]!.consequence).toBe(JOURNEY_STORY_CHOICE_STAGED_CONSEQUENCE);
    expect(inspected).toEqual({
      id: option.id,
      label: option.label,
      consequence: "Sponsor concession remains. The Works will remember it.",
    });
    expect(inspected).not.toHaveProperty("summary");
    expect(JSON.stringify(prompt)).toBe(before);
    expect(prompt.options[0]).toBe(option);
  });

  it("stages a historical prompt and expands only the selected exact term", () => {
    const option = Object.freeze({
      id: "test:registration",
      label: "Register",
      consequence: "Rowan records the role.",
    });

    const prompt = twoOptionPrompt(option);
    const compact = compactJourneyStoryChoicePrompt(prompt);
    expect(compact).not.toBe(prompt);
    expect(
      compact.options.every(
        (candidate) => candidate.consequence === JOURNEY_STORY_CHOICE_STAGED_CONSEQUENCE,
      ),
    ).toBe(true);
    expect(compactJourneyStoryChoiceComparison(prompt, option.id).inspectedOption).toEqual(option);
  });

  it("stages an unstructured historic ally prompt without changing its source", () => {
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

    const before = JSON.stringify(ally);
    const compact = compactJourneyStoryChoicePrompt(ally);
    expect(compact).not.toBe(ally);
    expect(
      compact.options.every(
        (option) => option.consequence === JOURNEY_STORY_CHOICE_STAGED_CONSEQUENCE,
      ),
    ).toBe(true);
    expect(compactJourneyStoryChoiceComparison(ally, "a").inspectedOption).toEqual(ally.options[0]);
    expect(JSON.stringify(ally)).toBe(before);
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
        tradeoff: expect.any(String),
      });
      expect(option?.consequence).toBe(JOURNEY_STORY_CHOICE_STAGED_CONSEQUENCE);
      const detail = compactJourneyStoryChoiceComparison(full, profile.id).inspectedOption;
      expect(detail?.consequence).toContain(`Full field terms: ${profile.preview}`);
      expect(detail?.consequence).toContain(profile.consequence);
      expect(detail?.consequence).not.toContain(profile.summary);
      expect(detail?.consequence).not.toContain(triggerCategory);
    }
  });

  it("keeps exact Relief Allocation terms behind the concise compact comparison", () => {
    const allocation = WORLD.opening_relief_allocation;
    const character = WORLD.opening_registration?.profiles[0]?.character;
    if (!allocation || !character) {
      throw new Error("Albany must retain registration and Relief Allocation.");
    }
    const full = presentOpeningReliefAllocation(allocation, character);
    const compact = compactJourneyStoryChoicePrompt(full);

    for (const allocationOption of allocation.options) {
      const triggerCategory = allocationOption.trigger_category;
      if (!triggerCategory) {
        throw new Error(`Relief allocation ${allocationOption.id} needs a trigger category.`);
      }
      const option = compact.options.find((candidate) => candidate.id === allocationOption.id);
      expect(option?.summary).toEqual({
        commitment: allocationOption.summary,
        fieldTrigger: triggerCategory,
        fieldTriggerScope: "category",
        immediateCost: expect.any(String),
        tradeoff: `Leaves exposed: ${allocationOption.leaves_exposed}`,
      });
      expect(option?.consequence).toBe(JOURNEY_STORY_CHOICE_STAGED_CONSEQUENCE);
      const detail = compactJourneyStoryChoiceComparison(full, allocationOption.id).inspectedOption;
      expect(detail?.consequence).toContain(`Full field terms: ${allocationOption.preview}`);
      expect(detail?.consequence).toContain(allocationOption.consequence);
      expect(detail?.consequence).not.toContain(allocationOption.summary);
      expect(detail?.consequence).not.toContain(triggerCategory);
    }
  });

  it.each([
    {
      name: "the structured lead is not at the beginning",
      consequence:
        "Other prose first. Commit. Trigger. Actual cost: 5 minutes. Remaining consequence.",
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
        tradeoff: "Tradeoff.",
      }),
      consequence,
    });
    const prompt = twoOptionPrompt(option);

    expect(compactJourneyStoryChoiceComparison(prompt, option.id).inspectedOption).toEqual({
      id: option.id,
      label: option.label,
      consequence: option.consequence,
    });
  });

  it("keeps a cost sentence visible in the structured lead without repeating it in detail", () => {
    const repeatedCost = "Actual cost: 5 minutes.";
    const commitment = `Commit. ${repeatedCost}`;
    const fieldTrigger = "Trigger.";
    const option: JourneyStoryChoiceOption = Object.freeze({
      id: "test:lead-cost",
      label: "Fail closed on lead cost",
      summary: Object.freeze({
        commitment,
        fieldTrigger,
        immediateCost: "5 minutes",
        tradeoff: "Tradeoff.",
      }),
      consequence: `${commitment} ${fieldTrigger} Remaining consequence.`,
    });
    const prompt = twoOptionPrompt(option);

    expect(compactJourneyStoryChoiceComparison(prompt, option.id).inspectedOption).toEqual({
      id: option.id,
      label: option.label,
      consequence: "Remaining consequence.",
    });
  });

  it("projects only storyChoice and shares every other journey field", () => {
    const prompt = twoOptionPrompt(
      Object.freeze({
        id: "test:projected",
        label: "Projected",
        summary: Object.freeze({
          commitment: "Commit.",
          fieldTrigger: "Trigger.",
          immediateCost: "No time",
          tradeoff: "A tradeoff.",
        }),
        consequence: "Commit. Trigger. Actual cost: No time. Unique consequence.",
      }),
    );
    const journey = Object.freeze({
      storyChoice: structuredPrompt(prompt.options[0]!),
      goal: Object.freeze({ id: "goal" }),
      pendingChoice: null,
      retentionHistory: Object.freeze([]),
    }) as unknown as JourneyPresentation;

    const compact = compactJourneyPresentation(journey);

    expect(compact).not.toBe(journey);
    expect(compact.storyChoice?.options[0]!.consequence).toBe(
      JOURNEY_STORY_CHOICE_STAGED_CONSEQUENCE,
    );
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
