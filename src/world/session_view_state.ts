import type {
  OverworldCompactEventChoice,
  OverworldCompactJobChoice,
  OverworldCompactQuestStart,
  OverworldCompactView,
} from "./compact_view.js";
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
import { localEventSceneRequirementsMet } from "./local_event_scene.js";
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
import type { CampaignCharacterState } from "./campaign_character_state.js";
import {
  buildCampaignCharacterView,
  type CampaignCharacterView,
} from "./campaign_character_view.js";
import type { CampaignServiceOffer } from "./campaign_service_rules.js";
import {
  cloneOverworldServiceActionPresentation,
  type OverworldServiceActionPresentation,
} from "./session_service_presentation.js";
import { projectOverworldQuestView } from "./session_local_discovery.js";
import type { OverworldDepartureInteraction } from "./session_departure_interactions.js";
import type { JourneyOpportunityPresentation } from "./journey_contract.js";

type OverworldSessionViewLocalContentState = Pick<
  MutableOverworldSessionLocalState,
  "poisByArea" | "charactersByArea" | "eventsByArea" | "sitesByArea"
>;

export type OverworldSessionViewModelState = {
  character: CampaignCharacterView;
  worldName: string;
  worldTownCount: number;
  current: OverworldNode;
  currentArea: OverworldArea | null;
  minutes: number;
  supplies: number;
  fatigue: number;
  opportunities: JourneyOpportunityPresentation | null;
  serviceOffers: readonly CampaignServiceOffer[];
  serviceActions: readonly OverworldServiceActionPresentation[];
  departureInteractions: readonly OverworldDepartureInteraction[];
  roads: readonly OverworldExit[];
  areaExits: readonly OverworldAreaExit[];
  routeOptions: readonly OverworldSessionRoutePlan[];
  localView: OverworldSessionLocalView;
  poi: readonly OverworldPoi[];
  contacts: readonly OverworldCharacterView[];
  events: readonly OverworldLocalEvent[];
  eventChoices: readonly OverworldCompactEventChoice[];
  journalEntries: readonly OverworldJournalEntry[];
  travelLog: readonly TravelLogEntry[];
  visitedCount: number;
  regionRenown: ReadonlyMap<string, number>;
  completedRegionalArcIds: ReadonlySet<string>;
  pendingRoadEncounter: OverworldPendingRoadEncounter | null;
  jobChoices: readonly OverworldCompactJobChoice[];
  questStarts: readonly OverworldCompactQuestStart[];
  ids: OverworldCompactSessionIdState;
};

export type OverworldSessionFullViewModelState = OverworldSessionViewModelState & {
  regionalArcs: readonly OverworldRegionalArcProgress[];
};

export type OverworldSessionViewModelSourceState = {
  character: CampaignCharacterState;
  caches: OverworldSessionCaches;
  worldName: string;
  worldTownCount: number;
  current: OverworldNode;
  currentArea: OverworldArea | null;
  currentId: string;
  minutes: number;
  supplies: number;
  fatigue: number;
  opportunities: JourneyOpportunityPresentation | null;
  serviceOffers: readonly CampaignServiceOffer[];
  serviceActions: readonly OverworldServiceActionPresentation[];
  departureInteractions: readonly OverworldDepartureInteraction[];
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
  jobChoices: readonly OverworldCompactJobChoice[];
  eventChoices: readonly OverworldCompactEventChoice[];
  questStarts: readonly OverworldCompactQuestStart[];
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
  completedQuestIds: ReadonlySet<string>,
): OverworldLocalEvent[] {
  return events.filter(
    (event) =>
      !resolvedEventIds.has(event.id) &&
      (!event.authored_scene ||
        localEventSceneRequirementsMet(event.authored_scene, { completedQuestIds })),
  );
}

