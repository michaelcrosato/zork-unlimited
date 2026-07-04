import { cloneJournalEntries, type OverworldJournalEntry } from "./session_snapshot.js";

export function replaceOverworldJournalEntries(
  targetEntries: OverworldJournalEntry[],
  targetIndex: Map<string, OverworldJournalEntry>,
  sourceEntries: readonly OverworldJournalEntry[],
): void {
  targetEntries.length = 0;
  targetIndex.clear();

  for (const restored of cloneJournalEntries(sourceEntries)) {
    targetEntries.push(restored);
    targetIndex.set(restored.id, restored);
  }
}

export function addOverworldJournalEntry(
  targetEntries: OverworldJournalEntry[],
  targetIndex: Map<string, OverworldJournalEntry>,
  entry: OverworldJournalEntry,
): void {
  targetEntries.unshift(entry);
  targetIndex.set(entry.id, entry);
}
