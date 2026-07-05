import { compactTextWithHash } from "./compact_truncation.js";

export const MCP_ACTION_LABEL_CHAR_LIMIT = 160;
const MCP_ACTION_LABEL_HASH_LENGTH = 12;

export function compactMcpActionLabel(label: string): string {
  return compactTextWithHash(label, MCP_ACTION_LABEL_CHAR_LIMIT, MCP_ACTION_LABEL_HASH_LENGTH);
}
