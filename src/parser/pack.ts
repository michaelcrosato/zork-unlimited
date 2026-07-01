/**
 * Legacy parser pack loading compatibility shim.
 *
 * The RPG loader owns YAML parsing, schema validation, and content hashing. Parser
 * callers keep their historical function names until this compatibility surface is
 * removed.
 */
import {
  compileContentPack,
  loadContentPackFile,
  type CompiledContentPack,
  type ContentCompileResult,
} from "../rpg/pack.js";
import { ParserPackSchema, type ParserPack } from "./schema.js";

export type CompiledParserPack = CompiledContentPack<ParserPack>;

export type CompileResult = ContentCompileResult<ParserPack>;

export function compileParserPack(source: string): CompileResult {
  return compileContentPack(source, ParserPackSchema);
}

export function loadParserPackFile(path: string): CompileResult {
  return loadContentPackFile(path, ParserPackSchema);
}
