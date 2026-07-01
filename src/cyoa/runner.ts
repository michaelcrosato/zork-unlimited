/**
 * CYOA runner (spec §8.4, §9.1).
 *
 * Adapts a validated CYOA pack into the engine's `Rules` resolver — the engine
 * itself stays content-free (§3). A choice's transition flows through the core
 * `goto`/`end_game` effects so the deterministic step machinery is reused as-is:
 *   - next → a scene   ⇒ goto(scene)            (on_enter fires)
 *   - next → an ending ⇒ goto(ending) + end_game(ending)  (terminal)
 */
import type { GameState } from "../core/state.js";
import { evalConditions } from "../core/conditions.js";
import type { Effect } from "../core/effects.js";
import type { GameEvent } from "../core/events.js";
import { reactiveText } from "../core/reactive_text.js";
import { rngForStep, type Rng } from "../core/rng.js";
import type { Resolution, Rules } from "../core/engine.js";
import { scoreChangeNarrations } from "../core/score_chrome.js";
import { resolveSkillCheck } from "../core/skill_check.js";
import { SCORE_VAR } from "../rpg/schema.js";
import { initRuntimeState } from "../rpg/state_init.js";
import type { CyoaPack, Ending, Scene } from "./schema.js";

export type CyoaAction = { type: "CHOOSE"; choiceId: string };

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
  return reactiveText(scene.text, scene.variants, state);
}

/** An ending's effective epilogue: the first reactive `variant` whose `when`
 *  holds (declared order, first-match-wins), else the base `text`. Identical
 *  rule to `sceneText` — endings two routes converge on can acknowledge which
 *  route the player actually took (the state is frozen at end_game, so this is
 *  pure too). */
export function endingText(ending: Ending, state: GameState): string {
  return reactiveText(ending.text, ending.variants, state);
}

/**
 * Build the engine rule set for a compiled pack.
 *
 * `rngFor` supplies the PRNG a skill-checked choice draws its d20 from. It defaults to the
 * step-keyed stream (core/rng.ts), so production callers pass nothing and play is
 * byte-identical and replayable (§8.5). The parameter is a verification seam ONLY — the
 * exhaustive ending/score proofs drive a skill-checked choice under the player's best and
 * worst rolls by passing a forced rng, exactly as the parser/RPG runners do (buildRpgRules).
 */
export function buildRules(
  index: CyoaIndex,
  rngFor: (state: GameState) => Rng = (s) => rngForStep(s.seed, s.step),
): Rules<CyoaAction> {
  return {
    legalActions(state: GameState): CyoaAction[] {
      if (state.ended) return [];
      const scene = index.scenes.get(state.current);
      if (!scene || scene.is_ending) return [];
      // Only condition-satisfied choices are offered, so the legal set never
      // contains an action the engine would reject (legal ⊇ executable, §14).
      return scene.choices
        .filter((c) => evalConditions(c.conditions, state))
        .map((c) => ({ type: "CHOOSE", choiceId: c.id }));
    },

    resolve(state: GameState, action: CyoaAction): Resolution | null {
      if (action.type !== "CHOOSE") return null;
      const scene = index.scenes.get(state.current);
      const choice = scene?.choices.find((c) => c.id === action.choiceId);
      if (!choice) return null;
      const effects: Effect[] = [...choice.effects];
      if (choice.skill_check) {
        // A skill-checked choice rolls d20 + the named skill var vs `difficulty` (the shared
        // resolver), then applies its on_success / on_failure effects — which carry their OWN
        // `goto`/`end_game` routing, so the check self-routes (no `next`). Any pre-roll
        // `choice.effects` are already applied above (e.g. spend an item before the attempt).
        const res = resolveSkillCheck(state, choice.skill_check, rngFor(state));
        effects.push(...res.effects);
        return { conditions: choice.conditions, effects };
      }
      // Plain choice: `next` is guaranteed present by the schema's exactly-one-of rule.
      const next = choice.next as string;
      if (isTerminal(index, next)) {
        effects.push({ goto: next }, { end_game: next });
      } else {
        effects.push({ goto: next });
      }
      return { conditions: choice.conditions, effects };
    },

    onEnter(_state: GameState, locationId: string): Effect[] {
      return index.scenes.get(locationId)?.on_enter ?? [];
    },

    // §8.4.5 — the optional pack-level `deadline`. The engine calls this after every
    // action's effects (and any on_enter), but only while the game has NOT already
    // ended — so a choice that fires its own `end_game` (rich/truth/caught/patrol)
    // never collides with the deadline. When `deadline.when` holds we end the game,
    // mirroring the terminal-choice transition (goto + end_game) so the observation
    // renders the ending's epilogue: `buildObservation` keys the displayed text off
    // `state.current`, so without the `goto` the player would see the scene they were
    // standing in (e.g. the gallery) under an `ended` flag instead of the epilogue.
    checkWin(state: GameState): Effect[] {
      const deadline = index.pack.meta.deadline;
      if (!deadline) return [];
      // Defensive: only end toward a real terminal. The validator already rejects a
      // deadline whose ending isn't a declared terminal; this guard keeps a slipped-
      // through misconfig from gotoing a non-terminal scene and stranding the player.
      if (!isTerminal(index, deadline.ending)) return [];
      if (!evalConditions(deadline.when, state)) return [];
      return [{ goto: deadline.ending }, { end_game: deadline.ending }];
    },

    // Engine chrome: the same Zork-style score feedback the parser/RPG runners emit,
    // now available to CYOA too (mechanic-palette standardization). A choice's
    // `inc_var`/`dec_var` on the conventional `score` var gets a "[Your score has gone
    // up by N points…]" line. Derived generically from `meta.max_score` (shared helper),
    // so no per-pack authoring. State-free (the engine appends these events without
    // touching `next`), so determinism and every CYOA trace's hash are unchanged; and
    // when `max_score` is absent/0 — every CYOA pack today — it returns [] (a true no-op).
    decorateEvents(events: GameEvent[]): GameEvent[] {
      return scoreChangeNarrations(events, SCORE_VAR, index.pack.meta.max_score ?? 0);
    },
  };
}

/** Initial state for a pack, with the start scene's on_enter effects applied. */
export function initStateForPack(index: CyoaIndex, seed: number): GameState {
  const meta = index.pack.meta;
  const startScene = index.scenes.get(meta.start);
  return initRuntimeState({
    seed,
    start: meta.start,
    varsInit: meta.vars_init,
    flagsInit: meta.flags_init,
    onEnter: startScene?.on_enter,
  });
}
