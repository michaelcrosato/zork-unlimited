/**
 * MCP RPG session types.
 *
 * MCP is now a single runtime surface: RPG. The response `mode` discriminator is
 * preserved for client stability, but it has exactly one value. Legacy CYOA/parser
 * pack shapes are rejected before session creation.
 */
import type { RpgIndex } from "../rpg/runner.js";
import type { RpgObservation } from "../rpg/observation.js";
import type { CompiledRpgPack } from "../rpg/pack.js";

export type PackMode = "rpg";

/** The compiled-pack index held by an MCP game session. */
export type AnyIndex = RpgIndex;

/** The AI-facing observation returned by MCP game-session tools. */
export type AnyObservation = RpgObservation;

/** Public MCP action menu entries omit reducer-only structured actions. */
export type McpActionOption = Omit<RpgObservation["available_actions"][number], "action">;

/**
 * Public MCP observations keep the RPG player view but strip the internal action
 * object. MCP clients step by `action_id`, so returning reducer payloads only
 * spends tokens and leaks engine internals.
 */
export type McpObservation = Omit<RpgObservation, "available_actions"> & {
  available_actions: McpActionOption[];
};

/** A compiled RPG pack (pack + content hash). */
export type AnyCompiledPack = CompiledRpgPack;

/**
 * Detect the only accepted MCP pack shape from parsed YAML/JSON. Use property
 * presence, not `enemies.length`: an enemy-less RPG pack is still RPG.
 */
export function isRpgPackShape(raw: unknown): raw is Record<string, unknown> {
  return raw !== null && typeof raw === "object" && "enemies" in raw;
}
