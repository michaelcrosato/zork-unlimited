import { compactTextWithHash } from "./compact_truncation.js";

export const MCP_ACTION_LABEL_CHAR_LIMIT = 160;
export const MCP_TRANSCRIPT_ACTION_ID_CHAR_LIMIT = 128;
const MCP_ACTION_LABEL_HASH_LENGTH = 12;
const MCP_TRANSCRIPT_ACTION_ID_HASH_LENGTH = 12;

export function compactMcpActionLabel(label: string): string {
  return compactTextWithHash(label, MCP_ACTION_LABEL_CHAR_LIMIT, MCP_ACTION_LABEL_HASH_LENGTH);
}

export function compactMcpTranscriptActionId(actionId: string): string {
  return compactTextWithHash(
    actionId,
    MCP_TRANSCRIPT_ACTION_ID_CHAR_LIMIT,
    MCP_TRANSCRIPT_ACTION_ID_HASH_LENGTH,
  );
}
