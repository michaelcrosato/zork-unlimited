import type {
  OverworldPendingRoadEncounter,
  OverworldRoadEncounterOption,
  OverworldSessionRoutePlan,
  OverworldView,
  TravelLogEntry,
} from "./session.js";
import { compactText } from "../core/compact_text.js";

export const OVERWORLD_COMPACT_JOURNAL_LIMIT = 5;
export const OVERWORLD_COMPACT_ROUTE_LIMIT = 8;
export const OVERWORLD_COMPACT_TRAVEL_LOG_LIMIT = 5;
export const OVERWORLD_COMPACT_ID_LIST_LIMIT = 16;
export const OVERWORLD_COMPACT_LABEL_CHAR_LIMIT = 96;
export const OVERWORLD_COMPACT_TITLE_CHAR_LIMIT = 140;
export const OVERWORLD_COMPACT_RISK_CHAR_LIMIT = 160;
export const OVERWORLD_COMPACT_VIEW_VERSION = 5 as const;

export type OverworldCompactRef = readonly [id: string, name: string];
export type OverworldCompactQuestRef = readonly [id: string, title: string];
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
export type OverworldCompactHiddenCounts = readonly [
  areas: number,
  jobs: number,
  sites: number,
  quests: number,
];
export type OverworldCompactProgress = readonly [visited: number, total: number];
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
export type OverworldCompactRenownEntry = readonly [region: string, value: number];
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
  | "started_quests"
  | "completed_quests"
  | "resolved_events";

const OVERWORLD_COMPACT_ID_KEYS: readonly OverworldCompactIdKey[] = [
  "discovered_towns",
  "discovered_areas",
  "visited_areas",
  "discovered_jobs",
  "completed_jobs",
  "discovered_sites",
  "explored_sites",
  "discovered_quests",
  "started_quests",
  "completed_quests",
  "resolved_events",
];

export type OverworldCompactFullIdMap = Record<OverworldCompactIdKey, string[]>;
export type OverworldCompactIdMap = Partial<OverworldCompactFullIdMap>;
export type OverworldCompactIdBucket = {
  ids: readonly string[];
  count: number;
};
export type OverworldCompactIdBuckets = Record<OverworldCompactIdKey, OverworldCompactIdBucket>;
export type OverworldCompactIdCounts = readonly [
  discovered_towns: number,
  discovered_areas: number,
  visited_areas: number,
  discovered_jobs: number,
  completed_jobs: number,
  discovered_sites: number,
  explored_sites: number,
  discovered_quests: number,
  started_quests: number,
  completed_quests: number,
  resolved_events: number,
];
export type OverworldCompactIdTruncation = OverworldCompactIdKey[];
export type OverworldCompactIdPayload = {
  ids: OverworldCompactIdMap;
  id_counts: OverworldCompactIdCounts;
  ids_truncated?: OverworldCompactIdTruncation;
};

export type OverworldCompactView = {
  v: typeof OVERWORLD_COMPACT_VIEW_VERSION;
  world: string;
  time: string;
  here: OverworldCompactHere;
  vitals: OverworldCompactVitals;
  hidden: OverworldCompactHiddenCounts;
  roads: OverworldCompactRoad[];
  area_routes?: OverworldCompactAreaRoute[];
  route_options: OverworldCompactRouteOption[];
  route_options_truncated?: true;
  areas: OverworldCompactRef[];
  poi: OverworldCompactRef[];
  contacts: OverworldCompactRef[];
  events: OverworldCompactRef[];
  jobs?: OverworldCompactRef[];
  sites?: OverworldCompactRef[];
  quests?: OverworldCompactQuestRef[];
  pending_road?: OverworldCompactRoadEncounter;
  journal?: OverworldCompactJournalEntry[];
  travel_log?: OverworldCompactTravelLogEntry[];
  travel_log_truncated?: true;
  progress: OverworldCompactProgress;
  renown?: OverworldCompactRenownEntry[];
  completed_arcs?: string[];
  id_counts: OverworldCompactIdCounts;
  ids_truncated?: OverworldCompactIdTruncation;
  ids: OverworldCompactIdMap;
};

export function compactOverworldLabel(value: string): string {
  return compactText(value, OVERWORLD_COMPACT_LABEL_CHAR_LIMIT);
}

