import {
  OVERWORLD_COMPACT_LOCAL_REF_LIMIT,
  OVERWORLD_COMPACT_OPPORTUNITY_LEAD_LIMIT,
  OVERWORLD_COMPACT_VIEW_VERSION,
  compactCampaignServiceOffers,
  compactOverworldServiceActions,
  compactCampaignCharacterView,
  compactJourneyOpportunityLeads,
  compactOverworldEventChoices,
  compactOverworldBlockedEventLeads,
  compactOverworldEventScenes,
  compactLocalRefTruncation,
  compactOverworldAreaRoutes,
  compactOverworldCompletedArcs,
  compactOverworldJournalEntries,
  compactOverworldLabel,
  compactOverworldJobLeadRefs,
  compactOverworldJobChoices,
  compactOverworldJobScenes,
  compactOverworldMovementTruncated,
  compactOverworldQuestRefs,
  compactOverworldQuestStartLocations,
  compactOverworldQuestStarts,
  compactOverworldRefs,
  compactOverworldRenownEntries,
  compactOverworldRoads,
  compactOverworldRouteOptions,
  compactOverworldRoutePathsTruncated,
  compactOverworldTitleRefs,
  compactOverworldTravelLog,
  compactPendingRoad,
  type OverworldCompactQuestStart,
  type OverworldCompactEventChoice,
  type OverworldCompactJobChoice,
  type OverworldCompactView,
} from "./compact_view.js";
import type { CampaignCharacterView } from "./campaign_character_view.js";
import type { CampaignServiceOffer } from "./campaign_service_rules.js";
import type {
  OverworldArea,
  OverworldAreaExit,
  OverworldCharacterView,
  OverworldExit,
  OverworldExplorationSite,
  OverworldLocalEvent,
  OverworldLocalJob,
  OverworldNode,
  OverworldPoi,
} from "./overworld.js";
import {
  compactOverworldSessionIdPayload,
  type OverworldCompactSessionIdState,
} from "./session_compact_ids.js";
import { sortedNumberMap, sortedStringSet } from "./session_collections.js";
import type { OverworldQuestView } from "./session_local_discovery.js";
import type { OverworldSessionRoutePlan } from "./session_routes.js";
import type {
  OverworldJournalEntry,
  OverworldPendingRoadEncounter,
  TravelLogEntry,
} from "./session_snapshot.js";
import { timeLabel } from "./session_journal_codec.js";
import { OVERWORLD_MAX_SUPPLIES as MAX_SUPPLIES, travelCondition } from "./travel_mechanics.js";
import {
  compactOverworldDepartureContactLeads,
  compactOverworldDepartureInteractions,
  type OverworldDepartureContactLead,
  type OverworldDepartureInteraction,
} from "./session_departure_interactions.js";
import type { JourneyOpportunityPresentation } from "./journey_contract.js";
import type { OverworldServiceActionPresentation } from "./session_service_presentation.js";
import {
  compactOpeningDepartureRecap,
  type OpeningDepartureRecap,
} from "./opening_departure_recap.js";
import {
  compactStationDispatchBoard,
  type StationDispatchBoard,
} from "./station_dispatch_board.js";

export type OverworldSessionCompactViewState = {
  character: CampaignCharacterView;
  worldName: string;
  worldTownCount: number;
  current: OverworldNode;
  currentArea: OverworldArea | null;
  minutes: number;
  supplies: number;
  fatigue: number;
  opportunities?: JourneyOpportunityPresentation | null;
  serviceOffers: readonly CampaignServiceOffer[];
  serviceActions: readonly OverworldServiceActionPresentation[];
  departureInteractions?: readonly OverworldDepartureInteraction[];
  departureContactLeads?: readonly OverworldDepartureContactLead[];
  departureRecap?: OpeningDepartureRecap | null;
  stationDispatchBoard?: StationDispatchBoard | null;
  roads: readonly OverworldExit[];
  areaExits: readonly OverworldAreaExit[];
  routeOptions: readonly OverworldSessionRoutePlan[];
  areas: readonly OverworldArea[];
  poi: readonly OverworldPoi[];
  contacts: readonly OverworldCharacterView[];
  events: readonly OverworldLocalEvent[];
  eventChoices?: readonly OverworldCompactEventChoice[];
  jobs: readonly OverworldLocalJob[];
  jobChoices?: readonly OverworldCompactJobChoice[];
  rememberedJobs: readonly OverworldLocalJob[];
  sites: readonly OverworldExplorationSite[];
  quests: readonly OverworldQuestView[];
  questStarts: readonly OverworldCompactQuestStart[];
  hiddenAreaCount: number;
  hiddenJobCount: number;
  hiddenSiteCount: number;
  hiddenQuestCount: number;
  journalEntries: readonly OverworldJournalEntry[];
  travelLog: readonly TravelLogEntry[];
  visitedCount: number;
  regionRenown: ReadonlyMap<string, number>;
  completedRegionalArcIds: ReadonlySet<string>;
  pendingRoadEncounter: OverworldPendingRoadEncounter | null;
  ids: OverworldCompactSessionIdState;
};

