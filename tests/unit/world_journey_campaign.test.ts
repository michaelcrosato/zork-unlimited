import { describe, expect, it } from "vitest";

import {
  ALBANY_DAWN_DISPATCH_CHOICE_IDS,
  ALBANY_DAWN_DISPATCH_GOALS,
  ALBANY_DAWN_DISPATCH_ID,
  ALBANY_DAWN_DISPATCH_TEASER,
  BREAKING_WEIR_CAMPAIGN_OUTCOMES,
  INITIAL_JOURNEY_CAMPAIGN_GOAL,
  JOURNEY_CAMPAIGN_INITIAL_QUEST_ID,
  JOURNEY_CAMPAIGN_QUEST_ORDER,
  JOURNEY_CAMPAIGN_START_TOWN_ID,
  ROME_POST_WEIR_DISPATCH_CHOICE_IDS,
  ROME_POST_WEIR_DISPATCH_CONTEXT,
  ROME_POST_WEIR_DISPATCH_GOALS,
  ROME_POST_WEIR_DISPATCH_ID,
  ROME_POST_WEIR_DISPATCH_TEASER,
  TANNERS_FEVER_ACCOUNTABILITY_CHOICE_IDS,
  TANNERS_FEVER_ACCOUNTABILITY_CONTEXT,
  TANNERS_FEVER_ACCOUNTABILITY_GOALS,
  TANNERS_FEVER_ACCOUNTABILITY_ID,
  TANNERS_FEVER_ACCOUNTABILITY_TEASER,
  TANNERS_FEVER_CAMPAIGN_GOAL,
  WOLF_WINTER_CAMPAIGN_OUTCOMES,
  albanyDawnDispatchStoryChoice,
  assertJourneyCampaignGoalCompletionProof,
  assertJourneyCampaignJournalProof,
  assertJourneyCampaignQuestOutcome,
  breakingWeirCampaignOutcome,
  journeyCampaignGoalDefinition,
  journeyCampaignGoalIsComplete,
  journeyCampaignGoalJournalCopy,
  journeyCampaignPresentationContext,
  journeyCampaignSelectedStoryChoiceRefs,
  journeyCampaignStoryChoiceRefForGoal,
  journeyCampaignStoryChoiceSelection,
  materializeJourneyCampaignGoal,
  nextJourneyCampaignGoal,
  romePostWeirDispatchStoryChoice,
  tannersFeverAccountabilityStoryChoice,
  wolfWinterCampaignOutcome,
  type AlbanyDawnDispatchChoiceId,
  type BreakingWeirCampaignEndingId,
  type BreakingWeirCampaignOutcome,
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
  pack_diverted: {
    send_wagon_to_cade:
      "The wagon replaces the broken outer paling while Cade keeps the whole herd in; the diverted pack remains alive in the high wood. You take Hedrick's packet north alone. Jamie Tanner enters a one-time Market road-store credit for carrying Hedrick's packet alone: a 15-minute resupply whenever you claim it.",
    send_wardens_north:
      "The wagon follows Hedrick's report; Cade watches the whole herd behind the broken outer line with no winter feed left, while the diverted pack remains alive in the high wood. Emery Sloane sets aside a one-time Greenway watch-shelter claim for joining the wardens' northbound dispatch: a 15-minute rest whenever you claim it.",
  },
  pack_diverted_cattle_scattered: {
    send_wagon_to_cade:
      "The wagon returns to repair Cade's broken outer line and help search the lower pasture; two cattle are still missing when you take Hedrick's packet north alone. Jamie Tanner enters a one-time Market road-store credit for carrying Hedrick's packet alone: a 15-minute resupply whenever you claim it.",
    send_wardens_north:
      "The wagon follows Hedrick's report; Cade remains with a broken outer line and two cattle still missing down the lower pasture, while the diverted pack remains alive in the high wood. Emery Sloane sets aside a one-time Greenway watch-shelter claim for joining the wardens' northbound dispatch: a 15-minute rest whenever you claim it.",
  },
  pack_diverted_after_blood: {
    send_wagon_to_cade:
      "The wagon returns to repair Cade's broken outer line and help search the lower pasture; the yearling remains dead, the other two wolves remain alive, and two cattle are still missing when you take Hedrick's packet north alone. Jamie Tanner enters a one-time Market road-store credit for carrying Hedrick's packet alone: a 15-minute resupply whenever you claim it.",
    send_wardens_north:
      "The wagon follows Hedrick's report; Cade remains with a broken outer line and two cattle still missing down the lower pasture; the yearling is dead and the other two wolves remain alive in the high wood. Emery Sloane sets aside a one-time Greenway watch-shelter claim for joining the wardens' northbound dispatch: a 15-minute rest whenever you claim it.",
  },
  drive_cattle_wounded: {
    send_wagon_to_cade:
      "The wagon takes Cade's whole herd from the evacuation road back to repair the abandoned outer line while all three wolves remain alive beyond it; your gate wound remains untreated and the spent signal-and-rope rig remains in Albany for repair when you take Hedrick's packet north alone. Jamie Tanner enters a one-time Market road-store credit for carrying Hedrick's packet alone: a 15-minute resupply whenever you claim it.",
    send_wardens_north:
      "The wagon follows Hedrick's report; Cade keeps the whole herd on the evacuation road while all three wolves remain alive beyond the abandoned outer line, your gate wound remains untreated, and the spent signal-and-rope rig remains in Albany for repair. Emery Sloane sets aside a one-time Greenway watch-shelter claim for joining the wardens' northbound dispatch: a 15-minute rest whenever you claim it.",
  },
  drive_person_cattle_lost: {
    send_wagon_to_cade:
      "The wagon returns with Cade and every evacuated person to search for the scattered herd and repair the abandoned outer line; all three wolves remain alive beyond it and the spent signal-and-rope rig remains in Albany for repair when you take Hedrick's packet north alone. Jamie Tanner enters a one-time Market road-store credit for carrying Hedrick's packet alone: a 15-minute resupply whenever you claim it.",
    send_wardens_north:
      "The wagon follows Hedrick's report; Cade and every other person remain safe on the evacuation road, but the herd remains scattered, all three wolves remain alive beyond the abandoned outer line, and the spent signal-and-rope rig remains in Albany for repair. Emery Sloane sets aside a one-time Greenway watch-shelter claim for joining the wardens' northbound dispatch: a 15-minute rest whenever you claim it.",
  },
  drive_reserve_spent: {
    send_wagon_to_cade:
      "The wagon takes Cade's whole herd from the evacuation road back to repair the abandoned outer line while all three wolves remain alive beyond it; the cut-apart signal-and-rope rig did not return when you take Hedrick's packet north alone. Jamie Tanner enters a one-time Market road-store credit for carrying Hedrick's packet alone: a 15-minute resupply whenever you claim it.",
    send_wardens_north:
      "The wagon follows Hedrick's report; Cade keeps the whole herd safe on the evacuation road while all three wolves remain alive beyond the abandoned outer line, but the cut-apart signal-and-rope rig did not return. Emery Sloane sets aside a one-time Greenway watch-shelter claim for joining the wardens' northbound dispatch: a 15-minute rest whenever you claim it.",
  },
  fortified_cade_terms: {
    send_wagon_to_cade:
      "The wagon returns to cover Cade's exposed outer property while the household and whole herd remain behind his shutters; Albany's public relief seals came home unused. You take Hedrick's packet north alone. Jamie Tanner enters a one-time Market road-store credit for carrying Hedrick's packet alone: a 15-minute resupply whenever you claim it.",
    send_wardens_north:
      "The wagon follows Hedrick's report; Cade's household and whole herd remain secure behind his shutters, but the outer property stays exposed while Albany's unused public relief seals remain in reserve. Emery Sloane sets aside a one-time Greenway watch-shelter claim for joining the wardens' northbound dispatch: a 15-minute rest whenever you claim it.",
  },
  fortified_albany_authority: {
    send_wagon_to_cade:
      "The wagon checks the outer property you preserved under Albany seal; Cade's household and whole herd remain secure, but the public relief seals were spent and his refusal remains on the return board. You take Hedrick's packet north alone. Jamie Tanner enters a one-time Market road-store credit for carrying Hedrick's packet alone: a 15-minute resupply whenever you claim it.",
    send_wardens_north:
      "The wagon follows Hedrick's report; Cade's household, whole herd, and outer property remain secure under Albany's sealed line, but the public relief seals are spent and Cade refused the recovery hand. Emery Sloane sets aside a one-time Greenway watch-shelter claim for joining the wardens' northbound dispatch: a 15-minute rest whenever you claim it.",
  },
  gate_barred: {
    send_wagon_to_cade:
      "The wagon replaces the broken outer paling; the timber at the inner gate stays as Cade's last bar. You take Hedrick's packet north alone. Jamie Tanner enters a one-time Market road-store credit for carrying Hedrick's packet alone: a 15-minute resupply whenever you claim it.",
    send_wardens_north:
      "The wagon follows Hedrick's report; Cade keeps the cattle behind the barred inner gate while the outer paling waits. Emery Sloane sets aside a one-time Greenway watch-shelter claim for joining the wardens' northbound dispatch: a 15-minute rest whenever you claim it.",
  },
  timber_saved: {
    send_wagon_to_cade:
      "The wagon and the saved timber close Cade's breach before the next night. You take Hedrick's packet north alone. Jamie Tanner enters a one-time Market road-store credit for carrying Hedrick's packet alone: a 15-minute resupply whenever you claim it.",
    send_wardens_north:
      "The wagon follows Hedrick's report; Cade uses the saved timber to begin the repair without it. Emery Sloane sets aside a one-time Greenway watch-shelter claim for joining the wardens' northbound dispatch: a 15-minute rest whenever you claim it.",
  },
  held: {
    send_wagon_to_cade:
      "The wagon brings the sound wood the fight consumed and rebuilds Cade's exposed line. You take Hedrick's packet north alone. Jamie Tanner enters a one-time Market road-store credit for carrying Hedrick's packet alone: a 15-minute resupply whenever you claim it.",
    send_wardens_north:
      "The wagon follows Hedrick's report; Cade faces the broken outer line without sound timber until another relief run. Emery Sloane sets aside a one-time Greenway watch-shelter claim for joining the wardens' northbound dispatch: a 15-minute rest whenever you claim it.",
  },
};

