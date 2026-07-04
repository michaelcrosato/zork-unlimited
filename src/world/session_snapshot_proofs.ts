import { indexedList } from "./session_collections.js";
import type {
  OverworldPendingRoadEncounterSnapshot,
  TravelLogEntrySnapshot,
} from "./session_snapshot.js";
import type { OverworldTravelTimelineIndex } from "./session_snapshot_timeline.js";

export type OverworldRoadFrontierExit = {
  destination: {
    id: string;
  };
};

export type OverworldDiscoveredLocalSourcePrefixIndex = {
  discoveredAreaIds: ReadonlySet<string>;
  discoveredJobIds: ReadonlySet<string>;
  discoveredQuestIds: ReadonlySet<string>;
  discoveredSiteIds: ReadonlySet<string>;
  jobsByTown: ReadonlyMap<string, readonly { id: string; area: string }[]>;
  questsByTown: ReadonlyMap<string, readonly { id: string; area: string }[]>;
  sitesByArea: ReadonlyMap<string, readonly { id: string }[]>;
};

export function assertSnapshotVisitedTownTravelProof(
  visitedTownIds: ReadonlySet<string>,
  travelTimeline: OverworldTravelTimelineIndex,
): ReadonlyMap<string, number> {
  const visitedAt = travelTimeline.townVisitMinutes;
  for (const townId of visitedTownIds) {
    if (!visitedAt.has(townId)) {
      throw new Error(`Overworld session snapshot visited town "${townId}" has no travel arrival.`);
    }
  }
  for (const townId of travelTimeline.arrivedTownIds) {
    if (!visitedTownIds.has(townId)) {
      throw new Error(
        `Overworld session snapshot travel arrival town "${townId}" is missing from visited towns.`,
      );
    }
  }
  return visitedAt;
}

export function assertSnapshotTravelPathContinuity(
  snapshotCurrentTownId: string,
  startTownId: string,
  travelTimeline: OverworldTravelTimelineIndex,
): void {
  let replayTownId = startTownId;
  for (const entry of travelTimeline.oldestFirst) {
    if (entry.fromId !== replayTownId) {
      throw new Error(
        `Overworld session snapshot travel log is not contiguous at road "${entry.edgeId}".`,
      );
    }
    replayTownId = entry.toId;
  }
  if (snapshotCurrentTownId !== replayTownId) {
    throw new Error("Overworld session snapshot current town does not match travel history.");
  }
}

export function assertSnapshotPendingRoadEncounterBinding(
  pendingRoadEncounter: OverworldPendingRoadEncounterSnapshot | null,
  latestTravel: TravelLogEntrySnapshot | null,
  edgeIds: ReadonlySet<string>,
): void {
  if (!pendingRoadEncounter) return;
  if (!latestTravel) {
    throw new Error("Overworld session snapshot pending road encounter has no travel log.");
  }
  if (!edgeIds.has(latestTravel.edgeId)) return;
  if (latestTravel.edgeId !== pendingRoadEncounter.edgeId) {
    throw new Error(
      `Overworld session snapshot pending road encounter "${pendingRoadEncounter.edgeId}" does not match latest travel log road "${latestTravel.edgeId}".`,
    );
  }
}

export function assertSnapshotPendingRoadEncounterUnresolved(
  pendingRoadEncounter: OverworldPendingRoadEncounterSnapshot | null,
  latestTravel: TravelLogEntrySnapshot | null,
  roadJournal: { byKey: ReadonlyMap<string, unknown> },
): void {
  if (!pendingRoadEncounter) return;
  if (!latestTravel) return;

  const pendingArrivalKey = `${pendingRoadEncounter.edgeId}@${latestTravel.arrivedAt}`;
  if (roadJournal.byKey.has(pendingArrivalKey)) {
    throw new Error(
      `Overworld session snapshot pending road encounter "${pendingRoadEncounter.edgeId}" already has a road journal resolution.`,
    );
  }
}

export function expectedDiscoveredTownIds(
  roadExitsByTown: ReadonlyMap<string, readonly OverworldRoadFrontierExit[]>,
  visitedTownIds: ReadonlySet<string>,
): Set<string> {
  const expected = new Set<string>();
  for (const townId of visitedTownIds) {
    expected.add(townId);
    for (const edge of indexedList(roadExitsByTown, townId)) {
      expected.add(edge.destination.id);
    }
  }
  return expected;
}

export function assertSnapshotDiscoveredTownFrontier(
  discoveredTownIds: ReadonlySet<string>,
  roadExitsByTown: ReadonlyMap<string, readonly OverworldRoadFrontierExit[]>,
  visitedTownIds: ReadonlySet<string>,
): void {
  const expected = expectedDiscoveredTownIds(roadExitsByTown, visitedTownIds);
  for (const townId of discoveredTownIds) {
    if (!expected.has(townId)) {
      throw new Error(
        `Overworld session snapshot discovered town "${townId}" is outside the visited frontier.`,
      );
    }
  }
  for (const townId of expected) {
    if (!discoveredTownIds.has(townId)) {
      throw new Error(
        `Overworld session snapshot discovered town frontier is missing "${townId}".`,
      );
    }
  }
}

