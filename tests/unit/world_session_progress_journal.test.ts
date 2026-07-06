import { describe, expect, it } from "vitest";
import type { OverworldJournalEntry } from "../../src/world/session_snapshot.js";
import {
  assertSnapshotProgressJournalBindings,
  assertStringSetSubset,
  emptyProgressJournalSourceIndex,
  recordProgressJournalSource,
  type OverworldProgressJournalSourceIndex,
} from "../../src/world/session_progress_journal.js";

function journalEntry(kind: OverworldJournalEntry["kind"], id: string): OverworldJournalEntry {
  return {
    id,
    kind,
    town: "Town",
    title: "Title",
    text: "Text",
    recordedAt: "Day 1, 08:00",
  };
}

function progressIndex(
  overrides: Partial<Record<keyof OverworldProgressJournalSourceIndex, readonly string[]>> = {},
): OverworldProgressJournalSourceIndex {
  return {
    completedJobIds: new Set(overrides.completedJobIds ?? []),
    completedQuestIds: new Set(overrides.completedQuestIds ?? []),
    completedRegionalArcIds: new Set(overrides.completedRegionalArcIds ?? []),
    exploredSiteIds: new Set(overrides.exploredSiteIds ?? []),
    resolvedEventIds: new Set(overrides.resolvedEventIds ?? []),
    startedQuestIds: new Set(overrides.startedQuestIds ?? []),
    visitedAreaIds: new Set(overrides.visitedAreaIds ?? []),
  };
}

describe("overworld progress journal helpers", () => {
  it("indexes only journal entries that mutate saved progress", () => {
    const sources = emptyProgressJournalSourceIndex();

    recordProgressJournalSource(sources, journalEntry("area", "area:market"));
    recordProgressJournalSource(sources, journalEntry("job", "job:deliveries"));
    recordProgressJournalSource(sources, journalEntry("quest", "quest:lost_letter"));
    recordProgressJournalSource(sources, journalEntry("quest_done", "quest_done:lost_letter"));
    recordProgressJournalSource(sources, journalEntry("regional_arc", "arc:harbor"));
    recordProgressJournalSource(sources, journalEntry("resolution", "resolve:power_outage"));
    recordProgressJournalSource(sources, journalEntry("site", "site:warehouse"));
    recordProgressJournalSource(sources, journalEntry("road", "road:a-b:540:evade"));

    expect([...sources.visitedAreaIds]).toEqual(["market"]);
    expect([...sources.completedJobIds]).toEqual(["deliveries"]);
    expect([...sources.startedQuestIds]).toEqual(["lost_letter"]);
    expect([...sources.completedQuestIds]).toEqual(["lost_letter"]);
    expect([...sources.completedRegionalArcIds]).toEqual(["harbor"]);
    expect([...sources.resolvedEventIds]).toEqual(["power_outage"]);
    expect([...sources.exploredSiteIds]).toEqual(["warehouse"]);
  });

  it("accepts matching saved progress and journal progress", () => {
    const state = progressIndex({
      completedJobIds: ["deliveries"],
      completedQuestIds: ["lost_letter"],
      completedRegionalArcIds: ["harbor"],
      exploredSiteIds: ["warehouse"],
      resolvedEventIds: ["power_outage"],
      startedQuestIds: ["lost_letter"],
      visitedAreaIds: ["market"],
    });

    expect(() => assertSnapshotProgressJournalBindings(state, state)).not.toThrow();
  });

  it("rejects saved progress without matching journal proof", () => {
    expect(() =>
      assertSnapshotProgressJournalBindings(
        progressIndex({ completedJobIds: ["deliveries"] }),
        progressIndex(),
      ),
    ).toThrow(/completed job id "deliveries" has no matching journal entry/);
  });

  it("rejects journal progress that is missing from saved state", () => {
    expect(() =>
      assertSnapshotProgressJournalBindings(
        progressIndex(),
        progressIndex({ resolvedEventIds: ["power_outage"] }),
      ),
    ).toThrow(/journal resolved event id "power_outage" is missing from saved state/);
  });

  it("checks saved progress subset relationships", () => {
    expect(() =>
      assertStringSetSubset(
        "visited area id",
        ["market"],
        "discovered area ids",
        new Set(["warehouse"]),
      ),
    ).toThrow(/visited area id "market" is not in discovered area ids/);
  });
});
