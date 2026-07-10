import {
  OVERWORLD_COMPACT_VIEW_VERSION,
  compactLocalRefTruncation,
  compactOverworldAreaRoutes,
  compactOverworldCompletedArcs,
  compactOverworldJournalEntries,
  compactOverworldLabel,
  compactOverworldJobLeadRefs,
  compactOverworldMovementTruncated,
  compactOverworldQuestRefs,
  compactOverworldRefs,
  compactOverworldRenownEntries,
  compactOverworldRoads,
  compactOverworldRouteOptions,
  compactOverworldRoutePathsTruncated,
  compactOverworldTitleRefs,
  compactOverworldTravelLog,
  compactPendingRoad,
  type OverworldCompactView,
} from "./compact_view.js";
import type {
  OverworldArea,
  OverworldAreaExit,
  OverworldCharacter,
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

export type OverworldSessionCompactViewState = {
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
  areas: readonly OverworldArea[];
  poi: readonly OverworldPoi[];
  contacts: readonly OverworldCharacter[];
  events: readonly OverworldLocalEvent[];
  jobs: readonly OverworldLocalJob[];
  rememberedJobs: readonly OverworldLocalJob[];
  sites: readonly OverworldExplorationSite[];
  quests: readonly OverworldQuestView[];
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
  const jobs = compactOverworldTitleRefs(state.jobs);
  const rememberedJobs = compactOverworldJobLeadRefs(state.rememberedJobs);
  const sites = compactOverworldTitleRefs(state.sites);
  const quests = compactOverworldQuestRefs(state.quests);
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
    ...(localRefsTruncated.length > 0 ? { local_refs_truncated: localRefsTruncated } : {}),
    ...(jobs.length > 0 ? { jobs } : {}),
    ...(rememberedJobs.length > 0 ? { remembered_jobs: rememberedJobs } : {}),
    ...(sites.length > 0 ? { sites } : {}),
    ...(quests.length > 0 ? { quests } : {}),
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
