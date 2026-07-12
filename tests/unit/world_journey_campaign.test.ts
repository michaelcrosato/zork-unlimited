import { describe, expect, it } from "vitest";

import {
  ALBANY_DAWN_DISPATCH_CHOICE_IDS,
  ALBANY_DAWN_DISPATCH_GOALS,
  ALBANY_DAWN_DISPATCH_ID,
  ALBANY_DAWN_DISPATCH_TEASER,
  INITIAL_JOURNEY_CAMPAIGN_GOAL,
  JOURNEY_CAMPAIGN_INITIAL_QUEST_ID,
  JOURNEY_CAMPAIGN_QUEST_ORDER,
  JOURNEY_CAMPAIGN_START_TOWN_ID,
  TANNERS_FEVER_ACCOUNTABILITY_CHOICE_IDS,
  TANNERS_FEVER_ACCOUNTABILITY_CONTEXT,
  TANNERS_FEVER_ACCOUNTABILITY_GOALS,
  TANNERS_FEVER_ACCOUNTABILITY_ID,
  TANNERS_FEVER_ACCOUNTABILITY_TEASER,
  TANNERS_FEVER_CAMPAIGN_GOAL,
  WOLF_WINTER_CAMPAIGN_OUTCOMES,
  albanyDawnDispatchStoryChoice,
  assertJourneyCampaignGoalCompletionProof,
  assertJourneyCampaignQuestOutcome,
  journeyCampaignGoalDefinition,
  journeyCampaignGoalIsComplete,
  journeyCampaignGoalJournalCopy,
  journeyCampaignPresentationContext,
  journeyCampaignStoryChoiceSelection,
  materializeJourneyCampaignGoal,
  nextJourneyCampaignGoal,
  tannersFeverAccountabilityStoryChoice,
  wolfWinterCampaignOutcome,
  type AlbanyDawnDispatchChoiceId,
  type JourneyCampaignStoryChoiceId,
  type JourneyCampaignStoryChoiceOptionId,
  type WolfWinterCampaignOutcome,
} from "../../src/world/journey_campaign.js";
import {
  activateJourneyGoal,
  chooseJourney,
  createInitialJourneyContractSnapshot,
  recordJourneyGoalCompleted,
  type JourneyContractSnapshot,
} from "../../src/world/journey_contract.js";

const EXPECTED_CONSEQUENCES: Readonly<
  Record<WolfWinterCampaignOutcome, Record<AlbanyDawnDispatchChoiceId, string>>
> = {
  gate_barred: {
    send_wagon_to_cade:
      "The wagon replaces the broken outer paling; the timber at the inner gate stays as Cade's last bar. You take Hedrick's packet north alone.",
    send_wardens_north:
      "The wagon follows Hedrick's report; Cade keeps the cattle behind the barred inner gate while the outer paling waits.",
  },
  timber_saved: {
    send_wagon_to_cade:
      "The wagon and the saved timber close Cade's breach before the next night. You take Hedrick's packet north alone.",
    send_wardens_north:
      "The wagon follows Hedrick's report; Cade uses the saved timber to begin the repair without it.",
  },
  held: {
    send_wagon_to_cade:
      "The wagon brings the sound wood the fight consumed and rebuilds Cade's exposed line. You take Hedrick's packet north alone.",
    send_wardens_north:
      "The wagon follows Hedrick's report; Cade faces the broken outer line without sound timber until another relief run.",
  },
};

function outcomeIds(endingId: string): ReadonlyMap<string, string> {
  return new Map([["wolf_winter", endingId]]);
}

function awaitingInitialGoalChoice(): JourneyContractSnapshot {
  return recordJourneyGoalCompleted(createInitialJourneyContractSnapshot());
}

function continuedInitialGoal(): JourneyContractSnapshot {
  return chooseJourney(awaitingInitialGoalChoice(), "continue").state;
}

