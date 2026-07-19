import type {
  OverworldExplorationSite,
  OverworldLocalEvent,
  OverworldLocalJob,
  OverworldNode,
  OverworldQuest,
  OverworldRoadEvent,
} from "./overworld.js";
import type { RoadJournalIdParts } from "./session_journal_codec.js";
import type { OverworldProgressJournalSourceIndex } from "./session_progress_journal.js";
import { QUEST_COMPLETION_RENOWN } from "./session_quests.js";
import type { OverworldJournalEntry, TravelLogEntrySnapshot } from "./session_snapshot.js";
import { roadEncounterOptionFor } from "./travel_mechanics.js";
import { resolveLocalJobSceneOption } from "./local_job_scene.js";
import { authoredLocalJobLegacyCompletion } from "./local_job_scene_legacy.js";
import { resolveLocalEventSceneOption } from "./local_event_scene.js";
import { authoredAlbanyCharterLegacyCompletion } from "./local_event_scene_legacy.js";

export type OverworldRegionRenownSourceIndex = {
  eventsById: ReadonlyMap<string, OverworldLocalEvent>;
  jobsById: ReadonlyMap<string, OverworldLocalJob>;
  nodesById: ReadonlyMap<string, OverworldNode>;
  questsById: ReadonlyMap<string, OverworldQuest>;
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
  journalEntries: readonly OverworldJournalEntry[] = [],
): Map<string, number> {
  const expected = new Map<string, number>();
  const journalEntriesById = new Map(journalEntries.map((entry) => [entry.id, entry] as const));

  for (const jobId of stateIds.completedJobIds) {
    const job = sources.jobsById.get(jobId);
    if (!job) continue;
    let renown = job.difficulty;
    if (job.authored_scene) {
      const proof = journalEntriesById.get(`job:${job.id}`)?.localSceneProof;
      if (!proof || proof.sceneId !== job.authored_scene.id) {
        throw new Error(
          `Overworld session snapshot authored job "${job.id}" is missing its renown proof.`,
        );
      }
      const legacyCompletion = authoredLocalJobLegacyCompletion(job.id, proof);
      renown = legacyCompletion
        ? legacyCompletion.definition.legacyJob.difficulty
        : resolveLocalJobSceneOption(job.authored_scene, proof.optionId).terms.renown;
    }
    addRegionRenown(
      expected,
      nodeRegionFor(sources.nodesById, job.home, `completed job "${jobId}"`),
      renown,
    );
  }
  for (const siteId of stateIds.exploredSiteIds) {
    const site = sources.sitesById.get(siteId);
    if (site) addRegionRenown(expected, site.region, site.danger);
  }
  for (const eventId of stateIds.resolvedEventIds) {
    const event = sources.eventsById.get(eventId);
    if (!event) continue;
    let renown = event.intensity;
    if (event.authored_scene) {
      const proof = journalEntriesById.get(`resolve:${event.id}`)?.localSceneProof;
      if (!proof || proof.sceneId !== event.authored_scene.id) {
        throw new Error(
          `Overworld session snapshot authored event "${event.id}" is missing its renown proof.`,
        );
      }
      const legacyCompletion = authoredAlbanyCharterLegacyCompletion(event.id, proof);
      if (legacyCompletion) {
        renown = legacyCompletion.legacyEvent.intensity;
      } else if (proof.sourceWorldHash === undefined) {
        renown = resolveLocalEventSceneOption(event.authored_scene, proof.optionId).terms.renown;
      } else {
        throw new Error(
          `Overworld session snapshot authored event "${event.id}" names an untrusted renown source.`,
        );
      }
    }
    addRegionRenown(
      expected,
      nodeRegionFor(sources.nodesById, event.home, `resolved event "${eventId}"`),
      renown,
    );
  }
  // Quest completions award QUEST_COMPLETION_RENOWN to the quest home's region
  // (see planOverworldQuestCompletion). Missing here meant NO snapshot taken
  // after a completed quest could ever restore — found by the Task 8 overworld
  // crawler's quest round-trip oracle on its first full pass.
  for (const questId of stateIds.completedQuestIds) {
    const quest = sources.questsById.get(questId);
    if (!quest) continue;
    addRegionRenown(
      expected,
      nodeRegionFor(sources.nodesById, quest.home, `completed quest "${questId}"`),
      QUEST_COMPLETION_RENOWN,
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
  journalEntries: readonly OverworldJournalEntry[] = [],
): void {
  const expected = expectedSnapshotRegionRenown(stateIds, sources, roadJournal, journalEntries);
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
