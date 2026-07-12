import {
  type OverworldArea,
  type OverworldAreaExit,
  type OverworldCharacterView,
  type OverworldExit,
  type OverworldExplorationSite,
  type OverworldLocalEvent,
  type OverworldLocalJob,
  type OverworldNode,
  type OverworldPoi,
} from "./overworld.js";
import { compareTownByPopulationThenName, sortedNumberRecord } from "./session_collections.js";
import { timeLabel } from "./session_journal_codec.js";
import type { OverworldQuestView } from "./session_local_discovery.js";
import {
  cloneOverworldRegionalArcProgress,
  type OverworldRegionalArcProgress,
} from "./session_regional_arcs.js";
import { cloneOverworldRouteOption, type OverworldSessionRoutePlan } from "./session_routes.js";
import type {
  OverworldJournalEntry,
  OverworldPendingRoadEncounter,
  TravelLogEntry,
} from "./session_snapshot.js";
import { OVERWORLD_MAX_SUPPLIES as MAX_SUPPLIES, travelCondition } from "./travel_mechanics.js";

export type OverworldView = {
  world: string;
  timeLabel: string;
  current: OverworldNode;
  currentArea: OverworldArea | null;
  areaExits: OverworldAreaExit[];
  exits: OverworldExit[];
  areas: OverworldArea[];
  hiddenAreaCount: number;
  pois: OverworldPoi[];
  characters: OverworldCharacterView[];
  events: OverworldLocalEvent[];
  jobs: OverworldLocalJob[];
  rememberedJobs: OverworldLocalJob[];
  hiddenJobCount: number;
  sites: OverworldExplorationSite[];
  hiddenSiteCount: number;
  quests: OverworldQuestView[];
  hiddenQuestCount: number;
  routeOptions: OverworldSessionRoutePlan[];
  discovered: OverworldNode[];
  visitedCount: number;
  totalTowns: number;
  supplies: number;
  maxSupplies: number;
  fatigue: number;
  travelCondition: string;
  journal: OverworldJournalEntry[];
  discoveredSiteIds: string[];
  discoveredAreaIds: string[];
  discoveredJobIds: string[];
  visitedAreaIds: string[];
  completedJobIds: string[];
  discoveredQuestIds: string[];
  startedQuestIds: string[];
  completedQuestIds: string[];
  exploredSiteIds: string[];
  resolvedEventIds: string[];
  regionRenown: Record<string, number>;
  regionalArcs: OverworldRegionalArcProgress[];
  completedRegionalArcIds: string[];
  pendingRoadEncounter: OverworldPendingRoadEncounter | null;
  log: TravelLogEntry[];
};

export type OverworldSessionViewState = {
  worldName: string;
  worldTownCount: number;
  current: OverworldNode;
  currentArea: OverworldArea | null;
  minutes: number;
  supplies: number;
  fatigue: number;
  roads: readonly OverworldExit[];
  areaExits: readonly OverworldAreaExit[];
  areas: readonly OverworldArea[];
  hiddenAreaCount: number;
  poi: readonly OverworldPoi[];
  contacts: readonly OverworldCharacterView[];
  events: readonly OverworldLocalEvent[];
  jobs: readonly OverworldLocalJob[];
  rememberedJobs: readonly OverworldLocalJob[];
  hiddenJobCount: number;
  sites: readonly OverworldExplorationSite[];
  hiddenSiteCount: number;
  quests: readonly OverworldQuestView[];
  hiddenQuestCount: number;
  routeOptions: readonly OverworldSessionRoutePlan[];
  discoveredIds: ReadonlySet<string>;
  nodes: ReadonlyMap<string, OverworldNode>;
  visitedCount: number;
  journalEntries: readonly OverworldJournalEntry[];
  discoveredAreaIds: ReadonlySet<string>;
  visitedAreaIds: ReadonlySet<string>;
  discoveredJobIds: ReadonlySet<string>;
  completedJobIds: ReadonlySet<string>;
  discoveredSiteIds: ReadonlySet<string>;
  discoveredQuestIds: ReadonlySet<string>;
  startedQuestIds: ReadonlySet<string>;
  completedQuestIds: ReadonlySet<string>;
  exploredSiteIds: ReadonlySet<string>;
  resolvedEventIds: ReadonlySet<string>;
  regionRenown: ReadonlyMap<string, number>;
  regionalArcs: readonly OverworldRegionalArcProgress[];
  completedRegionalArcIds: ReadonlySet<string>;
  pendingRoadEncounter: OverworldPendingRoadEncounter | null;
  travelLog: readonly TravelLogEntry[];
};

