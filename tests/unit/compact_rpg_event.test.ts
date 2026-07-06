import { describe, expect, it } from "vitest";

import {
  COMPACT_EVENT_DIAGNOSTIC_CHAR_LIMIT,
  COMPACT_EVENT_JOURNAL_CHAR_LIMIT,
  COMPACT_EVENT_NARRATION_CHAR_LIMIT,
  COMPACT_EVENT_REJECTION_CHAR_LIMIT,
  compactPlayerEvent,
  RPG_COMPACT_EVENT_VERSION,
} from "../../src/mcp/compact_rpg_event.js";
import {
  MCP_TRANSCRIPT_SCENE_ID_CHAR_LIMIT,
  MCP_TRANSCRIPT_SUMMARY_VALUE_CHAR_LIMIT,
} from "../../src/mcp/action_labels.js";
import type { GameEvent } from "../../src/core/events.js";

describe("compactPlayerEvent", () => {
  it("uses the v6 single-character event contract", () => {
    expect(RPG_COMPACT_EVENT_VERSION).toBe(6);
    expect(compactPlayerEvent({ type: "rejected", reason: "no" })).toEqual(["r", "no"]);
    expect(compactPlayerEvent({ type: "move", from: "yard", to: "road" })).toEqual([
      "m",
      "yard",
      "road",
    ]);
  });

  it("preserves compact state-change identity without long effect names", () => {
    expect(compactPlayerEvent({ type: "state_change", effect: "set_flag", flag: "lit" })).toEqual([
      "s",
      "f",
      "lit",
    ]);
    expect(compactPlayerEvent({ type: "state_change", effect: "clear_flag", flag: "lit" })).toEqual(
      ["s", "x", "lit"],
    );
    expect(
      compactPlayerEvent({ type: "state_change", effect: "set_var", name: "score", value: 10 }),
    ).toEqual(["s", "v", "score", 10]);
    expect(
      compactPlayerEvent({
        type: "state_change",
        effect: "inc_var",
        name: "score",
        value: 15,
        delta: 5,
      }),
    ).toEqual(["s", "+", "score", 5, 15]);
    expect(
      compactPlayerEvent({
        type: "state_change",
        effect: "dec_var",
        name: "hp",
        value: 7,
        delta: -3,
      }),
    ).toEqual(["s", "-", "hp", -3, 7]);
    expect(
      compactPlayerEvent({ type: "state_change", effect: "add_journal", text: "noted" }),
    ).toEqual(["s", "j", "noted"]);
  });

  it("keeps object and quest state-change fields in compact events", () => {
    expect(
      compactPlayerEvent({
        type: "state_change",
        effect: "set_object_locked",
        id: "chest",
        locked: false,
      }),
    ).toEqual(["s", "l", "chest", false]);
    expect(
      compactPlayerEvent({
        type: "state_change",
        effect: "place_object",
        id: "lantern",
        room: "cellar",
      }),
    ).toEqual(["s", "p", "lantern", "cellar"]);
    expect(
      compactPlayerEvent({
        type: "state_change",
        effect: "set_quest_stage",
        quest: "main",
        stage: "act2",
      }),
    ).toEqual(["s", "q", "main", "act2"]);
  });

  it("keeps diagnostics on compact var events when runtime guards fire", () => {
    const event: GameEvent = {
      type: "state_change",
      effect: "inc_var",
      name: "score",
      value: Number.MAX_VALUE,
      delta: 0,
      diagnostic: "non-finite rejected",
    };

    expect(compactPlayerEvent(event)).toEqual([
      "s",
      "+",
      "score",
      0,
      Number.MAX_VALUE,
      "non-finite rejected",
    ]);
  });

  it("caps prose-bearing compact event fields", () => {
    const longNarration = "narration ".repeat(80);
    const longRejection = "rejected ".repeat(40);
    const longJournal = "journal ".repeat(80);
    const longDiagnostic = "diagnostic ".repeat(40);
    const longFallback = "fallback ".repeat(80);

    const narration = compactPlayerEvent({ type: "narration", text: longNarration });
    const rejection = compactPlayerEvent({ type: "rejected", reason: longRejection });
    const journal = compactPlayerEvent({
      type: "state_change",
      effect: "add_journal",
      text: longJournal,
    });
    const diagnostic = compactPlayerEvent({
      type: "state_change",
      effect: "set_var",
      name: "score",
      value: 1,
      diagnostic: longDiagnostic,
    });
    const fallback = compactPlayerEvent({
      type: "state_change",
      effect: "custom_note" as never,
      text: longFallback,
    });

    expect(narration[1].length).toBeLessThanOrEqual(COMPACT_EVENT_NARRATION_CHAR_LIMIT);
    expect(narration[1]).toMatch(/\.\.\.\(\+\d+ chars\)$/);
    expect(rejection[1].length).toBeLessThanOrEqual(COMPACT_EVENT_REJECTION_CHAR_LIMIT);
    expect(rejection[1]).toMatch(/\.\.\.\(\+\d+ chars\)$/);
    expect(journal[2]!.length).toBeLessThanOrEqual(COMPACT_EVENT_JOURNAL_CHAR_LIMIT);
    expect(journal[2]).toMatch(/\.\.\.\(\+\d+ chars\)$/);
    expect(diagnostic[3]).toBe(1);
    expect(String(diagnostic[4]).length).toBeLessThanOrEqual(COMPACT_EVENT_DIAGNOSTIC_CHAR_LIMIT);
    expect(String(diagnostic[4])).toMatch(/\.\.\.\(\+\d+ chars\)$/);
    expect(String(fallback[2]).length).toBeLessThanOrEqual(320);
    expect(String(fallback[2])).toHaveLength(MCP_TRANSCRIPT_SUMMARY_VALUE_CHAR_LIMIT);
    expect(String(fallback[2])).toMatch(/\.\.\.\(\+\d+ chars\)#[0-9a-f]{12}$/);
    expect(longNarration.length).toBeGreaterThan(narration[1].length);
    expect(longRejection.length).toBeGreaterThan(rejection[1].length);
  });

  it("caps compact scalar identity fields with hashed suffixes", () => {
    const longScene = `room_${"x".repeat(400)}a`;
    const longTargetScene = `room_${"x".repeat(400)}b`;
    const longId = `id_${"x".repeat(400)}a`;
    const longStage = `stage_${"x".repeat(400)}a`;
    const longEffect = `effect_${"x".repeat(400)}a`;
    const longValue = `value_${"x".repeat(400)}a`;

    const setFlag = compactPlayerEvent({ type: "state_change", effect: "set_flag", flag: longId });
    const setVar = compactPlayerEvent({
      type: "state_change",
      effect: "set_var",
      name: longId,
      value: longValue,
    });
    const placeObject = compactPlayerEvent({
      type: "state_change",
      effect: "place_object",
      id: longId,
      room: longScene,
    });
    const questStage = compactPlayerEvent({
      type: "state_change",
      effect: "set_quest_stage",
      quest: longId,
      stage: longStage,
    });
    const fallback = compactPlayerEvent({
      type: "state_change",
      effect: longEffect,
      id: longId,
      value: longValue,
    });
    const unlock = compactPlayerEvent({
      type: "unlock_exit",
      from: longScene,
      to: longTargetScene,
    });
    const move = compactPlayerEvent({ type: "move", from: longScene, to: longTargetScene });
    const open = compactPlayerEvent({ type: "open_object", id: longId });
    const take = compactPlayerEvent({ type: "take", item: longId });
    const drop = compactPlayerEvent({ type: "drop", item: longId });
    const dialogue = compactPlayerEvent({ type: "dialogue", npc: longId, node: longStage });
    const ending = compactPlayerEvent({ type: "ending", endingId: longId });

    expect(String(setFlag[2])).toHaveLength(MCP_TRANSCRIPT_SUMMARY_VALUE_CHAR_LIMIT);
    expect(String(setVar[2])).toHaveLength(MCP_TRANSCRIPT_SUMMARY_VALUE_CHAR_LIMIT);
    expect(String(setVar[3])).toHaveLength(MCP_TRANSCRIPT_SUMMARY_VALUE_CHAR_LIMIT);
    expect(String(placeObject[2])).toHaveLength(MCP_TRANSCRIPT_SUMMARY_VALUE_CHAR_LIMIT);
    expect(String(placeObject[3])).toHaveLength(MCP_TRANSCRIPT_SCENE_ID_CHAR_LIMIT);
    expect(String(questStage[2])).toHaveLength(MCP_TRANSCRIPT_SUMMARY_VALUE_CHAR_LIMIT);
    expect(String(questStage[3])).toHaveLength(MCP_TRANSCRIPT_SUMMARY_VALUE_CHAR_LIMIT);
    expect(String(fallback[1])).toHaveLength(MCP_TRANSCRIPT_SUMMARY_VALUE_CHAR_LIMIT);
    expect(String(fallback[2])).toHaveLength(MCP_TRANSCRIPT_SUMMARY_VALUE_CHAR_LIMIT);
    expect(String(fallback[3])).toHaveLength(MCP_TRANSCRIPT_SUMMARY_VALUE_CHAR_LIMIT);
    expect(String(unlock[1])).toHaveLength(MCP_TRANSCRIPT_SCENE_ID_CHAR_LIMIT);
    expect(String(unlock[2])).toHaveLength(MCP_TRANSCRIPT_SCENE_ID_CHAR_LIMIT);
    expect(String(move[1])).toHaveLength(MCP_TRANSCRIPT_SCENE_ID_CHAR_LIMIT);
    expect(String(move[2])).toHaveLength(MCP_TRANSCRIPT_SCENE_ID_CHAR_LIMIT);
    expect(String(open[1])).toHaveLength(MCP_TRANSCRIPT_SUMMARY_VALUE_CHAR_LIMIT);
    expect(String(take[1])).toHaveLength(MCP_TRANSCRIPT_SUMMARY_VALUE_CHAR_LIMIT);
    expect(String(drop[1])).toHaveLength(MCP_TRANSCRIPT_SUMMARY_VALUE_CHAR_LIMIT);
    expect(String(dialogue[1])).toHaveLength(MCP_TRANSCRIPT_SUMMARY_VALUE_CHAR_LIMIT);
    expect(String(dialogue[2])).toHaveLength(MCP_TRANSCRIPT_SUMMARY_VALUE_CHAR_LIMIT);
    expect(String(ending[1])).toHaveLength(MCP_TRANSCRIPT_SUMMARY_VALUE_CHAR_LIMIT);
    expect(
      JSON.stringify([
        setFlag,
        setVar,
        placeObject,
        questStage,
        fallback,
        unlock,
        move,
        open,
        take,
        drop,
        dialogue,
        ending,
      ]),
    ).not.toContain("x".repeat(300));
  });
});
