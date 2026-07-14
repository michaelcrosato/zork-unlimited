import { z } from "zod";

const CAMPAIGN_STORY_CHOICE_ID_PATTERN = /^[a-z][a-z0-9_]*$/;

export const CampaignStoryChoiceRefSchema = z
  .object({
    story_choice_id: z.string().min(1).max(96).regex(CAMPAIGN_STORY_CHOICE_ID_PATTERN),
    choice_id: z.string().min(1).max(96).regex(CAMPAIGN_STORY_CHOICE_ID_PATTERN),
  })
  .strict();

export type CampaignStoryChoiceRef = z.infer<typeof CampaignStoryChoiceRefSchema>;

/** Stable semantic identity shared by live rule matching and snapshot replay. */
export function campaignStoryChoiceRefKey(ref: CampaignStoryChoiceRef): string {
  const parsed = CampaignStoryChoiceRefSchema.parse(ref);
  return JSON.stringify([parsed.story_choice_id, parsed.choice_id]);
}
