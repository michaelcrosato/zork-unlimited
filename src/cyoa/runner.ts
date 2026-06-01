/**
 * CYOA runner (spec §8.4, §9.1).
 *
 * Adapts a validated CYOA pack into the engine's `Rules` resolver — the engine
 * itself stays content-free (§3). A choice's transition flows through the core
 * `goto`/`end_game` effects so the deterministic step machinery is reused as-is:
 *   - next → a scene   ⇒ goto(scene)            (on_enter fires)
 *   - next → an ending ⇒ goto(ending) + end_game(ending)  (terminal)
 */
import { initState, type GameState } from "../core/state.js";
import { evalConditions } from "../core/conditions.js";
import type { Effect } from "../core/effects.js";
import { applyEffects } from "../core/effects.js";
import type { Action } from "../api/types.js";
import type { Resolution, Rules } from "../core/engine.js";
import type { CyoaPack, Scene } from "./schema.js";

export type CyoaIndex = {
  pack: CyoaPack;
  scenes: Map<string, Scene>;
  endingIds: Set<string>;
  /** Scenes flagged is_ending behave as terminals too. */
  endingSceneIds: Set<string>;
  /** Every terminal node id (endings list + is_ending scenes). */
  terminalIds: Set<string>;
};

export function indexPack(pack: CyoaPack): CyoaIndex {
  const scenes = new Map(pack.scenes.map((s) => [s.id, s]));
  const endingIds = new Set(pack.endings.map((e) => e.id));
  const endingSceneIds = new Set(pack.scenes.filter((s) => s.is_ending).map((s) => s.id));
  const terminalIds = new Set([...endingIds, ...endingSceneIds]);
  return { pack, scenes, endingIds, endingSceneIds, terminalIds };
}

export function isTerminal(index: CyoaIndex, id: string): boolean {
  return index.terminalIds.has(id);
}

/** The scene's effective text in the current state: the first reactive `variant`
 *  whose `when` conditions all hold (declared order, first-match-wins), else the
 *  base `text`. Pure; same (scene, state) ⇒ same text. Lets a scene narrate state
 *  it changed — an item already taken, a panel already pried — instead of
 *  contradicting it (mirrors the parser `roomDescription` helper, bug_0010). */
export function sceneText(scene: Scene, state: GameState): string {
  for (const v of scene.variants ?? []) {
    if (evalConditions(v.when, state)) return v.text;
  }
  return scene.text;
}

/** Build the engine rule set for a compiled pack. */
export function buildRules(index: CyoaIndex): Rules {
  return {
    legalActions(state: GameState): Action[] {
      if (state.ended) return [];
      const scene = index.scenes.get(state.current);
      if (!scene || scene.is_ending) return [];
      // Only condition-satisfied choices are offered, so the legal set never
      // contains an action the engine would reject (legal ⊇ executable, §14).
      return scene.choices
        .filter((c) => evalConditions(c.conditions, state))
        .map((c) => ({ type: "CHOOSE", choiceId: c.id }));
    },

    resolve(state: GameState, action: Action): Resolution | null {
      if (action.type !== "CHOOSE") return null;
      const scene = index.scenes.get(state.current);
      const choice = scene?.choices.find((c) => c.id === action.choiceId);
      if (!choice) return null;
      const effects: Effect[] = [...choice.effects];
      if (isTerminal(index, choice.next)) {
        effects.push({ goto: choice.next }, { end_game: choice.next });
      } else {
        effects.push({ goto: choice.next });
      }
      return { conditions: choice.conditions, effects };
    },

    onEnter(_state: GameState, locationId: string): Effect[] {
      return index.scenes.get(locationId)?.on_enter ?? [];
    },
  };
}

/** Initial state for a pack, with the start scene's on_enter effects applied. */
export function initStateForPack(index: CyoaIndex, seed: number): GameState {
  const meta = index.pack.meta;
  const base = initState({
    seed,
    start: meta.start,
    varsInit: meta.vars_init,
    flagsInit: meta.flags_init,
  });
  const startScene = index.scenes.get(meta.start);
  if (!startScene || startScene.on_enter.length === 0) return base;
  return applyEffects(startScene.on_enter, base).state;
}
