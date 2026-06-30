/**
 * Legacy parser validator compatibility shim.
 *
 * The structural validation pass now lives in the RPG-owned foundation validator.
 * Parser tests still import `validateParser` until the parser surface is removed,
 * so this wrapper keeps those legacy call sites compiling without making RPG
 * validation depend on parser modules.
 */
import type { ParserPack } from "../parser/schema.js";
import type { RpgPack } from "../rpg/schema.js";
import {
  validateRpgFoundation,
  type ValidateRpgFoundationOptions,
} from "./rpg_foundation_validator.js";

export type ValidateParserOptions = ValidateRpgFoundationOptions;

export function validateParser(
  pack: ParserPack,
  opts: ValidateParserOptions = {},
): ReturnType<typeof validateRpgFoundation> {
  return validateRpgFoundation(pack as unknown as RpgPack, opts);
}
