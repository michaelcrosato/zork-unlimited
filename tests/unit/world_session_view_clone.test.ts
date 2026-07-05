import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseOverworldManifest } from "../../src/world/overworld.js";
import { OverworldSession } from "../../src/world/session.js";

const world = parseOverworldManifest(
  JSON.parse(readFileSync("content/world/new_york_overworld.json", "utf8")),
);

describe("overworld session view clone", () => {
  it("keeps returned full views from mutating cached session state", () => {
    const session = new OverworldSession(world);
    const first = session.view();
    const originalCurrentName = first.current.name;
    const originalCurrentServices = [...first.current.services];
    const originalCurrentAreaName = first.currentArea?.name;
    const originalCurrentAreaServices = first.currentArea
      ? [...first.currentArea.services]
      : undefined;
    const originalPoiTitle = first.pois[0]!.title;
    const originalRoadDestinationName = first.exits[0]!.destination.name;
    const originalAreaDestinationName = first.areaExits[0]?.destination.name;

    first.current.name = "mutated_by_test";
    first.current.services.push("mutated_by_test");
    if (first.currentArea) {
      first.currentArea.name = "mutated_by_test";
      first.currentArea.services.push("mutated_by_test");
    }
    first.pois[0]!.title = "mutated_by_test";
    first.exits[0]!.destination.name = "mutated_by_test";
    if (first.areaExits[0]) first.areaExits[0].destination.name = "mutated_by_test";

    const afterInitialMutation = session.view();
    expect(afterInitialMutation.current.name).toBe(originalCurrentName);
    expect(afterInitialMutation.current.services).toEqual(originalCurrentServices);
    expect(afterInitialMutation.currentArea?.name).toBe(originalCurrentAreaName);
    expect(afterInitialMutation.currentArea?.services).toEqual(originalCurrentAreaServices);
    expect(afterInitialMutation.pois[0]!.title).toBe(originalPoiTitle);
    expect(afterInitialMutation.exits[0]!.destination.name).toBe(originalRoadDestinationName);
    expect(afterInitialMutation.areaExits[0]?.destination.name).toBe(originalAreaDestinationName);

    session.scoutPoi(first.pois[0]!.id);

    const mutated = session.view();
    const originalJournalTitle = mutated.journal[0]!.title;
    const originalAreaName = mutated.areas[0]?.name;
    const originalDiscoveredTownName = mutated.discovered[0]!.name;
    const originalArcAnchorTownName = mutated.regionalArcs[0]?.anchorTowns[0]?.name;
    mutated.discoveredAreaIds.push("mutated_by_test");
    mutated.regionRenown.mutated_by_test = 99;
    mutated.journal[0]!.title = "mutated_by_test";
    if (mutated.areas[0]) mutated.areas[0].name = "mutated_by_test";
    mutated.discovered[0]!.name = "mutated_by_test";
    if (mutated.regionalArcs[0]?.anchorTowns[0]) {
      mutated.regionalArcs[0].anchorTowns[0].name = "mutated_by_test";
    }

    const fresh = session.view();

    expect(fresh.discoveredAreaIds).not.toContain("mutated_by_test");
    expect(fresh.regionRenown).not.toHaveProperty("mutated_by_test");
    expect(fresh.journal[0]!.title).toBe(originalJournalTitle);
    expect(fresh.areas[0]?.name).toBe(originalAreaName);
    expect(fresh.discovered[0]!.name).toBe(originalDiscoveredTownName);
    expect(fresh.regionalArcs[0]?.anchorTowns[0]?.name).toBe(originalArcAnchorTownName);
  });

  it("keeps returned route plans from mutating cached route state", () => {
    const session = new OverworldSession(world);
    const start = session.view();
    session.travel(start.exits[0]!.id);
    if (session.view().pendingRoadEncounter) session.resolveRoadEncounter("press_on");

    const routed = session.view();
    const route = routed.routeOptions[0]!;
    const originalDestinationName = route.destination.name;
    const originalStepToName = route.steps[0]!.to.name;
    const originalStepEventTitle = route.steps[0]!.roadEvent?.title;

    route.destination.name = "mutated_by_test";
    route.steps[0]!.to.name = "mutated_by_test";
    if (route.steps[0]!.roadEvent) route.steps[0]!.roadEvent.title = "mutated_by_test";

    const fresh = session.view();

    expect(fresh.routeOptions[0]!.destination.name).toBe(originalDestinationName);
    expect(fresh.routeOptions[0]!.steps[0]!.to.name).toBe(originalStepToName);
    expect(fresh.routeOptions[0]!.steps[0]!.roadEvent?.title).toBe(originalStepEventTitle);
  });

  it("keeps returned direct route plans from mutating route indexes", () => {
    const session = new OverworldSession(world);
    const route = session.planRoute("colonie_town");
    const originalDestinationName = route.destination.name;
    const originalStepToName = route.steps[0]!.to.name;
    const originalStepRoute = route.steps[0]!.edge.route;

    route.destination.name = "mutated_by_test";
    route.steps[0]!.to.name = "mutated_by_test";
    route.steps[0]!.edge.route = "mutated_by_test";

    const fresh = session.planRoute("colonie_town");

    expect(fresh.destination.name).toBe(originalDestinationName);
    expect(fresh.steps[0]!.to.name).toBe(originalStepToName);
    expect(fresh.steps[0]!.edge.route).toBe(originalStepRoute);
  });

  it("keeps returned action results from mutating session journals or discoveries", () => {
    const session = new OverworldSession(world);
    const before = session.view();
    const result = session.scoutPoi(before.pois[0]!.id);
    const originalJournalTitle = result.entry.title;
    const originalSiteTitle = result.discoveredSites?.[0]?.title;
    const originalJobTitle = result.discoveredJobs?.[0]?.title;

    result.entry.title = "mutated_by_test";
    if (result.discoveredSites?.[0]) result.discoveredSites[0].title = "mutated_by_test";
    if (result.discoveredJobs?.[0]) result.discoveredJobs[0].title = "mutated_by_test";

    const fresh = session.view();

    expect(fresh.journal[0]?.title).toBe(originalJournalTitle);
    expect(fresh.sites[0]?.title).toBe(originalSiteTitle);
    expect(fresh.jobs[0]?.title).toBe(originalJobTitle);
  });

  it("keeps returned travel, encounter, and service results detached", () => {
    const session = new OverworldSession(world);
    const eventRoad = session
      .view()
      .exits.find((exit) => world.road_events.some((event) => event.edge === exit.id));
    expect(eventRoad).toBeDefined();

    const travel = session.travel(eventRoad!.id);
    const originalTravelRoute = travel.route;
    const originalTravelEventTitle = travel.roadEvent?.title;
    travel.route = "mutated_by_test";
    if (travel.roadEvent) travel.roadEvent.title = "mutated_by_test";

    const afterTravel = session.view();
    expect(afterTravel.log[0]?.route).toBe(originalTravelRoute);
    expect(afterTravel.log[0]?.roadEvent?.title).toBe(originalTravelEventTitle);

    const encounter = session.resolveRoadEncounter("press_on");
    const originalEncounterJournalTitle = encounter.entry.title;
    const originalEncounterEventTitle = encounter.encounter.event.title;
    encounter.entry.title = "mutated_by_test";
    encounter.encounter.event.title = "mutated_by_test";

    const afterEncounter = session.view();
    expect(afterEncounter.journal[0]?.title).toBe(originalEncounterJournalTitle);
    expect(afterEncounter.log[0]?.roadEvent?.title).toBe(originalEncounterEventTitle);

    const service = session.resupplyAtTown();
    expect(service.entry).toBeDefined();
    const originalServiceJournalTitle = service.entry!.title;
    service.entry!.title = "mutated_by_test";

    expect(session.view().journal[0]?.title).toBe(originalServiceJournalTitle);
  });
});
