import { OVERWORLD_STARTING_MINUTES } from "./travel_mechanics.js";
import type { OverworldSessionSnapshot, TravelLogEntrySnapshot } from "./session_snapshot.js";

export type OverworldTravelTimelineIndex = {
  arrivals: ReadonlySet<string>;
  arrivedTownIds: ReadonlySet<string>;
  byArrival: ReadonlyMap<string, TravelLogEntrySnapshot>;
  latest: TravelLogEntrySnapshot | null;
  oldestFirst: readonly TravelLogEntrySnapshot[];
  townByArrival: ReadonlyMap<string, string>;
  townVisitMinutes: ReadonlyMap<string, number>;
};

export function travelResourceKey(entry: TravelLogEntrySnapshot): string {
  return `${entry.edgeId}@${entry.arrivedAt}`;
}

export function snapshotTravelTimelineIndex(
  snapshot: OverworldSessionSnapshot,
  townNameForSource: (nodeId: string) => string,
  startTownId: string,
): OverworldTravelTimelineIndex {
  const arrivals = new Set<string>();
  const arrivedTownIds = new Set<string>();
  const byArrival = new Map<string, TravelLogEntrySnapshot>();
  const oldestFirst: TravelLogEntrySnapshot[] = [];
  const townByArrival = new Map<string, string>();
  const townVisitMinutes = new Map<string, number>([[startTownId, OVERWORLD_STARTING_MINUTES]]);

  let previousArrivedAt = Number.POSITIVE_INFINITY;
  for (const entry of snapshot.travelLog) {
    const key = travelResourceKey(entry);
    if (arrivals.has(key)) {
      throw new Error(`Overworld session snapshot has duplicate travel log entry "${key}".`);
    }
    if (entry.arrivedAt > snapshot.minutes) {
      throw new Error("Overworld session snapshot travel log contains a future arrival.");
    }
    if (entry.arrivedAt > previousArrivedAt) {
      throw new Error("Overworld session snapshot travel log must be newest-first.");
    }
    arrivals.add(key);
    arrivedTownIds.add(entry.toId);
    byArrival.set(key, entry);
    oldestFirst.push(entry);
    townByArrival.set(key, townNameForSource(entry.toId));
    const previousTownVisit = townVisitMinutes.get(entry.toId);
    if (previousTownVisit === undefined || entry.arrivedAt < previousTownVisit) {
      townVisitMinutes.set(entry.toId, entry.arrivedAt);
    }
    previousArrivedAt = entry.arrivedAt;
  }
  oldestFirst.reverse();

  return {
    arrivals,
    arrivedTownIds,
    byArrival,
    latest: oldestFirst[oldestFirst.length - 1] ?? null,
    oldestFirst,
    townByArrival,
    townVisitMinutes,
  };
}
