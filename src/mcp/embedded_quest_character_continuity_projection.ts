import {
  COMPACT_EMBEDDED_QUEST_CHARACTER_CONTINUITY_LEGEND,
  cloneEmbeddedQuestCharacterContinuity,
  compactEmbeddedQuestCharacterContinuity,
  type CompactEmbeddedQuestCharacterContinuity,
  type EmbeddedQuestCharacterContinuity,
} from "../rpg/embedded_quest_character_continuity.js";
import type { RpgViewOptions } from "./rpg_view_projection.js";
import type { Session } from "./sessions.js";

export type EmbeddedQuestCharacterContinuityField<Args extends RpgViewOptions> = Args extends {
  compact_observation: true;
}
  ? {
      character_continuity?: CompactEmbeddedQuestCharacterContinuity;
      character_continuity_legend?: typeof COMPACT_EMBEDDED_QUEST_CHARACTER_CONTINUITY_LEGEND;
    }
  : { character_continuity?: EmbeddedQuestCharacterContinuity };

export function embeddedQuestCharacterContinuityField<Args extends RpgViewOptions>(
  session: Pick<Session, "embeddedCharacterContinuity">,
  args: Args,
): EmbeddedQuestCharacterContinuityField<Args> {
  const continuity = session.embeddedCharacterContinuity;
  if (!continuity) return {} as EmbeddedQuestCharacterContinuityField<Args>;
  if (args.compact_observation === true) {
    return {
      character_continuity: compactEmbeddedQuestCharacterContinuity(continuity),
      character_continuity_legend: COMPACT_EMBEDDED_QUEST_CHARACTER_CONTINUITY_LEGEND,
    } as EmbeddedQuestCharacterContinuityField<Args>;
  }
  return {
    character_continuity: cloneEmbeddedQuestCharacterContinuity(continuity),
  } as EmbeddedQuestCharacterContinuityField<Args>;
}
