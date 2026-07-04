import { describe, expect, it } from "vitest";

import { compactPlayerEvent, RPG_COMPACT_EVENT_VERSION } from "../../src/mcp/compact_rpg_event.js";
import type { GameEvent } from "../../src/core/events.js";

describe("compactPlayerEvent", () => {
  it("uses the v4 single-character event contract", () => {
    expect(RPG_COMPACT_EVENT_VERSION).toBe(4);
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

    expect(narration[1].length).toBeLessThanOrEqual(500);
    expect(narration[1]).toMatch(/\.\.\.\(\+\d+ chars\)$/);
    expect(rejection[1].length).toBeLessThanOrEqual(240);
    expect(rejection[1]).toMatch(/\.\.\.\(\+\d+ chars\)$/);
    expect(journal[2]!.length).toBeLessThanOrEqual(320);
    expect(journal[2]).toMatch(/\.\.\.\(\+\d+ chars\)$/);
    expect(diagnostic[3]).toBe(1);
    expect(String(diagnostic[4]).length).toBeLessThanOrEqual(240);
    expect(String(diagnostic[4])).toMatch(/\.\.\.\(\+\d+ chars\)$/);
    expect(String(fallback[2]).length).toBeLessThanOrEqual(320);
    expect(String(fallback[2])).toMatch(/\.\.\.\(\+\d+ chars\)$/);
    expect(longNarration.length).toBeGreaterThan(narration[1].length);
    expect(longRejection.length).toBeGreaterThan(rejection[1].length);
  });
});
