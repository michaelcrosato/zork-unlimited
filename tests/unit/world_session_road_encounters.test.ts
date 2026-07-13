import { describe, expect, it } from "vitest";
import type {
  OverworldEdge,
  OverworldNode,
  OverworldRoadEvent,
} from "../../src/world/overworld.js";
import {
  applyOverworldRoadEncounter,
  buildOverworldPendingRoadEncounter,
  resolveOverworldRoadEncounter,
  restoreOverworldPendingRoadEncounter,
} from "../../src/world/session_road_encounters.js";
import type {
  OverworldJournalEntry,
  TravelLogEntrySnapshot,
} from "../../src/world/session_snapshot.js";

function node(id: string, name = id.toUpperCase()): OverworldNode {
  return {
    id,
    name,
    kind: "town",
    source_geography: "incorporated_place",
    geoid: id,
    county_fips: "001",
    population_2025: 10_000,
    lat: 0,
    lon: 0,
    region: "Test Region",
    services: [],
    description: `${name} description`,
  };
}

function edge(overrides: Partial<OverworldEdge> = {}): OverworldEdge {
  return {
    id: "road:a-b",
    from: "town_a",
    to: "town_b",
    route: "Test Road",
    road_class: "state_route",
    distance_mi: 12,
    travel_minutes: 60,
    ...overrides,
  };
}

function roadEvent(overrides: Partial<OverworldRoadEvent> = {}): OverworldRoadEvent {
  return {
    id: "event:a-b",
    edge: "road:a-b",
    title: "Washed bridge",
    risk: "high",
    summary: "Floodwater has damaged the bridge approach.",
    requires_choice: true,
    responses: {
      cautious_scout: {
        label: "Scout the road problem",
        outcome:
          "You slow down, read the situation, and leave a useful warning for the next traveler.",
      },
      assist_travelers: {
        label: "Help resolve it",
        outcome:
          "You spend supplies and effort stabilizing the road trouble instead of merely passing it.",
      },
      press_on: {
        label: "Press on",
        outcome:
          "You keep moving and accept the extra strain rather than spending daylight on the encounter.",
      },
    },
    ...overrides,
  };
}

function ambientRoadEvent(overrides: Partial<OverworldRoadEvent> = {}): OverworldRoadEvent {
  return {
    id: "ambient:a-b",
    edge: "road:a-b",
    title: "Wet road report",
    risk: "medium",
    summary: "Standing water slows the shoulder traffic.",
    ...overrides,
  };
}

function travelEntry(overrides: Partial<TravelLogEntrySnapshot> = {}): TravelLogEntrySnapshot {
  return {
    edgeId: "road:a-b",
    fromId: "town_a",
    toId: "town_b",
    delayMinutes: 0,
    minutes: 60,
    arrivedAt: 540,
    suppliesUsed: 1,
    suppliesAfter: 4,
    fatigueGained: 1,
    fatigueAfter: 1,
    ...overrides,
  };
}

function restoreIndexes(overrides: Parameters<typeof restoreOverworldPendingRoadEncounter>[1]) {
  return overrides;
}

function roadApplicationState(
  overrides: {
    fatigue?: number;
    journalEntries?: OverworldJournalEntry[];
    journalEntriesById?: Map<string, OverworldJournalEntry>;
    minutes?: number;
    region?: string;
    regionRenown?: Map<string, number>;
    supplies?: number;
    townName?: string;
  } = {},
) {
  return {
    fatigue: overrides.fatigue ?? 10,
    journalEntries: overrides.journalEntries ?? [],
    journalEntriesById: overrides.journalEntriesById ?? new Map(),
    minutes: overrides.minutes ?? 600,
    region: overrides.region ?? "Capital Region",
    regionRenown: overrides.regionRenown ?? new Map(),
    supplies: overrides.supplies ?? 3,
    townName: overrides.townName ?? "Colonie",
  };
}

