/**
 * ENGINE — the pure reducer (spec §8.1, §8.4, §8.5).
 *
 * `step` is the one public engine function. It must not mutate its input, must
 * not perform I/O, and must not read any clock or global RNG. All randomness
 * flows through the seeded PRNG (core/rng.ts) derived from state.seed/state.step.
 *
 * Content lives OUTSIDE the engine. The engine asks a `Rules` resolver what an
 * action means in the current state — Stage 1 (CYOA) and Stage 2 (parser) each
 * supply their own resolver over the same core. This is the Layer-2/Layer-3
 * boundary (§3): the single most important invariant in the system.
 */
import type { GameState } from "./state.js";
import type { GameEvent } from "./events.js";
import type { Condition } from "./conditions.js";
import { evalConditions } from "./conditions.js";
import type { Effect } from "./effects.js";
import { applyEffects } from "./effects.js";
import { canonicalize } from "./hash.js";
import type { Action, StepResult } from "../api/types.js";

/** What an action resolves to in a given state. `null` ⇒ no such rule. */
export type Resolution = {
  conditions: Condition[];
  effects: Effect[];
};

/**
 * The content layer's contract with the engine. A resolver is pure: same state
 * + same action ⇒ same resolution. It never touches I/O or randomness.
 */
export type Rules = {
  /** The legal-action set for this state (Jericho-style, §9). Ground truth for legality. */
  legalActions(state: GameState): Action[];
  /** Conditions + effects for an action, or null if the action has no rule here. */
  resolve(state: GameState, action: Action): Resolution | null;
  /** Effects fired when a location is entered (scene/room `on_enter`, §8.4 step 4). */
  onEnter?(state: GameState, locationId: string): Effect[];
};

/** Structural equality for actions — used to test membership in the legal set. */
export function actionEquals(a: Action, b: Action): boolean {
  return canonicalize(a) === canonicalize(b);
}

function reject(state: GameState, reason: string): StepResult {
  const events: GameEvent[] = [{ type: "rejected", reason }];
  return { state, events, ok: false, rejectionReason: reason };
}

/**
 * Build the pure `step(state, action)` for a given rule set. The returned
 * function matches the §8.1 signature exactly.
 */
export function makeStep(rules: Rules) {
  return function step(state: GameState, action: Action): StepResult {
    // A finished game accepts no further actions. No state change.
    if (state.ended) return reject(state, "The game has already ended.");

    // §8.4.1 — legality against the legal-action set. No state change on failure.
    const legal = rules.legalActions(state).some((a) => actionEquals(a, action));
    if (!legal) return reject(state, "That action is not available right now.");

    const resolution = rules.resolve(state, action);
    if (resolution === null) return reject(state, "That action has no effect here.");

    // §8.4.2 — conditions. No state change on failure.
    if (!evalConditions(resolution.conditions, state)) {
      return reject(state, "You can't do that yet.");
    }

    // §8.4.3 — apply effects in declared order, one event each.
    const before = state.current;
    const applied = applyEffects(resolution.effects, state);
    let next = applied.state;
    const events: GameEvent[] = [...applied.events];

    // §8.4.4 — on_enter effects when a location transition occurred.
    if (rules.onEnter && next.current !== before && !next.ended) {
      const enter = applyEffects(rules.onEnter(next, next.current), next);
      next = enter.state;
      events.push(...enter.events);
    }

    // §8.4.6 — advance the step counter (state hash is recomputed by callers/trace).
    next = { ...next, step: next.step + 1 };

    return { state: next, events, ok: true };
  };
}
