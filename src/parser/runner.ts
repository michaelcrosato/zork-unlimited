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

    checkWin(state: GameState): Effect[] {
      const ending = winningEnding(index, state);
      return ending ? [{ end_game: ending }] : [];
    },
  };
}
