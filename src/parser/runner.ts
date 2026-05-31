/**
 * Parser runner (spec §8.4, §9.2) — adapts a validated parser pack into the
 * engine's `Rules` resolver. The engine stays content-free (§3): it asks this
 * resolver for the legal-action set and for what an action means, and fires
 * `onEnter` on room transitions.
 *
 * Win conditions are evaluated on room entry (`onEnter`) against the entering
 * state — the common "reach room / visited X" trigger — and append an
 * `end_game` effect when met. (A win that must fire without a move would need a
 * post-action hook; out of scope for v1 and documented here so packs target
 * room-entry wins, e.g. §7.3's `{ visited: catacombs }`.)
 */
import { evalConditions } from "../core/conditions.js";
import type { Effect } from "../core/effects.js";
import type { Action } from "../api/types.js";
import type { GameState } from "../core/state.js";
import type { Resolution, Rules } from "../core/engine.js";
import { type ParserIndex } from "./model.js";
import { enumerateActions, resolveParserAction } from "./legal_actions.js";

export { indexParserPack, initStateForParserPack, type ParserIndex } from "./model.js";

/** First win condition satisfied in `state`, if any (§7.3 win_conditions). */
export function winningEnding(index: ParserIndex, state: GameState): string | null {
  for (const wc of index.pack.win_conditions) {
    if (evalConditions(wc.conditions, state)) return wc.ending;
  }
  return null;
}

export function buildParserRules(index: ParserIndex): Rules {
  return {
    legalActions(state: GameState): Action[] {
      return enumerateActions(index, state).map((o) => o.action);
    },

    resolve(state: GameState, action: Action): Resolution | null {
      return resolveParserAction(index, state, action);
    },

    onEnter(state: GameState, locationId: string): Effect[] {
      const room = index.rooms.get(locationId);
      const effects: Effect[] = room ? [...room.on_enter] : [];
      const ending = winningEnding(index, state);
      if (ending) effects.push({ end_game: ending });
      return effects;
    },
  };
}
