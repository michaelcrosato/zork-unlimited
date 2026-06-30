/**
 * A tiny hand-written CYOA-style rule set used by the low-level engine test suite.
 *
 * This is NOT the engine and NOT a real content pack — it is the smallest thing
 * that exercises the core: choices, conditions, effects (add_item / set_flag /
 * set_var / goto / end_game) and an on_enter hook. Stage 1 replaces this with the
 * real CYOA schema + validator; the engine and traces stay identical.
 */
import { initState, type GameState } from "../core/state.js";
import type { Condition } from "../core/conditions.js";
import type { Effect } from "../core/effects.js";
import { hashState } from "../core/hash.js";
import type { Action } from "../api/types.js";
import type { Resolution, Rules } from "../core/engine.js";

type Choice = { id: string; conditions?: Condition[]; effects: Effect[] };
type Scene = { id: string; onEnter?: Effect[]; choices: Choice[] };

const SCENES: Scene[] = [
  {
    id: "start",
    choices: [
      { id: "take_torch", effects: [{ add_item: "torch" }, { set_flag: "has_torch" }] },
      { id: "enter_cave", effects: [{ goto: "cave" }] },
    ],
  },
  {
    id: "cave",
    onEnter: [{ add_journal: "The cave breathes cold air." }],
    choices: [
      {
        id: "grab_gold",
        conditions: [{ has_flag: "has_torch" }],
        effects: [
          { add_item: "gold" },
          { inc_var: { name: "score", by: 10 } },
          { goto: "treasure" },
        ],
      },
      { id: "leave", effects: [{ goto: "exit" }] },
    ],
  },
  { id: "treasure", choices: [{ id: "win", effects: [{ end_game: "ending_rich" }] }] },
  { id: "exit", choices: [{ id: "go", effects: [{ end_game: "ending_safe" }] }] },
];

const SCENE_BY_ID = new Map(SCENES.map((s) => [s.id, s]));

export const MICRO_PACK_ID = "micro_demo_v1";
/** Content hash over the rule data — saves/traces bind to this (§8.7). */
export const MICRO_CONTENT_HASH = hashState(SCENES);
export const MICRO_START = "start";
export const MICRO_SEED = 1234;

export const microRules: Rules = {
  legalActions(state: GameState): Action[] {
    const scene = SCENE_BY_ID.get(state.current);
    if (!scene) return [];
    // Legality = the choice exists in this scene. Conditions are checked by the
    // engine afterward (§8.4), satisfying the "legal ⊇ executable" property (§14).
    return scene.choices.map((c) => ({ type: "CHOOSE", choiceId: c.id }));
  },
  resolve(state: GameState, action: Action): Resolution | null {
    if (action.type !== "CHOOSE") return null;
    const scene = SCENE_BY_ID.get(state.current);
    const choice = scene?.choices.find((c) => c.id === action.choiceId);
    if (!choice) return null;
    return { conditions: choice.conditions ?? [], effects: choice.effects };
  },
  onEnter(_state: GameState, locationId: string): Effect[] {
    return SCENE_BY_ID.get(locationId)?.onEnter ?? [];
  },
};

export function microInitState(seed: number = MICRO_SEED): GameState {
  return initState({ seed, start: MICRO_START });
}
