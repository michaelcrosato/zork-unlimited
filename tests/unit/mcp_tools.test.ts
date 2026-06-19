import { describe, it, expect, beforeAll } from "vitest";
import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { createToolApi } from "../../src/mcp/tools.js";
import { PathEscapeError } from "../../src/mcp/paths.js";
import { loadPackFile } from "../../src/cyoa/pack.js";
import { indexPack, buildRules, initStateForPack } from "../../src/cyoa/runner.js";
import { recordTrace } from "../../src/trace/record.js";
import { parseOverworldManifest } from "../../src/world/overworld.js";

const ROOT = process.cwd();
const PACK = "content/cyoa/pack/watchtower_road.yaml";
const api = () => createToolApi({ root: ROOT });
const overworld = parseOverworldManifest(
  JSON.parse(readFileSync("content/world/new_york_overworld.json", "utf8")),
);

function overworldRoadPath(from: string, to: string): string[] {
  const queue: { town: string; roadIds: string[] }[] = [{ town: from, roadIds: [] }];
  const seen = new Set<string>([from]);
  for (let i = 0; i < queue.length; i += 1) {
    const cur = queue[i]!;
    if (cur.town === to) return cur.roadIds;
    for (const edge of overworld.edges.filter(
      (candidate) => candidate.from === cur.town || candidate.to === cur.town,
    )) {
      const next = edge.from === cur.town ? edge.to : edge.from;
      if (seen.has(next)) continue;
      seen.add(next);
      queue.push({ town: next, roadIds: [...cur.roadIds, edge.id] });
    }
  }
  throw new Error(`No road path from ${from} to ${to}.`);
}

function travelOverworldSessionTo(
  a: ReturnType<typeof api>,
  sessionId: string,
  townId: string,
): void {
  const start = a.get_overworld_session({ session_id: sessionId }).observation.current.id;
  for (const roadId of overworldRoadPath(start, townId)) {
    a.travel_overworld_session({ session_id: sessionId, road_id: roadId });
    const observation = a.get_overworld_session({ session_id: sessionId }).observation;
    if (observation.pendingRoadEncounter) {
      a.resolve_overworld_session_road_encounter({
        session_id: sessionId,
        strategy: "press_on",
      });
    }
  }
}

function resolveCurrentOverworldSessionEvent(
  a: ReturnType<typeof api>,
  sessionId: string,
): ReturnType<ReturnType<typeof api>["resolve_overworld_session_event"]> {
  const view = a.get_overworld_session({ session_id: sessionId }).observation;
  const event = view.events.find((candidate) => !view.resolvedEventIds.includes(candidate.id));
  if (!event) throw new Error(`No unresolved event in ${view.current.id}.`);
  a.scout_overworld_session_poi({ session_id: sessionId, poi_id: view.pois[0]!.id });
  a.talk_overworld_session_contact({
    session_id: sessionId,
    character_id: view.characters[0]!.id,
  });
  a.investigate_overworld_session_event({ session_id: sessionId, event_id: event.id });
  return a.resolve_overworld_session_event({ session_id: sessionId, event_id: event.id });
}

