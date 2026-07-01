import { describe, expect, it } from "vitest";
import { createToolApi } from "../../src/mcp/tools.js";

const api = () => createToolApi({ root: process.cwd() });

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
