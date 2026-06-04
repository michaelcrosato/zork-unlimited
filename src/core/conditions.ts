/**
 * Condition mini-DSL (spec §7.1).
 *
 * All conditions are PURE predicates over GameState. The vocabulary is closed:
 * content cannot introduce new condition kinds — only the engine can, via the
 * §14 extension gate. Schemas are authored with Zod so the schema IS the
 * contract; anything that does not parse is rejected before play.
 */
import { z } from "zod";
import type { GameState } from "./state.js";

const VarCmp = z.object({ name: z.string().min(1), value: z.number() }).strict();

export const ConditionSchema: z.ZodType<Condition> = z.lazy(() =>
  z.union([
    z.object({ has_flag: z.string().min(1) }).strict(),
    z.object({ not_flag: z.string().min(1) }).strict(),
    z.object({ has_item: z.string().min(1) }).strict(),
    z.object({ not_item: z.string().min(1) }).strict(),
    z.object({ visited: z.string().min(1) }).strict(),
    z.object({ not_visited: z.string().min(1) }).strict(),
    // The player's CURRENT location (`state.current`), the non-monotone dual of
    // `visited` (which is sticky once true). `visited` answers "have you EVER been
    // in room X"; `in_room` answers "are you in room X RIGHT NOW". This lets a
    // self-USE interaction on a carried item, or a reactive variant, be gated to the
    // place its fiction belongs — e.g. a tension beat you take "before the iron locks"
    // should only offer in the crypt, not trail the player into every room they carry
    // the key through (the sealed_crypt blind-playtest "grip iron key" wart, bug_0258).
    z.object({ in_room: z.string().min(1) }).strict(),
    // Runtime object-state predicates (parser+): read the per-object open/locked
    // runtime overrides in GameState.objectState. `is_open` is true once the object
    // has been opened during play; `is_unlocked` is true once its lock has been
    // cleared at runtime (an explicitly unlocked container). Both default false
    // until the relevant effect fires, so they let a reactive room/object `variant`
    // track a container's lifecycle (locked → unlocked → opened → emptied) DIRECTLY,
    // instead of leaning on a `has_item` proxy for the contained item — which only
    // flips on EMPTYING and so left the unlocked-but-not-yet-emptied window stale
    // (the gap bug_0024 called out and bug_0033 closes).
    z.object({ is_open: z.string().min(1) }).strict(),
    z.object({ is_unlocked: z.string().min(1) }).strict(),
    z.object({ var_gte: VarCmp }).strict(),
    z.object({ var_lte: VarCmp }).strict(),
    z.object({ var_eq: VarCmp }).strict(),
    // Stage 4 (§13, §14 gate): true when a quest is at a named stage.
    z
      .object({
        quest_stage: z.object({ quest: z.string().min(1), stage: z.string().min(1) }).strict(),
      })
      .strict(),
    z.object({ all_of: z.array(ConditionSchema) }).strict(),
    z.object({ any_of: z.array(ConditionSchema) }).strict(),
    z.object({ none_of: z.array(ConditionSchema) }).strict(),
  ]),
);

export type Condition =
  | { has_flag: string }
  | { not_flag: string }
  | { has_item: string }
  | { not_item: string }
  | { visited: string }
  | { not_visited: string }
  | { in_room: string }
  | { is_open: string }
  | { is_unlocked: string }
  | { var_gte: { name: string; value: number } }
  | { var_lte: { name: string; value: number } }
  | { var_eq: { name: string; value: number } }
  | { quest_stage: { quest: string; stage: string } }
  | { all_of: Condition[] }
  | { any_of: Condition[] }
  | { none_of: Condition[] };

/** Evaluate one condition node against state. Pure, total, no throws. */
export function evalCondition(cond: Condition, state: GameState): boolean {
  if ("has_flag" in cond) return state.flags[cond.has_flag] === true;
  if ("not_flag" in cond) return state.flags[cond.not_flag] !== true;
  if ("has_item" in cond) return state.inventory.includes(cond.has_item);
  if ("not_item" in cond) return !state.inventory.includes(cond.not_item);
  if ("visited" in cond) return state.visited[cond.visited] === true;
  if ("not_visited" in cond) return state.visited[cond.not_visited] !== true;
  if ("in_room" in cond) return state.current === cond.in_room;
  if ("is_open" in cond) return state.objectState[cond.is_open]?.open === true;
  if ("is_unlocked" in cond) return state.objectState[cond.is_unlocked]?.locked === false;
  if ("var_gte" in cond) return (state.vars[cond.var_gte.name] ?? 0) >= cond.var_gte.value;
  if ("var_lte" in cond) return (state.vars[cond.var_lte.name] ?? 0) <= cond.var_lte.value;
  if ("var_eq" in cond) return (state.vars[cond.var_eq.name] ?? 0) === cond.var_eq.value;
  if ("quest_stage" in cond)
    return state.questStage[cond.quest_stage.quest] === cond.quest_stage.stage;
  if ("all_of" in cond) return cond.all_of.every((c) => evalCondition(c, state));
  if ("any_of" in cond) return cond.any_of.some((c) => evalCondition(c, state));
  if ("none_of" in cond) return !cond.none_of.some((c) => evalCondition(c, state));
  // Unreachable for schema-valid content; exhaustive by construction.
  const _exhaustive: never = cond;
  return Boolean(_exhaustive);
}

/** All conditions must hold (empty list ⇒ true). */
export function evalConditions(conds: Condition[], state: GameState): boolean {
  return conds.every((c) => evalCondition(c, state));
}
