/**
 * MCP multi-mode dispatch types (roadmap Milestone 1, item 1a-1).
 *
 * The MCP tools play CYOA, parser, and RPG packs through one session abstraction.
 * Mode is detected from the pack's STRUCTURE — never a field added to content, so
 * content stays unchanged (§16) and existing packs keep their hashes. Detection
 * keys off property PRESENCE, not array contents: an RPG pack is a parser pack
 * plus `enemies` (which defaults to `[]`), so we must check `"enemies" in pack`,
 * not `enemies.length` — otherwise an enemy-less RPG pack would run as parser.
 */
import type { CyoaIndex } from "../cyoa/runner.js";
import type { ParserIndex } from "../parser/model.js";
import type { RpgIndex } from "../rpg/runner.js";
import type { CyoaObservation } from "../cyoa/observation.js";
import type { ParserObservation } from "../parser/observation.js";
import type { RpgObservation } from "../rpg/observation.js";
import type { CompiledPack } from "../cyoa/pack.js";
import type { CompiledParserPack } from "../parser/pack.js";
import type { CompiledRpgPack } from "../rpg/pack.js";

export type PackMode = "cyoa" | "parser" | "rpg";

/** Any mode's compiled-pack index. Sessions carry exactly one. */
export type AnyIndex = CyoaIndex | ParserIndex | RpgIndex;

/** Any mode's AI-facing observation. The `mode` field is the discriminator. */
export type AnyObservation = CyoaObservation | ParserObservation | RpgObservation;

/** Any mode's compiled pack (pack + content hash). */
export type AnyCompiledPack = CompiledPack | CompiledParserPack | CompiledRpgPack;

/**
 * Detect a pack's mode from the parsed YAML/JSON object. Order matters: an RPG
 * pack also has `rooms`, so test `enemies` first. Pure, total.
 */
export function detectMode(raw: unknown): PackMode {
  if (raw !== null && typeof raw === "object") {
    if ("enemies" in raw) return "rpg";
    if ("rooms" in raw) return "parser";
  }
  return "cyoa";
}