export function compactOverworldTitle(value: string): string {
  return compactText(value, OVERWORLD_COMPACT_TITLE_CHAR_LIMIT);
}

export function compactOverworldRisk(value: string): string {
  return compactText(value, OVERWORLD_COMPACT_RISK_CHAR_LIMIT);
}

export function compactOverworldRef(value: { id: string; name: string }): OverworldCompactRef {
  return [value.id, compactOverworldLabel(value.name)];
}

export function compactOverworldTitleRef(value: {
  id: string;
  title: string;
}): OverworldCompactRef {
  return [value.id, compactOverworldTitle(value.title)];
}

export function compactOverworldQuestRef(value: {
  id: string;
  title: string;
}): OverworldCompactQuestRef {
  return [value.id, compactOverworldTitle(value.title)];
}

export function compactOverworldRefs(
  values: readonly { id: string; name: string }[],
): OverworldCompactRef[] {
  const refs: OverworldCompactRef[] = [];
  for (const value of values) refs.push(compactOverworldRef(value));
  return refs;
}

export function compactOverworldTitleRefs(
  values: readonly { id: string; title: string }[],
): OverworldCompactRef[] {
  const refs: OverworldCompactRef[] = [];
  for (const value of values) refs.push(compactOverworldTitleRef(value));
  return refs;
}

export function compactOverworldQuestRefs(
  values: readonly { id: string; title: string }[],
): OverworldCompactQuestRef[] {
  const refs: OverworldCompactQuestRef[] = [];
  for (const value of values) refs.push(compactOverworldQuestRef(value));
  return refs;
}

export function compactOverworldJournalEntries(
  values: readonly { kind: string; title: string; recordedAt: string }[],
): OverworldCompactJournalEntry[] {
  const journal: OverworldCompactJournalEntry[] = [];
  for (
    let index = 0;
    index < values.length && index < OVERWORLD_COMPACT_JOURNAL_LIMIT;
    index += 1
  ) {
    const entry = values[index]!;
    journal.push([entry.kind, compactOverworldTitle(entry.title), entry.recordedAt]);
  }
  return journal;
}

export function compactOverworldRenownEntries(
  values: readonly (readonly [region: string, value: number])[],
): OverworldCompactRenownEntry[] {
  const compact: OverworldCompactRenownEntry[] = [];
  for (const [region, value] of values) compact.push([compactOverworldLabel(region), value]);
  return compact;
}

export function compactRouteOption(plan: OverworldSessionRoutePlan): OverworldCompactRouteOption {
  const roadIds: string[] = [];
  for (const step of plan.steps) roadIds.push(step.edge.id);
  return [
    plan.destination.id,
    plan.estimate.elapsedMinutes,
    plan.estimate.suppliesNeeded,
    plan.estimate.fatigueAfter,
    roadIds,
  ];
}

export function compactPendingRoad(
  encounter: OverworldPendingRoadEncounter | null,
): OverworldCompactRoadEncounter | undefined {
  if (!encounter) return undefined;
  const options: OverworldCompactRoadEncounterOption[] = [];
  for (const option of encounter.options) {
    options.push([
      option.strategy,
      option.minutes,
      option.suppliesCost,
      option.fatigueGained,
      option.renownGained,
    ]);
  }
  return {
    id: encounter.id,
    edge: encounter.edgeId,
    event: [encounter.event.id, compactOverworldRisk(encounter.event.risk)],
    options,
  };
}

export function compactTravelLogEntry(entry: TravelLogEntry): OverworldCompactTravelLogEntry {
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
  const compacted: string[] = [];
  const limit = Math.min(values.length, OVERWORLD_COMPACT_ID_LIST_LIMIT);
  for (let index = 0; index < limit; index += 1) compacted.push(values[index]!);
  return compacted;
}

function cloneTupleList<T extends readonly unknown[]>(values: readonly T[]): T[] {
  const clone: T[] = [];
  for (const value of values) clone.push([...value] as unknown as T);
  return clone;
}

function cloneCompactRouteOptions(
  values: readonly OverworldCompactRouteOption[],
): OverworldCompactRouteOption[] {
  const clone: OverworldCompactRouteOption[] = [];
  for (const option of values) {
    clone.push([option[0], option[1], option[2], option[3], [...option[4]]]);
  }
  return clone;
}

