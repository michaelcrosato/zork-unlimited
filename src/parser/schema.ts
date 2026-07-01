/**
 * Legacy parser schema compatibility shim.
 *
 * The canonical text-RPG content contract lives in `src/rpg/schema.ts`. Parser
 * packs keep their historical import names while sharing the RPG schemas for
 * rooms, objects, interactions, dialogue, win conditions, endings, scoring, and
 * skill checks. Parser-specific pack parsing remains strict: no RPG enemies and
 * no RPG combat metadata are accepted through `ParserPackSchema`.
 */
import { z } from "zod";
import { EndingSchema, EndingVariantSchema, RpgMetaSchema, RpgPackSchema } from "../rpg/schema.js";
import type { Ending, EndingVariant } from "../rpg/schema.js";

export {
  BUILTIN_VERBS,
  DialogueNodeSchema,
  DialogueNodeVariantSchema,
  DialogueTopicSchema,
  ExitSchema,
  InteractionSchema,
  NpcSchema,
  ObjectSchema,
  ObjectVariantSchema,
  RoomSchema,
  RoomVariantSchema,
  SCORE_VAR,
  SkillCheckSchema,
  WinConditionSchema,
} from "../rpg/schema.js";

export const ParserEndingVariantSchema = EndingVariantSchema;
export const ParserEndingSchema = EndingSchema;
export const ParserMetaSchema = RpgMetaSchema.omit({ combat_guaranteed: true }).strict();
export const ParserPackSchema = RpgPackSchema.omit({ enemies: true })
  .extend({
    meta: ParserMetaSchema,
    endings: z.array(ParserEndingSchema).default([]),
  })
  .strict();

export type {
  DialogueNode,
  DialogueNodeVariant,
  DialogueTopic,
  Exit,
  GameObject,
  Interaction,
  Npc,
  ObjectVariant,
  Room,
  RoomVariant,
  SkillCheck,
  WinCondition,
} from "../rpg/schema.js";

export type ParserEndingVariant = EndingVariant;
export type ParserEnding = Ending;
export type ParserPack = z.infer<typeof ParserPackSchema>;
