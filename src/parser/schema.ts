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

/**
 * Verbs the controlled command parser already owns (command_map.ts). A custom
 * interaction `command_verb` may NOT shadow one of these: the parser's builtin
 * `switch` would intercept the word first, so the custom self-USE would be
 * unreachable by that verb. Kept here (data, no imports) so the schema can reject
 * a shadowing verb at validate time. KEEP IN SYNC with command_map.ts's verbs.
 */
export const BUILTIN_VERBS: ReadonlySet<string> = new Set([
  // object/movement verbs + their short forms
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
  // directions (bare-direction movement)
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
  // dialogue-mode verbs
  "ask",
  "say",
  "topic",
  "bye",
  "goodbye",
  "leave",
]);

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
    // Optional natural verb for a USE puzzle, so the offered + typed command matches
    // the verb the prose primes. It covers two shapes:
    //   - a self-targeted USE (the "consume this thing" pattern — drink the phial,
    //     eat the bread): the command reads "<command_verb> <obj>" ("drink phial");
    //   - an item-on-target USE (the tool-on-thing pattern — tie the rope to the
    //     well, lever the slab with the bar): the command reads via `command_template`
    //     ("tie {item} to {target}", "lever {target} with {item}"), so both the verb
    //     AND the word order/preposition match the prose, instead of the generic
    //     "use <item> on <target>".
    // When set, the controlled command parser ALSO accepts the natural phrasing
    // ("drink phial", "tie rope to well", "lever slab with bar") in addition to the
    // generic "use" form, which always still works. The action id is unchanged
    // (`use_<obj>` / `use_<item>_on_<target>`) — verb-agnostic and stable. A single
    // lowercase word that may not shadow a builtin parser verb (enforced below).
    // `.optional()` (not a default) so an absent field stays absent in the compiled
    // pack ⇒ packs that don't use it compile byte-identically and keep their content
    // hashes (mirrors variants / skill_check / dialogue-topic conditions).
    command_verb: z
      .string()
      .regex(/^[a-z]+$/, "command_verb must be a single lowercase word")
      .optional(),
    // Display phrasing for an item-on-target USE's natural command, with `{item}`
    // and `{target}` placeholders filled by the object names — e.g. "tie {item} to
    // {target}" or "lever {target} with {item}". Only meaningful alongside a
    // `command_verb` on a non-self USE; it sets only the DISPLAYED string, never the
    // action id. The parser resolves the natural command order-independently (the two
    // nouns + any preposition), so the template is presentation, not grammar. Must
    // begin with `command_verb` and contain both placeholders (enforced below).
    // `.optional()` ⇒ absent stays absent (hash-safe), mirroring command_verb.
    command_template: z.string().min(1).optional(),
  })
  .strict()
  .superRefine((it, ctx) => {
    if (it.command_verb !== undefined) {
      // command_verb names the natural verb for a USE puzzle — self-USE or
      // item-on-target — so it requires a USE with both an item and a target.
      if (it.verb !== "USE" || it.item === undefined || it.target === undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["command_verb"],
          message: "command_verb is only valid on a USE interaction with an item and a target",
        });
      } else if (BUILTIN_VERBS.has(it.command_verb)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["command_verb"],
          message: `command_verb "${it.command_verb}" shadows a builtin parser verb`,
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
            "command_template must begin with command_verb (the displayed command's first word is the verb the parser keys on)",
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
      if (!it.command_template.includes("{item}") || !it.command_template.includes("{target}")) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["command_template"],
          message: "command_template must contain both {item} and {target} placeholders",
        });
      }
    }
  });

