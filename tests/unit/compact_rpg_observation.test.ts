import { describe, expect, it } from "vitest";

import {
  COMPACT_ACTION_LIMIT,
  COMPACT_BLOCKED_EXIT_LIMIT,
  COMPACT_BLOCKED_EXIT_CHAR_LIMIT,
  COMPACT_DESCRIPTION_CHAR_LIMIT,
  COMPACT_DIALOGUE_CHAR_LIMIT,
  COMPACT_ENEMY_LIMIT,
  COMPACT_ENDING_TEXT_CHAR_LIMIT,
  COMPACT_EXIT_LIMIT,
  COMPACT_VAR_LIMIT,
  COMPACT_VISIBLE_REF_LIMIT,
  RPG_COMPACT_OBSERVATION_VERSION,
  compactRpgObservation,
} from "../../src/mcp/compact_rpg_observation.js";
import {
  MCP_ACTION_LABEL_CHAR_LIMIT,
  MCP_TRANSCRIPT_SCENE_ID_CHAR_LIMIT,
  MCP_TRANSCRIPT_SUMMARY_VALUE_CHAR_LIMIT,
  MCP_TRANSCRIPT_TITLE_CHAR_LIMIT,
} from "../../src/mcp/action_labels.js";
import type { RpgObservation } from "../../src/rpg/observation.js";

function ids(prefix: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => `${prefix}_${i.toString().padStart(2, "0")}`);
}

function observationWithLargeState(): RpgObservation {
  return {
    mode: "rpg",
    room: "archive",
    title: "Archive",
    description: "A room with too much accumulated state for compact loop turns.",
    visible_objects: [],
    npcs_present: [],
    exits: [],
    blocked_exits: [],
    inventory: ids("item", 20),
    state: {
      flags: ids("flag", 20),
      vars: { hp: 8, attack: 2, defense: 1, score: 5, lore: 3 },
      journal: ids("journal", 10),
    },
    dialogue: null,
    enemies_present: [],
    stats: { hp: 8, attack: 2, defense: 1 },
    available_actions: [],
    score: 5,
    max_score: 10,
    ended: false,
    ending_id: null,
    ending: null,
  };
}

