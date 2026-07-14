import { describe, expect, it } from "vitest";
import { createInitialCampaignCharacterState } from "../../src/world/campaign_character_state.js";
import { createInitialJourneyContractSnapshot } from "../../src/world/journey_contract.js";
import {
  OVERWORLD_SESSION_LEGACY_SAVE_VERSION,
  OVERWORLD_SESSION_SAVE_VERSION,
  OverworldSessionSnapshotSchema,
  cloneJournalEntries,
  cloneOverworldSessionSnapshot,
  parseOverworldSessionSnapshot,
  snapshotTravelLogEntry,
  type OverworldJournalEntry,
  type OverworldSessionSnapshot,
  type OverworldSessionSnapshotV8,
  type TravelLogEntry,
} from "../../src/world/session_snapshot.js";

function baseSnapshot(): OverworldSessionSnapshot {
  return {
    version: OVERWORLD_SESSION_SAVE_VERSION,
    worldId: "new_york_overworld",
    worldHash: "a".repeat(64),
    character: createInitialCampaignCharacterState(),
    currentId: "albany_city",
    currentAreaId: "albany_capitol_hill",
    minutes: 480,
    supplies: 6,
    fatigue: 0,
    discoveredIds: ["albany_city"],
    visitedIds: ["albany_city"],
    currentAreaByTown: [["albany_city", "albany_capitol_hill"]],
    travelLog: [
      {
        edgeId: "road:albany:colonie",
        fromId: "albany_city",
        toId: "colonie_town",
        delayMinutes: 0,
        minutes: 20,
        arrivedAt: 500,
        suppliesUsed: 1,
        suppliesAfter: 5,
        fatigueGained: 1,
        fatigueAfter: 1,
      },
    ],
    journalEntries: [
      {
        id: "area:albany_capitol_hill",
        kind: "area",
        town: "albany_city",
        title: "Capitol Hill",
        text: "You map the first local district.",
        recordedAt: "Day 1, 08:00",
      },
    ],
    resolvedEventIds: [],
    discoveredAreaIds: ["albany_capitol_hill"],
    visitedAreaIds: [],
    discoveredJobIds: [],
    completedJobIds: [],
    discoveredSiteIds: [],
    discoveredQuestIds: [],
    startedQuestIds: [],
    completedQuestIds: [],
    questOutcomes: [],
    exploredSiteIds: [],
    regionRenown: [["Capital / Mohawk", 1]],
    completedRegionalArcIds: [],
    pendingRoadEncounter: { edgeId: "road:albany:colonie" },
    journey: createInitialJourneyContractSnapshot(),
  };
}

function legacySnapshot(): OverworldSessionSnapshotV8 {
  const { character: _character, ...snapshot } = baseSnapshot();
  return { ...snapshot, version: OVERWORLD_SESSION_LEGACY_SAVE_VERSION };
}

describe("overworld session snapshots", () => {
  it("validates the saved session shape and resource caps", () => {
    expect(OverworldSessionSnapshotSchema.parse(baseSnapshot()).version).toBe(
      OVERWORLD_SESSION_SAVE_VERSION,
    );

    expect(() =>
      OverworldSessionSnapshotSchema.parse({
        ...baseSnapshot(),
        supplies: 9,
      }),
    ).toThrow();
  });

  it("migrates strict version-8 snapshots to the canonical version-9 default", () => {
    const migrated = parseOverworldSessionSnapshot(legacySnapshot());
    const second = parseOverworldSessionSnapshot(legacySnapshot());

    expect(migrated).toEqual({
      ...legacySnapshot(),
      version: OVERWORLD_SESSION_SAVE_VERSION,
      character: createInitialCampaignCharacterState(),
    });
    expect(migrated.character).not.toBe(second.character);
  });

  it("rejects unsupported, disguised, and malformed snapshot versions", () => {
    expect(() => parseOverworldSessionSnapshot({ ...legacySnapshot(), version: 7 })).toThrow(
      /unsupported overworld session snapshot version 7/i,
    );
    expect(() => parseOverworldSessionSnapshot({ ...baseSnapshot(), version: 10 })).toThrow(
      /unsupported overworld session snapshot version 10/i,
    );
    expect(() => parseOverworldSessionSnapshot({ ...legacySnapshot(), version: "8" })).toThrow();
    expect(() =>
      parseOverworldSessionSnapshot({
        ...legacySnapshot(),
        character: createInitialCampaignCharacterState(),
      }),
    ).toThrow();
    expect(() => parseOverworldSessionSnapshot({ ...legacySnapshot(), supplies: 9 })).toThrow();
    const { character: _character, ...missingCharacter } = baseSnapshot();
    expect(() => parseOverworldSessionSnapshot(missingCharacter)).toThrow();
  });

  it("projects runtime travel log entries into compact save entries", () => {
    const entry: TravelLogEntry = {
      edgeId: "road:albany:colonie",
      fromId: "albany_city",
      toId: "colonie_town",
      from: "Albany",
      to: "Colonie",
      route: "Old Post Road",
      distanceMi: 8,
      baseMinutes: 20,
      delayMinutes: 5,
      minutes: 25,
      arrivedAt: 505,
      suppliesUsed: 1,
      suppliesAfter: 5,
      fatigueGained: 1,
      fatigueAfter: 1,
      roadEvent: null,
    };

    expect(snapshotTravelLogEntry(entry)).toEqual({
      edgeId: "road:albany:colonie",
      fromId: "albany_city",
      toId: "colonie_town",
      roadEventId: null,
      delayMinutes: 5,
      minutes: 25,
      arrivedAt: 505,
      suppliesUsed: 1,
      suppliesAfter: 5,
      fatigueGained: 1,
      fatigueAfter: 1,
    });
  });

  it("clones saved arrays, tuples, journals, and pending encounters", () => {
    const snapshot = baseSnapshot();
    const clone = cloneOverworldSessionSnapshot(snapshot);

    clone.discoveredIds.push("colonie_town");
    clone.currentAreaByTown[0]![1] = "changed_area";
    clone.travelLog[0]!.arrivedAt = 999;
    clone.journalEntries[0]!.title = "Changed";
    clone.questOutcomes.push(["wolf_winter", "ending_held"]);
    clone.regionRenown[0]![1] = 9;
    clone.pendingRoadEncounter!.edgeId = "changed_road";
    clone.journey.goal.status = "completed";
    clone.character.health.current = 1;

    expect(snapshot.discoveredIds).toEqual(["albany_city"]);
    expect(snapshot.currentAreaByTown[0]).toEqual(["albany_city", "albany_capitol_hill"]);
    expect(snapshot.travelLog[0]?.arrivedAt).toBe(500);
    expect(snapshot.journalEntries[0]?.title).toBe("Capitol Hill");
    expect(snapshot.questOutcomes).toEqual([]);
    expect(snapshot.regionRenown[0]).toEqual(["Capital / Mohawk", 1]);
    expect(snapshot.pendingRoadEncounter?.edgeId).toBe("road:albany:colonie");
    expect(snapshot.journey.goal.status).toBe("active");
    expect(snapshot.character.health.current).toBe(30);
  });

  it("clones journal entries independently", () => {
    const entries: OverworldJournalEntry[] = [
      {
        id: "service:rest:600",
        kind: "service",
        town: "albany_city",
        title: "Rest",
        text: "You recover.",
        recordedAt: "Day 1, 10:00",
      },
    ];

    const clones = cloneJournalEntries(entries);
    clones[0]!.title = "Changed";

    expect(entries[0]?.title).toBe("Rest");
  });
});
