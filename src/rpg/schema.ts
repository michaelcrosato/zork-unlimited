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
import { ParserPackSchema } from "../parser/schema.js";

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

export const RpgPackSchema = ParserPackSchema.extend({
  enemies: z.array(EnemySchema).default([]),
}).strict();

export type Enemy = z.infer<typeof EnemySchema>;
export type RpgPack = z.infer<typeof RpgPackSchema>;

/** Internal var holding an enemy's remaining HP (hidden from observations, `__`). */
export function enemyHpVar(enemyId: string): string {
  return `__enemy_hp_${enemyId}`;
}
