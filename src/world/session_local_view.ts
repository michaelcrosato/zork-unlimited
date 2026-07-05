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
  discoveredSiteIds: ReadonlySet<string>;
  discoveredQuestIds: ReadonlySet<string>;
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

function discoveredCurrentAreaJobs(
  jobs: readonly OverworldLocalJob[],
  currentAreaId: string,
  discoveredJobIds: ReadonlySet<string>,
): OverworldLocalJob[] {
  const discovered: OverworldLocalJob[] = [];
  for (const job of jobs) {
    if (job.area === currentAreaId && discoveredJobIds.has(job.id)) discovered.push(job);
  }
  return discovered;
}

function discoveredQuestViews(
  quests: readonly OverworldQuest[],
  discoveredQuestIds: ReadonlySet<string>,
): OverworldQuestView[] {
  const discovered: OverworldQuestView[] = [];
  for (const quest of quests) {
    if (discoveredQuestIds.has(quest.id)) discovered.push(questView(quest));
  }
  return discovered;
}

export function buildOverworldSessionLocalView(
  state: OverworldSessionLocalViewState,
): OverworldSessionLocalView {
  return {
    areas: discoveredValues(state.localAreas, state.discoveredAreaIds),
    hiddenAreaCount: hiddenCount(state.localAreas, state.discoveredAreaIds),
    jobs: discoveredCurrentAreaJobs(state.localJobs, state.currentAreaId, state.discoveredJobIds),
    hiddenJobCount: hiddenCount(state.localJobs, state.discoveredJobIds),
    sites: discoveredValues(state.currentAreaSites, state.discoveredSiteIds),
    hiddenSiteCount: hiddenCount(state.currentAreaSites, state.discoveredSiteIds),
    quests: discoveredQuestViews(state.localQuests, state.discoveredQuestIds),
    hiddenQuestCount: hiddenCount(state.localQuests, state.discoveredQuestIds),
  };
}
