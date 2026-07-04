import { hashState } from "../core/hash.js";
import {
  overworldNodesById,
  type OverworldArea,
  type OverworldAreaExit,
  type OverworldCharacter,
  type OverworldEdge,
  type OverworldExit,
  type OverworldExplorationSite,
  type OverworldLocalJob,
  type OverworldLocalEvent,
  type OverworldManifest,
  type OverworldNode,
  type OverworldPoi,
  type OverworldQuest,
  type OverworldRegionalArc,
  type OverworldRoutePlan,
  type OverworldRouteStep,
  type OverworldRoadEvent,
} from "./overworld.js";
import {
  describeOverworldAreaAction,
  describeOverworldContactAction,
  describeOverworldEventAction,
  describeOverworldJobAction,
  describeOverworldPoiAction,
  describeOverworldSiteAction,
  type OverworldLocalActionDescriptor,
  type OverworldLocalActionKind,
} from "./local_actions.js";
import {
  OVERWORLD_COMPACT_ROUTE_LIMIT,
  OVERWORLD_COMPACT_TRAVEL_LOG_LIMIT,
  OVERWORLD_COMPACT_VIEW_VERSION,
  compactIdPayloadFromBuckets,
  cloneOverworldCompactView,
  compactOverworldJournalEntries,
  compactOverworldLabel,
  compactOverworldQuestRefs,
  compactOverworldRefs,
  compactOverworldRenownEntries,
  compactOverworldTitleRefs,
  compactPendingRoad,
  compactRouteOption,
  compactTravelLogEntry,
  type OverworldCompactAreaRoute,
  type OverworldCompactRoad,
  type OverworldCompactRouteOption,
  type OverworldCompactTravelLogEntry,
  type OverworldCompactView,
} from "./compact_view.js";
import {
  assertKnownIds,
  assertUniqueTupleMap,
  compactSortedStringSet,
  compactSortedTownIdsByPopulation,
  idIndex,
  indexedList,
  keyedIndex,
  nestedIdIndex,
  pushIndexed,
  replaceStringSet,
  sortedIndex,
  sortedNumberMap,
  sortedNumberRecord,
  sortedStringMap,
  sortedStringSet,
} from "./session_collections.js";
import {
  OVERWORLD_MAX_FATIGUE as MAX_FATIGUE,
  OVERWORLD_MAX_SUPPLIES as MAX_SUPPLIES,
  OVERWORLD_STARTING_MINUTES as STARTING_MINUTES,
  OVERWORLD_STARTING_SUPPLIES as STARTING_SUPPLIES,
  roadEncounterOptionFor,
  roadEncounterOptionsFor,
  travelCondition,
  travelDelayMinutes,
  travelFatigueGain,
  travelSupplyCost,
  type OverworldRoadEncounterOption,
  type OverworldRoadEncounterStrategy,
} from "./travel_mechanics.js";
import {
  parseRoadJournalId,
  parseServiceJournalId,
  parseTimeLabel,
  roadResolutionKey,
  timeLabel,
  type RoadJournalIdParts,
  type ServiceJournalIdParts,
} from "./session_journal_codec.js";
import {
  buildOverworldSnapshotManifestIndex,
  type OverworldSnapshotManifestIndex,
} from "./session_manifest_index.js";
import {
  OVERWORLD_SESSION_SAVE_VERSION,
  OverworldSessionSnapshotSchema,
  cloneJournalEntries,
  cloneOverworldSessionSnapshot,
  snapshotTravelLogEntries,
  type OverworldJournalEntry,
  type OverworldPendingRoadEncounter,
  type OverworldPendingRoadEncounterSnapshot,
  type OverworldSessionSnapshot,
  type TravelLogEntry,
  type TravelLogEntrySnapshot,
} from "./session_snapshot.js";

export type {
  OverworldRoadEncounterOption,
  OverworldRoadEncounterStrategy,
} from "./travel_mechanics.js";
export {
  OVERWORLD_SESSION_SAVE_VERSION,
  OverworldSessionSnapshotSchema,
} from "./session_snapshot.js";
export type {
  OverworldJournalEntry,
  OverworldPendingRoadEncounter,
  OverworldPendingRoadEncounterSnapshot,
  OverworldSessionSnapshot,
  TravelLogEntry,
  TravelLogEntrySnapshot,
} from "./session_snapshot.js";

export type OverworldAreaTravelResult = {
  from: OverworldArea;
  to: OverworldArea;
  route: string;
  minutes: number;
  arrivedAt: string;
};

export type OverworldActionResult = {
  minutes: number;
  alreadyKnown: boolean;
  entry: OverworldJournalEntry;
  discoveredAreas?: OverworldArea[];
  discoveredJobs?: OverworldLocalJob[];
  discoveredSites?: OverworldExplorationSite[];
  discoveredQuests?: OverworldQuestView[];
};

export type OverworldQuestCompletionResult = {
  minutes: number;
  alreadyKnown: boolean;
  quest: OverworldQuestView;
  endingId: string;
  endingTitle: string;
  entry: OverworldJournalEntry;
};

export type OverworldServiceResult = {
  action: "resupply" | "rest";
  minutes: number;
  changed: boolean;
  suppliesBefore: number;
  suppliesAfter: number;
  fatigueBefore: number;
  fatigueAfter: number;
  message: string;
  entry: OverworldJournalEntry | null;
};

export type OverworldRoadEncounterResult = {
  strategy: OverworldRoadEncounterStrategy;
  minutes: number;
  suppliesUsed: number;
  fatigueGained: number;
  renownGained: number;
  encounter: OverworldPendingRoadEncounter;
  entry: OverworldJournalEntry;
};

export type OverworldRouteEstimate = {
  baseMinutes: number;
  delayMinutes: number;
  elapsedMinutes: number;
  suppliesNeeded: number;
  suppliesUsed: number;
  supplyDeficit: number;
  suppliesAfter: number;
  fatigueGained: number;
  fatigueAfter: number;
  travelConditionAfter: string;
};

export type OverworldSessionRoutePlan = OverworldRoutePlan & {
  estimate: OverworldRouteEstimate;
};

export type OverworldRegionalArcProgress = {
  id: string;
  region: string;
  title: string;
  summary: string;
  requiredResolutions: number;
  resolvedInRegion: number;
  anchorTowns: OverworldNode[];
  resolvedAnchorTowns: OverworldNode[];
  completed: boolean;
  reward: string;
};

export type OverworldQuestView = {
  id: string;
  title: string;
  home: string;
  area: string;
  discovery: string;
  visibility: OverworldQuest["visibility"];
};

export type OverworldView = {
  world: string;
  timeLabel: string;
  current: OverworldNode;
  currentArea: OverworldArea | null;
  areaExits: OverworldAreaExit[];
  exits: OverworldExit[];
  areas: OverworldArea[];
  hiddenAreaCount: number;
  pois: OverworldPoi[];
  characters: OverworldCharacter[];
  events: OverworldLocalEvent[];
  jobs: OverworldLocalJob[];
  hiddenJobCount: number;
  sites: OverworldExplorationSite[];
  hiddenSiteCount: number;
  quests: OverworldQuestView[];
  hiddenQuestCount: number;
  routeOptions: OverworldSessionRoutePlan[];
  discovered: OverworldNode[];
  visitedCount: number;
  totalTowns: number;
  supplies: number;
  maxSupplies: number;
  fatigue: number;
  travelCondition: string;
  journal: OverworldJournalEntry[];
  discoveredSiteIds: string[];
  discoveredAreaIds: string[];
  discoveredJobIds: string[];
  visitedAreaIds: string[];
  completedJobIds: string[];
  discoveredQuestIds: string[];
  startedQuestIds: string[];
  completedQuestIds: string[];
  exploredSiteIds: string[];
  resolvedEventIds: string[];
  regionRenown: Record<string, number>;
  regionalArcs: OverworldRegionalArcProgress[];
  completedRegionalArcIds: string[];
  pendingRoadEncounter: OverworldPendingRoadEncounter | null;
  log: TravelLogEntry[];
};

function questView(quest: OverworldQuest): OverworldQuestView {
  return {
    id: quest.id,
    title: quest.title,
    home: quest.home,
    area: quest.area,
    discovery: quest.discovery,
    visibility: quest.visibility,
  };
}

type OverworldJournalSourceIndex = {
  arcIds: ReadonlySet<string>;
  arcRegionNames: ReadonlyMap<string, string>;
  areaIds: ReadonlySet<string>;
  areaTownNames: ReadonlyMap<string, string>;
  characterIds: ReadonlySet<string>;
  characterTownNames: ReadonlyMap<string, string>;
  edgeIds: ReadonlySet<string>;
  eventIds: ReadonlySet<string>;
  eventTownNames: ReadonlyMap<string, string>;
  jobIds: ReadonlySet<string>;
  jobTownNames: ReadonlyMap<string, string>;
  poiIds: ReadonlySet<string>;
  poiTownNames: ReadonlyMap<string, string>;
  questIds: ReadonlySet<string>;
  questTownNames: ReadonlyMap<string, string>;
  regionNames: ReadonlySet<string>;
  siteIds: ReadonlySet<string>;
  siteTownNames: ReadonlyMap<string, string>;
  townNames: ReadonlySet<string>;
  travelLogArrivals: ReadonlySet<string>;
  travelLogTownByArrival: ReadonlyMap<string, string>;
};

type OverworldJournalTimelineSourceIndex = OverworldJournalSourceIndex &
  OverworldResolutionProofIndex;

type OverworldJournalTimelineIndex = {
  eventResolutionProofs: OverworldEventResolutionJournalIndex;
  localActionEntries: readonly OverworldLocalActionJournalTimelineEntry[];
  progressSources: OverworldProgressJournalSourceIndex;
  roadJournalEntries: readonly OverworldRoadJournalResolutionEntry[];
  serviceJournal: OverworldServiceJournalReplayIndex;
};

type OverworldTravelTimelineIndex = {
  arrivals: ReadonlySet<string>;
  arrivedTownIds: ReadonlySet<string>;
  byArrival: ReadonlyMap<string, TravelLogEntrySnapshot>;
  latest: TravelLogEntrySnapshot | null;
  oldestFirst: readonly TravelLogEntrySnapshot[];
  townByArrival: ReadonlyMap<string, string>;
  townVisitMinutes: ReadonlyMap<string, number>;
};

type OverworldRenownSourceIndex = {
  eventsById: ReadonlyMap<string, OverworldLocalEvent>;
  jobsById: ReadonlyMap<string, OverworldLocalJob>;
  nodesById: ReadonlyMap<string, OverworldNode>;
  roadEventsByEdgeId: ReadonlyMap<string, OverworldRoadEvent>;
  sitesById: ReadonlyMap<string, OverworldExplorationSite>;
  travelLogByArrival: ReadonlyMap<string, TravelLogEntrySnapshot>;
};

type OverworldResourceReplayIndex = {
  edgesById: ReadonlyMap<string, OverworldEdge>;
  roadEventsByEdgeId: ReadonlyMap<string, OverworldRoadEvent>;
};

type OverworldRoadJournalResolutionEntry = {
  entry: OverworldJournalEntry;
  key: string;
  parsed: RoadJournalIdParts;
  recordedAt: number;
};

type OverworldRoadJournalResolutionIndex = {
  byKey: ReadonlyMap<string, OverworldRoadJournalResolutionEntry>;
  entries: readonly OverworldRoadJournalResolutionEntry[];
  requiredKeys: ReadonlySet<string>;
};

type OverworldServiceJournalReplayEntry = {
  entry: OverworldJournalEntry;
  parsed: ServiceJournalIdParts;
  recordedAt: number;
};

type OverworldServiceJournalReplayIndex = {
  entries: readonly OverworldServiceJournalReplayEntry[];
};

type OverworldProgressJournalSourceIndex = {
  completedJobIds: ReadonlySet<string>;
  completedQuestIds: ReadonlySet<string>;
  completedRegionalArcIds: ReadonlySet<string>;
  exploredSiteIds: ReadonlySet<string>;
  resolvedEventIds: ReadonlySet<string>;
  startedQuestIds: ReadonlySet<string>;
  visitedAreaIds: ReadonlySet<string>;
};

type MutableOverworldProgressJournalSourceIndex = {
  completedJobIds: Set<string>;
  completedQuestIds: Set<string>;
  completedRegionalArcIds: Set<string>;
  exploredSiteIds: Set<string>;
  resolvedEventIds: Set<string>;
  startedQuestIds: Set<string>;
  visitedAreaIds: Set<string>;
};

type OverworldReplayState = {
  minimumClock: number;
  supplies: number;
  fatigue: number;
};

type OverworldDiscoveryLocalityIndex = {
  areaHomes: ReadonlyMap<string, string>;
  completedQuestIds: ReadonlySet<string>;
  discoveredAreaIds: ReadonlySet<string>;
  discoveredJobIds: ReadonlySet<string>;
  discoveredQuestIds: ReadonlySet<string>;
  discoveredSiteIds: ReadonlySet<string>;
  eventsById: ReadonlyMap<string, OverworldLocalEvent>;
  jobsById: ReadonlyMap<string, OverworldLocalJob>;
  questsById: ReadonlyMap<string, OverworldQuest>;
  resolvedEventIds: ReadonlySet<string>;
  sitesById: ReadonlyMap<string, OverworldExplorationSite>;
  startedQuestIds: ReadonlySet<string>;
  visitedAreaIds: ReadonlySet<string>;
  visitedTownIds: ReadonlySet<string>;
};

type OverworldResolutionProofIndex = {
  charactersById: ReadonlyMap<string, OverworldCharacter>;
  eventsById: ReadonlyMap<string, OverworldLocalEvent>;
  poisById: ReadonlyMap<string, OverworldPoi>;
};

type OverworldRegionalArcCompletionIndex = {
  eventsById: ReadonlyMap<string, OverworldLocalEvent>;
  regionalArcs: readonly OverworldRegionalArc[];
};

type OverworldEventResolutionJournalIndex = {
  contactTimeByArea: ReadonlyMap<string, number>;
  recordedAtById: ReadonlyMap<string, number>;
  resolutionTimeByTown: ReadonlyMap<string, number>;
  scoutTimeByArea: ReadonlyMap<string, number>;
};

type MutableOverworldEventResolutionJournalIndex = {
  contactTimeByArea: Map<string, number>;
  recordedAtById: ReadonlyMap<string, number>;
  resolutionTimeByTown: Map<string, number>;
  scoutTimeByArea: Map<string, number>;
};

type OverworldLocalActionJournalReachabilityIndex = {
  areasById: ReadonlyMap<string, OverworldArea>;
  areasByTown: ReadonlyMap<string, readonly OverworldArea[]>;
  charactersById: ReadonlyMap<string, OverworldCharacter>;
  discoveredAreaIds: ReadonlySet<string>;
  discoveredJobIds: ReadonlySet<string>;
  discoveredQuestIds: ReadonlySet<string>;
  discoveredSiteIds: ReadonlySet<string>;
  eventsById: ReadonlyMap<string, OverworldLocalEvent>;
  jobsById: ReadonlyMap<string, OverworldLocalJob>;
  jobsByTown: ReadonlyMap<string, readonly OverworldLocalJob[]>;
  poisById: ReadonlyMap<string, OverworldPoi>;
  questsById: ReadonlyMap<string, OverworldQuest>;
  questsByTown: ReadonlyMap<string, readonly OverworldQuest[]>;
  sitesByArea: ReadonlyMap<string, readonly OverworldExplorationSite[]>;
  sitesById: ReadonlyMap<string, OverworldExplorationSite>;
  townVisitMinutes: ReadonlyMap<string, number>;
  visitedTownIds: ReadonlySet<string>;
};

type OverworldLocalJournalSource = {
  sourceLabel: string;
  sourceId: string;
  home: string;
  area: string;
};

type OverworldLocalActionJournalReplayEntry = {
  entry: OverworldJournalEntry;
  source: OverworldLocalJournalSource;
  recordedAt: number;
  duration: number | null;
};

type OverworldLocalActionJournalTimelineEntry = {
  entry: OverworldJournalEntry;
  recordedAt: number;
};

type OverworldLocalActionJournalReplayIndex = {
  entries: readonly OverworldLocalActionJournalReplayEntry[];
  localActionCountByArea: ReadonlyMap<string, number>;
  localActionCountByTown: ReadonlyMap<string, number>;
};

function assertKnownJournalSource(
  entry: OverworldJournalEntry,
  prefix: string,
  known: ReadonlySet<string>,
  sourceLabel: string,
  sourcePlaces?: ReadonlyMap<string, string>,
  placeLabel = "town",
): void {
  if (!entry.id.startsWith(prefix)) {
    throw new Error(
      `Overworld session snapshot journal ${entry.kind} entry id "${entry.id}" must start with "${prefix}".`,
    );
  }
  const sourceId = entry.id.slice(prefix.length);
  if (!sourceId) {
    throw new Error(
      `Overworld session snapshot journal ${entry.kind} entry has an empty ${sourceLabel} id.`,
    );
  }
  if (!known.has(sourceId)) {
    throw new Error(
      `Overworld session snapshot journal ${entry.kind} entry references unknown ${sourceLabel} "${sourceId}".`,
    );
  }
  const expectedPlace = sourcePlaces?.get(sourceId);
  if (expectedPlace && entry.town !== expectedPlace) {
    throw new Error(
      `Overworld session snapshot journal ${entry.kind} entry "${entry.id}" is bound to ${placeLabel} "${entry.town}", expected "${expectedPlace}".`,
    );
  }
}

function assertRoadJournalSource(
  entry: OverworldJournalEntry,
  recordedAt: number,
  sources: OverworldJournalSourceIndex,
): void {
  const parsed = parseRoadJournalId(entry.id);
  if (!sources.edgeIds.has(parsed.edgeId)) {
    throw new Error(
      `Overworld session snapshot journal road entry references unknown road "${parsed.edgeId}".`,
    );
  }
  if (parsed.arrivedAt > recordedAt) {
    throw new Error("Overworld session snapshot journal road entry predates its road arrival.");
  }
  if (!sources.travelLogArrivals.has(`${parsed.edgeId}@${parsed.arrivedAt}`)) {
    throw new Error(
      `Overworld session snapshot journal road entry has no matching travel log for "${parsed.edgeId}" at ${parsed.arrivedAt}.`,
    );
  }
  const expectedTown = sources.travelLogTownByArrival.get(`${parsed.edgeId}@${parsed.arrivedAt}`);
  if (expectedTown && entry.town !== expectedTown) {
    throw new Error(
      `Overworld session snapshot journal road entry "${entry.id}" is bound to town "${entry.town}", expected "${expectedTown}".`,
    );
  }
}

function assertServiceJournalSource(entry: OverworldJournalEntry, recordedAt: number): void {
  const service = parseServiceJournalId(entry.id);
  if (service.recordedAt !== recordedAt) {
    throw new Error(
      "Overworld session snapshot journal service entry time does not match its timestamp.",
    );
  }
}