export function buildOverworldSessionViewModelState(
  source: OverworldSessionViewModelSourceState,
): OverworldSessionViewModelState {
  if (source.pendingRoadEncounter) {
    return {
      character: buildCampaignCharacterView(source.character),
      worldName: source.worldName,
      worldTownCount: source.worldTownCount,
      current: pendingRoadLocationNode(source.pendingRoadEncounter, source.current),
      currentArea: null,
      minutes: source.minutes,
      supplies: source.supplies,
      fatigue: source.fatigue,
      opportunities: source.opportunities,
      serviceOffers: [],
      serviceActions: [],
      departureInteractions: [],
      roads: [],
      areaExits: [],
      routeOptions: [],
      localView: EMPTY_LOCAL_VIEW,
      poi: [],
      contacts: [],
      events: [],
      eventChoices: [],
      journalEntries: source.journalEntries,
      travelLog: source.travelLog,
      visitedCount: source.visitedCount,
      regionRenown: source.regionRenown,
      completedRegionalArcIds: source.completedRegionalArcIds,
      pendingRoadEncounter: source.pendingRoadEncounter,
      jobChoices: [],
      questStarts: [],
      ids: source.ids,
    };
  }

  const currentAreaContent = source.currentArea
    ? currentOverworldSessionAreaContent(source.localState, source.currentArea.id)
    : EMPTY_AREA_CONTENT;
  const events = activeOverworldEvents(
    currentAreaContent.events,
    source.ids.resolvedEventIds,
    source.completedQuestIds,
  );
  const contacts = currentAreaContent.characters.map(
    (character) =>
      presentOverworldContact(character, {
        character: source.character,
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
  const localView: OverworldSessionLocalView = {
    ...source.localView,
    quests: source.localView.quests.map((quest) =>
      projectOverworldQuestView(
        quest,
        {
          minutes: source.minutes,
          supplies: source.supplies,
          fatigue: source.fatigue,
        },
        source.character.knowledge,
      ),
    ),
  };

  return {
    character: buildCampaignCharacterView(source.character),
    worldName: source.worldName,
    worldTownCount: source.worldTownCount,
    current: source.current,
    currentArea: source.currentArea,
    minutes: source.minutes,
    supplies: source.supplies,
    fatigue: source.fatigue,
    opportunities: source.opportunities,
    serviceOffers: source.serviceOffers.map((offer) => ({
      id: offer.id,
      action: offer.action,
      title: offer.title,
      summary: offer.summary,
      minutes: offer.minutes,
      ...(offer.providerId && offer.providerName
        ? { providerId: offer.providerId, providerName: offer.providerName }
        : {}),
    })),
    serviceActions: source.serviceActions.map(cloneOverworldServiceActionPresentation),
    departureInteractions: source.departureInteractions,
    roads: source.roads,
    areaExits: source.areaExits,
    routeOptions,
    localView,
    poi: currentAreaContent.poi,
    contacts,
    events,
    eventChoices: source.eventChoices,
    journalEntries: source.journalEntries,
    travelLog: source.travelLog,
    visitedCount: source.visitedCount,
    regionRenown: source.regionRenown,
    completedRegionalArcIds: source.completedRegionalArcIds,
    pendingRoadEncounter: source.pendingRoadEncounter,
    jobChoices: source.jobChoices,
    questStarts: source.questStarts,
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
    character: state.character,
    worldName: state.worldName,
    worldTownCount: state.worldTownCount,
    current: state.current,
    currentArea: state.currentArea,
    minutes: state.minutes,
    supplies: state.supplies,
    fatigue: state.fatigue,
    opportunities: state.opportunities,
    serviceOffers: state.serviceOffers,
    serviceActions: state.serviceActions,
    departureInteractions: state.departureInteractions,
    roads: state.roads,
    areaExits: state.areaExits,
    routeOptions: state.routeOptions,
    areas: state.localView.areas,
    poi: state.poi,
    contacts: state.contacts,
    events: state.events,
    eventChoices: state.eventChoices,
    jobs: state.localView.jobs,
    jobChoices: state.jobChoices,
    rememberedJobs: state.localView.rememberedJobs,
    sites: state.localView.sites,
    quests: state.localView.quests,
    questStarts: state.questStarts,
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
    character: state.character,
    worldName: state.worldName,
    worldTownCount: state.worldTownCount,
    current: state.current,
    currentArea: state.currentArea,
    minutes: state.minutes,
    supplies: state.supplies,
    fatigue: state.fatigue,
    serviceOffers: state.serviceOffers,
    serviceActions: state.serviceActions,
    departureInteractions: state.departureInteractions,
    roads: state.roads,
    areaExits: state.areaExits,
    areas: state.localView.areas,
    hiddenAreaCount: state.localView.hiddenAreaCount,
    poi: state.poi,
    contacts: state.contacts,
    events: state.events,
    eventChoices: state.eventChoices,
    jobs: state.localView.jobs,
    jobChoices: state.jobChoices,
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
    questStarts: state.questStarts,
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
