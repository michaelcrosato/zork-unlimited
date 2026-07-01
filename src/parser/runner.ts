/**
 * Legacy parser runner compatibility shim.
 *
 * Parser packs still exist while the repository is being normalized, but the
 * action loop now routes through the RPG rules engine. A parser index is the same
 * base world model with no combat indexes, so this wrapper preserves legacy
 * exports without re-owning resolver, win, score, or skill-check mechanics.
 */
import type { Action } from "../api/types.js";
import type { Rules } from "../core/engine.js";
import type { GameState } from "../core/state.js";
import { buildRpgRules, winningRpgEnding } from "../rpg/runner.js";
import type { RuntimeRngFor } from "../rpg/runtime_rng.js";
import type { ParserIndex } from "./model.js";
import { asRpgIndex } from "./rpg_compat.js";

export { indexParserPack, initStateForParserPack, type ParserIndex } from "./model.js";

/** First win condition satisfied in `state`, if any (§7.3 win_conditions). */
export function winningEnding(index: ParserIndex, state: GameState): string | null {
  return winningRpgEnding(asRpgIndex(index), state);
}

export function buildParserRules(index: ParserIndex, rngFor?: RuntimeRngFor): Rules<Action> {
  return buildRpgRules(asRpgIndex(index), rngFor);
}
