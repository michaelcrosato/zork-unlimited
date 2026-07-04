import { describe, expect, it } from "vitest";

import { compactRpgObservation } from "../../src/mcp/compact_rpg_observation.js";
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

    expect(compact.v).toBe(7);
    expect("mode" in compact).toBe(false);
    expect(compact.inv).toEqual(ids("item", 16));
    expect(compact.flags).toEqual(ids("flag", 16));
    expect(compact.journal).toEqual(ids("journal", 10).slice(-5));
    expect(compact.more).toEqual([4, 4, 5]);
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
    expect(journalOnly.more).toEqual([0, 0, 5]);
  });

  it("omits empty navigation and action arrays", () => {
    const compact = compactRpgObservation(observationWithLargeState(), []);

    expect(compact.ended).toBeUndefined();
    expect(compact.exits).toBeUndefined();
    expect(compact.actions).toBeUndefined();
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

  it("caps long prose fields in compact loop context only", () => {
    const longDescription = "room ".repeat(260);
    const longDialogue = "dialogue ".repeat(120);
    const longBlockedExit = "blocked ".repeat(80);
    const longEndingText = "ending ".repeat(180);
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

    expect(compact.text.length).toBeLessThanOrEqual(900);
    expect(compact.text).toMatch(/\.\.\.\(\+\d+ chars\)$/);
    expect(compact.dialogue?.[1].length).toBeLessThanOrEqual(700);
    expect(compact.dialogue?.[1]).toMatch(/\.\.\.\(\+\d+ chars\)$/);
    expect(compact.blocked?.[0]?.[1].length).toBeLessThanOrEqual(320);
    expect(compact.blocked?.[0]?.[1]).toMatch(/\.\.\.\(\+\d+ chars\)$/);
    expect(compact.ending?.text.length).toBeLessThanOrEqual(900);
    expect(compact.ending?.text).toMatch(/\.\.\.\(\+\d+ chars\)$/);
    expect(obs.description).toBe(longDescription);
    expect(obs.dialogue?.npc_text).toBe(longDialogue);
    expect(obs.blocked_exits[0]?.message).toBe(longBlockedExit);
    expect(obs.ending?.text).toBe(longEndingText);
  });
});
