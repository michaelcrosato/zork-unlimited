import { describe, expect, it } from "vitest";
import {
  overworldNodesById,
  type OverworldExit,
  type OverworldManifest,
  type OverworldNode,
} from "../../src/world/overworld.js";
import { loadOverworldManifest } from "../../src/world/source.js";
import {
  idIndex,
  keyedIndex,
  pushIndexed,
  sortedIndex,
} from "../../src/world/session_collections.js";
import { buildOverworldSnapshotManifestIndex } from "../../src/world/session_manifest_index.js";

const world = loadOverworldManifest(process.cwd());

function roadExitsByTown(
  manifest: OverworldManifest,
  nodesById: ReadonlyMap<string, OverworldNode>,
): Map<string, OverworldExit[]> {
  const index = new Map<string, OverworldExit[]>();
  for (const edge of manifest.edges) {
    const fromDestination = nodesById.get(edge.to);
    const toDestination = nodesById.get(edge.from);
    if (!fromDestination || !toDestination) {
      throw new Error(`Test manifest has an unknown road endpoint for "${edge.id}".`);
    }
    pushIndexed(index, edge.from, { ...edge, destination: fromDestination });
    pushIndexed(index, edge.to, { ...edge, destination: toDestination });
  }
  return index;
}

function buildIndex() {
  const nodesById = overworldNodesById(world);
  const areasById = idIndex(world.areas);

  return buildOverworldSnapshotManifestIndex({
    areasById,
    areasByTown: sortedIndex(
      world.areas,
      (area) => area.home,
      (left, right) =>
        left.travel_minutes - right.travel_minutes || left.name.localeCompare(right.name),
    ),
    charactersById: idIndex(world.characters),
    eventsById: idIndex(world.local_events),
    jobsById: idIndex(world.local_jobs),
    jobsByTown: sortedIndex(
      world.local_jobs,
      (job) => job.home,
      (left, right) =>
        left.difficulty - right.difficulty ||
        left.minutes - right.minutes ||
        left.title.localeCompare(right.title),
    ),
    nodesById,
    poisById: idIndex(world.points_of_interest),
    questsById: idIndex(world.quests),
    questsByTown: sortedIndex(
      world.quests,
      (quest) => quest.home,
      (left, right) => left.title.localeCompare(right.title),
    ),
    roadEventsByEdgeId: keyedIndex(world.road_events, (event) => event.edge),
    roadExitsByTown: roadExitsByTown(world, nodesById),
    sitesByArea: sortedIndex(
      world.exploration_sites,
      (site) => site.area,
      (left, right) => right.danger - left.danger || left.title.localeCompare(right.title),
    ),
    sitesById: idIndex(world.exploration_sites),
    world,
  });
}

describe("overworld snapshot manifest index", () => {
  it("builds restore lookup sets and source town names from the overworld manifest", () => {
    const index = buildIndex();
    const startTown = world.nodes.find((node) => node.id === world.start)!;
    const startArea = world.areas.find((area) => area.home === world.start)!;
    const startCharacter = world.characters.find((character) => character.home === world.start)!;
    const firstRoad = world.edges[0]!;
    const firstArc = world.regional_arcs[0]!;

    expect(index.nodeIds.size).toBe(world.nodes.length);
    expect(index.nodeIds.has(world.start)).toBe(true);
    expect(index.townNames.has(startTown.name)).toBe(true);
    expect(index.townNameForSource(world.start)).toBe(startTown.name);
    expect(index.townNameForSource("unknown_town")).toBe("unknown_town");

    expect(index.areaIds.has(startArea.id)).toBe(true);
    expect(index.areaHomes.get(startArea.id)).toBe(world.start);
    expect(index.areaTownNames.get(startArea.id)).toBe(startTown.name);

    expect(index.characterIds.has(startCharacter.id)).toBe(true);
    expect(index.characterTownNames.get(startCharacter.id)).toBe(startTown.name);

    expect(index.edgeIds.has(firstRoad.id)).toBe(true);
    expect(index.edgesById.get(firstRoad.id)).toBe(firstRoad);
    expect(
      index.roadExitsByTown.get(firstRoad.from)?.some((exit) => exit.id === firstRoad.id),
    ).toBe(true);

    expect(index.arcIds.has(firstArc.id)).toBe(true);
    expect(index.arcRegionNames.get(firstArc.id)).toBe(firstArc.region);
    expect(index.regionNames.has(firstArc.region)).toBe(true);
  });
});
