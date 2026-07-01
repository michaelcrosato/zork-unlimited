/**
 * Legacy parser-to-RPG index adapters.
 *
 * Parser packs are being retired, but their tests and fixtures still exercise
 * parser import paths. These adapters keep all parser shims on one explicit
 * bridge into the canonical RPG runtime.
 */
import type { RpgModelIndex } from "../rpg/model.js";
import type { RpgIndex } from "../rpg/runner.js";
import type { Enemy, RpgPack } from "../rpg/schema.js";
import type { ParserIndex } from "./model.js";

export const asRpgModelIndex = (index: ParserIndex): RpgModelIndex =>
  index as unknown as RpgModelIndex;

export const asRpgIndex = (index: ParserIndex): RpgIndex => ({
  ...(index as unknown as RpgIndex),
  rpgPack: index.pack as unknown as RpgPack,
  enemies: new Map<string, Enemy>(),
  enemyByRoom: new Map<string, Enemy[]>(),
});
