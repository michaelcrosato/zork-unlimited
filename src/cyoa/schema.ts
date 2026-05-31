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

export const SceneSchema = z
  .object({
    id: z.string().min(1),
    title: z.string().min(1),
    text: z.string().min(1),
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
  })
  .strict();

export const MetaSchema = z
  .object({
    id: z.string().min(1),
    title: z.string().min(1),
    start: z.string().min(1),
    vars_init: z.record(z.string(), z.number()).default({}),
    flags_init: z.array(z.string()).default([]),
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
export type Scene = z.infer<typeof SceneSchema>;
export type Ending = z.infer<typeof EndingSchema>;
export type CyoaPack = z.infer<typeof CyoaPackSchema>;
