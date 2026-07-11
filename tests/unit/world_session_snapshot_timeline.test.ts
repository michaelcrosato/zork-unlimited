import { describe, expect, it } from "vitest";
import { createInitialJourneyContractSnapshot } from "../../src/world/journey_contract.js";
import {
  OVERWORLD_SESSION_SAVE_VERSION,
  type OverworldSessionSnapshot,
  type TravelLogEntrySnapshot,
} from "../../src/world/session_snapshot.js";
import {
  snapshotTravelTimelineIndex,
  travelResourceKey,
} from "../../src/world/session_snapshot_timeline.js";
import { OVERWORLD_STARTING_MINUTES } from "../../src/world/travel_mechanics.js";

function travelEntry(
  edgeId: string,
  fromId: string,
  toId: string,
  arrivedAt: number,
): TravelLogEntrySnapshot {
  return {
    edgeId,
    fromId,
    toId,
    delayMinutes: 0,
    minutes: 60,
    arrivedAt,
    suppliesUsed: 1,
    suppliesAfter: 5,
    fatigueGained: 1,
    fatigueAfter: 1,
  };
}

function snapshot(travelLog: TravelLogEntrySnapshot[], minutes = 720): OverworldSessionSnapshot {
  return {
    version: OVERWORLD_SESSION_SAVE_VERSION,
    worldId: "new_york_overworld",
    worldHash: "a".repeat(64),
    currentId: "town_a",
    currentAreaId: null,
    minutes,
    supplies: 5,
    fatigue: 1,
    discoveredIds: ["start", "town_a", "town_b"],
    visitedIds: ["start", "town_a", "town_b"],
    currentAreaByTown: [],
    travelLog,
    journalEntries: [],
    resolvedEventIds: [],
    discoveredAreaIds: [],
    visitedAreaIds: [],
    discoveredJobIds: [],
    completedJobIds: [],
    discoveredSiteIds: [],
    discoveredQuestIds: [],
    startedQuestIds: [],
    completedQuestIds: [],
    exploredSiteIds: [],
    regionRenown: [],
    completedRegionalArcIds: [],
    pendingRoadEncounter: null,
    journey: createInitialJourneyContractSnapshot(),
  };
}

function townNameForSource(townId: string): string {
  return `Town ${townId}`;
}

describe("overworld snapshot travel timeline", () => {
  it("indexes newest-first travel logs into replay order and visit proofs", () => {
    const firstArrival = travelEntry("road:start-a", "start", "town_a", 540);
    const secondArrival = travelEntry("road:a-b", "town_a", "town_b", 620);
    const revisit = travelEntry("road:b-a", "town_b", "town_a", 700);

    const timeline = snapshotTravelTimelineIndex(
      snapshot([revisit, secondArrival, firstArrival]),
      townNameForSource,
      "start",
    );

    expect(timeline.oldestFirst).toEqual([firstArrival, secondArrival, revisit]);
    expect(timeline.latest).toBe(revisit);
    expect(timeline.arrivals.has("road:start-a@540")).toBe(true);
    expect(timeline.byArrival.get("road:a-b@620")).toBe(secondArrival);
    expect([...timeline.arrivedTownIds].sort()).toEqual(["town_a", "town_b"]);
    expect(timeline.townByArrival.get("road:b-a@700")).toBe("Town town_a");
    expect(timeline.townVisitMinutes.get("start")).toBe(OVERWORLD_STARTING_MINUTES);
    expect(timeline.townVisitMinutes.get("town_a")).toBe(540);
    expect(timeline.townVisitMinutes.get("town_b")).toBe(620);
  });

  it("derives stable travel resource keys", () => {
    expect(travelResourceKey(travelEntry("road:start-a", "start", "town_a", 540))).toBe(
      "road:start-a@540",
    );
  });

  it("rejects duplicate travel timeline keys", () => {
    const first = travelEntry("road:start-a", "start", "town_a", 540);
    const duplicate = travelEntry("road:start-a", "start", "town_a", 540);

    expect(() =>
      snapshotTravelTimelineIndex(snapshot([first, duplicate]), townNameForSource, "start"),
    ).toThrow(/duplicate travel log entry/);
  });

  it("rejects future travel arrivals", () => {
    expect(() =>
      snapshotTravelTimelineIndex(
        snapshot([travelEntry("road:start-a", "start", "town_a", 800)], 720),
        townNameForSource,
        "start",
      ),
    ).toThrow(/future arrival/);
  });

  it("rejects travel logs that are not newest-first", () => {
    expect(() =>
      snapshotTravelTimelineIndex(
        snapshot([
          travelEntry("road:start-a", "start", "town_a", 540),
          travelEntry("road:a-b", "town_a", "town_b", 620),
        ]),
        townNameForSource,
        "start",
      ),
    ).toThrow(/newest-first/);
  });
});
