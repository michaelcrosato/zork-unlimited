import { describe, expect, it } from "vitest";
import type {
  OverworldEdge,
  OverworldExit,
  OverworldNode,
  OverworldRoadEvent,
  OverworldRoutePlan,
} from "../../src/world/overworld.js";
import {
  buildOverworldDiscoveredRouteOptions,
  cloneOverworldRouteOption,
  estimateOverworldRoute,
  indexedOverworldRoute,
  withOverworldRouteEstimate,
  withOverworldSessionRoadEvents,
  type OverworldRoutePlannerIndex,
} from "../../src/world/session_routes.js";
import type { TravelLogEntry } from "../../src/world/session_snapshot.js";

function node(id: string, overrides: Partial<OverworldNode> = {}): OverworldNode {
  return {
    id,
    name: id.toUpperCase(),
    kind: "town",
    source_geography: "incorporated_place",
    geoid: id,
    county_fips: "001",
    population_2025: 10_000,
    lat: 0,
    lon: 0,
    region: "Test Region",
    services: [],
    description: `${id} description`,
    ...overrides,
  };
}

function edge(
  id: string,
  from: string,
  to: string,
  travelMinutes: number,
  overrides: Partial<OverworldEdge> = {},
): OverworldEdge {
  return {
    id,
    from,
    to,
    route: id,
    road_class: "state_route",
    distance_mi: travelMinutes / 10,
    travel_minutes: travelMinutes,
    ...overrides,
  };
}

function roadEvent(
  edgeId: string,
  overrides: Partial<OverworldRoadEvent> = {},
): OverworldRoadEvent {
  return {
    id: `event:${edgeId}`,
    edge: edgeId,
    title: "Road trouble",
    risk: "high",
    summary: "A synthetic road event.",
    ...overrides,
  };
}

function routeIndex(
  nodes: readonly OverworldNode[],
  edges: readonly OverworldEdge[],
  roadEvents: readonly OverworldRoadEvent[] = [],
): OverworldRoutePlannerIndex {
  const nodesById = new Map(nodes.map((town) => [town.id, town]));
  const roadExitsByTown = new Map<string, OverworldExit[]>();
  for (const road of edges) {
    const fromDestination = nodesById.get(road.to);
    const toDestination = nodesById.get(road.from);
    if (!fromDestination || !toDestination) throw new Error(`Missing test endpoint ${road.id}`);
    const fromExit: OverworldExit = { ...road, destination: fromDestination };
    const toExit: OverworldExit = { ...road, destination: toDestination };
    roadExitsByTown.set(road.from, [...(roadExitsByTown.get(road.from) ?? []), fromExit]);
    roadExitsByTown.set(road.to, [...(roadExitsByTown.get(road.to) ?? []), toExit]);
  }
  return {
    nodes: nodesById,
    roadEventsByEdgeId: new Map(roadEvents.map((event) => [event.edge, event])),
    roadExitsByTown,
  };
}

function traveled(event: OverworldRoadEvent): TravelLogEntry {
  return {
    edgeId: event.edge,
    fromId: "a",
    toId: "b",
    from: "A",
    to: "B",
    route: "Test road",
    distanceMi: 1,
    baseMinutes: 10,
    delayMinutes: 0,
    minutes: 10,
    arrivedAt: 490,
    suppliesUsed: 1,
    suppliesAfter: 5,
    fatigueGained: 1,
    fatigueAfter: 1,
    roadEvent: event,
  };
}

