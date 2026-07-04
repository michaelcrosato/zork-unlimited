import type { OverworldEdge, OverworldNode, OverworldRoadEvent } from "./overworld.js";
import type { TravelLogEntry, TravelLogEntrySnapshot } from "./session_snapshot.js";

export type OverworldTravelLogRestoreIndex = {
  edgesById: ReadonlyMap<string, OverworldEdge>;
  nodesById: ReadonlyMap<string, OverworldNode>;
  roadEventsByEdgeId: ReadonlyMap<string, OverworldRoadEvent>;
};

export function restoreOverworldTravelLogEntry(
  entry: TravelLogEntrySnapshot,
  indexes: OverworldTravelLogRestoreIndex,
): TravelLogEntry {
  const edge = indexes.edgesById.get(entry.edgeId);
  if (!edge) {
    throw new Error(`Overworld session snapshot has unknown travel road "${entry.edgeId}".`);
  }

  const endpointsMatch =
    (edge.from === entry.fromId && edge.to === entry.toId) ||
    (edge.from === entry.toId && edge.to === entry.fromId);
  if (!endpointsMatch) {
    throw new Error("Overworld session snapshot travel road endpoints do not match the world.");
  }
  if (entry.minutes !== edge.travel_minutes + entry.delayMinutes) {
    throw new Error("Overworld session snapshot travel minutes do not match the road.");
  }

  const from = indexes.nodesById.get(entry.fromId);
  const to = indexes.nodesById.get(entry.toId);
  if (!from || !to) {
    throw new Error("Overworld session snapshot travel log references an unknown town.");
  }

  return {
    edgeId: entry.edgeId,
    fromId: entry.fromId,
    toId: entry.toId,
    from: from.name,
    to: to.name,
    route: edge.route,
    distanceMi: edge.distance_mi,
    baseMinutes: edge.travel_minutes,
    delayMinutes: entry.delayMinutes,
    minutes: entry.minutes,
    arrivedAt: entry.arrivedAt,
    suppliesUsed: entry.suppliesUsed,
    suppliesAfter: entry.suppliesAfter,
    fatigueGained: entry.fatigueGained,
    fatigueAfter: entry.fatigueAfter,
    roadEvent: indexes.roadEventsByEdgeId.get(entry.edgeId) ?? null,
  };
}

export function restoreOverworldTravelLogEntries(
  entries: readonly TravelLogEntrySnapshot[],
  indexes: OverworldTravelLogRestoreIndex,
): TravelLogEntry[] {
  const restored: TravelLogEntry[] = [];
  for (const entry of entries) restored.push(restoreOverworldTravelLogEntry(entry, indexes));
  return restored;
}
