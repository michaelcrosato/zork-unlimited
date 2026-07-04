import {
  OVERWORLD_COMPACT_VIEW_VERSION,
  compactOverworldAreaRoutes,
  compactOverworldJournalEntries,
  compactOverworldLabel,
  compactOverworldQuestRefs,
  compactOverworldRefs,
  compactOverworldRenownEntries,
  compactOverworldRoads,
  compactOverworldRouteOptions,
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
  const compactRouteOptions = compactOverworldRouteOptions(state.routeOptions);
  const idPayload = compactOverworldSessionIdPayload(state.ids);
  const jobs = compactOverworldTitleRefs(state.jobs);
  const sites = compactOverworldTitleRefs(state.sites);
  const quests = compactOverworldQuestRefs(state.quests);
  const pendingRoad = compactPendingRoad(state.pendingRoadEncounter);
  const journal = compactOverworldJournalEntries(state.journalEntries);
  const travelLog = compactOverworldTravelLog(state.travelLog);
  const renown = compactOverworldRenownEntries(sortedNumberMap(state.regionRenown));
  const completedArcs = sortedStringSet(state.completedRegionalArcIds);
  const roads = compactOverworldRoads(state.roads, state.routeOptions, state.fatigue);
  const areas = compactOverworldRefs(state.areas);
  const poi = compactOverworldTitleRefs(state.poi);
  const contacts = compactOverworldRefs(state.contacts);
  const events = compactOverworldTitleRefs(state.events);

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
    ...(areaRoutes.length > 0 ? { area_routes: areaRoutes } : {}),
    route_options: compactRouteOptions,
    ...(state.routeOptions.length > compactRouteOptions.length
      ? { route_options_truncated: true as const }
      : {}),
    areas,
    poi,
    contacts,
    events,
    ...(jobs.length > 0 ? { jobs } : {}),
    ...(sites.length > 0 ? { sites } : {}),
    ...(quests.length > 0 ? { quests } : {}),
    ...(pendingRoad ? { pending_road: pendingRoad } : {}),
    ...(journal.length > 0 ? { journal } : {}),
    ...(travelLog.length > 0 ? { travel_log: travelLog } : {}),
    ...(state.travelLog.length > travelLog.length ? { travel_log_truncated: true as const } : {}),
    progress: [state.visitedCount, state.worldTownCount],
    ...(renown.length > 0 ? { renown } : {}),
    ...(completedArcs.length > 0 ? { completed_arcs: completedArcs } : {}),
    id_counts: idPayload.id_counts,
    ...(idPayload.ids_truncated ? { ids_truncated: idPayload.ids_truncated } : {}),
    ids: idPayload.ids,
  };
}
