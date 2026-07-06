/**
 * Effect mini-DSL + reducer (spec §7.1, §8.4 step 3).
 *
 * Effects are PURE: each takes a GameState and returns a NEW GameState plus the
 * single event it produced. The reducer never mutates its input. The vocabulary
 * is closed — content cannot introduce new effect kinds (§14 gate).
 */
import { z } from "zod";
import type { GameState, ObjectRuntime } from "./state.js";
import type { GameEvent } from "./events.js";

// Numeric var operands must be FINITE: a NaN/±Infinity literal in content is a
// hard validation error, never a playable pack. This stops a content bug from
// silently poisoning var comparisons (var_gte/lte/eq all coerce with `?? 0` and
// behave surprisingly against NaN). Runtime accumulation is guarded separately
// (see `guardFinite`) for the overflow case the schema cannot see statically.
const NameValue = z.object({ name: z.string().min(1), value: z.number().finite() }).strict();
const NameBy = z.object({ name: z.string().min(1), by: z.number().finite() }).strict();

export const EffectSchema = z.union([
  z.object({ set_flag: z.string().min(1) }).strict(),
  z.object({ clear_flag: z.string().min(1) }).strict(),
  z.object({ add_item: z.string().min(1) }).strict(),
  z.object({ remove_item: z.string().min(1) }).strict(),
  z.object({ set_var: NameValue }).strict(),
  z.object({ inc_var: NameBy }).strict(),
  z.object({ dec_var: NameBy }).strict(),
  z.object({ add_journal: z.string() }).strict(),
  z.object({ goto: z.string().min(1) }).strict(),
  z
    .object({ unlock_exit: z.object({ from: z.string().min(1), to: z.string().min(1) }).strict() })
    .strict(),
  z.object({ open_object: z.string().min(1) }).strict(),
  // The inverse of open_object (first-class CLOSE verb). Open-state is NOT
  // monotone once this exists: the RPG validator's `is_open` win-stability
  // check tracks close_object falsifiers exactly as relocks falsify
  // is_unlocked. Additive — no shipped pack emits it, so every existing pack
  // compiles byte-identically and all recorded traces replay unchanged.
  z.object({ close_object: z.string().min(1) }).strict(),
  z
    .object({
      set_object_locked: z.object({ id: z.string().min(1), locked: z.boolean() }).strict(),
    })
    .strict(),
  z
    .object({
      place_object: z
        .object({
          id: z.string().min(1),
          room: z.string().min(1),
          takenBy: z.enum(["player", "world"]).optional(),
        })
        .strict(),
    })
    .strict(),
  // Stage 4 (§13, §14 gate): advance a quest to a named stage. Reuses the
  // questStage field already in GameState (§6); deterministic, no randomness.
  z
    .object({
      set_quest_stage: z.object({ quest: z.string().min(1), stage: z.string().min(1) }).strict(),
    })
    .strict(),
  z.object({ narrate: z.string() }).strict(),
  z.object({ end_game: z.string().min(1) }).strict(),
]);

export type Effect = z.infer<typeof EffectSchema>;

/** Canonical flag key for an unlocked exit. The parser stage gates exits on this. */
export function exitFlag(from: string, to: string): string {
  return `__exit:${from}->${to}`;
}

function patchObject(
  state: GameState,
  id: string,
  patch: Partial<ObjectRuntime>,
): Record<string, ObjectRuntime> {
  const prev = state.objectState[id] ?? {};
  return { ...state.objectState, [id]: { ...prev, ...patch } };
}

/**
 * Keep a numeric var value FINITE. The schema rejects non-finite literals, but a
 * runtime accumulation (e.g. repeated inc_var, or a pre-existing non-finite var)
 * could still compute NaN/±Infinity. When it does, we reject the write — keeping
 * the prior value so var comparisons stay meaningful — and report a `diagnostic`
 * on the event rather than silently poisoning state. Deterministic: the same
 * inputs always produce the same rejection.
 */
function guardFinite(
  name: string,
  candidate: number,
  prior: number,
): { value: number; diagnostic?: string } {
  if (Number.isFinite(candidate)) return { value: candidate };
  return {
    value: prior,
    diagnostic: `non-finite result for var "${name}" (${String(candidate)}) rejected; kept ${prior} to preserve deterministic comparisons`,
  };
}