describe("overworld session route helpers", () => {
  it("finds the fastest route and attaches road events to reconstructed steps", () => {
    const towns = [node("a"), node("b"), node("c"), node("d")];
    const roads = [
      edge("road:a-b", "a", "b", 30),
      edge("road:b-d", "b", "d", 30),
      edge("road:a-c", "a", "c", 10),
      edge("road:c-d", "c", "d", 80),
    ];
    const event = roadEvent("road:b-d", { risk: "medium" });

    const plan = indexedOverworldRoute(routeIndex(towns, roads, [event]), "a", "d");

    expect(plan?.steps.map((step) => step.edge.id)).toEqual(["road:a-b", "road:b-d"]);
    expect(plan?.totalMinutes).toBe(60);
    expect(plan?.totalDistanceMi).toBe(6);
    expect(plan?.steps[1]?.roadEvent).toEqual(event);
  });

  it("respects discovered-node route limits", () => {
    const towns = [node("a"), node("b"), node("c"), node("d")];
    const index = routeIndex(towns, [
      edge("road:a-b", "a", "b", 10),
      edge("road:b-d", "b", "d", 10),
      edge("road:a-c", "a", "c", 50),
      edge("road:c-d", "c", "d", 50),
    ]);

    const discoveredRoute = indexedOverworldRoute(index, "a", "d", new Set(["a", "c", "d"]));
    const undiscoveredDestination = indexedOverworldRoute(index, "a", "d", new Set(["a", "c"]));

    expect(discoveredRoute?.steps.map((step) => step.edge.id)).toEqual(["road:a-c", "road:c-d"]);
    expect(discoveredRoute?.totalMinutes).toBe(100);
    expect(undiscoveredDestination).toBeNull();
  });

  it("forecasts supplies, fatigue, and delay across multi-step routes", () => {
    const towns = [node("a"), node("b"), node("c")];
    const event = roadEvent("road:b-c");
    const plan = indexedOverworldRoute(
      routeIndex(towns, [edge("road:a-b", "a", "b", 60), edge("road:b-c", "b", "c", 240)], [event]),
      "a",
      "c",
    );
    if (!plan) throw new Error("Expected test route to exist.");

    expect(estimateOverworldRoute(plan, { supplies: 1, fatigue: 24 })).toEqual({
      baseMinutes: 300,
      delayMinutes: 84,
      elapsedMinutes: 384,
      suppliesNeeded: 3,
      suppliesUsed: 1,
      supplyDeficit: 2,
      suppliesAfter: 0,
      fatigueGained: 19,
      fatigueAfter: 43,
      travelConditionAfter: "out of supplies",
    });
  });

  it("forecasts only road scenes active for the current journey state", () => {
    const towns = [node("a"), node("b")];
    const event = roadEvent("road:a-b", {
      requires_choice: true,
      active_goal_ids: ["goal:north"],
      retire_after_quest: "quest:north",
      responses: {
        cautious_scout: {
          label: "Read flood marks",
          outcome: "You read every fresh flood mark before moving onward.",
        },
        assist_travelers: {
          label: "Brace warning stakes",
          outcome: "You brace the warning stakes before moving onward.",
        },
        press_on: {
          label: "Race rising water",
          outcome: "You race the rising water and accept the strain.",
        },
      },
    });
    const plan = indexedOverworldRoute(
      routeIndex(towns, [edge("road:a-b", "a", "b", 45)], [event]),
      "a",
      "b",
    );
    if (!plan) throw new Error("Expected test route to exist.");

    const state = {
      activeGoalId: "goal:north",
      completedQuestIds: new Set<string>(),
      travelLog: [] as TravelLogEntry[],
    };
    expect(withOverworldSessionRoadEvents(plan, state).steps[0]?.roadEvent).toBe(event);
    expect(
      withOverworldSessionRoadEvents(plan, { ...state, activeGoalId: "goal:other" }).steps[0]
        ?.roadEvent,
    ).toBeNull();
    expect(
      withOverworldSessionRoadEvents(plan, {
        ...state,
        completedQuestIds: new Set(["quest:north"]),
      }).steps[0]?.roadEvent,
    ).toBeNull();
    expect(
      withOverworldSessionRoadEvents(plan, { ...state, travelLog: [traveled(event)] }).steps[0]
        ?.roadEvent,
    ).toBeNull();
  });

  it("clones route options without sharing mutable step arrays or estimates", () => {
    const towns = [node("a"), node("b")];
    const plan = indexedOverworldRoute(
      routeIndex(towns, [edge("road:a-b", "a", "b", 45)]),
      "a",
      "b",
    );
    if (!plan) throw new Error("Expected test route to exist.");
    const routeOption = withOverworldRouteEstimate(plan, { supplies: 6, fatigue: 0 });

    const cloned = cloneOverworldRouteOption(routeOption);

    expect(cloned).toEqual(routeOption);
    expect(cloned.steps).not.toBe(routeOption.steps);
    expect(cloned.estimate).not.toBe(routeOption.estimate);
  });

  it("builds discovered route options in view priority order", () => {
    const current = node("a", { name: "Anchor", region: "Capital" });
    const sameRegion = node("b", { name: "Bayside", region: "Capital" });
    const largerSameRegion = node("c", {
      name: "Crossing",
      population_2025: 50_000,
      region: "Capital",
    });
    const otherRegion = node("d", { name: "Depot", region: "Frontier" });
    const hidden = node("e", { name: "Hidden", region: "Capital" });
    const index = routeIndex(
      [current, sameRegion, largerSameRegion, otherRegion, hidden],
      [
        edge("road:a-b", "a", "b", 20),
        edge("road:a-c", "a", "c", 20),
        edge("road:a-d", "a", "d", 5),
        edge("road:a-e", "a", "e", 1),
      ],
    );

    const options = buildOverworldDiscoveredRouteOptions({
      routePlannerIndex: index,
      current,
      currentId: current.id,
      discoveredIds: new Set([current.id, sameRegion.id, largerSameRegion.id, otherRegion.id]),
      resources: { fatigue: 0, supplies: 6 },
    });

    expect(options.map((option) => option.destination.id)).toEqual([
      largerSameRegion.id,
      sameRegion.id,
      otherRegion.id,
    ]);
    expect(options.map((option) => option.estimate.elapsedMinutes)).toEqual([20, 20, 5]);
  });

  it("returns a zero-length plan when route start and destination match", () => {
    const a = node("a");

    expect(indexedOverworldRoute(routeIndex([a], []), "a", "a")).toEqual({
      from: a,
      destination: a,
      steps: [],
      totalDistanceMi: 0,
      totalMinutes: 0,
    } satisfies OverworldRoutePlan);
  });
});