/** A state-conditional object description (§7.3 reactive text, the object analogue
 *  of RoomVariantSchema). When all of `when` hold, this `text` replaces the
 *  object's base `description` on examine, so a thing can narrate state it changed —
 *  an opened strongbox, a levered-open grate — instead of contradicting it. The
 *  ROOM may already react via RoomSchema.variants, but examining the OBJECT itself
 *  fell back to the static `description`; this closes that gap. First-match-wins in
 *  declared order.
 *
 *  Optional `name` (bug_0188): the same variant may ALSO swap the object's display
 *  NAME, not just its examine text. The reactive-text convention let a thing narrate
 *  changed state on examine, but its NAME — shown in `visible_objects` and in every
 *  enumerated command ("look at toppled cresset", "lever toppled cresset with …") —
 *  stayed frozen at the base `name`, so a name that encodes a transient state ("the
 *  TOPPLED cresset") kept contradicting a room/examine that had moved on (a blind
 *  playtester hit exactly this on dawn_beacon's righted cresset). When this `name`
 *  is set on the matched variant it replaces the base `name` everywhere the name
 *  renders; when absent (every pack today) the base `name` is used, byte-identically. */
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
    // Optional reactive examine descriptions; the first whose `when` holds wins,
    // else `description`. `.optional()` (not `.default([])`) so an absent field
    // stays absent in the compiled pack ⇒ packs that don't use it compile
    // byte-identically and their content hashes are unchanged (mirrors
    // RoomSchema.variants / skill_check / dialogue-topic conditions).
    variants: z.array(ObjectVariantSchema).optional(),
    takeable: z.boolean().default(false),
    // An object the player carries from the START of the game and can NEVER set
    // down — a worn/equipped/bound item (the lamplighter's own lit round-lantern,
    // a familiar, clothing). Placed in the starting inventory by
    // `initStateForParserPack`, and DROP is refused for it (`legal_actions`), so the
    // fiction "you carry X the whole round" is enforced by state, not merely
    // asserted in prose — closing the bug_0220 gap where a "carried flame" the
    // death narration presupposed could actually be left behind. `.optional()` (NOT
    // a default) so an absent field stays absent in the compiled pack ⇒ every pack
    // that doesn't use it keeps its content hash byte-for-byte (mirrors variants /
    // unlock_effects / take_effects). A held object is already in hand, so it is
    // not `takeable` (the superRefine below rejects the contradiction).
    held: z.boolean().optional(),
    quest_critical: z.boolean().default(false),
    read_text: z.string().min(1).optional(), // READable signage/notes
    // Container facets.
    container: z.boolean().default(false),
    openable: z.boolean().default(false),
    locked: z.boolean().default(false),
    key_id: z.string().min(1).optional(),
    // First-class UNLOCK content: a keyed lock can carry the score, narration, and
    // state changes that used to force a bespoke `USE key on lock` interaction —
    // the very split that bred the two-grammar inconsistency two blind playtesters
    // flagged (bug_0073: chest uses `unlock … with …`, an identical gate uses
    // `use key on gate`). When the player unlocks this object with its key:
    //   - `unlock_narrate` (if set) replaces the plain "You unlock the X." line, and
    //   - `unlock_effects` (if set) fire after the unlock (e.g. inc_var score,
    //     unlock_exit, set_flag) — so the climactic key-turn keeps its points and prose
    //     while reading through the SAME `unlock <obj> with <key>` grammar as every
    //     other lock. One-shot is intrinsic: once unlocked the object isn't `isLocked`,
    //     so UNLOCK no longer resolves and the effects never re-fire.
    // Both `.optional()` (not a default) so an absent field keeps the compiled pack
    // byte-identical ⇒ packs that don't use them keep their content hash (mirrors
    // variants / command_verb / skill_check). Only meaningful on a keyed lock; the
    // superRefine below rejects them without a `key_id`.
    unlock_narrate: z.string().min(1).optional(),
    unlock_effects: z.array(EffectSchema).optional(),
    // First-class TAKE content (bug_0107), the symmetric twin of unlock_effects: a
    // takeable object can carry effects that fire AFTER it is picked up (e.g. inc_var
    // score, set_flag), so the climactic CLAIM of a goal item can award its points on
    // the deliberate grab rather than on bare room entry — which is what lets a pack
    // distinguish "reached the chamber" from "took the crown" in the score. The TAKE
    // resolution appends these after the default `add_item` + "You take the X." line.
    // One-shot is intrinsic: once held, the object isn't visible-to-take, so TAKE no
    // longer resolves and the effects never re-fire (mirrors unlock_effects' isLocked
    // self-retire). `.optional()` (not a default) so an absent field keeps the compiled
    // pack byte-identical ⇒ packs that don't use it keep their content hash. Only
    // meaningful on a takeable object; the superRefine below rejects them otherwise.
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
    prompt: z.string().min(1),
    // Optional gate: while any `conditions` entry fails the topic is hidden from
    // the legal set (the player can't ask it) and ASK resolution re-checks it, so
    // an info topic can be retired once its rumor has been told instead of
    // re-offering forever. `.optional()` (not `.default([])`) so a topic without a
    // gate compiles byte-identically ⇒ packs that don't use it keep their content
    // hash (mirrors the RoomSchema.variants / skill_check backward-compat rule).
    // Termination safety: the validator treats only UNCONDITIONAL topics as
    // guaranteed escape routes, so a node must always keep an ungated way out
    // (typically an ungated `end` topic) or it is flagged DIALOGUE_NONTERMINATING.
    conditions: z.array(ConditionSchema).optional(),
    goto: z.string().min(1).optional(),
    end: z.boolean().default(false),
  })
  .strict();

/** A state-conditional NPC line (§7.3 reactive text, the dialogue analogue of
 *  RoomVariantSchema / ObjectVariantSchema). When all of `when` hold, this `text`
 *  replaces the node's base `npc_text` when the node is spoken, so an NPC can react
 *  to state it (or the player) changed — a keeper who greets you with the whole
 *  emergency the FIRST time but a terse "what else, lad?" when you come back to the
 *  menu, instead of re-delivering his opening every return. First-match-wins in
 *  declared order. Only the spoken TEXT varies; the node's `effects` and `topics`
 *  (hence dialogue termination/reachability) are unchanged, so this is purely a
 *  prose layer over the same tree. `.optional()` (not `.default([])`) so a node
 *  without it compiles byte-identically ⇒ every pack that doesn't use it keeps its
 *  content hash (mirrors RoomSchema.variants / ObjectSchema.variants / skill_check). */
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
    // Optional reactive spoken lines; the first whose `when` holds replaces
    // `npc_text` when this node is spoken, else `npc_text`. See
    // DialogueNodeVariantSchema for the backward-compat / hash rationale.
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
export type ObjectVariant = z.infer<typeof ObjectVariantSchema>;
export type SkillCheck = z.infer<typeof SkillCheckSchema>;
export type Interaction = z.infer<typeof InteractionSchema>;
export type GameObject = z.infer<typeof ObjectSchema>;
export type DialogueTopic = z.infer<typeof DialogueTopicSchema>;
export type DialogueNodeVariant = z.infer<typeof DialogueNodeVariantSchema>;
export type DialogueNode = z.infer<typeof DialogueNodeSchema>;
export type Npc = z.infer<typeof NpcSchema>;
export type WinCondition = z.infer<typeof WinConditionSchema>;
export type ParserEnding = z.infer<typeof ParserEndingSchema>;
export type ParserPack = z.infer<typeof ParserPackSchema>;
