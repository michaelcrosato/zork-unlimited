import { describe, expect, it } from "vitest";
import { createInitialJourneyContractSnapshot } from "../../src/world/journey_contract.js";
import { buildOverworldSessionSnapshot } from "../../src/world/session_snapshot_builder.js";
import type {
  OverworldJournalEntry,
  OverworldPendingRoadEncounter,
  TravelLogEntry,
} from "../../src/world/session_snapshot.js";

function journalEntry(overrides: Partial<OverworldJournalEntry> = {}): OverworldJournalEntry {
  return {
    id: "journal:a",
    kind: "area",
    town: "Albany",
    title: "Capitol Hill",
    text: "Mapped a local district.",
    recordedAt: "Day 1, 08:00",
    ...overrides,
  };
}

function travelLogEntry(overrides: Partial<TravelLogEntry> = {}): TravelLogEntry {
  return {
    edgeId: "road:albany:troy",
    fromId: "albany",
    toId: "troy",
    from: "Albany",
    to: "Troy",
    route: "NY-7",
    distanceMi: 8,
    baseMinutes: 24,
    delayMinutes: 3,
    minutes: 27,
    arrivedAt: 507,
    suppliesUsed: 1,
    suppliesAfter: 9,
    fatigueGained: 2,
    fatigueAfter: 2,
    roadEvent: null,
    ...overrides,
  };
}

function pendingRoadEncounter(): OverworldPendingRoadEncounter {
  return {
    id: "road:road:albany:troy:507",
    edgeId: "road:albany:troy",
    from: "Albany",
    to: "Troy",
    route: "NY-7",
    arrivedAt: "Day 1, 08:27",
    timing:
      "On the road from Albany to Troy at Day 1, 08:27; resolve this route trouble before doing town business in Troy.",
    event: {
      id: "washout",
      edge: "road:albany:troy",
      title: "Washed-out shoulder",
      summary: "Rain has chewed away the shoulder.",
      risk: "medium",
    },
    options: [],
  };
}

describe("overworld session snapshot builder", () => {
  it("builds a deterministic compact snapshot from runtime state", () => {
    const journal = [journalEntry()];
    const journey = createInitialJourneyContractSnapshot();
    const snapshot = buildOverworldSessionSnapshot({
      worldId: "world:new-york",
      worldHash: "a".repeat(64),
      currentId: "troy",
      currentAreaId: "troy:downtown",
      minutes: 507,
      supplies: 9,
      fatigue: 2,
      discoveredIds: new Set(["troy", "albany"]),
      visitedIds: new Set(["troy", "albany"]),
      currentAreaByTown: new Map([
        ["troy", "troy:downtown"],
        ["albany", "albany:capitol"],
      ]),
      travelLog: [travelLogEntry()],
      journalEntries: journal,
      resolvedEventIds: new Set(["event:z", "event:a"]),
      discoveredAreaIds: new Set(["troy:downtown", "albany:capitol"]),
      visitedAreaIds: new Set(["troy:downtown", "albany:capitol"]),
      discoveredJobIds: new Set(["job:b", "job:a"]),
      completedJobIds: new Set(["job:b"]),
      discoveredSiteIds: new Set(["site:b", "site:a"]),
      discoveredQuestIds: new Set(["quest:b", "quest:a"]),
      startedQuestIds: new Set(["quest:b"]),
      completedQuestIds: new Set(["quest:a"]),
      questOutcomes: new Map([["quest:a", "ending:a"]]),
      exploredSiteIds: new Set(["site:b"]),
      regionRenown: new Map([
        ["hudson", 2],
        ["capital", 5],
      ]),
      completedRegionalArcIds: new Set(["arc:b", "arc:a"]),
      pendingRoadEncounter: pendingRoadEncounter(),
      journey,
    });

    snapshot.journalEntries[0]!.title = "Changed";
    snapshot.journey.goal.status = "completed";

    expect(snapshot.discoveredIds).toEqual(["albany", "troy"]);
    expect(snapshot.currentAreaByTown).toEqual([
      ["albany", "albany:capitol"],
      ["troy", "troy:downtown"],
    ]);
    expect(snapshot.regionRenown).toEqual([
      ["capital", 5],
      ["hudson", 2],
    ]);
    expect(snapshot.questOutcomes).toEqual([["quest:a", "ending:a"]]);
    expect(snapshot.travelLog[0]).toEqual({
      edgeId: "road:albany:troy",
      fromId: "albany",
      toId: "troy",
      roadEventId: null,
      delayMinutes: 3,
      minutes: 27,
      arrivedAt: 507,
      suppliesUsed: 1,
      suppliesAfter: 9,
      fatigueGained: 2,
      fatigueAfter: 2,
    });
    expect(snapshot.pendingRoadEncounter).toEqual({ edgeId: "road:albany:troy" });
    expect(journal[0]!.title).toBe("Capitol Hill");
    expect(journey.goal.status).toBe("active");
  });
});
