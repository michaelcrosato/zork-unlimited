import type {
  OverworldArea,
  OverworldExplorationSite,
  OverworldLocalJob,
  OverworldQuest,
} from "./overworld.js";
import {
  presentOverworldQuestLaunch,
  projectOverworldQuestLaunchOption,
  type OverworldQuestLaunchResources,
  type OverworldQuestLaunchView,
} from "./quest_launch.js";
import { wolfHillRoutePresentation } from "./wolf_hill_route_presentation.js";

export type OverworldQuestView = {
  id: string;
  title: string;
  home: string;
  area: string;
  discovery: string;
  visibility: OverworldQuest["visibility"];
  launch?: OverworldQuestLaunchView;
};

export type OverworldLocalDiscoveryResult = {
  discoveredAreas: OverworldArea[];
  discoveredJobs: OverworldLocalJob[];
  discoveredSites: OverworldExplorationSite[];
  discoveredQuests: OverworldQuestView[];
};

export type OverworldLocalDiscoveryState = {
  townId: string;
  currentTownId: string;
  areasByTown: ReadonlyMap<string, readonly OverworldArea[]>;
  jobsByTown: ReadonlyMap<string, readonly OverworldLocalJob[]>;
  currentAreaSites: readonly OverworldExplorationSite[];
  questsByTown: ReadonlyMap<string, readonly OverworldQuest[]>;
  discoveredAreaIds: ReadonlySet<string>;
  discoveredJobIds: ReadonlySet<string>;
  discoveredSiteIds: ReadonlySet<string>;
  discoveredQuestIds: ReadonlySet<string>;
  excludedQuestIds?: ReadonlySet<string>;
};

export type MutableOverworldLocalDiscoveryIds = {
  discoveredAreaIds: Set<string>;
  discoveredJobIds: Set<string>;
  discoveredSiteIds: Set<string>;
  discoveredQuestIds: Set<string>;
};

export function questView(
  quest: OverworldQuest,
  resources?: OverworldQuestLaunchResources,
  selectedApproachId?: string,
  knowledgeIds?: readonly string[],
): OverworldQuestView {
  return {
    id: quest.id,
    title: quest.title,
    home: quest.home,
    area: quest.area,
    discovery: quest.discovery,
    visibility: quest.visibility,
    ...(quest.launch
      ? {
          launch: presentOverworldQuestLaunch(
            quest.launch,
            resources,
            selectedApproachId,
            knowledgeIds,
          ),
        }
      : {}),
  };
}

export function projectOverworldQuestView(
  quest: OverworldQuestView,
  resources: OverworldQuestLaunchResources,
  knowledgeIds?: readonly string[],
): OverworldQuestView {
  const launch = quest.launch;
  if (!launch) return { ...quest };
  return {
    ...quest,
    launch: {
      id: launch.id,
      prompt: launch.prompt,
      options: launch.options.map((option) => {
        const routePresentation = wolfHillRoutePresentation({
          launchId: launch.id,
          optionId: option.id,
          ...(knowledgeIds ? { knowledgeIds } : {}),
        });
        return {
          id: option.id,
          title: option.title,
          summary: option.summary,
          preview: routePresentation?.previewOverride ?? option.preview,
          consequence: option.consequence,
          ...(routePresentation ? { tradeoffSummary: routePresentation.tradeoffSummary } : {}),
          terms: { ...option.terms },
          projection: projectOverworldQuestLaunchOption(option, resources),
        };
      }),
      ...(launch.selected ? { selected: { ...launch.selected } } : {}),
    },
  };
}

export function emptyOverworldLocalDiscovery(): OverworldLocalDiscoveryResult {
  return {
    discoveredAreas: [],
    discoveredJobs: [],
    discoveredSites: [],
    discoveredQuests: [],
  };
}

export function planOverworldLocalDiscovery(
  state: OverworldLocalDiscoveryState,
): OverworldLocalDiscoveryResult {
  const discovery = emptyOverworldLocalDiscovery();

  const area = (state.areasByTown.get(state.townId) ?? []).find(
    (candidate) => !state.discoveredAreaIds.has(candidate.id),
  );
  if (area) discovery.discoveredAreas.push(area);

  const discoveredAreaIds = new Set(state.discoveredAreaIds);
  for (const discoveredArea of discovery.discoveredAreas) discoveredAreaIds.add(discoveredArea.id);

  const job = (state.jobsByTown.get(state.townId) ?? []).find(
    (candidate) =>
      discoveredAreaIds.has(candidate.area) && !state.discoveredJobIds.has(candidate.id),
  );
  if (job) discovery.discoveredJobs.push(job);

  if (state.townId === state.currentTownId) {
    const site = state.currentAreaSites.find(
      (candidate) => !state.discoveredSiteIds.has(candidate.id),
    );
    if (site) discovery.discoveredSites.push(site);
  }

  const quest = (state.questsByTown.get(state.townId) ?? []).find(
    (candidate) =>
      discoveredAreaIds.has(candidate.area) &&
      !state.discoveredQuestIds.has(candidate.id) &&
      !state.excludedQuestIds?.has(candidate.id),
  );
  if (quest) discovery.discoveredQuests.push(questView(quest));

  return discovery;
}

function addDiscoveredIds<T extends { id: string }>(
  target: Set<string>,
  values: readonly T[],
): boolean {
  let changed = false;
  for (const value of values) {
    if (target.has(value.id)) continue;
    target.add(value.id);
    changed = true;
  }
  return changed;
}

export function applyOverworldLocalDiscovery(
  state: MutableOverworldLocalDiscoveryIds,
  discovery: OverworldLocalDiscoveryResult,
): boolean {
  const areasChanged = addDiscoveredIds(state.discoveredAreaIds, discovery.discoveredAreas);
  const jobsChanged = addDiscoveredIds(state.discoveredJobIds, discovery.discoveredJobs);
  const sitesChanged = addDiscoveredIds(state.discoveredSiteIds, discovery.discoveredSites);
  const questsChanged = addDiscoveredIds(state.discoveredQuestIds, discovery.discoveredQuests);
  return areasChanged || jobsChanged || sitesChanged || questsChanged;
}
