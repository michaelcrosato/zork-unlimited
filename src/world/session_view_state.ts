import type { OverworldCompactView } from "./compact_view.js";
import type {
  OverworldArea,
  OverworldAreaExit,
  OverworldCharacterView,
  OverworldExit,
  OverworldLocalEvent,
  OverworldNode,
  OverworldPoi,
  OverworldRegionalArc,
} from "./overworld.js";
import type { OverworldSessionCaches } from "./session_cache.js";
import { presentOverworldContact } from "./session_contact_presentation.js";
import {
  buildOverworldSessionCompactView,
  type OverworldSessionCompactViewState,
} from "./session_compact_view.js";
import type { OverworldCompactSessionIdState } from "./session_compact_ids.js";
import {
  currentOverworldSessionAreaContent,
  type MutableOverworldSessionLocalState,
  type OverworldSessionAreaContent,
} from "./session_local_state.js";
import type { OverworldSessionLocalView } from "./session_local_view.js";
import type { OverworldRegionalArcProgress } from "./session_regional_arcs.js";
import {
  cachedOverworldSessionDiscoveredRouteOptions,
  cachedOverworldSessionRegionalArcProgress,
} from "./session_route_progress.js";
import type { OverworldRoutePlannerIndex, OverworldSessionRoutePlan } from "./session_routes.js";
import type { OverworldRouteRoadEventState } from "./session_routes.js";
import type {
  OverworldJournalEntry,
  OverworldPendingRoadEncounter,
  TravelLogEntry,
} from "./session_snapshot.js";
import { buildOverworldSessionView, type OverworldView } from "./session_view.js";

type OverworldSessionViewLocalContentState = Pick<
  MutableOverworldSessionLocalState,
  "poisByArea" | "charactersByArea" | "eventsByArea" | "sitesByArea"
>;

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
  contacts: readonly OverworldCharacterView[];
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

export type OverworldSessionViewModelSourceState = {
  caches: OverworldSessionCaches;
  worldName: string;
  worldTownCount: number;
  current: OverworldNode;
  currentArea: OverworldArea | null;
  currentId: string;
  minutes: number;
  supplies: number;
  fatigue: number;
  roads: readonly OverworldExit[];
  areaExits: readonly OverworldAreaExit[];
  localState: OverworldSessionViewLocalContentState;
  localView: OverworldSessionLocalView;
  routePlannerIndex: OverworldRoutePlannerIndex;
  roadEventState?: OverworldRouteRoadEventState;
  completedQuestIds: ReadonlySet<string>;
  journalEntries: readonly OverworldJournalEntry[];
  travelLog: readonly TravelLogEntry[];
  visitedCount: number;
  regionRenown: ReadonlyMap<string, number>;
  completedRegionalArcIds: ReadonlySet<string>;
  pendingRoadEncounter: OverworldPendingRoadEncounter | null;
  ids: OverworldCompactSessionIdState;
};

export type OverworldSessionFullViewModelSourceState = OverworldSessionViewModelSourceState & {
  regionalArcs: readonly OverworldRegionalArc[];
  regionalArcAnchorTownsById: ReadonlyMap<string, readonly OverworldNode[]>;
  resolvedEventHomeIds: ReadonlySet<string>;
};

const EMPTY_AREA_CONTENT: OverworldSessionAreaContent = {
  characters: [],
  events: [],
  poi: [],
  sites: [],
};

const EMPTY_LOCAL_VIEW: OverworldSessionLocalView = {
  areas: [],
  hiddenAreaCount: 0,
  jobs: [],
  rememberedJobs: [],
  hiddenJobCount: 0,
  quests: [],
  hiddenQuestCount: 0,
  sites: [],
  hiddenSiteCount: 0,
};

function pendingRoadLocationNode(
  encounter: OverworldPendingRoadEncounter,
  destination: OverworldNode,
): OverworldNode {
  return {
    ...destination,
    id: `road:${encounter.edgeId}`,
    name: `On ${encounter.route}: ${encounter.from} to ${encounter.to}`,
    services: [],
    description: `${encounter.event.summary} You are still between ${encounter.from} and ${encounter.to}; resolve the road encounter before doing town business in ${encounter.to}.`,
  };
}

