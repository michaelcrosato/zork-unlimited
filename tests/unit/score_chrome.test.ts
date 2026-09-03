import { describe, expect, it } from "vitest";
import { scoreChangeNarrations } from "../../src/core/score_chrome.js";
import type { GameEvent } from "../../src/core/events.js";

describe("scoreChangeNarrations", () => {
  it("returns empty array when maxScore <= 0", () => {
    const events: GameEvent[] = [
      { type: "state_change", effect: "inc_var", name: "score", delta: 1, value: 1 },
    ];
    expect(scoreChangeNarrations(events, "score", 0)).toEqual([]);
    expect(scoreChangeNarrations(events, "score", -10)).toEqual([]);
  });

  it("ignores non-state_change events", () => {
    const events: GameEvent[] = [
      { type: "narration", text: "Hello" },
      { type: "move", from: "roomA", to: "roomB" },
      { type: "take", item: "key" },
    ];
    expect(scoreChangeNarrations(events, "score", 100)).toEqual([]);
  });

  it("ignores state_change events with non-matching effects", () => {
    const events: GameEvent[] = [
      { type: "state_change", effect: "set_var", name: "score", value: 10 },
      { type: "state_change", effect: "toggle", name: "door_open" },
    ];
    expect(scoreChangeNarrations(events, "score", 100)).toEqual([]);
  });

  it("ignores state_change events where var name does not match scoreVar", () => {
    const events: GameEvent[] = [
      { type: "state_change", effect: "inc_var", name: "gold", delta: 5, value: 5 },
    ];
    expect(scoreChangeNarrations(events, "score", 100)).toEqual([]);
  });

  it("ignores state_change events where delta is non-numeric or zero", () => {
    const events: GameEvent[] = [
      { type: "state_change", effect: "inc_var", name: "score", delta: 0, value: 10 },
      {
        type: "state_change",
        effect: "inc_var",
        name: "score",
        delta: "invalid" as unknown as number,
        value: 10,
      },
      { type: "state_change", effect: "inc_var", name: "score", value: 10 },
    ];
    expect(scoreChangeNarrations(events, "score", 100)).toEqual([]);
  });

  it("formats score increase narrations correctly for single and plural points", () => {
    const events: GameEvent[] = [
      { type: "state_change", effect: "inc_var", name: "score", delta: 1, value: 5 },
      { type: "state_change", effect: "inc_var", name: "score", delta: 10, value: 15 },
    ];
    const narrations = scoreChangeNarrations(events, "score", 100);
    expect(narrations).toEqual([
      {
        type: "narration",
        text: "[Your score has gone up by 1 point; it is now 5 of 100.]",
      },
      {
        type: "narration",
        text: "[Your score has gone up by 10 points; it is now 15 of 100.]",
      },
    ]);
  });

  it("formats score decrease narrations correctly for single and plural points", () => {
    const events: GameEvent[] = [
      { type: "state_change", effect: "dec_var", name: "score", delta: -1, value: 14 },
      { type: "state_change", effect: "dec_var", name: "score", delta: -5, value: 9 },
    ];
    const narrations = scoreChangeNarrations(events, "score", 100);
    expect(narrations).toEqual([
      {
        type: "narration",
        text: "[Your score has gone down by 1 point; it is now 14 of 100.]",
      },
      {
        type: "narration",
        text: "[Your score has gone down by 5 points; it is now 9 of 100.]",
      },
    ]);
  });

  it("falls back total to 0 if ev.value is not a number", () => {
    const events: GameEvent[] = [
      { type: "state_change", effect: "inc_var", name: "score", delta: 2 },
    ];
    const narrations = scoreChangeNarrations(events, "score", 50);
    expect(narrations).toEqual([
      {
        type: "narration",
        text: "[Your score has gone up by 2 points; it is now 0 of 50.]",
      },
    ]);
  });
});
