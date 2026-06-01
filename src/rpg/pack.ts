/**
 * RPG pack loading + compilation (spec §4.1, §13 Stage 4). YAML → validated JSON,
 * mirroring the CYOA/parser loaders; stamps the content hash saves/traces bind to.
 */
import { readFileSync } from "node:fs";
import { parse as parseYaml } from "yaml";
import { hashState } from "../core/hash.js";
import { RpgPackSchema, type RpgPack } from "./schema.js";
import type { z } from "zod";

export type CompiledRpgPack = {
  pack: RpgPack;
  contentHash: string;
};

export type CompileResult =
  | { ok: true; compiled: CompiledRpgPack }
  | { ok: false; error: z.ZodError };

export function compileRpgPack(source: string): CompileResult {
  const raw = parseYaml(source);
  const parsed = RpgPackSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error };
  return { ok: true, compiled: { pack: parsed.data, contentHash: hashState(parsed.data) } };
}

export function loadRpgPackFile(path: string): CompileResult {
  return compileRpgPack(readFileSync(path, "utf8"));
}
