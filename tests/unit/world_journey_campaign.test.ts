import { describe, expect, it } from "vitest";

import { compactJourneyPresentation } from "../../src/mcp/journey_projection.js";
import {
  ALBANY_DAWN_DISPATCH_CHOICE_IDS,
  ALBANY_DAWN_DISPATCH_CONTINUE_CONSEQUENCE_PREFIX,
  ALBANY_DAWN_DISPATCH_CONTINUE_LABEL,
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
  journeyPresentation,
  recordJourneyGoalCompleted,
  type JourneyContractSnapshot,
} from "../../src/world/journey_contract.js";

const EXPECTED_CONSEQUENCES: Readonly<
  Record<WolfWinterCampaignOutcome, Record<AlbanyDawnDispatchChoiceId, string>>
> = {
  pack_diverted: {
    send_wagon_to_cade:
      "The wagon repairs Cade's outer fence. His whole herd stays home, and the living pack stays in the high wood. You take Hedrick's packet north alone. Reward: one 15-minute Market resupply for taking Hedrick's packet alone.",
    send_wardens_north:
      "The wagon goes north. Cade keeps the whole herd behind a broken fence with no winter feed. The living pack stays in the high wood. Reward: one 15-minute Greenway rest for traveling with the wardens.",
  },
  pack_diverted_cattle_scattered: {
    send_wagon_to_cade:
      "The wagon repairs Cade's outer fence and searches for the two missing cattle. You take Hedrick's packet north alone. Reward: one 15-minute Market resupply for taking Hedrick's packet alone.",
    send_wardens_north:
      "The wagon goes north. Cade's outer fence remains broken, two cattle are missing, and the living pack stays in the high wood. Reward: one 15-minute Greenway rest for traveling with the wardens.",
  },
  pack_diverted_after_blood: {
    send_wagon_to_cade:
      "The wagon repairs Cade's outer fence and searches for the two missing cattle. The yearling wolf is dead; the other two live. You take Hedrick's packet north alone. Reward: one 15-minute Market resupply for taking Hedrick's packet alone.",
    send_wardens_north:
      "The wagon goes north. Cade's outer fence remains broken, and two cattle are missing. The yearling wolf is dead; the other two live in the high wood. Reward: one 15-minute Greenway rest for traveling with the wardens.",
  },
  bloodied_byre_evacuated: {
    send_wagon_to_cade:
      "The wagon helps the evacuees, searches for two missing cattle, and marks a safe boundary around the abandoned barn. Two wolves are dead; the old grey still holds the barn. You take Hedrick's packet north alone. Reward: one 15-minute Market resupply for taking Hedrick's packet alone.",
    send_wardens_north:
      "The wagon goes north. The evacuees remain safe, but two cattle are missing. Two wolves are dead, and the old grey remains in the abandoned barn. Reward: one 15-minute Greenway rest for traveling with the wardens.",
  },
  drive_cattle_wounded: {
    send_wagon_to_cade:
      "The wagon returns Cade's whole herd and repairs the abandoned outer boundary. All three wolves live outside it. Your gate wound is untreated, and the rig is in Albany for repair. You take Hedrick's packet north alone. Reward: one 15-minute Market resupply for taking Hedrick's packet alone.",
    send_wardens_north:
      "The wagon goes north. Cade and the whole herd remain on the evacuation road. All three wolves live beyond the abandoned boundary. Your gate wound is untreated, and the rig is in Albany for repair. Reward: one 15-minute Greenway rest for traveling with the wardens.",
  },
  drive_person_cattle_lost: {
    send_wagon_to_cade:
      "The wagon helps the evacuees search for the scattered herd and repair the abandoned boundary. All three wolves live outside it, and the rig is in Albany for repair. You take Hedrick's packet north alone. Reward: one 15-minute Market resupply for taking Hedrick's packet alone.",
    send_wardens_north:
      "The wagon goes north. The evacuees remain safe, but the herd is scattered. All three wolves live beyond the abandoned boundary, and the rig is in Albany for repair. Reward: one 15-minute Greenway rest for traveling with the wardens.",
  },
  drive_reserve_spent: {
    send_wagon_to_cade:
      "The wagon returns Cade's whole herd and repairs the abandoned boundary. All three wolves live outside it, and the destroyed rig is gone. You take Hedrick's packet north alone. Reward: one 15-minute Market resupply for taking Hedrick's packet alone.",
    send_wardens_north:
      "The wagon goes north. Cade and the whole herd remain safe on the evacuation road. All three wolves live beyond the abandoned boundary, and the destroyed rig is gone. Reward: one 15-minute Greenway rest for traveling with the wardens.",
  },
  fortified_cade_terms: {
    send_wagon_to_cade:
      "The wagon protects Cade's exposed outer property. His household and herd stay behind the shutters, and Albany's seals remain unused. You take Hedrick's packet north alone. Reward: one 15-minute Market resupply for taking Hedrick's packet alone.",
    send_wardens_north:
      "The wagon goes north. Cade's household and herd remain safe behind the shutters, but the outer property stays exposed. Albany's seals remain unused. Reward: one 15-minute Greenway rest for traveling with the wardens.",
  },
  fortified_albany_authority: {
    send_wagon_to_cade:
      "The wagon checks the outer property protected by Albany's boundary. Cade's household and herd remain safe, but the public seals are spent and his refusal stays recorded. You take Hedrick's packet north alone. Reward: one 15-minute Market resupply for taking Hedrick's packet alone.",
    send_wardens_north:
      "The wagon goes north. Cade's household, herd, and outer property remain safe behind Albany's boundary. The public seals are spent, and Cade refused to help. Reward: one 15-minute Greenway rest for traveling with the wardens.",
  },
  gate_barred: {
    send_wagon_to_cade:
      "The wagon repairs the outer fence. The inner-gate timber remains Cade's last barrier. You take Hedrick's packet north alone. Reward: one 15-minute Market resupply for taking Hedrick's packet alone.",
    send_wardens_north:
      "The wagon goes north. Cade keeps the cattle behind the barred inner gate, and the outer fence remains broken. Reward: one 15-minute Greenway rest for traveling with the wardens.",
  },
  timber_saved: {
    send_wagon_to_cade:
      "The wagon uses the saved timber to repair Cade's fence before night. You take Hedrick's packet north alone. Reward: one 15-minute Market resupply for taking Hedrick's packet alone.",
    send_wardens_north:
      "The wagon goes north. Cade uses the saved timber to begin the repair alone. Reward: one 15-minute Greenway rest for traveling with the wardens.",
  },
  held: {
    send_wagon_to_cade:
      "The wagon brings replacement timber and repairs Cade's outer fence. You take Hedrick's packet north alone. Reward: one 15-minute Market resupply for taking Hedrick's packet alone.",
    send_wardens_north:
      "The wagon goes north. Cade has no repair timber for the broken outer fence until another relief run. Reward: one 15-minute Greenway rest for traveling with the wardens.",
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
  it("maps all sixteen supported Wolf-Winter victories to truthful, distinct Albany returns", () => {
    const expected = [
      {
        endingId: "ending_pack_diverted",
        id: "pack_diverted",
        phrase: "whole herd survived, and all three wolves are alive",
      },
      {
        endingId: "ending_pack_diverted_cattle_scattered",
        id: "pack_diverted_cattle_scattered",
        phrase: "Two cattle are missing",
      },
      {
        endingId: "ending_pack_diverted_after_blood",
        id: "pack_diverted_after_blood",
        phrase: "The yearling wolf died",
      },
      {
        endingId: "ending_bloodied_byre_evacuated",
        id: "bloodied_byre_evacuated",
        phrase: "old grey still holds the abandoned barn",
      },
      {
        endingId: "ending_bloodied_byre_evacuated_june_released",
        id: "bloodied_byre_evacuated",
        phrase: "she returned separately",
      },
      {
        endingId: "ending_drive_cattle_wounded",
        id: "drive_cattle_wounded",
        phrase: "gate wound is untreated",
      },
      {
        endingId: "ending_drive_person_cattle_lost",
        id: "drive_person_cattle_lost",
        phrase: "the herd scattered",
      },
      {
        endingId: "ending_drive_reserve_spent",
        id: "drive_reserve_spent",
        phrase: "rig was destroyed",
      },
      {
        endingId: "ending_fortified_cade_terms",
        id: "fortified_cade_terms",
        phrase: "followed Cade's terms and returned Albany's seals",
      },
      {
        endingId: "ending_fortified_albany_authority",
        id: "fortified_albany_authority",
        phrase: "spent the public seals",
      },
      {
        endingId: "ending_held_gate_barred",
        id: "gate_barred",
        phrase: "barred inner gate",
      },
      {
        endingId: "ending_held_gate_barred_june_released",
        id: "gate_barred",
        phrase: "she returned separately",
      },
      {
        endingId: "ending_held_timber_saved",
        id: "timber_saved",
        phrase: "timber you saved",
      },
      {
        endingId: "ending_held_timber_saved_june_released",
        id: "timber_saved",
        phrase: "she returned separately",
      },
      {
        endingId: "ending_held",
        id: "held",
        phrase: "fight used the guard wood",
      },
      {
        endingId: "ending_held_june_released",
        id: "held",
        phrase: "she returned separately",
      },
    ] as const;

    const returnContexts = new Set<string>();
    for (const row of expected) {
      const outcome = wolfWinterCampaignOutcome(outcomeIds(row.endingId));
      expect(outcome).toMatchObject({ id: row.id, endingId: row.endingId });
      expect(outcome?.albanyReturnContext).toContain(row.phrase);
      returnContexts.add(outcome!.albanyReturnContext);
    }
    expect(returnContexts.size).toBe(16);
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
        completionTruth: "whole herd survived",
        consequenceTruths: [/whole herd/i],
        forbidden: /cattle (?:are )?still missing/i,
      },
      {
        endingId: "ending_pack_diverted_cattle_scattered",
        completionTruth: "Two cattle are missing",
        consequenceTruths: [/two missing cattle|two cattle are missing/i],
        forbidden: /whole herd/i,
      },
      {
        endingId: "ending_pack_diverted_after_blood",
        completionTruth: "The yearling wolf died",
        consequenceTruths: [/yearling wolf is dead/i, /two missing cattle|two cattle are missing/i],
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

  it("carries the bloodied byre evacuation through continue without rewriting it as a win", () => {
    const questOutcomeIds = outcomeIds("ending_bloodied_byre_evacuated");
    expect(() =>
      assertJourneyCampaignQuestOutcome("wolf_winter", "ending_bloodied_byre_evacuated"),
    ).not.toThrow();

    const beforeContinue = journeyCampaignPresentationContext({
      journey: awaitingInitialGoalChoice(),
      questOutcomeIds,
    });
    expect(beforeContinue?.completionContext).toMatch(/yearling and flank wolf died/i);
    expect(beforeContinue?.completionContext).toMatch(/old grey still holds/i);
    expect(beforeContinue?.completionContext).toMatch(/two cattle are missing/i);
    expect(beforeContinue?.completionContext).not.toMatch(
      /byre (?:was |is )?held|pack (?:was )?diverted|all three wolves/i,
    );

    const afterContinue = journeyCampaignPresentationContext({
      journey: chooseJourney(awaitingInitialGoalChoice(), "continue").state,
      questOutcomeIds,
    });
    for (const option of afterContinue?.storyChoice?.options ?? []) {
      expect(option.consequence).toMatch(/two wolves are dead/i);
      expect(option.consequence).toMatch(/old grey/i);
      expect(option.consequence).toMatch(/two missing cattle|two cattle are missing/i);
      expect(option.consequence).not.toMatch(/byre (?:was |is )?held|pack (?:was )?diverted/i);
    }
  });

  it("carries every drive evacuation outcome through continue without erasing its crisis cost", () => {
    const expected = [
      {
        endingId: "ending_drive_cattle_wounded",
        completionTruth: /whole herd.*gate wound is untreated/i,
        consequenceTruths: [/whole herd/i, /gate wound is untreated/i],
        forbidden: /herd (?:remains )?scattered|rig did not return/i,
      },
      {
        endingId: "ending_drive_person_cattle_lost",
        completionTruth: /herd scattered/i,
        consequenceTruths: [/herd is scattered|search for the scattered herd/i],
        forbidden: /whole herd|gate wound|rig did not return/i,
      },
      {
        endingId: "ending_drive_reserve_spent",
        completionTruth: /rig was destroyed/i,
        consequenceTruths: [/whole herd/i, /destroyed rig is gone/i],
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
          /followed Cade's terms/i,
          /returned Albany's seals/i,
          /outer property remained exposed/i,
        ],
        consequenceTruths: [
          /household/i,
          /herd/i,
          /shutters/i,
          /outer property/i,
          /exposed/i,
          /Albany's seals/i,
          /unused|reserve/i,
        ],
        forbidden: /authority|seals (?:were|are) spent|Cade refused/i,
      },
      {
        endingId: "ending_fortified_albany_authority",
        completionTruths: [
          /Albany's sealed boundary/i,
          /spent the public seals/i,
          /Cade refused to help under Albany's order/i,
        ],
        consequenceTruths: [
          /household/i,
          /herd/i,
          /outer property/i,
          /seal/i,
          /public seals/i,
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
        phrase: "winter grain survived",
      },
      {
        endingId: "ending_race_held_fields_given",
        id: "race_held_fields_given",
        phrase: "lost their winter grain",
      },
      {
        endingId: "ending_held",
        id: "held",
        phrase: "relief channel carried the flood",
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
      expect(context?.preRetentionTeaser).toContain("Hayden");
      expect(context?.preRetentionTeaser).toContain("one dawn relief wagon");
      expect(context?.preRetentionTeaser).toContain("Hedrick Cradoc's father");
      expect(context?.preRetentionTeaser).toContain("old grey sow");
      expect(context?.continueLabel).toBe(ALBANY_DAWN_DISPATCH_CONTINUE_LABEL);
      expect(context?.continueLabel).toBe(
        "Continue: decide the dawn wagon, then take the Gallowmere lead",
      );
      expect(context?.continueConsequencePrefix).toBe(
        ALBANY_DAWN_DISPATCH_CONTINUE_CONSEQUENCE_PREFIX,
      );
      expect(context?.continueConsequencePrefix).toBe(
        "Assign Albany's only dawn relief wagon. Then find Hedrick in Queensbury and complete The Gallowmere.",
      );
      expect(context?.storyChoice).toBeNull();
      expect(context?.continuationPreview).toEqual(
        albanyDawnDispatchStoryChoice(Object.values(WOLF_WINTER_CAMPAIGN_OUTCOMES)[index]!),
      );
      if (!context?.continuationPreview) throw new Error("Expected Albany dispatch preview.");
      const full = journeyPresentation(journey, {
        goalCompletion: {
          goalVersion: journey.goal.version,
          goalId: journey.goal.id,
          messagePrefix: context.completionContext,
          ...(context.preRetentionTeaser ? { messageSuffix: context.preRetentionTeaser } : {}),
          ...(context.continueLabel ? { continueLabel: context.continueLabel } : {}),
          ...(context.continueConsequencePrefix
            ? { continueConsequencePrefix: context.continueConsequencePrefix }
            : {}),
          continuationPreview: context.continuationPreview,
        },
      });
      const compact = compactJourneyPresentation(full);
      expect(full.pendingChoice?.continuationPreview).toEqual(context.continuationPreview);
      expect(compact.pendingChoice?.continuationPreview).toEqual(
        full.pendingChoice?.continuationPreview,
      );
      expect(compact.pendingChoice?.options.map((option) => option.id)).toEqual([
        "continue",
        "end",
      ]);
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
    expect(context?.completionContext).toContain("barred inner gate");
    expect(context?.preRetentionTeaser).toBeNull();
    expect(context?.continueLabel).toBeUndefined();
    expect(context?.continueConsequencePrefix).toBeNull();
    expect(context?.storyChoice).toMatchObject({
      id: "albany_dawn_dispatch",
      message:
        "Wolf-Winter is complete. Send Albany's only dawn relief wagon to Cade or north with the wardens. Your next goal is The Gallowmere in Queensbury.",
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
    expect(goals[0]?.text).toContain("Take Hayden's packet");
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
    expect(beforeRetention?.preRetentionTeaser).toContain("next report to Rome");
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
      "correction remains private",
    );
    expect(TANNERS_FEVER_ACCOUNTABILITY_GOALS.publish_dosage_warning.text).toContain(
      "warning is public",
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
          message: "Choose the next report: Oswego's charter case or Greece's cold forge.",
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
        title: "New goal",
        text: legacyGoal!.text,
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
    expect(
      journeyCampaignGoalIsComplete(INITIAL_JOURNEY_CAMPAIGN_GOAL, new Set(["gallowmere"])),
    ).toBe(false);
    expect(
      journeyCampaignGoalIsComplete(INITIAL_JOURNEY_CAMPAIGN_GOAL, new Set(["wolf_winter"])),
    ).toBe(true);
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

    const historicalText = {
      ...branchActive,
      goal: { ...branchActive.goal, text: "An earlier campaign objective." },
    };
    expect(() =>
      assertJourneyCampaignGoalCompletionProof({
        journey: historicalText,
        completedQuestIds: new Set(["wolf_winter"]),
        startTownId: "albany_city",
      }),
    ).not.toThrow();
  });
});