function cloneCompactIdMap(ids: OverworldCompactIdMap): OverworldCompactIdMap {
  const clone: OverworldCompactIdMap = {};
  for (const key of OVERWORLD_COMPACT_ID_KEYS) {
    const values = ids[key];
    if (values && values.length > 0) clone[key] = [...values];
  }
  return clone;
}

export function compactIdPayload(values: OverworldCompactFullIdMap): OverworldCompactIdPayload {
  return compactIdPayloadFromBuckets({
    discovered_towns: {
      ids: values.discovered_towns,
      count: values.discovered_towns.length,
    },
    discovered_areas: {
      ids: values.discovered_areas,
      count: values.discovered_areas.length,
    },
    visited_areas: {
      ids: values.visited_areas,
      count: values.visited_areas.length,
    },
    discovered_jobs: {
      ids: values.discovered_jobs,
      count: values.discovered_jobs.length,
    },
    completed_jobs: {
      ids: values.completed_jobs,
      count: values.completed_jobs.length,
    },
    discovered_sites: {
      ids: values.discovered_sites,
      count: values.discovered_sites.length,
    },
    explored_sites: {
      ids: values.explored_sites,
      count: values.explored_sites.length,
    },
    discovered_quests: {
      ids: values.discovered_quests,
      count: values.discovered_quests.length,
    },
    started_quests: {
      ids: values.started_quests,
      count: values.started_quests.length,
    },
    completed_quests: {
      ids: values.completed_quests,
      count: values.completed_quests.length,
    },
    resolved_events: {
      ids: values.resolved_events,
      count: values.resolved_events.length,
    },
  });
}

export function compactIdPayloadFromBuckets(
  values: OverworldCompactIdBuckets,
): OverworldCompactIdPayload {
  const ids: OverworldCompactIdMap = {};
  const ids_truncated: OverworldCompactIdTruncation = [];
  for (const key of OVERWORLD_COMPACT_ID_KEYS) {
    const bucket = values[key];
    const compacted = compactIdList(bucket.ids);
    if (compacted.length > 0) ids[key] = compacted;
    if (bucket.count > compacted.length) ids_truncated.push(key);
  }
  const id_counts: OverworldCompactIdCounts = [
    values.discovered_towns.count,
    values.discovered_areas.count,
    values.visited_areas.count,
    values.discovered_jobs.count,
    values.completed_jobs.count,
    values.discovered_sites.count,
    values.explored_sites.count,
    values.discovered_quests.count,
    values.started_quests.count,
    values.completed_quests.count,
    values.resolved_events.count,
  ];
  return {
    ids,
    id_counts,
    ...(ids_truncated.length > 0 ? { ids_truncated } : {}),
  };
}

export function cloneOverworldCompactView(view: OverworldCompactView): OverworldCompactView {
  const clone: OverworldCompactView = {
    v: view.v,
    world: view.world,
    time: view.time,
    here: [...view.here] as OverworldCompactHere,
    vitals: [...view.vitals] as OverworldCompactVitals,
    hidden: [...view.hidden] as OverworldCompactHiddenCounts,
    roads: cloneTupleList(view.roads),
    route_options: cloneCompactRouteOptions(view.route_options),
    areas: cloneTupleList(view.areas),
    poi: cloneTupleList(view.poi),
    contacts: cloneTupleList(view.contacts),
    events: cloneTupleList(view.events),
    progress: [...view.progress] as OverworldCompactProgress,
    id_counts: [...view.id_counts] as OverworldCompactIdCounts,
    ids: cloneCompactIdMap(view.ids),
  };

  if (view.area_routes) clone.area_routes = cloneTupleList(view.area_routes);
  if (view.route_options_truncated) clone.route_options_truncated = true;
  if (view.jobs) clone.jobs = cloneTupleList(view.jobs);
  if (view.sites) clone.sites = cloneTupleList(view.sites);
  if (view.quests) clone.quests = cloneTupleList(view.quests);
  if (view.pending_road) {
    clone.pending_road = {
      ...view.pending_road,
      event: [...view.pending_road.event] as readonly [id: string, risk: string],
      options: cloneTupleList(view.pending_road.options),
    };
  }
  if (view.journal) clone.journal = cloneTupleList(view.journal);
  if (view.travel_log) clone.travel_log = cloneTupleList(view.travel_log);
  if (view.travel_log_truncated) clone.travel_log_truncated = true;
  if (view.renown) clone.renown = cloneTupleList(view.renown);
  if (view.completed_arcs) clone.completed_arcs = [...view.completed_arcs];
  if (view.ids_truncated) clone.ids_truncated = [...view.ids_truncated];

  return clone;
}

