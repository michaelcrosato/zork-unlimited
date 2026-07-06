import { describe, expect, it } from "vitest";
import { loadOverworldManifest } from "../../src/world/source.js";
import {
  OVERWORLD_COMPACT_COMPLETED_ARC_LIMIT,
  OVERWORLD_COMPACT_LABEL_CHAR_LIMIT,
  OVERWORLD_COMPACT_LOCAL_REF_LIMIT,
  OVERWORLD_COMPACT_MOVEMENT_LIMIT,
  OVERWORLD_COMPACT_RENOWN_LIMIT,
  OVERWORLD_COMPACT_RISK_CHAR_LIMIT,
  OVERWORLD_COMPACT_ROUTE_STEP_LIMIT,
  OVERWORLD_COMPACT_TITLE_CHAR_LIMIT,
  cloneOverworldCompactView,
  compactRouteOption,
  compactOverworldView,
} from "../../src/world/compact_view.js";
import { buildOverworldSessionCompactView } from "../../src/world/session_compact_view.js";
import { OverworldSession } from "../../ui/src/overworld.js";

const world = loadOverworldManifest(process.cwd());

function roadPath(from: string, to: string): string[] {
  const queue: { town: string; roadIds: string[] }[] = [{ town: from, roadIds: [] }];
  const seen = new Set<string>([from]);
  for (let i = 0; i < queue.length; i += 1) {
    const cur = queue[i]!;
    if (cur.town === to) return cur.roadIds;
    for (const edge of world.edges.filter(
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

function travelTo(session: OverworldSession, townId: string): void {
  for (const roadId of roadPath(session.view().current.id, townId)) {
    session.travel(roadId);
    if (session.view().pendingRoadEncounter) session.resolveRoadEncounter("press_on");
  }
}

function resolveCurrentTownEvent(session: OverworldSession): void {
  const view = session.view();
  const event = view.events.find((candidate) => !view.resolvedEventIds.includes(candidate.id));
  if (!event) throw new Error(`No unresolved event in ${view.current.id}.`);
  session.scoutPoi(view.pois[0]!.id);
  session.talkToCharacter(view.characters[0]!.id);
  session.investigateEvent(event.id);
  session.resolveEvent(event.id);
}

describe("OverworldSession", () => {
  it("starts in Albany with roads, local discoveries, and no global quest list", () => {
    const session = new OverworldSession(world);
    const view = session.view();

    expect(view.current.id).toBe("albany_city");
    expect(view.exits.length).toBeGreaterThan(3);
    expect(view.exits.length).toBeLessThan(12);
    expect(view.quests).toEqual([]);
    expect(view.hiddenQuestCount).toBeGreaterThan(0);
    expect(view.hiddenQuestCount).toBeLessThan(world.quests.length);
    expect(view.characters.length).toBeGreaterThan(0);
    expect(view.events.length).toBeGreaterThan(0);
    expect(view.areas).toHaveLength(1);
    expect(view.areas[0]?.home).toBe(view.current.id);
    expect(view.currentArea?.id).toBe(view.areas[0]?.id);
    expect(view.areaExits).toEqual([]);
    expect(view.hiddenAreaCount).toBeGreaterThan(0);
    expect(view.discoveredAreaIds).toEqual(view.areas.map((area) => area.id));
    expect(view.visitedAreaIds).toEqual([]);
    expect(view.pois.every((poi) => poi.area === view.currentArea?.id)).toBe(true);
    expect(view.characters.every((character) => character.area === view.currentArea?.id)).toBe(
      true,
    );
    expect(view.events.every((event) => event.area === view.currentArea?.id)).toBe(true);
    expect(view.sites).toEqual([]);
    expect(view.hiddenSiteCount).toBeGreaterThan(0);
    expect(view.jobs).toEqual([]);
    expect(view.hiddenJobCount).toBeGreaterThan(0);
    expect(view.discoveredJobIds).toEqual([]);
    expect(view.completedJobIds).toEqual([]);
    expect(view.routeOptions.map((route) => route.destination.id)).toContain("colonie_town");
    expect(view.discovered.length).toBeLessThan(world.nodes.length);
    expect(view.supplies).toBe(6);
    expect(view.maxSupplies).toBe(8);
    expect(view.fatigue).toBe(0);
    expect(view.travelCondition).toBe("ready");
    expect(view.pendingRoadEncounter).toBeNull();
    const colonieOption = view.routeOptions.find(
      (route) => route.destination.id === "colonie_town",
    );
    expect(colonieOption).toBeDefined();
    expect(colonieOption?.estimate.baseMinutes).toBe(colonieOption?.totalMinutes);
    expect(colonieOption?.estimate.delayMinutes).toBe(0);
    expect(colonieOption?.estimate.elapsedMinutes).toBe(colonieOption?.totalMinutes);
    expect(colonieOption?.estimate.suppliesNeeded).toBeGreaterThan(0);
    expect(colonieOption?.estimate.fatigueGained).toBeGreaterThan(0);
  });

  it("maps local areas progressively before exhausting a town", () => {
    const session = new OverworldSession(world);
    const start = session.view();
    const localAreas = world.areas
      .filter((area) => area.home === start.current.id)
      .sort((a, b) => a.travel_minutes - b.travel_minutes || a.name.localeCompare(b.name));
    const firstArea = start.areas[0]!;

    expect(localAreas.length).toBeGreaterThan(1);
    expect(start.areas.map((area) => area.id)).toEqual([localAreas[0]!.id]);

    const explored = session.exploreArea(firstArea.id);
    expect(explored.minutes).toBe(firstArea.travel_minutes);
    expect(explored.entry.kind).toBe("area");
    expect(explored.discoveredAreas?.map((area) => area.id)).toEqual([localAreas[1]!.id]);
    expect(explored.discoveredJobs).toHaveLength(1);
    expect(explored.discoveredSites).toHaveLength(1);
    expect(explored.discoveredQuests).toEqual([]);

    const after = session.view();
    expect(after.visitedAreaIds).toContain(firstArea.id);
    expect(after.areas.map((area) => area.id)).toEqual(
      localAreas.slice(0, 2).map((area) => area.id),
    );
    expect(after.currentArea?.id).toBe(firstArea.id);
    expect(after.areaExits.map((exit) => exit.destination.id)).toEqual([localAreas[1]!.id]);
    expect(after.hiddenAreaCount).toBe(localAreas.length - 2);
    expect(after.journal[0]?.title).toContain(firstArea.name);

    const repeated = session.exploreArea(firstArea.id);
    expect(repeated.alreadyKnown).toBe(true);
    expect(repeated.minutes).toBe(0);
    expect(repeated.discoveredAreas).toEqual([]);
    expect(repeated.discoveredJobs).toEqual([]);
    expect(repeated.discoveredSites).toEqual([]);
    expect(repeated.discoveredQuests).toEqual([]);
  });

  it("moves through discovered local area routes inside a town", () => {
    const session = new OverworldSession(world);
    const start = session.view();
    const firstArea = start.areas[0]!;
    session.exploreArea(firstArea.id);
    const mapped = session.view();
    const route = mapped.areaExits[0]!;
    const destination = route.destination;

    expect(() => session.exploreArea(destination.id)).toThrow(/Move to that local area/i);
    const moved = session.moveArea(route.id);
    expect(moved).toMatchObject({
      from: firstArea,
      to: destination,
      route: route.route,
      minutes: route.travel_minutes,
    });

    const after = session.view();
    expect(after.currentArea?.id).toBe(destination.id);
    expect(after.areaExits.map((exit) => exit.destination.id)).toContain(firstArea.id);
    expect(after.timeLabel).not.toBe(mapped.timeLabel);

    const explored = session.exploreArea(destination.id);
    expect(explored.entry.kind).toBe("area");
    expect(explored.entry.title).toContain(destination.name);
  });

  it("reveals and completes local jobs tied to mapped areas", () => {
    const session = new OverworldSession(world);
    const start = session.view();
    const hiddenJob = world.local_jobs.find((job) => job.home === start.current.id);
    expect(hiddenJob).toBeDefined();
    expect(() => session.workLocalJob(hiddenJob!.id)).toThrow(/Explore local areas/i);

    const explored = session.exploreArea(start.areas[0]!.id);
    expect(explored.discoveredJobs).toHaveLength(1);
    const job = session.view().jobs[0]!;
    expect(job.area).toBe(start.areas[0]!.id);
    expect(session.view().discoveredJobIds).toContain(job.id);

    const worked = session.workLocalJob(job.id);
    expect(worked.minutes).toBe(job.minutes);
    expect(worked.entry).toMatchObject({
      kind: "job",
      title: `Completed ${job.title}`,
    });

    const after = session.view();
    expect(after.completedJobIds).toContain(job.id);
    expect(after.regionRenown[start.current.region]).toBe(job.difficulty);
    expect(after.journal[0]?.kind).toBe("job");

    const repeated = session.workLocalJob(job.id);
    expect(repeated.alreadyKnown).toBe(true);
    expect(repeated.minutes).toBe(0);
    expect(repeated.discoveredJobs).toEqual([]);
  });

  it("advances location, clock, supplies, and fatigue by the selected road travel time", () => {
    const session = new OverworldSession(world);
    const before = session.view();
    const road = before.exits.find((exit) => exit.destination.id === "colonie_town");
    expect(road).toBeDefined();

    const entry = session.travel(road!.id);
    const after = session.view();
    expect(after.current.id).toBe("colonie_town");
    expect(entry.baseMinutes).toBe(road!.travel_minutes);
    expect(entry.delayMinutes).toBe(0);
    expect(entry.minutes).toBe(road!.travel_minutes);
    expect(entry.roadEvent?.edge).toBe(road!.id);
    expect(entry.suppliesUsed).toBeGreaterThan(0);
    expect(entry.suppliesAfter).toBeLessThan(before.supplies);
    expect(entry.fatigueGained).toBeGreaterThan(0);
    expect(entry.fatigueAfter).toBeGreaterThan(before.fatigue);
    expect(after.log[0]).toMatchObject({
      edgeId: road!.id,
      fromId: "albany_city",
      toId: "colonie_town",
      from: "Albany city",
      to: "Colonie town",
      baseMinutes: road!.travel_minutes,
      delayMinutes: 0,
      minutes: entry.minutes,
      suppliesUsed: entry.suppliesUsed,
      suppliesAfter: entry.suppliesAfter,
      fatigueGained: entry.fatigueGained,
      fatigueAfter: entry.fatigueAfter,
    });
    expect(after.supplies).toBe(entry.suppliesAfter);
    expect(after.fatigue).toBe(entry.fatigueAfter);
    expect(after.pendingRoadEncounter).toMatchObject({
      edgeId: road!.id,
      from: "Albany city",
      to: "Colonie town",
    });
    expect(after.pendingRoadEncounter?.options.map((option) => option.strategy)).toEqual([
      "cautious_scout",
      "assist_travelers",
      "press_on",
    ]);
    expect(session.compactView()).toEqual(compactOverworldView(after));
    expect(() => session.planRoute("albany_city")).toThrow(/pending road encounter/i);
    session.resolveRoadEncounter("press_on");
    const backRoute = session.planRoute("albany_city");
    expect(backRoute.totalMinutes).toBe(road!.travel_minutes);
    expect(backRoute.steps.map((step) => step.to.id)).toEqual(["albany_city"]);
    expect(backRoute.estimate.baseMinutes).toBe(backRoute.totalMinutes);
    expect(backRoute.estimate.suppliesUsed).toBe(backRoute.estimate.suppliesNeeded);
    expect(backRoute.estimate.supplyDeficit).toBe(0);
    expect(after.timeLabel).not.toBe(before.timeLabel);
  });

  it("requires and resolves road encounter choices before the next road leg", () => {
    const session = new OverworldSession(world);
    const road = session.view().exits.find((exit) => exit.destination.id === "colonie_town");
    expect(road).toBeDefined();
    session.travel(road!.id);
    const arrived = session.view();
    const encounter = arrived.pendingRoadEncounter;
    expect(encounter?.event.edge).toBe(road!.id);
    expect(() => session.travel(arrived.exits[0]!.id)).toThrow(/pending road encounter/i);

    const option = encounter!.options.find(
      (candidate) => candidate.strategy === "assist_travelers",
    );
    expect(option).toBeDefined();
    const resolved = session.resolveRoadEncounter("assist_travelers");
    expect(resolved).toMatchObject({
      strategy: "assist_travelers",
      minutes: option!.minutes,
      suppliesUsed: option!.suppliesCost,
      fatigueGained: option!.fatigueGained,
      renownGained: option!.renownGained,
    });
    const after = session.view();
    expect(after.pendingRoadEncounter).toBeNull();
    expect(after.journal[0]).toMatchObject({
      kind: "road",
      title: `${option!.label}: ${encounter!.event.title}`,
    });
    expect(session.compactView()).toEqual(compactOverworldView(after));
    expect(after.regionRenown[arrived.current.region]).toBe(option!.renownGained);
    expect(() => session.travel(after.exits[0]!.id)).not.toThrow();
  });

  it("round-trips stateful sessions through content-bound snapshots", () => {
    const session = new OverworldSession(world);
    const start = session.view();
    const road = start.exits.find((exit) => exit.destination.id === "colonie_town");
    expect(road).toBeDefined();

    session.scoutPoi(start.pois[0]!.id);
    session.exploreArea(start.areas[0]!.id);
    session.travel(road!.id);
    const before = session.view();
    expect(before.pendingRoadEncounter).toBeDefined();

    const snapshot = JSON.parse(JSON.stringify(session.snapshot())) as ReturnType<
      typeof session.snapshot
    >;
    expect(snapshot.pendingRoadEncounter).toEqual({ edgeId: road!.id });
    expect(snapshot.pendingRoadEncounter).not.toHaveProperty("event");
    expect(snapshot.pendingRoadEncounter).not.toHaveProperty("options");
    expect(JSON.stringify(snapshot.pendingRoadEncounter).length).toBeLessThan(
      JSON.stringify(before.pendingRoadEncounter).length / 4,
    );
    expect(snapshot.travelLog[0]).toMatchObject({
      edgeId: road!.id,
      fromId: start.current.id,
      toId: road!.destination.id,
      minutes: before.log[0]!.minutes,
      arrivedAt: before.log[0]!.arrivedAt,
    });
    expect(snapshot.travelLog[0]).not.toHaveProperty("roadEvent");
    expect(snapshot.travelLog[0]).not.toHaveProperty("from");
    expect(snapshot.travelLog[0]).not.toHaveProperty("to");
    expect(snapshot.travelLog[0]).not.toHaveProperty("route");
    expect(snapshot.travelLog[0]).not.toHaveProperty("distanceMi");
    expect(snapshot.travelLog[0]).not.toHaveProperty("baseMinutes");
    expect(JSON.stringify(snapshot.travelLog[0]).length).toBeLessThan(
      JSON.stringify(before.log[0]).length / 2,
    );
    const restored = OverworldSession.restore(world, snapshot);
    expect(restored.view()).toEqual(before);
    expect(() => restored.travel(restored.view().exits[0]!.id)).toThrow(/pending road encounter/i);

    restored.resolveRoadEncounter("press_on");
    expect(restored.view().pendingRoadEncounter).toBeNull();
    expect(restored.view().journal[0]?.kind).toBe("road");

    const staleWorldSnapshot = {
      ...session.snapshot(),
      worldHash: "0".repeat(64),
    };
    expect(() => OverworldSession.restore(world, staleWorldSnapshot)).toThrow(
      /different world manifest/i,
    );

    const corruptSnapshot = {
      ...session.snapshot(),
      currentId: "missing_town",
    };
    expect(() => OverworldSession.restore(world, corruptSnapshot)).toThrow(/unknown current town/i);

    const validSnapshot = session.snapshot();
    const duplicateAreaMapSnapshot = {
      ...validSnapshot,
      currentAreaByTown: [validSnapshot.currentAreaByTown[0]!, validSnapshot.currentAreaByTown[0]!],
    };
    expect(() => OverworldSession.restore(world, duplicateAreaMapSnapshot)).toThrow(
      /duplicate area-map town/i,
    );

    const duplicateRenownSnapshot = {
      ...validSnapshot,
      regionRenown: [
        [start.current.region, 1],
        [start.current.region, 2],
      ],
    };
    expect(() => OverworldSession.restore(world, duplicateRenownSnapshot)).toThrow(
      /duplicate renown region/i,
    );

    const undiscoveredCurrentAreaSnapshot = {
      ...validSnapshot,
      discoveredAreaIds: validSnapshot.discoveredAreaIds.filter(
        (id) => id !== validSnapshot.currentAreaId,
      ),
    };
    expect(() => OverworldSession.restore(world, undiscoveredCurrentAreaSnapshot)).toThrow(
      /current area is not discovered/i,
    );

    const tamperedPendingRoadSnapshot = JSON.parse(JSON.stringify(validSnapshot)) as ReturnType<
      typeof session.snapshot
    >;
    expect(tamperedPendingRoadSnapshot.pendingRoadEncounter).toBeDefined();
    tamperedPendingRoadSnapshot.pendingRoadEncounter!.edgeId = "missing_road";
    expect(() => OverworldSession.restore(world, tamperedPendingRoadSnapshot)).toThrow(
      /unknown pending road/i,
    );

    const tamperedTravelLogSnapshot = JSON.parse(JSON.stringify(validSnapshot)) as ReturnType<
      typeof session.snapshot
    >;
    tamperedTravelLogSnapshot.travelLog[0]!.edgeId = "missing_road";
    expect(() => OverworldSession.restore(world, tamperedTravelLogSnapshot)).toThrow(
      /unknown travel road/i,
    );
  });

  it("caps compact context id lists while keeping counts and truncation flags", () => {
    const session = new OverworldSession(world);
    for (let i = 0; i < 120 && session.view().discovered.length <= 24; i += 1) {
      let view = session.view();
      if (view.pendingRoadEncounter) session.resolveRoadEncounter("press_on");
      view = session.view();
      const next =
        view.exits.find(
          (exit) => !view.discovered.some((town) => town.id === exit.destination.id),
        ) ?? view.exits[i % view.exits.length];
      if (!next) break;
      session.travel(next.id);
    }
    if (session.view().pendingRoadEncounter) session.resolveRoadEncounter("press_on");

    const view = session.view();
    expect(view.discovered.length).toBeGreaterThan(24);
    const compact = compactOverworldView(view);
    expect(session.compactView()).toEqual(compact);
    expect(compact.v).toBe(10);
    expect(compact.hidden).toEqual([
      view.hiddenAreaCount,
      view.hiddenJobCount,
      view.hiddenSiteCount,
      view.hiddenQuestCount,
    ]);
    expect(compact.progress).toEqual([view.visitedCount, view.totalTowns]);
    expect(compact.ids.discovered_towns).toHaveLength(16);
    expect(compact.id_counts).toHaveLength(11);
    expect(compact.id_counts[0]).toBe(view.discovered.length);
    expect(compact.ids_truncated).toContain("discovered_towns");
    expect(compact.id_counts[8]).toBe(view.startedQuestIds.length);
    expect(compact.id_counts[9]).toBe(view.completedQuestIds.length);
    expect(compact.id_counts[10]).toBe(view.resolvedEventIds.length);
    expect(compact.ids_truncated).not.toContain("resolved_events");
    if (view.resolvedEventIds.length === 0) {
      expect("resolved_events" in compact.ids).toBe(false);
    }
  });

  it("caps compact context progress lists while marking truncated renown and completed arcs", () => {
    const session = new OverworldSession(world);
    const view = session.view();
    const denseCount =
      Math.max(OVERWORLD_COMPACT_RENOWN_LIMIT, OVERWORLD_COMPACT_COMPLETED_ARC_LIMIT) + 3;
    const denseRenown: Record<string, number> = Object.fromEntries(
      Array.from({ length: denseCount }, (_, index) => [
        `Dense Region ${String(index).padStart(2, "0")}`,
        index,
      ]),
    );
    const denseCompletedArcs = Array.from(
      { length: denseCount },
      (_, index) => `dense_arc_${String(index).padStart(2, "0")}`,
    );

    const compact = compactOverworldView({
      ...view,
      regionRenown: denseRenown,
      completedRegionalArcIds: denseCompletedArcs,
    });
    if (!compact.renown || !compact.completed_arcs) {
      throw new Error("expected compact progress lists");
    }
    expect(compact.renown).toHaveLength(OVERWORLD_COMPACT_RENOWN_LIMIT);
    expect(compact.completed_arcs).toHaveLength(OVERWORLD_COMPACT_COMPLETED_ARC_LIMIT);
    expect(compact.renown_truncated).toBe(true);
    expect(compact.completed_arcs_truncated).toBe(true);
    expect(compact.renown[0]).toEqual(["Dense Region 00", 0]);
    expect(compact.completed_arcs).toEqual(
      denseCompletedArcs.slice(0, OVERWORLD_COMPACT_COMPLETED_ARC_LIMIT),
    );

    const built = buildOverworldSessionCompactView({
      worldName: view.world,
      worldTownCount: view.totalTowns,
      current: view.current,
      currentArea: view.currentArea,
      minutes: 0,
      supplies: view.supplies,
      fatigue: view.fatigue,
      roads: view.exits,
      areaExits: view.areaExits,
      routeOptions: view.routeOptions,
      areas: view.areas,
      poi: view.pois,
      contacts: view.characters,
      events: view.events,
      jobs: view.jobs,
      sites: view.sites,
      quests: view.quests,
      hiddenAreaCount: view.hiddenAreaCount,
      hiddenJobCount: view.hiddenJobCount,
      hiddenSiteCount: view.hiddenSiteCount,
      hiddenQuestCount: view.hiddenQuestCount,
      journalEntries: view.journal,
      travelLog: view.log,
      visitedCount: view.visitedCount,
      regionRenown: new Map(Object.entries(denseRenown)),
      completedRegionalArcIds: new Set(denseCompletedArcs),
      pendingRoadEncounter: view.pendingRoadEncounter,
      ids: {
        discoveredIds: new Set(view.discovered.map((town) => town.id)),
        nodes: new Map(world.nodes.map((town) => [town.id, town])),
        discoveredAreaIds: new Set(view.discoveredAreaIds),
        visitedAreaIds: new Set(view.visitedAreaIds),
        discoveredJobIds: new Set(view.discoveredJobIds),
        completedJobIds: new Set(view.completedJobIds),
        discoveredSiteIds: new Set(view.discoveredSiteIds),
        exploredSiteIds: new Set(view.exploredSiteIds),
        discoveredQuestIds: new Set(view.discoveredQuestIds),
        startedQuestIds: new Set(view.startedQuestIds),
        completedQuestIds: new Set(view.completedQuestIds),
        resolvedEventIds: new Set(view.resolvedEventIds),
      },
    });
    expect(built.renown).toEqual(compact.renown);
    expect(built.completed_arcs).toEqual(compact.completed_arcs);
    expect(built.renown_truncated).toBe(true);
    expect(built.completed_arcs_truncated).toBe(true);

    const cloned = cloneOverworldCompactView(compact);
    if (!cloned.renown || !cloned.completed_arcs) {
      throw new Error("expected cloned compact progress lists");
    }
    expect(cloned.renown_truncated).toBe(true);
    expect(cloned.completed_arcs_truncated).toBe(true);
    cloned.renown.push(["mutated_by_test", 1]);
    cloned.completed_arcs.push("mutated_by_test");
    expect(compact.renown).toHaveLength(OVERWORLD_COMPACT_RENOWN_LIMIT);
    expect(compact.completed_arcs).toHaveLength(OVERWORLD_COMPACT_COMPLETED_ARC_LIMIT);
  });

  it("caps compact context movement lists while marking truncated roads and area routes", () => {
    const session = new OverworldSession(world);
    const view = session.view();
    expect(view.exits[0]).toBeDefined();
    expect(view.areas[0]).toBeDefined();

    const denseCount = OVERWORLD_COMPACT_MOVEMENT_LIMIT + 4;
    const denseRoads = Array.from({ length: denseCount }, (_, index) => ({
      ...view.exits[0]!,
      id: `dense_road_${index}`,
      destination: {
        ...view.exits[0]!.destination,
        id: `dense_town_${index}`,
      },
    }));
    const denseAreaRoutes = Array.from({ length: denseCount }, (_, index) => ({
      id: `dense_area_route_${index}`,
      home: view.current.id,
      from_area: view.currentArea?.id ?? view.areas[0]!.id,
      to_area: `dense_area_${index}`,
      route: `Dense lane ${index}`,
      travel_minutes: index + 1,
      destination: {
        ...view.areas[0]!,
        id: `dense_area_${index}`,
      },
    }));

    const compact = compactOverworldView({
      ...view,
      exits: denseRoads,
      areaExits: denseAreaRoutes,
    });
    expect(compact.roads).toHaveLength(OVERWORLD_COMPACT_MOVEMENT_LIMIT);
    expect(compact.area_routes).toHaveLength(OVERWORLD_COMPACT_MOVEMENT_LIMIT);
    expect(compact.roads_truncated).toBe(true);
    expect(compact.area_routes_truncated).toBe(true);

    const built = buildOverworldSessionCompactView({
      worldName: view.world,
      worldTownCount: view.totalTowns,
      current: view.current,
      currentArea: view.currentArea,
      minutes: 0,
      supplies: view.supplies,
      fatigue: view.fatigue,
      roads: denseRoads,
      areaExits: denseAreaRoutes,
      routeOptions: view.routeOptions,
      areas: view.areas,
      poi: view.pois,
      contacts: view.characters,
      events: view.events,
      jobs: view.jobs,
      sites: view.sites,
      quests: view.quests,
      hiddenAreaCount: view.hiddenAreaCount,
      hiddenJobCount: view.hiddenJobCount,
      hiddenSiteCount: view.hiddenSiteCount,
      hiddenQuestCount: view.hiddenQuestCount,
      journalEntries: view.journal,
      travelLog: view.log,
      visitedCount: view.visitedCount,
      regionRenown: new Map(Object.entries(view.regionRenown)),
      completedRegionalArcIds: new Set(view.completedRegionalArcIds),
      pendingRoadEncounter: view.pendingRoadEncounter,
      ids: {
        discoveredIds: new Set(view.discovered.map((town) => town.id)),
        nodes: new Map(world.nodes.map((town) => [town.id, town])),
        discoveredAreaIds: new Set(view.discoveredAreaIds),
        visitedAreaIds: new Set(view.visitedAreaIds),
        discoveredJobIds: new Set(view.discoveredJobIds),
        completedJobIds: new Set(view.completedJobIds),
        discoveredSiteIds: new Set(view.discoveredSiteIds),
        exploredSiteIds: new Set(view.exploredSiteIds),
        discoveredQuestIds: new Set(view.discoveredQuestIds),
        startedQuestIds: new Set(view.startedQuestIds),
        completedQuestIds: new Set(view.completedQuestIds),
        resolvedEventIds: new Set(view.resolvedEventIds),
      },
    });
    expect(built.roads).toHaveLength(OVERWORLD_COMPACT_MOVEMENT_LIMIT);
    expect(built.area_routes).toHaveLength(OVERWORLD_COMPACT_MOVEMENT_LIMIT);
    expect(built.roads_truncated).toBe(true);
    expect(built.area_routes_truncated).toBe(true);

    const cloned = cloneOverworldCompactView(compact);
    expect(cloned.roads_truncated).toBe(true);
    expect(cloned.area_routes_truncated).toBe(true);
    cloned.roads.push(["mutated_by_test", 1, 0, 0]);
    cloned.area_routes?.push(["mutated_by_test", "mutated", 1]);
    expect(compact.roads).toHaveLength(OVERWORLD_COMPACT_MOVEMENT_LIMIT);
    expect(compact.area_routes).toHaveLength(OVERWORLD_COMPACT_MOVEMENT_LIMIT);
  });

  it("caps compact context route path summaries while preserving explicit compact plans", () => {
    const session = new OverworldSession(world);
    const view = session.view();
    const plan = session.planRoute("colonie_town");
    expect(plan.steps[0]).toBeDefined();

    const denseStepCount = OVERWORLD_COMPACT_ROUTE_STEP_LIMIT + 4;
    const densePlan: typeof plan = {
      ...plan,
      steps: Array.from({ length: denseStepCount }, (_, index) => ({
        ...plan.steps[0]!,
        edge: {
          ...plan.steps[0]!.edge,
          id: `dense_road_${index}`,
        },
      })),
    };

    const explicit = compactRouteOption(densePlan);
    expect(explicit[4]).toHaveLength(denseStepCount);

    const compact = compactOverworldView({
      ...view,
      routeOptions: [densePlan],
    });
    expect(compact.route_options[0]?.[4]).toHaveLength(OVERWORLD_COMPACT_ROUTE_STEP_LIMIT);
    expect(compact.route_paths_truncated).toBe(true);

    const built = buildOverworldSessionCompactView({
      worldName: view.world,
      worldTownCount: view.totalTowns,
      current: view.current,
      currentArea: view.currentArea,
      minutes: 0,
      supplies: view.supplies,
      fatigue: view.fatigue,
      roads: view.exits,
      areaExits: view.areaExits,
      routeOptions: [densePlan],
      areas: view.areas,
      poi: view.pois,
      contacts: view.characters,
      events: view.events,
      jobs: view.jobs,
      sites: view.sites,
      quests: view.quests,
      hiddenAreaCount: view.hiddenAreaCount,
      hiddenJobCount: view.hiddenJobCount,
      hiddenSiteCount: view.hiddenSiteCount,
      hiddenQuestCount: view.hiddenQuestCount,
      journalEntries: view.journal,
      travelLog: view.log,
      visitedCount: view.visitedCount,
      regionRenown: new Map(Object.entries(view.regionRenown)),
      completedRegionalArcIds: new Set(view.completedRegionalArcIds),
      pendingRoadEncounter: view.pendingRoadEncounter,
      ids: {
        discoveredIds: new Set(view.discovered.map((town) => town.id)),
        nodes: new Map(world.nodes.map((town) => [town.id, town])),
        discoveredAreaIds: new Set(view.discoveredAreaIds),
        visitedAreaIds: new Set(view.visitedAreaIds),
        discoveredJobIds: new Set(view.discoveredJobIds),
        completedJobIds: new Set(view.completedJobIds),
        discoveredSiteIds: new Set(view.discoveredSiteIds),
        exploredSiteIds: new Set(view.exploredSiteIds),
        discoveredQuestIds: new Set(view.discoveredQuestIds),
        startedQuestIds: new Set(view.startedQuestIds),
        completedQuestIds: new Set(view.completedQuestIds),
        resolvedEventIds: new Set(view.resolvedEventIds),
      },
    });
    expect(built.route_options[0]?.[4]).toHaveLength(OVERWORLD_COMPACT_ROUTE_STEP_LIMIT);
    expect(built.route_paths_truncated).toBe(true);

    const cloned = cloneOverworldCompactView(compact);
    expect(cloned.route_paths_truncated).toBe(true);
    (cloned.route_options[0]?.[4] as string[] | undefined)?.push("mutated_by_test");
    expect(compact.route_options[0]?.[4]).toHaveLength(OVERWORLD_COMPACT_ROUTE_STEP_LIMIT);
  });

  it("caps compact context local refs while marking truncated buckets", () => {
    const session = new OverworldSession(world);
    const view = session.view();
    expect(view.areas[0]).toBeDefined();
    expect(view.pois[0]).toBeDefined();
    expect(view.characters[0]).toBeDefined();
    expect(view.events[0]).toBeDefined();

    const denseCount = OVERWORLD_COMPACT_LOCAL_REF_LIMIT + 3;
    const denseNames = Array.from({ length: denseCount }, (_, index) => ({
      id: `dense_name_${index}`,
      name: `Dense Name ${index}`,
    }));
    const denseTitles = Array.from({ length: denseCount }, (_, index) => ({
      id: `dense_title_${index}`,
      title: `Dense Title ${index}`,
    }));
    const compact = compactOverworldView({
      ...view,
      areas: denseNames.map((value) => ({ ...view.areas[0]!, ...value })),
      pois: denseTitles.map((value) => ({ ...view.pois[0]!, ...value })),
      characters: denseNames.map((value) => ({ ...view.characters[0]!, ...value })),
      events: denseTitles.map((value) => ({ ...view.events[0]!, ...value })),
      jobs: denseTitles as typeof view.jobs,
      sites: denseTitles as typeof view.sites,
      quests: denseTitles as typeof view.quests,
    });

    expect(compact.areas).toHaveLength(OVERWORLD_COMPACT_LOCAL_REF_LIMIT);
    expect(compact.poi).toHaveLength(OVERWORLD_COMPACT_LOCAL_REF_LIMIT);
    expect(compact.contacts).toHaveLength(OVERWORLD_COMPACT_LOCAL_REF_LIMIT);
    expect(compact.events).toHaveLength(OVERWORLD_COMPACT_LOCAL_REF_LIMIT);
    expect(compact.jobs).toHaveLength(OVERWORLD_COMPACT_LOCAL_REF_LIMIT);
    expect(compact.sites).toHaveLength(OVERWORLD_COMPACT_LOCAL_REF_LIMIT);
    expect(compact.quests).toHaveLength(OVERWORLD_COMPACT_LOCAL_REF_LIMIT);
    expect(compact.local_refs_truncated).toEqual([
      "areas",
      "poi",
      "contacts",
      "events",
      "jobs",
      "sites",
      "quests",
    ]);

    const built = buildOverworldSessionCompactView({
      worldName: view.world,
      worldTownCount: view.totalTowns,
      current: view.current,
      currentArea: view.currentArea,
      minutes: 0,
      supplies: view.supplies,
      fatigue: view.fatigue,
      roads: view.exits,
      areaExits: view.areaExits,
      routeOptions: view.routeOptions,
      areas: denseNames.map((value) => ({ ...view.areas[0]!, ...value })),
      poi: denseTitles.map((value) => ({ ...view.pois[0]!, ...value })),
      contacts: denseNames.map((value) => ({ ...view.characters[0]!, ...value })),
      events: denseTitles.map((value) => ({ ...view.events[0]!, ...value })),
      jobs: denseTitles as typeof view.jobs,
      sites: denseTitles as typeof view.sites,
      quests: denseTitles as typeof view.quests,
      hiddenAreaCount: view.hiddenAreaCount,
      hiddenJobCount: view.hiddenJobCount,
      hiddenSiteCount: view.hiddenSiteCount,
      hiddenQuestCount: view.hiddenQuestCount,
      journalEntries: view.journal,
      travelLog: view.log,
      visitedCount: view.visitedCount,
      regionRenown: new Map(Object.entries(view.regionRenown)),
      completedRegionalArcIds: new Set(view.completedRegionalArcIds),
      pendingRoadEncounter: view.pendingRoadEncounter,
      ids: {
        discoveredIds: new Set(view.discovered.map((town) => town.id)),
        nodes: new Map(world.nodes.map((town) => [town.id, town])),
        discoveredAreaIds: new Set(view.discoveredAreaIds),
        visitedAreaIds: new Set(view.visitedAreaIds),
        discoveredJobIds: new Set(view.discoveredJobIds),
        completedJobIds: new Set(view.completedJobIds),
        discoveredSiteIds: new Set(view.discoveredSiteIds),
        exploredSiteIds: new Set(view.exploredSiteIds),
        discoveredQuestIds: new Set(view.discoveredQuestIds),
        startedQuestIds: new Set(view.startedQuestIds),
        completedQuestIds: new Set(view.completedQuestIds),
        resolvedEventIds: new Set(view.resolvedEventIds),
      },
    });
    expect(built.local_refs_truncated).toEqual(compact.local_refs_truncated);
    expect(built.areas).toHaveLength(OVERWORLD_COMPACT_LOCAL_REF_LIMIT);
    expect(built.jobs).toHaveLength(OVERWORLD_COMPACT_LOCAL_REF_LIMIT);

    const cloned = cloneOverworldCompactView(compact);
    expect(cloned.local_refs_truncated).toEqual(compact.local_refs_truncated);
    cloned.local_refs_truncated?.push("areas");
    expect(compact.local_refs_truncated).toEqual([
      "areas",
      "poi",
      "contacts",
      "events",
      "jobs",
      "sites",
      "quests",
    ]);
  });

  it("caps compact context labels, titles, and risk text", () => {
    const session = new OverworldSession(world);
    const road = session.view().exits.find((exit) => exit.destination.id === "colonie_town");
    expect(road).toBeDefined();
    session.travel(road!.id);

    const view = session.view();
    expect(view.pendingRoadEncounter).toBeDefined();
    expect(view.currentArea).toBeDefined();
    expect(view.areas[0]).toBeDefined();
    expect(view.pois[0]).toBeDefined();
    expect(view.characters[0]).toBeDefined();
    expect(view.events[0]).toBeDefined();
    const longLabel = "label ".repeat(40);
    const longTitle = "title ".repeat(60);
    const longRisk = "risk ".repeat(70);

    const pendingRoadEncounter = view.pendingRoadEncounter!;
    const compact = compactOverworldView({
      ...view,
      world: longLabel,
      current: { ...view.current, name: longLabel, region: longLabel },
      currentArea: view.currentArea ? { ...view.currentArea, name: longLabel } : null,
      areas: view.areas.map((area, index) => (index === 0 ? { ...area, name: longLabel } : area)),
      pois: view.pois.map((poi, index) => (index === 0 ? { ...poi, title: longTitle } : poi)),
      characters: view.characters.map((character, index) =>
        index === 0 ? { ...character, name: longLabel } : character,
      ),
      events: view.events.map((event, index) =>
        index === 0 ? { ...event, title: longTitle } : event,
      ),
      journal: [
        {
          id: "synthetic_long_title",
          kind: "event",
          town: view.current.id,
          title: longTitle,
          text: "Synthetic compact-title boundary row.",
          recordedAt: view.timeLabel,
        },
        ...view.journal,
      ],
      pendingRoadEncounter: {
        ...pendingRoadEncounter,
        event: {
          ...pendingRoadEncounter.event,
          risk: longRisk as typeof pendingRoadEncounter.event.risk,
        },
      },
      regionRenown: { [longLabel]: 7 },
    });

    expect(compact.world).toHaveLength(OVERWORLD_COMPACT_LABEL_CHAR_LIMIT);
    expect(compact.here[1]).toHaveLength(OVERWORLD_COMPACT_LABEL_CHAR_LIMIT);
    expect(compact.here[2]).toHaveLength(OVERWORLD_COMPACT_LABEL_CHAR_LIMIT);
    expect(compact.here[4]).toHaveLength(OVERWORLD_COMPACT_LABEL_CHAR_LIMIT);
    expect(compact.areas[0]?.[1]).toHaveLength(OVERWORLD_COMPACT_LABEL_CHAR_LIMIT);
    expect(compact.contacts[0]?.[1]).toHaveLength(OVERWORLD_COMPACT_LABEL_CHAR_LIMIT);
    expect(compact.poi[0]?.[1]).toHaveLength(OVERWORLD_COMPACT_TITLE_CHAR_LIMIT);
    expect(compact.events[0]?.[1]).toHaveLength(OVERWORLD_COMPACT_TITLE_CHAR_LIMIT);
    expect(compact.journal?.[0]?.[1]).toHaveLength(OVERWORLD_COMPACT_TITLE_CHAR_LIMIT);
    expect(compact.pending_road?.event[1]).toHaveLength(OVERWORLD_COMPACT_RISK_CHAR_LIMIT);
    expect(compact.renown?.[0]?.[0]).toHaveLength(OVERWORLD_COMPACT_LABEL_CHAR_LIMIT);
    expect(compact.world).toMatch(/\.\.\.\(\+\d+ chars\)$/);
  });

  it("adds deterministic travel delay when fatigue or supply shortage catches up", () => {
    const session = new OverworldSession(world);
    travelTo(session, "buffalo_city");
    const worn = session.view();
    expect(worn.fatigue).toBeGreaterThanOrEqual(25);

    const nextRoad = worn.exits[0]!;
    const planned = session.planRoute(nextRoad.destination.id);
    expect(planned.estimate.delayMinutes).toBeGreaterThan(0);
    expect(planned.estimate.elapsedMinutes).toBe(
      planned.estimate.baseMinutes + planned.estimate.delayMinutes,
    );
    expect(planned.estimate.travelConditionAfter).not.toBe("ready");

    const entry = session.travel(nextRoad.id);
    expect(entry.baseMinutes).toBe(nextRoad.travel_minutes);
    expect(entry.delayMinutes).toBeGreaterThan(0);
    expect(entry.minutes).toBe(entry.baseMinutes + entry.delayMinutes);
    expect(entry.arrivedAt).toBeGreaterThan(worn.log[0]!.arrivedAt);
  });

  it("uses town services to resupply and rest after travel", () => {
    const session = new OverworldSession(world);
    const road = session.view().exits.find((exit) => exit.destination.id === "colonie_town");
    expect(road).toBeDefined();
    session.travel(road!.id);
    expect(() => session.resupplyAtTown()).toThrow(/pending road encounter/i);
    session.resolveRoadEncounter("press_on");

    const worn = session.view();
    expect(worn.supplies).toBeLessThan(worn.maxSupplies);
    expect(worn.fatigue).toBeGreaterThan(0);

    const resupplied = session.resupplyAtTown();
    expect(resupplied).toMatchObject({
      action: "resupply",
      changed: true,
      minutes: 45,
      suppliesBefore: worn.supplies,
      suppliesAfter: worn.maxSupplies,
      fatigueBefore: worn.fatigue,
      fatigueAfter: worn.fatigue,
    });
    expect(resupplied.entry?.kind).toBe("service");
    expect(session.view().supplies).toBe(worn.maxSupplies);
    expect(session.view().journal[0]?.title).toContain("Resupplied");

    const rested = session.restAtTown();
    expect(rested.action).toBe("rest");
    expect(rested.changed).toBe(true);
    expect(rested.minutes).toBeGreaterThan(0);
    expect(rested.fatigueBefore).toBe(worn.fatigue);
    expect(rested.fatigueAfter).toBe(0);
    expect(rested.entry?.kind).toBe("service");

    const ready = session.view();
    expect(ready.fatigue).toBe(0);
    expect(ready.supplies).toBe(ready.maxSupplies);
    expect(ready.travelCondition).toBe("ready");
    expect(ready.journal[0]?.title).toContain("Rested");

    expect(session.restAtTown()).toMatchObject({
      changed: false,
      message: "You are already rested.",
    });
    expect(session.resupplyAtTown()).toMatchObject({
      changed: false,
      message: "Your supplies are already full.",
    });
  });

  it("plans routes only through the discovered road graph", () => {
    const session = new OverworldSession(world);
    const start = session.view();
    const colonieRoute = session.planRoute("colonie_town");
    const colonieRoad = start.exits.find((exit) => exit.destination.id === "colonie_town");

    expect(colonieRoad).toBeDefined();
    expect(colonieRoute.destination.id).toBe("colonie_town");
    expect(colonieRoute.steps[0]?.edge.id).toBe(colonieRoad!.id);
    expect(colonieRoute.totalMinutes).toBe(colonieRoad!.travel_minutes);
    expect(colonieRoute.estimate).toMatchObject({
      baseMinutes: colonieRoute.totalMinutes,
      delayMinutes: 0,
      elapsedMinutes: colonieRoute.totalMinutes,
      supplyDeficit: 0,
      travelConditionAfter: "ready",
    });
    expect(colonieRoute.estimate.suppliesAfter).toBe(
      start.supplies - colonieRoute.estimate.suppliesUsed,
    );
    expect(colonieRoute.estimate.fatigueAfter).toBe(colonieRoute.estimate.fatigueGained);
    expect(() => session.planRoute("buffalo_city")).toThrow(/not discovered/i);
  });

  it("turns local contacts, POIs, and events into timed journal leads", () => {
    const session = new OverworldSession(world);
    const before = session.view();
    const poi = before.pois[0]!;
    const contact = before.characters[0]!;
    const event = before.events[0]!;
    const localQuests = world.quests
      .filter((quest) => quest.home === before.current.id)
      .sort((a, b) => a.title.localeCompare(b.title));
    expect(localQuests.length).toBeGreaterThan(0);

    const scouted = session.scoutPoi(poi.id);
    expect(scouted.minutes).toBe(20);
    expect(scouted.entry.kind).toBe("poi");
    expect(scouted.discoveredSites).toHaveLength(1);
    expect(scouted.discoveredQuests).toEqual([]);
    expect(session.view().journal[0]?.title).toContain(poi.title);
    expect(session.view().sites.map((site) => site.id)).toEqual(
      scouted.discoveredSites?.map((site) => site.id),
    );
    expect(session.view().quests).toEqual([]);
    expect(session.view().discoveredQuestIds).toEqual([]);
    expect(session.view().hiddenQuestCount).toBe(localQuests.length);

    const repeated = session.scoutPoi(poi.id);
    expect(repeated.alreadyKnown).toBe(true);
    expect(repeated.minutes).toBe(0);
    expect(repeated.discoveredSites).toEqual([]);
    expect(repeated.discoveredQuests).toEqual([]);

    const talked = session.talkToCharacter(contact.id);
    expect(talked.minutes).toBe(15);
    expect(talked.entry.text).toContain(contact.agenda);
    expect(talked.discoveredQuests?.map((quest) => quest.id)).toEqual(
      localQuests.slice(0, 1).map((quest) => quest.id),
    );
    expect(talked.discoveredQuests?.every((quest) => !("pack" in quest))).toBe(true);
    expect(session.view().quests.map((quest) => quest.id)).toEqual(
      localQuests.slice(0, 1).map((quest) => quest.id),
    );
    expect(session.view().quests.every((quest) => !("pack" in quest))).toBe(true);

    const investigated = session.investigateEvent(event.id);
    expect(investigated.minutes).toBe(20 + event.intensity * 5);
    expect(investigated.entry.text).toContain(event.pressure);
    expect(investigated.discoveredQuests).toEqual([]);

    const after = session.view();
    expect(after.timeLabel).not.toBe(before.timeLabel);
    expect(after.journal).toHaveLength(3);
  });

  it("requires reaching a quest's local area before starting it", () => {
    const session = new OverworldSession(world);
    const initial = session.view();
    const firstLocalQuest = world.quests
      .filter((quest) => quest.home === initial.current.id)
      .sort((a, b) => a.title.localeCompare(b.title))[0]!;

    expect(firstLocalQuest.area).not.toBe(initial.currentArea?.id);
    expect(() => session.startQuest(firstLocalQuest.id)).toThrow(/Discover/i);

    const scouted = session.scoutPoi(initial.pois[0]!.id);
    expect(scouted.discoveredQuests).toEqual([]);
    const talked = session.talkToCharacter(initial.characters[0]!.id);
    const discoveredQuests = talked.discoveredQuests ?? [];
    expect(discoveredQuests).toHaveLength(1);
    const discoveredQuest = discoveredQuests[0]!;
    expect(discoveredQuest.id).toBe(firstLocalQuest.id);
    expect("pack" in discoveredQuest).toBe(false);
    expect(session.view().currentArea?.id).not.toBe(discoveredQuest.area);
    expect(() => session.startQuest(discoveredQuest.id)).toThrow(/Move to/i);
    expect(() =>
      session.completeQuest(discoveredQuest.id, {
        endingId: "ending_victory",
        endingTitle: "Victory",
        death: false,
      }),
    ).toThrow(/Start that local quest/i);

    const routeToQuestArea = session
      .view()
      .areaExits.find((exit) => exit.destination.id === discoveredQuest.area);
    expect(routeToQuestArea).toBeDefined();

    const moved = session.moveArea(routeToQuestArea!.id);
    expect(moved.to.id).toBe(discoveredQuest.area);
    const startedQuest = session.startQuest(discoveredQuest.id);
    expect(startedQuest).toMatchObject({
      id: discoveredQuest.id,
      area: discoveredQuest.area,
    });
    expect("pack" in startedQuest).toBe(false);
    expect(session.view().startedQuestIds).toEqual([discoveredQuest.id]);
    expect(session.view().journal[0]).toMatchObject({
      id: `quest:${discoveredQuest.id}`,
      kind: "quest",
    });
    expect(() => session.startQuest(discoveredQuest.id)).toThrow(/already been started/i);
    expect(() =>
      session.completeQuest(discoveredQuest.id, {
        endingId: "ending_fallen",
        endingTitle: "Fallen",
        death: true,
      }),
    ).toThrow(/death ending/i);

    const completedQuest = session.completeQuest(discoveredQuest.id, {
      endingId: "ending_victory",
      endingTitle: "Victory",
      death: false,
    });
    expect(completedQuest).toMatchObject({
      alreadyKnown: false,
      endingId: "ending_victory",
      quest: { id: discoveredQuest.id },
    });
    expect(completedQuest.entry).toMatchObject({
      id: `quest_done:${discoveredQuest.id}`,
      kind: "quest_done",
    });
    expect(session.view().completedQuestIds).toEqual([discoveredQuest.id]);
    expect(session.view().journal[0]).toMatchObject({
      id: `quest_done:${discoveredQuest.id}`,
      kind: "quest_done",
    });

    const repeatedCompletion = session.completeQuest(discoveredQuest.id, {
      endingId: "ending_victory",
      endingTitle: "Victory",
      death: false,
    });
    expect(repeatedCompletion.alreadyKnown).toBe(true);
    expect(session.view().completedQuestIds).toEqual([discoveredQuest.id]);
  });

  it("reveals exploration leads from the current local area", () => {
    const session = new OverworldSession(world);
    travelTo(session, "new_york_city");
    const start = session.view();
    const sites = world.exploration_sites.filter(
      (candidate) => candidate.area === start.currentArea?.id,
    );
    expect(sites).toHaveLength(1);
    expect(start.sites).toEqual([]);
    expect(start.hiddenSiteCount).toBe(sites.length);

    const scouted = session.scoutPoi(start.pois[0]!.id);
    expect(scouted.discoveredSites).toHaveLength(1);
    expect(scouted.discoveredSites?.[0]?.area).toBe(start.currentArea?.id);
    expect(session.view().sites).toHaveLength(1);
    expect(session.view().hiddenSiteCount).toBe(sites.length - 1);

    const talked = session.talkToCharacter(start.characters[0]!.id);
    expect(talked.discoveredSites).toEqual([]);
    expect(session.view().sites).toHaveLength(1);
    expect(session.view().hiddenSiteCount).toBe(0);

    const investigated = session.investigateEvent(start.events[0]!.id);
    expect(investigated.discoveredSites).toEqual([]);
    expect(session.view().sites).toHaveLength(1);
    expect(session.view().hiddenSiteCount).toBe(0);

    const nextAreaRoute = session.view().areaExits[0];
    expect(nextAreaRoute).toBeDefined();
    session.moveArea(nextAreaRoute!.id);
    expect(session.view().sites).toEqual([]);
    expect(session.view().hiddenSiteCount).toBe(1);
    const movedScout = session.scoutPoi(session.view().pois[0]!.id);
    expect(movedScout.discoveredSites?.[0]?.area).toBe(nextAreaRoute!.destination.id);
  });

  it("reveals and explores regional sites through local scouting", () => {
    const session = new OverworldSession(world);
    const start = session.view();
    const poi = start.pois[0]!;
    const site = world.exploration_sites.find(
      (candidate) => candidate.area === start.currentArea?.id,
    );
    expect(site).toBeDefined();

    expect(() => session.exploreSite(site!.id)).toThrow(/Scout a local point of interest/i);
    const scouted = session.scoutPoi(poi.id);
    expect(scouted.discoveredSites?.map((candidate) => candidate.id)).toContain(site!.id);
    expect(session.view().discoveredSiteIds).toContain(site!.id);

    const explored = session.exploreSite(site!.id);
    expect(explored.minutes).toBe(45 + site!.danger * 15);
    expect(explored.entry).toMatchObject({
      kind: "site",
      title: `Explored ${site!.title}`,
    });

    const after = session.view();
    expect(after.exploredSiteIds).toContain(site!.id);
    expect(after.regionRenown[start.current.region]).toBe(site!.danger);
    expect(after.journal[0]?.kind).toBe("site");

    const repeated = session.exploreSite(site!.id);
    expect(repeated.alreadyKnown).toBe(true);
    expect(repeated.minutes).toBe(0);
    expect(repeated.discoveredAreas).toEqual([]);
    expect(repeated.discoveredJobs).toEqual([]);
    expect(repeated.discoveredSites).toEqual([]);
    expect(repeated.discoveredQuests).toEqual([]);
    expect(session.view().regionRenown[start.current.region]).toBe(site!.danger);
  });

  it("requires local prep before resolving an event and awards regional renown", () => {
    const session = new OverworldSession(world);
    const start = session.view();
    const poi = start.pois[0]!;
    const contact = start.characters[0]!;
    const event = start.events[0]!;

    expect(() => session.resolveEvent(event.id)).toThrow(/Before resolving/i);
    session.scoutPoi(poi.id);
    session.talkToCharacter(contact.id);
    session.investigateEvent(event.id);

    const resolved = session.resolveEvent(event.id);
    expect(resolved.minutes).toBe(30 + event.intensity * 10);
    expect(resolved.entry.kind).toBe("resolution");
    expect(resolved.entry.text).toContain(start.current.region);

    const after = session.view();
    expect(after.resolvedEventIds).toContain(event.id);
    expect(after.regionRenown[start.current.region]).toBe(event.intensity);
    expect(after.journal).toHaveLength(4);

    const repeated = session.resolveEvent(event.id);
    expect(repeated.alreadyKnown).toBe(true);
    expect(repeated.minutes).toBe(0);
    expect(repeated.discoveredAreas).toEqual([]);
    expect(repeated.discoveredJobs).toEqual([]);
    expect(repeated.discoveredSites).toEqual([]);
    expect(repeated.discoveredQuests).toEqual([]);
    expect(session.view().regionRenown[start.current.region]).toBe(event.intensity);
  });

  it("completes a regional arc after enough anchor-town event resolutions", () => {
    const session = new OverworldSession(world);
    const arc = world.regional_arcs.find((candidate) => candidate.region === "Capital / Mohawk");
    expect(arc).toBeDefined();
    expect(session.view().regionalArcs.find((candidate) => candidate.id === arc!.id)).toMatchObject(
      {
        completed: false,
        resolvedInRegion: 0,
      },
    );

    const nonAnchor = world.nodes.find(
      (candidate) =>
        candidate.region === arc!.region &&
        !arc!.anchor_towns.includes(candidate.id) &&
        world.local_events.some((event) => event.home === candidate.id),
    );
    expect(nonAnchor).toBeDefined();
    travelTo(session, nonAnchor!.id);
    resolveCurrentTownEvent(session);
    expect(session.view().regionalArcs.find((candidate) => candidate.id === arc!.id)).toMatchObject(
      {
        completed: false,
        resolvedInRegion: 0,
      },
    );

    for (const townId of arc!.anchor_towns.slice(0, arc!.required_resolutions)) {
      travelTo(session, townId);
      resolveCurrentTownEvent(session);
    }

    const after = session.view();
    const progress = after.regionalArcs.find((candidate) => candidate.id === arc!.id);
    expect(progress).toMatchObject({
      completed: true,
      resolvedInRegion: arc!.required_resolutions,
    });
    expect(after.completedRegionalArcIds).toContain(arc!.id);
    expect(after.journal[0]).toMatchObject({
      kind: "regional_arc",
      title: `Completed ${arc!.title}`,
    });
  });

  it("rejects town actions for non-local content", () => {
    const session = new OverworldSession(world);
    const start = session.view();
    const nonCurrentPoi = world.points_of_interest.find(
      (poi) => poi.home === world.start && poi.area !== start.currentArea?.id,
    );
    const nonCurrentContact = world.characters.find(
      (character) => character.home === world.start && character.area !== start.currentArea?.id,
    );
    const nonCurrentEvent = world.local_events.find(
      (event) => event.home === world.start && event.area !== start.currentArea?.id,
    );
    const nonLocalPoi = world.points_of_interest.find((poi) => poi.home !== world.start);
    const nonLocalContact = world.characters.find((character) => character.home !== world.start);
    const nonLocalEvent = world.local_events.find((event) => event.home !== world.start);
    expect(nonCurrentPoi).toBeDefined();
    expect(nonCurrentContact).toBeDefined();
    expect(nonCurrentEvent).toBeDefined();
    expect(nonLocalPoi).toBeDefined();
    expect(nonLocalContact).toBeDefined();
    expect(nonLocalEvent).toBeDefined();

    expect(() => session.scoutPoi(nonCurrentPoi!.id)).toThrow(/Move to that local area/i);
    expect(() => session.talkToCharacter(nonCurrentContact!.id)).toThrow(
      /Move to that local area/i,
    );
    expect(() => session.investigateEvent(nonCurrentEvent!.id)).toThrow(/Move to that local area/i);
    expect(() => session.scoutPoi(nonLocalPoi!.id)).toThrow(/not in this town/i);
    expect(() => session.talkToCharacter(nonLocalContact!.id)).toThrow(/not in this town/i);
    expect(() => session.investigateEvent(nonLocalEvent!.id)).toThrow(/not active/i);
  });

  it("rejects travel along roads that are not adjacent to the current town", () => {
    const session = new OverworldSession(world);
    const farRoad = world.edges.find(
      (edge) => edge.from === "buffalo_city" || edge.to === "buffalo_city",
    );
    expect(farRoad).toBeDefined();
    expect(() => session.travel(farRoad!.id)).toThrow(/not reachable/i);
  });
});
