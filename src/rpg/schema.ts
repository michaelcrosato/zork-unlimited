/**
 * RPG content schema (spec §13 Stage 4 — Hero's-Quest hybrid; §14 gate).
 *
 * An RPG pack is a parser pack (Stage 2/3) PLUS enemies. Character stats (HP,
 * attack, defense, gold, skills) are plain numeric `vars` (§6) seeded from
 * meta.vars_init — no new state shape. Combat and skill checks add randomness,
 * but that randomness lives in the resolver and flows through the seeded PRNG
 * (core/rng.ts), so every fight is replayable (§8.5). Reusing ParserPackSchema
 * means every Stage-2/3 invariant (reachability, soft-locks, dialogue) is checked
 * for free, and existing parser packs are untouched (their hashes are stable).
 */
import { z } from "zod";
import { EffectSchema } from "../core/effects.js";
import { ParserMetaSchema, ParserPackSchema } from "../parser/schema.js";

/** Conventional player-stat var names (§13 Stage 4). The validator checks they exist. */
export const HP_VAR = "hp";
export const ATTACK_VAR = "attack";
export const DEFENSE_VAR = "defense";

/**
 * A foe that occupies a room. Combat is turn-based (one ATTACK action = one
 * round) and resolved entirely in code from the seeded PRNG. `death_ending` is
 * reached if the player falls; it must be a declared death ending. `on_defeat`
 * effects (set a flag, award score/gold, open a way) fire when the enemy dies.
 */
export const EnemySchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    description: z.string().min(1),
    room: z.string().min(1),
    hp: z.number().int().positive(),
    attack: z.number().int().nonnegative(),
    defense: z.number().int().nonnegative(),
    /** Flag set when the enemy is defeated (gate exits / win conditions on it). */
    defeat_flag: z.string().min(1).optional(),
    /** Ending reached if the player dies fighting this enemy (death ending). */
    death_ending: z.string().min(1),
    on_defeat: z.array(EffectSchema).default([]),
  })
  .strict();

/**
 * RPG meta = the parser meta PLUS an optional fairness opt-in.
 *
 * `combat_guaranteed` lets a pack PROMISE its fights are not a gamble. By default
 * the combat-winnability proof is a deliberately conservative LOWER bound: it
 * forbids only a TRULY impossible fight and PERMITS a luck-dependent one a
 * fully-prepared player can still lose on bad rolls (bug_0101/0102's intentional
 * "preparation is a real gamble" tuning, contract made honest in bug_0113). Every
 * RPG blind playtest names that same gap — an unlucky prepared player dies with no
 * recourse — but for a gamble pack that is by design. When a pack sets
 * `combat_guaranteed: true`, the validator additionally proves the UPPER bound:
 * with best reachable stats but the WORST rolls, the player must still survive
 * every fight (`COMBAT_NOT_GUARANTEED` errors otherwise). `.optional()` (not a
 * default) so an absent field stays absent in the compiled pack ⇒ packs that don't
 * use it compile byte-identically and their content hashes are unchanged (mirrors
 * RoomSchema.variants / skill_check). bug_0114.
 */
export const RpgMetaSchema = ParserMetaSchema.extend({
  combat_guaranteed: z.boolean().optional(),
}).strict();

export const RpgPackSchema = ParserPackSchema.extend({
  meta: RpgMetaSchema,
  enemies: z.array(EnemySchema).default([]),
}).strict();

export type Enemy = z.infer<typeof EnemySchema>;
export type RpgPack = z.infer<typeof RpgPackSchema>;

/** Internal var holding an enemy's remaining HP (hidden from observations, `__`). */
export function enemyHpVar(enemyId: string): string {
  return `__enemy_hp_${enemyId}`;
}