export function buildOverworldSessionCompactView(
  state: OverworldSessionCompactViewState,
): OverworldCompactView {
  const areaRoutes = compactOverworldAreaRoutes(state.areaExits);
  const roadsTruncated = compactOverworldMovementTruncated(state.roads);
  const areaRoutesTruncated = compactOverworldMovementTruncated(state.areaExits);
  const compactRouteOptions = compactOverworldRouteOptions(state.routeOptions);
  const routePathsTruncated = compactOverworldRoutePathsTruncated(state.routeOptions);
  const idPayload = compactOverworldSessionIdPayload(state.ids);
  const visibleJobs = state.jobs.slice(0, OVERWORLD_COMPACT_LOCAL_REF_LIMIT);
  const visibleJobIds = new Set(visibleJobs.map((job) => job.id));
  const jobs = compactOverworldTitleRefs(visibleJobs);
  const jobScenes = compactOverworldJobScenes(visibleJobs);
  const jobChoices = compactOverworldJobChoices(
    (state.jobChoices ?? []).filter(([jobId]) => visibleJobIds.has(jobId)),
  );
  const rememberedJobs = compactOverworldJobLeadRefs(state.rememberedJobs);
  const sites = compactOverworldTitleRefs(state.sites);
  const questStarts = compactOverworldQuestStarts(state.questStarts);
  const quests = compactOverworldQuestRefs(
    state.quests,
    OVERWORLD_COMPACT_LOCAL_REF_LIMIT,
    new Set(questStarts.map(([questId]) => questId)),
    state.ids.startedQuestIds,
  );
  const questStartLocations = compactOverworldQuestStartLocations(
    state.quests,
    state.currentArea?.id ?? null,
    state.ids.startedQuestIds,
    new Map(state.areas.map((area) => [area.id, area.name])),
  );
  const pendingRoad = compactPendingRoad(state.pendingRoadEncounter);
  const journal = compactOverworldJournalEntries(state.journalEntries);
  const travelLog = compactOverworldTravelLog(state.travelLog);
  const renownEntries = sortedNumberMap(state.regionRenown);
  const renown = compactOverworldRenownEntries(renownEntries);
  const completedArcIds = sortedStringSet(state.completedRegionalArcIds);
  const completedArcs = compactOverworldCompletedArcs(completedArcIds);
  const roads = compactOverworldRoads(state.roads, state.routeOptions, {
    fatigue: state.fatigue,
    supplies: state.supplies,
  });
  const areas = compactOverworldRefs(state.areas);
  const poi = compactOverworldTitleRefs(state.poi);
  const contacts = compactOverworldRefs(state.contacts);
  const events = compactOverworldTitleRefs(state.events);
  const visibleEvents = state.events.slice(0, OVERWORLD_COMPACT_LOCAL_REF_LIMIT);
  const visibleEventIds = new Set(visibleEvents.map((event) => event.id));
  const eventChoices = compactOverworldEventChoices(
    (state.eventChoices ?? []).filter(([eventId]) => visibleEventIds.has(eventId)),
  );
  const eventSceneIds = new Set(eventChoices.map(([eventId]) => eventId));
  const eventScenes = compactOverworldEventScenes(
    visibleEvents.filter((event) => eventSceneIds.has(event.id)),
  );
  const eventLeads = compactOverworldBlockedEventLeads(visibleEvents, {
    eventChoices,
    journalEntryIds: new Set(state.journalEntries.map((entry) => entry.id)),
    poiTitlesById: new Map(state.poi.map((poi) => [poi.id, poi.title])),
    contactNamesById: new Map(state.contacts.map((contact) => [contact.id, contact.name])),
  });
  const serviceOffers = compactCampaignServiceOffers(state.serviceOffers);
  const serviceActions = compactOverworldServiceActions(state.serviceActions);
  const departureInteractions = compactOverworldDepartureInteractions(
    state.departureInteractions ?? [],
  );
  const departureContactLeads = compactOverworldDepartureContactLeads(
    state.departureContactLeads ?? [],
  );
  const departureRecap = state.departureRecap
    ? compactOpeningDepartureRecap(state.departureRecap)
    : null;
  const stationDispatchBoard = state.stationDispatchBoard
    ? compactStationDispatchBoard(state.stationDispatchBoard)
    : null;
  const hasStationDispatchBoard = stationDispatchBoard !== null;
  const departureQuestId = hasStationDispatchBoard ? stationDispatchBoard[1] : departureRecap?.[1];
  const departureLaunchReady =
    departureQuestId !== undefined && questStarts.some(([questId]) => questId === departureQuestId);
  const opportunityLeads = compactJourneyOpportunityLeads(state.opportunities);
  const localRefsTruncated = compactLocalRefTruncation({
    areas: state.areas.length,
    poi: state.poi.length,
    contacts: state.contacts.length,
    events: state.events.length,
    jobs: state.jobs.length,
    remembered_jobs: state.rememberedJobs.length,
    sites: state.sites.length,
    quests: state.quests.length,
  });

  return {
    v: OVERWORLD_COMPACT_VIEW_VERSION,
    character: compactCampaignCharacterView(state.character),
    world: compactOverworldLabel(state.worldName),
    time: timeLabel(state.minutes),
    here: [
      state.current.id,
      compactOverworldLabel(state.current.name),
      compactOverworldLabel(state.current.region),
      state.currentArea?.id ?? null,
      state.currentArea ? compactOverworldLabel(state.currentArea.name) : null,
    ],
    vitals: [
      state.supplies,
      MAX_SUPPLIES,
      state.fatigue,
      travelCondition(state.fatigue, state.supplies),
    ],
    ...(serviceOffers.length > 0 ? { service_offers: serviceOffers } : {}),
    ...(serviceActions.length > 0 ? { service_actions: serviceActions } : {}),
    ...(!departureLaunchReady && !hasStationDispatchBoard && departureInteractions.length > 0
      ? { departure_interactions: departureInteractions }
      : {}),
    ...(!departureLaunchReady && !hasStationDispatchBoard && departureContactLeads.length > 0
      ? { departure_contact_leads: departureContactLeads }
      : {}),
    ...(!departureLaunchReady && !hasStationDispatchBoard && departureRecap
      ? { departure_recap: departureRecap }
      : {}),
    ...(!departureLaunchReady && stationDispatchBoard
      ? { station_dispatch_board: stationDispatchBoard }
      : {}),
    ...(state.opportunities
      ? {
          opportunity_guidance: state.opportunities.guidance,
          ...(opportunityLeads.length > 0 ? { opportunity_leads: opportunityLeads } : {}),
          ...(state.opportunities.deferredLeadCount === undefined
            ? {}
            : { opportunity_leads_deferred: state.opportunities.deferredLeadCount }),
        }
      : {}),
    ...(state.opportunities &&
    state.opportunities.leads.length > OVERWORLD_COMPACT_OPPORTUNITY_LEAD_LIMIT
      ? { opportunity_leads_truncated: true as const }
      : {}),
    hidden: [
      state.hiddenAreaCount,
      state.hiddenJobCount,
      state.hiddenSiteCount,
      state.hiddenQuestCount,
    ],
    roads,
    ...(roadsTruncated ? { roads_truncated: true as const } : {}),
    ...(areaRoutes.length > 0 ? { area_routes: areaRoutes } : {}),
    ...(areaRoutesTruncated ? { area_routes_truncated: true as const } : {}),
    route_options: compactRouteOptions,
    ...(state.routeOptions.length > compactRouteOptions.length
      ? { route_options_truncated: true as const }
      : {}),
    ...(routePathsTruncated ? { route_paths_truncated: true as const } : {}),
    areas,
    poi,
    contacts,
    events,
    ...(eventLeads.length > 0 ? { event_leads: eventLeads } : {}),
    ...(eventScenes.length > 0 ? { event_scenes: eventScenes } : {}),
    ...(eventChoices.length > 0 ? { event_choices: eventChoices } : {}),
    ...(localRefsTruncated.length > 0 ? { local_refs_truncated: localRefsTruncated } : {}),
    ...(jobs.length > 0 ? { jobs } : {}),
    ...(jobScenes.length > 0 ? { job_scenes: jobScenes } : {}),
    ...(jobChoices.length > 0 ? { job_choices: jobChoices } : {}),
    ...(rememberedJobs.length > 0 ? { remembered_jobs: rememberedJobs } : {}),
    ...(sites.length > 0 ? { sites } : {}),
    ...(quests.length > 0 ? { quests } : {}),
    ...(questStartLocations.length > 0 ? { quest_start_locations: questStartLocations } : {}),
    ...(questStarts.length > 0 ? { quest_starts: questStarts } : {}),
    ...(departureLaunchReady && stationDispatchBoard
      ? { station_dispatch_board: stationDispatchBoard }
      : {}),
    ...(departureLaunchReady && !hasStationDispatchBoard && departureRecap
      ? { departure_recap: departureRecap }
      : {}),
    ...(departureLaunchReady && !hasStationDispatchBoard && departureInteractions.length > 0
      ? { departure_interactions: departureInteractions }
      : {}),
    ...(departureLaunchReady && !hasStationDispatchBoard && departureContactLeads.length > 0
      ? { departure_contact_leads: departureContactLeads }
      : {}),
    ...(pendingRoad ? { pending_road: pendingRoad } : {}),
    ...(journal.length > 0 ? { journal } : {}),
    ...(travelLog.length > 0 ? { travel_log: travelLog } : {}),
    ...(state.travelLog.length > travelLog.length ? { travel_log_truncated: true as const } : {}),
    progress: [state.visitedCount, state.worldTownCount],
    ...(renown.length > 0 ? { renown } : {}),
    ...(renownEntries.length > renown.length ? { renown_truncated: true as const } : {}),
    ...(completedArcs.length > 0 ? { completed_arcs: completedArcs } : {}),
    ...(completedArcIds.length > completedArcs.length
      ? { completed_arcs_truncated: true as const }
      : {}),
    id_counts: idPayload.id_counts,
    ...(idPayload.ids_truncated ? { ids_truncated: idPayload.ids_truncated } : {}),
    ids: idPayload.ids,
  };
}
