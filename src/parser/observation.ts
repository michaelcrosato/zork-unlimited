/**
 * Legacy parser observation compatibility shim.
 *
 * The canonical player/agent view is now the RPG observation builder. Parser
 * callers keep their historical import path and shape while the shared runtime
 * owns room text, visible objects, exits, dialogue, score, and legal actions.
 */
import type { Action } from "../api/types.js";
import type { GameState } from "../core/state.js";
import {
  buildRpgObservation,
  type ObservationOptions,
  type RpgObservation,
} from "../rpg/observation.js";
import type { ParserIndex } from "./model.js";
import { asRpgIndex } from "./rpg_compat.js";

export type { ObservationOptions };

export type ParserObservation = Omit<
  RpgObservation,
  "mode" | "enemies_present" | "stats" | "available_actions"
> & {
  mode: "parser";
  available_actions: {
    id: string;
    command: string;
    action: Action;
    skill_check?: { skill: string; difficulty: number; die: string };
  }[];
};

export function buildParserObservation(
  index: ParserIndex,
  state: GameState,
  opts: ObservationOptions = {},
): ParserObservation {
  const {
    enemies_present: _enemies,
    stats: _stats,
    ...base
  } = buildRpgObservation(asRpgIndex(index), state, opts);
  return { ...base, mode: "parser" };
}
