/**
 * Parser pack loading + compilation (spec §4.1, §7.3).
 *
 * YAML authoring → validated JSON runtime, mirroring the CYOA loader. `compile`
 * parses, schema-checks, and stamps a content hash that saves/traces bind to
 * (§8.7). A pack that fails the schema is never playable.
 */
import { readFileSync } from "node:fs";
import { parse as parseYaml } from "yaml";
import { hashState } from "../core/hash.js";
import { ParserPackSchema, type ParserPack } from "./schema.js";
import type { z } from "zod";

export type CompiledParserPack = {
  pack: ParserPack;
  contentHash: string;
};

export type CompileResult =
  | { ok: true; compiled: CompiledParserPack }
  | { ok: false; error: z.ZodError };

/** Parse + schema-validate raw YAML/JSON text. Returns either the pack or the Zod error. */
export function compileParserPack(source: string): CompileResult {
  const raw = parseYaml(source);
  const parsed = ParserPackSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error };
  const contentHash = hashState(parsed.data);
  return { ok: true, compiled: { pack: parsed.data, contentHash } };
}

export function loadParserPackFile(path: string): CompileResult {
  return compileParserPack(readFileSync(path, "utf8"));
}