describe("MCP tools — validate / load (§9.4)", () => {
  it("keeps legacy story discovery world-bound for AFK", () => {
    const r = api().list_stories();
    expect(r.main_story).toBe(PACK);
    expect(r.stories.some((s) => s.path === PACK && s.playable)).toBe(true);
    expect(r.stories.find((s) => s.path === PACK)?.world?.hub).toBe("Charterhaven");
  });

  it("lists the unified world as a hub plus quest areas", () => {
    const r = api().list_world();
    expect(r.world.id).toBe("charter_marches");
    expect(r.hub).toBe("Charterhaven");
    expect(r.graph.hub).toBe("charterhaven");
    expect(r.quest_count).toBe(46);
    expect(r.quests.find((q) => q.path === PACK)).toMatchObject({
      district: "North Road Watch",
      quest: "expose the watchtower smuggling road",
      role: "road warden",
      playable: true,
      graph_node: "watchtower_road",
    });
    expect(r.quests.find((q) => q.path === PACK)?.path_from_hub.map((step) => step.name)).toEqual([
      "Charterhaven",
      "North Road",
      "The Watchtower Road",
    ]);
  });

  it("returns the graph path from Charterhaven to a quest", () => {
    const r = api().world_path({ quest_path: PACK });
    expect(r.graph_node).toBe("watchtower_road");
    expect(r.path_from_hub.map((step) => step.name)).toEqual([
      "Charterhaven",
      "North Road",
      "The Watchtower Road",
    ]);
    expect(r.path_from_hub[1]?.route_from_previous).toBe("north road");
  });

  it("lists the New York overworld as a start town plus weighted roads", () => {
    const r = api().list_overworld();
    expect(r.world.id).toBe("new_york_overworld");
    expect(r.start.id).toBe("albany_city");
    expect(r.town_count).toBeGreaterThanOrEqual(240);
    expect(r.road_count).toBeGreaterThan(r.town_count);
    expect(r.region_count).toBe(9);
    expect(r.regional_arc_count).toBe(r.region_count);
    expect(r.area_count).toBeGreaterThan(r.town_count * 2);
    expect(r.area_route_count).toBeGreaterThan(r.area_count - r.town_count);
    expect(r.character_count).toBeGreaterThanOrEqual(r.town_count);
    expect(r.local_event_count).toBeGreaterThanOrEqual(r.town_count);
    expect(r.local_job_count).toBe(r.area_count);
    expect(r.road_event_count).toBe(r.road_count);
    expect(r.exploration_site_count).toBeGreaterThanOrEqual(r.region_count * 3);
    expect(r.quest_count).toBe(43);
  });

  it("looks and travels through the New York overworld without global quest selection", () => {
    const a = api();
    const start = a.look_overworld({});
    expect(start.current.id).toBe("albany_city");
    expect(start.exits.length).toBeGreaterThan(3);
    expect(start.areas.length).toBeGreaterThan(1);
    expect(start.local_area_routes.length).toBeGreaterThan(start.areas.length - 1);
    expect(start.characters.length).toBeGreaterThan(0);
    expect(start.local_events.length).toBeGreaterThan(0);
    expect(start.local_jobs.length).toBe(start.areas.length);
    expect(start.nearby_sites.length).toBeGreaterThan(0);
    expect(start.local_quests.length).toBeGreaterThan(0);
    expect(start.local_quests.length).toBeLessThan(43);

    const road = start.exits.find((edge) => edge.destination.id === "colonie_town");
    expect(road).toBeTruthy();
    const traveled = a.travel_overworld({ from_town: "albany_city", road_id: road!.id });
    expect(traveled.to.id).toBe("colonie_town");
    expect(traveled.road.travel_minutes).toBe(road!.travel_minutes);
    expect(traveled.road_event?.edge).toBe(road!.id);
    expect(traveled.arrival.current.id).toBe("colonie_town");
    expect(traveled.arrival.areas.length).toBeGreaterThan(1);
    expect(traveled.arrival.local_area_routes.length).toBeGreaterThan(
      traveled.arrival.areas.length - 1,
    );
    expect(traveled.arrival.characters.length).toBeGreaterThan(0);
    expect(traveled.arrival.local_jobs.length).toBe(traveled.arrival.areas.length);
    expect(() =>
      a.travel_overworld({
        from_town: "albany_city",
        road_id: "road_buffalo_city__tonawanda_town",
      }),
    ).toThrow(/not reachable/i);
  });

  it("scouts, talks, and investigates local overworld material through MCP", () => {
    const a = api();
    const start = a.look_overworld({});
    const poi = start.points_of_interest[0]!;
    const contact = start.characters[0]!;
    const event = start.local_events[0]!;
    const area = start.areas[0]!;
    const job = start.local_jobs[0]!;

    const exploreArea = a.explore_overworld_area({ area_id: area.id });
    expect(exploreArea.current.id).toBe("albany_city");
    expect(exploreArea.minutes).toBe(area.travel_minutes);
    expect(exploreArea.area.id).toBe(area.id);
    expect(exploreArea.journal_entry).toMatchObject({
      kind: "area",
      title: `Explored ${area.name}`,
    });

    const workJob = a.work_overworld_job({ job_id: job.id });
    expect(workJob.current.id).toBe("albany_city");
    expect(workJob.minutes).toBe(job.minutes);
    expect(workJob.regional_renown).toBe(job.difficulty);
    expect(workJob.journal_entry).toMatchObject({
      kind: "job",
      title: `Completed ${job.title}`,
    });

    const scout = a.scout_overworld_poi({ poi_id: poi.id });
    expect(scout.current.id).toBe("albany_city");
    expect(scout.minutes).toBe(20);
    expect(scout.point_of_interest.id).toBe(poi.id);
    expect(scout.journal_entry.kind).toBe("poi");
    expect(scout.journal_entry.title).toContain(poi.title);

    const talk = a.talk_overworld_contact({ character_id: contact.id });
    expect(talk.minutes).toBe(15);
    expect(talk.character.id).toBe(contact.id);
    expect(talk.journal_entry.text).toContain(contact.agenda);

    const investigate = a.investigate_overworld_event({ event_id: event.id });
    expect(investigate.minutes).toBe(20 + event.intensity * 5);
    expect(investigate.event.id).toBe(event.id);
    expect(investigate.journal_entry.text).toContain(event.pressure);

    const site = start.nearby_sites[0]!;
    const explore = a.explore_overworld_site({ site_id: site.id });
    expect(explore.site.id).toBe(site.id);
    expect(explore.minutes).toBe(45 + site.danger * 15);
    expect(explore.regional_renown).toBe(site.danger);
    expect(explore.journal_entry).toMatchObject({
      kind: "site",
      title: `Explored ${site.title}`,
    });

    const colonie = a.look_overworld({ town_id: "colonie_town" });
    expect(() => a.scout_overworld_poi({ poi_id: colonie.points_of_interest[0]!.id })).toThrow(
      /not in/i,
    );
    expect(() => a.talk_overworld_contact({ character_id: colonie.characters[0]!.id })).toThrow(
      /not in/i,
    );
    expect(() => a.investigate_overworld_event({ event_id: colonie.local_events[0]!.id })).toThrow(
      /not active/i,
    );
    expect(() => a.explore_overworld_area({ area_id: colonie.areas[0]!.id })).toThrow(/not in/i);
    expect(() => a.work_overworld_job({ job_id: colonie.local_jobs[0]!.id })).toThrow(/not in/i);
  });

  it("plays a stateful New York overworld session through MCP", () => {
    const a = api();
    const started = a.start_overworld();
    expect(started.session_id).toMatch(/^oworld_/);
    expect(started.observation.current.id).toBe("albany_city");
    expect(started.observation.journal).toEqual([]);
    expect(started.observation.areas).toHaveLength(1);
    expect(started.observation.currentArea?.id).toBe(started.observation.areas[0]?.id);
    expect(started.observation.areaExits).toEqual([]);
    expect(started.observation.hiddenAreaCount).toBeGreaterThan(0);
    expect(started.observation.discoveredAreaIds).toEqual(
      started.observation.areas.map((area) => area.id),
    );
    expect(started.observation.visitedAreaIds).toEqual([]);
    expect(started.observation.sites).toEqual([]);
    expect(started.observation.hiddenSiteCount).toBeGreaterThan(0);
    expect(started.observation.jobs).toEqual([]);
    expect(started.observation.hiddenJobCount).toBeGreaterThan(0);
    expect(started.observation.discoveredJobIds).toEqual([]);
    expect(started.observation.completedJobIds).toEqual([]);
    expect(started.observation.quests).toEqual([]);
    expect(started.observation.hiddenQuestCount).toBeGreaterThan(0);
    expect(started.observation.discoveredQuestIds).toEqual([]);
    expect(started.observation.supplies).toBe(6);
    expect(started.observation.maxSupplies).toBe(8);
    expect(started.observation.fatigue).toBe(0);
    expect(started.observation.travelCondition).toBe("ready");
    expect(started.observation.pendingRoadEncounter).toBeNull();
    expect(started.observation.routeOptions.map((route) => route.destination.id)).toContain(
      "colonie_town",
    );
    expect(started.observation.regionalArcs[0]).toMatchObject({
      region: "Capital / Mohawk",
      completed: false,
      resolvedInRegion: 0,
    });

    const poi = started.observation.pois[0]!;
    const contact = started.observation.characters[0]!;
    const event = started.observation.events[0]!;
    const localQuests = overworld.quests
      .filter((quest) => quest.home === started.observation.current.id)
      .sort((a, b) => a.title.localeCompare(b.title));
    expect(localQuests.length).toBeGreaterThan(0);
    const planned = a.plan_overworld_session_route({
      session_id: started.session_id,
      destination_town_id: "colonie_town",
    });
    expect(planned.route.destination.id).toBe("colonie_town");
    expect(planned.route.steps[0]?.to.id).toBe("colonie_town");
    expect(planned.route.estimate).toMatchObject({
      baseMinutes: planned.route.totalMinutes,
      delayMinutes: 0,
      elapsedMinutes: planned.route.totalMinutes,
      supplyDeficit: 0,
    });
    expect(planned.observation.routeOptions[0]?.estimate.suppliesNeeded).toBeGreaterThan(0);
    expect(() =>
      a.plan_overworld_session_route({
        session_id: started.session_id,
        destination_town_id: "buffalo_city",
      }),
    ).toThrow(/not discovered/i);

    expect(() =>
      a.resolve_overworld_session_event({
        session_id: started.session_id,
        event_id: event.id,
      }),
    ).toThrow(/Before resolving/i);

    const scouted = a.scout_overworld_session_poi({
      session_id: started.session_id,
      poi_id: poi.id,
    });
    expect(scouted.result.minutes).toBe(20);
    expect(scouted.result.discoveredJobs).toHaveLength(1);
    expect(scouted.result.discoveredSites).toHaveLength(1);
    expect(scouted.result.discoveredQuests?.map((quest) => quest.id)).toEqual(
      localQuests.slice(0, 1).map((quest) => quest.id),
    );
    expect(scouted.observation.sites.map((site) => site.id)).toEqual(
      scouted.result.discoveredSites?.map((site) => site.id),
    );
    expect(scouted.observation.jobs.map((job) => job.id)).toEqual(
      scouted.result.discoveredJobs?.map((job) => job.id),
    );
    expect(scouted.observation.quests.map((quest) => quest.id)).toEqual(
      localQuests.slice(0, 1).map((quest) => quest.id),
    );
    expect(scouted.observation.hiddenQuestCount).toBe(localQuests.length - 1);
    expect(scouted.observation.journal[0]?.title).toContain(poi.title);

    const discoveredQuests = scouted.result.discoveredQuests ?? [];
    expect(discoveredQuests).toHaveLength(1);
    const discoveredQuest = discoveredQuests[0]!;
    expect(discoveredQuest.area).toBeDefined();
    expect(scouted.observation.currentArea?.id).not.toBe(discoveredQuest.area);
    expect(() =>
      a.start_overworld_session_quest({
        session_id: started.session_id,
        quest_id: discoveredQuest.id,
      }),
    ).toThrow(/Move to/i);

    const routeToQuestArea = scouted.observation.areaExits.find(
      (exit) => exit.destination.id === discoveredQuest.area,
    );
    expect(routeToQuestArea).toBeDefined();
    const movedToQuestArea = a.move_overworld_session_area({
      session_id: started.session_id,
      area_route_id: routeToQuestArea!.id,
    });
    expect(movedToQuestArea.result.to.id).toBe(discoveredQuest.area);
    const startedQuest = a.start_overworld_session_quest({
      session_id: started.session_id,
      quest_id: discoveredQuest.id,
    });
    expect(startedQuest.quest).toMatchObject({
      id: discoveredQuest.id,
      area: discoveredQuest.area,
    });

    expect(() =>
      a.scout_overworld_session_poi({
        session_id: started.session_id,
        poi_id: poi.id,
      }),
    ).toThrow(/Move to that local area/i);
    const routeBackToCivicCore = movedToQuestArea.observation.areaExits.find(
      (exit) => exit.destination.id === started.observation.currentArea?.id,
    );
    expect(routeBackToCivicCore).toBeDefined();
    a.move_overworld_session_area({
      session_id: started.session_id,
      area_route_id: routeBackToCivicCore!.id,
    });

    const repeated = a.scout_overworld_session_poi({
      session_id: started.session_id,
      poi_id: poi.id,
    });
    expect(repeated.result.alreadyKnown).toBe(true);
    expect(repeated.result.minutes).toBe(0);
    expect(repeated.result.discoveredSites).toEqual([]);
    expect(repeated.result.discoveredJobs).toEqual([]);
    expect(repeated.result.discoveredQuests).toEqual([]);
    expect(repeated.observation.journal).toHaveLength(1);

    const talked = a.talk_overworld_session_contact({
      session_id: started.session_id,
      character_id: contact.id,
    });
    expect(talked.result.discoveredQuests?.map((quest) => quest.id)).toEqual(
      localQuests.slice(1, 2).map((quest) => quest.id),
    );
    expect(talked.observation.quests.map((quest) => quest.id)).toEqual(
      localQuests.slice(0, 2).map((quest) => quest.id),
    );
    expect(talked.observation.journal).toHaveLength(2);

    const investigated = a.investigate_overworld_session_event({
      session_id: started.session_id,
      event_id: event.id,
    });
    expect(investigated.result.discoveredQuests).toEqual([]);
    expect(investigated.observation.journal).toHaveLength(3);
    expect(investigated.observation.timeLabel).not.toBe(started.observation.timeLabel);

    const resolved = a.resolve_overworld_session_event({
      session_id: started.session_id,
      event_id: event.id,
    });
    expect(resolved.result.minutes).toBe(30 + event.intensity * 10);
    expect(resolved.result.entry.kind).toBe("resolution");
    expect(resolved.observation.journal).toHaveLength(4);
    expect(resolved.observation.resolvedEventIds).toContain(event.id);
    expect(resolved.observation.regionRenown[started.observation.current.region]).toBe(
      event.intensity,
    );
    expect(resolved.observation.regionalArcs[0]).toMatchObject({
      region: "Capital / Mohawk",
      resolvedInRegion: 1,
      completed: false,
    });

    const road = resolved.observation.exits.find((edge) => edge.destination.id === "colonie_town");
    expect(road).toBeTruthy();
    const traveled = a.travel_overworld_session({
      session_id: started.session_id,
      road_id: road!.id,
    });
    expect(traveled.travel.baseMinutes).toBe(road!.travel_minutes);
    expect(traveled.travel.delayMinutes).toBe(0);
    expect(traveled.travel.minutes).toBe(road!.travel_minutes);
    expect(traveled.travel.suppliesUsed).toBeGreaterThan(0);
    expect(traveled.travel.suppliesAfter).toBeLessThan(resolved.observation.supplies);
    expect(traveled.travel.fatigueGained).toBeGreaterThan(0);
    expect(traveled.travel.fatigueAfter).toBeGreaterThan(resolved.observation.fatigue);
    expect(traveled.observation.current.id).toBe("colonie_town");
    expect(traveled.observation.areas).toHaveLength(1);
    expect(traveled.observation.currentArea?.id).toBe(traveled.observation.areas[0]?.id);
    expect(traveled.observation.supplies).toBe(traveled.travel.suppliesAfter);
    expect(traveled.observation.fatigue).toBe(traveled.travel.fatigueAfter);
    expect(traveled.observation.pendingRoadEncounter).toMatchObject({
      edgeId: road!.id,
      from: "Albany city",
      to: "Colonie town",
    });
    expect(
      traveled.observation.pendingRoadEncounter?.options.map((option) => option.strategy),
    ).toEqual(["cautious_scout", "assist_travelers", "press_on"]);
    expect(traveled.observation.log[0]?.to).toBe("Colonie town");
    expect(traveled.observation.journal).toHaveLength(4);

    expect(() =>
      a.travel_overworld_session({
        session_id: started.session_id,
        road_id: traveled.observation.exits[0]!.id,
      }),
    ).toThrow(/pending road encounter/i);

    const roadEncounter = a.resolve_overworld_session_road_encounter({
      session_id: started.session_id,
      strategy: "cautious_scout",
    });
    expect(roadEncounter.result).toMatchObject({
      strategy: "cautious_scout",
      suppliesUsed: 0,
      renownGained: 1,
    });
    expect(roadEncounter.result.entry.kind).toBe("road");
    expect(roadEncounter.observation.pendingRoadEncounter).toBeNull();
    expect(roadEncounter.observation.journal[0]?.kind).toBe("road");

    const resupplied = a.resupply_overworld_session({ session_id: started.session_id });
    expect(resupplied.result).toMatchObject({
      action: "resupply",
      changed: true,
      minutes: 45,
      suppliesBefore: roadEncounter.observation.supplies,
      suppliesAfter: traveled.observation.maxSupplies,
      fatigueBefore: roadEncounter.observation.fatigue,
      fatigueAfter: roadEncounter.observation.fatigue,
    });
    expect(resupplied.result.entry?.kind).toBe("service");
    expect(resupplied.observation.supplies).toBe(resupplied.observation.maxSupplies);
    expect(resupplied.observation.journal[0]?.title).toContain("Resupplied");

    const rested = a.rest_overworld_session({ session_id: started.session_id });
    expect(rested.result.action).toBe("rest");
    expect(rested.result.changed).toBe(true);
    expect(rested.result.minutes).toBeGreaterThan(0);
    expect(rested.result.fatigueBefore).toBe(roadEncounter.observation.fatigue);
    expect(rested.result.fatigueAfter).toBe(0);
    expect(rested.result.entry?.kind).toBe("service");
    expect(rested.observation.fatigue).toBe(0);
    expect(rested.observation.travelCondition).toBe("ready");

    expect(() =>
      a.talk_overworld_session_contact({
        session_id: started.session_id,
        character_id: contact.id,
      }),
    ).toThrow(/not in this town/i);
    expect(() =>
      a.travel_overworld_session({
        session_id: started.session_id,
        road_id: "road_buffalo_city__tonawanda_town",
      }),
    ).toThrow(/not reachable/i);
  });

  it("exports and restores stateful New York overworld sessions through MCP", () => {
    const a = api();
    const started = a.start_overworld();
    a.scout_overworld_session_poi({
      session_id: started.session_id,
      poi_id: started.observation.pois[0]!.id,
    });
    const road = a
      .get_overworld_session({ session_id: started.session_id })
      .observation.exits.find((exit) => exit.destination.id === "colonie_town");
    expect(road).toBeDefined();
    a.travel_overworld_session({ session_id: started.session_id, road_id: road!.id });
    const before = a.get_overworld_session({ session_id: started.session_id }).observation;
    expect(before.pendingRoadEncounter).toBeDefined();

    const exported = a.export_overworld_session({ session_id: started.session_id });
    expect(exported.snapshot.worldId).toBe("new_york_overworld");
    expect(exported.snapshot.worldHash).toMatch(/^[0-9a-f]{64}$/);

    const restored = a.restore_overworld_session({ snapshot: exported.snapshot });
    expect(restored.session_id).not.toBe(started.session_id);
    expect(restored.observation).toEqual(before);
    expect(() =>
      a.travel_overworld_session({
        session_id: restored.session_id,
        road_id: restored.observation.exits[0]!.id,
      }),
    ).toThrow(/pending road encounter/i);

    a.resolve_overworld_session_road_encounter({
      session_id: restored.session_id,
      strategy: "press_on",
    });
    expect(
      a.get_overworld_session({ session_id: restored.session_id }).observation.pendingRoadEncounter,
    ).toBeNull();
    expect(
      a.get_overworld_session({ session_id: started.session_id }).observation.pendingRoadEncounter,
    ).not.toBeNull();

    expect(() =>
      a.restore_overworld_session({
        snapshot: { ...exported.snapshot, worldHash: "0".repeat(64) },
      }),
    ).toThrow(/different world manifest/i);
  });

  it("maps local areas through stateful MCP overworld play", () => {
    const a = api();
    const started = a.start_overworld();
    const area = started.observation.areas[0]!;
    const localAreas = overworld.areas
      .filter((candidate) => candidate.home === started.observation.current.id)
      .sort(
        (left, right) =>
          left.travel_minutes - right.travel_minutes || left.name.localeCompare(right.name),
      );

    expect(localAreas.length).toBeGreaterThan(1);
    const explored = a.explore_overworld_session_area({
      session_id: started.session_id,
      area_id: area.id,
    });
    expect(explored.result.entry.kind).toBe("area");
    expect(explored.result.minutes).toBe(area.travel_minutes);
    expect(explored.result.discoveredAreas?.map((candidate) => candidate.id)).toEqual([
      localAreas[1]!.id,
    ]);
    expect(explored.observation.visitedAreaIds).toContain(area.id);
    expect(explored.observation.areas.map((candidate) => candidate.id)).toEqual(
      localAreas.slice(0, 2).map((candidate) => candidate.id),
    );
    expect(explored.observation.hiddenAreaCount).toBe(localAreas.length - 2);

    const repeated = a.explore_overworld_session_area({
      session_id: started.session_id,
      area_id: area.id,
    });
    expect(repeated.result.alreadyKnown).toBe(true);
    expect(repeated.result.discoveredAreas).toEqual([]);
  });

  it("moves through local area routes through stateful MCP overworld play", () => {
    const a = api();
    const started = a.start_overworld();
    const firstArea = started.observation.areas[0]!;
    const explored = a.explore_overworld_session_area({
      session_id: started.session_id,
      area_id: firstArea.id,
    });
    const route = explored.observation.areaExits[0]!;
    const destination = route.destination;

    expect(() =>
      a.explore_overworld_session_area({
        session_id: started.session_id,
        area_id: destination.id,
      }),
    ).toThrow(/Move to that local area/i);

    const moved = a.move_overworld_session_area({
      session_id: started.session_id,
      area_route_id: route.id,
    });
    expect(moved.result).toMatchObject({
      from: firstArea,
      to: destination,
      route: route.route,
      minutes: route.travel_minutes,
    });
    expect(moved.observation.currentArea?.id).toBe(destination.id);
    expect(moved.observation.areaExits.map((exit) => exit.destination.id)).toContain(firstArea.id);

    const exploredDestination = a.explore_overworld_session_area({
      session_id: started.session_id,
      area_id: destination.id,
    });
    expect(exploredDestination.result.entry.kind).toBe("area");
    expect(exploredDestination.result.entry.title).toContain(destination.name);
  });

  it("discovers and works local jobs through stateful MCP overworld play", () => {
    const a = api();
    const started = a.start_overworld();
    const area = started.observation.areas[0]!;
    const hiddenJob = overworld.local_jobs.find(
      (candidate) => candidate.home === started.observation.current.id,
    );
    expect(hiddenJob).toBeDefined();
    expect(started.observation.jobs).toEqual([]);
    expect(() =>
      a.work_overworld_session_job({
        session_id: started.session_id,
        job_id: hiddenJob!.id,
      }),
    ).toThrow(/Explore local areas/i);

    const explored = a.explore_overworld_session_area({
      session_id: started.session_id,
      area_id: area.id,
    });
    expect(explored.result.discoveredJobs).toHaveLength(1);
    const job = explored.observation.jobs[0]!;
    expect(job.home).toBe(started.observation.current.id);
    expect(explored.observation.discoveredJobIds).toContain(job.id);
    expect(explored.observation.hiddenJobCount).toBeGreaterThan(0);

    const worked = a.work_overworld_session_job({
      session_id: started.session_id,
      job_id: job.id,
    });
    expect(worked.result.entry).toMatchObject({
      kind: "job",
      title: `Completed ${job.title}`,
    });
    expect(worked.result.minutes).toBe(job.minutes);
    expect(worked.observation.completedJobIds).toContain(job.id);
    expect(worked.observation.regionRenown[started.observation.current.region]).toBe(
      job.difficulty,
    );
    expect(worked.observation.journal[0]?.kind).toBe("job");

    const repeated = a.work_overworld_session_job({
      session_id: started.session_id,
      job_id: job.id,
    });
    expect(repeated.result.alreadyKnown).toBe(true);
    expect(repeated.result.minutes).toBe(0);
    expect(repeated.result.discoveredJobs).toEqual([]);
  });

  it("adds elapsed travel delay to MCP overworld sessions when condition degrades", () => {
    const a = api();
    const started = a.start_overworld();
    travelOverworldSessionTo(a, started.session_id, "buffalo_city");
    const worn = a.get_overworld_session({ session_id: started.session_id }).observation;
    expect(worn.fatigue).toBeGreaterThanOrEqual(25);

    const nextRoad = worn.exits[0]!;
    const planned = a.plan_overworld_session_route({
      session_id: started.session_id,
      destination_town_id: nextRoad.destination.id,
    });
    expect(planned.route.estimate.delayMinutes).toBeGreaterThan(0);
    expect(planned.route.estimate.elapsedMinutes).toBe(
      planned.route.estimate.baseMinutes + planned.route.estimate.delayMinutes,
    );

    const traveled = a.travel_overworld_session({
      session_id: started.session_id,
      road_id: nextRoad.id,
    });
    expect(traveled.travel.baseMinutes).toBe(nextRoad.travel_minutes);
    expect(traveled.travel.delayMinutes).toBeGreaterThan(0);
    expect(traveled.travel.minutes).toBe(
      traveled.travel.baseMinutes + traveled.travel.delayMinutes,
    );
  });

  it("discovers and explores regional sites through stateful MCP overworld play", () => {
    const a = api();
    const started = a.start_overworld();
    const site = overworld.exploration_sites.find(
      (candidate) => candidate.area === started.observation.currentArea?.id,
    );
    expect(site).toBeDefined();

    expect(() =>
      a.explore_overworld_session_site({
        session_id: started.session_id,
        site_id: site!.id,
      }),
    ).toThrow(/Scout a local point of interest/i);

    const scouted = a.scout_overworld_session_poi({
      session_id: started.session_id,
      poi_id: started.observation.pois[0]!.id,
    });
    expect(scouted.observation.discoveredSiteIds).toContain(site!.id);

    const explored = a.explore_overworld_session_site({
      session_id: started.session_id,
      site_id: site!.id,
    });
    expect(explored.result.minutes).toBe(45 + site!.danger * 15);
    expect(explored.result.entry).toMatchObject({
      kind: "site",
      title: `Explored ${site!.title}`,
    });
    expect(explored.observation.exploredSiteIds).toContain(site!.id);
    expect(explored.observation.regionRenown[started.observation.current.region]).toBe(
      site!.danger,
    );
  });

  it("completes a regional arc through stateful MCP overworld play", () => {
    const a = api();
    const started = a.start_overworld();
    const arc = overworld.regional_arcs.find(
      (candidate) => candidate.region === "Capital / Mohawk",
    );
    expect(arc).toBeDefined();

    for (const townId of arc!.anchor_towns.slice(0, arc!.required_resolutions)) {
      travelOverworldSessionTo(a, started.session_id, townId);
      resolveCurrentOverworldSessionEvent(a, started.session_id);
    }

    const after = a.get_overworld_session({ session_id: started.session_id }).observation;
    expect(after.completedRegionalArcIds).toContain(arc!.id);
    expect(after.regionalArcs.find((candidate) => candidate.id === arc!.id)).toMatchObject({
      completed: true,
      resolvedInRegion: arc!.required_resolutions,
    });
    expect(after.journal[0]).toMatchObject({
      kind: "regional_arc",
      title: `Completed ${arc!.title}`,
    });
  });

  it("validate_pack reports the shipped pack as green", () => {
    const r = api().validate_pack({ pack_path: PACK });
    expect(r.ok).toBe(true);
    expect(r.report.findings.filter((f) => f.severity === "error")).toEqual([]);
  });

  it("validate_story is an AFK-compatible alias", () => {
    const r = api().validate_story({ story_path: PACK });
    expect(r.ok).toBe(true);
  });

  it("validate_quest is the world-first validation alias", () => {
    const r = api().validate_quest({ quest_path: PACK });
    expect(r.ok).toBe(true);
  });

  it("load_pack returns meta + content hash", () => {
    const r = api().load_pack({ pack_path: PACK });
    expect(r.ok).toBe(true);
    expect(r.meta?.id).toBe("watchtower_road_v1");
    expect(r.content_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("adapt_story authors a green CYOA pack from a premise (§12.1–3)", async () => {
    const r = await api().adapt_story({ premise: "A keeper relights a dead lighthouse." });
    expect(r.ok).toBe(true);
    expect(r.report.ok).toBe(true);
    expect(r.pack?.meta.id).toBe("lighthouse_v1");
    expect(r.classifications.length).toBeGreaterThanOrEqual(3);
  });

  it("validate_pack on a broken fixture surfaces an error", () => {
    const r = api().validate_pack({ pack_path: "content/broken-fixtures/softlock.yaml" });
    expect(r.ok).toBe(false);
    expect(r.report.findings.map((f) => f.code)).toContain("SOFTLOCK");
  });
});

describe("MCP tools — the play loop (§9.1)", () => {
  it("AFK aliases can play and transcript a route", () => {
    const a = api();
    const game = a.start_game({ story_path: PACK, seed: 7 });
    expect(game.mode).toBe("cyoa");
    if (game.observation.mode === "cyoa")
      expect(game.observation.scene_id).toBe("forest_crossroads");
    expect(
      a.get_scene({ session_id: game.session_id }).observation.available_actions.length,
    ).toBeGreaterThan(0);

    const route = ["go_west", "ford_brook", "cross_north", "slip_into_woods", "slip_away"];
    let last;
    for (const option_id of route) {
      last = a.choose_option({ session_id: game.session_id, option_id });
      expect(last.ok).toBe(true);
    }
    expect(last!.observation.ending_id).toBe("ending_escape");
    const transcript = a.get_transcript({ session_id: game.session_id });
    expect(transcript.summary.ended).toBe(true);
    expect(transcript.summary.ending_id).toBe("ending_escape");
    expect(transcript.turns.map((t) => t.action_id)).toContain("slip_away");
    expect(a.get_state({ session_id: game.session_id }).state_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("quest aliases can play and transcript a route", () => {
    const a = api();
    const game = a.start_quest({ quest_path: PACK, seed: 7 });
    expect(game.mode).toBe("cyoa");
    if (game.observation.mode === "cyoa")
      expect(game.observation.scene_id).toBe("forest_crossroads");

    const route = ["go_west", "ford_brook", "cross_north", "slip_into_woods", "slip_away"];
    let last;
    for (const action_id of route) {
      last = a.step_action({ session_id: game.session_id, action_id });
      expect(last.ok).toBe(true);
    }
    expect(last!.observation.ending_id).toBe("ending_escape");
    expect(a.get_transcript({ session_id: game.session_id }).summary.ended).toBe(true);
  });

  it("an agent can play a whole game via observe → choose → step", () => {
    const a = api();
    const game = a.new_game({ pack_path: PACK, seed: 5 });
    expect(game.session_id).toBe("sess_1");
    expect(game.observation.available_actions.map((x) => x.id)).toContain("go_west");

    // Drive the shortest escape route turn by turn.
    const route = ["go_west", "ford_brook", "cross_north", "slip_into_woods", "slip_away"];
    let last;
    for (const action_id of route) {
      last = a.step_action({ session_id: game.session_id, action_id });
      expect(last.ok).toBe(true);
    }
    expect(last!.observation.ended).toBe(true);
    expect(last!.observation.ending_id).toBe("ending_escape");
    expect(a.list_legal_actions({ session_id: game.session_id }).actions).toEqual([]);
  });

  it("step_action rejects an illegal action without changing state", () => {
    const a = api();
    const game = a.new_game({ pack_path: PACK });
    const before = a.get_observation({ session_id: game.session_id }).state_hash;
    const r = a.step_action({ session_id: game.session_id, action_id: "not_a_real_choice" });
    expect(r.ok).toBe(false);
    expect(r.rejection_reason).toBeTruthy();
    expect(r.state_hash).toBe(before);
  });

  it("refuses to start a game on an unplayable pack", () => {
    expect(() => api().new_game({ pack_path: "content/broken-fixtures/softlock.yaml" })).toThrow(
      /not playable/i,
    );
  });
});

describe("MCP tools — save / load round-trip (§8.7)", () => {
  it("a saved game reloads to the identical state hash", () => {
    const a = api();
    const game = a.new_game({ pack_path: PACK, seed: 3 });
    a.step_action({ session_id: game.session_id, action_id: "go_east" });
    const after = a.get_observation({ session_id: game.session_id }).state_hash;

    const saved = a.save_game({ session_id: game.session_id });
    const reloaded = a.load_game({ pack_path: PACK, save: saved.save });
    expect(reloaded.state_hash).toBe(after);
  });
});

describe("MCP tools — replay + path confinement", () => {
  beforeAll(() => {
    // Record a trace to disk for replay_trace to read.
    const compiled = loadPackFile(PACK);
    if (!compiled.ok) throw new Error("pack must compile");
    const index = indexPack(compiled.compiled.pack);
    const rules = buildRules(index);
    const actions = ["go_west", "ford_brook", "cross_north", "slip_into_woods", "slip_away"].map(
      (id) => ({ type: "CHOOSE" as const, choiceId: id }),
    );
    const trace = recordTrace(rules, initStateForPack(index, 1), actions, {
      trace_id: "tr_mcp",
      pack_id: compiled.compiled.pack.meta.id,
      content_hash: compiled.compiled.contentHash,
    });
    mkdirSync("traces", { recursive: true });
    writeFileSync("traces/mcp_replay.json", JSON.stringify(trace));
  });

  it("replay_trace reproduces the recorded final hash", () => {
    const r = api().replay_trace({ trace_path: "traces/mcp_replay.json", pack_path: PACK });
    expect(r.ok).toBe(true);
  });

  it("inspect_trace summarizes steps and finds no failure on a winning route (§9.4)", () => {
    const r = api().inspect_trace({ trace_path: "traces/mcp_replay.json", pack_path: PACK }) as {
      ok: boolean;
      hash_ok: boolean;
      steps: number;
      diverged_at_step: number | null;
      diagnosis: { type: string };
      step_summary: { ended: boolean; ending_id: string | null }[];
    };
    expect(r.ok).toBe(true);
    expect(r.hash_ok).toBe(true);
    expect(r.steps).toBe(5);
    // A faithful Trace-v2 trace (mcp_replay.json carries per_step_hashes) has no
    // divergence to localize.
    expect(r.diverged_at_step).toBeNull();
    expect(r.diagnosis.type).toBe("no_failure");
    expect(r.step_summary.at(-1)?.ending_id).toBe("ending_escape");
  });

  it("rejects a path that escapes the project root", () => {
    expect(() => api().validate_pack({ pack_path: "../../../etc/passwd" })).toThrow(
      PathEscapeError,
    );
  });
});

describe("MCP tools — apply_content_patch (§9.4, §16)", () => {
  it("applies a whitelisted hint patch and re-validates green", () => {
    const r = api().apply_content_patch({
      pack_path: "content/parser/pack/sealed_crypt.yaml",
      proposal: {
        layer: "hint_text",
        mode: "parser",
        summary: "signpost the start room",
        ops: [
          {
            op: "add_room_journal_hint",
            room: "forest_path",
            text: "Fresh bootprints lead toward the chapel.",
          },
        ],
      } as never,
    }) as { ok: boolean; report: { ok: boolean } };
    expect(r.ok).toBe(true);
    expect(r.report.ok).toBe(true);
  });

  it("refuses a patch whose target is missing (no file written)", () => {
    const r = api().apply_content_patch({
      pack_path: "content/parser/pack/sealed_crypt.yaml",
      proposal: {
        layer: "content",
        mode: "parser",
        summary: "x",
        ops: [{ op: "set_object_field", id: "ghost", field: "takeable", value: true }],
      } as never,
    }) as { ok: boolean; report: { findings: { code: string }[] } };
    expect(r.ok).toBe(false);
    expect(r.report.findings[0]?.code).toBe("PATCH_TARGET_MISSING");
  });
});
