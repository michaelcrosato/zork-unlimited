import {
  overworldContactTalkJournalId,
  type OverworldCharacter,
  type OverworldCharacterVariant,
  type OverworldCharacterView,
} from "./overworld.js";

export type OverworldContactPresentation = Readonly<{
  character: OverworldCharacter;
  contact: OverworldCharacterView;
  presentationId: string | null;
  journalId: string;
  afterQuestIds: readonly string[];
}>;

export type OverworldContactPresentationState = Readonly<{
  completedQuestIds: ReadonlySet<string>;
}>;

function contactView(
  character: OverworldCharacter,
  variant: OverworldCharacterVariant | null,
): OverworldCharacterView {
  const { variants: _variants, ...base } = character;
  return Object.freeze({
    ...base,
    ...(variant?.summary !== undefined ? { summary: variant.summary } : {}),
    ...(variant?.agenda !== undefined ? { agenda: variant.agenda } : {}),
  });
}

function presentation(
  character: OverworldCharacter,
  variant: OverworldCharacterVariant | null,
): OverworldContactPresentation {
  const presentationId = variant?.id ?? null;
  return Object.freeze({
    character,
    contact: contactView(character, variant),
    presentationId,
    journalId: overworldContactTalkJournalId(character.id, presentationId),
    afterQuestIds: Object.freeze([...(variant?.after_quests ?? [])]),
  });
}

/** Resolve the first authored contact variant whose monotonic quest proof is satisfied. */
export function presentOverworldContact(
  character: OverworldCharacter,
  state: OverworldContactPresentationState,
): OverworldContactPresentation {
  const variant =
    character.variants?.find((candidate) =>
      candidate.after_quests.every((questId) => state.completedQuestIds.has(questId)),
    ) ?? null;
  return presentation(character, variant);
}

/** Enumerate every stable journal-bound presentation for manifest and restore indexes. */
export function allOverworldContactPresentations(
  character: OverworldCharacter,
): readonly OverworldContactPresentation[] {
  return Object.freeze([
    presentation(character, null),
    ...(character.variants ?? []).map((variant) => presentation(character, variant)),
  ]);
}
