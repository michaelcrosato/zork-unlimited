import { describe, expect, it } from "vitest";
import type { OverworldJournalEntry } from "../../src/world/session_snapshot.js";
import {
  addOverworldJournalEntry,
  replaceOverworldJournalEntries,
} from "../../src/world/session_journal_store.js";

function entry(overrides: Partial<OverworldJournalEntry> = {}): OverworldJournalEntry {
  return {
    id: "entry:a",
    kind: "area",
    town: "Albany",
    title: "Capitol Hill",
    text: "You map the first local district.",
    recordedAt: "Day 1, 08:00",
    ...overrides,
  };
}

describe("overworld session journal store", () => {
  it("replaces restored journal entries with cloned entries and a matching id index", () => {
    const existing = entry({ id: "old" });
    const targetEntries = [existing];
    const targetIndex = new Map([[existing.id, existing]]);
    const source = [entry({ id: "new" })];

    replaceOverworldJournalEntries(targetEntries, targetIndex, source);
    targetEntries[0]!.title = "Changed";

    expect(targetEntries).toHaveLength(1);
    expect(targetEntries[0]).not.toBe(source[0]);
    expect(source[0]!.title).toBe("Capitol Hill");
    expect(targetIndex.get("new")).toBe(targetEntries[0]);
    expect(targetIndex.has("old")).toBe(false);
  });

  it("prepends runtime journal entries and indexes the same object", () => {
    const targetEntries = [entry({ id: "older" })];
    const targetIndex = new Map([[targetEntries[0]!.id, targetEntries[0]!]]);
    const added = entry({ id: "newer", title: "Newer" });

    addOverworldJournalEntry(targetEntries, targetIndex, added);

    expect(targetEntries.map((candidate) => candidate.id)).toEqual(["newer", "older"]);
    expect(targetIndex.get("newer")).toBe(added);
  });
});
