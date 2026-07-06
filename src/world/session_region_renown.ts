import type {
  OverworldExplorationSite,
  OverworldLocalEvent,
  OverworldLocalJob,
  OverworldNode,
  OverworldRoadEvent,
} from "./overworld.js";
import type { RoadJournalIdParts } from "./session_journal_codec.js";
import type { OverworldProgressJournalSourceIndex } from "./session_progress_journal.js";
import type { OverworldJournalEntry, TravelLogEntrySnapshot } from "./session_snapshot.js";
import { roadEncounterOptionFor } from "./travel_mechanics.js";

export type OverworldRegionRenownSourceIndex = {
  eventsById: ReadonlyMap<string, OverworldLocalEvent>;
  jobsById: ReadonlyMap<string, OverworldLocalJob>;
  nodesById: ReadonlyMap<string, OverworldNode>;
  roadEventsByEdgeId: ReadonlyMap<string, OverworldRoadEvent>;
  sitesById: ReadonlyMap<string, OverworldExplorationSite>;
  travelLogByArrival: ReadonlyMap<string, Pick<TravelLogEntrySnapshot, "toId">>;
};

export type OverworldRegionRenownRoadJournalResolution = {
  entry: Pick<OverworldJournalEntry, "id">;
  key: string;
  parsed: Pick<RoadJournalIdParts, "edgeId" | "strategy">;
};

export type OverworldRegionRenownRoadJournalIndex = {
  entries: readonly OverworldRegionRenownRoadJournalResolution[];
};

function addRegionRenown(target: Map<string, number>, region: string, amount: number): void {
  if (amount <= 0) return;
  target.set(region, (target.get(region) ?? 0) + amount);
}

function nodeRegionFor(
  nodesById: ReadonlyMap<string, OverworldNode>,
  nodeId: string,
  sourceLabel: string,
): string {
  const node = nodesById.get(nodeId);
  if (!node) {
    throw new Error(`Overworld session snapshot ${sourceLabel} references unknown town.`);
  }
  return node.region;
}

export function expectedSnapshotRegionRenown(
  stateIds: OverworldProgressJournalSourceIndex,
  sources: OverworldRegionRenownSourceIndex,
  roadJournal: OverworldRegionRenownRoadJournalIndex,
): Map<string, number> {
  const expected = new Map<string, number>();

  for (const jobId of stateIds.completedJobIds) {
    const job = sources.jobsById.get(jobId);
    if (!job) continue;
    addRegionRenown(
      expected,
      nodeRegionFor(sources.nodesById, job.home, `completed job "${jobId}"`),
      job.difficulty,
    );
  }
  for (const siteId of stateIds.exploredSiteIds) {
    const site = sources.sitesById.get(siteId);
    if (site) addRegionRenown(expected, site.region, site.danger);
  }
  for (const eventId of stateIds.resolvedEventIds) {
    const event = sources.eventsById.get(eventId);
    if (!event) continue;
    addRegionRenown(
      expected,
      nodeRegionFor(sources.nodesById, event.home, `resolved event "${eventId}"`),
      event.intensity,
    );
  }
  for (const resolution of roadJournal.entries) {
    const roadEvent = sources.roadEventsByEdgeId.get(resolution.parsed.edgeId);
    const travelLog = sources.travelLogByArrival.get(resolution.key);
    if (!roadEvent || !travelLog) continue;
    addRegionRenown(
      expected,
      nodeRegionFor(sources.nodesById, travelLog.toId, `road journal "${resolution.entry.id}"`),
      roadEncounterOptionFor(roadEvent, resolution.parsed.strategy).renownGained,
    );
  }

  return expected;
}

export function assertSnapshotRegionRenown(
  actual: ReadonlyMap<string, number>,
  stateIds: OverworldProgressJournalSourceIndex,
  sources: OverworldRegionRenownSourceIndex,
  roadJournal: OverworldRegionRenownRoadJournalIndex,
): void {
  const expected = expectedSnapshotRegionRenown(stateIds, sources, roadJournal);
  for (const [region, expectedRenown] of expected) {
    const actualRenown = actual.get(region) ?? 0;
    if (actualRenown !== expectedRenown) {
      throw new Error(
        `Overworld session snapshot region renown for "${region}" is ${actualRenown}, expected ${expectedRenown}.`,
      );
    }
  }
  for (const [region, actualRenown] of actual) {
    if (!expected.has(region)) {
      throw new Error(
        `Overworld session snapshot has unexpected region renown for "${region}" (${actualRenown}).`,
      );
    }
  }
}
