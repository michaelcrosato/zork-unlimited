import type {
  OverworldPendingRoadEncounter,
  OverworldRoadEncounterOption,
  OverworldSessionRoutePlan,
  OverworldView,
  TravelLogEntry,
} from "./session.js";

const COMPACT_JOURNAL_LIMIT = 5;
const COMPACT_ROUTE_LIMIT = 8;
const COMPACT_TRAVEL_LOG_LIMIT = 5;
const COMPACT_ID_LIST_LIMIT = 16;

export type OverworldCompactRef = readonly [id: string, name: string];
export type OverworldCompactQuestRef = readonly [id: string, title: string, pack: string];
export type OverworldCompactHere = readonly [
  id: string,
  name: string,
  region: string,
  areaId: string | null,
  areaName: string | null,
];
export type OverworldCompactVitals = readonly [
  supplies: number,
  maxSupplies: number,
  fatigue: number,
  condition: string,
];
export type OverworldCompactRoad = readonly [
  roadId: string,
  toId: string,
  minutes: number,
  suppliesNeeded: number,
  fatigueAfter: number,
];
export type OverworldCompactAreaRoute = readonly [
  routeId: string,
  toAreaId: string,
  minutes: number,
];
export type OverworldCompactRouteOption = readonly [
  toId: string,
  elapsedMinutes: number,
  suppliesNeeded: number,
  fatigueAfter: number,
  roadIds: readonly string[],
];
export type OverworldCompactRoadEncounterOption = readonly [
  strategy: OverworldRoadEncounterOption["strategy"],
  minutes: number,
  suppliesCost: number,
  fatigueGained: number,
  renownGained: number,
];
export type OverworldCompactRoadEncounter = {
  id: string;
  edge: string;
  event: readonly [id: string, risk: string];
  options: readonly OverworldCompactRoadEncounterOption[];
};
export type OverworldCompactJournalEntry = readonly [
  kind: string,
  title: string,
  recordedAt: string,
];
export type OverworldCompactTravelLogEntry = readonly [
  edgeId: string,
  fromId: string,
  toId: string,
  minutes: number,
  suppliesUsed: number,
  fatigueGained: number,
  roadEventId: string | null,
];
export type OverworldCompactIdKey =
  | "discovered_towns"
  | "discovered_areas"
  | "visited_areas"
  | "discovered_jobs"
  | "completed_jobs"
  | "discovered_sites"
  | "explored_sites"
  | "discovered_quests"
  | "resolved_events";
export type OverworldCompactIdMap = Record<OverworldCompactIdKey, string[]>;
export type OverworldCompactIdCounts = readonly [
  discovered_towns: number,
  discovered_areas: number,
  visited_areas: number,
  discovered_jobs: number,
  completed_jobs: number,
  discovered_sites: number,
  explored_sites: number,
  discovered_quests: number,
  resolved_events: number,
];
export type OverworldCompactIdTruncation = OverworldCompactIdKey[];

export type OverworldCompactView = {
  v: 1;
  world: string;
  time: string;
  here: OverworldCompactHere;
  vitals: OverworldCompactVitals;
  hidden: {
    areas: number;
    jobs: number;
    sites: number;
    quests: number;
  };
  roads: OverworldCompactRoad[];
  area_routes: OverworldCompactAreaRoute[];
  route_options: OverworldCompactRouteOption[];
  route_options_truncated: boolean;
  areas: OverworldCompactRef[];
  poi: OverworldCompactRef[];
  contacts: OverworldCompactRef[];
  events: OverworldCompactRef[];
  jobs: OverworldCompactRef[];
  sites: OverworldCompactRef[];
  quests: OverworldCompactQuestRef[];
  pending_road: OverworldCompactRoadEncounter | null;
  journal: OverworldCompactJournalEntry[];
  travel_log: OverworldCompactTravelLogEntry[];
  travel_log_truncated: boolean;
  progress: {
    towns: readonly [visited: number, total: number];
    renown: readonly (readonly [region: string, value: number])[];
    completed_arcs: string[];
  };
  id_counts: OverworldCompactIdCounts;
  ids_truncated: OverworldCompactIdTruncation;
  ids: OverworldCompactIdMap;
};

function ref(value: { id: string; name: string }): OverworldCompactRef {
  return [value.id, value.name];
}

function titledRef(value: { id: string; title: string }): OverworldCompactRef {
  return [value.id, value.title];
}

function compactRouteOption(plan: OverworldSessionRoutePlan): OverworldCompactRouteOption {
  return [
    plan.destination.id,
    plan.estimate.elapsedMinutes,
    plan.estimate.suppliesNeeded,
    plan.estimate.fatigueAfter,
    plan.steps.map((step) => step.edge.id),
  ];
}

function compactPendingRoad(
  encounter: OverworldPendingRoadEncounter | null,
): OverworldCompactRoadEncounter | null {
  if (!encounter) return null;
  return {
    id: encounter.id,
    edge: encounter.edgeId,
    event: [encounter.event.id, encounter.event.risk],
    options: encounter.options.map((option) => [
      option.strategy,
      option.minutes,
      option.suppliesCost,
      option.fatigueGained,
      option.renownGained,
    ]),
  };
}

function compactTravelLogEntry(entry: TravelLogEntry): OverworldCompactTravelLogEntry {
  return [
    entry.edgeId,
    entry.fromId,
    entry.toId,
    entry.minutes,
    entry.suppliesUsed,
    entry.fatigueGained,
    entry.roadEvent?.id ?? null,
  ];
}

function compactIdList(values: readonly string[]): string[] {
  return values.slice(0, COMPACT_ID_LIST_LIMIT);
}