function activeOverworldEvents(
  events: readonly OverworldLocalEvent[],
  resolvedEventIds: ReadonlySet<string>,
): OverworldLocalEvent[] {
  return events.filter((event) => !resolvedEventIds.has(event.id));
}

export function buildOverworldSessionViewModelState(
  source: OverworldSessionViewModelSourceState,
): OverworldSessionViewModelState {
  if (source.pendingRoadEncounter) {
    return {
      worldName: source.worldName,
      worldTownCount: source.worldTownCount,
      current: pendingRoadLocationNode(source.pendingRoadEncounter, source.current),
      currentArea: null,
      minutes: source.minutes,
      supplies: source.supplies,
      fatigue: source.fatigue,
      roads: [],
      areaExits: [],
      routeOptions: [],
      localView: EMPTY_LOCAL_VIEW,
      poi: [],
      contacts: [],
      events: [],
      journalEntries: source.journalEntries,
      travelLog: source.travelLog,
      visitedCount: source.visitedCount,
      regionRenown: source.regionRenown,
      completedRegionalArcIds: source.completedRegionalArcIds,
      pendingRoadEncounter: source.pendingRoadEncounter,
      ids: source.ids,
    };
  }

  const currentAreaContent = source.currentArea
    ? currentOverworldSessionAreaContent(source.localState, source.currentArea.id)
    : EMPTY_AREA_CONTENT;
  const events = activeOverworldEvents(currentAreaContent.events, source.ids.resolvedEventIds);
  const contacts = currentAreaContent.characters.map(
    (character) =>
      presentOverworldContact(character, {
        completedQuestIds: source.completedQuestIds,
      }).contact,
  );
  const routeOptions = cachedOverworldSessionDiscoveredRouteOptions({
    caches: source.caches,
    routePlannerIndex: source.routePlannerIndex,
    current: source.current,
    currentId: source.currentId,
    discoveredIds: source.ids.discoveredIds,
    resources: {
      fatigue: source.fatigue,
      supplies: source.supplies,
    },
    ...(source.roadEventState ? { roadEventState: source.roadEventState } : {}),
  });

  return {
    worldName: source.worldName,
    worldTownCount: source.worldTownCount,
    current: source.current,
    currentArea: source.currentArea,
    minutes: source.minutes,
    supplies: source.supplies,
    fatigue: source.fatigue,
    roads: source.roads,
    areaExits: source.areaExits,
    routeOptions,
    localView: source.localView,
    poi: currentAreaContent.poi,
    contacts,
    events,
    journalEntries: source.journalEntries,
    travelLog: source.travelLog,
    visitedCount: source.visitedCount,
    regionRenown: source.regionRenown,
    completedRegionalArcIds: source.completedRegionalArcIds,
    pendingRoadEncounter: source.pendingRoadEncounter,
    ids: source.ids,
  };
}

export function buildOverworldSessionFullViewModelState(
  source: OverworldSessionFullViewModelSourceState,
): OverworldSessionFullViewModelState {
  const state = buildOverworldSessionViewModelState(source);
  return {
    ...state,
    regionalArcs: cachedOverworldSessionRegionalArcProgress({
      caches: source.caches,
      regionalArcs: source.regionalArcs,
      currentRegion: source.current.region,
      regionalArcAnchorTownsById: source.regionalArcAnchorTownsById,
      resolvedEventHomeIds: source.resolvedEventHomeIds,
      completedRegionalArcIds: source.completedRegionalArcIds,
    }),
  };
}

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
    rememberedJobs: state.localView.rememberedJobs,
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

export function buildOverworldSessionCompactViewFromSource(
  source: OverworldSessionViewModelSourceState,
): OverworldCompactView {
  return buildOverworldSessionCompactViewFromState(buildOverworldSessionViewModelState(source));
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
    rememberedJobs: state.localView.rememberedJobs,
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

export function buildOverworldSessionViewFromSource(
  source: OverworldSessionFullViewModelSourceState,
): OverworldView {
  return buildOverworldSessionViewFromState(buildOverworldSessionFullViewModelState(source));
}
