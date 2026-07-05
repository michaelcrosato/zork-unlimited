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
});