function compactIdPayload(values: OverworldCompactIdMap): {
  ids: OverworldCompactIdMap;
  id_counts: OverworldCompactIdCounts;
  ids_truncated: OverworldCompactIdTruncation;
} {
  const ids: OverworldCompactIdMap = {
    discovered_towns: compactIdList(values.discovered_towns),
    discovered_areas: compactIdList(values.discovered_areas),
    visited_areas: compactIdList(values.visited_areas),
    discovered_jobs: compactIdList(values.discovered_jobs),
    completed_jobs: compactIdList(values.completed_jobs),
    discovered_sites: compactIdList(values.discovered_sites),
    explored_sites: compactIdList(values.explored_sites),
    discovered_quests: compactIdList(values.discovered_quests),
    resolved_events: compactIdList(values.resolved_events),
  };
  const id_counts: OverworldCompactIdCounts = [
    values.discovered_towns.length,
    values.discovered_areas.length,
    values.visited_areas.length,
    values.discovered_jobs.length,
    values.completed_jobs.length,
    values.discovered_sites.length,
    values.explored_sites.length,
    values.discovered_quests.length,
    values.resolved_events.length,
  ];
  const ids_truncated: OverworldCompactIdTruncation = [];
  if (values.discovered_towns.length > COMPACT_ID_LIST_LIMIT)
    ids_truncated.push("discovered_towns");
  if (values.discovered_areas.length > COMPACT_ID_LIST_LIMIT)
    ids_truncated.push("discovered_areas");
  if (values.visited_areas.length > COMPACT_ID_LIST_LIMIT) ids_truncated.push("visited_areas");
  if (values.discovered_jobs.length > COMPACT_ID_LIST_LIMIT) ids_truncated.push("discovered_jobs");
  if (values.completed_jobs.length > COMPACT_ID_LIST_LIMIT) ids_truncated.push("completed_jobs");
  if (values.discovered_sites.length > COMPACT_ID_LIST_LIMIT)
    ids_truncated.push("discovered_sites");
  if (values.explored_sites.length > COMPACT_ID_LIST_LIMIT) ids_truncated.push("explored_sites");
  if (values.discovered_quests.length > COMPACT_ID_LIST_LIMIT)
    ids_truncated.push("discovered_quests");
  if (values.resolved_events.length > COMPACT_ID_LIST_LIMIT) ids_truncated.push("resolved_events");
  return { ids, id_counts, ids_truncated };
}

export function compactOverworldView(view: OverworldView): OverworldCompactView {
  const routeOptions = view.routeOptions.slice(0, COMPACT_ROUTE_LIMIT).map(compactRouteOption);
  const travelLog = view.log.slice(0, COMPACT_TRAVEL_LOG_LIMIT).map(compactTravelLogEntry);
  const idPayload = compactIdPayload({
    discovered_towns: view.discovered.map((town) => town.id),
    discovered_areas: view.discoveredAreaIds,
    visited_areas: view.visitedAreaIds,
    discovered_jobs: view.discoveredJobIds,
    completed_jobs: view.completedJobIds,
    discovered_sites: view.discoveredSiteIds,
    explored_sites: view.exploredSiteIds,
    discovered_quests: view.discoveredQuestIds,
    resolved_events: view.resolvedEventIds,
  });
  const routeByDestination = new Map(
    view.routeOptions.map((plan) => [plan.destination.id, plan] as const),
  );
  return {
    v: 1,
    world: view.world,
    time: view.timeLabel,
    here: [
      view.current.id,
      view.current.name,
      view.current.region,
      view.currentArea?.id ?? null,
      view.currentArea?.name ?? null,
    ],
    vitals: [view.supplies, view.maxSupplies, view.fatigue, view.travelCondition],
    hidden: {
      areas: view.hiddenAreaCount,
      jobs: view.hiddenJobCount,
      sites: view.hiddenSiteCount,
      quests: view.hiddenQuestCount,
    },
    roads: view.exits.map((exit) => {
      const plan = routeByDestination.get(exit.destination.id);
      return [
        exit.id,
        exit.destination.id,
        plan?.estimate.elapsedMinutes ?? exit.travel_minutes,
        plan?.estimate.suppliesNeeded ?? 0,
        plan?.estimate.fatigueAfter ?? view.fatigue,
      ];
    }),
    area_routes: view.areaExits.map((exit) => [exit.id, exit.destination.id, exit.travel_minutes]),
    route_options: routeOptions,
    route_options_truncated: view.routeOptions.length > routeOptions.length,
    areas: view.areas.map(ref),
    poi: view.pois.map(titledRef),
    contacts: view.characters.map((character) => [character.id, character.name]),
    events: view.events.map(titledRef),
    jobs: view.jobs.map(titledRef),
    sites: view.sites.map(titledRef),
    quests: view.quests.map((quest) => [quest.id, quest.title, quest.pack]),
    pending_road: compactPendingRoad(view.pendingRoadEncounter),
    journal: view.journal
      .slice(0, COMPACT_JOURNAL_LIMIT)
      .map((entry) => [entry.kind, entry.title, entry.recordedAt]),
    travel_log: travelLog,
    travel_log_truncated: view.log.length > travelLog.length,
    progress: {
      towns: [view.visitedCount, view.totalTowns],
      renown: Object.entries(view.regionRenown).sort(([left], [right]) =>
        left.localeCompare(right),
      ),
      completed_arcs: view.completedRegionalArcIds,
    },
    id_counts: idPayload.id_counts,
    ids_truncated: idPayload.ids_truncated,
    ids: idPayload.ids,
  };
}
