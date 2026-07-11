/**
 * RPG content schema.
 *
 * This file intentionally owns the full RPG pack contract instead of extending
 * the legacy parser schema. The shape is still compatible with existing packs,
 * but the RPG mode now has a standalone schema surface that can keep evolving
 * after parser/CYOA code is removed.
 */
import { z } from "zod";
import { ConditionSchema } from "../core/conditions.js";
import { EffectSchema } from "../core/effects.js";
import { SkillCheckSchema } from "../core/skill_check.js";
import { WorldBindingSchema } from "../world/schema.js";

export const SCORE_VAR = "score";
export const HP_VAR = "hp";
export const ATTACK_VAR = "attack";
export const DEFENSE_VAR = "defense";

export const ExitSchema = z
  .object({
    direction: z.string().min(1),
    to: z.string().min(1),
    conditions: z.array(ConditionSchema).default([]),
    locked_msg: z.string().min(1).optional(),
  })
  .strict();

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
    variants: z.array(RoomVariantSchema).optional(),
    objects: z.array(z.string().min(1)).default([]),
    exits: z.array(ExitSchema).default([]),
    on_enter: z.array(EffectSchema).default([]),
  })
  .strict();

export const BUILTIN_VERBS: ReadonlySet<string> = new Set([
  "look",
  "l",
  "examine",
  "x",
  "inspect",
  "read",
  "go",
  "move",
  "take",
  "get",
  "grab",
  "drop",
  "open",
  "close",
  "unlock",
  "use",
  "talk",
  "inventory",
  "inv",
  "i",
  "north",
  "n",
  "south",
  "s",
  "east",
  "e",
  "west",
  "w",
  "up",
  "u",
  "down",
  "d",
  "ask",
  "say",
  "topic",
  "bye",
  "goodbye",
  "leave",
]);

/** A puzzle step: a verb applied to a target (optionally with an item), gated by
 *  conditions, producing effects. The Stage-2 puzzle mechanic (§7.3). A Stage-4
 *  interaction may additionally carry a `skill_check` resolved by the runner —
 *  base `effects` fire first, then the roll's on_success/on_failure (CYOA order).
 *  Verb semantics (every admitted verb is runtime-reachable):
 *    USE     — fires on `use item on target` / `use target` (self-use);
 *    READ    — fires on `read target`, merged with `read_text`;
 *    INSPECT — fires on `look at target`, per-interaction gated, composing after
 *              the base description (a one-shot clue retires itself without
 *              retiring examine);
 *    OPEN    — fires on an open ATTEMPT (not-yet-open target), even on a
 *              non-openable or locked object (warning/trap shapes), after the
 *              built-in open when the object really opens;
 *    CLOSE   — fires on closing an OPEN object, after the built-in
 *              `close_object` when it is openable. */
export const InteractionSchema = z
  .object({
    verb: z.enum(["USE", "READ", "INSPECT", "OPEN", "CLOSE"]),
    item: z.string().min(1).optional(),
    target: z.string().min(1).optional(),
    conditions: z.array(ConditionSchema).default([]),
    effects: z.array(EffectSchema).default([]),
    skill_check: SkillCheckSchema.optional(),
    command_verb: z
      .string()
      .regex(/^[a-z]+$/, "command_verb must be a single lowercase word")
      .optional(),
    command_template: z.string().min(1).optional(),
  })
  .strict()
  .superRefine((it, ctx) => {
    if (it.command_verb !== undefined) {
      if (it.verb !== "USE" || it.target === undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["command_verb"],
          message: "command_verb is only valid on a USE interaction with a target",
        });
      } else if (BUILTIN_VERBS.has(it.command_verb)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["command_verb"],
          message: `command_verb "${it.command_verb}" shadows a built-in RPG command verb`,
        });
      }
    }

    if (it.command_template !== undefined) {
      if (it.command_verb === undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["command_template"],
          message: "command_template requires a command_verb",
        });
      } else if (it.command_template.trim().split(/\s+/)[0] !== it.command_verb) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["command_template"],
          message:
            "command_template must begin with command_verb (the displayed command's first word is the RPG command resolver key)",
        });
      }
      if (it.item !== undefined && it.item === it.target) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["command_template"],
          message:
            'command_template is only for an item-on-target USE (item !== target); a self-USE shows a single noun (e.g. "drink phial")',
        });
      }
      if (it.item === undefined || it.target === undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["command_template"],
          message: "command_template requires both an item and a target",
        });
      } else if (
        !it.command_template.includes("{item}") ||
        !it.command_template.includes("{target}")
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["command_template"],
          message: "command_template must contain both {item} and {target} placeholders",
        });
      }
    }
  });