describe("overworld session road encounters", () => {
  it("builds a deterministic pending road encounter from travel context", () => {
    const pending = buildOverworldPendingRoadEncounter(
      node("town_a", "Albany"),
      node("town_b", "Colonie"),
      edge(),
      roadEvent(),
      540,
    );

    expect(pending).toMatchObject({
      id: "road:road:a-b:540",
      edgeId: "road:a-b",
      from: "Albany",
      to: "Colonie",
      route: "Test Road",
      arrivedAt: "Day 1, 09:00",
      timing:
        "On the road from Albany to Colonie at Day 1, 09:00; resolve this route trouble before doing town business in Colonie.",
      event: roadEvent(),
    });
    expect(pending.options.map((option) => option.strategy)).toEqual([
      "cautious_scout",
      "assist_travelers",
      "press_on",
    ]);
  });

  it("restores a rich pending road encounter from compact snapshot state", () => {
    const restored = restoreOverworldPendingRoadEncounter(
      { edgeId: "road:a-b" },
      restoreIndexes({
        activeGoalId: "goal:test",
        completedQuestIds: new Set(),
        currentId: "town_b",
        edgeIds: new Set(["road:a-b"]),
        edgesById: new Map([["road:a-b", edge()]]),
        latestTravel: travelEntry(),
        minutes: 540,
        nodesById: new Map([
          ["town_a", node("town_a", "Albany")],
          ["town_b", node("town_b", "Colonie")],
        ]),
        roadEventsByEdgeId: new Map([["road:a-b", roadEvent()]]),
        roadJournal: { byKey: new Map() },
      }),
    );

    expect(restored).toMatchObject({
      id: "road:road:a-b:540",
      edgeId: "road:a-b",
      from: "Albany",
      to: "Colonie",
      route: "Test Road",
      arrivedAt: "Day 1, 09:00",
      timing:
        "On the road from Albany to Colonie at Day 1, 09:00; resolve this route trouble before doing town business in Colonie.",
      event: roadEvent(),
    });
    expect(restored?.options.map((option) => option.strategy)).toEqual([
      "cautious_scout",
      "assist_travelers",
      "press_on",
    ]);
  });

  it("rejects invalid pending road encounter snapshot bindings", () => {
    const indexes = restoreIndexes({
      activeGoalId: "goal:test",
      completedQuestIds: new Set(),
      currentId: "town_b",
      edgeIds: new Set(["road:a-b", "road:b-c"]),
      edgesById: new Map([
        ["road:a-b", edge()],
        ["road:b-c", edge({ id: "road:b-c", from: "town_b", to: "town_c" })],
      ]),
      latestTravel: travelEntry(),
      minutes: 540,
      nodesById: new Map([
        ["town_a", node("town_a")],
        ["town_b", node("town_b")],
      ]),
      roadEventsByEdgeId: new Map([["road:a-b", roadEvent()]]),
      roadJournal: { byKey: new Map() },
    });

    expect(restoreOverworldPendingRoadEncounter(null, indexes)).toBeNull();
    expect(() => restoreOverworldPendingRoadEncounter({ edgeId: "missing_road" }, indexes)).toThrow(
      /unknown pending road/,
    );
    expect(() =>
      restoreOverworldPendingRoadEncounter(
        { edgeId: "road:a-b" },
        { ...indexes, currentId: "town_c" },
      ),
    ).toThrow(/pending road is not at the current town/);
    expect(() =>
      restoreOverworldPendingRoadEncounter(
        { edgeId: "road:a-b" },
        { ...indexes, roadEventsByEdgeId: new Map() },
      ),
    ).toThrow(/no road event/);
    expect(() =>
      restoreOverworldPendingRoadEncounter(
        { edgeId: "road:a-b" },
        {
          ...indexes,
          roadEventsByEdgeId: new Map([["road:a-b", ambientRoadEvent()]]),
        },
      ),
    ).toThrow(/ambient report, not a choice/);
    expect(() =>
      restoreOverworldPendingRoadEncounter(
        { edgeId: "road:a-b" },
        {
          ...indexes,
          roadEventsByEdgeId: new Map([
            ["road:a-b", roadEvent({ active_goal_ids: ["goal:other"] })],
          ]),
        },
      ),
    ).toThrow(/not active for the current goal/);
    expect(() =>
      restoreOverworldPendingRoadEncounter(
        { edgeId: "road:a-b" },
        {
          ...indexes,
          completedQuestIds: new Set(["quest:retired"]),
          roadEventsByEdgeId: new Map([
            ["road:a-b", roadEvent({ retire_after_quest: "quest:retired" })],
          ]),
        },
      ),
    ).toThrow(/retired by a completed quest/);
    expect(() =>
      restoreOverworldPendingRoadEncounter(
        { edgeId: "road:a-b" },
        { ...indexes, latestTravel: null },
      ),
    ).toThrow(/pending road encounter has no travel log/);
    expect(() =>
      restoreOverworldPendingRoadEncounter(
        { edgeId: "road:a-b" },
        { ...indexes, latestTravel: travelEntry({ roadEventId: null }) },
      ),
    ).toThrow(/did not fire/);
    expect(() =>
      restoreOverworldPendingRoadEncounter(
        { edgeId: "road:a-b" },
        { ...indexes, latestTravel: travelEntry({ roadEventId: "other_event" }) },
      ),
    ).toThrow(/does not match latest travel road event/);
    expect(() =>
      restoreOverworldPendingRoadEncounter(
        { edgeId: "road:b-c" },
        {
          ...indexes,
          roadEventsByEdgeId: new Map([["road:b-c", roadEvent({ edge: "road:b-c" })]]),
        },
      ),
    ).toThrow(/latest travel log road/);
    expect(() =>
      restoreOverworldPendingRoadEncounter(
        { edgeId: "road:a-b" },
        { ...indexes, roadJournal: { byKey: new Map([["road:a-b@540", true]]) } },
      ),
    ).toThrow(/already has a road journal/);
    expect(() =>
      restoreOverworldPendingRoadEncounter(
        { edgeId: "road:a-b" },
        { ...indexes, nodesById: new Map([["town_b", node("town_b")]]) },
      ),
    ).toThrow(/references an unknown town/);
  });

  it("never builds a blocking encounter from an ambient road report", () => {
    expect(() =>
      buildOverworldPendingRoadEncounter(
        node("town_a"),
        node("town_b"),
        edge(),
        ambientRoadEvent(),
        540,
      ),
    ).toThrow(/ambient and cannot become an encounter/);
  });

  it("resolves supply deficits, fatigue caps, and road journal entries", () => {
    const pending = buildOverworldPendingRoadEncounter(
      node("town_a"),
      node("town_b"),
      edge(),
      roadEvent(),
      540,
    );

    const resolution = resolveOverworldRoadEncounter(pending, "assist_travelers", {
      fatigue: 99,
      minutes: 600,
      supplies: 1,
      townName: "Colonie",
    });

    expect(resolution).toMatchObject({
      suppliesAfter: 0,
      fatigueAfter: 100,
      minutesAfter: 670,
      result: {
        strategy: "assist_travelers",
        minutes: 70,
        suppliesUsed: 1,
        fatigueGained: 6,
        renownGained: 4,
        encounter: pending,
        entry: {
          id: "road:road:a-b:540:assist_travelers",
          kind: "road",
          town: "Colonie",
          title: "Help resolve it: Washed bridge",
          recordedAt: "Day 1, 11:10",
        },
      },
    });
    expect(resolution.result.entry.text).toContain("Lacking supplies");
    expect(resolution.result.entry.text).toContain("On the road from TOWN_A to TOWN_B");
    expect(resolution.result.entry.text).toContain("Afterward you arrive in TOWN_B.");
  });

  it("resolves press-on encounters without supply spend or renown", () => {
    const pending = buildOverworldPendingRoadEncounter(
      node("town_a"),
      node("town_b"),
      edge(),
      roadEvent(),
      540,
    );

    const resolution = resolveOverworldRoadEncounter(pending, "press_on", {
      fatigue: 10,
      minutes: 600,
      supplies: 3,
      townName: "Colonie",
    });

    expect(resolution).toMatchObject({
      suppliesAfter: 3,
      fatigueAfter: 13,
      minutesAfter: 600,
      result: {
        minutes: 0,
        suppliesUsed: 0,
        fatigueGained: 3,
        renownGained: 0,
      },
    });
    expect(resolution.result.entry.text).not.toContain("Lacking supplies");
  });

  it("applies resolved road encounters to journals and regional renown", () => {
    const pending = buildOverworldPendingRoadEncounter(
      node("town_a", "Albany"),
      node("town_b", "Colonie"),
      edge(),
      roadEvent(),
      540,
    );
    const state = roadApplicationState({
      fatigue: 99,
      regionRenown: new Map([["Capital Region", 2]]),
      supplies: 1,
    });

    const applied = applyOverworldRoadEncounter(pending, "assist_travelers", state);

    expect(applied).toMatchObject({
      suppliesAfter: 0,
      fatigueAfter: 100,
      minutesAfter: 670,
      pendingRoadEncounterAfter: null,
      regionRenownAfter: 6,
      result: {
        strategy: "assist_travelers",
        suppliesUsed: 1,
        fatigueGained: 6,
        renownGained: 4,
      },
    });
    expect(state.regionRenown.get("Capital Region")).toBe(6);
    expect(state.journalEntries).toEqual([applied.result.entry]);
    expect(state.journalEntriesById.get("road:road:a-b:540:assist_travelers")).toBe(
      applied.result.entry,
    );
  });

  it("applies zero-renown road encounters without changing region renown", () => {
    const pending = buildOverworldPendingRoadEncounter(
      node("town_a", "Albany"),
      node("town_b", "Colonie"),
      edge(),
      roadEvent(),
      540,
    );
    const state = roadApplicationState({
      regionRenown: new Map([["Capital Region", 2]]),
    });

    const applied = applyOverworldRoadEncounter(pending, "press_on", state);

    expect(applied).toMatchObject({
      suppliesAfter: 3,
      fatigueAfter: 13,
      minutesAfter: 600,
      pendingRoadEncounterAfter: null,
      regionRenownAfter: 2,
      result: {
        strategy: "press_on",
        renownGained: 0,
      },
    });
    expect(state.regionRenown.get("Capital Region")).toBe(2);
    expect(state.journalEntries).toEqual([applied.result.entry]);
  });

  it("rejects unknown strategies against the pending encounter options", () => {
    const pending = buildOverworldPendingRoadEncounter(
      node("town_a"),
      node("town_b"),
      edge(),
      roadEvent({ risk: "low" }),
      540,
    );

    expect(() =>
      resolveOverworldRoadEncounter(pending, "wait_here" as never, {
        fatigue: 0,
        minutes: 600,
        supplies: 3,
        townName: "Colonie",
      }),
    ).toThrow(/Unknown road encounter strategy/);
  });
});