describe("compactRpgObservation", () => {
  it("caps unbounded state lists and keeps recent journal entries", () => {
    const obs = observationWithLargeState();
    const compact = compactRpgObservation(obs, ["look"]);

    expect(compact.v).toBe(RPG_COMPACT_OBSERVATION_VERSION);
    expect("mode" in compact).toBe(false);
    expect(compact.inv).toEqual(ids("item", 16));
    expect(compact.flags).toEqual(ids("flag", 16));
    expect(compact.journal).toEqual(ids("journal", 10).slice(-5));
    expect(compact.more).toEqual([4, 4, 0, 5]);
    expect(compact.actions).toEqual(["look"]);
    expect(compact.vitals[3]).toBe(5);
    expect(compact.vars).toEqual({ lore: 3 });
    expect(JSON.stringify(compact).length).toBeLessThan(JSON.stringify(obs).length);
  });

  it("trims trailing zero truncation counts from sparse more tuples", () => {
    const inventoryOnly = compactRpgObservation(
      {
        ...observationWithLargeState(),
        state: {
          flags: ["door_open"],
          vars: { hp: 8, attack: 2, defense: 1 },
          journal: ["Found the key."],
        },
      },
      ["look"],
    );
    const inventoryAndFlags = compactRpgObservation(
      {
        ...observationWithLargeState(),
        state: {
          flags: ids("flag", 20),
          vars: { hp: 8, attack: 2, defense: 1 },
          journal: ["Found the key."],
        },
      },
      ["look"],
    );
    const journalOnly = compactRpgObservation(
      {
        ...observationWithLargeState(),
        inventory: ["key"],
        state: {
          flags: ["door_open"],
          vars: { hp: 8, attack: 2, defense: 1 },
          journal: ids("journal", 10),
        },
      },
      ["look"],
    );

    expect(inventoryOnly.more).toEqual([4]);
    expect(inventoryAndFlags.more).toEqual([4, 4]);
    expect(journalOnly.more).toEqual([0, 0, 0, 5]);
  });

  it("omits empty navigation and action arrays", () => {
    const compact = compactRpgObservation(observationWithLargeState(), []);

    expect(compact.ended).toBeUndefined();
    expect(compact.exits).toBeUndefined();
    expect(compact.actions).toBeUndefined();
  });

  it("caps action and visible world buckets with compact omission counts", () => {
    const actionCount = COMPACT_ACTION_LIMIT + 3;
    const exitCount = COMPACT_EXIT_LIMIT + 4;
    const refCount = COMPACT_VISIBLE_REF_LIMIT + 5;
    const blockedCount = COMPACT_BLOCKED_EXIT_LIMIT + 2;
    const enemyCount = COMPACT_ENEMY_LIMIT + 6;
    const obs: RpgObservation = {
      ...observationWithLargeState(),
      inventory: [],
      state: {
        flags: [],
        vars: { hp: 8, attack: 2, defense: 1 },
        journal: [],
      },
      exits: Array.from({ length: exitCount }, (_, index) => ({
        direction: `dir_${index}`,
        to: `room_${index}`,
      })),
      visible_objects: Array.from({ length: refCount }, (_, index) => ({
        id: `obj_${index}`,
        name: `Object ${index}`,
      })),
      npcs_present: Array.from({ length: refCount }, (_, index) => ({
        id: `npc_${index}`,
        name: `NPC ${index}`,
      })),
      blocked_exits: Array.from({ length: blockedCount }, (_, index) => ({
        direction: `blocked_${index}`,
        message: `Blocked ${index}`,
      })),
      enemies_present: Array.from({ length: enemyCount }, (_, index) => ({
        id: `enemy_${index}`,
        name: `Enemy ${index}`,
        hp: index + 1,
      })),
    };
    const actionIds = ids("action", actionCount);

    const compact = compactRpgObservation(obs, actionIds);

    expect(compact.actions).toEqual(actionIds.slice(0, COMPACT_ACTION_LIMIT));
    expect(compact.exits).toHaveLength(COMPACT_EXIT_LIMIT);
    expect(compact.objects).toHaveLength(COMPACT_VISIBLE_REF_LIMIT);
    expect(compact.npcs).toHaveLength(COMPACT_VISIBLE_REF_LIMIT);
    expect(compact.blocked).toHaveLength(COMPACT_BLOCKED_EXIT_LIMIT);
    expect(compact.enemies).toHaveLength(COMPACT_ENEMY_LIMIT);
    expect(compact.more).toEqual([0, 0, 0, 0, 3, 4, 5, 5, 2, 6]);
    expect(obs.exits).toHaveLength(exitCount);
    expect(obs.visible_objects).toHaveLength(refCount);
    expect(obs.npcs_present).toHaveLength(refCount);
    expect(obs.blocked_exits).toHaveLength(blockedCount);
    expect(obs.enemies_present).toHaveLength(enemyCount);
  });

  it("omits truncation metadata when compact lists are complete", () => {
    const obs = {
      ...observationWithLargeState(),
      inventory: ["key"],
      state: {
        flags: ["door_open"],
        vars: { hp: 8, attack: 2, defense: 1 },
        journal: ["Found the key."],
      },
    };

    const compact = compactRpgObservation(obs, ["look"]);

    expect(compact.inv).toEqual(["key"]);
    expect(compact.flags).toEqual(["door_open"]);
    expect(compact.journal).toEqual(["Found the key."]);
    expect(compact.more).toBeUndefined();
    expect(compact.vars).toBeUndefined();
  });

  it("caps compact non-core vars while preserving stable key order", () => {
    const extraVars = Object.fromEntries(
      ids("skill", COMPACT_VAR_LIMIT + 3)
        .reverse()
        .map((id, index) => [id, index + 1]),
    );
    const obs = {
      ...observationWithLargeState(),
      inventory: [],
      state: {
        flags: [],
        vars: { hp: 8, attack: 2, defense: 1, score: 5, ...extraVars },
        journal: [],
      },
    };

    const compact = compactRpgObservation(obs, ["look"]);

    expect(Object.keys(compact.vars ?? {})).toEqual(ids("skill", COMPACT_VAR_LIMIT));
    expect(compact.vars).not.toHaveProperty("hp");
    expect(compact.vars).not.toHaveProperty("score");
    expect(compact.more).toEqual([0, 0, 3]);
  });

  it("caps long prose fields in compact loop context only", () => {
    const longDescription = `${"room ".repeat(260)}\n\n`;
    const longDialogue = `${"dialogue ".repeat(120)}\n`;
    const longBlockedExit = `${"blocked ".repeat(80)}\n`;
    const longEndingText = `${"ending ".repeat(180)}\n`;
    const obs: RpgObservation = {
      ...observationWithLargeState(),
      description: longDescription,
      blocked_exits: [{ direction: "north", message: longBlockedExit }],
      dialogue: { npc: "archivist", npc_text: longDialogue },
      ended: true,
      ending_id: "ending_archive",
      ending: {
        id: "ending_archive",
        title: "Archive Closed",
        text: longEndingText,
        death: false,
      },
    };

    const compact = compactRpgObservation(obs, ["look"]);

    expect(compact.text.length).toBeLessThanOrEqual(COMPACT_DESCRIPTION_CHAR_LIMIT);
    expect(compact.text).toMatch(/\.\.\.\(\+\d+ chars\)$/);
    expect(compact.dialogue?.[1].length).toBeLessThanOrEqual(COMPACT_DIALOGUE_CHAR_LIMIT);
    expect(compact.dialogue?.[1]).toMatch(/\.\.\.\(\+\d+ chars\)$/);
    expect(compact.blocked?.[0]?.[1].length).toBeLessThanOrEqual(COMPACT_BLOCKED_EXIT_CHAR_LIMIT);
    expect(compact.blocked?.[0]?.[1]).toMatch(/\.\.\.\(\+\d+ chars\)$/);
    expect(compact.ending?.text.length).toBeLessThanOrEqual(COMPACT_ENDING_TEXT_CHAR_LIMIT);
    expect(compact.ending?.text).toMatch(/\.\.\.\(\+\d+ chars\)$/);
    expect(compact.text.endsWith("\n")).toBe(false);
    expect(compact.dialogue?.[1].endsWith("\n")).toBe(false);
    expect(compact.blocked?.[0]?.[1].endsWith("\n")).toBe(false);
    expect(compact.ending?.text.endsWith("\n")).toBe(false);
    expect(obs.description).toBe(longDescription);
    expect(obs.dialogue?.npc_text).toBe(longDialogue);
    expect(obs.blocked_exits[0]?.message).toBe(longBlockedExit);
    expect(obs.ending?.text).toBe(longEndingText);
  });

  it("caps compact scalar identity fields while preserving executable action ids", () => {
    const longRoom = `room_${"x".repeat(400)}a`;
    const longTitle = `Room ${"x".repeat(400)}a`;
    const longId = `id_${"x".repeat(400)}a`;
    const longName = `Name ${"x".repeat(400)}a`;
    const longActionId = `action_${"x".repeat(400)}a`;
    const longJournal = `Journal ${"x".repeat(400)}a`;
    const longVar = `var_${"x".repeat(400)}a`;
    const obs: RpgObservation = {
      ...observationWithLargeState(),
      room: longRoom,
      title: longTitle,
      inventory: [longId],
      state: {
        flags: [longId],
        vars: { hp: 8, attack: 2, defense: 1, [longVar]: 7 },
        journal: [longJournal],
      },
      exits: [{ direction: longId, to: longRoom }],
      visible_objects: [{ id: longId, name: longName }],
      npcs_present: [{ id: longId, name: longName }],
      blocked_exits: [{ direction: longId, message: "blocked" }],
      dialogue: { npc: longId, npc_text: "hello" },
      enemies_present: [{ id: longId, name: longName, hp: 4 }],
      ended: true,
      ending_id: longId,
      ending: {
        id: longId,
        title: longTitle,
        text: "done",
        death: false,
      },
    };

    const compact = compactRpgObservation(obs, [longActionId]);
    const compactExit = compact.exits?.[0];
    const compactVarKey = Object.keys(compact.vars ?? {})[0];

    expect(compact.actions).toEqual([longActionId]);
    expect(compact.here[0]).toHaveLength(MCP_TRANSCRIPT_SCENE_ID_CHAR_LIMIT);
    expect(compact.here[1]).toHaveLength(MCP_TRANSCRIPT_TITLE_CHAR_LIMIT);
    expect(compact.inv?.[0]).toHaveLength(MCP_TRANSCRIPT_SUMMARY_VALUE_CHAR_LIMIT);
    expect(compact.flags?.[0]).toHaveLength(MCP_TRANSCRIPT_SUMMARY_VALUE_CHAR_LIMIT);
    expect(compact.journal?.[0]).toHaveLength(MCP_TRANSCRIPT_SUMMARY_VALUE_CHAR_LIMIT);
    expect(compactVarKey).toHaveLength(MCP_TRANSCRIPT_SUMMARY_VALUE_CHAR_LIMIT);
    expect(compactExit).toEqual([
      expect.stringMatching(/\.\.\.\(\+\d+ chars\)#[0-9a-f]{12}$/),
      expect.stringMatching(/\.\.\.\(\+\d+ chars\)#[0-9a-f]{12}$/),
    ]);
    expect(compact.objects?.[0]?.[0]).toHaveLength(MCP_TRANSCRIPT_SUMMARY_VALUE_CHAR_LIMIT);
    expect(compact.objects?.[0]?.[1]).toHaveLength(MCP_ACTION_LABEL_CHAR_LIMIT);
    expect(compact.npcs?.[0]?.[0]).toHaveLength(MCP_TRANSCRIPT_SUMMARY_VALUE_CHAR_LIMIT);
    expect(compact.npcs?.[0]?.[1]).toHaveLength(MCP_ACTION_LABEL_CHAR_LIMIT);
    expect(compact.blocked?.[0]?.[0]).toHaveLength(MCP_TRANSCRIPT_SUMMARY_VALUE_CHAR_LIMIT);
    expect(compact.dialogue?.[0]).toHaveLength(MCP_TRANSCRIPT_SUMMARY_VALUE_CHAR_LIMIT);
    expect(compact.enemies?.[0]?.[0]).toHaveLength(MCP_TRANSCRIPT_SUMMARY_VALUE_CHAR_LIMIT);
    expect(compact.enemies?.[0]?.[1]).toHaveLength(MCP_ACTION_LABEL_CHAR_LIMIT);
    expect(compact.ending_id).toHaveLength(MCP_TRANSCRIPT_SUMMARY_VALUE_CHAR_LIMIT);
    expect(compact.ending?.id).toHaveLength(MCP_TRANSCRIPT_SUMMARY_VALUE_CHAR_LIMIT);
    expect(compact.ending?.title).toHaveLength(MCP_TRANSCRIPT_TITLE_CHAR_LIMIT);
    const { actions: _actions, ...nonActionContext } = compact;
    expect(JSON.stringify(nonActionContext)).not.toContain("x".repeat(300));
  });
});