export function compactOverworldView(view: OverworldView): OverworldCompactView {
  const routeOptions = view.routeOptions
    .slice(0, OVERWORLD_COMPACT_ROUTE_LIMIT)
    .map(compactRouteOption);
  const travelLog = view.log
    .slice(0, OVERWORLD_COMPACT_TRAVEL_LOG_LIMIT)
    .map(compactTravelLogEntry);
  const areaRoutes = view.areaExits.map(
    (exit) => [exit.id, exit.destination.id, exit.travel_minutes] as const,
  );
  const jobs = compactOverworldTitleRefs(view.jobs);
  const sites = compactOverworldTitleRefs(view.sites);
  const quests = compactOverworldQuestRefs(view.quests);
  const journal = compactOverworldJournalEntries(view.journal);
  const renown = compactOverworldRenownEntries(
    Object.entries(view.regionRenown).sort(([left], [right]) => left.localeCompare(right)),
  );
  const completedArcs = view.completedRegionalArcIds;
  const idPayload = compactIdPayload({
    discovered_towns: view.discovered.map((town) => town.id),
    discovered_areas: view.discoveredAreaIds,
    visited_areas: view.visitedAreaIds,
    discovered_jobs: view.discoveredJobIds,
    completed_jobs: view.completedJobIds,
    discovered_sites: view.discoveredSiteIds,
    explored_sites: view.exploredSiteIds,
    discovered_quests: view.discoveredQuestIds,
    started_quests: view.startedQuestIds,
    completed_quests: view.completedQuestIds,
    resolved_events: view.resolvedEventIds,
  });
  const pendingRoad = compactPendingRoad(view.pendingRoadEncounter);
  const routeByDestination = new Map(
    view.routeOptions.map((plan) => [plan.destination.id, plan] as const),
  );
  return {
    v: OVERWORLD_COMPACT_VIEW_VERSION,
    world: compactOverworldLabel(view.world),
    time: view.timeLabel,
    here: [
      view.current.id,
      compactOverworldLabel(view.current.name),
      compactOverworldLabel(view.current.region),
      view.currentArea?.id ?? null,
      view.currentArea ? compactOverworldLabel(view.currentArea.name) : null,
    ],
    vitals: [view.supplies, view.maxSupplies, view.fatigue, view.travelCondition],
    hidden: [
      view.hiddenAreaCount,
      view.hiddenJobCount,
      view.hiddenSiteCount,
      view.hiddenQuestCount,
    ],
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
    ...(areaRoutes.length > 0 ? { area_routes: areaRoutes } : {}),
    route_options: routeOptions,
    ...(view.routeOptions.length > routeOptions.length
      ? { route_options_truncated: true as const }
      : {}),
    areas: compactOverworldRefs(view.areas),
    poi: compactOverworldTitleRefs(view.pois),
    contacts: compactOverworldRefs(view.characters),
    events: compactOverworldTitleRefs(view.events),
    ...(jobs.length > 0 ? { jobs } : {}),
    ...(sites.length > 0 ? { sites } : {}),
    ...(quests.length > 0 ? { quests } : {}),
    ...(pendingRoad ? { pending_road: pendingRoad } : {}),
    ...(journal.length > 0 ? { journal } : {}),
    ...(travelLog.length > 0 ? { travel_log: travelLog } : {}),
    ...(view.log.length > travelLog.length ? { travel_log_truncated: true as const } : {}),
    progress: [view.visitedCount, view.totalTowns],
    ...(renown.length > 0 ? { renown } : {}),
    ...(completedArcs.length > 0 ? { completed_arcs: completedArcs } : {}),
    id_counts: idPayload.id_counts,
    ...(idPayload.ids_truncated ? { ids_truncated: idPayload.ids_truncated } : {}),
    ids: idPayload.ids,
  };
}
