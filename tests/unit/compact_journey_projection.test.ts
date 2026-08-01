import { describe, expect, expectTypeOf, it } from "vitest";

import {
  compactJourneyPresentation,
  compactJourneyStoryChoiceComparison,
  compactJourneyStoryChoicePrompt,
  embeddedJourneyFocus,
  JOURNEY_STORY_CHOICE_STAGED_CONSEQUENCE,
  type EmbeddedJourneyFocus,
  type JourneyStoryChoiceRevealAffordance,
} from "../../src/mcp/journey_projection.js";
import {
  createInitialJourneyContractSnapshot,
  journeyPresentation,
  recordJourneyAcceptedDecision,
  recordJourneyGoalCompleted,
} from "../../src/world/journey_contract.js";
import {
  ALBANY_DAWN_DISPATCH_CONTINUE_CONSEQUENCE_PREFIX,
  ALBANY_DAWN_DISPATCH_CONTINUE_LABEL,
} from "../../src/world/journey_campaign.js";
import type {
  JourneyPresentation,
  JourneyStoryChoiceOption,
  JourneyStoryChoiceOptions,
  JourneyStoryChoicePrompt,
} from "../../src/world/journey_contract.js";
import { presentOpeningAlly } from "../../src/world/opening_ally_presentation.js";
import {
  OPENING_SELECTION_RECEIPT_WORD_LIMIT,
  openingSelectionReceiptWordCount,
} from "../../src/world/opening_choice_receipt.js";
import { presentOpeningPreparation } from "../../src/world/opening_preparation_presentation.js";
import { presentOpeningLeadSource } from "../../src/world/opening_lead_source_presentation.js";
import { presentOpeningRegistration } from "../../src/world/opening_registration_presentation.js";
import { presentOpeningReliefAllocation } from "../../src/world/opening_relief_allocation_presentation.js";
import { presentOpeningReliefOath } from "../../src/world/opening_relief_oath_presentation.js";
import {
  INSPECT_OVERWORLD_SESSION_STORY_TOOL,
  OVERWORLD_DEPARTURE_CHOICE_VALUES_FROM,
} from "../../src/world/session_departure_interactions.js";
import { loadOverworldManifest } from "../../src/world/source.js";

const WORLD = loadOverworldManifest(process.cwd());

