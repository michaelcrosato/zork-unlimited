/**
 * RPG pack loading + compilation (spec §4.1, §13 Stage 4). YAML → validated JSON,
 * stamping the content hash saves/traces bind to.
 */
import { readFileSync } from "node:fs";
import { parse as parseYaml } from "yaml";
import { hashState } from "../core/hash.js";
import { RpgPackSchema, type RpgPack } from "./schema.js";
import type { z } from "zod";

export type CompiledContentPack<TPack> = {
  pack: TPack;
  contentHash: string;
};

export type ContentCompileResult<TPack> =
  | { ok: true; compiled: CompiledContentPack<TPack> }
  | { ok: false; error: z.ZodError };

export type CompiledRpgPack = CompiledContentPack<RpgPack>;

export type CompileResult = ContentCompileResult<RpgPack>;

export function compileContentPack<TSchema extends z.ZodTypeAny>(
  source: string,
  schema: TSchema,
): ContentCompileResult<z.output<TSchema>> {
  const raw = parseYaml(source);
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error };
  return { ok: true, compiled: { pack: parsed.data, contentHash: hashState(parsed.data) } };
}

export function loadContentPackFile<TSchema extends z.ZodTypeAny>(
  path: string,
  schema: TSchema,
): ContentCompileResult<z.output<TSchema>> {
  return compileContentPack(readFileSync(path, "utf8"), schema);
}

export function compileRpgPack(source: string): CompileResult {
  return compileContentPack(source, RpgPackSchema);
}

export function loadRpgPackFile(path: string): CompileResult {
  return loadContentPackFile(path, RpgPackSchema);
}
