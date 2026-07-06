/**
 * Shared deterministic skill checks.
 *
 * Skill checks are core gameplay, not parser or RPG plumbing: any runtime can
 * roll d20 + a named state var and route through ordinary core effects.
 */
import { z } from "zod";
import { EffectSchema, type Effect } from "./effects.js";
import { rngForStep, type Rng } from "./rng.js";
import type { GameState } from "./state.js";
import type { Resolution } from "./engine.js";

export const SkillCheckSchema = z
  .object({
    skill: z.string().min(1),
    difficulty: z.number().int(),
    on_success: z.array(EffectSchema).default([]),
    on_failure: z.array(EffectSchema).default([]),
  })
  .strict();

export type SkillCheck = z.infer<typeof SkillCheckSchema>;

/**
 * Resolve a skill check: roll d20 + the named skill var against `difficulty`.
 * Deterministic per (seed, step). Returns the success or failure effects, with a
 * narration of the roll so the player understands the outcome.
 */
export function resolveSkillCheck(
  state: GameState,
  check: SkillCheck,
  rng: Rng = rngForStep(state.seed, state.step),
): Resolution {
  const roll = rng.int(1, 20);
  const total = roll + (state.vars[check.skill] ?? 0);
  const success = total >= check.difficulty;
  const lead: Effect = {
    narrate: `${check.skill} check: d20 ${roll} + ${state.vars[check.skill] ?? 0} = ${total} vs ${check.difficulty} — ${success ? "success" : "failure"}.`,
  };
  return { conditions: [], effects: [lead, ...(success ? check.on_success : check.on_failure)] };
}
