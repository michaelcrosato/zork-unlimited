/**
 * Legacy parser legal-action compatibility shim.
 *
 * The canonical object/dialogue/action resolver now lives in the RPG runtime.
 * Parser tests and fixtures still import these names until the legacy parser
 * surface is removed, so this file keeps the API while routing all action-loop
 * mechanics through the single RPG implementation.
 */
import type { Action } from "../api/types.js";
import type { Resolution } from "../core/engine.js";
import type { GameState } from "../core/state.js";
import {
  enumerateRpgBaseActions,
  present as rpgPresent,
  resolveRpgAction,
  useInteraction as rpgUseInteraction,
  type RpgActionOption,
} from "../rpg/legal_actions.js";
import type { ParserIndex } from "./model.js";
import { asRpgModelIndex } from "./rpg_compat.js";
import type { Interaction } from "./schema.js";

export type ParserActionOption = RpgActionOption;

/** True if `id` is reachable for the player right now (held or visible in the room). */
export function present(index: ParserIndex, state: GameState, id: string): boolean {
  return rpgPresent(asRpgModelIndex(index), state, id);
}

/** Find the USE interaction, if any, for using `item` on `target`. */
export function useInteraction(
  index: ParserIndex,
  target: string,
  item?: string,
): Interaction | undefined {
  return rpgUseInteraction(asRpgModelIndex(index), target, item) as unknown as
    | Interaction
    | undefined;
}

export function resolveParserAction(
  index: ParserIndex,
  state: GameState,
  action: Action,
): Resolution | null {
  return resolveRpgAction(asRpgModelIndex(index), state, action);
}

export function enumerateActions(index: ParserIndex, state: GameState): ParserActionOption[] {
  return enumerateRpgBaseActions(asRpgModelIndex(index), state);
}