function expectRoleplayReceipt(
  prompt: JourneyStoryChoicePrompt,
  args: {
    id: string;
    commitment: string;
    benefit: string;
    checkFit?: string;
    immediateCost: string;
    giveUp: string;
  },
): void {
  const option = prompt.options.find((candidate) => candidate.id === args.id);
  expect(option?.summary).toEqual({
    commitment: args.commitment,
    ...(args.checkFit === undefined ? {} : { checkFit: args.checkFit }),
    immediateCost: args.immediateCost,
    tradeoff: args.giveUp,
  });
  expect(Object.keys(option?.summary ?? {}).sort()).toEqual([
    ...(args.checkFit === undefined ? [] : ["checkFit"]),
    "commitment",
    "immediateCost",
    "tradeoff",
  ]);
  const detail = compactJourneyStoryChoiceComparison(prompt, args.id).inspectedOption;
  if (args.checkFit === undefined) {
    expect(detail).not.toHaveProperty("checkFit");
  } else {
    expect(detail.checkFit).toBe(args.checkFit);
  }
  expect(detail.consequence).toBe(
    `Benefit: ${args.benefit} Cost: ${args.immediateCost}. Boundary: ${args.giveUp}`,
  );
  expect(openingSelectionReceiptWordCount(detail.consequence)).toBeLessThanOrEqual(
    OPENING_SELECTION_RECEIPT_WORD_LIMIT,
  );
}

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
  it("preserves the legacy trigger-shaped detail compactor", () => {
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
    const comparison = compactJourneyStoryChoiceComparison(prompt);
    const inspected = compactJourneyStoryChoiceComparison(prompt, option.id).inspectedOption;

    expect(compact).not.toBe(prompt);
    expect(compact.options[0]).toEqual({
      ...option,
      consequence: JOURNEY_STORY_CHOICE_STAGED_CONSEQUENCE,
    });
    expect(compact.options[0]!.summary).toEqual(option.summary);
    expect(compact.options[0]!.summary).not.toBe(option.summary);
    expect(compact.options[1]).not.toBe(prompt.options[1]);
    expect(compact.options[1]!.consequence).toBe(JOURNEY_STORY_CHOICE_STAGED_CONSEQUENCE);
    expect(comparison.reviewOption).toEqual({
      tool: INSPECT_OVERWORLD_SESSION_STORY_TOOL,
      storyChoiceId: prompt.id,
      arguments: { story_choice_id: prompt.id },
      argument: "option_id",
      valuesFrom: OVERWORLD_DEPARTURE_CHOICE_VALUES_FROM,
      readOnly: true,
    });
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

  it("reveals staged story cards only through the read-only progressive affordance", () => {
    const prompt = Object.freeze({
      id: "test:progressive-oath",
      kind: "relief_oath" as const,
      message: "Choose the standard packet or expand custom duty cards.",
      progressiveDisclosure: Object.freeze({
        initialOptionIds: Object.freeze(["test:standard-packet"]) as readonly [string],
        reveal: Object.freeze({
          id: "test:custom-duties",
          label: "Compare custom duties",
          description: "Reveal the remaining duty cards without changing this choice.",
          optionIds: Object.freeze(["test:custom-duty-a", "test:custom-duty-b"]) as readonly [
            string,
            string,
          ],
        }),
      }),
      options: Object.freeze([
        Object.freeze({
          id: "test:standard-packet",
          label: "Standard packet",
          summary: Object.freeze({
            commitment: "Bind the mapped duty and evidence.",
            immediateCost: "10 minutes",
            tradeoff: "Other opening choices close.",
          }),
          consequence: "The packet binds both terms.",
        }),
        Object.freeze({
          id: "test:custom-duty-a",
          label: "Custom duty A",
          summary: Object.freeze({
            commitment: "Carry the first custom duty.",
            immediateCost: "5 minutes",
            tradeoff: "The source follows separately.",
          }),
          consequence: "The first custom duty awaits evidence.",
        }),
        Object.freeze({
          id: "test:custom-duty-b",
          label: "Custom duty B",
          summary: Object.freeze({
            commitment: "Carry the second custom duty.",
            immediateCost: "No added time",
            tradeoff: "The source follows separately.",
          }),
          consequence: "The second custom duty awaits evidence.",
        }),
      ]),
    }) as unknown as JourneyStoryChoicePrompt;
    const before = JSON.stringify(prompt);

    const compactJourney = compactJourneyStoryChoicePrompt(prompt);
    expectTypeOf(compactJourney.progressiveDisclosure).toEqualTypeOf<undefined>();
    expectTypeOf(compactJourney.revealOption).toEqualTypeOf<
      JourneyStoryChoiceRevealAffordance | undefined
    >();
    expectTypeOf(compactJourney.options).toEqualTypeOf<readonly JourneyStoryChoiceOption[]>();
    expect(compactJourney).not.toHaveProperty("progressiveDisclosure");
    expect(compactJourney).toMatchObject({
      revealOption: {
        id: "test:custom-duties",
        label: "Compare custom duties",
        description: "Reveal the remaining duty cards without changing this choice.",
        tool: INSPECT_OVERWORLD_SESSION_STORY_TOOL,
        arguments: { story_choice_id: prompt.id, reveal_id: "test:custom-duties" },
        readOnly: true,
      },
    });
    expect(compactJourney.options).toHaveLength(1);
    expect(compactJourney.options[0]).toMatchObject({
      id: "test:standard-packet",
      consequence: JOURNEY_STORY_CHOICE_STAGED_CONSEQUENCE,
    });
    expect(JSON.stringify(compactJourney)).not.toContain("test:custom-duty-a");
    expect(JSON.stringify(compactJourney)).not.toContain("Custom duty A");
    expect(JSON.stringify(compactJourney)).not.toContain("The first custom duty awaits evidence.");

    const initial = compactJourneyStoryChoiceComparison(prompt);
    expect(initial.options.map((option) => option.id)).toEqual(["test:standard-packet"]);
    expect(initial).toMatchObject({
      revealOption: {
        id: "test:custom-duties",
        label: "Compare custom duties",
        description: "Reveal the remaining duty cards without changing this choice.",
        tool: INSPECT_OVERWORLD_SESSION_STORY_TOOL,
        arguments: {
          story_choice_id: prompt.id,
          reveal_id: "test:custom-duties",
        },
        readOnly: true,
      },
    });
    const initialJson = JSON.stringify(initial);
    expect(initialJson).not.toContain("test:custom-duty-a");
    expect(initialJson).not.toContain("Custom duty A");
    expect(initialJson).not.toContain("Carry the first custom duty.");
    expect(initialJson).not.toContain("The first custom duty awaits evidence.");

    const expanded = compactJourneyStoryChoiceComparison(prompt, undefined, "test:custom-duties");
    expect(expanded.options.map((option) => option.id)).toEqual(
      prompt.options.map((option) => option.id),
    );
    expect(expanded).not.toHaveProperty("revealOption");

    const directDetail = compactJourneyStoryChoiceComparison(prompt, "test:custom-duty-a");
    expect(directDetail.inspectedOption).toEqual({
      id: "test:custom-duty-a",
      label: "Custom duty A",
      consequence: "The first custom duty awaits evidence.",
    });
    expect(() =>
      compactJourneyStoryChoiceComparison(prompt, "test:custom-duty-a", "test:custom-duties"),
    ).toThrow(/option_id or reveal_id/i);
    expect(() =>
      compactJourneyStoryChoiceComparison(prompt, undefined, "test:unknown-reveal"),
    ).toThrow(/no progressive disclosure/i);
    expect(JSON.stringify(prompt)).toBe(before);
  });

  it("keeps exact Station preparation receipts behind the concise compact comparison", () => {
    const preparation = WORLD.opening_preparation;
    const character = WORLD.opening_registration?.profiles[0]?.character;
    if (!preparation || !character) {
      throw new Error("Albany must retain registration and opening preparation.");
    }
    const full = presentOpeningPreparation(preparation, character);
    const compact = compactJourneyStoryChoicePrompt(full);

    for (const profile of preparation.profiles) {
      const option = compact.options.find((candidate) => candidate.id === profile.id);
      const fullOption = full.options.find((candidate) => candidate.id === profile.id)!;
      const check = profile.check_disclosure;
      const modifier =
        character.skills.find((skill) => skill.skillId === check?.skill_id)?.rank ?? 0;
      const signedModifier = modifier >= 0 ? `+${String(modifier)}` : String(modifier);
      expectRoleplayReceipt(full, {
        id: profile.id,
        commitment: profile.summary,
        benefit: profile.trigger_category ?? profile.title,
        ...(check
          ? {
              checkFit: `${check.skill_label} ${signedModifier} vs DC ${String(check.difficulty)}`,
            }
          : {}),
        immediateCost: fullOption.summary!.immediateCost,
        giveUp: profile.tradeoff,
      });
      expect(option?.consequence).toBe(JOURNEY_STORY_CHOICE_STAGED_CONSEQUENCE);
      const detail = compactJourneyStoryChoiceComparison(full, profile.id).inspectedOption;
      expect(detail.consequence).not.toContain(profile.preview);
      expect(detail.consequence).not.toContain(profile.consequence);
    }
  });

  it("keeps exact Relief Allocation receipts behind the concise compact comparison", () => {
    const allocation = WORLD.opening_relief_allocation;
    const character = WORLD.opening_registration?.profiles[0]?.character;
    if (!allocation || !character) {
      throw new Error("Albany must retain registration and Relief Allocation.");
    }
    const full = presentOpeningReliefAllocation(allocation, character);
    const compact = compactJourneyStoryChoicePrompt(full);

    for (const allocationOption of allocation.options) {
      const option = compact.options.find((candidate) => candidate.id === allocationOption.id);
      const fullOption = full.options.find((candidate) => candidate.id === allocationOption.id)!;
      expectRoleplayReceipt(full, {
        id: allocationOption.id,
        commitment: allocationOption.summary,
        benefit: allocationOption.trigger_category ?? allocationOption.protects,
        immediateCost: fullOption.summary!.immediateCost,
        giveUp: `Leaves exposed: ${allocationOption.leaves_exposed}`,
      });
      expect(option?.consequence).toBe(JOURNEY_STORY_CHOICE_STAGED_CONSEQUENCE);
      const detail = compactJourneyStoryChoiceComparison(full, allocationOption.id).inspectedOption;
      expect(detail.consequence).not.toContain(allocationOption.preview);
      expect(detail.consequence).not.toContain(allocationOption.consequence);
    }
  });

  it("keeps Civic cards roleplay-first with exact bounded receipts", () => {
    const registration = WORLD.opening_registration;
    const oath = WORLD.opening_relief_oath;
    const source = WORLD.opening_lead_source;
    const character = registration?.profiles[0]?.character;
    if (!registration || !oath || !source || !character) {
      throw new Error("Albany must retain its Civic registration, oath, and source cards.");
    }
    const civicPrompts: ReadonlyArray<
      readonly [
        JourneyStoryChoicePrompt,
        ReadonlyArray<{
          id: string;
          title: string;
          summary: string;
          trigger_category?: string | undefined;
          preview: string;
          tradeoff: string;
          consequence: string;
        }>,
      ]
    > = [
      [presentOpeningRegistration(registration), registration.profiles],
      [presentOpeningReliefOath(oath, character), oath.options],
      [presentOpeningLeadSource(source, character), source.options],
    ];

    for (const [full, sourceOptions] of civicPrompts) {
      const compact = compactJourneyStoryChoicePrompt(full);
      for (const sourceOption of sourceOptions) {
        const option = compact.options.find((candidate) => candidate.id === sourceOption.id);
        expectRoleplayReceipt(full, {
          id: sourceOption.id,
          commitment: sourceOption.summary,
          benefit: sourceOption.trigger_category ?? sourceOption.title,
          immediateCost: option!.summary!.immediateCost,
          giveUp: sourceOption.tradeoff,
        });
        expect(option?.consequence).toBe(JOURNEY_STORY_CHOICE_STAGED_CONSEQUENCE);
        const detail = compactJourneyStoryChoiceComparison(full, sourceOption.id).inspectedOption;
        expect(detail.consequence).not.toContain(sourceOption.preview);
        expect(detail.consequence).not.toContain(sourceOption.consequence);
      }
    }
  });

  it("keeps every ally card roleplay-first with an exact bounded receipt", () => {
    const ally = WORLD.opening_ally;
    const character = WORLD.opening_registration?.profiles[0]?.character;
    if (!ally || !character) throw new Error("Albany must retain its ally commitment.");
    const full = presentOpeningAlly(ally, character);
    const benefits: Readonly<Record<string, string>> = {
      "albany:ally_june_cattle_first": "Independent cattle-pressure ally",
      "albany:ally_june_relay_only": "No companion; relay terms refused",
      "albany:ally_travel_solo": "Solo field team; no ally action",
    };
    for (const sourceOption of ally.options) {
      const option = full.options.find((candidate) => candidate.id === sourceOption.id)!;
      expectRoleplayReceipt(full, {
        id: sourceOption.id,
        commitment: sourceOption.summary,
        benefit: benefits[sourceOption.id]!,
        immediateCost: option.summary!.immediateCost,
        giveUp: sourceOption.tradeoff,
      });
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

  it("keeps explicit active null and the staged story blocker in embedded focus", () => {
    const prompt = twoOptionPrompt(
      Object.freeze({
        id: "test:embedded-blocker",
        label: "Choose the parent consequence",
        consequence: "The complete authored consequence remains actionable.",
      }),
    );
    const storyChoice = structuredPrompt(prompt.options[0]!);
    const journey = Object.freeze({
      status: "active",
      goal: Object.freeze({ id: "goal" }),
      acceptedDecisions: 12,
      nextCheckpoint: 40,
      pendingChoice: null,
      storyChoice,
    }) as unknown as JourneyPresentation;

    const focus = embeddedJourneyFocus(journey);

    expectTypeOf(focus).toEqualTypeOf<EmbeddedJourneyFocus>();
    expect(focus).toMatchObject({
      status: "active",
      goal: journey.goal,
      acceptedDecisions: 12,
      nextCheckpoint: 40,
      pendingChoice: null,
    });
    expect(focus.storyChoice).not.toBe(storyChoice);
    expect(focus.storyChoice).toMatchObject({
      id: storyChoice.id,
      message: storyChoice.message,
    });
    expect(focus.storyChoice?.options).toHaveLength(storyChoice.options.length);
    expect(focus.storyChoice?.options[0]?.consequence).toBe(
      JOURNEY_STORY_CHOICE_STAGED_CONSEQUENCE,
    );
    expect(JSON.stringify(focus.storyChoice)).not.toContain(
      "The complete authored consequence remains actionable.",
    );
  });

  it("preserves the exact Wolf-Winter continuation card in compact play", () => {
    const completed = recordJourneyGoalCompleted(createInitialJourneyContractSnapshot());
    const full = journeyPresentation(completed, {
      goalCompletion: {
        goalVersion: completed.goal.version,
        goalId: completed.goal.id,
        continueLabel: ALBANY_DAWN_DISPATCH_CONTINUE_LABEL,
        continueConsequencePrefix: ALBANY_DAWN_DISPATCH_CONTINUE_CONSEQUENCE_PREFIX,
      },
    });
    const compact = compactJourneyPresentation(full);

    expect(compact).toBe(full);
    expect(compact.pendingChoice?.options).toEqual([
      {
        id: "continue",
        label: "Continue: decide the dawn wagon, then take the Gallowmere lead",
        consequence:
          "Choose where Albany's only dawn relief wagon goes, then head north to Hedrick in Queensbury and see The Gallowmere through. Play remains open; you may end again when an active goal completes or at the first safe break at or after checkpoint threshold 40, whichever comes first.",
      },
      {
        id: "end",
        label: "End this journey",
        consequence: "This journey becomes read-only and its exit receipt is ready for review.",
      },
    ]);
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
