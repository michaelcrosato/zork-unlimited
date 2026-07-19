import type {
  OverworldArea,
  OverworldExplorationSite,
  OverworldLocalJob,
  OverworldQuest,
} from "./overworld.js";
import { questView, type OverworldQuestView } from "./session_local_discovery.js";

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
): boolean {
  return (
    !job.authored_scene ||
    job.authored_scene.requires_completed_quests.every((questId) => completedQuestIds.has(questId))
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
    localJobIsChronologicallyAvailable(job, state.completedQuestIds),
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
          !localJobIsChronologicallyAvailable(job, state.completedQuestIds)),
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