function assertSnapshotJournalSource(
  entry: OverworldJournalEntry,
  recordedAt: number,
  sources: OverworldJournalSourceIndex,
): void {
  const placeNames = entry.kind === "regional_arc" ? sources.regionNames : sources.townNames;
  const placeLabel = entry.kind === "regional_arc" ? "region" : "town";
  if (!placeNames.has(entry.town)) {
    throw new Error(
      `Overworld session snapshot journal ${entry.kind} references unknown ${placeLabel} "${entry.town}".`,
    );
  }

  switch (entry.kind) {
    case "area":
      assertKnownJournalSource(entry, "area:", sources.areaIds, "area", sources.areaTownNames);
      return;
    case "contact":
      assertKnownJournalSource(
        entry,
        "talk:",
        sources.characterIds,
        "contact",
        sources.characterTownNames,
      );
      return;
    case "event":
      assertKnownJournalSource(
        entry,
        "investigate:",
        sources.eventIds,
        "event",
        sources.eventTownNames,
      );
      return;
    case "job":
      assertKnownJournalSource(entry, "job:", sources.jobIds, "job", sources.jobTownNames);
      return;
    case "poi":
      assertKnownJournalSource(
        entry,
        "scout:",
        sources.poiIds,
        "point of interest",
        sources.poiTownNames,
      );
      return;
    case "quest":
      assertKnownJournalSource(entry, "quest:", sources.questIds, "quest", sources.questTownNames);
      return;
    case "quest_done":
      assertKnownJournalSource(
        entry,
        "quest_done:",
        sources.questIds,
        "quest",
        sources.questTownNames,
      );
      return;
    case "regional_arc":
      assertKnownJournalSource(
        entry,
        "arc:",
        sources.arcIds,
        "regional arc",
        sources.arcRegionNames,
        "region",
      );
      return;
    case "resolution":
      assertKnownJournalSource(
        entry,
        "resolve:",
        sources.eventIds,
        "event resolution",
        sources.eventTownNames,
      );
      return;
    case "road":
      assertRoadJournalSource(entry, recordedAt, sources);
      return;
    case "service":
      assertServiceJournalSource(entry, recordedAt);
      return;
    case "site":
      assertKnownJournalSource(entry, "site:", sources.siteIds, "site", sources.siteTownNames);
      return;
  }
}

function snapshotTravelTimelineIndex(
  snapshot: OverworldSessionSnapshot,
  townNameForSource: (nodeId: string) => string,
  startTownId: string,
): OverworldTravelTimelineIndex {
  const arrivals = new Set<string>();
  const arrivedTownIds = new Set<string>();
  const byArrival = new Map<string, TravelLogEntrySnapshot>();
  const oldestFirst: TravelLogEntrySnapshot[] = [];
  const townByArrival = new Map<string, string>();
  const townVisitMinutes = new Map<string, number>([[startTownId, STARTING_MINUTES]]);

  let previousArrivedAt = Number.POSITIVE_INFINITY;
  for (const entry of snapshot.travelLog) {
    const key = travelResourceKey(entry);
    if (arrivals.has(key)) {
      throw new Error(`Overworld session snapshot has duplicate travel log entry "${key}".`);
    }
    if (entry.arrivedAt > snapshot.minutes) {
      throw new Error("Overworld session snapshot travel log contains a future arrival.");
    }
    if (entry.arrivedAt > previousArrivedAt) {
      throw new Error("Overworld session snapshot travel log must be newest-first.");
    }
    arrivals.add(key);
    arrivedTownIds.add(entry.toId);
    byArrival.set(key, entry);
    oldestFirst.push(entry);
    townByArrival.set(key, townNameForSource(entry.toId));
    const previousTownVisit = townVisitMinutes.get(entry.toId);
    if (previousTownVisit === undefined || entry.arrivedAt < previousTownVisit) {
      townVisitMinutes.set(entry.toId, entry.arrivedAt);
    }
    previousArrivedAt = entry.arrivedAt;
  }
  oldestFirst.reverse();

  return {
    arrivals,
    arrivedTownIds,
    byArrival,
    latest: oldestFirst[oldestFirst.length - 1] ?? null,
    oldestFirst,
    townByArrival,
    townVisitMinutes,
  };
}

function emptyProgressJournalSourceIndex(): MutableOverworldProgressJournalSourceIndex {
  return {
    completedJobIds: new Set<string>(),
    completedQuestIds: new Set<string>(),
    completedRegionalArcIds: new Set<string>(),
    exploredSiteIds: new Set<string>(),
    resolvedEventIds: new Set<string>(),
    startedQuestIds: new Set<string>(),
    visitedAreaIds: new Set<string>(),
  };
}

function recordProgressJournalSource(
  sources: MutableOverworldProgressJournalSourceIndex,
  entry: OverworldJournalEntry,
): void {
  switch (entry.kind) {
    case "area":
      sources.visitedAreaIds.add(entry.id.slice("area:".length));
      return;
    case "job":
      sources.completedJobIds.add(entry.id.slice("job:".length));
      return;
    case "quest":
      sources.startedQuestIds.add(entry.id.slice("quest:".length));
      return;
    case "quest_done":
      sources.completedQuestIds.add(entry.id.slice("quest_done:".length));
      return;
    case "regional_arc":
      sources.completedRegionalArcIds.add(entry.id.slice("arc:".length));
      return;
    case "resolution":
      sources.resolvedEventIds.add(entry.id.slice("resolve:".length));
      return;
    case "site":
      sources.exploredSiteIds.add(entry.id.slice("site:".length));
      return;
    default:
      return;
  }
}

function recordEventResolutionJournalProof(
  proofs: MutableOverworldEventResolutionJournalIndex,
  sources: OverworldResolutionProofIndex,
  entry: OverworldJournalEntry,
  recordedAt: number,
): void {
  switch (entry.kind) {
    case "poi": {
      const sourceId = journalSourceId(entry, "scout:");
      const poi = sourceId ? sources.poisById.get(sourceId) : undefined;
      if (poi) recordEarliestTime(proofs.scoutTimeByArea, poi.area, recordedAt);
      return;
    }
    case "resolution": {
      const sourceId = journalSourceId(entry, "resolve:");
      const event = sourceId ? sources.eventsById.get(sourceId) : undefined;
      if (event) recordEarliestTime(proofs.resolutionTimeByTown, event.home, recordedAt);
      return;
    }
    case "contact": {
      const sourceId = journalSourceId(entry, "talk:");
      const character = sourceId ? sources.charactersById.get(sourceId) : undefined;
      if (character) recordEarliestTime(proofs.contactTimeByArea, character.area, recordedAt);
      return;
    }
    default:
      return;
  }
}

function recordServiceJournalReplay(
  entries: OverworldServiceJournalReplayEntry[],
  entry: OverworldJournalEntry,
  recordedAt: number,
): void {
  if (entry.kind !== "service") return;
  entries.push({
    entry,
    parsed: parseServiceJournalId(entry.id),
    recordedAt,
  });
}

function recordRoadJournalResolution(
  entries: OverworldRoadJournalResolutionEntry[],
  entry: OverworldJournalEntry,
  recordedAt: number,
): void {
  if (entry.kind !== "road") return;
  const parsed = parseRoadJournalId(entry.id);
  entries.push({
    entry,
    key: roadResolutionKey(parsed),
    parsed,
    recordedAt,
  });
}

function recordLocalActionJournalEntry(
  entries: OverworldLocalActionJournalTimelineEntry[],
  entry: OverworldJournalEntry,
  recordedAt: number,
): void {
  switch (entry.kind) {
    case "area":
    case "contact":
    case "event":
    case "job":
    case "poi":
    case "resolution":
    case "site":
      entries.push({ entry, recordedAt });
      return;
    default:
      return;
  }
}

function assertSnapshotTimeline(
  snapshot: OverworldSessionSnapshot,
  sources: OverworldJournalTimelineSourceIndex,
): OverworldJournalTimelineIndex {
  let previousRecordedAt = Number.POSITIVE_INFINITY;
  const progressSources = emptyProgressJournalSourceIndex();
  const localActionEntries: OverworldLocalActionJournalTimelineEntry[] = [];
  const recordedAtById = new Map<string, number>();
  const roadJournalEntries: OverworldRoadJournalResolutionEntry[] = [];
  const serviceReplayEntries: OverworldServiceJournalReplayEntry[] = [];
  const eventResolutionProofs: MutableOverworldEventResolutionJournalIndex = {
    contactTimeByArea: new Map<string, number>(),
    recordedAtById,
    resolutionTimeByTown: new Map<string, number>(),
    scoutTimeByArea: new Map<string, number>(),
  };
  for (const entry of snapshot.journalEntries) {
    if (recordedAtById.has(entry.id)) {
      throw new Error(`Overworld session snapshot has duplicate journal entry id "${entry.id}".`);
    }
    const recordedAt = parseTimeLabel(entry.recordedAt);
    assertSnapshotJournalSource(entry, recordedAt, sources);
    if (recordedAt > snapshot.minutes) {
      throw new Error("Overworld session snapshot journal contains a future entry.");
    }
    if (recordedAt > previousRecordedAt) {
      throw new Error("Overworld session snapshot journal must be newest-first.");
    }
    recordedAtById.set(entry.id, recordedAt);
    recordProgressJournalSource(progressSources, entry);
    recordEventResolutionJournalProof(eventResolutionProofs, sources, entry, recordedAt);
    recordLocalActionJournalEntry(localActionEntries, entry, recordedAt);
    recordRoadJournalResolution(roadJournalEntries, entry, recordedAt);
    recordServiceJournalReplay(serviceReplayEntries, entry, recordedAt);
    previousRecordedAt = recordedAt;
  }

  return {
    eventResolutionProofs,
    localActionEntries,
    progressSources,
    roadJournalEntries,
    serviceJournal: { entries: serviceReplayEntries },
  };
}

function travelResourceKey(entry: TravelLogEntrySnapshot): string {
  return `${entry.edgeId}@${entry.arrivedAt}`;
}

function assertReplayClock(
  sourceLabel: string,
  recordedAt: number,
  duration: number,
  state: OverworldReplayState,
): void {
  const earliestCompletion = state.minimumClock + duration;
  if (recordedAt < earliestCompletion) {
    throw new Error(
      `Overworld session snapshot ${sourceLabel} was recorded before enough clock time elapsed.`,
    );
  }
  state.minimumClock = Math.max(state.minimumClock, recordedAt);
}

function localJournalActionDuration(
  entry: OverworldJournalEntry,
  sources: OverworldLocalActionJournalReachabilityIndex,
): number | null {
  switch (entry.kind) {
    case "area": {
      const sourceId = journalSourceId(entry, "area:");
      const area = sourceId ? sources.areasById.get(sourceId) : undefined;
      return area?.travel_minutes ?? null;
    }
    case "contact": {
      const sourceId = journalSourceId(entry, "talk:");
      const character = sourceId ? sources.charactersById.get(sourceId) : undefined;
      return character ? describeOverworldContactAction(character).minutes : null;
    }
    case "event": {
      const sourceId = journalSourceId(entry, "investigate:");
      const event = sourceId ? sources.eventsById.get(sourceId) : undefined;
      return event ? describeOverworldEventAction(event).minutes : null;
    }
    case "job": {
      const sourceId = journalSourceId(entry, "job:");
      const job = sourceId ? sources.jobsById.get(sourceId) : undefined;
      if (!job) return null;
      const area = sources.areasById.get(job.area) ?? null;
      return describeOverworldJobAction(job, area).minutes;
    }
    case "poi": {
      const sourceId = journalSourceId(entry, "scout:");
      const poi = sourceId ? sources.poisById.get(sourceId) : undefined;
      return poi ? 20 : null;
    }
    case "resolution": {
      const sourceId = journalSourceId(entry, "resolve:");
      const event = sourceId ? sources.eventsById.get(sourceId) : undefined;
      return event ? 30 + event.intensity * 10 : null;
    }
    case "site": {
      const sourceId = journalSourceId(entry, "site:");
      const site = sourceId ? sources.sitesById.get(sourceId) : undefined;
      return site ? describeOverworldSiteAction(site).minutes : null;
    }
    default:
      return null;
  }
}

function assertTravelResourceTransition(
  entry: TravelLogEntrySnapshot,
  edge: OverworldEdge,
  roadEvent: OverworldRoadEvent | null,
  state: OverworldReplayState,
): void {
  const label = `${entry.edgeId}@${entry.arrivedAt}`;
  const supplyCost = travelSupplyCost(edge.travel_minutes);
  const expectedSuppliesUsed = Math.min(state.supplies, supplyCost);
  const supplyDeficit = supplyCost - expectedSuppliesUsed;
  const expectedDelayMinutes = travelDelayMinutes(
    edge.travel_minutes,
    state.fatigue,
    supplyDeficit,
  );
  const expectedMinutes = edge.travel_minutes + expectedDelayMinutes;
  const expectedSuppliesAfter = state.supplies - expectedSuppliesUsed;
  const expectedFatigueGained =
    travelFatigueGain(edge.travel_minutes, roadEvent) + supplyDeficit * 4;
  const expectedFatigueAfter = Math.min(MAX_FATIGUE, state.fatigue + expectedFatigueGained);

  if (entry.delayMinutes !== expectedDelayMinutes || entry.minutes !== expectedMinutes) {
    throw new Error(
      `Overworld session snapshot travel "${label}" does not match resource replay timing.`,
    );
  }
  if (entry.suppliesUsed !== expectedSuppliesUsed) {
    throw new Error(
      `Overworld session snapshot travel "${label}" supplies used does not match resource replay.`,
    );
  }
  if (entry.suppliesAfter !== expectedSuppliesAfter) {
    throw new Error(
      `Overworld session snapshot travel "${label}" supplies after does not match resource replay.`,
    );
  }
  if (entry.fatigueGained !== expectedFatigueGained) {
    throw new Error(
      `Overworld session snapshot travel "${label}" fatigue gained does not match resource replay.`,
    );
  }
  if (entry.fatigueAfter !== expectedFatigueAfter) {
    throw new Error(
      `Overworld session snapshot travel "${label}" fatigue after does not match resource replay.`,
    );
  }

  state.supplies = expectedSuppliesAfter;
  state.fatigue = expectedFatigueAfter;
}

function roadJournalResolutionIndex(
  sources: OverworldResourceReplayIndex,
  journalTimeline: OverworldJournalTimelineIndex,
  travelTimeline: OverworldTravelTimelineIndex,
  pendingRoadEncounter: OverworldPendingRoadEncounterSnapshot | null,
): OverworldRoadJournalResolutionIndex {
  const byKey = new Map<string, OverworldRoadJournalResolutionEntry>();
  const nextTravelArrivalByKey = new Map<string, number>();
  const pendingRoadKey =
    pendingRoadEncounter &&
    travelTimeline.latest &&
    travelTimeline.latest.edgeId === pendingRoadEncounter.edgeId
      ? travelResourceKey(travelTimeline.latest)
      : null;
  const requiredRoadResolutionKeys = new Set<string>();
  for (let index = 0; index < travelTimeline.oldestFirst.length; index += 1) {
    const current = travelTimeline.oldestFirst[index]!;
    const key = travelResourceKey(current);
    const next = travelTimeline.oldestFirst[index + 1];
    if (next) nextTravelArrivalByKey.set(key, next.arrivedAt);
    if (sources.roadEventsByEdgeId.has(current.edgeId) && key !== pendingRoadKey) {
      requiredRoadResolutionKeys.add(key);
    }
  }

  for (const resolution of journalTimeline.roadJournalEntries) {
    if (!sources.roadEventsByEdgeId.has(resolution.parsed.edgeId)) {
      throw new Error(
        `Overworld session snapshot road journal "${resolution.entry.id}" has no matching road event.`,
      );
    }
    if (byKey.has(resolution.key)) {
      throw new Error(
        `Overworld session snapshot road encounter "${resolution.key}" has duplicate journal resolutions.`,
      );
    }
    const nextTravelArrival = nextTravelArrivalByKey.get(resolution.key);
    if (nextTravelArrival !== undefined && resolution.recordedAt > nextTravelArrival) {
      throw new Error(
        `Overworld session snapshot road encounter "${resolution.key}" was resolved after subsequent travel.`,
      );
    }
    byKey.set(resolution.key, resolution);
  }

  return {
    byKey,
    entries: journalTimeline.roadJournalEntries,
    requiredKeys: requiredRoadResolutionKeys,
  };
}

function assertSnapshotRoadResolutionCoverage(
  roadJournal: OverworldRoadJournalResolutionIndex,
): void {
  for (const key of roadJournal.requiredKeys) {
    if (!roadJournal.byKey.has(key)) {
      throw new Error(
        `Overworld session snapshot road encounter "${key}" is missing a journal resolution.`,
      );
    }
  }
}

