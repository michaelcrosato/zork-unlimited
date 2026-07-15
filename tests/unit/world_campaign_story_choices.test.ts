import { describe, expect, it } from "vitest";

import {
  CampaignStoryChoiceRefSchema,
  campaignStoryChoiceRefKey,
} from "../../src/world/campaign_story_choices.js";

describe("campaign story-choice references", () => {
  it("accepts legacy journey ids and persistent namespaced content ids", () => {
    expect(
      CampaignStoryChoiceRefSchema.parse({
        story_choice_id: "albany_dawn_dispatch",
        choice_id: "send_wagon_to_cade",
      }),
    ).toEqual({
      story_choice_id: "albany_dawn_dispatch",
      choice_id: "send_wagon_to_cade",
    });

    const preparation = CampaignStoryChoiceRefSchema.parse({
      story_choice_id: "albany:wolf_preparation",
      choice_id: "albany:prep_works_fortification",
    });
    expect(campaignStoryChoiceRefKey(preparation)).toBe(
      '["albany:wolf_preparation","albany:prep_works_fortification"]',
    );
  });

  it("rejects empty namespace segments and presentation text", () => {
    for (const story_choice_id of ["albany::wolf", ":albany", "Albany:wolf", "albany wolf"]) {
      expect(() =>
        CampaignStoryChoiceRefSchema.parse({
          story_choice_id,
          choice_id: "valid_choice",
        }),
      ).toThrow();
    }
  });
});
