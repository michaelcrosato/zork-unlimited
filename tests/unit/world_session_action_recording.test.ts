import { describe, expect, it } from "vitest";
import type { OverworldLocalActionDescriptor } from "../../src/world/local_actions.js";
import {
  recordOverworldAction,
  recordOverworldLocalAction,
  recordOverworldRepeatableEntry,
  type OverworldActionJournalState,
} from "../../src/world/session_action_recording.js";
import type { OverworldJournalEntry } from "../../src/world/session_snapshot.js";

function journalEntry(overrides: Partial<OverworldJournalEntry> = {}): OverworldJournalEntry {
  return {
    id: "quest:test",
    kind: "quest",
    town: "Alden",
    title: "Started Test Quest",
    text: "You begin the test quest.",
    recordedAt: "Day 1, 08:00",
    ...overrides,
  };
}

function journalState(
  minutes = 480,
  entries: OverworldJournalEntry[] = [],
): OverworldActionJournalState {
  return {
    minutes,
    journalEntries: entries,
    journalEntriesById: new Map(entries.map((entry) => [entry.id, entry])),
  };
}

describe("overworld action recording", () => {
  it("records new actions newest-first and returns the advanced clock", () => {
    const older = journalEntry({ id: "quest:older", recordedAt: "Day 1, 07:50" });
    const state = journalState(480, [older]);

    const result = recordOverworldAction(
      state,
      {
        id: "quest:new",
        kind: "quest",
        town: "Alden",
        title: "Started New Quest",
        text: "You begin a new quest.",
      },
      30,
    );

    expect(result).toMatchObject({
      minutes: 30,
      minutesAfter: 510,
      alreadyKnown: false,
      stateChanged: true,
    });
    expect(result.entry).toEqual({
      id: "quest:new",
      kind: "quest",
      town: "Alden",
      title: "Started New Quest",
      text: "You begin a new quest.",
      recordedAt: "Day 1, 08:30",
    });
    expect(state.minutes).toBe(480);
    expect(state.journalEntries.map((entry) => entry.id)).toEqual(["quest:new", "quest:older"]);
    expect(state.journalEntriesById.get("quest:new")).toBe(result.entry);
  });

  it("returns existing journal entries without advancing duplicate actions", () => {
    const existing = journalEntry({ id: "quest:known" });
    const state = journalState(600, [existing]);

    const result = recordOverworldAction(
      state,
      {
        id: existing.id,
        kind: "quest",
        town: "Alden",
        title: "Duplicate",
        text: "Duplicate.",
      },
      30,
    );

    expect(result).toEqual({
      minutes: 0,
      minutesAfter: 600,
      alreadyKnown: true,
      stateChanged: false,
      entry: existing,
    });
    expect(state.journalEntries).toEqual([existing]);
  });

  it("records local action descriptors with the current town label", () => {
    const action: OverworldLocalActionDescriptor<"poi"> = {
      id: "scout:well",
      kind: "poi",
      title: "Scouted Well",
      text: "You mark the well.",
      minutes: 20,
    };
    const state = journalState(540);

    const result = recordOverworldLocalAction(state, action, "Alden");

    expect(result.entry).toEqual({
      id: "scout:well",
      kind: "poi",
      town: "Alden",
      title: "Scouted Well",
      text: "You mark the well.",
      recordedAt: "Day 1, 09:20",
    });
  });

  it("records repeatable entries with timestamped ids", () => {
    const state = journalState(480);

    const first = recordOverworldRepeatableEntry(
      state,
      {
        id: "service:rest",
        kind: "service",
        town: "Alden",
        title: "Rested in Alden",
        text: "You rest.",
      },
      300,
    );
    state.minutes = first.minutesAfter;
    const second = recordOverworldRepeatableEntry(
      state,
      {
        id: "service:rest",
        kind: "service",
        town: "Alden",
        title: "Rested in Alden",
        text: "You rest again.",
      },
      300,
    );

    expect(first.entry).toMatchObject({
      id: "service:rest:780",
      recordedAt: "Day 1, 13:00",
    });
    expect(second.entry).toMatchObject({
      id: "service:rest:1080",
      recordedAt: "Day 1, 18:00",
    });
    expect(state.journalEntries.map((entry) => entry.id)).toEqual([
      "service:rest:1080",
      "service:rest:780",
    ]);
  });
});
