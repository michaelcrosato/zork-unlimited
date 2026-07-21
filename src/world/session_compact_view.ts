import {
  OVERWORLD_COMPACT_LOCAL_REF_LIMIT,
  OVERWORLD_COMPACT_VIEW_VERSION,
  compactCampaignServiceOffers,
  compactCampaignCharacterView,
  compactOverworldEventChoices,
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
  compactOverworldDepartureInteractions,
  type OverworldDepartureInteraction,
} from "./session_departure_interactions.js";

export type OverworldSessionCompactViewState = {
  character: CampaignCharacterView;
  worldName: string;
  worldTownCount: number;
  current: OverworldNode;
  currentArea: OverworldArea | null;
  minutes: number;
  supplies: number;
  fatigue: number;
  serviceOffers: readonly CampaignServiceOffer[];
  departureInteractions?: readonly OverworldDepartureInteraction[];
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
  const quests = compactOverworldQuestRefs(state.quests);
  const questStarts = compactOverworldQuestStarts(state.questStarts);
  const pendingRoad = compactPendingRoad(state.pendingRoadEncounter);
  const journal = compactOverworldJournalEntries(state.journalEntries);
  const travelLog = compactOverworldTravelLog(state.travelLog);
  const renownEntries = sortedNumberMap(state.regionRenown);
  const renown = compactOverworldRenownEntries(renownEntries);
  const completedArcIds = sortedStringSet(state.completedRegionalArcIds);
  const completedArcs = compactOverworldCompletedArcs(completedArcIds);
  const roads = compactOverworldRoads(state.roads, state.routeOptions, state.fatigue);
  const areas = compactOverworldRefs(state.areas);
  const poi = compactOverworldTitleRefs(state.poi);
  const contacts = compactOverworldRefs(state.contacts);
  const events = compactOverworldTitleRefs(state.events);
  const visibleEvents = state.events.slice(0, OVERWORLD_COMPACT_LOCAL_REF_LIMIT);
  const visibleEventIds = new Set(visibleEvents.map((event) => event.id));
  const eventScenes = compactOverworldEventScenes(visibleEvents);
  const eventChoices = compactOverworldEventChoices(
    (state.eventChoices ?? []).filter(([eventId]) => visibleEventIds.has(eventId)),
  );
  const serviceOffers = compactCampaignServiceOffers(state.serviceOffers);
  const departureInteractions = compactOverworldDepartureInteractions(
    state.departureInteractions ?? [],
  );
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
    ...(departureInteractions.length > 0 ? { departure_interactions: departureInteractions } : {}),
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
    ...(eventScenes.length > 0 ? { event_scenes: eventScenes } : {}),
    ...(eventChoices.length > 0 ? { event_choices: eventChoices } : {}),
    ...(localRefsTruncated.length > 0 ? { local_refs_truncated: localRefsTruncated } : {}),
    ...(jobs.length > 0 ? { jobs } : {}),
    ...(jobScenes.length > 0 ? { job_scenes: jobScenes } : {}),
    ...(jobChoices.length > 0 ? { job_choices: jobChoices } : {}),
    ...(rememberedJobs.length > 0 ? { remembered_jobs: rememberedJobs } : {}),
    ...(sites.length > 0 ? { sites } : {}),
    ...(quests.length > 0 ? { quests } : {}),
    ...(questStarts.length > 0 ? { quest_starts: questStarts } : {}),
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
