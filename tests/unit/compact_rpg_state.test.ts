import { describe, expect, it } from "vitest";

import type { GameState } from "../../src/core/state.js";
import {
  COMPACT_STATE_FLAG_LIMIT,
  COMPACT_STATE_INVENTORY_LIMIT,
  COMPACT_STATE_JOURNAL_LIMIT,
  COMPACT_STATE_OBJECT_CONTENT_LIMIT,
  COMPACT_STATE_OBJECT_LIMIT,
  COMPACT_STATE_QUEST_LIMIT,
  COMPACT_STATE_VAR_LIMIT,
  COMPACT_STATE_VISITED_LIMIT,
  RPG_COMPACT_STATE_VERSION,
  compactRpgState,
} from "../../src/mcp/compact_rpg_state.js";
import {
  MCP_TRANSCRIPT_SCENE_ID_CHAR_LIMIT,
  MCP_TRANSCRIPT_SUMMARY_VALUE_CHAR_LIMIT,
} from "../../src/mcp/action_labels.js";
import { MCP_VISIBLE_JOURNAL_PROSE_CHAR_LIMIT } from "../../src/mcp/journal_prose.js";

function ids(prefix: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => `${prefix}_${i.toString().padStart(2, "0")}`);
}

function largeState(): GameState {
  return {
    seed: 99,
    step: 23,
    current: "room_00",
    visited: Object.fromEntries(
      ids("room", COMPACT_STATE_VISITED_LIMIT + 4).map((id) => [id, true]),
    ),
    flags: {
      ...Object.fromEntries(ids("flag", COMPACT_STATE_FLAG_LIMIT + 4).map((id) => [id, true])),
      __internal_flag: true,
      cleared_flag: false,
    },
    vars: {
      hp: 7,
      attack: 2,
      defense: 1,
      score: 5,
      max_score: 100,
      __enemy_hp_wight: 3,
      ...Object.fromEntries(
        ids("skill", COMPACT_STATE_VAR_LIMIT + 3).map((id, index) => [id, index + 1]),
      ),
    },
    inventory: ids("item", COMPACT_STATE_INVENTORY_LIMIT + 4),
    objectState: Object.fromEntries(
      ids("object", COMPACT_STATE_OBJECT_LIMIT + 4).map((id, index) => [
        id,
        {
          open: index % 2 === 0,
          locked: index % 3 === 0,
          contents: ids(`contained_${index}`, COMPACT_STATE_OBJECT_CONTENT_LIMIT + 2),
          room: `room_${index}`,
          takenBy: index % 2 === 0 ? "world" : "player",
        },
      ]),
    ),
    journal: ids("journal", COMPACT_STATE_JOURNAL_LIMIT + 5),
    questStage: Object.fromEntries(
      ids("quest", COMPACT_STATE_QUEST_LIMIT + 4).map((id, index) => [id, `stage_${index}`]),
    ),
    ended: false,
    endingId: null,
  };
}

