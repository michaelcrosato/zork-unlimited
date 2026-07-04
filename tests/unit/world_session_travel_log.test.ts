import { describe, expect, it } from "vitest";
import type {
  OverworldEdge,
  OverworldNode,
  OverworldRoadEvent,
} from "../../src/world/overworld.js";
import type { TravelLogEntrySnapshot } from "../../src/world/session_snapshot.js";
import {
  restoreOverworldTravelLogEntries,
  restoreOverworldTravelLogEntry,
} from "../../src/world/session_travel_log.js";

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
    ...overrides,
  };
}

function travelEntry(overrides: Partial<TravelLogEntrySnapshot> = {}): TravelLogEntrySnapshot {
  return {
    edgeId: "road:a-b",
    fromId: "town_a",
    toId: "town_b",
    delayMinutes: 5,
    minutes: 65,
    arrivedAt: 545,
    suppliesUsed: 1,
    suppliesAfter: 4,
    fatigueGained: 1,
    fatigueAfter: 1,
    ...overrides,
  };
}

function restoreIndexes(
  overrides: {
    edgesById?: ReadonlyMap<string, OverworldEdge>;
    nodesById?: ReadonlyMap<string, OverworldNode>;
    roadEventsByEdgeId?: ReadonlyMap<string, OverworldRoadEvent>;
  } = {},
) {
  return {
    edgesById: overrides.edgesById ?? new Map([["road:a-b", edge()]]),
    nodesById:
      overrides.nodesById ??
      new Map([
        ["town_a", node("town_a", "Albany")],
        ["town_b", node("town_b", "Colonie")],
      ]),
    roadEventsByEdgeId: overrides.roadEventsByEdgeId ?? new Map([["road:a-b", roadEvent()]]),
  };
}

describe("overworld session travel log restoration", () => {
  it("restores runtime travel log entries from compact snapshot entries", () => {
    expect(restoreOverworldTravelLogEntry(travelEntry(), restoreIndexes())).toMatchObject({
      edgeId: "road:a-b",
      fromId: "town_a",
      toId: "town_b",
      from: "Albany",
      to: "Colonie",
      route: "Test Road",
      distanceMi: 12,
      baseMinutes: 60,
      delayMinutes: 5,
      minutes: 65,
      arrivedAt: 545,
      suppliesUsed: 1,
      suppliesAfter: 4,
      fatigueGained: 1,
      fatigueAfter: 1,
      roadEvent: roadEvent(),
    });
  });

  it("restores travel log arrays in snapshot order", () => {
    const restored = restoreOverworldTravelLogEntries(
      [
        travelEntry({ arrivedAt: 600 }),
        travelEntry({ edgeId: "road:b-c", fromId: "town_b", toId: "town_c" }),
      ],
      restoreIndexes({
        edgesById: new Map([
          ["road:a-b", edge()],
          ["road:b-c", edge({ id: "road:b-c", from: "town_b", to: "town_c" })],
        ]),
        nodesById: new Map([
          ["town_a", node("town_a")],
          ["town_b", node("town_b")],
          ["town_c", node("town_c")],
        ]),
      }),
    );

    expect(restored.map((entry) => entry.edgeId)).toEqual(["road:a-b", "road:b-c"]);
  });

  it("restores entries without a road event as plain travel", () => {
    expect(
      restoreOverworldTravelLogEntry(
        travelEntry(),
        restoreIndexes({ roadEventsByEdgeId: new Map() }),
      ).roadEvent,
    ).toBeNull();
  });

  it("rejects forged travel log entries against manifest roads and towns", () => {
    expect(() =>
      restoreOverworldTravelLogEntry(travelEntry({ edgeId: "missing_road" }), restoreIndexes()),
    ).toThrow(/unknown travel road/);
    expect(() =>
      restoreOverworldTravelLogEntry(travelEntry({ toId: "town_c" }), restoreIndexes()),
    ).toThrow(/travel road endpoints do not match/);
    expect(() =>
      restoreOverworldTravelLogEntry(travelEntry({ minutes: 66 }), restoreIndexes()),
    ).toThrow(/travel minutes do not match/);
    expect(() =>
      restoreOverworldTravelLogEntry(
        travelEntry(),
        restoreIndexes({ nodesById: new Map([["town_a", node("town_a")]]) }),
      ),
    ).toThrow(/references an unknown town/);
  });
});
