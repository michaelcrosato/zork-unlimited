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

    expect(compact.v).toBe(6);
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
});