/** Apply ONE effect. Returns the new state and the event it emitted. Pure. */
export function applyEffect(
  effect: Effect,
  state: GameState,
): { state: GameState; event: GameEvent } {
  if ("set_flag" in effect) {
    return {
      state: { ...state, flags: { ...state.flags, [effect.set_flag]: true } },
      event: { type: "state_change", effect: "set_flag", flag: effect.set_flag },
    };
  }
  if ("clear_flag" in effect) {
    return {
      state: { ...state, flags: { ...state.flags, [effect.clear_flag]: false } },
      event: { type: "state_change", effect: "clear_flag", flag: effect.clear_flag },
    };
  }
  if ("add_item" in effect) {
    const inventory = state.inventory.includes(effect.add_item)
      ? [...state.inventory]
      : [...state.inventory, effect.add_item];
    return {
      state: { ...state, inventory },
      event: { type: "take", item: effect.add_item },
    };
  }
  if ("remove_item" in effect) {
    return {
      state: { ...state, inventory: state.inventory.filter((i) => i !== effect.remove_item) },
      event: { type: "drop", item: effect.remove_item },
    };
  }
  if ("set_var" in effect) {
    const prior = state.vars[effect.set_var.name] ?? 0;
    const { value, diagnostic } = guardFinite(effect.set_var.name, effect.set_var.value, prior);
    return {
      state: { ...state, vars: { ...state.vars, [effect.set_var.name]: value } },
      event: {
        type: "state_change",
        effect: "set_var",
        name: effect.set_var.name,
        value,
        ...(diagnostic ? { diagnostic } : {}),
      },
    };
  }
  if ("inc_var" in effect) {
    const prior = state.vars[effect.inc_var.name] ?? 0;
    const { value: next, diagnostic } = guardFinite(
      effect.inc_var.name,
      prior + effect.inc_var.by,
      prior,
    );
    return {
      state: { ...state, vars: { ...state.vars, [effect.inc_var.name]: next } },
      // `value` is the var's resulting total (consistent with set_var's "new value"),
      // and `delta` is the signed change just applied (+by, or 0 if a non-finite
      // result was rejected). Without delta a consumer can't recover "points just
      // earned" from the event: a blind playtester (sealed_crypt, seed 13) saw the
      // identical rope-use score event report value:15 in one run and value:10 in
      // another and could not tell the +10 increment from the running total (bug_0060).
      event: {
        type: "state_change",
        effect: "inc_var",
        name: effect.inc_var.name,
        value: next,
        delta: diagnostic ? 0 : effect.inc_var.by,
        ...(diagnostic ? { diagnostic } : {}),
      },
    };
  }
  if ("dec_var" in effect) {
    const prior = state.vars[effect.dec_var.name] ?? 0;
    const { value: next, diagnostic } = guardFinite(
      effect.dec_var.name,
      prior - effect.dec_var.by,
      prior,
    );
    return {
      state: { ...state, vars: { ...state.vars, [effect.dec_var.name]: next } },
      // delta is the signed change (-by, or 0 if a non-finite result was rejected),
      // so a consumer reads the cost directly off the event instead of diffing the
      // running total (bug_0060).
      event: {
        type: "state_change",
        effect: "dec_var",
        name: effect.dec_var.name,
        value: next,
        delta: diagnostic ? 0 : -effect.dec_var.by,
        ...(diagnostic ? { diagnostic } : {}),
      },
    };
  }
  if ("add_journal" in effect) {
    return {
      state: { ...state, journal: [...state.journal, effect.add_journal] },
      event: { type: "state_change", effect: "add_journal", text: effect.add_journal },
    };
  }
  if ("goto" in effect) {
    const from = state.current;
    return {
      state: { ...state, current: effect.goto, visited: { ...state.visited, [effect.goto]: true } },
      event: { type: "move", from, to: effect.goto },
    };
  }
  if ("unlock_exit" in effect) {
    const key = exitFlag(effect.unlock_exit.from, effect.unlock_exit.to);
    return {
      state: { ...state, flags: { ...state.flags, [key]: true } },
      event: { type: "unlock_exit", from: effect.unlock_exit.from, to: effect.unlock_exit.to },
    };
  }
  if ("open_object" in effect) {
    return {
      state: { ...state, objectState: patchObject(state, effect.open_object, { open: true }) },
      event: { type: "open_object", id: effect.open_object },
    };
  }
  if ("close_object" in effect) {
    return {
      state: { ...state, objectState: patchObject(state, effect.close_object, { open: false }) },
      event: { type: "close_object", id: effect.close_object },
    };
  }
  if ("set_object_locked" in effect) {
    return {
      state: {
        ...state,
        objectState: patchObject(state, effect.set_object_locked.id, {
          locked: effect.set_object_locked.locked,
        }),
      },
      event: {
        type: "state_change",
        effect: "set_object_locked",
        id: effect.set_object_locked.id,
        locked: effect.set_object_locked.locked,
      },
    };
  }
  if ("place_object" in effect) {
    // Move an object into a room (e.g. a DROP, or a scripted placement). The
    // object's room overrides its static home; holding it (inventory) takes
    // precedence over room when locating it (§7.3, parser object model).
    return {
      state: {
        ...state,
        objectState: patchObject(state, effect.place_object.id, {
          room: effect.place_object.room,
          ...(effect.place_object.takenBy ? { takenBy: effect.place_object.takenBy } : {}),
        }),
      },
      event: {
        type: "state_change",
        effect: "place_object",
        id: effect.place_object.id,
        room: effect.place_object.room,
      },
    };
  }
  if ("set_quest_stage" in effect) {
    return {
      state: {
        ...state,
        questStage: {
          ...state.questStage,
          [effect.set_quest_stage.quest]: effect.set_quest_stage.stage,
        },
      },
      event: {
        type: "state_change",
        effect: "set_quest_stage",
        quest: effect.set_quest_stage.quest,
        stage: effect.set_quest_stage.stage,
      },
    };
  }
  if ("narrate" in effect) {
    return { state, event: { type: "narration", text: effect.narrate } };
  }
  if ("end_game" in effect) {
    return {
      state: { ...state, ended: true, endingId: effect.end_game },
      event: { type: "ending", endingId: effect.end_game },
    };
  }
  const _exhaustive: never = effect;
  return _exhaustive;
}

/** Apply a list of effects IN ORDER. Returns the new state and ordered events. */
export function applyEffects(
  effects: Effect[],
  state: GameState,
): { state: GameState; events: GameEvent[] } {
  let cur = state;
  const events: GameEvent[] = [];
  for (const e of effects) {
    const res = applyEffect(e, cur);
    cur = res.state;
    events.push(res.event);
  }
  return { state: cur, events };
}