function assertSnapshotResourceReplay(
  snapshot: OverworldSessionSnapshot,
  sources: OverworldResourceReplayIndex,
  travelTimeline: OverworldTravelTimelineIndex,
  roadJournal: OverworldRoadJournalResolutionIndex,
  serviceJournal: OverworldServiceJournalReplayIndex,
  localActionJournal: OverworldLocalActionJournalReplayIndex,
): void {
  assertSnapshotRoadResolutionCoverage(roadJournal);
  const replayEvents: (
    | { kind: "travel"; recordedAt: number; entry: TravelLogEntrySnapshot }
    | { kind: "road"; recordedAt: number; resolution: OverworldRoadJournalResolutionEntry }
    | { kind: "service"; recordedAt: number; service: OverworldServiceJournalReplayEntry }
    | {
        kind: "local";
        recordedAt: number;
        duration: number;
        entry: OverworldJournalEntry;
      }
  )[] = [];
  for (const entry of travelTimeline.oldestFirst) {
    replayEvents.push({ kind: "travel", recordedAt: entry.arrivedAt, entry });
  }
  for (const resolution of roadJournal.entries) {
    replayEvents.push({ kind: "road", recordedAt: resolution.recordedAt, resolution });
  }
  for (const service of serviceJournal.entries) {
    replayEvents.push({ kind: "service", recordedAt: service.recordedAt, service });
  }
  for (const { entry, recordedAt, duration } of localActionJournal.entries) {
    if (duration !== null) {
      replayEvents.push({
        kind: "local",
        recordedAt,
        duration,
        entry,
      });
    }
  }
  replayEvents.sort(
    (left, right) =>
      left.recordedAt - right.recordedAt ||
      (left.kind === "travel" ? 0 : left.kind === "road" ? 1 : 2) -
        (right.kind === "travel" ? 0 : right.kind === "road" ? 1 : 2),
  );

  const state: OverworldReplayState = {
    minimumClock: STARTING_MINUTES,
    supplies: STARTING_SUPPLIES,
    fatigue: 0,
  };
  for (const event of replayEvents) {
    if (event.kind === "travel") {
      const edge = sources.edgesById.get(event.entry.edgeId);
      if (!edge) {
        throw new Error(
          `Overworld session snapshot has unknown travel road "${event.entry.edgeId}".`,
        );
      }
      assertTravelResourceTransition(
        event.entry,
        edge,
        sources.roadEventsByEdgeId.get(event.entry.edgeId) ?? null,
        state,
      );
      assertReplayClock(
        `travel "${travelResourceKey(event.entry)}"`,
        event.recordedAt,
        event.entry.minutes,
        state,
      );
      continue;
    }

    if (event.kind === "road") {
      const roadEvent = sources.roadEventsByEdgeId.get(event.resolution.parsed.edgeId);
      if (!roadEvent) continue;
      const option = roadEncounterOptionFor(roadEvent, event.resolution.parsed.strategy);
      assertReplayClock(
        `road journal "${event.resolution.entry.id}"`,
        event.recordedAt,
        option.minutes,
        state,
      );
      const suppliesUsed = Math.min(state.supplies, option.suppliesCost);
      const supplyDeficit = option.suppliesCost - suppliesUsed;
      state.supplies -= suppliesUsed;
      state.fatigue = Math.min(
        MAX_FATIGUE,
        state.fatigue + option.fatigueGained + supplyDeficit * 3,
      );
      continue;
    }

    if (event.kind === "local") {
      assertReplayClock(
        `journal ${event.entry.kind} entry "${event.entry.id}"`,
        event.recordedAt,
        event.duration,
        state,
      );
      continue;
    }

    if (event.service.parsed.action === "rest") {
      if (state.fatigue === 0) {
        throw new Error(
          `Overworld session snapshot service journal "${event.service.entry.id}" rests with no fatigue to recover.`,
        );
      }
      assertReplayClock(
        `service journal "${event.service.entry.id}"`,
        event.recordedAt,
        Math.max(180, Math.ceil(state.fatigue / 20) * 60),
        state,
      );
      state.fatigue = 0;
    } else {
      if (state.supplies >= MAX_SUPPLIES) {
        throw new Error(
          `Overworld session snapshot service journal "${event.service.entry.id}" resupplies with full supplies.`,
        );
      }
      assertReplayClock(`service journal "${event.service.entry.id}"`, event.recordedAt, 45, state);
      state.supplies = MAX_SUPPLIES;
    }
  }

  if (snapshot.minutes < state.minimumClock) {
    throw new Error("Overworld session snapshot minutes do not match clock replay.");
  }
  if (snapshot.supplies !== state.supplies) {
    throw new Error("Overworld session snapshot supplies do not match resource replay.");
  }
  if (snapshot.fatigue !== state.fatigue) {
    throw new Error("Overworld session snapshot fatigue does not match resource replay.");
  }
}

function assertStringSetSubset(
  label: string,
  values: Iterable<string>,
  parentLabel: string,
  parent: ReadonlySet<string>,
): void {
  for (const value of values) {
    if (!parent.has(value)) {
      throw new Error(`Overworld session snapshot ${label} "${value}" is not in ${parentLabel}.`);
    }
  }
}

function assertJournalStateBinding(
  stateLabel: string,
  stateIds: ReadonlySet<string>,
  journalLabel: string,
  journalIds: ReadonlySet<string>,
): void {
  for (const id of stateIds) {
    if (!journalIds.has(id)) {
      throw new Error(
        `Overworld session snapshot ${stateLabel} "${id}" has no matching journal entry.`,
      );
    }
  }
  for (const id of journalIds) {
    if (!stateIds.has(id)) {
      throw new Error(
        `Overworld session snapshot journal ${journalLabel} "${id}" is missing from saved state.`,
      );
    }
  }
}

function assertSnapshotProgressJournalBindings(
  stateIds: OverworldProgressJournalSourceIndex,
  journalSources: OverworldProgressJournalSourceIndex,
): void {
  assertJournalStateBinding(
    "visited area id",
    stateIds.visitedAreaIds,
    "visited area id",
    journalSources.visitedAreaIds,
  );
  assertJournalStateBinding(
    "completed job id",
    stateIds.completedJobIds,
    "completed job id",
    journalSources.completedJobIds,
  );
  assertJournalStateBinding(
    "started quest id",
    stateIds.startedQuestIds,
    "started quest id",
    journalSources.startedQuestIds,
  );
  assertJournalStateBinding(
    "completed quest id",
    stateIds.completedQuestIds,
    "completed quest id",
    journalSources.completedQuestIds,
  );
  assertJournalStateBinding(
    "explored site id",
    stateIds.exploredSiteIds,
    "explored site id",
    journalSources.exploredSiteIds,
  );
  assertJournalStateBinding(
    "resolved event id",
    stateIds.resolvedEventIds,
    "resolved event id",
    journalSources.resolvedEventIds,
  );
  assertJournalStateBinding(
    "completed regional arc id",
    stateIds.completedRegionalArcIds,
    "completed regional arc id",
    journalSources.completedRegionalArcIds,
  );
}

function assertSnapshotVisitedTownTravelProof(
  visitedTownIds: ReadonlySet<string>,
  travelTimeline: OverworldTravelTimelineIndex,
): ReadonlyMap<string, number> {
  const visitedAt = travelTimeline.townVisitMinutes;
  for (const townId of visitedTownIds) {
    if (!visitedAt.has(townId)) {
      throw new Error(`Overworld session snapshot visited town "${townId}" has no travel arrival.`);
    }
  }
  for (const townId of travelTimeline.arrivedTownIds) {
    if (!visitedTownIds.has(townId)) {
      throw new Error(
        `Overworld session snapshot travel arrival town "${townId}" is missing from visited towns.`,
      );
    }
  }
  return visitedAt;
}

function assertSnapshotTravelPathContinuity(
  snapshotCurrentTownId: string,
  startTownId: string,
  travelTimeline: OverworldTravelTimelineIndex,
): void {
  let replayTownId = startTownId;
  for (const entry of travelTimeline.oldestFirst) {
    if (entry.fromId !== replayTownId) {
      throw new Error(
        `Overworld session snapshot travel log is not contiguous at road "${entry.edgeId}".`,
      );
    }
    replayTownId = entry.toId;
  }
  if (snapshotCurrentTownId !== replayTownId) {
    throw new Error("Overworld session snapshot current town does not match travel history.");
  }
}

function assertSnapshotPendingRoadEncounterBinding(
  pendingRoadEncounter: OverworldPendingRoadEncounterSnapshot | null,
  latestTravel: TravelLogEntrySnapshot | null,
  edgeIds: ReadonlySet<string>,
): void {
  if (!pendingRoadEncounter) return;
  if (!latestTravel) {
    throw new Error("Overworld session snapshot pending road encounter has no travel log.");
  }
  if (!edgeIds.has(latestTravel.edgeId)) return;
  if (latestTravel.edgeId !== pendingRoadEncounter.edgeId) {
    throw new Error(
      `Overworld session snapshot pending road encounter "${pendingRoadEncounter.edgeId}" does not match latest travel log road "${latestTravel.edgeId}".`,
    );
  }
}

function assertSnapshotPendingRoadEncounterUnresolved(
  pendingRoadEncounter: OverworldPendingRoadEncounterSnapshot | null,
  latestTravel: TravelLogEntrySnapshot | null,
  roadJournal: OverworldRoadJournalResolutionIndex,
): void {
  if (!pendingRoadEncounter) return;
  if (!latestTravel) return;

  const pendingArrivalKey = `${pendingRoadEncounter.edgeId}@${latestTravel.arrivedAt}`;
  if (roadJournal.byKey.has(pendingArrivalKey)) {
    throw new Error(
      `Overworld session snapshot pending road encounter "${pendingRoadEncounter.edgeId}" already has a road journal resolution.`,
    );
  }
}

function expectedDiscoveredTownIds(
  roadExitsByTown: ReadonlyMap<string, readonly OverworldExit[]>,
  visitedTownIds: ReadonlySet<string>,
): Set<string> {
  const expected = new Set<string>();
  for (const townId of visitedTownIds) {
    expected.add(townId);
    for (const edge of indexedList(roadExitsByTown, townId)) {
      expected.add(edge.destination.id);
    }
  }
  return expected;
}

function assertSnapshotDiscoveredTownFrontier(
  discoveredTownIds: ReadonlySet<string>,
  roadExitsByTown: ReadonlyMap<string, readonly OverworldExit[]>,
  visitedTownIds: ReadonlySet<string>,
): void {
  const expected = expectedDiscoveredTownIds(roadExitsByTown, visitedTownIds);
  for (const townId of discoveredTownIds) {
    if (!expected.has(townId)) {
      throw new Error(
        `Overworld session snapshot discovered town "${townId}" is outside the visited frontier.`,
      );
    }
  }
  for (const townId of expected) {
    if (!discoveredTownIds.has(townId)) {
      throw new Error(
        `Overworld session snapshot discovered town frontier is missing "${townId}".`,
      );
    }
  }
}

function assertSnapshotDiscoveredAreaPrefix(
  areasByTown: ReadonlyMap<string, readonly OverworldArea[]>,
  discoveredAreaIds: ReadonlySet<string>,
  visitedTownIds: ReadonlySet<string>,
): void {
  for (const townId of visitedTownIds) {
    const areas = indexedList(areasByTown, townId);
    if (areas.length === 0) continue;
    let discoveredAny = false;
    let hiddenAreaSeen = false;
    for (const area of areas) {
      const discovered = discoveredAreaIds.has(area.id);
      if (discovered) {
        discoveredAny = true;
        if (hiddenAreaSeen) {
          throw new Error(
            `Overworld session snapshot discovered area "${area.id}" skips an earlier area in "${townId}".`,
          );
        }
      } else {
        hiddenAreaSeen = true;
      }
    }
    if (!discoveredAny) {
      throw new Error(
        `Overworld session snapshot visited town "${townId}" is missing its initial discovered area.`,
      );
    }
  }
}

function assertSnapshotDiscoveredSourcePrefix(
  sourceLabel: string,
  discoveredIds: ReadonlySet<string>,
  orderedSources: readonly { id: string }[],
  contextId: string,
): void {
  let hiddenSourceSeen = false;
  for (const source of orderedSources) {
    if (discoveredIds.has(source.id)) {
      if (hiddenSourceSeen) {
        throw new Error(
          `Overworld session snapshot discovered ${sourceLabel} "${source.id}" skips an earlier ${sourceLabel} in "${contextId}".`,
        );
      }
    } else {
      hiddenSourceSeen = true;
    }
  }
}

function assertSnapshotDiscoveredLocalSourcePrefixes(
  sources: OverworldLocalActionJournalReachabilityIndex,
  visitedTownIds: ReadonlySet<string>,
): void {
  const discoveredAreaIds = sources.discoveredAreaIds;
  for (const townId of visitedTownIds) {
    assertSnapshotDiscoveredSourcePrefix(
      "job",
      sources.discoveredJobIds,
      indexedList(sources.jobsByTown, townId).filter((job) => discoveredAreaIds.has(job.area)),
      townId,
    );
    assertSnapshotDiscoveredSourcePrefix(
      "quest",
      sources.discoveredQuestIds,
      indexedList(sources.questsByTown, townId).filter((quest) =>
        discoveredAreaIds.has(quest.area),
      ),
      townId,
    );
  }
  for (const areaId of discoveredAreaIds) {
    assertSnapshotDiscoveredSourcePrefix(
      "site",
      sources.discoveredSiteIds,
      indexedList(sources.sitesByArea, areaId),
      areaId,
    );
  }
}

function assertSnapshotCurrentAreaMapExact(
  currentTownId: string,
  currentAreaId: string | null,
  currentAreaByTown: ReadonlyMap<string, string>,
  areasByTown: ReadonlyMap<string, readonly OverworldArea[]>,
  visitedTownIds: ReadonlySet<string>,
): void {
  for (const townId of visitedTownIds) {
    const localAreas = indexedList(areasByTown, townId);
    if (localAreas.length > 0 && !currentAreaByTown.has(townId)) {
      throw new Error(
        `Overworld session snapshot saved area map is missing visited town "${townId}".`,
      );
    }
  }
  for (const [townId] of currentAreaByTown) {
    if (!visitedTownIds.has(townId)) continue;
    if (indexedList(areasByTown, townId).length === 0) {
      throw new Error(
        `Overworld session snapshot has saved area for town "${townId}" with no local areas.`,
      );
    }
  }

  if (indexedList(areasByTown, currentTownId).length === 0) return;
  const savedCurrentArea = currentAreaByTown.get(currentTownId);
  if (!savedCurrentArea) return;
  if (currentAreaId === null) {
    throw new Error("Overworld session snapshot current area is missing for a local town.");
  }
  if (savedCurrentArea !== currentAreaId) {
    throw new Error("Overworld session snapshot current area does not match saved area map.");
  }
}

function addRegionRenown(target: Map<string, number>, region: string, amount: number): void {
  if (amount <= 0) return;
  target.set(region, (target.get(region) ?? 0) + amount);
}

function nodeRegionFor(
  nodesById: ReadonlyMap<string, OverworldNode>,
  nodeId: string,
  sourceLabel: string,
): string {
  const node = nodesById.get(nodeId);
  if (!node) {
    throw new Error(`Overworld session snapshot ${sourceLabel} references unknown town.`);
  }
  return node.region;
}

function roadRenownFor(
  roadEvent: OverworldRoadEvent,
  strategy: OverworldRoadEncounterStrategy,
): number {
  return roadEncounterOptionFor(roadEvent, strategy).renownGained;
}

function expectedSnapshotRegionRenown(
  stateIds: OverworldProgressJournalSourceIndex,
  sources: OverworldRenownSourceIndex,
  roadJournal: OverworldRoadJournalResolutionIndex,
): Map<string, number> {
  const expected = new Map<string, number>();

  for (const jobId of stateIds.completedJobIds) {
    const job = sources.jobsById.get(jobId);
    if (!job) continue;
    addRegionRenown(
      expected,
      nodeRegionFor(sources.nodesById, job.home, `completed job "${jobId}"`),
      job.difficulty,
    );
  }
  for (const siteId of stateIds.exploredSiteIds) {
    const site = sources.sitesById.get(siteId);
    if (site) addRegionRenown(expected, site.region, site.danger);
  }
  for (const eventId of stateIds.resolvedEventIds) {
    const event = sources.eventsById.get(eventId);
    if (!event) continue;
    addRegionRenown(
      expected,
      nodeRegionFor(sources.nodesById, event.home, `resolved event "${eventId}"`),
      event.intensity,
    );
  }
  for (const resolution of roadJournal.entries) {
    const roadEvent = sources.roadEventsByEdgeId.get(resolution.parsed.edgeId);
    const travelLog = sources.travelLogByArrival.get(resolution.key);
    if (!roadEvent || !travelLog) continue;
    addRegionRenown(
      expected,
      nodeRegionFor(sources.nodesById, travelLog.toId, `road journal "${resolution.entry.id}"`),
      roadRenownFor(roadEvent, resolution.parsed.strategy),
    );
  }

  return expected;
}

function assertSnapshotRegionRenown(
  actual: ReadonlyMap<string, number>,
  stateIds: OverworldProgressJournalSourceIndex,
  sources: OverworldRenownSourceIndex,
  roadJournal: OverworldRoadJournalResolutionIndex,
): void {
  const expected = expectedSnapshotRegionRenown(stateIds, sources, roadJournal);
  for (const [region, expectedRenown] of expected) {
    const actualRenown = actual.get(region) ?? 0;
    if (actualRenown !== expectedRenown) {
      throw new Error(
        `Overworld session snapshot region renown for "${region}" is ${actualRenown}, expected ${expectedRenown}.`,
      );
    }
  }
  for (const [region, actualRenown] of actual) {
    if (!expected.has(region)) {
      throw new Error(
        `Overworld session snapshot has unexpected region renown for "${region}" (${actualRenown}).`,
      );
    }
  }
}

function assertVisitedTownForDiscovery(
  sourceLabel: string,
  sourceId: string,
  townId: string,
  visitedTownIds: ReadonlySet<string>,
): void {
  if (!visitedTownIds.has(townId)) {
    throw new Error(
      `Overworld session snapshot ${sourceLabel} "${sourceId}" belongs to unvisited town "${townId}".`,
    );
  }
}

function assertDiscoveredAreaForDiscovery(
  sourceLabel: string,
  sourceId: string,
  areaId: string,
  discoveredAreaIds: ReadonlySet<string>,
): void {
  if (!discoveredAreaIds.has(areaId)) {
    throw new Error(
      `Overworld session snapshot ${sourceLabel} "${sourceId}" is in undiscovered area "${areaId}".`,
    );
  }
}

function assertSnapshotDiscoveryLocality(sources: OverworldDiscoveryLocalityIndex): void {
  for (const areaId of sources.discoveredAreaIds) {
    const home = sources.areaHomes.get(areaId);
    if (home) {
      assertVisitedTownForDiscovery("discovered area", areaId, home, sources.visitedTownIds);
    }
  }
  for (const areaId of sources.visitedAreaIds) {
    const home = sources.areaHomes.get(areaId);
    if (home) {
      assertVisitedTownForDiscovery("visited area", areaId, home, sources.visitedTownIds);
    }
  }
  for (const jobId of sources.discoveredJobIds) {
    const job = sources.jobsById.get(jobId);
    if (!job) continue;
    assertVisitedTownForDiscovery("discovered job", jobId, job.home, sources.visitedTownIds);
    assertDiscoveredAreaForDiscovery("discovered job", jobId, job.area, sources.discoveredAreaIds);
  }
  for (const siteId of sources.discoveredSiteIds) {
    const site = sources.sitesById.get(siteId);
    if (!site) continue;
    assertVisitedTownForDiscovery(
      "discovered site",
      siteId,
      site.nearest_town,
      sources.visitedTownIds,
    );
    assertDiscoveredAreaForDiscovery(
      "discovered site",
      siteId,
      site.area,
      sources.discoveredAreaIds,
    );
  }
  for (const questId of sources.discoveredQuestIds) {
    const quest = sources.questsById.get(questId);
    if (!quest) continue;
    assertVisitedTownForDiscovery("discovered quest", questId, quest.home, sources.visitedTownIds);
    assertDiscoveredAreaForDiscovery(
      "discovered quest",
      questId,
      quest.area,
      sources.discoveredAreaIds,
    );
  }
  for (const questId of sources.startedQuestIds) {
    const quest = sources.questsById.get(questId);
    if (!quest) continue;
    if (!sources.discoveredQuestIds.has(questId)) {
      throw new Error(`Overworld session snapshot started quest "${questId}" is not discovered.`);
    }
    assertVisitedTownForDiscovery("started quest", questId, quest.home, sources.visitedTownIds);
    assertDiscoveredAreaForDiscovery(
      "started quest",
      questId,
      quest.area,
      sources.discoveredAreaIds,
    );
  }
  for (const questId of sources.completedQuestIds) {
    const quest = sources.questsById.get(questId);
    if (!quest) continue;
    if (!sources.startedQuestIds.has(questId)) {
      throw new Error(`Overworld session snapshot completed quest "${questId}" is not started.`);
    }
    assertVisitedTownForDiscovery("completed quest", questId, quest.home, sources.visitedTownIds);
    assertDiscoveredAreaForDiscovery(
      "completed quest",
      questId,
      quest.area,
      sources.discoveredAreaIds,
    );
  }
  for (const eventId of sources.resolvedEventIds) {
    const event = sources.eventsById.get(eventId);
    if (!event) continue;
    assertVisitedTownForDiscovery("resolved event", eventId, event.home, sources.visitedTownIds);
    assertDiscoveredAreaForDiscovery(
      "resolved event",
      eventId,
      event.area,
      sources.discoveredAreaIds,
    );
  }
}

