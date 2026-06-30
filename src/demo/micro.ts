/**
 * A tiny hand-written RPG-style rule set used by the low-level engine test suite.
 *
 * This is NOT the engine and NOT a real content pack — it is the smallest thing
 * that exercises the core: structured actions, conditions, effects (add_item /
 * set_flag / set_var / goto / end_game), and an on_enter hook.
 */
import { initState, type GameState } from "../core/state.js";
import type { Condition } from "../core/conditions.js";
import type { Effect } from "../core/effects.js";
import { hashState } from "../core/hash.js";
import type { RpgAction } from "../api/types.js";
import { actionEquals, type Resolution, type Rules } from "../core/engine.js";

type MicroOption = { id: string; action: RpgAction; conditions?: Condition[]; effects: Effect[] };
type Scene = { id: string; onEnter?: Effect[]; options: MicroOption[] };

export const MICRO_ACTIONS = {
  takeTorch: { type: "TAKE", item: "torch" },
  enterCave: { type: "MOVE", direction: "east" },
  grabGold: { type: "TAKE", item: "gold" },
  leaveCave: { type: "MOVE", direction: "west" },
  claimTreasure: { type: "USE", target: "treasure" },
  leaveWorld: { type: "USE", target: "exit" },
} satisfies Record<string, RpgAction>;

const SCENES: Scene[] = [
  {
    id: "start",
    options: [
      {
        id: "take_torch",
        action: MICRO_ACTIONS.takeTorch,
        effects: [{ add_item: "torch" }, { set_flag: "has_torch" }],
      },
      { id: "enter_cave", action: MICRO_ACTIONS.enterCave, effects: [{ goto: "cave" }] },
    ],
  },
  {
    id: "cave",
    onEnter: [{ add_journal: "The cave breathes cold air." }],
    options: [
      {
        id: "grab_gold",
        action: MICRO_ACTIONS.grabGold,
        conditions: [{ has_flag: "has_torch" }],
        effects: [
          { add_item: "gold" },
          { inc_var: { name: "score", by: 10 } },
          { goto: "treasure" },
        ],
      },
      { id: "leave", action: MICRO_ACTIONS.leaveCave, effects: [{ goto: "exit" }] },
    ],
  },
  {
    id: "treasure",
    options: [
      { id: "win", action: MICRO_ACTIONS.claimTreasure, effects: [{ end_game: "ending_rich" }] },
    ],
  },
  {
    id: "exit",
    options: [
      { id: "go", action: MICRO_ACTIONS.leaveWorld, effects: [{ end_game: "ending_safe" }] },
    ],
  },
];

const SCENE_BY_ID = new Map(SCENES.map((s) => [s.id, s]));

export const MICRO_PACK_ID = "micro_demo_v1";
/** Content hash over the rule data — saves/traces bind to this (§8.7). */
export const MICRO_CONTENT_HASH = hashState(SCENES);
export const MICRO_START = "start";
export const MICRO_SEED = 1234;

export const microRules: Rules<RpgAction> = {
  legalActions(state: GameState): RpgAction[] {
    const scene = SCENE_BY_ID.get(state.current);
    if (!scene) return [];
    // Legality = the action exists in this scene. Conditions are checked by the
    // engine afterward (§8.4), satisfying the "legal ⊇ executable" property (§14).
    return scene.options.map((option) => option.action);
  },
  resolve(state: GameState, action): Resolution | null {
    const scene = SCENE_BY_ID.get(state.current);
    const option = scene?.options.find((candidate) => actionEquals(candidate.action, action));
    if (!option) return null;
    return { conditions: option.conditions ?? [], effects: option.effects };
  },
  onEnter(_state: GameState, locationId: string): Effect[] {
    return SCENE_BY_ID.get(locationId)?.onEnter ?? [];
  },
};

export function microInitState(seed: number = MICRO_SEED): GameState {
  return initState({ seed, start: MICRO_START });
}
