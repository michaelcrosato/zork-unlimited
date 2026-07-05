import type { OverworldCompactView } from "./compact_view.js";
import type {
  OverworldArea,
  OverworldAreaExit,
  OverworldCharacter,
  OverworldExit,
  OverworldLocalEvent,
  OverworldNode,
  OverworldPoi,
} from "./overworld.js";
import {
  buildOverworldSessionCompactView,
  type OverworldSessionCompactViewState,
} from "./session_compact_view.js";
import type { OverworldCompactSessionIdState } from "./session_compact_ids.js";
import type { OverworldSessionLocalView } from "./session_local_view.js";
import type { OverworldRegionalArcProgress } from "./session_regional_arcs.js";
import type { OverworldSessionRoutePlan } from "./session_routes.js";
import type {
  OverworldJournalEntry,
  OverworldPendingRoadEncounter,
  TravelLogEntry,
} from "./session_snapshot.js";
import { buildOverworldSessionView, type OverworldView } from "./session_view.js";

export type OverworldSessionViewModelState = {
  worldName: string;
  worldTownCount: number;
  current: OverworldNode;
  currentArea: OverworldArea | null;
  minutes: number;
  supplies: number;
  fatigue: number;
  roads: readonly OverworldExit[];
  areaExits: readonly OverworldAreaExit[];
  routeOptions: readonly OverworldSessionRoutePlan[];
  localView: OverworldSessionLocalView;
  poi: readonly OverworldPoi[];
  contacts: readonly OverworldCharacter[];
  events: readonly OverworldLocalEvent[];
  journalEntries: readonly OverworldJournalEntry[];
  travelLog: readonly TravelLogEntry[];
  visitedCount: number;
  regionRenown: ReadonlyMap<string, number>;
  completedRegionalArcIds: ReadonlySet<string>;
  pendingRoadEncounter: OverworldPendingRoadEncounter | null;
  ids: OverworldCompactSessionIdState;
};

export type OverworldSessionFullViewModelState = OverworldSessionViewModelState & {
  regionalArcs: readonly OverworldRegionalArcProgress[];
};

function compactViewState(state: OverworldSessionViewModelState): OverworldSessionCompactViewState {
  return {
    worldName: state.worldName,
    worldTownCount: state.worldTownCount,
    current: state.current,
    currentArea: state.currentArea,
    minutes: state.minutes,
    supplies: state.supplies,
    fatigue: state.fatigue,
    roads: state.roads,
    areaExits: state.areaExits,
    routeOptions: state.routeOptions,
    areas: state.localView.areas,
    poi: state.poi,
    contacts: state.contacts,
    events: state.events,
    jobs: state.localView.jobs,
    sites: state.localView.sites,
    quests: state.localView.quests,
    hiddenAreaCount: state.localView.hiddenAreaCount,
    hiddenJobCount: state.localView.hiddenJobCount,
    hiddenSiteCount: state.localView.hiddenSiteCount,
    hiddenQuestCount: state.localView.hiddenQuestCount,
    journalEntries: state.journalEntries,
    travelLog: state.travelLog,
    visitedCount: state.visitedCount,
    regionRenown: state.regionRenown,
    completedRegionalArcIds: state.completedRegionalArcIds,
    pendingRoadEncounter: state.pendingRoadEncounter,
    ids: state.ids,
  };
}

export function buildOverworldSessionCompactViewFromState(
  state: OverworldSessionViewModelState,
): OverworldCompactView {
  return buildOverworldSessionCompactView(compactViewState(state));
}

export function buildOverworldSessionViewFromState(
  state: OverworldSessionFullViewModelState,
): OverworldView {
  return buildOverworldSessionView({
    worldName: state.worldName,
    worldTownCount: state.worldTownCount,
    current: state.current,
    currentArea: state.currentArea,
    minutes: state.minutes,
    supplies: state.supplies,
    fatigue: state.fatigue,
    roads: state.roads,
    areaExits: state.areaExits,
    areas: state.localView.areas,
    hiddenAreaCount: state.localView.hiddenAreaCount,
    poi: state.poi,
    contacts: state.contacts,
    events: state.events,
    jobs: state.localView.jobs,
    hiddenJobCount: state.localView.hiddenJobCount,
    sites: state.localView.sites,
    hiddenSiteCount: state.localView.hiddenSiteCount,
    quests: state.localView.quests,
    hiddenQuestCount: state.localView.hiddenQuestCount,
    routeOptions: state.routeOptions,
    discoveredIds: state.ids.discoveredIds,
    nodes: state.ids.nodes,
    visitedCount: state.visitedCount,
    journalEntries: state.journalEntries,
    discoveredAreaIds: state.ids.discoveredAreaIds,
    visitedAreaIds: state.ids.visitedAreaIds,
    discoveredJobIds: state.ids.discoveredJobIds,
    completedJobIds: state.ids.completedJobIds,
    discoveredSiteIds: state.ids.discoveredSiteIds,
    discoveredQuestIds: state.ids.discoveredQuestIds,
    startedQuestIds: state.ids.startedQuestIds,
    completedQuestIds: state.ids.completedQuestIds,
    exploredSiteIds: state.ids.exploredSiteIds,
    resolvedEventIds: state.ids.resolvedEventIds,
    regionRenown: state.regionRenown,
    regionalArcs: state.regionalArcs,
    completedRegionalArcIds: state.completedRegionalArcIds,
    pendingRoadEncounter: state.pendingRoadEncounter,
    travelLog: state.travelLog,
  });
}
