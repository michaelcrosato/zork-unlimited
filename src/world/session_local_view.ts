import type {
  OverworldArea,
  OverworldExplorationSite,
  OverworldLocalJob,
  OverworldQuest,
} from "./overworld.js";
import { questView, type OverworldQuestView } from "./session_local_discovery.js";
import { availableLocalJobSceneOptions } from "./local_job_scene.js";
import type { OverworldJournalEntry } from "./session_snapshot.js";

export type OverworldSessionLocalView = {
  areas: OverworldArea[];
  hiddenAreaCount: number;
  jobs: OverworldLocalJob[];
  rememberedJobs: OverworldLocalJob[];
  hiddenJobCount: number;
  sites: OverworldExplorationSite[];
  hiddenSiteCount: number;
  quests: OverworldQuestView[];
  hiddenQuestCount: number;
};

export type OverworldSessionLocalViewState = {
  localAreas: readonly OverworldArea[];
  currentAreaId: string;
  localJobs: readonly OverworldLocalJob[];
  currentAreaSites: readonly OverworldExplorationSite[];
  localQuests: readonly OverworldQuest[];
  discoveredAreaIds: ReadonlySet<string>;
  discoveredJobIds: ReadonlySet<string>;
  completedJobIds: ReadonlySet<string>;
  discoveredSiteIds: ReadonlySet<string>;
  discoveredQuestIds: ReadonlySet<string>;
  completedQuestIds: ReadonlySet<string>;
  resolvedEventIds?: ReadonlySet<string>;
  campaignWorldFactIds?: ReadonlySet<string>;
  journalEntries?: ReadonlyMap<string, OverworldJournalEntry>;
};

function discoveredValues<T extends { id: string }>(
  values: readonly T[],
  discoveredIds: ReadonlySet<string>,
): T[] {
  const discovered: T[] = [];
  for (const value of values) {
    if (discoveredIds.has(value.id)) discovered.push(value);
  }
  return discovered;
}

function hiddenCount<T extends { id: string }>(
  values: readonly T[],
  discoveredIds: ReadonlySet<string>,
): number {
  let count = 0;
  for (const value of values) {
    if (!discoveredIds.has(value.id)) count += 1;
  }
  return count;
}

function localJobIsChronologicallyAvailable(
  job: OverworldLocalJob,
  completedQuestIds: ReadonlySet<string>,
  resolvedEventIds: ReadonlySet<string>,
  campaignWorldFactIds: ReadonlySet<string>,
  journalEntries: ReadonlyMap<string, OverworldJournalEntry>,
): boolean {
  if (!job.authored_scene) return true;
  return (
    availableLocalJobSceneOptions(job.authored_scene, {
      completedQuestIds,
      resolvedEventIds,
      worldFactIds: campaignWorldFactIds,
      eventOptionIdFor: (eventId) =>
        journalEntries.get(`resolve:${eventId}`)?.localSceneProof?.optionId ?? null,
    }).length > 0
  );
}

function discoveredCurrentAreaJobs(
  jobs: readonly OverworldLocalJob[],
  currentAreaId: string,
  discoveredJobIds: ReadonlySet<string>,
  completedJobIds: ReadonlySet<string>,
): OverworldLocalJob[] {
  const discovered: OverworldLocalJob[] = [];
  for (const job of jobs) {
    if (
      job.area === currentAreaId &&
      discoveredJobIds.has(job.id) &&
      !completedJobIds.has(job.id)
    ) {
      discovered.push(job);
    }
  }
  return discovered;
}

function discoveredOtherAreaJobs(
  jobs: readonly OverworldLocalJob[],
  currentAreaId: string,
  discoveredJobIds: ReadonlySet<string>,
  completedJobIds: ReadonlySet<string>,
): OverworldLocalJob[] {
  const discovered: OverworldLocalJob[] = [];
  for (const job of jobs) {
    if (
      job.area !== currentAreaId &&
      discoveredJobIds.has(job.id) &&
      !completedJobIds.has(job.id)
    ) {
      discovered.push(job);
    }
  }
  return discovered;
}

function discoveredQuestViews(
  quests: readonly OverworldQuest[],
  discoveredQuestIds: ReadonlySet<string>,
  completedQuestIds: ReadonlySet<string>,
): OverworldQuestView[] {
  const discovered: OverworldQuestView[] = [];
  for (const quest of quests) {
    if (discoveredQuestIds.has(quest.id) && !completedQuestIds.has(quest.id)) {
      discovered.push(questView(quest));
    }
  }
  return discovered;
}

export function buildOverworldSessionLocalView(
  state: OverworldSessionLocalViewState,
): OverworldSessionLocalView {
  const chronologicallyAvailableJobs = state.localJobs.filter((job) =>
    localJobIsChronologicallyAvailable(
      job,
      state.completedQuestIds,
      state.resolvedEventIds ?? new Set<string>(),
      state.campaignWorldFactIds ?? new Set<string>(),
      state.journalEntries ?? new Map<string, OverworldJournalEntry>(),
    ),
  );
  return {
    areas: discoveredValues(state.localAreas, state.discoveredAreaIds),
    hiddenAreaCount: hiddenCount(state.localAreas, state.discoveredAreaIds),
    jobs: discoveredCurrentAreaJobs(
      chronologicallyAvailableJobs,
      state.currentAreaId,
      state.discoveredJobIds,
      state.completedJobIds,
    ),
    rememberedJobs: discoveredOtherAreaJobs(
      chronologicallyAvailableJobs,
      state.currentAreaId,
      state.discoveredJobIds,
      state.completedJobIds,
    ),
    hiddenJobCount: state.localJobs.filter(
      (job) =>
        !state.discoveredJobIds.has(job.id) ||
        (!state.completedJobIds.has(job.id) &&
          !localJobIsChronologicallyAvailable(
            job,
            state.completedQuestIds,
            state.resolvedEventIds ?? new Set<string>(),
            state.campaignWorldFactIds ?? new Set<string>(),
            state.journalEntries ?? new Map<string, OverworldJournalEntry>(),
          )),
    ).length,
    sites: discoveredValues(state.currentAreaSites, state.discoveredSiteIds),
    hiddenSiteCount: hiddenCount(state.currentAreaSites, state.discoveredSiteIds),
    quests: discoveredQuestViews(
      state.localQuests,
      state.discoveredQuestIds,
      state.completedQuestIds,
    ),
    hiddenQuestCount: hiddenCount(state.localQuests, state.discoveredQuestIds),
  };
}
