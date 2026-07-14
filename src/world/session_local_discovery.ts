import type {
  OverworldArea,
  OverworldExplorationSite,
  OverworldLocalJob,
  OverworldQuest,
} from "./overworld.js";

export type OverworldQuestView = {
  id: string;
  title: string;
  home: string;
  area: string;
  discovery: string;
  visibility: OverworldQuest["visibility"];
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

export function questView(quest: OverworldQuest): OverworldQuestView {
  return {
    id: quest.id,
    title: quest.title,
    home: quest.home,
    area: quest.area,
    discovery: quest.discovery,
    visibility: quest.visibility,
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
