import { describe, expect, it } from "vitest";
import type {
  OverworldEdge,
  OverworldNode,
  OverworldRoadEvent,
} from "../../src/world/overworld.js";
import {
  buildOverworldPendingRoadEncounter,
  resolveOverworldRoadEncounter,
} from "../../src/world/session_road_encounters.js";

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
      event: roadEvent(),
    });
    expect(pending.options.map((option) => option.strategy)).toEqual([
      "cautious_scout",
      "assist_travelers",
      "press_on",
    ]);
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
