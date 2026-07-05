import { describe, expect, it } from "vitest";

import {
  compactMcpTranscriptActionId,
  compactMcpTranscriptSceneId,
  compactMcpTranscriptSummaryValue,
  compactMcpTranscriptTitle,
  MCP_ACTION_LABEL_CHAR_LIMIT,
  MCP_TRANSCRIPT_ACTION_ID_CHAR_LIMIT,
  MCP_TRANSCRIPT_SCENE_ID_CHAR_LIMIT,
  MCP_TRANSCRIPT_SUMMARY_VALUE_CHAR_LIMIT,
  MCP_TRANSCRIPT_TITLE_CHAR_LIMIT,
} from "../../src/mcp/action_labels.js";
import { publicActions } from "../../src/mcp/rpg_view_projection.js";
import type { RpgActionOption } from "../../src/rpg/legal_actions.js";

function option(command: string): RpgActionOption {
  return {
    id: "use_long_template",
    command,
    action: { type: "LOOK" },
  };
}

describe("MCP action labels", () => {
  it("caps public action command labels without changing action ids", () => {
    const command = `use ${"x".repeat(400)}a`;
    const samePrefixCommand = `use ${"x".repeat(400)}b`;
    const [row] = publicActions([option(command)]);
    const [samePrefixRow] = publicActions([option(samePrefixCommand)]);

    expect(row?.id).toBe("use_long_template");
    expect(row?.command).not.toBe(command);
    expect(row?.command).toHaveLength(MCP_ACTION_LABEL_CHAR_LIMIT);
    expect(row?.command).toMatch(/^use x+/);
    expect(row?.command).toMatch(/\.\.\.\(\+\d+ chars\)#[0-9a-f]{12}$/);
    expect(samePrefixRow?.command).not.toBe(row?.command);
  });

  it("leaves short labels exact and omits labels for compact action rows", () => {
    const [fullRow] = publicActions([option("look")]);
    const [compactRow] = publicActions([option("look")], { compactActions: true });

    expect(fullRow?.command).toBe("look");
    expect(compactRow).toEqual({ id: "use_long_template" });
  });

  it("caps transcript action ids while preserving short ids exactly", () => {
    const actionId = `use_${"x".repeat(400)}a`;
    const samePrefixActionId = `use_${"x".repeat(400)}b`;
    const compact = compactMcpTranscriptActionId(actionId);
    const samePrefixCompact = compactMcpTranscriptActionId(samePrefixActionId);

    expect(compact).not.toBe(actionId);
    expect(compact).toHaveLength(MCP_TRANSCRIPT_ACTION_ID_CHAR_LIMIT);
    expect(compact).toMatch(/^use_x+/);
    expect(compact).toMatch(/\.\.\.\(\+\d+ chars\)#[0-9a-f]{12}$/);
    expect(samePrefixCompact).not.toBe(compact);
    expect(compactMcpTranscriptActionId("take_circlet")).toBe("take_circlet");
  });

  it("caps transcript scene ids and titles while preserving short values exactly", () => {
    const sceneId = `room_${"x".repeat(400)}a`;
    const title = `Room ${"x".repeat(400)}a`;

    expect(compactMcpTranscriptSceneId(sceneId)).toHaveLength(MCP_TRANSCRIPT_SCENE_ID_CHAR_LIMIT);
    expect(compactMcpTranscriptSceneId(sceneId)).toMatch(
      /^room_x+.*\.\.\.\(\+\d+ chars\)#[0-9a-f]{12}$/,
    );
    expect(compactMcpTranscriptTitle(title)).toHaveLength(MCP_TRANSCRIPT_TITLE_CHAR_LIMIT);
    expect(compactMcpTranscriptTitle(title)).toMatch(
      /^Room x+.*\.\.\.\(\+\d+ chars\)#[0-9a-f]{12}$/,
    );
    expect(compactMcpTranscriptSceneId("barrow_mouth")).toBe("barrow_mouth");
    expect(compactMcpTranscriptTitle("Barrow Mouth")).toBe("Barrow Mouth");
  });

  it("caps transcript summary values while preserving short values exactly", () => {
    const value = `flag_${"x".repeat(400)}a`;
    const samePrefixValue = `flag_${"x".repeat(400)}b`;
    const compact = compactMcpTranscriptSummaryValue(value);

    expect(compact).not.toBe(value);
    expect(compact).toHaveLength(MCP_TRANSCRIPT_SUMMARY_VALUE_CHAR_LIMIT);
    expect(compact).toMatch(/^flag_x+/);
    expect(compact).toMatch(/\.\.\.\(\+\d+ chars\)#[0-9a-f]{12}$/);
    expect(compactMcpTranscriptSummaryValue(samePrefixValue)).not.toBe(compact);
    expect(compactMcpTranscriptSummaryValue("flag_short")).toBe("flag_short");
  });
});