function journalSourceId(entry: OverworldJournalEntry, prefix: string): string | null {
  return entry.id.startsWith(prefix) ? entry.id.slice(prefix.length) : null;
}

function localJournalSource(
  entry: OverworldJournalEntry,
  sources: OverworldLocalActionJournalReachabilityIndex,
): OverworldLocalJournalSource | null {
  switch (entry.kind) {
    case "area": {
      const sourceId = journalSourceId(entry, "area:");
      if (!sourceId) return null;
      const area = sources.areasById.get(sourceId);
      if (!area) return null;
      return {
        sourceLabel: "journal area",
        sourceId,
        home: area.home,
        area: area.id,
      };
    }
    case "contact": {
      const sourceId = journalSourceId(entry, "talk:");
      if (!sourceId) return null;
      const character = sources.charactersById.get(sourceId);
      if (!character) return null;
      return {
        sourceLabel: "journal contact",
        sourceId,
        home: character.home,
        area: character.area,
      };
    }
    case "event": {
      const sourceId = journalSourceId(entry, "investigate:");
      if (!sourceId) return null;
      const event = sources.eventsById.get(sourceId);
      if (!event) return null;
      return {
        sourceLabel: "journal event",
        sourceId,
        home: event.home,
        area: event.area,
      };
    }
    case "job": {
      const sourceId = journalSourceId(entry, "job:");
      if (!sourceId) return null;
      const job = sources.jobsById.get(sourceId);
      if (!job) return null;
      return {
        sourceLabel: "journal job",
        sourceId,
        home: job.home,
        area: job.area,
      };
    }
    case "poi": {
      const sourceId = journalSourceId(entry, "scout:");
      if (!sourceId) return null;
      const poi = sources.poisById.get(sourceId);
      if (!poi) return null;
      return {
        sourceLabel: "journal point of interest",
        sourceId,
        home: poi.home,
        area: poi.area,
      };
    }
    case "resolution": {
      const sourceId = journalSourceId(entry, "resolve:");
      if (!sourceId) return null;
      const event = sources.eventsById.get(sourceId);
      if (!event) return null;
      return {
        sourceLabel: "journal resolved event",
        sourceId,
        home: event.home,
        area: event.area,
      };
    }
    case "site": {
      const sourceId = journalSourceId(entry, "site:");
      if (!sourceId) return null;
      const site = sources.sitesById.get(sourceId);
      if (!site) return null;
      return {
        sourceLabel: "journal site",
        sourceId,
        home: site.nearest_town,
        area: site.area,
      };
    }
    default:
      return null;
  }
}

function localActionJournalReplayIndex(
  sources: OverworldLocalActionJournalReachabilityIndex,
  journalTimeline: OverworldJournalTimelineIndex,
): OverworldLocalActionJournalReplayIndex {
  const entries: OverworldLocalActionJournalReplayEntry[] = [];
  const localActionCountByTown = new Map<string, number>();
  const localActionCountByArea = new Map<string, number>();

  for (const { entry, recordedAt } of journalTimeline.localActionEntries) {
    const source = localJournalSource(entry, sources);
    if (!source) continue;
    entries.push({
      entry,
      source,
      recordedAt,
      duration: localJournalActionDuration(entry, sources),
    });
    incrementCount(localActionCountByTown, source.home);
    incrementCount(localActionCountByArea, source.area);
  }

  entries.sort((left, right) => left.recordedAt - right.recordedAt);
  return { entries, localActionCountByArea, localActionCountByTown };
}

function assertJournalAfterTownVisit(
  sourceLabel: string,
  sourceId: string,
  recordedAt: number,
  townId: string,
  townVisitMinutes: ReadonlyMap<string, number>,
): void {
  const visitedAt = townVisitMinutes.get(townId);
  if (visitedAt !== undefined && recordedAt < visitedAt) {
    throw new Error(
      `Overworld session snapshot ${sourceLabel} "${sourceId}" was recorded before visiting town "${townId}".`,
    );
  }
}

function assertSnapshotLocalActionJournalReachability(
  localActionJournal: OverworldLocalActionJournalReplayIndex,
  sources: OverworldLocalActionJournalReachabilityIndex,
): void {
  for (const { source, recordedAt } of localActionJournal.entries) {
    assertVisitedTownForDiscovery(
      source.sourceLabel,
      source.sourceId,
      source.home,
      sources.visitedTownIds,
    );
    assertDiscoveredAreaForDiscovery(
      source.sourceLabel,
      source.sourceId,
      source.area,
      sources.discoveredAreaIds,
    );
    assertJournalAfterTownVisit(
      source.sourceLabel,
      source.sourceId,
      recordedAt,
      source.home,
      sources.townVisitMinutes,
    );
  }
}

function replayedDiscoveredAreaIdsBeforeLocalAction(
  areasByTown: ReadonlyMap<string, readonly OverworldArea[]>,
  townId: string,
  priorLocalActionCount: number,
): ReadonlySet<string> {
  const localAreas = indexedList(areasByTown, townId);
  const discovered = new Set<string>();
  const limit = Math.min(localAreas.length, 1 + priorLocalActionCount);
  for (let index = 0; index < limit; index += 1) {
    discovered.add(localAreas[index]!.id);
  }
  return discovered;
}

function replayedDiscoveredJobIdsBeforeLocalAction(
  sources: OverworldLocalActionJournalReachabilityIndex,
  townId: string,
  priorLocalActionCount: number,
): ReadonlySet<string> {
  const discoveredAreaIds = replayedDiscoveredAreaIdsBeforeLocalAction(
    sources.areasByTown,
    townId,
    priorLocalActionCount,
  );
  const discovered = new Set<string>();
  if (priorLocalActionCount <= 0) return discovered;
  for (const job of indexedList(sources.jobsByTown, townId)) {
    if (!discoveredAreaIds.has(job.area)) continue;
    discovered.add(job.id);
    if (discovered.size >= priorLocalActionCount) break;
  }
  return discovered;
}

function replayedDiscoveredSiteIdsBeforeLocalAction(
  sitesByArea: ReadonlyMap<string, readonly OverworldExplorationSite[]>,
  areaId: string,
  priorAreaLocalActionCount: number,
): ReadonlySet<string> {
  const sites = indexedList(sitesByArea, areaId);
  const discovered = new Set<string>();
  const limit = Math.min(priorAreaLocalActionCount, sites.length);
  for (let index = 0; index < limit; index += 1) {
    discovered.add(sites[index]!.id);
  }
  return discovered;
}

function assertSnapshotLocalActionDiscoveryChronology(
  localActionJournal: OverworldLocalActionJournalReplayIndex,
  sources: OverworldLocalActionJournalReachabilityIndex,
): void {
  const priorLocalActionCountByTown = new Map<string, number>();
  const priorLocalActionCountByArea = new Map<string, number>();

  for (let index = 0; index < localActionJournal.entries.length; ) {
    const recordedAt = localActionJournal.entries[index]!.recordedAt;
    const group = [];
    while (
      index < localActionJournal.entries.length &&
      localActionJournal.entries[index]!.recordedAt === recordedAt
    ) {
      group.push(localActionJournal.entries[index]!);
      index += 1;
    }

    for (const { entry, source } of group) {
      const priorLocalActionCount = priorLocalActionCountByTown.get(source.home) ?? 0;
      const areaIndex = indexedList(sources.areasByTown, source.home).findIndex(
        (area) => area.id === source.area,
      );
      if (areaIndex > 0 && priorLocalActionCount < areaIndex) {
        throw new Error(
          `Overworld session snapshot ${source.sourceLabel} "${source.sourceId}" was recorded before discovering area "${source.area}".`,
        );
      }
      if (
        entry.kind === "job" &&
        !replayedDiscoveredJobIdsBeforeLocalAction(sources, source.home, priorLocalActionCount).has(
          source.sourceId,
        )
      ) {
        throw new Error(
          `Overworld session snapshot ${source.sourceLabel} "${source.sourceId}" was recorded before discovering job "${source.sourceId}".`,
        );
      }
      const priorAreaLocalActionCount = priorLocalActionCountByArea.get(source.area) ?? 0;
      if (
        entry.kind === "site" &&
        !replayedDiscoveredSiteIdsBeforeLocalAction(
          sources.sitesByArea,
          source.area,
          priorAreaLocalActionCount,
        ).has(source.sourceId)
      ) {
        throw new Error(
          `Overworld session snapshot ${source.sourceLabel} "${source.sourceId}" was recorded before discovering site "${source.sourceId}".`,
        );
      }
    }

    for (const { source } of group) {
      priorLocalActionCountByTown.set(
        source.home,
        (priorLocalActionCountByTown.get(source.home) ?? 0) + 1,
      );
      priorLocalActionCountByArea.set(
        source.area,
        (priorLocalActionCountByArea.get(source.area) ?? 0) + 1,
      );
    }
  }
}

function incrementCount(counts: Map<string, number>, key: string): void {
  counts.set(key, (counts.get(key) ?? 0) + 1);
}

function recordEarliestTime(times: Map<string, number>, key: string, recordedAt: number): void {
  const previous = times.get(key);
  if (previous === undefined || recordedAt < previous) times.set(key, recordedAt);
}

function assertSnapshotDiscoveredAreaCountReplay(
  sources: OverworldLocalActionJournalReachabilityIndex,
  localActionJournal: OverworldLocalActionJournalReplayIndex,
): void {
  for (const townId of sources.visitedTownIds) {
    const localAreas = indexedList(sources.areasByTown, townId);
    const expectedDiscoveredCount =
      localAreas.length === 0
        ? 0
        : Math.min(
            localAreas.length,
            1 + (localActionJournal.localActionCountByTown.get(townId) ?? 0),
          );
    let actualDiscoveredCount = 0;
    for (const area of localAreas) {
      if (sources.discoveredAreaIds.has(area.id)) actualDiscoveredCount += 1;
    }
    if (actualDiscoveredCount !== expectedDiscoveredCount) {
      throw new Error(
        `Overworld session snapshot discovered area count in town "${townId}" does not match local action replay.`,
      );
    }
  }
}

function countValues<T>(values: Iterable<T>, predicate: (value: T) => boolean): number {
  let count = 0;
  for (const value of values) {
    if (predicate(value)) count += 1;
  }
  return count;
}

function assertDiscoveredSourceCountReplay(
  sourceLabel: string,
  contextLabel: string,
  contextId: string,
  discoveredCount: number,
  expectedCount: number,
): void {
  if (discoveredCount !== expectedCount) {
    throw new Error(
      `Overworld session snapshot discovered ${sourceLabel} count in ${contextLabel} "${contextId}" does not match local action proof replay.`,
    );
  }
}

function assertSnapshotDiscoveredLocalSourceCountReplay(
  sources: OverworldLocalActionJournalReachabilityIndex,
  localActionJournal: OverworldLocalActionJournalReplayIndex,
): void {
  const discoveredJobCountByTown = new Map<string, number>();
  const discoveredQuestCountByTown = new Map<string, number>();
  const discoveredSiteCountByArea = new Map<string, number>();

  for (const jobId of sources.discoveredJobIds) {
    const job = sources.jobsById.get(jobId);
    if (job) incrementCount(discoveredJobCountByTown, job.home);
  }
  for (const siteId of sources.discoveredSiteIds) {
    const site = sources.sitesById.get(siteId);
    if (site) incrementCount(discoveredSiteCountByArea, site.area);
  }
  for (const questId of sources.discoveredQuestIds) {
    const quest = sources.questsById.get(questId);
    if (quest) incrementCount(discoveredQuestCountByTown, quest.home);
  }

  for (const townId of sources.visitedTownIds) {
    const localActionCount = localActionJournal.localActionCountByTown.get(townId) ?? 0;
    const availableJobCount = countValues(indexedList(sources.jobsByTown, townId), (job) =>
      sources.discoveredAreaIds.has(job.area),
    );
    assertDiscoveredSourceCountReplay(
      "job",
      "town",
      townId,
      discoveredJobCountByTown.get(townId) ?? 0,
      Math.min(localActionCount, availableJobCount),
    );
    const availableQuestCount = countValues(indexedList(sources.questsByTown, townId), (quest) =>
      sources.discoveredAreaIds.has(quest.area),
    );
    assertDiscoveredSourceCountReplay(
      "quest",
      "town",
      townId,
      discoveredQuestCountByTown.get(townId) ?? 0,
      Math.min(localActionCount, availableQuestCount),
    );
  }
  for (const areaId of sources.discoveredAreaIds) {
    const localActionCount = localActionJournal.localActionCountByArea.get(areaId) ?? 0;
    const availableSiteCount = indexedList(sources.sitesByArea, areaId).length;
    assertDiscoveredSourceCountReplay(
      "site",
      "area",
      areaId,
      discoveredSiteCountByArea.get(areaId) ?? 0,
      Math.min(localActionCount, availableSiteCount),
    );
  }
}

function assertSnapshotEventResolutionProofs(
  resolvedEventIds: ReadonlySet<string>,
  sources: OverworldResolutionProofIndex,
  journal: OverworldEventResolutionJournalIndex,
): void {
  for (const eventId of resolvedEventIds) {
    const event = sources.eventsById.get(eventId);
    if (!event) continue;
    const resolvedAt = journal.recordedAtById.get(`resolve:${eventId}`);
    if (resolvedAt === undefined) continue;

    const scoutAt = journal.scoutTimeByArea.get(event.area);
    if (scoutAt === undefined || scoutAt > resolvedAt) {
      throw new Error(
        `Overworld session snapshot resolved event "${eventId}" is missing a local scout prerequisite.`,
      );
    }

    const contactAt = journal.contactTimeByArea.get(event.area);
    if (contactAt === undefined || contactAt > resolvedAt) {
      throw new Error(
        `Overworld session snapshot resolved event "${eventId}" is missing a local contact prerequisite.`,
      );
    }

    const investigationAt = journal.recordedAtById.get(`investigate:${eventId}`);
    if (investigationAt === undefined || investigationAt > resolvedAt) {
      throw new Error(
        `Overworld session snapshot resolved event "${eventId}" is missing an investigated event prerequisite.`,
      );
    }
  }
}

type RegionalArcResolutionProof = {
  completionProofAt: number;
  resolvedCount: number;
};

function regionalArcResolutionProof(
  arc: OverworldRegionalArc,
  resolutionTimesByTown: ReadonlyMap<string, number>,
): RegionalArcResolutionProof {
  const required = arc.required_resolutions;
  const requiredResolutionTimes: number[] = [];
  let resolvedCount = 0;

  for (const townId of arc.anchor_towns) {
    const resolvedAt = resolutionTimesByTown.get(townId);
    if (resolvedAt === undefined) continue;

    resolvedCount += 1;
    if (required <= 0) continue;

    let insertAt = requiredResolutionTimes.length;
    while (insertAt > 0 && requiredResolutionTimes[insertAt - 1]! > resolvedAt) {
      insertAt -= 1;
    }
    if (insertAt >= required) continue;

    requiredResolutionTimes.splice(insertAt, 0, resolvedAt);
    if (requiredResolutionTimes.length > required) requiredResolutionTimes.pop();
  }

  return {
    completionProofAt:
      required > 0 && requiredResolutionTimes.length >= required
        ? requiredResolutionTimes[required - 1]!
        : STARTING_MINUTES,
    resolvedCount,
  };
}

function assertSnapshotRegionalArcCompletionProofs(
  sources: OverworldRegionalArcCompletionIndex,
  journal: OverworldEventResolutionJournalIndex,
  completedRegionalArcIds: ReadonlySet<string>,
): void {
  for (const arc of sources.regionalArcs) {
    const resolutionProof = regionalArcResolutionProof(arc, journal.resolutionTimeByTown);
    const hasRequiredResolutions = resolutionProof.resolvedCount >= arc.required_resolutions;
    const completed = completedRegionalArcIds.has(arc.id);

    if (completed && !hasRequiredResolutions) {
      throw new Error(
        `Overworld session snapshot completed regional arc "${arc.id}" lacks required resolved anchor towns.`,
      );
    }
    if (!completed && hasRequiredResolutions) {
      throw new Error(
        `Overworld session snapshot is missing completed regional arc "${arc.id}" earned by resolved anchor towns.`,
      );
    }
    if (!completed) continue;

    const arcRecordedAt = journal.recordedAtById.get(`arc:${arc.id}`);
    if (arcRecordedAt === undefined) continue;
    const completionProofAt = resolutionProof.completionProofAt;
    if (arcRecordedAt < completionProofAt) {
      throw new Error(
        `Overworld session snapshot completed regional arc "${arc.id}" was recorded before enough anchor resolutions.`,
      );
    }
  }
}

