import { compactTextWithHash } from "./compact_truncation.js";

export const MCP_ACTION_LABEL_CHAR_LIMIT = 160;
export const MCP_TRANSCRIPT_ACTION_ID_CHAR_LIMIT = 128;
export const MCP_TRANSCRIPT_SCENE_ID_CHAR_LIMIT = 128;
export const MCP_TRANSCRIPT_TITLE_CHAR_LIMIT = 160;
const MCP_ACTION_LABEL_HASH_LENGTH = 12;
const MCP_TRANSCRIPT_ACTION_ID_HASH_LENGTH = 12;
const MCP_TRANSCRIPT_SCENE_ID_HASH_LENGTH = 12;
const MCP_TRANSCRIPT_TITLE_HASH_LENGTH = 12;

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

export function compactMcpTranscriptSceneId(sceneId: string): string {
  return compactTextWithHash(
    sceneId,
    MCP_TRANSCRIPT_SCENE_ID_CHAR_LIMIT,
    MCP_TRANSCRIPT_SCENE_ID_HASH_LENGTH,
  );
}

export function compactMcpTranscriptTitle(title: string): string {
  return compactTextWithHash(
    title,
    MCP_TRANSCRIPT_TITLE_CHAR_LIMIT,
    MCP_TRANSCRIPT_TITLE_HASH_LENGTH,
  );
}
