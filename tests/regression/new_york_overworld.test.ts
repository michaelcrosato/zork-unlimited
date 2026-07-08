import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  assertOverworldIntegrity,
  overworldAreasAt,
  overworldCharactersAt,
  overworldEdgesFrom,
  overworldEventsAt,
  overworldExplorationSitesNear,
  overworldJobsAt,
  planOverworldRoute,
} from "../../src/world/overworld.js";
import { loadOverworldManifest } from "../../src/world/source.js";

const world = loadOverworldManifest(process.cwd());

describe("New York overworld graph", () => {
  it("uses New York as a town-and-road overworld, not a global quest menu", () => {
    expect(world.id).toBe("new_york_overworld");
    expect(world.start).toBe("albany_city");
    expect(world.scale.population_floor).toBe(10_000);
    expect(world.nodes.length).toBeGreaterThanOrEqual(240);
    expect(world.quests.length).toBe(12);
    expect(world.design_rules.join(" ")).toContain("not globally selectable");
    expect(world.design_rules.join(" ")).toContain("notice boards start empty");
    expect(world.design_rules.join(" ")).toContain("one local quest lead");
    expect(world.design_rules.join(" ")).toContain("first-class local areas");
    expect(world.design_rules.join(" ")).toContain("discoverable local job");
    expect(world.design_rules.join(" ")).toContain("actionable travel beats");
    expect(world.design_rules.join(" ")).toContain("looped local-area route graph");
    expect(world.regions.length).toBe(9);
    expect(world.regional_arcs.length).toBe(world.regions.length);
  });

  it("contains the major state population centers and only >=10K town nodes", () => {
    const byId = new Map(world.nodes.map((node) => [node.id, node]));

    for (const id of [
      "new_york_city",
      "buffalo_city",
      "rochester_city",
      "syracuse_city",
      "albany_city",
      "hempstead_town",
      "brookhaven_town",
    ]) {
      expect(byId.get(id), id).toBeDefined();
    }
    expect(world.nodes.filter((node) => node.population_2025 < 10_000)).toEqual([]);
    expect(byId.get("new_york_city")?.kind).toBe("metropolis");
    expect(byId.get("albany_city")?.kind).toBe("major_city");
  });

  it("has a connected weighted road graph with proportional travel time", () => {
    expect(() => assertOverworldIntegrity(world)).not.toThrow();
    expect(world.edges.length).toBeGreaterThan(world.nodes.length);
    expect(world.edges.some((edge) => edge.route.includes("I-90"))).toBe(true);
    expect(world.edges.some((edge) => edge.route.includes("I-87"))).toBe(true);
    expect(world.edges.some((edge) => edge.route.includes("I-495"))).toBe(true);

    const albanyRoads = overworldEdgesFrom(world, "albany_city");
    expect(albanyRoads.length).toBeGreaterThan(3);
    expect(albanyRoads.length).toBeLessThan(world.nodes.length / 10);
    expect(albanyRoads.map((edge) => edge.destination.id)).toContain("colonie_town");

    const buffaloRoute = planOverworldRoute(world, "albany_city", "buffalo_city");
    expect(buffaloRoute).not.toBeNull();
    expect(buffaloRoute!.steps.length).toBeGreaterThan(1);
    expect(buffaloRoute!.steps.some((step) => step.edge.route.includes("I-90"))).toBe(true);
    expect(buffaloRoute!.totalMinutes).toBe(
      buffaloRoute!.steps.reduce((sum, step) => sum + step.edge.travel_minutes, 0),
    );
  });

  it("places old quest sources locally instead of exposing all of them at start", () => {
    const local = world.quests.filter((quest) => quest.home === world.start);
    expect(local.length).toBeGreaterThan(0);
    expect(local.length).toBeLessThan(world.quests.length);
    expect(new Set(world.quests.map((quest) => quest.source)).size).toBe(world.quests.length);
    expect(world.design_rules.join(" ")).toContain("anchored to specific local areas");

    const areasById = new Map(world.areas.map((area) => [area.id, area]));
    for (const quest of world.quests) {
      const area = areasById.get(quest.area);
      expect(area, quest.id).toBeDefined();
      expect(area?.home, quest.id).toBe(quest.home);
      expect(quest.discovery, quest.id).toContain(area?.name);
    }
  });

  it("populates every town and road with exploration substrate", () => {
    expect(world.points_of_interest.length).toBeGreaterThanOrEqual(world.nodes.length);
    expect(world.areas.length).toBeGreaterThan(world.nodes.length * 2);
    expect(world.area_edges.length).toBeGreaterThan(world.areas.length - world.nodes.length);
    expect(world.characters.length).toBeGreaterThanOrEqual(world.nodes.length);
    expect(world.local_events.length).toBeGreaterThanOrEqual(world.nodes.length);
    expect(world.local_jobs.length).toBe(world.areas.length);
    expect(world.road_events.length).toBe(world.edges.length);
    expect(world.exploration_sites.length).toBe(world.areas.length);
    expect(world.design_rules.join(" ")).toContain("Every local area has at least one point");
    expect(world.design_rules.join(" ")).toContain("current local area's POIs");
    expect(world.design_rules.join(" ")).toContain(
      "Every local area has a regional exploration site",
    );
    expect(world.design_rules.join(" ")).toContain("consume time and write journal leads");
    expect(world.design_rules.join(" ")).toContain("consumes supplies and adds fatigue");
    expect(world.design_rules.join(" ")).toContain("deterministic travel delay");
    expect(world.design_rules.join(" ")).toContain("distance-based road time separately");
    expect(world.design_rules.join(" ")).toContain("earn regional renown");
    expect(world.design_rules.join(" ")).toContain("regional arc anchored");
    expect(world.design_rules.join(" ")).toContain("Every road has a road event");
    expect(world.design_rules.join(" ")).toContain("Regional exploration sites");

    for (const node of world.nodes) {
      const minimumLocalScale =
        node.kind === "metropolis"
          ? 10
          : node.kind === "great_city"
            ? 8
            : node.kind === "major_city"
              ? 6
              : node.kind === "city"
                ? 5
                : node.kind === "large_town"
                  ? 3
                  : 2;
      expect(overworldAreasAt(world, node.id).length, node.id).toBeGreaterThanOrEqual(
        minimumLocalScale,
      );
      expect(overworldJobsAt(world, node.id).length, node.id).toBeGreaterThanOrEqual(
        minimumLocalScale,
      );
      expect(overworldCharactersAt(world, node.id).length, node.id).toBeGreaterThan(0);
      expect(overworldEventsAt(world, node.id).length, node.id).toBeGreaterThan(0);
    }

    const jobAreas = new Set(world.local_jobs.map((job) => job.area));
    const poiAreas = new Set(world.points_of_interest.map((poi) => poi.area));
    const characterAreas = new Set(world.characters.map((character) => character.area));
    const eventAreas = new Set(world.local_events.map((event) => event.area));
    const siteAreas = new Set(world.exploration_sites.map((site) => site.area));
    for (const area of world.areas) {
      expect(jobAreas.has(area.id), area.id).toBe(true);
      expect(poiAreas.has(area.id), area.id).toBe(true);
      expect(characterAreas.has(area.id), area.id).toBe(true);
      expect(eventAreas.has(area.id), area.id).toBe(true);
      expect(siteAreas.has(area.id), area.id).toBe(true);
    }

    const areaRoutesByTown = new Map<string, number>();
    for (const route of world.area_edges) {
      areaRoutesByTown.set(route.home, (areaRoutesByTown.get(route.home) ?? 0) + 1);
    }
    const minimumAreaRouteCount = (areaCount: number): number =>
      areaCount <= 1
        ? 0
        : areaCount -
          1 +
          (areaCount >= 3 ? 1 : 0) +
          (areaCount >= 4 ? 2 : 0) +
          (areaCount >= 5 ? 1 : 0) +
          (areaCount >= 6 ? 1 : 0) +
          (areaCount >= 7 ? 1 : 0) +
          (areaCount >= 8 ? 1 : 0) +
          (areaCount >= 9 ? 1 : 0) +
          (areaCount >= 10 ? 1 : 0);
    for (const node of world.nodes) {
      const localAreaCount = overworldAreasAt(world, node.id).length;
      expect(areaRoutesByTown.get(node.id), node.id).toBeGreaterThanOrEqual(
        minimumAreaRouteCount(localAreaCount),
      );
    }

    expect(overworldAreasAt(world, "new_york_city").length).toBeGreaterThan(
      overworldAreasAt(world, "albany_city").length,
    );
    expect(overworldAreasAt(world, "albany_city").length).toBeGreaterThan(
      overworldAreasAt(world, "colonie_town").length,
    );

    const roadEventEdges = new Set(world.road_events.map((event) => event.edge));
    for (const edge of world.edges) {
      expect(roadEventEdges.has(edge.id), edge.id).toBe(true);
    }

    const nodesById = new Map(world.nodes.map((node) => [node.id, node]));
    for (const arc of world.regional_arcs) {
      expect(arc.required_resolutions).toBeLessThanOrEqual(arc.anchor_towns.length);
      expect(arc.anchor_towns.length).toBeGreaterThanOrEqual(arc.required_resolutions);
      for (const townId of arc.anchor_towns) {
        expect(nodesById.get(townId)?.region, `${arc.id}:${townId}`).toBe(arc.region);
      }
    }

    for (const region of world.regions) {
      expect(
        world.exploration_sites.filter((site) => site.region === region.name).length,
        region.name,
      ).toBeGreaterThanOrEqual(3);
    }
    for (const site of world.exploration_sites) {
      expect(nodesById.get(site.nearest_town)?.region, site.id).toBe(site.region);
      expect(world.areas.find((area) => area.id === site.area)?.home, site.id).toBe(
        site.nearest_town,
      );
      expect(
        overworldExplorationSitesNear(world, site.nearest_town).map((near) => near.id),
      ).toContain(site.id);
    }
  });

  it("removes the global quest selector from the app shell", () => {
    const app = readFileSync("ui/src/App.tsx", "utf8");
    expect(app).not.toContain("<select");
    expect(app).not.toContain("<option");
    expect(app).toContain("Roads From Here");
    expect(app).toContain("pendingRoadEncounter");
    expect(app).toContain("Handled road encounter");
    expect(app).toContain("Local Areas");
    expect(app).toContain("Current local area");
    expect(app).toContain("Local Routes");
    expect(app).toContain("moveArea");
    expect(app).toContain("Explore Area");
    expect(app).toContain("unmapped local");
    expect(app).toContain("Local Jobs");
    expect(app).toContain("Work Job");
    expect(app).toContain("undiscovered local");
    expect(app).toContain("Known Routes");
    expect(app).toContain("road min");
    expect(app).toContain("supplies {route.estimate.suppliesUsed}");
    expect(app).toContain("fatigue +");
    expect(app).toContain("Notice Board");
    expect(app).toContain("No posted work discovered yet");
    expect(app).toContain("Scout");
    expect(app).toContain("Talk");
    expect(app).toContain("Investigate");
    expect(app).toContain("Resolve");
    expect(app).toContain("Regional Sites");
    expect(app).toContain("Explore");
    expect(app).toContain("Regional Renown");
    expect(app).toContain("Regional Threads");
    expect(app).toContain("Supplies");
    expect(app).toContain("Fatigue");
    expect(app).toContain("Condition");
    expect(app).toContain("Resupply");
    expect(app).toContain("Rest");
  });
});
