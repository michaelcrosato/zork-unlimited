/**
 * CYOA pack loading + compilation (spec §4.1, §7).
 *
 * YAML authoring → validated JSON runtime. `compilePack` is the single entry the
 * validator and runner share: it parses, schema-checks, and stamps a content hash
 * that saves/traces bind to (§8.7). A pack that fails the schema is never playable.
 */
import { readFileSync } from "node:fs";
import { parse as parseYaml } from "yaml";
import { hashState } from "../core/hash.js";
import { CyoaPackSchema, type CyoaPack } from "./schema.js";
import type { z } from "zod";

export type CompiledPack = {
  pack: CyoaPack;
  contentHash: string;
};

export type CompileResult = { ok: true; compiled: CompiledPack } | { ok: false; error: z.ZodError };

/** Parse + schema-validate raw YAML/JSON text. Returns either the pack or the Zod error. */
export function compilePack(source: string): CompileResult {
  const raw = parseYaml(source);
  const parsed = CyoaPackSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error };
  // Hash the canonical compiled content (post-defaults) so it is stable.
  const contentHash = hashState(parsed.data);
  return { ok: true, compiled: { pack: parsed.data, contentHash } };
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
  return compilePack(readFileSync(path, "utf8"));
}
