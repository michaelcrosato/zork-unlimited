/**
 * CYOA content schema (spec §7.2).
 *
 * Authored in YAML, compiled to validated JSON. The Zod schema IS the contract:
 * anything that does not parse is rejected before it can be played (§7). Scene
 * transitions use a choice's `next` (which may target a scene or an ending);
 * conditions/effects reuse the closed core DSLs.
 */
import { z } from "zod";
import { ConditionSchema } from "../core/conditions.js";
import { EffectSchema } from "../core/effects.js";

export const ChoiceSchema = z
  .object({
    id: z.string().min(1),
    text: z.string().min(1),
    conditions: z.array(ConditionSchema).default([]),
    effects: z.array(EffectSchema).default([]),
    next: z.string().min(1), // scene id or ending id; reference checked by validator
  })
  .strict();

export const SceneVariantSchema = z
  .object({
    when: z.array(ConditionSchema).min(1),
    text: z.string().min(1),
  })
  .strict();

export const SceneSchema = z
  .object({
    id: z.string().min(1),
    title: z.string().min(1),
    text: z.string().min(1),
    // Optional reactive descriptions; the first whose `when` holds wins, else
    // `text`. `.optional()` (not `.default([])`) so an absent field stays absent
    // in the compiled pack ⇒ packs that don't use it compile byte-identically and
    // their content hashes are unchanged (mirrors the parser RoomSchema.variants
    // rule from bug_0010). Lets a scene narrate state it changed — an item already
    // taken, a panel already pried — instead of contradicting it.
    variants: z.array(SceneVariantSchema).optional(),
    on_enter: z.array(EffectSchema).default([]),
    is_ending: z.boolean().default(false),
    choices: z.array(ChoiceSchema).default([]),
  })
  .strict();

export const EndingSchema = z
  .object({
    id: z.string().min(1),
    title: z.string().min(1),
    text: z.string().min(1),
    // Optional reactive epilogues — same shape and first-match-wins rule as a
    // scene's `variants`. An ending two routes converge on can now acknowledge
    // *how* the player got there (which of two letters they carried out) instead
    // of printing one text that contradicts the route just played. `.optional()`
    // (not `.default([])`) so endings that don't use it compile byte-identically
    // and their content hashes are unchanged (same rule as SceneSchema.variants).
    variants: z.array(SceneVariantSchema).optional(),
    // Optional death/failure marker — the CYOA analogue of ParserEndingSchema.death
    // (§13 Stage 3), part of standardizing the mechanic palette across modes. Marks a
    // terminal as a non-winning failure outcome (a lethal gamble, a moral capitulation)
    // so the observation and validators can distinguish a "you lost" terminal from a
    // win/neutral one uniformly across CYOA/parser/RPG. `.optional()` (NOT `.default(false)`,
    // unlike the parser's): an absent field stays absent in the compiled pack ⇒ every
    // existing CYOA pack compiles byte-identically and keeps its content hash (mirrors
    // `variants`). Absent ⇒ the ending is not flagged a failure.
    death: z.boolean().optional(),
  })
  .strict();

// A global terminal: after ANY action, if every condition in `when` holds, the
// game ends at `ending`. Evaluated by the engine's §8.4.5 `checkWin` hook (see the
// CYOA runner), so it fires whether or not the action moved between scenes — a
// time/deadline loss (the clock running out) that no single choice's `next` models.
// `ending` is a terminal id; the reference (and that it really is a terminal, and
// that it stays reachable) is checked by the validator, not the schema.
export const DeadlineSchema = z
  .object({
    when: z.array(ConditionSchema).min(1),
    ending: z.string().min(1),
  })
  .strict();

export const MetaSchema = z
  .object({
    id: z.string().min(1),
    title: z.string().min(1),
    start: z.string().min(1),
    vars_init: z.record(z.string(), z.number()).default({}),
    flags_init: z.array(z.string()).default([]),
    // Optional global deadline (above). `.optional()` (not a default) so packs that
    // don't declare one compile byte-identically and their content hashes are
    // unchanged — same rule as SceneSchema/EndingSchema `variants`.
    deadline: DeadlineSchema.optional(),
    // Optional milestone score ceiling — the CYOA analogue of ParserMetaSchema.max_score
    // (§13 Stage 3), part of standardizing the mechanic palette across modes. Score is
    // tracked in the conventional `score` var via `inc_var` awards on choices; when this
    // is set the runner appends the same Zork-style "[Your score has gone up…]" feedback
    // (shared `scoreChangeNarrations` chrome) and the validator proves the ceiling is
    // reachable. `.optional()` (NOT `.default(0)`, unlike the parser's): an absent field
    // stays absent in the compiled pack ⇒ every existing CYOA pack compiles
    // byte-identically and keeps its content hash (mirrors `deadline`/`variants`). Absent
    // or 0 ⇒ the pack does not track score (the score chrome is a no-op).
    max_score: z.number().int().nonnegative().optional(),
  })
  .strict();

export const CyoaPackSchema = z
  .object({
    meta: MetaSchema,
    scenes: z.array(SceneSchema).min(1),
    endings: z.array(EndingSchema).default([]),
  })
  .strict();

export type Choice = z.infer<typeof ChoiceSchema>;
export type Deadline = z.infer<typeof DeadlineSchema>;
export type SceneVariant = z.infer<typeof SceneVariantSchema>;
export type Scene = z.infer<typeof SceneSchema>;
export type Ending = z.infer<typeof EndingSchema>;
export type CyoaPack = z.infer<typeof CyoaPackSchema>;
