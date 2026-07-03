import { describe, expect, it } from "vitest";

import { compactPlayerEvent, RPG_COMPACT_EVENT_VERSION } from "../../src/mcp/compact_rpg_event.js";
import type { GameEvent } from "../../src/core/events.js";

describe("compactPlayerEvent", () => {
  it("uses the v3 single-character event contract", () => {
    expect(RPG_COMPACT_EVENT_VERSION).toBe(3);
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
});
