/**
 * Legacy CYOA pack loading compatibility shim.
 *
 * The RPG loader owns YAML parsing, schema validation, and content hashing. CYOA
 * callers keep their historical names until this compatibility surface is removed.
 */
import {
  compileContentPack,
  loadContentPackFile,
  type CompiledContentPack,
  type ContentCompileResult,
} from "../rpg/pack.js";
import { CyoaPackSchema, type CyoaPack } from "./schema.js";

export type CompiledPack = CompiledContentPack<CyoaPack>;

export type CompileResult = ContentCompileResult<CyoaPack>;

export function compilePack(source: string): CompileResult {
  return compileContentPack(source, CyoaPackSchema);
}

/** Convenience: compile and throw on schema failure. Use when a pack is known-good. */
export function compilePackOrThrow(source: string): CompiledPack {
  const result = compilePack(source);
  if (!result.ok) {
    throw new Error(`Pack failed schema validation:\n${result.error.toString()}`);
  }
  return result.compiled;
}

export function loadPackFile(path: string): CompileResult {
  return loadContentPackFile(path, CyoaPackSchema);
}