export function assertSnapshotDiscoveredAreaPrefix(
  areasByTown: ReadonlyMap<string, readonly { id: string }[]>,
  discoveredAreaIds: ReadonlySet<string>,
  visitedTownIds: ReadonlySet<string>,
): void {
  for (const townId of visitedTownIds) {
    const areas = indexedList(areasByTown, townId);
    if (areas.length === 0) continue;
    let discoveredAny = false;
    let hiddenAreaSeen = false;
    for (const area of areas) {
      const discovered = discoveredAreaIds.has(area.id);
      if (discovered) {
        discoveredAny = true;
        if (hiddenAreaSeen) {
          throw new Error(
            `Overworld session snapshot discovered area "${area.id}" skips an earlier area in "${townId}".`,
          );
        }
      } else {
        hiddenAreaSeen = true;
      }
    }
    if (!discoveredAny) {
      throw new Error(
        `Overworld session snapshot visited town "${townId}" is missing its initial discovered area.`,
      );
    }
  }
}

export function assertSnapshotDiscoveredSourcePrefix(
  sourceLabel: string,
  discoveredIds: ReadonlySet<string>,
  orderedSources: readonly { id: string }[],
  contextId: string,
): void {
  let hiddenSourceSeen = false;
  for (const source of orderedSources) {
    if (discoveredIds.has(source.id)) {
      if (hiddenSourceSeen) {
        throw new Error(
          `Overworld session snapshot discovered ${sourceLabel} "${source.id}" skips an earlier ${sourceLabel} in "${contextId}".`,
        );
      }
    } else {
      hiddenSourceSeen = true;
    }
  }
}

export function assertSnapshotDiscoveredLocalSourcePrefixes(
  sources: OverworldDiscoveredLocalSourcePrefixIndex,
  visitedTownIds: ReadonlySet<string>,
): void {
  const discoveredAreaIds = sources.discoveredAreaIds;
  for (const townId of visitedTownIds) {
    assertSnapshotDiscoveredSourcePrefix(
      "job",
      sources.discoveredJobIds,
      indexedList(sources.jobsByTown, townId).filter((job) => discoveredAreaIds.has(job.area)),
      townId,
    );
    assertSnapshotDiscoveredSourcePrefix(
      "quest",
      sources.discoveredQuestIds,
      indexedList(sources.questsByTown, townId).filter((quest) =>
        discoveredAreaIds.has(quest.area),
      ),
      townId,
    );
  }
  for (const areaId of discoveredAreaIds) {
    assertSnapshotDiscoveredSourcePrefix(
      "site",
      sources.discoveredSiteIds,
      indexedList(sources.sitesByArea, areaId),
      areaId,
    );
  }
}

export function assertSnapshotCurrentAreaMapExact(
  currentTownId: string,
  currentAreaId: string | null,
  currentAreaByTown: ReadonlyMap<string, string>,
  areasByTown: ReadonlyMap<string, readonly { id: string }[]>,
  visitedTownIds: ReadonlySet<string>,
): void {
  for (const townId of visitedTownIds) {
    const localAreas = indexedList(areasByTown, townId);
    if (localAreas.length > 0 && !currentAreaByTown.has(townId)) {
      throw new Error(
        `Overworld session snapshot saved area map is missing visited town "${townId}".`,
      );
    }
  }
  for (const [townId] of currentAreaByTown) {
    if (!visitedTownIds.has(townId)) continue;
    if (indexedList(areasByTown, townId).length === 0) {
      throw new Error(
        `Overworld session snapshot has saved area for town "${townId}" with no local areas.`,
      );
    }
  }

  if (indexedList(areasByTown, currentTownId).length === 0) return;
  const savedCurrentArea = currentAreaByTown.get(currentTownId);
  if (!savedCurrentArea) return;
  if (currentAreaId === null) {
    throw new Error("Overworld session snapshot current area is missing for a local town.");
  }
  if (savedCurrentArea !== currentAreaId) {
    throw new Error("Overworld session snapshot current area does not match saved area map.");
  }
}

export type OverworldCurrentAreaMapBindingIndex = {
  nodeIds: ReadonlySet<string>;
  areaIds: ReadonlySet<string>;
  areaHomes: ReadonlyMap<string, string>;
};

export function assertSnapshotCurrentAreaMapBindings(
  currentAreaByTown: ReadonlyMap<string, string>,
  indexes: OverworldCurrentAreaMapBindingIndex,
  visitedTownIds: ReadonlySet<string>,
  discoveredAreaIds: ReadonlySet<string>,
): void {
  for (const [townId, areaId] of currentAreaByTown) {
    if (!indexes.nodeIds.has(townId)) {
      throw new Error(`Overworld session snapshot has unknown area-map town "${townId}".`);
    }
    if (!indexes.areaIds.has(areaId)) {
      throw new Error(`Overworld session snapshot has unknown saved area "${areaId}".`);
    }
    if (indexes.areaHomes.get(areaId) !== townId) {
      throw new Error(`Overworld session snapshot saved area "${areaId}" is outside "${townId}".`);
    }
    if (!visitedTownIds.has(townId)) {
      throw new Error(`Overworld session snapshot saved area town "${townId}" is not visited.`);
    }
    if (!discoveredAreaIds.has(areaId)) {
      throw new Error(`Overworld session snapshot saved area "${areaId}" is not discovered.`);
    }
  }
}
