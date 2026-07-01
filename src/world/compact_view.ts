import type {
  OverworldPendingRoadEncounter,
  OverworldRoadEncounterOption,
  OverworldSessionRoutePlan,
  OverworldView,
} from "./session.js";

const COMPACT_JOURNAL_LIMIT = 5;
const COMPACT_ROUTE_LIMIT = 8;

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
  toName: string,
  minutes: number,
  suppliesNeeded: number,
  fatigueAfter: number,
];
export type OverworldCompactAreaRoute = readonly [
  routeId: string,
  toAreaId: string,
  toAreaName: string,
  minutes: number,
];
export type OverworldCompactRouteOption = readonly [
  toId: string,
  toName: string,
  elapsedMinutes: number,
  suppliesNeeded: number,
  fatigueAfter: number,
  roadIds: readonly string[],
];
export type OverworldCompactRoadEncounterOption = readonly [
  strategy: OverworldRoadEncounterOption["strategy"],
  label: string,
  minutes: number,
  suppliesCost: number,
  fatigueGained: number,
  renownGained: number,
];
export type OverworldCompactRoadEncounter = {
  id: string;
  edge: string;
  event: readonly [id: string, title: string, risk: string];
  options: readonly OverworldCompactRoadEncounterOption[];
};
export type OverworldCompactJournalEntry = readonly [
  kind: string,
  title: string,
  recordedAt: string,
];

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
  progress: {
    towns: readonly [visited: number, total: number];
    renown: readonly (readonly [region: string, value: number])[];
    completed_arcs: string[];
  };
  ids: {
    discovered_towns: string[];
    discovered_areas: string[];
    visited_areas: string[];
    discovered_jobs: string[];
    completed_jobs: string[];
    discovered_sites: string[];
    explored_sites: string[];
    discovered_quests: string[];
    resolved_events: string[];
  };
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
    plan.destination.name,
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
    event: [encounter.event.id, encounter.event.title, encounter.event.risk],
    options: encounter.options.map((option) => [
      option.strategy,
      option.label,
      option.minutes,
      option.suppliesCost,
      option.fatigueGained,
      option.renownGained,
    ]),
  };
}

export function compactOverworldView(view: OverworldView): OverworldCompactView {
  const routeOptions = view.routeOptions.slice(0, COMPACT_ROUTE_LIMIT).map(compactRouteOption);
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
        exit.destination.name,
        plan?.estimate.elapsedMinutes ?? exit.travel_minutes,
        plan?.estimate.suppliesNeeded ?? 0,
        plan?.estimate.fatigueAfter ?? view.fatigue,
      ];
    }),
    area_routes: view.areaExits.map((exit) => [
      exit.id,
      exit.destination.id,
      exit.destination.name,
      exit.travel_minutes,
    ]),
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
    progress: {
      towns: [view.visitedCount, view.totalTowns],
      renown: Object.entries(view.regionRenown).sort(([left], [right]) =>
        left.localeCompare(right),
      ),
      completed_arcs: view.completedRegionalArcIds,
    },
    ids: {
      discovered_towns: view.discovered.map((town) => town.id),
      discovered_areas: view.discoveredAreaIds,
      visited_areas: view.visitedAreaIds,
      discovered_jobs: view.discoveredJobIds,
      completed_jobs: view.completedJobIds,
      discovered_sites: view.discoveredSiteIds,
      explored_sites: view.exploredSiteIds,
      discovered_quests: view.discoveredQuestIds,
      resolved_events: view.resolvedEventIds,
    },
  };
}
