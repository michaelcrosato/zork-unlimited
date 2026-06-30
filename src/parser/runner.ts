/**
 * Parser runner (spec §8.4, §9.2) — adapts a validated parser pack into the
 * engine's `Rules` resolver. The engine stays content-free (§3): it asks this
 * resolver for the legal-action set and for what an action means, and fires
 * `onEnter` on room transitions.
 *
 * Win conditions are evaluated in two complementary places against the same
 * `winningEnding` predicate, so a pack can trigger its ending on whichever beat is
 * dramatically right:
 *   - `onEnter` — on room entry, the common "reach room / visited X" trigger
 *     (e.g. §7.3's `{ visited: catacombs }`).
 *   - `checkWin` — after ANY action's effects, even with no move, for a win that
 *     turns on a deliberate non-move action: taking the goal item, administering a
 *     cure. A pack expresses this by adding the act's post-condition to the win
 *     (e.g. `{ has_item: circlet }` alongside `{ visited: relic_chamber }`), so the
 *     ending fires on the climactic TAKE instead of on bare room entry. The engine
 *     skips `checkWin` once the game has ended, so the two paths never double-fire.
 */
import { evalConditions } from "../core/conditions.js";
import type { Effect } from "../core/effects.js";
import type { Action } from "../api/types.js";
import type { GameState } from "../core/state.js";
import type { GameEvent } from "../core/events.js";
import type { Resolution, Rules } from "../core/engine.js";
import { rngForStep, type Rng } from "../core/rng.js";
import { scoreChangeNarrations } from "../core/score_chrome.js";
import { resolveSkillCheck } from "../core/skill_check.js";
import { type ParserIndex } from "./model.js";
import { enumerateActions, present, resolveParserAction, useInteraction } from "./legal_actions.js";
import { SCORE_VAR } from "./schema.js";

export { indexParserPack, initStateForParserPack, type ParserIndex } from "./model.js";

/** First win condition satisfied in `state`, if any (§7.3 win_conditions). */
export function winningEnding(index: ParserIndex, state: GameState): string | null {
  for (const wc of index.pack.win_conditions) {
    if (evalConditions(wc.conditions, state)) return wc.ending;
  }
  return null;
}

export function buildParserRules(
  index: ParserIndex,
  rngFor: (state: GameState) => Rng = (s) => rngForStep(s.seed, s.step),
): Rules {
  const maxScore = index.pack.meta.max_score ?? 0;
  return {
    legalActions(state: GameState): Action[] {
      return enumerateActions(index, state).map((o) => o.action);
    },

    resolve(state: GameState, action: Action): Resolution | null {
      // A USE interaction may carry a seeded skill check (the Stage-4 mechanic, now available in
      // PARSER mode too — palette standardization, so a puzzle pack can roll a lockpick/might/nerve
      // check without becoming an RPG). Resolved here exactly as the RPG runner does: offer-legality
      // still requires holding the item AND meeting the interaction's own conditions, so a one-shot
      // check can't be re-fired by a forced/stale step and re-roll a contradictory result. `rngFor`
      // is the verification seam — default is the step-keyed PRNG, so production play is
      // byte-identical and replayable (§8.5); proofs pass a forced best/worst roll.
      if (action.type === "USE") {
        const it = useInteraction(index, action.target, action.item);
        if (it?.skill_check) {
          if (!present(index, state, action.target)) return null;
          if (action.item !== undefined && !state.inventory.includes(action.item)) return null;
          if (!evalConditions(it.conditions, state)) return null;
          return resolveSkillCheck(state, it.skill_check, rngFor(state));
        }
      }
      return resolveParserAction(index, state, action);
    },

    onEnter(state: GameState, locationId: string): Effect[] {
      const room = index.rooms.get(locationId);
      const effects: Effect[] = room ? [...room.on_enter] : [];
      const ending = winningEnding(index, state);
      if (ending) effects.push({ end_game: ending });
      return effects;
    },

    checkWin(state: GameState): Effect[] {
      const ending = winningEnding(index, state);
      return ending ? [{ end_game: ending }] : [];
    },

    decorateEvents(events: GameEvent[]): GameEvent[] {
      return scoreChangeNarrations(events, SCORE_VAR, maxScore);
    },
  };
}
