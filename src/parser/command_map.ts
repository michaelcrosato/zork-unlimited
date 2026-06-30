/**
 * Legacy parser command-map compatibility shim.
 *
 * The controlled text command mapper now lives in the RPG runtime. Parser tests
 * still import `parseCommand` until the legacy parser surface is removed, so this
 * wrapper preserves that API without making the RPG CLI import parser modules.
 */
import type { GameState } from "../core/state.js";
import type { ParserIndex } from "./model.js";
import { parseCommand as parseRpgCommand, type ParseResult } from "../rpg/command_map.js";
import type { RpgModelIndex } from "../rpg/model.js";

export type { ParseResult };

export function parseCommand(index: ParserIndex, state: GameState, raw: string): ParseResult {
  return parseRpgCommand(index as unknown as RpgModelIndex, state, raw);
}
