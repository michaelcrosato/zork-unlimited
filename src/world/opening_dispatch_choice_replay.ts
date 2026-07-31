import {
  cloneCampaignCharacterState,
  type CampaignCharacterState,
} from "./campaign_character_state.js";
import { applyOpeningAllyOption, type OpeningAlly } from "./opening_ally.js";
import { applyOpeningPreparationProfile, type OpeningPreparation } from "./opening_preparation.js";
import {
  applyOpeningReliefAllocationOption,
  type OpeningReliefAllocation,
} from "./opening_relief_allocation.js";

export type OpeningDispatchReplayChoice = Readonly<
  | {
      kind: "preparation";
      journalIndex: number;
      scene: OpeningPreparation;
      optionId: string;
    }
  | {
      kind: "relief_allocation";
      journalIndex: number;
      scene: OpeningReliefAllocation;
      optionId: string;
    }
  | {
      kind: "ally";
      journalIndex: number;
      scene: OpeningAlly;
      optionId: string;
    }
>;

/**
 * Replay selected Station support in the journal's real chronology. Journal
 * entries are newest-first, so descending indexes are oldest-to-newest. A
 * boundary index limits replay to choices that already existed before that
 * journal entry; this lets every offer validate against its actual character
 * state without reintroducing a preparation-first dependency.
 */
export function replayOpeningDispatchChoices(args: {
  characterAfterSource: CampaignCharacterState;
  choices: readonly OpeningDispatchReplayChoice[];
  beforeJournalIndex?: number;
}): CampaignCharacterState {
  const seenKinds = new Set<OpeningDispatchReplayChoice["kind"]>();
  const choices = args.choices
    .filter(
      (choice) =>
        args.beforeJournalIndex === undefined || choice.journalIndex > args.beforeJournalIndex,
    )
    .sort((left, right) => right.journalIndex - left.journalIndex);
  let character = cloneCampaignCharacterState(args.characterAfterSource);

  for (const choice of choices) {
    if (!Number.isSafeInteger(choice.journalIndex) || choice.journalIndex < 0) {
      throw new Error("Opening dispatch replay received an invalid journal index.");
    }
    if (seenKinds.has(choice.kind)) {
      throw new Error(`Opening dispatch replay received duplicate ${choice.kind} choices.`);
    }
    seenKinds.add(choice.kind);
    if (choice.kind === "preparation") {
      character = applyOpeningPreparationProfile({
        scene: choice.scene,
        character,
        profileId: choice.optionId,
      }).characterAfter;
    } else if (choice.kind === "relief_allocation") {
      character = applyOpeningReliefAllocationOption({
        scene: choice.scene,
        character,
        optionId: choice.optionId,
      }).characterAfter;
    } else {
      character = applyOpeningAllyOption({
        scene: choice.scene,
        character,
        optionId: choice.optionId,
      }).characterAfter;
    }
  }

  return cloneCampaignCharacterState(character);
}