export const ObjectVariantSchema = z
  .object({
    when: z.array(ConditionSchema).min(1),
    text: z.string().min(1),
    name: z.string().min(1).optional(),
  })
  .strict();

export const ObjectSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    aliases: z.array(z.string().min(1)).default([]),
    description: z.string().min(1),
    visible_when: z.array(ConditionSchema).min(1).optional(),
    variants: z.array(ObjectVariantSchema).optional(),
    takeable: z.boolean().default(false),
    droppable: z.boolean().optional(),
    held: z.boolean().optional(),
    quest_critical: z.boolean().default(false),
    read_text: z.string().min(1).optional(),
    container: z.boolean().default(false),
    openable: z.boolean().default(false),
    locked: z.boolean().default(false),
    key_id: z.string().min(1).optional(),
    unlock_narrate: z.string().min(1).optional(),
    unlock_effects: z.array(EffectSchema).optional(),
    take_effects: z.array(EffectSchema).optional(),
    contents: z.array(z.string().min(1)).default([]),
    interactions: z.array(InteractionSchema).default([]),
  })
  .strict()
  .superRefine((o, ctx) => {
    if (
      (o.unlock_narrate !== undefined || o.unlock_effects !== undefined) &&
      o.key_id === undefined
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["unlock_effects"],
        message:
          "unlock_narrate/unlock_effects require a key_id (they fire on the first-class UNLOCK)",
      });
    }
    if (o.take_effects !== undefined && !o.takeable) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["take_effects"],
        message: "take_effects require takeable: true (they fire on the first-class TAKE)",
      });
    }
    if (o.held && o.takeable) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["held"],
        message: "a held object is already carried and must not also be takeable",
      });
    }
  });

export const DialogueTopicSchema = z
  .object({
    id: z.string().min(1),
    aliases: z.array(z.string().min(1)).optional(),
    prompt: z.string().min(1),
    conditions: z.array(ConditionSchema).optional(),
    goto: z.string().min(1).optional(),
    end: z.boolean().default(false),
  })
  .strict();

export const DialogueNodeVariantSchema = z
  .object({
    when: z.array(ConditionSchema).min(1),
    text: z.string().min(1),
  })
  .strict();

export const DialogueNodeSchema = z
  .object({
    id: z.string().min(1),
    npc_text: z.string().min(1),
    variants: z.array(DialogueNodeVariantSchema).optional(),
    effects: z.array(EffectSchema).default([]),
    topics: z.array(DialogueTopicSchema).default([]),
  })
  .strict();

export const NpcSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    description: z.string().min(1),
    room: z.string().min(1),
    conditions: z.array(ConditionSchema).optional(),
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

export const EndingVariantSchema = z
  .object({
    when: z.array(ConditionSchema).min(1),
    text: z.string().min(1),
  })
  .strict();

export const EndingSchema = z
  .object({
    id: z.string().min(1),
    title: z.string().min(1),
    text: z.string().min(1),
    variants: z.array(EndingVariantSchema).optional(),
    death: z.boolean().default(false),
  })
  .strict();