function outcomeIds(endingId: string): ReadonlyMap<string, string> {
  return new Map([["wolf_winter", endingId]]);
}

function breakingWeirOutcomeIds(endingId: string): ReadonlyMap<string, string> {
  return new Map([["breaking_weir", endingId]]);
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

function activeBreakingWeirGoal(): JourneyContractSnapshot {
  const tannersContinued = continuedTannersFeverGoal();
  return activateJourneyGoal(
    tannersContinued,
    materializeJourneyCampaignGoal(
      TANNERS_FEVER_ACCOUNTABILITY_GOALS.keep_household_correction,
      tannersContinued.goal.version,
    ),
  );
}

function awaitingBreakingWeirGoalChoice(): JourneyContractSnapshot {
  return recordJourneyGoalCompleted(activeBreakingWeirGoal());
}

const COMPLETED_THROUGH_BREAKING_WEIR = new Set([
  "wolf_winter",
  "gallowmere",
  "tanners_fever",
  "breaking_weir",
]);

describe("journey campaign", () => {
  it("maps the eleven supported Wolf-Winter victories to truthful, distinct Albany returns", () => {
    const expected = [
      {
        endingId: "ending_pack_diverted",
        id: "pack_diverted",
        phrase: "cattle are whole and all three wolves remain alive",
      },
      {
        endingId: "ending_pack_diverted_cattle_scattered",
        id: "pack_diverted_cattle_scattered",
        phrase: "two cattle are still missing",
      },
      {
        endingId: "ending_pack_diverted_after_blood",
        id: "pack_diverted_after_blood",
        phrase: "The yearling is dead",
      },
      {
        endingId: "ending_drive_cattle_wounded",
        id: "drive_cattle_wounded",
        phrase: "you carry an untreated gate wound",
      },
      {
        endingId: "ending_drive_person_cattle_lost",
        id: "drive_person_cattle_lost",
        phrase: "the herd scattered during the retreat",
      },
      {
        endingId: "ending_drive_reserve_spent",
        id: "drive_reserve_spent",
        phrase: "spent signal-and-rope rig was cut apart and did not return",
      },
      {
        endingId: "ending_fortified_cade_terms",
        id: "fortified_cade_terms",
        phrase: "honored his terms and returned Albany's public relief seals unused",
      },
      {
        endingId: "ending_fortified_albany_authority",
        id: "fortified_albany_authority",
        phrase: "invoked lawful Albany authority and spent the public relief seals",
      },
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
    expect(returnContexts.size).toBe(11);
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

  it("carries every pack-diversion outcome through continue without erasing cattle or wolf loss", () => {
    const expected = [
      {
        endingId: "ending_pack_diverted",
        completionTruth: "cattle are whole",
        consequenceTruths: [/whole herd/i],
        forbidden: /cattle (?:are )?still missing/i,
      },
      {
        endingId: "ending_pack_diverted_cattle_scattered",
        completionTruth: "two cattle are still missing",
        consequenceTruths: [/two cattle (?:are )?still missing/i],
        forbidden: /whole herd/i,
      },
      {
        endingId: "ending_pack_diverted_after_blood",
        completionTruth: "The yearling is dead",
        consequenceTruths: [/yearling (?:is|remains) dead/i, /two cattle (?:are )?still missing/i],
        forbidden: /whole herd|all three wolves remain alive/i,
      },
    ] as const;

    for (const row of expected) {
      const questOutcomeIds = outcomeIds(row.endingId);
      expect(() => assertJourneyCampaignQuestOutcome("wolf_winter", row.endingId)).not.toThrow();

      const awaiting = awaitingInitialGoalChoice();
      const beforeContinue = journeyCampaignPresentationContext({
        journey: awaiting,
        questOutcomeIds,
      });
      expect(beforeContinue?.completionContext).toContain(row.completionTruth);
      expect(beforeContinue?.completionContext).not.toMatch(row.forbidden);
      expect(beforeContinue?.storyChoice).toBeNull();

      const continued = chooseJourney(awaiting, "continue").state;
      const afterContinue = journeyCampaignPresentationContext({
        journey: continued,
        questOutcomeIds,
      });
      expect(afterContinue?.storyChoice?.id).toBe(ALBANY_DAWN_DISPATCH_ID);
      expect(afterContinue?.storyChoice?.options).toHaveLength(2);
      for (const option of afterContinue?.storyChoice?.options ?? []) {
        for (const truth of row.consequenceTruths) {
          expect(option.consequence).toMatch(truth);
        }
        expect(option.consequence).not.toMatch(row.forbidden);
      }
    }
  });

  it("carries every drive evacuation outcome through continue without erasing its crisis cost", () => {
    const expected = [
      {
        endingId: "ending_drive_cattle_wounded",
        completionTruth: /whole herd.*untreated gate wound/i,
        consequenceTruths: [/whole herd/i, /gate wound remains untreated/i],
        forbidden: /herd (?:remains )?scattered|rig did not return/i,
      },
      {
        endingId: "ending_drive_person_cattle_lost",
        completionTruth: /herd scattered during the retreat/i,
        consequenceTruths: [/herd (?:remains )?scattered|search for the scattered herd/i],
        forbidden: /whole herd|gate wound|rig did not return/i,
      },
      {
        endingId: "ending_drive_reserve_spent",
        completionTruth: /spent signal-and-rope rig was cut apart and did not return/i,
        consequenceTruths: [/whole herd/i, /cut-apart signal-and-rope rig did not return/i],
        forbidden: /herd (?:remains )?scattered|gate wound|rig remains in Albany/i,
      },
    ] as const;

    for (const row of expected) {
      const questOutcomeIds = outcomeIds(row.endingId);
      expect(() => assertJourneyCampaignQuestOutcome("wolf_winter", row.endingId)).not.toThrow();

      const awaiting = awaitingInitialGoalChoice();
      const beforeContinue = journeyCampaignPresentationContext({
        journey: awaiting,
        questOutcomeIds,
      });
      expect(beforeContinue?.completionContext).toMatch(row.completionTruth);
      expect(beforeContinue?.completionContext).not.toMatch(row.forbidden);

      const continued = chooseJourney(awaiting, "continue").state;
      const afterContinue = journeyCampaignPresentationContext({
        journey: continued,
        questOutcomeIds,
      });
      for (const option of afterContinue?.storyChoice?.options ?? []) {
        for (const truth of row.consequenceTruths) {
          expect(option.consequence).toMatch(truth);
        }
        expect(option.consequence).not.toMatch(row.forbidden);
      }
    }
  });

  it("carries both fortify outcomes through continue without erasing consent or public cost", () => {
    const expected = [
      {
        endingId: "ending_fortified_cade_terms",
        completionTruths: [
          /honored his terms/i,
          /relief seals unused/i,
          /outer property remained exposed/i,
        ],
        consequenceTruths: [
          /household/i,
          /whole herd/i,
          /shutters/i,
          /outer property/i,
          /exposed/i,
          /relief seals/i,
          /unused|reserve/i,
        ],
        forbidden: /authority|seals (?:were|are) spent|Cade refused/i,
      },
      {
        endingId: "ending_fortified_albany_authority",
        completionTruths: [
          /invoked lawful Albany authority/i,
          /spent the public relief seals/i,
          /Cade refused to help/i,
        ],
        consequenceTruths: [
          /household/i,
          /whole herd/i,
          /outer property/i,
          /seal/i,
          /relief seals/i,
          /spent/i,
          /refus/i,
        ],
        forbidden: /honored his terms|seals (?:came home )?unused|property stays exposed/i,
      },
    ] as const;

    for (const row of expected) {
      const questOutcomeIds = outcomeIds(row.endingId);
      expect(() => assertJourneyCampaignQuestOutcome("wolf_winter", row.endingId)).not.toThrow();

      const awaiting = awaitingInitialGoalChoice();
      const beforeContinue = journeyCampaignPresentationContext({
        journey: awaiting,
        questOutcomeIds,
      });
      for (const truth of row.completionTruths) {
        expect(beforeContinue?.completionContext).toMatch(truth);
      }
      expect(beforeContinue?.completionContext).not.toMatch(row.forbidden);

      const continued = chooseJourney(awaiting, "continue").state;
      const afterContinue = journeyCampaignPresentationContext({
        journey: continued,
        questOutcomeIds,
      });
      expect(afterContinue?.storyChoice?.options).toHaveLength(2);
      for (const option of afterContinue?.storyChoice?.options ?? []) {
        for (const truth of row.consequenceTruths) expect(option.consequence).toMatch(truth);
        expect(option.consequence).not.toMatch(row.forbidden);
      }
    }
  });

  it("maps only the two current and one legacy Breaking-Weir victories to truthful Rome contexts", () => {
    const expected: readonly {
      endingId: BreakingWeirCampaignEndingId;
      id: BreakingWeirCampaignOutcome;
      phrase: string;
    }[] = [
      {
        endingId: "ending_fields_held_race_spent",
        id: "fields_held_race_spent",
        phrase: "winter grain intact",
      },
      {
        endingId: "ending_race_held_fields_given",
        id: "race_held_fields_given",
        phrase: "winter grain lies under silt",
      },
      {
        endingId: "ending_held",
        id: "held",
        phrase: "relief-race carries the flood crest",
      },
    ];

    const contexts = new Set<string>();
    for (const row of expected) {
      const outcome = breakingWeirCampaignOutcome(breakingWeirOutcomeIds(row.endingId));
      expect(outcome).toEqual(BREAKING_WEIR_CAMPAIGN_OUTCOMES[row.endingId]);
      expect(outcome).toMatchObject({ id: row.id, endingId: row.endingId });
      expect(outcome?.romeDispatchContext).toContain(row.phrase);
      expect(() => assertJourneyCampaignQuestOutcome("breaking_weir", row.endingId)).not.toThrow();
      contexts.add(outcome!.romeDispatchContext);
    }

    expect(contexts.size).toBe(3);
    expect(BREAKING_WEIR_CAMPAIGN_OUTCOMES.ending_held.romeDispatchContext).toBe(
      ROME_POST_WEIR_DISPATCH_CONTEXT,
    );
    expect(breakingWeirCampaignOutcome(new Map())).toBeNull();
    expect(breakingWeirCampaignOutcome(breakingWeirOutcomeIds("ending_swept"))).toBeNull();
    expect(() => assertJourneyCampaignQuestOutcome("breaking_weir", "ending_swept")).toThrow(
      /unsupported completion ending "ending_swept"/,
    );
    expect(() => assertJourneyCampaignQuestOutcome("breaking_weir", "ending_invented")).toThrow(
      /unsupported completion ending "ending_invented"/,
    );
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

  it("renders the full ending-sensitive 9x2 consequence matrix", () => {
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

  it("defines a generic, runtime-validated story-choice contract for all authored aftermaths", () => {
    const storyChoiceIds: readonly JourneyCampaignStoryChoiceId[] = [
      "albany_dawn_dispatch",
      "tanners_fever_accountability",
      "rome_post_weir_dispatch",
    ];
    const optionIds: readonly JourneyCampaignStoryChoiceOptionId[] = [
      ...ALBANY_DAWN_DISPATCH_CHOICE_IDS,
      ...TANNERS_FEVER_ACCOUNTABILITY_CHOICE_IDS,
      ...ROME_POST_WEIR_DISPATCH_CHOICE_IDS,
    ];
    expect(storyChoiceIds).toEqual([
      ALBANY_DAWN_DISPATCH_ID,
      TANNERS_FEVER_ACCOUNTABILITY_ID,
      ROME_POST_WEIR_DISPATCH_ID,
    ]);
    expect(optionIds).toEqual([
      "send_wagon_to_cade",
      "send_wardens_north",
      "keep_household_correction",
      "publish_dosage_warning",
      "take_oswego_charter_packet",
      "take_greece_forge_packet",
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
    expect(
      journeyCampaignStoryChoiceSelection("rome_post_weir_dispatch", "take_greece_forge_packet"),
    ).toEqual({
      storyChoiceId: "rome_post_weir_dispatch",
      choiceId: "take_greece_forge_packet",
      goal: ROME_POST_WEIR_DISPATCH_GOALS.take_greece_forge_packet,
    });
    expect(() =>
      journeyCampaignStoryChoiceSelection("albany_dawn_dispatch", "publish_dosage_warning"),
    ).toThrow(/does not accept option "publish_dosage_warning"/);
    expect(() =>
      journeyCampaignStoryChoiceSelection("tanners_fever_accountability", "send_wagon_to_cade"),
    ).toThrow(/does not accept option "send_wagon_to_cade"/);
    expect(() =>
      journeyCampaignStoryChoiceSelection("rome_post_weir_dispatch", "publish_dosage_warning"),
    ).toThrow(/does not accept option "publish_dosage_warning"/);
    expect(() =>
      journeyCampaignStoryChoiceSelection("invented_aftermath", "invented_choice"),
    ).toThrow(/Unknown journey campaign story choice "invented_aftermath"/);
  });

  it("recovers trusted story selections from current and historical campaign goals", () => {
    const authored = [
      ...Object.entries(ALBANY_DAWN_DISPATCH_GOALS).map(([choiceId, goal]) => ({
        story_choice_id: ALBANY_DAWN_DISPATCH_ID,
        choice_id: choiceId,
        goal,
      })),
      ...Object.entries(TANNERS_FEVER_ACCOUNTABILITY_GOALS).map(([choiceId, goal]) => ({
        story_choice_id: TANNERS_FEVER_ACCOUNTABILITY_ID,
        choice_id: choiceId,
        goal,
      })),
      ...Object.entries(ROME_POST_WEIR_DISPATCH_GOALS).map(([choiceId, goal]) => ({
        story_choice_id: ROME_POST_WEIR_DISPATCH_ID,
        choice_id: choiceId,
        goal,
      })),
    ];
    for (const { story_choice_id, choice_id, goal } of authored) {
      expect(journeyCampaignStoryChoiceRefForGoal(goal)).toEqual({
        story_choice_id,
        choice_id,
      });
    }
    expect(journeyCampaignStoryChoiceRefForGoal(INITIAL_JOURNEY_CAMPAIGN_GOAL)).toBeNull();

    const continued = continuedInitialGoal();
    const dispatchActive = activateJourneyGoal(
      continued,
      materializeJourneyCampaignGoal(
        ALBANY_DAWN_DISPATCH_GOALS.send_wagon_to_cade,
        continued.goal.version,
      ),
    );
    expect(journeyCampaignSelectedStoryChoiceRefs(dispatchActive)).toEqual([
      {
        story_choice_id: ALBANY_DAWN_DISPATCH_ID,
        choice_id: "send_wagon_to_cade",
      },
    ]);
    expect(journeyCampaignSelectedStoryChoiceRefs(activeTannersFeverGoal())).toEqual([
      {
        story_choice_id: ALBANY_DAWN_DISPATCH_ID,
        choice_id: "send_wagon_to_cade",
      },
    ]);

    const conflicting = {
      ...dispatchActive,
      goalHistory: [
        ...dispatchActive.goalHistory,
        {
          ...dispatchActive.goal,
          id: ALBANY_DAWN_DISPATCH_GOALS.send_wardens_north.id,
          text: ALBANY_DAWN_DISPATCH_GOALS.send_wardens_north.text,
          status: "completed" as const,
          completedAtDecision: dispatchActive.acceptedDecisions,
        },
      ],
    };
    expect(() => journeyCampaignSelectedStoryChoiceRefs(conflicting)).toThrow(
      /selects both "send_wardens_north" and "send_wagon_to_cade"|selects both "send_wagon_to_cade" and "send_wardens_north"/i,
    );
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

  it("previews both post-Weir premises before retention and asks which packet only after continue", () => {
    const active = activeBreakingWeirGoal();
    const awaiting = awaitingBreakingWeirGoalChoice();
    const ended = chooseJourney(awaiting, "end").state;
    const continued = chooseJourney(awaiting, "continue").state;

    expect(ROME_POST_WEIR_DISPATCH_TEASER).toMatch(/Oswego.*Marta Holm/i);
    expect(ROME_POST_WEIR_DISPATCH_TEASER).toMatch(/Greece.*forge/i);

    for (const outcome of Object.values(BREAKING_WEIR_CAMPAIGN_OUTCOMES)) {
      const questOutcomeIds = breakingWeirOutcomeIds(outcome.endingId);
      expect(journeyCampaignPresentationContext({ journey: active, questOutcomeIds })).toBeNull();
      expect(
        journeyCampaignPresentationContext({ journey: awaiting, questOutcomeIds }),
      ).toMatchObject({
        completionContext: outcome.romeDispatchContext,
        preRetentionTeaser: ROME_POST_WEIR_DISPATCH_TEASER,
        continueConsequencePrefix: "Continue to choose which live packet you carry first.",
        storyChoice: null,
      });
      expect(journeyCampaignPresentationContext({ journey: ended, questOutcomeIds })).toBeNull();

      const afterContinue = journeyCampaignPresentationContext({
        journey: continued,
        questOutcomeIds,
      });
      expect(afterContinue).toMatchObject({
        completionContext: outcome.romeDispatchContext,
        preRetentionTeaser: null,
        continueConsequencePrefix: null,
        storyChoice: {
          id: ROME_POST_WEIR_DISPATCH_ID,
          message: expect.stringContaining("Which live packet"),
        },
      });
      expect(afterContinue?.storyChoice?.options.map((option) => option.id)).toEqual(
        ROME_POST_WEIR_DISPATCH_CHOICE_IDS,
      );

      const branchActive = activateJourneyGoal(
        continued,
        materializeJourneyCampaignGoal(
          ROME_POST_WEIR_DISPATCH_GOALS.take_oswego_charter_packet,
          continued.goal.version,
        ),
      );
      expect(
        journeyCampaignPresentationContext({ journey: branchActive, questOutcomeIds }),
      ).toBeNull();
    }

    expect(
      journeyCampaignPresentationContext({ journey: awaiting, questOutcomeIds: new Map() }),
    ).toMatchObject({ completionContext: ROME_POST_WEIR_DISPATCH_CONTEXT });
  });

  it("routes both post-Weir choices to distinct first goals while preserving legacy journal proof", () => {
    const choice = romePostWeirDispatchStoryChoice();
    const goals = Object.values(ROME_POST_WEIR_DISPATCH_GOALS);
    expect(choice.id).toBe(ROME_POST_WEIR_DISPATCH_ID);
    expect(choice.options.map((option) => option.id)).toEqual(ROME_POST_WEIR_DISPATCH_CHOICE_IDS);
    expect(new Set(choice.options.map((option) => option.consequence)).size).toBe(2);
    expect(new Set(goals.map((goal) => goal.id)).size).toBe(2);
    expect(goals.map((goal) => goal.targetQuestId)).toEqual(["advocates_case", "cold_forge"]);
    expect(goals.map((goal) => goal.targetTownId)).toEqual(["oswego_city", "greece_town"]);

    for (const choiceId of ROME_POST_WEIR_DISPATCH_CHOICE_IDS) {
      const goal = ROME_POST_WEIR_DISPATCH_GOALS[choiceId];
      const option = choice.options.find((candidate) => candidate.id === choiceId);
      expect(option).toBeDefined();
      expect(goal.text).not.toMatch(/evidence order|rhetoric|physick|combat|lever|solution/i);
      expect(journeyCampaignGoalJournalCopy(goal, new Map())).toEqual({
        title: option!.label,
        text: option!.consequence,
      });
    }

    const legacyGoals = [
      journeyCampaignGoalDefinition({ id: "oswego_advocates_case" }),
      journeyCampaignGoalDefinition({ id: "greece_cold_forge" }),
    ];
    for (const legacyGoal of legacyGoals) {
      expect(legacyGoal).not.toBeNull();
      expect(journeyCampaignGoalJournalCopy(legacyGoal!, new Map())).toEqual({
        title: "A new relief lead",
        text: `The dispatch chain turns to the next live packet. ${legacyGoal!.text}`,
      });
    }

    const legacyGoal = legacyGoals[0]!;
    const legacyBase = continuedInitialGoal();
    const legacyJourney = activateJourneyGoal(
      legacyBase,
      materializeJourneyCampaignGoal(legacyGoal!, legacyBase.goal.version),
    );
    const legacyCopy = journeyCampaignGoalJournalCopy(legacyGoal!, new Map());
    expect(() =>
      assertJourneyCampaignJournalProof({
        journey: legacyJourney,
        questOutcomeIds: new Map(),
        journalEntries: [
          {
            id: `campaign_goal:${String(legacyJourney.goal.version)}:${legacyJourney.goal.id}`,
            kind: "campaign",
            title: legacyCopy.title,
            text: legacyCopy.text,
          },
        ],
      }),
    ).not.toThrow();
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
    ).toBeNull();
    expect(
      nextJourneyCampaignGoal({
        completedQuestIds: new Set([...COMPLETED_THROUGH_BREAKING_WEIR, "advocates_case"]),
      }),
    ).toBe(journeyCampaignGoalDefinition({ id: "greece_cold_forge" }));
    expect(
      nextJourneyCampaignGoal({
        completedQuestIds: new Set([...COMPLETED_THROUGH_BREAKING_WEIR, "cold_forge"]),
      }),
    ).toBe(journeyCampaignGoalDefinition({ id: "oswego_advocates_case" }));
    expect(
      nextJourneyCampaignGoal({
        completedQuestIds: new Set([
          ...COMPLETED_THROUGH_BREAKING_WEIR,
          "advocates_case",
          "cold_forge",
        ]),
      }),
    ).toMatchObject({ id: "amherst_dawn_beacon", targetQuestId: "dawn_beacon" });
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
    const legacyAwaiting = recordJourneyGoalCompleted(legacyActive);
    expect(
      journeyCampaignPresentationContext({
        journey: legacyAwaiting,
        questOutcomeIds: breakingWeirOutcomeIds("ending_held"),
      }),
    ).toMatchObject({
      completionContext: ROME_POST_WEIR_DISPATCH_CONTEXT,
      preRetentionTeaser: ROME_POST_WEIR_DISPATCH_TEASER,
      storyChoice: null,
    });
    expect(
      journeyCampaignPresentationContext({
        journey: chooseJourney(legacyAwaiting, "continue").state,
        questOutcomeIds: breakingWeirOutcomeIds("ending_held"),
      })?.storyChoice,
    ).toMatchObject({ id: ROME_POST_WEIR_DISPATCH_ID });
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
