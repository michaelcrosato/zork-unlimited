import { compactText } from "./compact_truncation.js";

/**
 * Journal entries are player-facing memory, not identity-bearing keys. Keep the
 * shipped prose whole while bounding future authoring without exposing the hash
 * suffix reserved for ids and other collision-sensitive scalar values.
 */
export const MCP_VISIBLE_JOURNAL_PROSE_CHAR_LIMIT = 320;

export function compactMcpVisibleJournalProse(value: string): string {
  return compactText(value, MCP_VISIBLE_JOURNAL_PROSE_CHAR_LIMIT);
}
