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
import { cloneOverworldRoadEvent } from "../../src/world/overworld_clone.js";
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
    expect(world.design_rules.join(" ")).toContain("ambient reports never block");
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

  it("hand-authors the Albany-Colonie road event as direction-safe starting-area texture", () => {
    const albanyExit = overworldEdgesFrom(world, "albany_city").find(
      (edge) => edge.destination.id === "colonie_town",
    );
    const colonieExit = overworldEdgesFrom(world, "colonie_town").find(
      (edge) => edge.destination.id === "albany_city",
    );
    expect(albanyExit).toBeDefined();
    expect(colonieExit).toBeDefined();
    expect(colonieExit?.id).toBe(albanyExit?.id);

    const event = world.road_events.find((roadEvent) => roadEvent.edge === albanyExit?.id);
    expect(event).toBeDefined();
    expect(event?.title).toBe("Thruway shoulder flare-up");
    expect(event?.title.toLowerCase()).not.toContain("road report");
    expect(event?.summary).toContain("Between Albany city and Colonie town");
    expect(event?.summary).toContain("jackknifed box truck");
    expect(event?.summary).not.toMatch(/Albany city to Colonie town|Colonie town to Albany city/);
    expect(event?.requires_choice).toBe(true);
    expect(event?.active_goal_ids).toBeUndefined();
    expect(event?.retire_after_quest).toBeUndefined();
    expect(event?.responses).toMatchObject({
      cautious_scout: { label: "Walk the flare line" },
      assist_travelers: { label: "Help right the box truck" },
      press_on: { label: "Thread the narrow shoulder" },
    });
  });

  it("separates ambient reports from goal-scoped, authored road choices", () => {
    const byId = new Map(world.road_events.map((event) => [event.id, event]));
    const choiceEvents = world.road_events.filter((event) => event.requires_choice === true);

    expect(choiceEvents.map((event) => event.id).sort()).toEqual([
      "road_event_albany_city__saratoga_springs_city",
      "road_event_colonie_town__albany_city",
      "road_event_rome_city__oneida_city",
    ]);
    for (const event of choiceEvents) {
      expect(event.responses, event.id).toBeDefined();
      const responses = Object.values(event.responses!);
      expect(new Set(responses.map((response) => response.label.toLowerCase())).size).toBe(3);
      expect(new Set(responses.map((response) => response.outcome.toLowerCase())).size).toBe(3);
    }

    const relief = byId.get("road_event_albany_city__saratoga_springs_city");
    expect(relief).toMatchObject({
      active_goal_ids: ["carry_hedricks_packet_north", "travel_north_with_albany_wardens"],
      retire_after_quest: "gallowmere",
    });

    const moorSign = byId.get("road_event_saratoga_springs_city__queensbury_town");
    expect(moorSign).toMatchObject({
      active_goal_ids: ["carry_hedricks_packet_north", "travel_north_with_albany_wardens"],
      retire_after_quest: "gallowmere",
    });
    expect(moorSign?.requires_choice).toBeUndefined();
    expect(moorSign?.responses).toBeUndefined();

    const risingRiver = byId.get("road_event_rome_city__oneida_city");
    expect(risingRiver).toMatchObject({
      title: "The river at the mile stones",
      active_goal_ids: ["rome_breaking_weir"],
      retire_after_quest: "breaking_weir",
    });
    expect(risingRiver?.summary).toContain("upper weir is groaning");
    expect(risingRiver?.summary).not.toMatch(/Rome city to Oneida city|Oneida city to Rome city/);

    const generic = world.road_events.find((event) => event.title.endsWith("road report"));
    expect(generic).toBeDefined();
    expect(generic?.requires_choice).toBeUndefined();
    expect(generic?.active_goal_ids).toBeUndefined();
    expect(generic?.retire_after_quest).toBeUndefined();
    expect(generic?.responses).toBeUndefined();
  });

  it("enforces authored road-response integrity and clones its nested fields", () => {
    const event = world.road_events.find(
      (candidate) => candidate.id === "road_event_albany_city__saratoga_springs_city",
    )!;
    const clone = cloneOverworldRoadEvent(event);
    expect(clone).not.toBe(event);
    expect(clone.active_goal_ids).not.toBe(event.active_goal_ids);
    expect(clone.responses).not.toBe(event.responses);
    expect(clone.responses?.cautious_scout).not.toBe(event.responses?.cautious_scout);

    const missingResponses = structuredClone(world);
    const choiceWithoutResponses = missingResponses.road_events.find(
      (candidate) => candidate.id === event.id,
    )!;
    delete choiceWithoutResponses.responses;
    expect(() => assertOverworldIntegrity(missingResponses)).toThrow(
      /must define requires_choice and responses together/,
    );

    const duplicateOutcomes = structuredClone(world);
    const duplicated = duplicateOutcomes.road_events.find(
      (candidate) => candidate.id === event.id,
    )!;
    duplicated.responses!.press_on.outcome = duplicated.responses!.cautious_scout.outcome;
    expect(() => assertOverworldIntegrity(duplicateOutcomes)).toThrow(
      /response outcomes must be unique/,
    );

    const questIds = new Set(world.quests.map((quest) => quest.id));
    for (const roadEvent of world.road_events) {
      if (roadEvent.retire_after_quest) {
        expect(questIds.has(roadEvent.retire_after_quest), roadEvent.id).toBe(true);
      }
    }
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

  it("hand-authors Albany's opening bridge into The Wolf-Winter", () => {
    const nodesById = new Map(world.nodes.map((node) => [node.id, node]));
    const areasById = new Map(world.areas.map((area) => [area.id, area]));
    const poisById = new Map(world.points_of_interest.map((poi) => [poi.id, poi]));
    const contactsById = new Map(world.characters.map((contact) => [contact.id, contact]));
    const eventsById = new Map(world.local_events.map((event) => [event.id, event]));
    const jobsById = new Map(world.local_jobs.map((job) => [job.id, job]));
    const sitesById = new Map(world.exploration_sites.map((site) => [site.id, site]));
    const questsById = new Map(world.quests.map((quest) => [quest.id, quest]));

    const albany = nodesById.get("albany_city");
    const civic = areasById.get("albany_city__civic_core");
    const station = areasById.get("albany_city__transport_hub");
    const stationPoi = poisById.get("albany_city__transport_hub__poi");
    const hayden = contactsById.get("albany_city__transport_hub__contact");
    const stationEvent = eventsById.get("albany_city__transport_hub__event");
    const stationJob = jobsById.get("albany_city__transport_hub__job");
    const stationSite = sitesById.get("albany_city__transport_hub__site");
    const wolfWinter = questsById.get("wolf_winter");

    expect(albany?.description).toContain("Hudson roads");
    expect(civic?.summary).toContain("winter-relief petitions");
    expect(station?.summary).toContain("Rowan's circled petition");
    expect(station?.summary).toContain("hill-road dispatch");
    expect(station?.discovery).toContain("wolf-winter packet linking Albany's relief desk");
    expect(stationPoi?.summary).toContain("Hayden's route pin");
    expect(stationPoi?.summary).toContain("Old Cade waiting");
    expect(hayden?.agenda).toContain("packet Rowan flagged");
    expect(hayden?.agenda).toContain("Old Cade's hill steading");
    expect(stationEvent?.summary).toContain("Hayden's route pin");
    expect(stationEvent?.summary).toContain("Old Cade's cattle");
    expect(stationJob?.summary).toMatch(/wolf-winter/i);
    expect(stationSite?.discovery).toContain("Rowan's docket mark");
    expect(stationSite?.discovery).toContain("Old Cade's byre tag");
    expect(wolfWinter?.discovery).toContain("Albany Station Quarter");
    expect(wolfWinter?.discovery).toContain("cattle byre");
    expect(wolfWinter?.discovery).toContain("Albany's civic records");
    expect(wolfWinter?.discovery).toContain("live dispatch");
    expect(wolfWinter?.discovery).not.toContain("posted on the station board");

    const authoredBridge = [
      albany?.description,
      civic?.summary,
      station?.summary,
      station?.discovery,
      stationPoi?.summary,
      hayden?.summary,
      hayden?.agenda,
      stationEvent?.summary,
      stationJob?.summary,
      stationJob?.objective,
      stationSite?.summary,
      stationSite?.discovery,
      wolfWinter?.discovery,
    ].join(" ");
    expect(authoredBridge).not.toContain("concrete local lead point");
    expect(authoredBridge).not.toContain("Ask around Albany city for work tied to");
    expect(authoredBridge).not.toContain("make Albany City feel worked-in rather than decorative");
    expect(authoredBridge).not.toContain("from the station board");
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
    const journeyStatus = readFileSync("ui/src/JourneyStatus.tsx", "utf8");
    const journeyChoice = readFileSync("ui/src/JourneyChoiceScreen.tsx", "utf8");
    expect(app).not.toContain("<select");
    expect(app).not.toContain("<option");
    expect(app).toContain("Roads From Here");
    expect(app).toContain("pendingRoadEncounter");
    expect(app).toContain("Handled road encounter");
    expect(app).toMatch(/Handled road encounter:[\s\S]{0,300}result\.entry\.text/);
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
    expect(app).toContain("<JourneyStatus journey={journey}");
    expect(app).toContain("<JourneyChoiceScreen journey={journey}");
    expect(app).toContain("<JourneyStoryChoiceScreen journey={journey}");
    expect(app).toContain("<JourneyEndedScreen journey={journey}");
    expect(journeyStatus).toContain("journey.goalGuidance");
    expect(journeyStatus).toContain('aria-label="Objective guidance"');
    expect(journeyChoice).toContain("journey.goalGuidance");
    expect(app).toContain(
      "worldSession.recordQuestDecision(out.journeyActionId, out.journeyDecision)",
    );
  });
});
