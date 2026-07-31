import { describe, expect, it } from "vitest";

import { applyOpeningAllyOption } from "../../src/world/opening_ally.js";
import { replayOpeningDispatchChoices } from "../../src/world/opening_dispatch_choice_replay.js";
import { applyOpeningPreparationProfile } from "../../src/world/opening_preparation.js";
import { applyOpeningReliefAllocationOption } from "../../src/world/opening_relief_allocation.js";
import { serializeCampaignCharacterState } from "../../src/world/campaign_character_state.js";
import { loadOverworldManifest } from "../../src/world/source.js";

const WORLD = loadOverworldManifest(process.cwd());
const PREPARATION = WORLD.opening_preparation!;
const ALLOCATION = WORLD.opening_relief_allocation!;
const ALLY = WORLD.opening_ally!;
const BASE = WORLD.opening_registration!.profiles[0]!.character;

const CHOICES = [
  {
    kind: "ally" as const,
    journalIndex: 1,
    scene: ALLY,
    optionId: ALLY.options[0]!.id,
  },
  {
    kind: "preparation" as const,
    journalIndex: 5,
    scene: PREPARATION,
    optionId: PREPARATION.profiles[0]!.id,
  },
  {
    kind: "relief_allocation" as const,
    journalIndex: 3,
    scene: ALLOCATION,
    optionId: ALLOCATION.options[0]!.id,
  },
] as const;

describe("opening dispatch choice replay", () => {
  it("replays newest-first journal indexes in their actual oldest-to-newest order", () => {
    const afterPreparation = applyOpeningPreparationProfile({
      scene: PREPARATION,
      character: BASE,
      profileId: PREPARATION.profiles[0]!.id,
    }).characterAfter;
    const afterAllocation = applyOpeningReliefAllocationOption({
      scene: ALLOCATION,
      character: afterPreparation,
      optionId: ALLOCATION.options[0]!.id,
    }).characterAfter;
    const expected = applyOpeningAllyOption({
      scene: ALLY,
      character: afterAllocation,
      optionId: ALLY.options[0]!.id,
    }).characterAfter;

    expect(
      serializeCampaignCharacterState(
        replayOpeningDispatchChoices({
          characterAfterSource: BASE,
          choices: CHOICES,
        }),
      ),
    ).toBe(serializeCampaignCharacterState(expected));
  });

  it("cuts replay off at an offer boundary and rejects duplicate or invalid spokes", () => {
    const expected = applyOpeningPreparationProfile({
      scene: PREPARATION,
      character: BASE,
      profileId: PREPARATION.profiles[0]!.id,
    }).characterAfter;
    expect(
      serializeCampaignCharacterState(
        replayOpeningDispatchChoices({
          characterAfterSource: BASE,
          choices: CHOICES,
          beforeJournalIndex: 3,
        }),
      ),
    ).toBe(serializeCampaignCharacterState(expected));

    expect(() =>
      replayOpeningDispatchChoices({
        characterAfterSource: BASE,
        choices: [CHOICES[1], { ...CHOICES[1], journalIndex: 4 }],
      }),
    ).toThrow(/duplicate preparation/i);
    expect(() =>
      replayOpeningDispatchChoices({
        characterAfterSource: BASE,
        choices: [{ ...CHOICES[1], journalIndex: -1 }],
      }),
    ).toThrow(/invalid journal index/i);
  });
});