export class OverworldSession {
  private readonly nodes: Map<string, OverworldNode>;
  private readonly roadExitsByTown: Map<string, OverworldExit[]>;
  private readonly roadExitsByTownAndId: Map<string, Map<string, OverworldExit>>;
  private readonly roadEventsByEdgeId: Map<string, OverworldRoadEvent>;
  private readonly areasById: Map<string, OverworldArea>;
  private readonly areasByTown: Map<string, OverworldArea[]>;
  private readonly areaExitsByArea: Map<string, OverworldAreaExit[]>;
  private readonly areaExitsByAreaAndId: Map<string, Map<string, OverworldAreaExit>>;
  private readonly poisById: Map<string, OverworldPoi>;
  private readonly poisByTown: Map<string, OverworldPoi[]>;
  private readonly poisByArea: Map<string, OverworldPoi[]>;
  private readonly charactersById: Map<string, OverworldCharacter>;
  private readonly charactersByTown: Map<string, OverworldCharacter[]>;
  private readonly charactersByArea: Map<string, OverworldCharacter[]>;
  private readonly eventsByTown: Map<string, OverworldLocalEvent[]>;
  private readonly eventsByArea: Map<string, OverworldLocalEvent[]>;
  private readonly localEventsById: Map<string, OverworldLocalEvent>;
  private readonly jobsById: Map<string, OverworldLocalJob>;
  private readonly jobsByTown: Map<string, OverworldLocalJob[]>;
  private readonly sitesById: Map<string, OverworldExplorationSite>;
  private readonly sitesByTown: Map<string, OverworldExplorationSite[]>;
  private readonly sitesByArea: Map<string, OverworldExplorationSite[]>;
  private readonly questsById: Map<string, OverworldQuest>;
  private readonly questsByTown: Map<string, OverworldQuest[]>;
  private readonly regionalArcsByRegion: Map<string, OverworldRegionalArc[]>;
  private readonly regionalArcAnchorTownsById: Map<string, OverworldNode[]>;
  private readonly snapshotManifestIndex: OverworldSnapshotManifestIndex;
  private readonly worldHash: string;
  private currentId: string;
  private currentAreaId: string | null = null;
  private minutes = STARTING_MINUTES;
  private supplies = STARTING_SUPPLIES;
  private fatigue = 0;
  private readonly discoveredIds = new Set<string>();
  private readonly visitedIds = new Set<string>();
  private readonly currentAreaByTown = new Map<string, string>();
  private readonly travelLog: TravelLogEntry[] = [];
  private readonly journalEntries: OverworldJournalEntry[] = [];
  private readonly journalEntriesById = new Map<string, OverworldJournalEntry>();
  private readonly resolvedEventIds = new Set<string>();
  private readonly resolvedEventHomeIds = new Set<string>();
  private readonly discoveredAreaIds = new Set<string>();
  private readonly visitedAreaIds = new Set<string>();
  private readonly discoveredJobIds = new Set<string>();
  private readonly completedJobIds = new Set<string>();
  private readonly discoveredSiteIds = new Set<string>();
  private readonly discoveredQuestIds = new Set<string>();
  private readonly startedQuestIds = new Set<string>();
  private readonly completedQuestIds = new Set<string>();
  private readonly exploredSiteIds = new Set<string>();
  private readonly regionRenown = new Map<string, number>();
  private readonly completedRegionalArcIds = new Set<string>();
  private pendingRoadEncounter: OverworldPendingRoadEncounter | null = null;
  private snapshotCache?: {
    snapshot: OverworldSessionSnapshot;
    hash: string;
  };
  private routeOptionsCache?: OverworldSessionRoutePlan[];
  private compactViewCache?: OverworldCompactView;
  private regionalArcProgressCache?: OverworldRegionalArcProgress[];
  private viewCache?: OverworldView;

  constructor(private readonly world: OverworldManifest) {
    this.nodes = overworldNodesById(world);
    this.roadExitsByTown = this.indexRoadExits();
    this.roadExitsByTownAndId = nestedIdIndex(this.roadExitsByTown);
    this.roadEventsByEdgeId = keyedIndex(world.road_events, (event) => event.edge);
    this.areasById = idIndex(world.areas);
    this.areasByTown = sortedIndex(
      world.areas,
      (area) => area.home,
      (a, b) => a.travel_minutes - b.travel_minutes || a.name.localeCompare(b.name),
    );
    this.areaExitsByArea = this.indexAreaExits();
    this.areaExitsByAreaAndId = nestedIdIndex(this.areaExitsByArea);
    this.poisById = idIndex(world.points_of_interest);
    this.poisByTown = sortedIndex(
      world.points_of_interest,
      (poi) => poi.home,
      (a, b) => a.title.localeCompare(b.title),
    );
    this.poisByArea = sortedIndex(
      world.points_of_interest,
      (poi) => poi.area,
      (a, b) => a.title.localeCompare(b.title),
    );
    this.charactersById = idIndex(world.characters);
    this.charactersByTown = sortedIndex(
      world.characters,
      (character) => character.home,
      (a, b) => a.name.localeCompare(b.name),
    );
    this.charactersByArea = sortedIndex(
      world.characters,
      (character) => character.area,
      (a, b) => a.name.localeCompare(b.name),
    );
    this.eventsByTown = sortedIndex(
      world.local_events,
      (event) => event.home,
      (a, b) => b.intensity - a.intensity || a.title.localeCompare(b.title),
    );
    this.eventsByArea = sortedIndex(
      world.local_events,
      (event) => event.area,
      (a, b) => b.intensity - a.intensity || a.title.localeCompare(b.title),
    );
    this.localEventsById = idIndex(world.local_events);
    this.jobsById = idIndex(world.local_jobs);
    this.jobsByTown = sortedIndex(
      world.local_jobs,
      (job) => job.home,
      (a, b) =>
        a.difficulty - b.difficulty || a.minutes - b.minutes || a.title.localeCompare(b.title),
    );
    this.sitesById = idIndex(world.exploration_sites);
    this.sitesByTown = sortedIndex(
      world.exploration_sites,
      (site) => site.nearest_town,
      (a, b) => b.danger - a.danger || a.title.localeCompare(b.title),
    );
    this.sitesByArea = sortedIndex(
      world.exploration_sites,
      (site) => site.area,
      (a, b) => b.danger - a.danger || a.title.localeCompare(b.title),
    );
    this.questsById = idIndex(world.quests);
    this.questsByTown = sortedIndex(
      world.quests,
      (quest) => quest.home,
      (a, b) => a.title.localeCompare(b.title),
    );
    this.regionalArcsByRegion = this.indexRegionalArcsByRegion();
    this.regionalArcAnchorTownsById = this.indexRegionalArcAnchorTowns();
    this.snapshotManifestIndex = buildOverworldSnapshotManifestIndex({
      areasById: this.areasById,
      areasByTown: this.areasByTown,
      charactersById: this.charactersById,
      eventsById: this.localEventsById,
      jobsById: this.jobsById,
      jobsByTown: this.jobsByTown,
      nodesById: this.nodes,
      poisById: this.poisById,
      questsById: this.questsById,
      questsByTown: this.questsByTown,
      roadEventsByEdgeId: this.roadEventsByEdgeId,
      roadExitsByTown: this.roadExitsByTown,
      sitesByArea: this.sitesByArea,
      sitesById: this.sitesById,
      world: this.world,
    });
    this.worldHash = hashState(world);
    this.currentId = world.start;
    this.markSeen(world.start);
  }

  static restore(world: OverworldManifest, rawSnapshot: unknown): OverworldSession {
    const snapshot = OverworldSessionSnapshotSchema.parse(rawSnapshot);
    const session = new OverworldSession(world);
    session.applySnapshot(snapshot);
    return session;
  }

  private indexAreaExits(): Map<string, OverworldAreaExit[]> {
    const index = new Map<string, OverworldAreaExit[]>();
    for (const edge of this.world.area_edges) {
      const fromDestination = this.areasById.get(edge.to_area);
      const toDestination = this.areasById.get(edge.from_area);
      if (!fromDestination || !toDestination) {
        const missingAreaId = fromDestination ? edge.from_area : edge.to_area;
        throw new Error(`Overworld area edge references missing area "${missingAreaId}".`);
      }
      pushIndexed(index, edge.from_area, { ...edge, destination: fromDestination });
      pushIndexed(index, edge.to_area, { ...edge, destination: toDestination });
    }
    for (const exits of index.values()) {
      exits.sort(
        (a, b) =>
          a.travel_minutes - b.travel_minutes ||
          a.destination.name.localeCompare(b.destination.name),
      );
    }
    return index;
  }

  private indexRoadExits(): Map<string, OverworldExit[]> {
    const index = new Map<string, OverworldExit[]>();
    for (const edge of this.world.edges) {
      const fromDestination = this.nodes.get(edge.to);
      const toDestination = this.nodes.get(edge.from);
      if (!fromDestination || !toDestination) {
        const missingNodeId = fromDestination ? edge.from : edge.to;
        throw new Error(`Overworld edge references missing node "${missingNodeId}".`);
      }
      pushIndexed(index, edge.from, { ...edge, destination: fromDestination });
      pushIndexed(index, edge.to, { ...edge, destination: toDestination });
    }
    for (const exits of index.values()) {
      exits.sort(
        (a, b) =>
          a.travel_minutes - b.travel_minutes ||
          a.destination.name.localeCompare(b.destination.name),
      );
    }
    return index;
  }

  private indexRegionalArcsByRegion(): Map<string, OverworldRegionalArc[]> {
    const index = new Map<string, OverworldRegionalArc[]>();
    for (const arc of this.world.regional_arcs) pushIndexed(index, arc.region, arc);
    return index;
  }

  private indexRegionalArcAnchorTowns(): Map<string, OverworldNode[]> {
    const index = new Map<string, OverworldNode[]>();
    for (const arc of this.world.regional_arcs) {
      index.set(
        arc.id,
        arc.anchor_towns
          .map((id) => this.nodes.get(id))
          .filter((node): node is OverworldNode => node !== undefined),
      );
    }
    return index;
  }

  private clearSnapshotCache(): void {
    delete this.snapshotCache;
    delete this.routeOptionsCache;
    delete this.compactViewCache;
    delete this.regionalArcProgressCache;
    delete this.viewCache;
  }

  private cachedSnapshot(): { snapshot: OverworldSessionSnapshot; hash: string } {
    if (this.snapshotCache) return this.snapshotCache;
    const snapshot = this.buildSnapshot();
    const hash = hashState(snapshot);
    this.snapshotCache = { snapshot, hash };
    return this.snapshotCache;
  }

  snapshotHash(): string {
    return this.cachedSnapshot().hash;
  }

  snapshot(): OverworldSessionSnapshot {
    return cloneOverworldSessionSnapshot(this.cachedSnapshot().snapshot);
  }

  private buildSnapshot(): OverworldSessionSnapshot {
    return {
      version: OVERWORLD_SESSION_SAVE_VERSION,
      worldId: this.world.id,
      worldHash: this.worldHash,
      currentId: this.currentId,
      currentAreaId: this.currentAreaId,
      minutes: this.minutes,
      supplies: this.supplies,
      fatigue: this.fatigue,
      discoveredIds: sortedStringSet(this.discoveredIds),
      visitedIds: sortedStringSet(this.visitedIds),
      currentAreaByTown: sortedStringMap(this.currentAreaByTown),
      travelLog: snapshotTravelLogEntries(this.travelLog),
      journalEntries: cloneJournalEntries(this.journalEntries),
      resolvedEventIds: sortedStringSet(this.resolvedEventIds),
      discoveredAreaIds: sortedStringSet(this.discoveredAreaIds),
      visitedAreaIds: sortedStringSet(this.visitedAreaIds),
      discoveredJobIds: sortedStringSet(this.discoveredJobIds),
      completedJobIds: sortedStringSet(this.completedJobIds),
      discoveredSiteIds: sortedStringSet(this.discoveredSiteIds),
      discoveredQuestIds: sortedStringSet(this.discoveredQuestIds),
      startedQuestIds: sortedStringSet(this.startedQuestIds),
      completedQuestIds: sortedStringSet(this.completedQuestIds),
      exploredSiteIds: sortedStringSet(this.exploredSiteIds),
      regionRenown: sortedNumberMap(this.regionRenown),
      completedRegionalArcIds: sortedStringSet(this.completedRegionalArcIds),
      pendingRoadEncounter: this.pendingRoadEncounter
        ? { edgeId: this.pendingRoadEncounter.edgeId }
        : null,
    };
  }

  private applySnapshot(snapshot: OverworldSessionSnapshot): void {
    if (snapshot.worldId !== this.world.id) {
      throw new Error(
        `Overworld session snapshot is for world "${snapshot.worldId}", not "${this.world.id}".`,
      );
    }
    if (snapshot.worldHash !== this.worldHash) {
      throw new Error("Overworld session snapshot was made against a different world manifest.");
    }

    const indexes = this.snapshotManifestIndex;
    const travelTimeline = snapshotTravelTimelineIndex(
      snapshot,
      indexes.townNameForSource,
      this.world.start,
    );
    let restoredPendingRoadEncounter: OverworldPendingRoadEncounter | null = null;

    if (!indexes.nodeIds.has(snapshot.currentId)) {
      throw new Error(
        `Overworld session snapshot has unknown current town "${snapshot.currentId}".`,
      );
    }
    if (snapshot.currentAreaId !== null) {
      if (!indexes.areaIds.has(snapshot.currentAreaId)) {
        throw new Error(
          `Overworld session snapshot has unknown current area "${snapshot.currentAreaId}".`,
        );
      }
      if (indexes.areaHomes.get(snapshot.currentAreaId) !== snapshot.currentId) {
        throw new Error("Overworld session snapshot current area is outside the current town.");
      }
    }

    const discoveredTownIds = assertKnownIds(
      "discovered town id",
      snapshot.discoveredIds,
      indexes.nodeIds,
    );
    const visitedTownIds = assertKnownIds("visited town id", snapshot.visitedIds, indexes.nodeIds);
    const discoveredAreaIds = assertKnownIds(
      "discovered area id",
      snapshot.discoveredAreaIds,
      indexes.areaIds,
    );
    const visitedAreaIds = assertKnownIds(
      "visited area id",
      snapshot.visitedAreaIds,
      indexes.areaIds,
    );
    const discoveredJobIds = assertKnownIds(
      "discovered job id",
      snapshot.discoveredJobIds,
      indexes.jobIds,
    );
    const completedJobIds = assertKnownIds(
      "completed job id",
      snapshot.completedJobIds,
      indexes.jobIds,
    );
    const discoveredSiteIds = assertKnownIds(
      "discovered site id",
      snapshot.discoveredSiteIds,
      indexes.siteIds,
    );
    const exploredSiteIds = assertKnownIds(
      "explored site id",
      snapshot.exploredSiteIds,
      indexes.siteIds,
    );
    const discoveredQuestIds = assertKnownIds(
      "discovered quest id",
      snapshot.discoveredQuestIds,
      indexes.questIds,
    );
    const startedQuestIds = assertKnownIds(
      "started quest id",
      snapshot.startedQuestIds,
      indexes.questIds,
    );
    const completedQuestIds = assertKnownIds(
      "completed quest id",
      snapshot.completedQuestIds,
      indexes.questIds,
    );
    const resolvedEventIds = assertKnownIds(
      "resolved event id",
      snapshot.resolvedEventIds,
      indexes.eventIds,
    );
    const completedRegionalArcIds = assertKnownIds(
      "completed regional arc id",
      snapshot.completedRegionalArcIds,
      indexes.arcIds,
    );
    const progressStateIds: OverworldProgressJournalSourceIndex = {
      completedJobIds,
      completedQuestIds,
      completedRegionalArcIds,
      exploredSiteIds,
      resolvedEventIds,
      startedQuestIds,
      visitedAreaIds,
    };
    const currentAreaByTown = assertUniqueTupleMap("area-map town", snapshot.currentAreaByTown);
    const regionRenown = assertUniqueTupleMap("renown region", snapshot.regionRenown);
    const journalTimeline = assertSnapshotTimeline(snapshot, {
      ...indexes,
      travelLogArrivals: travelTimeline.arrivals,
      travelLogTownByArrival: travelTimeline.townByArrival,
    });
    const roadJournal = roadJournalResolutionIndex(
      indexes,
      journalTimeline,
      travelTimeline,
      snapshot.pendingRoadEncounter,
    );
    const serviceJournal = journalTimeline.serviceJournal;

    if (!discoveredTownIds.has(snapshot.currentId)) {
      throw new Error("Overworld session snapshot current town is not discovered.");
    }
    if (!visitedTownIds.has(snapshot.currentId)) {
      throw new Error("Overworld session snapshot current town is not visited.");
    }
    const townVisitMinutes = assertSnapshotVisitedTownTravelProof(visitedTownIds, travelTimeline);
    assertSnapshotTravelPathContinuity(snapshot.currentId, this.world.start, travelTimeline);
    assertSnapshotDiscoveredTownFrontier(
      discoveredTownIds,
      indexes.roadExitsByTown,
      visitedTownIds,
    );
    assertStringSetSubset(
      "visited town id",
      visitedTownIds,
      "discovered town ids",
      discoveredTownIds,
    );
    assertStringSetSubset(
      "visited area id",
      visitedAreaIds,
      "discovered area ids",
      discoveredAreaIds,
    );
    assertStringSetSubset(
      "completed job id",
      completedJobIds,
      "discovered job ids",
      discoveredJobIds,
    );
    assertStringSetSubset(
      "explored site id",
      exploredSiteIds,
      "discovered site ids",
      discoveredSiteIds,
    );
    assertSnapshotProgressJournalBindings(progressStateIds, journalTimeline.progressSources);
    assertSnapshotRegionRenown(
      regionRenown,
      progressStateIds,
      {
        ...indexes,
        travelLogByArrival: travelTimeline.byArrival,
      },
      roadJournal,
    );
    if (snapshot.currentAreaId !== null && !discoveredAreaIds.has(snapshot.currentAreaId)) {
      throw new Error("Overworld session snapshot current area is not discovered.");
    }
    const localActionJournalSources = {
      ...indexes,
      discoveredAreaIds,
      discoveredJobIds,
      discoveredQuestIds,
      discoveredSiteIds,
      townVisitMinutes,
      visitedTownIds,
    };
    const localActionJournal = localActionJournalReplayIndex(
      localActionJournalSources,
      journalTimeline,
    );
    assertSnapshotDiscoveredAreaPrefix(indexes.areasByTown, discoveredAreaIds, visitedTownIds);
    assertSnapshotDiscoveredLocalSourcePrefixes(localActionJournalSources, visitedTownIds);
    assertSnapshotCurrentAreaMapExact(
      snapshot.currentId,
      snapshot.currentAreaId,
      currentAreaByTown,
      indexes.areasByTown,
      visitedTownIds,
    );
    for (const [townId, areaId] of currentAreaByTown) {
      if (!indexes.nodeIds.has(townId)) {
        throw new Error(`Overworld session snapshot has unknown area-map town "${townId}".`);
      }
      if (!indexes.areaIds.has(areaId)) {
        throw new Error(`Overworld session snapshot has unknown saved area "${areaId}".`);
      }
      if (indexes.areaHomes.get(areaId) !== townId) {
        throw new Error(
          `Overworld session snapshot saved area "${areaId}" is outside "${townId}".`,
        );
      }
      if (!visitedTownIds.has(townId)) {
        throw new Error(`Overworld session snapshot saved area town "${townId}" is not visited.`);
      }
      if (!discoveredAreaIds.has(areaId)) {
        throw new Error(`Overworld session snapshot saved area "${areaId}" is not discovered.`);
      }
    }
    assertSnapshotDiscoveryLocality({
      ...indexes,
      completedQuestIds,
      discoveredAreaIds,
      discoveredJobIds,
      discoveredQuestIds,
      discoveredSiteIds,
      resolvedEventIds,
      startedQuestIds,
      visitedAreaIds,
      visitedTownIds,
    });
    assertSnapshotLocalActionJournalReachability(localActionJournal, localActionJournalSources);
    assertSnapshotLocalActionDiscoveryChronology(localActionJournal, localActionJournalSources);
    const eventResolutionJournal = journalTimeline.eventResolutionProofs;
    assertSnapshotEventResolutionProofs(resolvedEventIds, indexes, eventResolutionJournal);
    assertSnapshotRegionalArcCompletionProofs(
      indexes,
      eventResolutionJournal,
      completedRegionalArcIds,
    );
    assertSnapshotDiscoveredLocalSourceCountReplay(localActionJournalSources, localActionJournal);
    assertSnapshotDiscoveredAreaCountReplay(localActionJournalSources, localActionJournal);
    for (const [region] of regionRenown) {
      if (!indexes.regionNames.has(region)) {
        throw new Error(`Overworld session snapshot has unknown renown region "${region}".`);
      }
    }
    if (snapshot.pendingRoadEncounter) {
      const pendingEdge = indexes.edgesById.get(snapshot.pendingRoadEncounter.edgeId);
      if (!pendingEdge) {
        throw new Error(
          `Overworld session snapshot has unknown pending road "${snapshot.pendingRoadEncounter.edgeId}".`,
        );
      }
      if (pendingEdge.from !== snapshot.currentId && pendingEdge.to !== snapshot.currentId) {
        throw new Error("Overworld session snapshot pending road is not at the current town.");
      }
      const manifestEvent = this.roadEventFor(snapshot.pendingRoadEncounter.edgeId);
      if (!manifestEvent) {
        throw new Error(
          `Overworld session snapshot has no road event for "${snapshot.pendingRoadEncounter.edgeId}".`,
        );
      }
      assertSnapshotPendingRoadEncounterBinding(
        snapshot.pendingRoadEncounter,
        travelTimeline.latest,
        indexes.edgeIds,
      );
      assertSnapshotPendingRoadEncounterUnresolved(
        snapshot.pendingRoadEncounter,
        travelTimeline.latest,
        roadJournal,
      );
      const fromId = pendingEdge.from === snapshot.currentId ? pendingEdge.to : pendingEdge.from;
      const from = this.nodes.get(fromId);
      const to = this.nodes.get(snapshot.currentId);
      if (!from || !to) {
        throw new Error("Overworld session snapshot pending road references an unknown town.");
      }
      restoredPendingRoadEncounter = this.buildPendingRoadEncounter(
        from,
        to,
        pendingEdge,
        manifestEvent,
        snapshot.minutes,
      );
    }
    assertSnapshotResourceReplay(
      snapshot,
      indexes,
      travelTimeline,
      roadJournal,
      serviceJournal,
      localActionJournal,
    );

    this.currentId = snapshot.currentId;
    this.currentAreaId = snapshot.currentAreaId;
    this.minutes = snapshot.minutes;
    this.supplies = snapshot.supplies;
    this.fatigue = snapshot.fatigue;
    replaceStringSet(this.discoveredIds, snapshot.discoveredIds);
    replaceStringSet(this.visitedIds, snapshot.visitedIds);
    this.currentAreaByTown.clear();
    for (const [townId, areaId] of currentAreaByTown) {
      this.currentAreaByTown.set(townId, areaId);
    }
    this.replaceTravelLogEntries(snapshot.travelLog, indexes.edgesById);
    this.replaceJournalEntries(snapshot.journalEntries);
    replaceStringSet(this.resolvedEventIds, snapshot.resolvedEventIds);
    this.rebuildResolvedEventHomeIds();
    replaceStringSet(this.discoveredAreaIds, snapshot.discoveredAreaIds);
    replaceStringSet(this.visitedAreaIds, snapshot.visitedAreaIds);
    replaceStringSet(this.discoveredJobIds, snapshot.discoveredJobIds);
    replaceStringSet(this.completedJobIds, snapshot.completedJobIds);
    replaceStringSet(this.discoveredSiteIds, snapshot.discoveredSiteIds);
    replaceStringSet(this.discoveredQuestIds, snapshot.discoveredQuestIds);
    replaceStringSet(this.startedQuestIds, snapshot.startedQuestIds);
    replaceStringSet(this.completedQuestIds, snapshot.completedQuestIds);
    replaceStringSet(this.exploredSiteIds, snapshot.exploredSiteIds);
    this.regionRenown.clear();
    for (const [region, renown] of regionRenown) this.regionRenown.set(region, renown);
    replaceStringSet(this.completedRegionalArcIds, snapshot.completedRegionalArcIds);
    this.pendingRoadEncounter = restoredPendingRoadEncounter;
    this.clearSnapshotCache();
  }