function activeTannersFeverGoal(): JourneyContractSnapshot {
  const initialContinued = continuedInitialGoal();
  const gallowmereActive = activateJourneyGoal(
    initialContinued,
    materializeJourneyCampaignGoal(
      ALBANY_DAWN_DISPATCH_GOALS.send_wagon_to_cade,
      initialContinued.goal.version,
    ),
  );
  const gallowmereContinued = chooseJourney(
    recordJourneyGoalCompleted(gallowmereActive),
    "continue",
  ).state;
  return activateJourneyGoal(
    gallowmereContinued,
    materializeJourneyCampaignGoal(TANNERS_FEVER_CAMPAIGN_GOAL, gallowmereContinued.goal.version),
  );
}

function awaitingTannersFeverGoalChoice(): JourneyContractSnapshot {
  return recordJourneyGoalCompleted(activeTannersFeverGoal());
}

function continuedTannersFeverGoal(): JourneyContractSnapshot {
  return chooseJourney(awaitingTannersFeverGoalChoice(), "continue").state;
}

describe("journey campaign", () => {
  it("maps the three stable Wolf-Winter victories to truthful, distinct Albany returns", () => {
    const expected = [
      {
        endingId: "ending_held_gate_barred",
        id: "gate_barred",
        phrase: "inner gate you barred",
      },
      {
        endingId: "ending_held_timber_saved",
        id: "timber_saved",
        phrase: "sound timber you carried out",
      },
      {
        endingId: "ending_held",
        id: "held",
        phrase: "guard wood was spent",
      },
    ] as const;

    const returnContexts = new Set<string>();
    for (const row of expected) {
      const outcome = wolfWinterCampaignOutcome(outcomeIds(row.endingId));
      expect(outcome).toMatchObject({ id: row.id, endingId: row.endingId });
      expect(outcome?.albanyReturnContext).toContain(row.phrase);
      returnContexts.add(outcome!.albanyReturnContext);
    }
    expect(returnContexts.size).toBe(3);
    expect(wolfWinterCampaignOutcome(new Map())).toBeNull();
    expect(wolfWinterCampaignOutcome(outcomeIds("ending_pulled_down"))).toBeNull();
    expect(() =>
      assertJourneyCampaignQuestOutcome("wolf_winter", "ending_held_gate_barred"),
    ).not.toThrow();
    expect(() => assertJourneyCampaignQuestOutcome("wolf_winter", "ending_pulled_down")).toThrow(
      /unsupported completion ending/,
    );
    expect(() => assertJourneyCampaignQuestOutcome("gallowmere", "ending_victory")).not.toThrow();
  });

  it("shows the truthful return and common teaser before retention without creating the story choice", () => {
    const journey = awaitingInitialGoalChoice();
    const contexts = Object.values(WOLF_WINTER_CAMPAIGN_OUTCOMES).map((outcome) =>
      journeyCampaignPresentationContext({
        journey,
        questOutcomeIds: outcomeIds(outcome.endingId),
      }),
    );

    for (const [index, context] of contexts.entries()) {
      expect(context?.completionContext).toBe(
        Object.values(WOLF_WINTER_CAMPAIGN_OUTCOMES)[index]?.albanyReturnContext,
      );
      expect(context?.preRetentionTeaser).toBe(ALBANY_DAWN_DISPATCH_TEASER);
      expect(context?.preRetentionTeaser).toContain("Hayden Hale");
      expect(context?.preRetentionTeaser).toContain("one dawn relief wagon");
      expect(context?.preRetentionTeaser).toContain("Hedrick Cradoc's father");
      expect(context?.preRetentionTeaser).toContain("old grey sow above Queensbury");
      expect(context?.continueConsequencePrefix).toBe(
        "Continue to decide where Albany's only dawn relief wagon goes.",
      );
      expect(context?.storyChoice).toBeNull();
    }
  });

  it("exposes the canonical dispatch only after continuing the initial goal, never before or on end", () => {
    const questOutcomeIds = outcomeIds("ending_held_gate_barred");
    const initial = createInitialJourneyContractSnapshot();
    const awaiting = recordJourneyGoalCompleted(initial);
    const ended = chooseJourney(awaiting, "end").state;
    const continued = chooseJourney(awaiting, "continue").state;

    expect(journeyCampaignPresentationContext({ journey: initial, questOutcomeIds })).toBeNull();
    expect(
      journeyCampaignPresentationContext({ journey: awaiting, questOutcomeIds })?.storyChoice,
    ).toBeNull();
    expect(journeyCampaignPresentationContext({ journey: ended, questOutcomeIds })).toBeNull();

    const context = journeyCampaignPresentationContext({ journey: continued, questOutcomeIds });
    expect(context?.completionContext).toContain("inner gate you barred");
    expect(context?.preRetentionTeaser).toBeNull();
    expect(context?.continueConsequencePrefix).toBeNull();
    expect(context?.storyChoice).toMatchObject({
      id: "albany_dawn_dispatch",
    });
    expect(context?.storyChoice).not.toHaveProperty("title");
    expect(context?.storyChoice).not.toHaveProperty("prompt");
    expect(context?.storyChoice?.message).toContain("Albany's only dawn relief wagon");
    expect(context?.storyChoice?.options.map((option) => option.id)).toEqual([
      "send_wagon_to_cade",
      "send_wardens_north",
    ]);

    const activated = activateJourneyGoal(
      continued,
      materializeJourneyCampaignGoal(
        ALBANY_DAWN_DISPATCH_GOALS.send_wagon_to_cade,
        continued.goal.version,
      ),
    );
    expect(journeyCampaignPresentationContext({ journey: activated, questOutcomeIds })).toBeNull();
  });

  it("renders the full ending-sensitive 3x2 consequence matrix", () => {
    for (const outcome of Object.values(WOLF_WINTER_CAMPAIGN_OUTCOMES)) {
      const choice = albanyDawnDispatchStoryChoice(outcome);
      expect(choice.options).toHaveLength(2);
      for (const option of choice.options) {
        expect(option.consequence).toBe(EXPECTED_CONSEQUENCES[outcome.id][option.id]);
        expect(option).not.toHaveProperty("goal");
        expect(Object.keys(option).sort()).toEqual(["consequence", "id", "label"]);
      }
      expect(new Set(choice.options.map((option) => option.consequence)).size).toBe(2);
    }
  });

  it("makes both visible tradeoffs lead to distinct, solution-free Gallowmere goals", () => {
    expect(ALBANY_DAWN_DISPATCH_CHOICE_IDS).toEqual(["send_wagon_to_cade", "send_wardens_north"]);
    const goals = Object.values(ALBANY_DAWN_DISPATCH_GOALS);
    expect(new Set(goals.map((goal) => goal.id)).size).toBe(2);
    expect(goals.map((goal) => goal.targetQuestId)).toEqual(["gallowmere", "gallowmere"]);
    for (const goal of goals) {
      expect(goal.text).toContain("Queensbury Market Streets");
      expect(goal.text).toContain("The Gallowmere");
      expect(goal.text).not.toMatch(/tracking|wind-stone|knife|attack|lore|solution/i);
    }
    expect(goals[0]?.text).toContain("Carry Hayden's packet");
    expect(goals[1]?.text).toContain("Travel with Hayden's wardens");
  });

  it("defines a generic, runtime-validated story-choice contract for both aftermaths", () => {
    const storyChoiceIds: readonly JourneyCampaignStoryChoiceId[] = [
      "albany_dawn_dispatch",
      "tanners_fever_accountability",
    ];
    const optionIds: readonly JourneyCampaignStoryChoiceOptionId[] = [
      ...ALBANY_DAWN_DISPATCH_CHOICE_IDS,
      ...TANNERS_FEVER_ACCOUNTABILITY_CHOICE_IDS,
    ];
    expect(storyChoiceIds).toEqual([ALBANY_DAWN_DISPATCH_ID, TANNERS_FEVER_ACCOUNTABILITY_ID]);
    expect(optionIds).toEqual([
      "send_wagon_to_cade",
      "send_wardens_north",
      "keep_household_correction",
      "publish_dosage_warning",
    ]);

    expect(
      journeyCampaignStoryChoiceSelection("albany_dawn_dispatch", "send_wardens_north"),
    ).toEqual({
      storyChoiceId: "albany_dawn_dispatch",
      choiceId: "send_wardens_north",
      goal: ALBANY_DAWN_DISPATCH_GOALS.send_wardens_north,
    });
    expect(
      journeyCampaignStoryChoiceSelection("tanners_fever_accountability", "publish_dosage_warning"),
    ).toEqual({
      storyChoiceId: "tanners_fever_accountability",
      choiceId: "publish_dosage_warning",
      goal: TANNERS_FEVER_ACCOUNTABILITY_GOALS.publish_dosage_warning,
    });
    expect(() =>
      journeyCampaignStoryChoiceSelection("albany_dawn_dispatch", "publish_dosage_warning"),
    ).toThrow(/does not accept option "publish_dosage_warning"/);
    expect(() =>
      journeyCampaignStoryChoiceSelection("tanners_fever_accountability", "send_wagon_to_cade"),
    ).toThrow(/does not accept option "send_wagon_to_cade"/);
    expect(() =>
      journeyCampaignStoryChoiceSelection("invented_aftermath", "invented_choice"),
    ).toThrow(/Unknown journey campaign story choice "invented_aftermath"/);
  });

  it("shows Tanner's accountability teaser at completion and the choice only after continue", () => {
    const questOutcomeIds = outcomeIds("ending_held_gate_barred");
    const active = activeTannersFeverGoal();
    const awaiting = recordJourneyGoalCompleted(active);
    const ended = chooseJourney(awaiting, "end").state;
    const continued = chooseJourney(awaiting, "continue").state;

    expect(journeyCampaignPresentationContext({ journey: active, questOutcomeIds })).toBeNull();
    const beforeRetention = journeyCampaignPresentationContext({
      journey: awaiting,
      questOutcomeIds,
    });
    expect(beforeRetention).toMatchObject({
      completionContext: TANNERS_FEVER_ACCOUNTABILITY_CONTEXT,
      preRetentionTeaser: TANNERS_FEVER_ACCOUNTABILITY_TEASER,
      continueConsequencePrefix: "Continue to decide how Oneonta records the corrected dose.",
      storyChoice: null,
    });
    expect(beforeRetention?.preRetentionTeaser).toContain("next live packet to Rome");
    expect(journeyCampaignPresentationContext({ journey: ended, questOutcomeIds })).toBeNull();

    const afterContinue = journeyCampaignPresentationContext({
      journey: continued,
      questOutcomeIds,
    });
    expect(afterContinue?.completionContext).toBe(TANNERS_FEVER_ACCOUNTABILITY_CONTEXT);
    expect(afterContinue?.preRetentionTeaser).toBeNull();
    expect(afterContinue?.continueConsequencePrefix).toBeNull();
    expect(afterContinue?.storyChoice).toMatchObject({
      id: TANNERS_FEVER_ACCOUNTABILITY_ID,
      message: expect.stringContaining("corrected dose"),
    });
    expect(afterContinue?.storyChoice?.options.map((option) => option.id)).toEqual([
      "keep_household_correction",
      "publish_dosage_warning",
    ]);

    const branchActive = activateJourneyGoal(
      continued,
      materializeJourneyCampaignGoal(
        TANNERS_FEVER_ACCOUNTABILITY_GOALS.keep_household_correction,
        continued.goal.version,
      ),
    );
    expect(
      journeyCampaignPresentationContext({ journey: branchActive, questOutcomeIds }),
    ).toBeNull();
  });

  it("gives Tanner's two balanced choices distinct Rome goals and consequence journal copy", () => {
    expect(TANNERS_FEVER_ACCOUNTABILITY_CHOICE_IDS).toEqual([
      "keep_household_correction",
      "publish_dosage_warning",
    ]);
    const choice = tannersFeverAccountabilityStoryChoice();
    const goals = Object.values(TANNERS_FEVER_ACCOUNTABILITY_GOALS);
    expect(choice.id).toBe(TANNERS_FEVER_ACCOUNTABILITY_ID);
    expect(choice.options.map((option) => option.id)).toEqual(
      TANNERS_FEVER_ACCOUNTABILITY_CHOICE_IDS,
    );
    expect(new Set(choice.options.map((option) => option.consequence)).size).toBe(2);
    expect(new Set(goals.map((goal) => goal.id)).size).toBe(2);
    expect(goals.map((goal) => goal.targetQuestId)).toEqual(["breaking_weir", "breaking_weir"]);
    expect(goals.map((goal) => goal.targetTownId)).toEqual(["rome_city", "rome_city"]);
    expect(goals.map((goal) => goal.targetAreaId)).toEqual([
      "rome_city__market",
      "rome_city__market",
    ]);

    for (const choiceId of TANNERS_FEVER_ACCOUNTABILITY_CHOICE_IDS) {
      const goal = TANNERS_FEVER_ACCOUNTABILITY_GOALS[choiceId];
      const option = choice.options.find((candidate) => candidate.id === choiceId);
      expect(goal.text).toContain("Rome Market Streets");
      expect(goal.text).toContain("The Breaking Weir");
      expect(goal.text).not.toMatch(/sluice|gatehouse|lever|attack|solution/i);
      expect(option).toBeDefined();
      expect(journeyCampaignGoalJournalCopy(goal, new Map())).toEqual({
        title: option!.label,
        text: option!.consequence,
      });
    }
    expect(TANNERS_FEVER_ACCOUNTABILITY_GOALS.keep_household_correction.text).toContain(
      "household record",
    );
    expect(TANNERS_FEVER_ACCOUNTABILITY_GOALS.publish_dosage_warning.text).toContain(
      "warning made public",
    );
  });

  it("orders every remaining shipped quest and skips completed targets", () => {
    expect(JOURNEY_CAMPAIGN_QUEST_ORDER).toEqual([
      "wolf_winter",
      "gallowmere",
      "tanners_fever",
      "breaking_weir",
      "advocates_case",
      "cold_forge",
      "dawn_beacon",
      "factors_mark",
      "falconers_ransom",
      "tide_mill",
      "sunken_barrow",
      "printers_night",
    ]);
    expect(new Set(JOURNEY_CAMPAIGN_QUEST_ORDER).size).toBe(JOURNEY_CAMPAIGN_QUEST_ORDER.length);

    expect(nextJourneyCampaignGoal({ completedQuestIds: new Set() })).toBeNull();
    expect(nextJourneyCampaignGoal({ completedQuestIds: new Set(["wolf_winter"]) })).toBeNull();
    expect(
      nextJourneyCampaignGoal({
        completedQuestIds: new Set(["wolf_winter"]),
        albanyDawnDispatchChoiceId: "send_wagon_to_cade",
      }),
    ).toBe(ALBANY_DAWN_DISPATCH_GOALS.send_wagon_to_cade);
    expect(
      nextJourneyCampaignGoal({
        completedQuestIds: new Set(["wolf_winter", "gallowmere"]),
      }),
    ).toBe(TANNERS_FEVER_CAMPAIGN_GOAL);
    expect(
      nextJourneyCampaignGoal({
        completedQuestIds: new Set(["wolf_winter", "gallowmere", "tanners_fever"]),
      }),
    ).toBeNull();
    expect(
      nextJourneyCampaignGoal({
        completedQuestIds: new Set(["wolf_winter", "gallowmere", "tanners_fever"]),
        tannersFeverAccountabilityChoiceId: "keep_household_correction",
      }),
    ).toBe(TANNERS_FEVER_ACCOUNTABILITY_GOALS.keep_household_correction);
    expect(
      nextJourneyCampaignGoal({
        completedQuestIds: new Set(["wolf_winter", "gallowmere", "tanners_fever"]),
        tannersFeverAccountabilityChoiceId: "publish_dosage_warning",
      }),
    ).toBe(TANNERS_FEVER_ACCOUNTABILITY_GOALS.publish_dosage_warning);
    expect(
      nextJourneyCampaignGoal({
        completedQuestIds: new Set(["wolf_winter", "gallowmere", "tanners_fever", "breaking_weir"]),
      }),
    ).toMatchObject({ targetQuestId: "advocates_case" });
    expect(
      nextJourneyCampaignGoal({
        completedQuestIds: new Set(JOURNEY_CAMPAIGN_QUEST_ORDER),
        albanyDawnDispatchChoiceId: "send_wardens_north",
        tannersFeverAccountabilityChoiceId: "publish_dosage_warning",
      }),
    ).toBeNull();
  });

  it("matches goal completion by target quest, including both shared-target branches", () => {
    const completed = new Set(["wolf_winter", "gallowmere"]);
    expect(
      journeyCampaignGoalIsComplete(ALBANY_DAWN_DISPATCH_GOALS.send_wagon_to_cade, completed),
    ).toBe(true);
    expect(
      journeyCampaignGoalIsComplete(ALBANY_DAWN_DISPATCH_GOALS.send_wardens_north, completed),
    ).toBe(true);
    const tanners = nextJourneyCampaignGoal({ completedQuestIds: completed });
    expect(tanners).not.toBeNull();
    expect(journeyCampaignGoalIsComplete(tanners!, completed)).toBe(false);
    expect(journeyCampaignGoalDefinition({ id: tanners!.id })).toBe(tanners);
    expect(materializeJourneyCampaignGoal(tanners!, 2)).toEqual({
      version: 3,
      id: tanners!.id,
      text: tanners!.text,
    });
    const breakingWeirCompleted = new Set([
      "wolf_winter",
      "gallowmere",
      "tanners_fever",
      "breaking_weir",
    ]);
    expect(
      journeyCampaignGoalIsComplete(
        TANNERS_FEVER_ACCOUNTABILITY_GOALS.keep_household_correction,
        breakingWeirCompleted,
      ),
    ).toBe(true);
    expect(
      journeyCampaignGoalIsComplete(
        TANNERS_FEVER_ACCOUNTABILITY_GOALS.publish_dosage_warning,
        breakingWeirCompleted,
      ),
    ).toBe(true);
    expect(
      journeyCampaignGoalDefinition({
        id: TANNERS_FEVER_ACCOUNTABILITY_GOALS.publish_dosage_warning.id,
      }),
    ).toBe(TANNERS_FEVER_ACCOUNTABILITY_GOALS.publish_dosage_warning);
    expect(() => materializeJourneyCampaignGoal(tanners!, 0)).toThrow(/positive safe integer/);
  });

  it("keeps the pre-branch Rome goal valid for version 8 snapshot restoration only", () => {
    const legacy = journeyCampaignGoalDefinition({ id: "rome_breaking_weir" });
    expect(legacy).toMatchObject({
      id: "rome_breaking_weir",
      targetQuestId: "breaking_weir",
      targetTownId: "rome_city",
      targetAreaId: "rome_city__market",
    });
    const tannersContinued = continuedTannersFeverGoal();
    const legacyActive = activateJourneyGoal(
      tannersContinued,
      materializeJourneyCampaignGoal(legacy!, tannersContinued.goal.version),
    );
    expect(() =>
      assertJourneyCampaignGoalCompletionProof({
        journey: legacyActive,
        completedQuestIds: new Set(["wolf_winter", "gallowmere", "tanners_fever"]),
        startTownId: JOURNEY_CAMPAIGN_START_TOWN_ID,
      }),
    ).not.toThrow();
    expect(
      nextJourneyCampaignGoal({
        completedQuestIds: new Set(["wolf_winter", "gallowmere", "tanners_fever"]),
      }),
    ).toBeNull();
  });

  it("validates current and historical goal completion against quest proof and Albany start", () => {
    expect(JOURNEY_CAMPAIGN_START_TOWN_ID).toBe("albany_city");
    expect(JOURNEY_CAMPAIGN_INITIAL_QUEST_ID).toBe("wolf_winter");
    expect(INITIAL_JOURNEY_CAMPAIGN_GOAL).toMatchObject({
      id: "albany_local_lead",
      targetQuestId: "wolf_winter",
    });
    const initial = createInitialJourneyContractSnapshot();
    expect(() =>
      assertJourneyCampaignGoalCompletionProof({
        journey: initial,
        completedQuestIds: new Set(),
        startTownId: "albany_city",
      }),
    ).not.toThrow();
    expect(() =>
      assertJourneyCampaignGoalCompletionProof({
        journey: initial,
        completedQuestIds: new Set(["wolf_winter"]),
        startTownId: "albany_city",
      }),
    ).toThrow(/active despite completed target quest "wolf_winter"/);

    const initialCompleted = awaitingInitialGoalChoice();
    expect(() =>
      assertJourneyCampaignGoalCompletionProof({
        journey: initialCompleted,
        completedQuestIds: new Set(["wolf_winter"]),
        startTownId: "albany_city",
      }),
    ).not.toThrow();
    expect(() =>
      assertJourneyCampaignGoalCompletionProof({
        journey: initialCompleted,
        completedQuestIds: new Set(["wolf_winter"]),
        startTownId: "colonie_town",
      }),
    ).toThrow(/starts in albany_city/);

    const branchActive = activateJourneyGoal(
      continuedInitialGoal(),
      materializeJourneyCampaignGoal(
        ALBANY_DAWN_DISPATCH_GOALS.send_wardens_north,
        continuedInitialGoal().goal.version,
      ),
    );
    expect(() =>
      assertJourneyCampaignGoalCompletionProof({
        journey: branchActive,
        completedQuestIds: new Set(["wolf_winter"]),
        startTownId: "albany_city",
      }),
    ).not.toThrow();
    expect(() =>
      assertJourneyCampaignGoalCompletionProof({
        journey: branchActive,
        completedQuestIds: new Set(["wolf_winter", "gallowmere"]),
        startTownId: "albany_city",
      }),
    ).toThrow(/active despite completed target quest "gallowmere"/);

    const branchCompleted = recordJourneyGoalCompleted(branchActive);
    expect(() =>
      assertJourneyCampaignGoalCompletionProof({
        journey: branchCompleted,
        completedQuestIds: new Set(["wolf_winter", "gallowmere"]),
        startTownId: "albany_city",
      }),
    ).not.toThrow();
    expect(() =>
      assertJourneyCampaignGoalCompletionProof({
        journey: branchCompleted,
        completedQuestIds: new Set(["gallowmere"]),
        startTownId: "albany_city",
      }),
    ).toThrow(/complete without target quest "wolf_winter"/);

    const forgedText = {
      ...branchActive,
      goal: { ...branchActive.goal, text: "A forged campaign objective." },
    };
    expect(() =>
      assertJourneyCampaignGoalCompletionProof({
        journey: forgedText,
        completedQuestIds: new Set(["wolf_winter"]),
        startTownId: "albany_city",
      }),
    ).toThrow(/does not match its canonical campaign text/);
  });
});
