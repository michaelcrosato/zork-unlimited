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

const NameValue = z.object({ name: z.string().min(1), value: z.number() }).strict();
const NameBy = z.object({ name: z.string().min(1), by: z.number() }).strict();

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
  z
    .object({
      set_object_locked: z.object({ id: z.string().min(1), locked: z.boolean() }).strict(),
    })
    .strict(),
  z
    .object({ place_object: z.object({ id: z.string().min(1), room: z.string().min(1) }).strict() })
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
      ? state.inventory
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
    return {
      state: { ...state, vars: { ...state.vars, [effect.set_var.name]: effect.set_var.value } },
      event: {
        type: "state_change",
        effect: "set_var",
        name: effect.set_var.name,
        value: effect.set_var.value,
      },
    };
  }
  if ("inc_var" in effect) {
    const next = (state.vars[effect.inc_var.name] ?? 0) + effect.inc_var.by;
    return {
      state: { ...state, vars: { ...state.vars, [effect.inc_var.name]: next } },
      // `value` is the var's resulting total (consistent with set_var's "new value"),
      // and `delta` is the signed change just applied (+by). Without delta a consumer
      // can't recover "points just earned" from the event: a blind playtester
      // (sealed_crypt, seed 13) saw the identical rope-use score event report
      // value:15 in one run and value:10 in another and could not tell the +10
      // increment from the running total (bug_0060).
      event: {
        type: "state_change",
        effect: "inc_var",
        name: effect.inc_var.name,
        value: next,
        delta: effect.inc_var.by,
      },
    };
  }
  if ("dec_var" in effect) {
    const next = (state.vars[effect.dec_var.name] ?? 0) - effect.dec_var.by;
    return {
      state: { ...state, vars: { ...state.vars, [effect.dec_var.name]: next } },
      // delta is the signed change (-by), so a consumer reads the cost directly off
      // the event instead of diffing the running total (bug_0060).
      event: {
        type: "state_change",
        effect: "dec_var",
        name: effect.dec_var.name,
        value: next,
        delta: -effect.dec_var.by,
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
        objectState: patchObject(state, effect.place_object.id, { room: effect.place_object.room }),
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
