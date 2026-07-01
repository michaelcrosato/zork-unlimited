import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { createToolApi } from "../../src/mcp/tools.js";
import { parseOverworldManifest } from "../../src/world/overworld.js";

const api = () => createToolApi({ root: process.cwd() });
const overworld = parseOverworldManifest(
  JSON.parse(readFileSync("content/world/new_york_overworld.json", "utf8")),
);

function exportedSnapshotAfterTwoRoads() {
  const a = api();
  const started = a.start_overworld();
  const firstRoad =
    started.observation.exits.find((edge) => edge.destination.id === "colonie_town") ??
    started.observation.exits[0];
  if (!firstRoad) throw new Error("expected an overworld road from start");

  a.travel_overworld_session({ session_id: started.session_id, road_id: firstRoad.id });
  a.resolve_overworld_session_road_encounter({
    session_id: started.session_id,
    strategy: "press_on",
  });

  const afterFirstRoad = a.get_overworld_session({ session_id: started.session_id }).observation;
  const secondRoad = afterFirstRoad.exits[0];
  if (!secondRoad) throw new Error("expected a second overworld road");
  a.travel_overworld_session({ session_id: started.session_id, road_id: secondRoad.id });
  a.resolve_overworld_session_road_encounter({
    session_id: started.session_id,
    strategy: "press_on",
  });

  const snapshot = a.export_overworld_session({ session_id: started.session_id }).snapshot;
  expect(snapshot.travelLog.length).toBeGreaterThanOrEqual(2);
  expect(snapshot.journalEntries.length).toBeGreaterThanOrEqual(2);
  return { a, snapshot };
}

describe("overworld snapshot restore integrity", () => {
  it("rejects duplicate journal ids in forged session snapshots", () => {
    const { a, snapshot } = exportedSnapshotAfterTwoRoads();
    const duplicatedJournal = {
      ...snapshot,
      journalEntries: [snapshot.journalEntries[0]!, ...snapshot.journalEntries],
    };

    expect(() => a.restore_overworld_session({ snapshot: duplicatedJournal })).toThrow(
      /duplicate journal entry id/,
    );
  });

  it("rejects malformed journal timestamps in forged session snapshots", () => {
    const { a, snapshot } = exportedSnapshotAfterTwoRoads();
    const malformedJournal = {
      ...snapshot,
      journalEntries: [
        { ...snapshot.journalEntries[0]!, recordedAt: "yesterday" },
        ...snapshot.journalEntries.slice(1),
      ],
    };

    expect(() => a.restore_overworld_session({ snapshot: malformedJournal })).toThrow(
      /malformed journal timestamp/,
    );
  });

  it("rejects journal entries bound to unknown overworld towns", () => {
    const { a, snapshot } = exportedSnapshotAfterTwoRoads();
    const detachedJournalTown = {
      ...snapshot,
      journalEntries: [
        { ...snapshot.journalEntries[0]!, town: "Atlantis" },
        ...snapshot.journalEntries.slice(1),
      ],
    };

    expect(() => a.restore_overworld_session({ snapshot: detachedJournalTown })).toThrow(
      /unknown town/,
    );
  });

  it("rejects journal entries whose kind does not match their source id", () => {
    const { a, snapshot } = exportedSnapshotAfterTwoRoads();
    const mismatchedJournalSource = {
      ...snapshot,
      journalEntries: [
        { ...snapshot.journalEntries[0]!, kind: "job" as const },
        ...snapshot.journalEntries.slice(1),
      ],
    };

    expect(() => a.restore_overworld_session({ snapshot: mismatchedJournalSource })).toThrow(
      /journal job entry id/,
    );
  });

  it("rejects journal entries bound to unknown overworld source ids", () => {
    const { a, snapshot } = exportedSnapshotAfterTwoRoads();
    const roadEntry = snapshot.journalEntries.find((entry) => entry.kind === "road");
    if (!roadEntry) throw new Error("expected a road journal entry");
    const roadMatch = /^road:(.+):(\d+):([a-z_]+)$/.exec(roadEntry.id);
    if (!roadMatch) throw new Error(`unexpected road journal id ${roadEntry.id}`);
    const detachedJournalSource = {
      ...snapshot,
      journalEntries: snapshot.journalEntries.map((entry) =>
        entry === roadEntry
          ? { ...entry, id: `road:missing_road:${roadMatch[2]}:${roadMatch[3]}` }
          : entry,
      ),
    };

    expect(() => a.restore_overworld_session({ snapshot: detachedJournalSource })).toThrow(
      /unknown road/,
    );
  });

  it("restores regional arc journal entries bound to known regions", () => {
    const { a, snapshot } = exportedSnapshotAfterTwoRoads();
    const arc = overworld.regional_arcs[0]!;
    const regionalArcSnapshot = {
      ...snapshot,
      completedRegionalArcIds: [arc.id],
      journalEntries: [
        {
          id: `arc:${arc.id}`,
          kind: "regional_arc" as const,
          town: arc.region,
          title: `Completed ${arc.title}`,
          text: arc.reward,
          recordedAt: snapshot.journalEntries[0]!.recordedAt,
        },
        ...snapshot.journalEntries,
      ],
    };

    expect(() => a.restore_overworld_session({ snapshot: regionalArcSnapshot })).not.toThrow();
  });

  it("rejects future journal history in forged session snapshots", () => {
    const { a, snapshot } = exportedSnapshotAfterTwoRoads();
    const futureJournal = {
      ...snapshot,
      journalEntries: [
        { ...snapshot.journalEntries[0]!, recordedAt: "Day 999, 00:00" },
        ...snapshot.journalEntries.slice(1),
      ],
    };

    expect(() => a.restore_overworld_session({ snapshot: futureJournal })).toThrow(/future entry/);
  });

  it("rejects journal history that is not newest-first", () => {
    const { a, snapshot } = exportedSnapshotAfterTwoRoads();
    const reversedJournal = {
      ...snapshot,
      journalEntries: [...snapshot.journalEntries].reverse(),
    };

    expect(() => a.restore_overworld_session({ snapshot: reversedJournal })).toThrow(
      /journal must be newest-first/,
    );
  });

  it("rejects forged travel logs that are not newest-first", () => {
    const { a, snapshot } = exportedSnapshotAfterTwoRoads();
    const reversedTravelLog = {
      ...snapshot,
      travelLog: [...snapshot.travelLog].reverse(),
    };

    expect(() => a.restore_overworld_session({ snapshot: reversedTravelLog })).toThrow(
      /newest-first/,
    );
  });

  it("rejects future travel history in forged session snapshots", () => {
    const { a, snapshot } = exportedSnapshotAfterTwoRoads();
    const futureTravelLog = {
      ...snapshot,
      travelLog: [
        { ...snapshot.travelLog[0]!, arrivedAt: snapshot.minutes + 1 },
        ...snapshot.travelLog.slice(1),
      ],
    };

    expect(() => a.restore_overworld_session({ snapshot: futureTravelLog })).toThrow(
      /future arrival/,
    );
  });

  it("rejects impossible post-travel supplies and fatigue", () => {
    const { a, snapshot } = exportedSnapshotAfterTwoRoads();
    const impossibleVitals = {
      ...snapshot,
      travelLog: [{ ...snapshot.travelLog[0]!, suppliesAfter: 9 }, ...snapshot.travelLog.slice(1)],
    };

    expect(() => a.restore_overworld_session({ snapshot: impossibleVitals })).toThrow();
  });
});