  private restoreTravelLogEntry(
    entry: TravelLogEntrySnapshot,
    edgesById: ReadonlyMap<string, OverworldEdge>,
  ): TravelLogEntry {
    const edge = edgesById.get(entry.edgeId);
    if (!edge) {
      throw new Error(`Overworld session snapshot has unknown travel road "${entry.edgeId}".`);
    }
    const endpointsMatch =
      (edge.from === entry.fromId && edge.to === entry.toId) ||
      (edge.from === entry.toId && edge.to === entry.fromId);
    if (!endpointsMatch) {
      throw new Error("Overworld session snapshot travel road endpoints do not match the world.");
    }
    if (entry.minutes !== edge.travel_minutes + entry.delayMinutes) {
      throw new Error("Overworld session snapshot travel minutes do not match the road.");
    }
    const from = this.nodes.get(entry.fromId);
    const to = this.nodes.get(entry.toId);
    if (!from || !to) {
      throw new Error("Overworld session snapshot travel log references an unknown town.");
    }
    return {
      edgeId: entry.edgeId,
      fromId: entry.fromId,
      toId: entry.toId,
      from: from.name,
      to: to.name,
      route: edge.route,
      distanceMi: edge.distance_mi,
      baseMinutes: edge.travel_minutes,
      delayMinutes: entry.delayMinutes,
      minutes: entry.minutes,
      arrivedAt: entry.arrivedAt,
      suppliesUsed: entry.suppliesUsed,
      suppliesAfter: entry.suppliesAfter,
      fatigueGained: entry.fatigueGained,
      fatigueAfter: entry.fatigueAfter,
      roadEvent: this.roadEventFor(entry.edgeId),
    };
  }

  private replaceTravelLogEntries(
    entries: readonly TravelLogEntrySnapshot[],
    edgesById: ReadonlyMap<string, OverworldEdge>,
  ): void {
    this.travelLog.length = 0;
    for (const entry of entries) this.travelLog.push(this.restoreTravelLogEntry(entry, edgesById));
  }

  private rebuildResolvedEventHomeIds(): void {
    this.resolvedEventHomeIds.clear();
    for (const eventId of this.resolvedEventIds) {
      const event = this.localEventsById.get(eventId);
      if (event) this.resolvedEventHomeIds.add(event.home);
    }
  }

  private markEventResolved(event: OverworldLocalEvent): void {
    this.resolvedEventIds.add(event.id);
    this.resolvedEventHomeIds.add(event.home);
  }

  private markSeen(nodeId: string): void {
    this.discoveredIds.add(nodeId);
    this.visitedIds.add(nodeId);
    this.discoverInitialAreaForTown(nodeId);
    this.setCurrentAreaForTown(nodeId);
    for (const edge of this.roadsFrom(nodeId)) {
      this.discoveredIds.add(edge.destination.id);
    }
    this.clearSnapshotCache();
  }

  private currentNode(): OverworldNode {
    const current = this.nodes.get(this.currentId);
    if (!current) throw new Error(`Current overworld node "${this.currentId}" is missing.`);
    return current;
  }

  private roadsFrom(nodeId: string): OverworldExit[] {
    return this.roadExitsByTown.get(nodeId) ?? [];
  }

  private roadFrom(nodeId: string, edgeId: string): OverworldExit | null {
    return this.roadExitsByTownAndId.get(nodeId)?.get(edgeId) ?? null;
  }

  private roadEventFor(edgeId: string): OverworldRoadEvent | null {
    return this.roadEventsByEdgeId.get(edgeId) ?? null;
  }

  private recordAction(
    entry: Omit<OverworldJournalEntry, "recordedAt">,
    minutes: number,
  ): OverworldActionResult {
    const existing = this.journalEntry(entry.id);
    if (existing) return { minutes: 0, alreadyKnown: true, entry: existing };
    this.minutes += minutes;
    const recorded: OverworldJournalEntry = {
      ...entry,
      recordedAt: timeLabel(this.minutes),
    };
    this.addJournalEntry(recorded);
    this.clearSnapshotCache();
    return { minutes, alreadyKnown: false, entry: recorded };
  }

  private recordLocalAction<Kind extends OverworldLocalActionKind>(
    action: OverworldLocalActionDescriptor<Kind>,
    town: string,
  ): OverworldActionResult {
    return this.recordAction(
      {
        id: action.id,
        kind: action.kind,
        town,
        title: action.title,
        text: action.text,
      },
      action.minutes,
    );
  }

  private recordRepeatableEntry(
    entry: Omit<OverworldJournalEntry, "recordedAt">,
    minutes: number,
  ): OverworldJournalEntry {
    this.minutes += minutes;
    const recorded: OverworldJournalEntry = {
      ...entry,
      id: `${entry.id}:${this.minutes}`,
      recordedAt: timeLabel(this.minutes),
    };
    this.addJournalEntry(recorded);
    this.clearSnapshotCache();
    return recorded;
  }

  private replaceJournalEntries(entries: readonly OverworldJournalEntry[]): void {
    this.journalEntries.length = 0;
    this.journalEntriesById.clear();
    for (const entry of entries) {
      const restored = { ...entry };
      this.journalEntries.push(restored);
      this.journalEntriesById.set(restored.id, restored);
    }
  }

  private addJournalEntry(entry: OverworldJournalEntry): void {
    this.journalEntries.unshift(entry);
    this.journalEntriesById.set(entry.id, entry);
  }

  private journalEntry(id: string): OverworldJournalEntry | undefined {
    return this.journalEntriesById.get(id);
  }

  private hasJournalEntry(id: string): boolean {
    return this.journalEntriesById.has(id);
  }

  private localAreas(nodeId: string): OverworldArea[] {
    return this.areasByTown.get(nodeId) ?? [];
  }

  private areaById(areaId: string): OverworldArea | null {
    return this.areasById.get(areaId) ?? null;
  }

  private setCurrentAreaForTown(nodeId: string): void {
    const local = this.localAreas(nodeId);
    const saved = this.currentAreaByTown.get(nodeId);
    const next = saved && local.some((area) => area.id === saved) ? saved : (local[0]?.id ?? null);
    const previous = this.currentAreaId;
    const hadSaved = next ? this.currentAreaByTown.get(nodeId) === next : true;
    const alreadyDiscovered = next ? this.discoveredAreaIds.has(next) : true;
    this.currentAreaId = next;
    if (next) {
      this.currentAreaByTown.set(nodeId, next);
      this.discoveredAreaIds.add(next);
    }
    if (previous !== next || !hadSaved || !alreadyDiscovered) {
      this.clearSnapshotCache();
    }
  }

  private currentArea(): OverworldArea | null {
    if (this.currentAreaId) {
      const area = this.areaById(this.currentAreaId);
      if (area?.home === this.currentId) return area;
    }
    this.setCurrentAreaForTown(this.currentId);
    return this.currentAreaId ? this.areaById(this.currentAreaId) : null;
  }

  private visibleAreaExits(): OverworldAreaExit[] {
    const area = this.currentArea();
    if (!area) return [];
    const exits: OverworldAreaExit[] = [];
    for (const exit of this.areaExitsByArea.get(area.id) ?? []) {
      if (this.discoveredAreaIds.has(exit.destination.id)) exits.push(exit);
    }
    return exits;
  }

  private areaExitFrom(areaId: string, routeId: string): OverworldAreaExit | null {
    return this.areaExitsByAreaAndId.get(areaId)?.get(routeId) ?? null;
  }

  private discoveredAreasAt(nodeId: string): OverworldArea[] {
    const areas: OverworldArea[] = [];
    for (const area of this.localAreas(nodeId)) {
      if (this.discoveredAreaIds.has(area.id)) areas.push(area);
    }
    return areas;
  }

  private hiddenAreaCountAt(nodeId: string): number {
    let count = 0;
    for (const area of this.localAreas(nodeId)) {
      if (!this.discoveredAreaIds.has(area.id)) count += 1;
    }
    return count;
  }

  private currentAreaIdOrThrow(): string {
    const area = this.currentArea();
    if (!area) throw new Error("There is no current local area in this town.");
    return area.id;
  }

  private currentAreaPois(): OverworldPoi[] {
    return this.poisByArea.get(this.currentAreaIdOrThrow()) ?? [];
  }

  private currentAreaCharacters(): OverworldCharacter[] {
    return this.charactersByArea.get(this.currentAreaIdOrThrow()) ?? [];
  }

  private currentAreaEvents(): OverworldLocalEvent[] {
    return this.eventsByArea.get(this.currentAreaIdOrThrow()) ?? [];
  }

  private discoverInitialAreaForTown(nodeId: string): void {
    const firstArea = this.localAreas(nodeId)[0];
    if (firstArea && !this.discoveredAreaIds.has(firstArea.id)) {
      this.discoveredAreaIds.add(firstArea.id);
      this.clearSnapshotCache();
    }
  }

  private discoverNextAreaForTown(nodeId: string): OverworldArea[] {
    const area = this.localAreas(nodeId).find(
      (candidate) => !this.discoveredAreaIds.has(candidate.id),
    );
    if (!area) return [];
    this.discoveredAreaIds.add(area.id);
    this.clearSnapshotCache();
    return [area];
  }

  private localJobs(nodeId: string): OverworldLocalJob[] {
    return this.jobsByTown.get(nodeId) ?? [];
  }

  private discoveredJobsInCurrentArea(): OverworldLocalJob[] {
    const areaId = this.currentAreaIdOrThrow();
    const jobs: OverworldLocalJob[] = [];
    for (const job of this.localJobs(this.currentId)) {
      if (job.area === areaId && this.discoveredJobIds.has(job.id)) jobs.push(job);
    }
    return jobs;
  }

  private hiddenJobCountAt(nodeId: string): number {
    let count = 0;
    for (const job of this.localJobs(nodeId)) {
      if (!this.discoveredJobIds.has(job.id)) count += 1;
    }
    return count;
  }

  private discoverNextJobForTown(nodeId: string): OverworldLocalJob[] {
    const job = this.localJobs(nodeId).find(
      (candidate) =>
        this.discoveredAreaIds.has(candidate.area) && !this.discoveredJobIds.has(candidate.id),
    );
    if (!job) return [];
    this.discoveredJobIds.add(job.id);
    this.clearSnapshotCache();
    return [job];
  }

  private localSites(nodeId: string): OverworldExplorationSite[] {
    return this.sitesByTown.get(nodeId) ?? [];
  }

  private currentAreaSites(): OverworldExplorationSite[] {
    return this.sitesByArea.get(this.currentAreaIdOrThrow()) ?? [];
  }

  private discoveredSitesInCurrentArea(): OverworldExplorationSite[] {
    const sites: OverworldExplorationSite[] = [];
    for (const site of this.currentAreaSites()) {
      if (this.discoveredSiteIds.has(site.id)) sites.push(site);
    }
    return sites;
  }

  private hiddenSiteCountInCurrentArea(): number {
    let count = 0;
    for (const site of this.currentAreaSites()) {
      if (!this.discoveredSiteIds.has(site.id)) count += 1;
    }
    return count;
  }

  private localQuests(nodeId: string): OverworldQuest[] {
    return this.questsByTown.get(nodeId) ?? [];
  }

  private discoveredQuestsAt(nodeId: string): OverworldQuestView[] {
    const quests: OverworldQuestView[] = [];
    for (const quest of this.localQuests(nodeId)) {
      if (this.discoveredQuestIds.has(quest.id)) quests.push(questView(quest));
    }
    return quests;
  }

  private hiddenQuestCountAt(nodeId: string): number {
    let count = 0;
    for (const quest of this.localQuests(nodeId)) {
      if (!this.discoveredQuestIds.has(quest.id)) count += 1;
    }
    return count;
  }

  private discoverNextSiteForTown(nodeId: string): OverworldExplorationSite[] {
    if (nodeId !== this.currentId) return [];
    const site = this.currentAreaSites().find(
      (candidate) => !this.discoveredSiteIds.has(candidate.id),
    );
    if (!site) return [];
    this.discoveredSiteIds.add(site.id);
    this.clearSnapshotCache();
    return [site];
  }

  private discoverNextQuestForTown(nodeId: string): OverworldQuestView[] {
    const quest = this.localQuests(nodeId).find(
      (candidate) =>
        this.discoveredAreaIds.has(candidate.area) && !this.discoveredQuestIds.has(candidate.id),
    );
    if (!quest) return [];
    this.discoveredQuestIds.add(quest.id);
    this.clearSnapshotCache();
    return [questView(quest)];
  }

  private questAreaName(quest: OverworldQuest): string {
    return this.areaById(quest.area)?.name ?? quest.area;
  }

  private estimateRoute(plan: OverworldRoutePlan): OverworldRouteEstimate {
    let supplies = this.supplies;
    let fatigue = this.fatigue;
    let baseMinutes = 0;
    let delayMinutes = 0;
    let suppliesNeeded = 0;
    let suppliesUsed = 0;
    let supplyDeficit = 0;
    let fatigueGained = 0;

    for (const step of plan.steps) {
      const stepMinutes = step.edge.travel_minutes;
      const stepSupplyCost = travelSupplyCost(stepMinutes);
      const stepSuppliesUsed = Math.min(supplies, stepSupplyCost);
      const stepSupplyDeficit = stepSupplyCost - stepSuppliesUsed;
      const stepDelay = travelDelayMinutes(stepMinutes, fatigue, stepSupplyDeficit);
      const stepFatigueGained =
        travelFatigueGain(stepMinutes, step.roadEvent) + stepSupplyDeficit * 4;

      baseMinutes += stepMinutes;
      delayMinutes += stepDelay;
      suppliesNeeded += stepSupplyCost;
      suppliesUsed += stepSuppliesUsed;
      supplyDeficit += stepSupplyDeficit;
      fatigueGained += stepFatigueGained;
      supplies -= stepSuppliesUsed;
      fatigue = Math.min(MAX_FATIGUE, fatigue + stepFatigueGained);
    }

    return {
      baseMinutes,
      delayMinutes,
      elapsedMinutes: baseMinutes + delayMinutes,
      suppliesNeeded,
      suppliesUsed,
      supplyDeficit,
      suppliesAfter: supplies,
      fatigueGained,
      fatigueAfter: fatigue,
      travelConditionAfter: travelCondition(fatigue, supplies),
    };
  }

  private routeWithEstimate(plan: OverworldRoutePlan): OverworldSessionRoutePlan {
    return {
      ...plan,
      estimate: this.estimateRoute(plan),
    };
  }