/**
 * A named, one-shot combat opening against one enemy. The bonuses alter only
 * the combat round produced by the MANEUVER action; they never mutate the
 * player's persistent attack/defense vars. `result_flag` is set after the
 * maneuver is committed and is also the automatic retirement gate for its
 * opening or follow-through cohort. `after`, when present, names a root opening
 * whose surviving target exposes this maneuver on the next combat beat.
 *
 * This field is optional on EnemySchema (with no default) so compiling every
 * pre-maneuver pack produces the exact same object shape and content hash.
 */
export const EnemyManeuverSchema = z
  .object({
    id: z.string().min(1),
    command: z.string().min(1),
    // Optional same-enemy root maneuver id. Omitted maneuvers remain the
    // mutually-exclusive opening cohort; one shallow child layer supplies a
    // named follow-through without adding mutable combat-phase state.
    after: z.string().min(1).optional(),
    conditions: z.array(ConditionSchema),
    result_flag: z.string().min(1),
    attack_bonus: z.number().int(),
    defense_bonus: z.number().int(),
    narration: z.string().min(1),
  })
  .strict()
  .superRefine((maneuver, ctx) => {
    if (maneuver.attack_bonus === 0 && maneuver.defense_bonus === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["attack_bonus"],
        message: "a maneuver must change attack_bonus or defense_bonus (both cannot be zero)",
      });
    }
  });

export const EnemySchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    description: z.string().min(1),
    room: z.string().min(1),
    conditions: z.array(ConditionSchema).optional(),
    hp: z.number().int().positive(),
    attack: z.number().int().nonnegative(),
    defense: z.number().int().nonnegative(),
    defeat_flag: z.string().min(1).optional(),
    death_ending: z.string().min(1),
    on_defeat: z.array(EffectSchema).default([]),
    maneuvers: z.array(EnemyManeuverSchema).min(1).optional(),
  })
  .strict();

export const RpgMetaSchema = z
  .object({
    id: z.string().min(1),
    title: z.string().min(1),
    world: WorldBindingSchema.optional(),
    start_room: z.string().min(1),
    vars_init: z.record(z.string(), z.number().finite()).default({}),
    flags_init: z.array(z.string()).default([]),
    max_score: z.number().int().nonnegative().default(0),
    combat_guaranteed: z.boolean().optional(),
  })
  .strict();

export const RpgPackSchema = z
  .object({
    meta: RpgMetaSchema,
    rooms: z.array(RoomSchema).min(1),
    objects: z.array(ObjectSchema).default([]),
    npcs: z.array(NpcSchema).default([]),
    win_conditions: z.array(WinConditionSchema).min(1),
    endings: z.array(EndingSchema).default([]),
    enemies: z.array(EnemySchema).default([]),
  })
  .strict();

export type Exit = z.infer<typeof ExitSchema>;
export type RoomVariant = z.infer<typeof RoomVariantSchema>;
export type Room = z.infer<typeof RoomSchema>;
export type SkillCheck = z.infer<typeof SkillCheckSchema>;
export type Interaction = z.infer<typeof InteractionSchema>;
export type ObjectVariant = z.infer<typeof ObjectVariantSchema>;
export type GameObject = z.infer<typeof ObjectSchema>;
export type DialogueTopic = z.infer<typeof DialogueTopicSchema>;
export type DialogueNodeVariant = z.infer<typeof DialogueNodeVariantSchema>;
export type DialogueNode = z.infer<typeof DialogueNodeSchema>;
export type Npc = z.infer<typeof NpcSchema>;
export type WinCondition = z.infer<typeof WinConditionSchema>;
export type EndingVariant = z.infer<typeof EndingVariantSchema>;
export type Ending = z.infer<typeof EndingSchema>;
export type EnemyManeuver = z.infer<typeof EnemyManeuverSchema>;
export type Enemy = z.infer<typeof EnemySchema>;
export type RpgPack = z.infer<typeof RpgPackSchema>;

export { SkillCheckSchema };

/** Internal var holding an enemy's remaining HP. */
export function enemyHpVar(enemyId: string): string {
  return `__enemy_hp_${enemyId}`;
}
