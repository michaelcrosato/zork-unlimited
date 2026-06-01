/**
 * Parser content schema (spec §7.3, Stage 2 — Zork-style).
 *
 * Authored in YAML, compiled to validated JSON. The Zod schema IS the contract:
 * anything that does not parse is rejected before it can be played (§7). Rooms,
 * objects, containers, locked doors, NPC dialogue trees, puzzles (object
 * interactions), and win conditions reuse the closed core condition/effect DSLs —
 * the engine interprets nothing beyond that vocabulary (§16).
 */
import { z } from "zod";
import { ConditionSchema } from "../core/conditions.js";
import { EffectSchema } from "../core/effects.js";

/** A directional exit. A locked exit lists `conditions`; until they hold it is
 *  hidden from the legal-action set, and an attempt surfaces `locked_msg`. */
export const ExitSchema = z
  .object({
    direction: z.string().min(1),
    to: z.string().min(1),
    conditions: z.array(ConditionSchema).default([]),
    locked_msg: z.string().min(1).optional(),
  })
  .strict();

/** A state-conditional room description (§7.3 reactive text). When all of `when`
 *  hold, this `text` replaces the room's base `description`, so a room can react
 *  to state it changed — a tied-off well, an opened gate — instead of
 *  contradicting it. Variants are first-match-wins in declared order. */
export const RoomVariantSchema = z
  .object({
    when: z.array(ConditionSchema).min(1),
    text: z.string().min(1),
  })
  .strict();

export const RoomSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    description: z.string().min(1),
    // Optional reactive descriptions; the first whose `when` holds wins, else
    // `description`. `.optional()` (not `.default([])`) so an absent field stays
    // absent in the compiled pack ⇒ packs that don't use it compile byte-identically
    // and their content hashes are unchanged (mirrors the Stage-4 skill_check rule).
    variants: z.array(RoomVariantSchema).optional(),
    objects: z.array(z.string().min(1)).default([]),
    exits: z.array(ExitSchema).default([]),
    on_enter: z.array(EffectSchema).default([]),
  })
  .strict();

/**
 * A seeded skill check (Stage 4, §13, §14 gate). When an interaction carries one,
 * the RPG runner rolls d20 + the named skill var against `difficulty` using the
 * step's deterministic PRNG, then applies `on_success` or `on_failure`. Optional
 * and absent on every Stage-2/3 pack, so those packs' content hashes are unchanged.
 */
export const SkillCheckSchema = z
  .object({
    skill: z.string().min(1), // the var rolled (e.g. "lockpicking", "might")
    difficulty: z.number().int(),
    on_success: z.array(EffectSchema).default([]),
    on_failure: z.array(EffectSchema).default([]),
  })
  .strict();

/** A puzzle step: a verb applied to a target (optionally with an item), gated by
 *  conditions, producing effects. The Stage-2 puzzle mechanic (§7.3). A Stage-4
 *  interaction may additionally carry a `skill_check` resolved by the RPG runner. */
export const InteractionSchema = z
  .object({
    verb: z.enum(["USE", "READ", "INSPECT", "OPEN", "CLOSE"]),
    item: z.string().min(1).optional(),
    target: z.string().min(1).optional(),
    conditions: z.array(ConditionSchema).default([]),
    effects: z.array(EffectSchema).default([]),
    skill_check: SkillCheckSchema.optional(),
  })
  .strict();

export const ObjectSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    aliases: z.array(z.string().min(1)).default([]),
    description: z.string().min(1),
    takeable: z.boolean().default(false),
    quest_critical: z.boolean().default(false),
    read_text: z.string().min(1).optional(), // READable signage/notes
    // Container facets.
    container: z.boolean().default(false),
    openable: z.boolean().default(false),
    locked: z.boolean().default(false),
    key_id: z.string().min(1).optional(),
    contents: z.array(z.string().min(1)).default([]),
    interactions: z.array(InteractionSchema).default([]),
  })
  .strict();

export const DialogueTopicSchema = z
  .object({
    id: z.string().min(1),
    prompt: z.string().min(1),
    goto: z.string().min(1).optional(),
    end: z.boolean().default(false),
  })
  .strict();

export const DialogueNodeSchema = z
  .object({
    id: z.string().min(1),
    npc_text: z.string().min(1),
    effects: z.array(EffectSchema).default([]),
    topics: z.array(DialogueTopicSchema).default([]),
  })
  .strict();

export const NpcSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    description: z.string().min(1),
    room: z.string().min(1), // which room the NPC stands in
    dialogue: z
      .object({
        root: z.string().min(1),
        nodes: z.array(DialogueNodeSchema).min(1),
      })
      .strict(),
  })
  .strict();

export const WinConditionSchema = z
  .object({
    id: z.string().min(1),
    conditions: z.array(ConditionSchema).min(1),
    ending: z.string().min(1),
  })
  .strict();

export const ParserEndingSchema = z
  .object({
    id: z.string().min(1),
    title: z.string().min(1),
    text: z.string().min(1),
    // Stage 3: a death/failure ending is terminal but non-winning; the player is
    // expected to recover via load (§13 Stage 3). Reached by an `end_game` effect.
    death: z.boolean().default(false),
  })
  .strict();

export const ParserMetaSchema = z
  .object({
    id: z.string().min(1),
    title: z.string().min(1),
    start_room: z.string().min(1),
    vars_init: z.record(z.string(), z.number()).default({}),
    flags_init: z.array(z.string()).default([]),
    // Stage 3: the maximum achievable score, tracked in the `score` var via
    // inc_var awards. 0 means the pack does not use scoring. The validator checks
    // that this target is actually reachable (§13 Stage 3).
    max_score: z.number().int().nonnegative().default(0),
  })
  .strict();

/** The conventional var that holds the player's score (§13 Stage 3). */
export const SCORE_VAR = "score";

export const ParserPackSchema = z
  .object({
    meta: ParserMetaSchema,
    rooms: z.array(RoomSchema).min(1),
    objects: z.array(ObjectSchema).default([]),
    npcs: z.array(NpcSchema).default([]),
    win_conditions: z.array(WinConditionSchema).min(1),
    endings: z.array(ParserEndingSchema).default([]),
  })
  .strict();

export type Exit = z.infer<typeof ExitSchema>;
export type RoomVariant = z.infer<typeof RoomVariantSchema>;
export type Room = z.infer<typeof RoomSchema>;
export type SkillCheck = z.infer<typeof SkillCheckSchema>;
export type Interaction = z.infer<typeof InteractionSchema>;
export type GameObject = z.infer<typeof ObjectSchema>;
export type DialogueTopic = z.infer<typeof DialogueTopicSchema>;
export type DialogueNode = z.infer<typeof DialogueNodeSchema>;
export type Npc = z.infer<typeof NpcSchema>;
export type WinCondition = z.infer<typeof WinConditionSchema>;
export type ParserEnding = z.infer<typeof ParserEndingSchema>;
export type ParserPack = z.infer<typeof ParserPackSchema>;