  private indexedRoute(
    fromId: string,
    destinationId: string,
    allowedNodeIds?: ReadonlySet<string>,
  ): OverworldRoutePlan | null {
    const from = this.nodes.get(fromId);
    if (!from) throw new Error(`Unknown overworld route start "${fromId}".`);
    const destination = this.nodes.get(destinationId);
    if (!destination) throw new Error(`Unknown overworld route destination "${destinationId}".`);
    if (allowedNodeIds && (!allowedNodeIds.has(fromId) || !allowedNodeIds.has(destinationId))) {
      return null;
    }
    if (fromId === destinationId) {
      return { from, destination, steps: [], totalDistanceMi: 0, totalMinutes: 0 };
    }

    const distance = new Map<string, number>([[fromId, 0]]);
    const previous = new Map<string, { from: string; edge: OverworldExit }>();
    const unsettled = new Set<string>(allowedNodeIds ?? this.nodes.keys());

    while (unsettled.size > 0) {
      let current: string | null = null;
      let best = Number.POSITIVE_INFINITY;
      for (const candidate of unsettled) {
        const candidateDistance = distance.get(candidate) ?? Number.POSITIVE_INFINITY;
        if (candidateDistance < best) {
          current = candidate;
          best = candidateDistance;
        }
      }
      if (current === null || best === Number.POSITIVE_INFINITY) break;
      unsettled.delete(current);
      if (current === destinationId) break;

      for (const edge of this.roadsFrom(current)) {
        const next = edge.destination.id;
        if (!unsettled.has(next)) continue;
        const nextDistance = best + edge.travel_minutes;
        if (nextDistance >= (distance.get(next) ?? Number.POSITIVE_INFINITY)) continue;
        distance.set(next, nextDistance);
        previous.set(next, { from: current, edge });
      }
    }

    if (!previous.has(destinationId)) return null;
    const steps: OverworldRouteStep[] = [];
    for (let cursor = destinationId; cursor !== fromId; ) {
      const prev = previous.get(cursor);
      if (!prev) return null;
      const stepFrom = this.nodes.get(prev.from);
      const stepTo = this.nodes.get(cursor);
      if (!stepFrom || !stepTo) return null;
      steps.unshift({
        from: stepFrom,
        to: stepTo,
        edge: prev.edge,
        roadEvent: this.roadEventFor(prev.edge.id),
      });
      cursor = prev.from;
    }

    return {
      from,
      destination,
      steps,
      totalDistanceMi: steps.reduce((sum, step) => sum + step.edge.distance_mi, 0),
      totalMinutes: steps.reduce((sum, step) => sum + step.edge.travel_minutes, 0),
    };
  }

  private discoveredRouteOptions(): OverworldSessionRoutePlan[] {
    if (this.routeOptionsCache) return this.routeOptionsCache;
    const current = this.currentNode();
    const options: OverworldSessionRoutePlan[] = [];
    for (const id of this.discoveredIds) {
      if (id === this.currentId) continue;
      const plan = this.indexedRoute(this.currentId, id, this.discoveredIds);
      if (!plan || plan.steps.length === 0) continue;
      options.push(this.routeWithEstimate(plan));
    }
    options.sort(
      (a, b) =>
        Number(b.destination.region === current.region) -
          Number(a.destination.region === current.region) ||
        a.estimate.elapsedMinutes - b.estimate.elapsedMinutes ||
        a.totalMinutes - b.totalMinutes ||
        b.destination.population_2025 - a.destination.population_2025 ||
        a.destination.name.localeCompare(b.destination.name),
    );
    this.routeOptionsCache = options;
    return options;
  }

  private routeOptionsForView(): OverworldSessionRoutePlan[] {
    const options: OverworldSessionRoutePlan[] = [];
    for (const plan of this.discoveredRouteOptions()) options.push(this.cloneRouteOption(plan));
    return options;
  }

  private cloneRouteOption(plan: OverworldSessionRoutePlan): OverworldSessionRoutePlan {
    return {
      ...plan,
      steps: [...plan.steps],
      estimate: { ...plan.estimate },
    };
  }

  private resolvedAnchorTownIdsForArc(arc: OverworldRegionalArc): Set<string> {
    const resolved = new Set<string>();
    for (const townId of arc.anchor_towns) {
      if (this.resolvedEventHomeIds.has(townId)) resolved.add(townId);
    }
    return resolved;
  }

  private progressForArc(arc: OverworldRegionalArc): OverworldRegionalArcProgress {
    const resolvedAnchorIds = this.resolvedAnchorTownIdsForArc(arc);
    const anchorTowns = this.regionalArcAnchorTownsById.get(arc.id) ?? [];
    const resolvedAnchorTowns: OverworldNode[] = [];
    for (const town of anchorTowns) {
      if (resolvedAnchorIds.has(town.id)) resolvedAnchorTowns.push(town);
    }
    return {
      id: arc.id,
      region: arc.region,
      title: arc.title,
      summary: arc.summary,
      requiredResolutions: arc.required_resolutions,
      resolvedInRegion: resolvedAnchorIds.size,
      anchorTowns,
      resolvedAnchorTowns,
      completed: this.completedRegionalArcIds.has(arc.id),
      reward: arc.reward,
    };
  }

  private cachedRegionalArcProgress(): OverworldRegionalArcProgress[] {
    if (this.regionalArcProgressCache) return this.regionalArcProgressCache;
    this.regionalArcProgressCache = this.buildRegionalArcProgress();
    return this.regionalArcProgressCache;
  }

  private regionalArcProgressForView(): OverworldRegionalArcProgress[] {
    const progress: OverworldRegionalArcProgress[] = [];
    for (const arc of this.cachedRegionalArcProgress()) {
      progress.push(this.cloneRegionalArcProgress(arc));
    }
    return progress;
  }

  private cloneRegionalArcProgress(
    arc: OverworldRegionalArcProgress,
  ): OverworldRegionalArcProgress {
    return {
      ...arc,
      anchorTowns: [...arc.anchorTowns],
      resolvedAnchorTowns: [...arc.resolvedAnchorTowns],
    };
  }

  private buildRegionalArcProgress(): OverworldRegionalArcProgress[] {
    const currentRegion = this.currentNode().region;
    const progress: OverworldRegionalArcProgress[] = [];
    for (const arc of this.world.regional_arcs) progress.push(this.progressForArc(arc));
    progress.sort(
      (a, b) =>
        Number(b.region === currentRegion) - Number(a.region === currentRegion) ||
        Number(a.completed) - Number(b.completed) ||
        a.region.localeCompare(b.region),
    );
    return progress;
  }

  private checkRegionalArcCompletion(region: string): void {
    const completedAt = timeLabel(this.minutes);
    let completedAny = false;
    for (const arc of this.regionalArcsByRegion.get(region) ?? []) {
      if (this.completedRegionalArcIds.has(arc.id)) continue;
      if (this.resolvedAnchorTownIdsForArc(arc).size < arc.required_resolutions) continue;
      this.completedRegionalArcIds.add(arc.id);
      this.addJournalEntry({
        id: `arc:${arc.id}`,
        kind: "regional_arc",
        town: region,
        title: `Completed ${arc.title}`,
        text: arc.reward,
        recordedAt: completedAt,
      });
      completedAny = true;
    }
    if (completedAny) this.clearSnapshotCache();
  }

  private roadEncounterOptions(roadEvent: OverworldRoadEvent): OverworldRoadEncounterOption[] {
    return roadEncounterOptionsFor(roadEvent);
  }

  private setPendingRoadEncounter(
    from: OverworldNode,
    to: OverworldNode,
    edge: OverworldExit,
    roadEvent: OverworldRoadEvent | null,
  ): void {
    if (!roadEvent) {
      this.pendingRoadEncounter = null;
      return;
    }
    this.pendingRoadEncounter = this.buildPendingRoadEncounter(
      from,
      to,
      edge,
      roadEvent,
      this.minutes,
    );
  }

  private buildPendingRoadEncounter(
    from: OverworldNode,
    to: OverworldNode,
    edge: OverworldEdge,
    roadEvent: OverworldRoadEvent,
    arrivedAtMinutes: number,
  ): OverworldPendingRoadEncounter {
    return {
      id: `road:${edge.id}:${arrivedAtMinutes}`,
      edgeId: edge.id,
      from: from.name,
      to: to.name,
      route: edge.route,
      arrivedAt: timeLabel(arrivedAtMinutes),
      event: roadEvent,
      options: this.roadEncounterOptions(roadEvent),
    };
  }

  private cachedCompactView(): OverworldCompactView {
    if (this.compactViewCache) return this.compactViewCache;
    this.compactViewCache = this.buildCompactView();
    return this.compactViewCache;
  }

  compactView(): OverworldCompactView {
    return cloneOverworldCompactView(this.cachedCompactView());
  }

  private sortedDiscoveredTownsByPopulation(): OverworldNode[] {
    const discoveredTowns: OverworldNode[] = [];
    for (const id of this.discoveredIds) {
      const town = this.nodes.get(id);
      if (town) discoveredTowns.push(town);
    }
    discoveredTowns.sort(
      (a, b) => b.population_2025 - a.population_2025 || a.name.localeCompare(b.name),
    );
    return discoveredTowns;
  }