function sortedDiscoveredTownsByPopulation(
  discoveredIds: ReadonlySet<string>,
  nodes: ReadonlyMap<string, OverworldNode>,
): OverworldNode[] {
  const discoveredTowns: OverworldNode[] = [];
  for (const id of discoveredIds) {
    const town = nodes.get(id);
    if (town) discoveredTowns.push(town);
  }
  discoveredTowns.sort(compareTownByPopulationThenName);
  return discoveredTowns;
}

function routeOptionsForView(
  routeOptions: readonly OverworldSessionRoutePlan[],
): OverworldSessionRoutePlan[] {
  const options: OverworldSessionRoutePlan[] = [];
  for (const plan of routeOptions) options.push(cloneOverworldRouteOption(plan));
  return options;
}

function regionalArcProgressForView(
  progress: readonly OverworldRegionalArcProgress[],
): OverworldRegionalArcProgress[] {
  const viewProgress: OverworldRegionalArcProgress[] = [];
  for (const arc of progress) viewProgress.push(cloneOverworldRegionalArcProgress(arc));
  return viewProgress;
}

export function buildOverworldSessionView(state: OverworldSessionViewState): OverworldView {
  return {
    world: state.worldName,
    timeLabel: timeLabel(state.minutes),
    current: state.current,
    currentArea: state.currentArea,
    areaExits: [...state.areaExits],
    exits: [...state.roads],
    areas: [...state.areas],
    hiddenAreaCount: state.hiddenAreaCount,
    pois: [...state.poi],
    characters: [...state.contacts],
    events: [...state.events],
    jobs: [...state.jobs],
    rememberedJobs: [...state.rememberedJobs],
    hiddenJobCount: state.hiddenJobCount,
    sites: [...state.sites],
    hiddenSiteCount: state.hiddenSiteCount,
    quests: [...state.quests],
    hiddenQuestCount: state.hiddenQuestCount,
    routeOptions: routeOptionsForView(state.routeOptions),
    discovered: sortedDiscoveredTownsByPopulation(state.discoveredIds, state.nodes),
    visitedCount: state.visitedCount,
    totalTowns: state.worldTownCount,
    supplies: state.supplies,
    maxSupplies: MAX_SUPPLIES,
    fatigue: state.fatigue,
    travelCondition: travelCondition(state.fatigue, state.supplies),
    journal: [...state.journalEntries],
    discoveredAreaIds: [...state.discoveredAreaIds].sort(),
    discoveredJobIds: [...state.discoveredJobIds].sort(),
    visitedAreaIds: [...state.visitedAreaIds].sort(),
    completedJobIds: [...state.completedJobIds].sort(),
    discoveredSiteIds: [...state.discoveredSiteIds].sort(),
    discoveredQuestIds: [...state.discoveredQuestIds].sort(),
    startedQuestIds: [...state.startedQuestIds].sort(),
    completedQuestIds: [...state.completedQuestIds].sort(),
    exploredSiteIds: [...state.exploredSiteIds].sort(),
    resolvedEventIds: [...state.resolvedEventIds].sort(),
    regionRenown: sortedNumberRecord(state.regionRenown),
    regionalArcs: regionalArcProgressForView(state.regionalArcs),
    completedRegionalArcIds: [...state.completedRegionalArcIds].sort(),
    pendingRoadEncounter: state.pendingRoadEncounter,
    log: [...state.travelLog],
  };
}
