/**
 * MCP RPG session types.
 *
 * MCP is now a single runtime surface: RPG. The response `mode` discriminator is
 * preserved for client stability, but it has exactly one value. Legacy CYOA/parser
 * pack shapes are rejected before session creation.
 */
import type { RpgObservation } from "../rpg/observation.js";

export type PackMode = "rpg";

/**
 * Public MCP action menu entries omit reducer-only structured actions. In compact
 * observation mode, `command` is also omitted so loops can carry just stable ids.
 */
export type McpActionOption = {
  id: string;
  command?: string;
  skill_check?: RpgObservation["available_actions"][number]["skill_check"];
};

/**
 * Public MCP observations keep the RPG player view but strip the internal action
 * object. MCP clients step by `action_id`, so returning reducer payloads only
 * spends tokens and leaks engine internals.
 */
export type McpObservation = Omit<RpgObservation, "available_actions"> & {
  available_actions: McpActionOption[];
};

/**
 * Detect the only accepted MCP pack shape from parsed YAML/JSON. Use property
 * presence, not `enemies.length`: an enemy-less RPG pack is still RPG.
 */
export function isRpgPackShape(raw: unknown): raw is Record<string, unknown> {
  return raw !== null && typeof raw === "object" && "enemies" in raw;
}