  private buildCompactView(): OverworldCompactView {
    const current = this.currentNode();
    const currentArea = this.currentArea();
    const areaRoutes: OverworldCompactAreaRoute[] = [];
    for (const exit of this.visibleAreaExits()) {
      areaRoutes.push([exit.id, exit.destination.id, exit.travel_minutes]);
    }
    const routeOptions = this.discoveredRouteOptions();
    const compactRouteOptions: OverworldCompactRouteOption[] = [];
    for (
      let index = 0;
      index < routeOptions.length && index < OVERWORLD_COMPACT_ROUTE_LIMIT;
      index += 1
    ) {
      compactRouteOptions.push(compactRouteOption(routeOptions[index]!));
    }
    const routeByDestination = new Map<string, OverworldSessionRoutePlan>();
    for (const plan of routeOptions) routeByDestination.set(plan.destination.id, plan);
    const discoveredTownIds = compactSortedTownIdsByPopulation(this.discoveredIds, this.nodes);
    const idPayload = compactIdPayloadFromBuckets({
      discovered_towns: { ids: discoveredTownIds, count: this.discoveredIds.size },
      discovered_areas: compactSortedStringSet(this.discoveredAreaIds),
      visited_areas: compactSortedStringSet(this.visitedAreaIds),
      discovered_jobs: compactSortedStringSet(this.discoveredJobIds),
      completed_jobs: compactSortedStringSet(this.completedJobIds),
      discovered_sites: compactSortedStringSet(this.discoveredSiteIds),
      explored_sites: compactSortedStringSet(this.exploredSiteIds),
      discovered_quests: compactSortedStringSet(this.discoveredQuestIds),
      started_quests: compactSortedStringSet(this.startedQuestIds),
      completed_quests: compactSortedStringSet(this.completedQuestIds),
      resolved_events: compactSortedStringSet(this.resolvedEventIds),
    });
    const exits = this.roadsFrom(this.currentId);
    const jobs = compactOverworldTitleRefs(this.discoveredJobsInCurrentArea());
    const sites = compactOverworldTitleRefs(this.discoveredSitesInCurrentArea());
    const quests = compactOverworldQuestRefs(this.discoveredQuestsAt(this.currentId));
    const pendingRoad = compactPendingRoad(this.pendingRoadEncounter);
    const journal = compactOverworldJournalEntries(this.journalEntries);
    const travelLog: OverworldCompactTravelLogEntry[] = [];
    for (
      let index = 0;
      index < this.travelLog.length && index < OVERWORLD_COMPACT_TRAVEL_LOG_LIMIT;
      index += 1
    ) {
      travelLog.push(compactTravelLogEntry(this.travelLog[index]!));
    }
    const renown = compactOverworldRenownEntries(sortedNumberMap(this.regionRenown));
    const completedArcs = sortedStringSet(this.completedRegionalArcIds);
    const roads: OverworldCompactRoad[] = [];
    for (const exit of exits) {
      const plan = routeByDestination.get(exit.destination.id);
      roads.push([
        exit.id,
        exit.destination.id,
        plan?.estimate.elapsedMinutes ?? exit.travel_minutes,
        plan?.estimate.suppliesNeeded ?? 0,
        plan?.estimate.fatigueAfter ?? this.fatigue,
      ]);
    }
    const areas = compactOverworldRefs(this.discoveredAreasAt(this.currentId));
    const poi = compactOverworldTitleRefs(this.currentAreaPois());
    const contacts = compactOverworldRefs(this.currentAreaCharacters());
    const events = compactOverworldTitleRefs(this.currentAreaEvents());

    return {
      v: OVERWORLD_COMPACT_VIEW_VERSION,
      world: compactOverworldLabel(this.world.name),
      time: timeLabel(this.minutes),
      here: [
        current.id,
        compactOverworldLabel(current.name),
        compactOverworldLabel(current.region),
        currentArea?.id ?? null,
        currentArea ? compactOverworldLabel(currentArea.name) : null,
      ],
      vitals: [
        this.supplies,
        MAX_SUPPLIES,
        this.fatigue,
        travelCondition(this.fatigue, this.supplies),
      ],
      hidden: [
        this.hiddenAreaCountAt(this.currentId),
        this.hiddenJobCountAt(this.currentId),
        this.hiddenSiteCountInCurrentArea(),
        this.hiddenQuestCountAt(this.currentId),
      ],
      roads,
      ...(areaRoutes.length > 0 ? { area_routes: areaRoutes } : {}),
      route_options: compactRouteOptions,
      ...(routeOptions.length > compactRouteOptions.length
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
      ...(this.travelLog.length > travelLog.length ? { travel_log_truncated: true as const } : {}),
      progress: [this.visitedIds.size, this.world.nodes.length],
      ...(renown.length > 0 ? { renown } : {}),
      ...(completedArcs.length > 0 ? { completed_arcs: completedArcs } : {}),
      id_counts: idPayload.id_counts,
      ...(idPayload.ids_truncated ? { ids_truncated: idPayload.ids_truncated } : {}),
      ids: idPayload.ids,
    };
  }

  private cachedView(): OverworldView {
    if (this.viewCache) return this.viewCache;
    this.viewCache = this.buildView();
    return this.viewCache;
  }

  private cloneView(view: OverworldView): OverworldView {
    return {
      ...view,
      areaExits: view.areaExits.map((exit) => ({ ...exit })),
      exits: view.exits.map((exit) => ({ ...exit })),
      areas: [...view.areas],
      pois: [...view.pois],
      characters: [...view.characters],
      events: [...view.events],
      jobs: [...view.jobs],
      sites: [...view.sites],
      quests: view.quests.map((quest) => ({ ...quest })),
      routeOptions: view.routeOptions.map((plan) => this.cloneRouteOption(plan)),
      discovered: [...view.discovered],
      journal: view.journal.map((entry) => ({ ...entry })),
      discoveredAreaIds: [...view.discoveredAreaIds],
      discoveredJobIds: [...view.discoveredJobIds],
      visitedAreaIds: [...view.visitedAreaIds],
      completedJobIds: [...view.completedJobIds],
      discoveredSiteIds: [...view.discoveredSiteIds],
      discoveredQuestIds: [...view.discoveredQuestIds],
      startedQuestIds: [...view.startedQuestIds],
      completedQuestIds: [...view.completedQuestIds],
      exploredSiteIds: [...view.exploredSiteIds],
      resolvedEventIds: [...view.resolvedEventIds],
      regionRenown: { ...view.regionRenown },
      regionalArcs: view.regionalArcs.map((arc) => this.cloneRegionalArcProgress(arc)),
      completedRegionalArcIds: [...view.completedRegionalArcIds],
      pendingRoadEncounter: view.pendingRoadEncounter
        ? {
            ...view.pendingRoadEncounter,
            options: view.pendingRoadEncounter.options.map((option) => ({ ...option })),
          }
        : null,
      log: view.log.map((entry) => ({ ...entry })),
    };
  }

  view(): OverworldView {
    return this.cloneView(this.cachedView());
  }

  private buildView(): OverworldView {
    const current = this.currentNode();
    return {
      world: this.world.name,
      timeLabel: timeLabel(this.minutes),
      current,
      currentArea: this.currentArea(),
      areaExits: this.visibleAreaExits(),
      exits: this.roadsFrom(this.currentId),
      areas: this.discoveredAreasAt(this.currentId),
      hiddenAreaCount: this.hiddenAreaCountAt(this.currentId),
      pois: this.currentAreaPois(),
      characters: this.currentAreaCharacters(),
      events: this.currentAreaEvents(),
      jobs: this.discoveredJobsInCurrentArea(),
      hiddenJobCount: this.hiddenJobCountAt(this.currentId),
      sites: this.discoveredSitesInCurrentArea(),
      hiddenSiteCount: this.hiddenSiteCountInCurrentArea(),
      quests: this.discoveredQuestsAt(this.currentId),
      hiddenQuestCount: this.hiddenQuestCountAt(this.currentId),
      routeOptions: this.routeOptionsForView(),
      discovered: this.sortedDiscoveredTownsByPopulation(),
      visitedCount: this.visitedIds.size,
      totalTowns: this.world.nodes.length,
      supplies: this.supplies,
      maxSupplies: MAX_SUPPLIES,
      fatigue: this.fatigue,
      travelCondition: travelCondition(this.fatigue, this.supplies),
      journal: [...this.journalEntries],
      discoveredAreaIds: [...this.discoveredAreaIds].sort(),
      discoveredJobIds: [...this.discoveredJobIds].sort(),
      visitedAreaIds: [...this.visitedAreaIds].sort(),
      completedJobIds: [...this.completedJobIds].sort(),
      discoveredSiteIds: [...this.discoveredSiteIds].sort(),
      discoveredQuestIds: [...this.discoveredQuestIds].sort(),
      startedQuestIds: [...this.startedQuestIds].sort(),
      completedQuestIds: [...this.completedQuestIds].sort(),
      exploredSiteIds: [...this.exploredSiteIds].sort(),
      resolvedEventIds: [...this.resolvedEventIds].sort(),
      regionRenown: sortedNumberRecord(this.regionRenown),
      regionalArcs: this.regionalArcProgressForView(),
      completedRegionalArcIds: [...this.completedRegionalArcIds].sort(),
      pendingRoadEncounter: this.pendingRoadEncounter,
      log: [...this.travelLog],
    };
  }

  startQuest(questId: string): OverworldQuestView {
    const quest = this.questsById.get(questId);
    if (!quest || quest.home !== this.currentId)
      throw new Error("That quest lead is not in this town.");
    if (!this.discoveredQuestIds.has(quest.id)) {
      throw new Error("Discover that local quest lead before starting it.");
    }
    if (this.startedQuestIds.has(quest.id)) {
      throw new Error(`Quest ${quest.title} has already been started from this overworld session.`);
    }
    const area = this.currentArea();
    if (area?.id !== quest.area) {
      throw new Error(`Move to ${this.questAreaName(quest)} before starting ${quest.title}.`);
    }
    const result = this.recordAction(
      {
        id: `quest:${quest.id}`,
        kind: "quest",
        town: this.currentNode().name,
        title: `Started ${quest.title}`,
        text: `You turn the local lead "${quest.discovery}" into an active quest.`,
      },
      0,
    );
    if (!result.alreadyKnown) {
      this.startedQuestIds.add(quest.id);
      this.clearSnapshotCache();
    }
    return questView(quest);
  }

  completeQuest(
    questId: string,
    outcome: { endingId: string; endingTitle: string; death: boolean },
  ): OverworldQuestCompletionResult {
    const quest = this.questsById.get(questId);
    if (!quest) throw new Error(`Unknown overworld quest "${questId}".`);
    if (!this.startedQuestIds.has(quest.id)) {
      throw new Error("Start that local quest lead before completing it.");
    }
    if (outcome.death) {
      throw new Error("A death ending does not complete the overworld quest.");
    }
    const result = this.recordAction(
      {
        id: `quest_done:${quest.id}`,
        kind: "quest_done",
        town: this.nodes.get(quest.home)?.name ?? quest.home,
        title: `Completed ${quest.title}`,
        text: `The quest closed at ${outcome.endingTitle}.`,
      },
      0,
    );
    if (!result.alreadyKnown) {
      this.completedQuestIds.add(quest.id);
      this.clearSnapshotCache();
    }
    return {
      minutes: result.minutes,
      alreadyKnown: result.alreadyKnown,
      quest: questView(quest),
      endingId: outcome.endingId,
      endingTitle: outcome.endingTitle,
      entry: result.entry,
    };
  }

  scoutPoi(poiId: string): OverworldActionResult {
    const current = this.currentNode();
    const poi = this.poisById.get(poiId);
    if (!poi || poi.home !== this.currentId) {
      throw new Error("That point of interest is not in this town.");
    }
    if (poi.area !== this.currentAreaIdOrThrow()) {
      throw new Error("Move to that local area before scouting this point of interest.");
    }
    const result = this.recordLocalAction(describeOverworldPoiAction(poi, current), current.name);
    return {
      ...result,
      discoveredAreas: result.alreadyKnown ? [] : this.discoverNextAreaForTown(current.id),
      discoveredJobs: result.alreadyKnown ? [] : this.discoverNextJobForTown(current.id),
      discoveredSites: result.alreadyKnown ? [] : this.discoverNextSiteForTown(current.id),
      discoveredQuests: result.alreadyKnown ? [] : this.discoverNextQuestForTown(current.id),
    };
  }

  exploreArea(areaId: string): OverworldActionResult {
    const current = this.currentNode();
    const area = this.areaById(areaId);
    if (!area || area.home !== this.currentId) throw new Error("That area is not in this town.");
    if (!this.discoveredAreaIds.has(area.id)) {
      throw new Error("Scout, talk, investigate, or explore known areas to map that district.");
    }
    if (this.currentArea()?.id !== area.id) {
      throw new Error("Move to that local area before exploring it.");
    }
    if (this.visitedAreaIds.has(area.id)) {
      const existing = this.journalEntry(`area:${area.id}`);
      if (existing) {
        return {
          minutes: 0,
          alreadyKnown: true,
          entry: existing,
          discoveredAreas: [],
          discoveredJobs: [],
          discoveredSites: [],
          discoveredQuests: [],
        };
      }
    }

    const result = this.recordLocalAction(describeOverworldAreaAction(area), current.name);
    if (!result.alreadyKnown) this.visitedAreaIds.add(area.id);
    return {
      ...result,
      discoveredAreas: result.alreadyKnown ? [] : this.discoverNextAreaForTown(current.id),
      discoveredJobs: result.alreadyKnown ? [] : this.discoverNextJobForTown(current.id),
      discoveredSites: result.alreadyKnown ? [] : this.discoverNextSiteForTown(current.id),
      discoveredQuests: result.alreadyKnown ? [] : this.discoverNextQuestForTown(current.id),
    };
  }

  moveArea(areaRouteId: string): OverworldAreaTravelResult {
    const currentArea = this.currentArea();
    if (!currentArea) throw new Error("There is no current local area in this town.");
    const edge = this.areaExitFrom(currentArea.id, areaRouteId);
    if (!edge) throw new Error("That local route is not reachable from here.");
    if (!this.discoveredAreaIds.has(edge.destination.id)) {
      throw new Error("Map that local area before moving there.");
    }
    this.minutes += edge.travel_minutes;
    this.currentAreaId = edge.destination.id;
    this.currentAreaByTown.set(this.currentId, edge.destination.id);
    this.clearSnapshotCache();
    return {
      from: currentArea,
      to: edge.destination,
      route: edge.route,
      minutes: edge.travel_minutes,
      arrivedAt: timeLabel(this.minutes),
    };
  }

  workLocalJob(jobId: string): OverworldActionResult {
    const current = this.currentNode();
    const job = this.jobsById.get(jobId);
    if (!job || job.home !== this.currentId) {
      throw new Error("That local job is not in this town.");
    }
    if (!this.discoveredJobIds.has(job.id)) {
      throw new Error("Explore local areas or talk to locals before working that job.");
    }
    if (job.area !== this.currentAreaIdOrThrow()) {
      throw new Error("Move to that local area before working that job.");
    }
    if (this.completedJobIds.has(job.id)) {
      const existing = this.journalEntry(`job:${job.id}`);
      if (existing) {
        return {
          minutes: 0,
          alreadyKnown: true,
          entry: existing,
          discoveredAreas: [],
          discoveredJobs: [],
          discoveredSites: [],
          discoveredQuests: [],
        };
      }
    }

    const area = this.areaById(job.area);
    const action = describeOverworldJobAction(job, area ?? null);
    const result = this.recordLocalAction(action, current.name);
    if (!result.alreadyKnown) {
      this.completedJobIds.add(job.id);
      this.regionRenown.set(
        current.region,
        (this.regionRenown.get(current.region) ?? 0) + (action.regionalRenown ?? 0),
      );
      this.clearSnapshotCache();
    }
    return {
      ...result,
      discoveredAreas: result.alreadyKnown ? [] : this.discoverNextAreaForTown(current.id),
      discoveredJobs: result.alreadyKnown ? [] : this.discoverNextJobForTown(current.id),
      discoveredSites: result.alreadyKnown ? [] : this.discoverNextSiteForTown(current.id),
      discoveredQuests: result.alreadyKnown ? [] : this.discoverNextQuestForTown(current.id),
    };
  }

  talkToCharacter(characterId: string): OverworldActionResult {
    const current = this.currentNode();
    const character = this.charactersById.get(characterId);
    if (!character || character.home !== this.currentId) {
      throw new Error("That contact is not in this town.");
    }
    if (character.area !== this.currentAreaIdOrThrow()) {
      throw new Error("Move to that local area before talking to that contact.");
    }
    const result = this.recordLocalAction(describeOverworldContactAction(character), current.name);
    return {
      ...result,
      discoveredAreas: result.alreadyKnown ? [] : this.discoverNextAreaForTown(current.id),
      discoveredJobs: result.alreadyKnown ? [] : this.discoverNextJobForTown(current.id),
      discoveredSites: result.alreadyKnown ? [] : this.discoverNextSiteForTown(current.id),
      discoveredQuests: result.alreadyKnown ? [] : this.discoverNextQuestForTown(current.id),
    };
  }

  investigateEvent(eventId: string): OverworldActionResult {
    const current = this.currentNode();
    const event = this.localEventsById.get(eventId);
    if (!event || event.home !== this.currentId) {
      throw new Error("That event is not active in this town.");
    }
    if (event.area !== this.currentAreaIdOrThrow()) {
      throw new Error("Move to that local area before investigating that event.");
    }
    const result = this.recordLocalAction(describeOverworldEventAction(event), current.name);
    return {
      ...result,
      discoveredAreas: result.alreadyKnown ? [] : this.discoverNextAreaForTown(current.id),
      discoveredJobs: result.alreadyKnown ? [] : this.discoverNextJobForTown(current.id),
      discoveredSites: result.alreadyKnown ? [] : this.discoverNextSiteForTown(current.id),
      discoveredQuests: result.alreadyKnown ? [] : this.discoverNextQuestForTown(current.id),
    };
  }

  resolveEvent(eventId: string): OverworldActionResult {
    const current = this.currentNode();
    const event = this.localEventsById.get(eventId);
    if (!event || event.home !== this.currentId) {
      throw new Error("That event is not active in this town.");
    }
    if (event.area !== this.currentAreaIdOrThrow()) {
      throw new Error("Move to that local area before resolving that event.");
    }
    if (this.resolvedEventIds.has(event.id)) {
      const existing = this.journalEntry(`resolve:${event.id}`);
      if (existing) return { minutes: 0, alreadyKnown: true, entry: existing };
    }

    const scoutedPoi = (this.poisByArea.get(event.area) ?? []).some((poi) =>
      this.hasJournalEntry(`scout:${poi.id}`),
    );
    const talkedContact = (this.charactersByArea.get(event.area) ?? []).some((character) =>
      this.hasJournalEntry(`talk:${character.id}`),
    );
    const investigatedEvent = this.hasJournalEntry(`investigate:${event.id}`);
    const missing = [
      !scoutedPoi ? "scout a local point of interest" : null,
      !talkedContact ? "talk to a local contact" : null,
      !investigatedEvent ? "investigate the event" : null,
    ].filter((step): step is string => step !== null);
    if (missing.length > 0) {
      throw new Error(`Before resolving this event, ${missing.join(", ")}.`);
    }

    const result = this.recordAction(
      {
        id: `resolve:${event.id}`,
        kind: "resolution",
        town: current.name,
        title: `Resolved ${event.title}`,
        text: `${current.name} stabilizes around ${event.title}. Your work reduces ${event.pressure} pressure and earns ${event.intensity} ${current.region} renown.`,
      },
      30 + event.intensity * 10,
    );
    if (!result.alreadyKnown) {
      this.markEventResolved(event);
      this.regionRenown.set(
        current.region,
        (this.regionRenown.get(current.region) ?? 0) + event.intensity,
      );
      this.checkRegionalArcCompletion(current.region);
      this.clearSnapshotCache();
    }
    return {
      ...result,
      discoveredAreas: result.alreadyKnown ? [] : this.discoverNextAreaForTown(current.id),
      discoveredJobs: result.alreadyKnown ? [] : this.discoverNextJobForTown(current.id),
      discoveredSites: result.alreadyKnown ? [] : this.discoverNextSiteForTown(current.id),
      discoveredQuests: result.alreadyKnown ? [] : this.discoverNextQuestForTown(current.id),
    };
  }

  exploreSite(siteId: string): OverworldActionResult {
    const current = this.currentNode();
    const site = this.sitesById.get(siteId);
    if (!site || site.nearest_town !== this.currentId) {
      throw new Error("That exploration site is not reachable from this town.");
    }
    if (site.area !== this.currentAreaIdOrThrow()) {
      throw new Error("Move to that local area before exploring this site.");
    }
    if (!this.discoveredSiteIds.has(site.id)) {
      throw new Error("Scout a local point of interest before exploring this site.");
    }
    if (this.exploredSiteIds.has(site.id)) {
      const existing = this.journalEntry(`site:${site.id}`);
      if (existing) return { minutes: 0, alreadyKnown: true, entry: existing };
    }

    const action = describeOverworldSiteAction(site);
    const result = this.recordLocalAction(action, current.name);
    if (!result.alreadyKnown) {
      this.exploredSiteIds.add(site.id);
      this.regionRenown.set(
        site.region,
        (this.regionRenown.get(site.region) ?? 0) + (action.regionalRenown ?? 0),
      );
      this.clearSnapshotCache();
    }
    return {
      ...result,
      discoveredAreas: result.alreadyKnown ? [] : this.discoverNextAreaForTown(current.id),
      discoveredJobs: result.alreadyKnown ? [] : this.discoverNextJobForTown(current.id),
      discoveredSites: result.alreadyKnown ? [] : this.discoverNextSiteForTown(current.id),
      discoveredQuests: result.alreadyKnown ? [] : this.discoverNextQuestForTown(current.id),
    };
  }

  restAtTown(): OverworldServiceResult {
    const current = this.currentNode();
    if (!current.services.includes("inn") && !current.services.includes("healer")) {
      throw new Error("There is no inn or healer here to rest safely.");
    }
    const fatigueBefore = this.fatigue;
    const suppliesBefore = this.supplies;
    if (fatigueBefore === 0) {
      return {
        action: "rest",
        minutes: 0,
        changed: false,
        suppliesBefore,
        suppliesAfter: this.supplies,
        fatigueBefore,
        fatigueAfter: this.fatigue,
        message: "You are already rested.",
        entry: null,
      };
    }
    const minutes = Math.max(180, Math.ceil(fatigueBefore / 20) * 60);
    this.fatigue = 0;
    const entry = this.recordRepeatableEntry(
      {
        id: "service:rest",
        kind: "service",
        town: current.name,
        title: `Rested in ${current.name}`,
        text: `You spend ${minutes} minutes recovering at a safe local service. Fatigue falls from ${fatigueBefore} to 0.`,
      },
      minutes,
    );
    return {
      action: "rest",
      minutes,
      changed: true,
      suppliesBefore,
      suppliesAfter: this.supplies,
      fatigueBefore,
      fatigueAfter: this.fatigue,
      message: entry.text,
      entry,
    };
  }

  resupplyAtTown(): OverworldServiceResult {
    const current = this.currentNode();
    if (
      !current.services.includes("market") &&
      !current.services.includes("inn") &&
      !current.services.includes("stable")
    ) {
      throw new Error("There is no market, inn, or stable here to resupply.");
    }
    const fatigueBefore = this.fatigue;
    const suppliesBefore = this.supplies;
    if (suppliesBefore >= MAX_SUPPLIES) {
      return {
        action: "resupply",
        minutes: 0,
        changed: false,
        suppliesBefore,
        suppliesAfter: this.supplies,
        fatigueBefore,
        fatigueAfter: this.fatigue,
        message: "Your supplies are already full.",
        entry: null,
      };
    }
    this.supplies = MAX_SUPPLIES;
    const minutes = 45;
    const entry = this.recordRepeatableEntry(
      {
        id: "service:resupply",
        kind: "service",
        town: current.name,
        title: `Resupplied in ${current.name}`,
        text: `You spend ${minutes} minutes buying food, lamp oil, and road gear. Supplies rise from ${suppliesBefore} to ${MAX_SUPPLIES}.`,
      },
      minutes,
    );
    return {
      action: "resupply",
      minutes,
      changed: true,
      suppliesBefore,
      suppliesAfter: this.supplies,
      fatigueBefore,
      fatigueAfter: this.fatigue,
      message: entry.text,
      entry,
    };
  }

  planRoute(destinationId: string): OverworldSessionRoutePlan {
    if (destinationId === this.currentId) throw new Error("You are already there.");
    if (!this.discoveredIds.has(destinationId)) {
      throw new Error("That destination is not discovered yet.");
    }
    const plan = this.indexedRoute(this.currentId, destinationId, this.discoveredIds);
    if (!plan) throw new Error("No discovered route reaches that destination yet.");
    return this.routeWithEstimate(plan);
  }

  resolveRoadEncounter(strategy: OverworldRoadEncounterStrategy): OverworldRoadEncounterResult {
    const encounter = this.pendingRoadEncounter;
    if (!encounter) throw new Error("There is no pending road encounter.");
    const option = encounter.options.find((candidate) => candidate.strategy === strategy);
    if (!option) throw new Error(`Unknown road encounter strategy "${strategy}".`);

    const suppliesUsed = Math.min(this.supplies, option.suppliesCost);
    const supplyDeficit = option.suppliesCost - suppliesUsed;
    const fatigueGained = option.fatigueGained + supplyDeficit * 3;
    this.supplies -= suppliesUsed;
    this.fatigue = Math.min(MAX_FATIGUE, this.fatigue + fatigueGained);
    this.minutes += option.minutes;
    const current = this.currentNode();
    if (option.renownGained > 0) {
      this.regionRenown.set(
        current.region,
        (this.regionRenown.get(current.region) ?? 0) + option.renownGained,
      );
    }
    this.pendingRoadEncounter = null;
    const entry: OverworldJournalEntry = {
      id: `${encounter.id}:${strategy}`,
      kind: "road",
      town: current.name,
      title: `${option.label}: ${encounter.event.title}`,
      text: `${encounter.event.summary} ${option.outcome}${supplyDeficit > 0 ? " Lacking supplies made the work more exhausting." : ""}`,
      recordedAt: timeLabel(this.minutes),
    };
    this.addJournalEntry(entry);
    this.clearSnapshotCache();
    return {
      strategy,
      minutes: option.minutes,
      suppliesUsed,
      fatigueGained,
      renownGained: option.renownGained,
      encounter,
      entry,
    };
  }

  travel(edgeId: string): TravelLogEntry {
    if (this.pendingRoadEncounter) {
      throw new Error("Address the pending road encounter before choosing another road.");
    }
    const edge = this.roadFrom(this.currentId, edgeId);
    if (!edge) throw new Error("That road is not reachable from here.");
    const from = this.currentNode();
    const roadEvent = this.roadEventFor(edge.id);
    const supplyCost = travelSupplyCost(edge.travel_minutes);
    const suppliesUsed = Math.min(this.supplies, supplyCost);
    const supplyDeficit = supplyCost - suppliesUsed;
    const fatigueBefore = this.fatigue;
    const delayMinutes = travelDelayMinutes(edge.travel_minutes, fatigueBefore, supplyDeficit);
    const elapsedMinutes = edge.travel_minutes + delayMinutes;
    const fatigueGained = travelFatigueGain(edge.travel_minutes, roadEvent) + supplyDeficit * 4;
    this.supplies -= suppliesUsed;
    this.fatigue = Math.min(MAX_FATIGUE, this.fatigue + fatigueGained);
    this.minutes += elapsedMinutes;
    this.currentId = edge.destination.id;
    this.markSeen(this.currentId);
    this.setPendingRoadEncounter(from, edge.destination, edge, roadEvent);
    const entry: TravelLogEntry = {
      edgeId: edge.id,
      fromId: from.id,
      toId: edge.destination.id,
      from: from.name,
      to: edge.destination.name,
      route: edge.route,
      distanceMi: edge.distance_mi,
      baseMinutes: edge.travel_minutes,
      delayMinutes,
      minutes: elapsedMinutes,
      arrivedAt: this.minutes,
      suppliesUsed,
      suppliesAfter: this.supplies,
      fatigueGained,
      fatigueAfter: this.fatigue,
      roadEvent,
    };
    this.travelLog.unshift(entry);
    this.clearSnapshotCache();
    return entry;
  }
}