describe("compactRpgState", () => {
  it("caps unbounded runtime buckets and hides internal mechanics keys", () => {
    const state = largeState();
    const compact = compactRpgState(state, { maxScore: 42 });

    expect(compact.v).toBe(RPG_COMPACT_STATE_VERSION);
    expect(RPG_COMPACT_STATE_VERSION).toBe(2);
    expect(compact.at).toBe("room_00");
    expect(compact.step).toBe(23);
    expect(compact.seed).toBe(99);
    expect(compact.vitals).toEqual([7, 2, 1, 5, 42]);
    expect(compact.inv).toEqual(ids("item", COMPACT_STATE_INVENTORY_LIMIT));
    expect(compact.flags).toEqual(ids("flag", COMPACT_STATE_FLAG_LIMIT));
    expect(Object.keys(compact.vars ?? {})).toEqual(ids("skill", COMPACT_STATE_VAR_LIMIT));
    expect(compact.vars).not.toHaveProperty("hp");
    expect(compact.vars).not.toHaveProperty("score");
    expect(compact.vars).not.toHaveProperty("__enemy_hp_wight");
    expect(compact.journal).toEqual(ids("journal", COMPACT_STATE_JOURNAL_LIMIT + 5).slice(-5));
    expect(compact.visited).toEqual(ids("room", COMPACT_STATE_VISITED_LIMIT));
    expect(compact.objects).toHaveLength(COMPACT_STATE_OBJECT_LIMIT);
    expect(compact.objects?.[0]).toMatchObject({
      id: "object_00",
      open: true,
      locked: true,
      by: "w",
      room: "room_0",
      contents_more: 2,
    });
    expect(compact.objects?.[0]?.contents).toHaveLength(COMPACT_STATE_OBJECT_CONTENT_LIMIT);
    expect(compact.quests).toHaveLength(COMPACT_STATE_QUEST_LIMIT);
    expect(compact.quests?.[0]).toEqual(["quest_00", "stage_0"]);
    expect(compact.more).toEqual([4, 4, 3, 5, 4, 4, 4]);
    expect(JSON.stringify(compact)).not.toContain("__internal_flag");
  });

  it("caps long scalar identity fields in compact state only", () => {
    const longRoom = `room_${"x".repeat(400)}a`;
    const longId = `id_${"x".repeat(400)}a`;
    const longVar = `var_${"x".repeat(400)}a`;
    const longQuest = `quest_${"x".repeat(400)}a`;
    const longStage = `stage_${"x".repeat(400)}a`;
    const longJournal = `Journal ${"x".repeat(400)}a`;
    const state: GameState = {
      seed: 1,
      step: 1,
      current: longRoom,
      visited: { [longRoom]: true },
      flags: { [longId]: true },
      vars: { hp: 8, attack: 2, defense: 1, score: 5, [longVar]: 7 },
      inventory: [longId],
      objectState: {
        [longId]: {
          locked: false,
          room: longRoom,
          contents: [longId],
        },
      },
      journal: [longJournal],
      questStage: { [longQuest]: longStage },
      ended: true,
      endingId: longId,
    };

    const compact = compactRpgState(state, { maxScore: 10 });
    const compactVarKey = Object.keys(compact.vars ?? {})[0];

    expect(compact.at).toHaveLength(MCP_TRANSCRIPT_SCENE_ID_CHAR_LIMIT);
    expect(compact.inv?.[0]).toHaveLength(MCP_TRANSCRIPT_SUMMARY_VALUE_CHAR_LIMIT);
    expect(compact.flags?.[0]).toHaveLength(MCP_TRANSCRIPT_SUMMARY_VALUE_CHAR_LIMIT);
    expect(compactVarKey).toHaveLength(MCP_TRANSCRIPT_SUMMARY_VALUE_CHAR_LIMIT);
    expect(compact.journal?.[0]).toHaveLength(MCP_VISIBLE_JOURNAL_PROSE_CHAR_LIMIT);
    expect(compact.journal?.[0]).toMatch(/\.\.\.\(\+\d+ chars\)$/);
    expect(compact.journal?.[0]).not.toMatch(/#[0-9a-f]{12}$/);
    expect(compact.visited?.[0]).toHaveLength(MCP_TRANSCRIPT_SCENE_ID_CHAR_LIMIT);
    expect(compact.objects?.[0]?.id).toHaveLength(MCP_TRANSCRIPT_SUMMARY_VALUE_CHAR_LIMIT);
    expect(compact.objects?.[0]?.room).toHaveLength(MCP_TRANSCRIPT_SCENE_ID_CHAR_LIMIT);
    expect(compact.objects?.[0]?.contents?.[0]).toHaveLength(
      MCP_TRANSCRIPT_SUMMARY_VALUE_CHAR_LIMIT,
    );
    expect(compact.quests?.[0]?.[0]).toHaveLength(MCP_TRANSCRIPT_SUMMARY_VALUE_CHAR_LIMIT);
    expect(compact.quests?.[0]?.[1]).toHaveLength(MCP_TRANSCRIPT_SUMMARY_VALUE_CHAR_LIMIT);
    expect(compact.ending_id).toHaveLength(MCP_TRANSCRIPT_SUMMARY_VALUE_CHAR_LIMIT);
    expect(JSON.stringify(compact)).not.toContain("x".repeat(300));
  });
});
