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
  OVERWORLD_MAX_SUPPLIES as MAX_SUPPLIES,
  OVERWORLD_STARTING_MINUTES as STARTING_MINUTES,
  OVERWORLD_STARTING_SUPPLIES as STARTING_SUPPLIES,
  resolveOverworldTravelLeg,
  travelCondition,
  type OverworldRoadEncounterStrategy,
} from "./travel_mechanics.js";
import {
  cloneOverworldRouteOption,
  indexedOverworldRoute,
  withOverworldRouteEstimate,
  type OverworldRoutePlannerIndex,
  type OverworldSessionRoutePlan,
} from "./session_routes.js";
import {
  buildOverworldPendingRoadEncounter,
  resolveOverworldRoadEncounter,
  type OverworldRoadEncounterResult,
} from "./session_road_encounters.js";
import { timeLabel } from "./session_journal_codec.js";
import { assertSnapshotTimeline } from "./session_journal_timeline.js";
import {
  assertSnapshotEventResolutionProofs,
  assertSnapshotRegionalArcCompletionProofs,
} from "./session_event_resolution.js";
import {
  assertSnapshotDiscoveredAreaCountReplay,
  assertSnapshotDiscoveredLocalSourceCountReplay,
  assertSnapshotDiscoveryLocality,
  assertSnapshotLocalActionDiscoveryChronology,
  assertSnapshotLocalActionJournalReachability,
  localActionJournalReplayIndex,
} from "./session_local_action_journal.js";
import {
  emptyOverworldLocalDiscovery,
  planOverworldLocalDiscovery,
  questView,
  type OverworldLocalDiscoveryResult,
  type OverworldQuestView,
} from "./session_local_discovery.js";
import {
  buildOverworldSnapshotManifestIndex,
  type OverworldSnapshotManifestIndex,
} from "./session_manifest_index.js";
import {
  buildOverworldRegionalArcProgress,
  cloneOverworldRegionalArcProgress,
  indexOverworldRegionalArcAnchorTowns,
  indexOverworldRegionalArcsByRegion,
  regionalArcCompletionsForRegion,
  type OverworldRegionalArcProgress,
} from "./session_regional_arcs.js";
import {
  planOverworldTownRest,
  planOverworldTownResupply,
  type OverworldServicePlan,
  type OverworldServiceResult,
} from "./session_services.js";
import {
  assertSnapshotProgressJournalBindings,
  assertStringSetSubset,
  type OverworldProgressJournalSourceIndex,
} from "./session_progress_journal.js";
import { assertSnapshotRegionRenown } from "./session_region_renown.js";
import {
  assertSnapshotResourceReplay,
  roadJournalResolutionIndex,
} from "./session_resource_replay.js";
import {
  assertSnapshotCurrentAreaMapExact,
  assertSnapshotDiscoveredAreaPrefix,
  assertSnapshotDiscoveredLocalSourcePrefixes,
  assertSnapshotDiscoveredTownFrontier,
  assertSnapshotPendingRoadEncounterBinding,
  assertSnapshotPendingRoadEncounterUnresolved,
  assertSnapshotTravelPathContinuity,
  assertSnapshotVisitedTownTravelProof,
} from "./session_snapshot_proofs.js";
import { snapshotTravelTimelineIndex } from "./session_snapshot_timeline.js";
import {
  OVERWORLD_SESSION_SAVE_VERSION,
  OverworldSessionSnapshotSchema,
  cloneJournalEntries,
  cloneOverworldSessionSnapshot,
  snapshotTravelLogEntries,
  type OverworldJournalEntry,
  type OverworldPendingRoadEncounter,
  type OverworldSessionSnapshot,
  type TravelLogEntry,
  type TravelLogEntrySnapshot,
} from "./session_snapshot.js";

export type {
  OverworldRoadEncounterOption,
  OverworldRoadEncounterStrategy,
} from "./travel_mechanics.js";
export type { OverworldRouteEstimate, OverworldSessionRoutePlan } from "./session_routes.js";
export type { OverworldRoadEncounterResult } from "./session_road_encounters.js";
export type { OverworldRegionalArcProgress } from "./session_regional_arcs.js";
export type { OverworldServiceResult } from "./session_services.js";
export type { OverworldQuestView } from "./session_local_discovery.js";
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
  private readonly sitesByArea: Map<string, OverworldExplorationSite[]>;
  private readonly questsById: Map<string, OverworldQuest>;
  private readonly questsByTown: Map<string, OverworldQuest[]>;
  private readonly regionalArcsByRegion: Map<string, OverworldRegionalArc[]>;
  private readonly regionalArcAnchorTownsById: Map<string, OverworldNode[]>;
  private readonly routePlannerIndex: OverworldRoutePlannerIndex;
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
    this.regionalArcsByRegion = indexOverworldRegionalArcsByRegion(world.regional_arcs);
    this.regionalArcAnchorTownsById = indexOverworldRegionalArcAnchorTowns(
      world.regional_arcs,
      this.nodes,
    );
    this.routePlannerIndex = {
      nodes: this.nodes,
      roadEventsByEdgeId: this.roadEventsByEdgeId,
      roadExitsByTown: this.roadExitsByTown,
    };
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
      restoredPendingRoadEncounter = buildOverworldPendingRoadEncounter(
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

  private applyServicePlan(plan: OverworldServicePlan): OverworldServiceResult {
    const { entryDraft, ...result } = plan;
    if (!result.changed) return { ...result, entry: null };
    if (!entryDraft) {
      throw new Error("Changed overworld service plan is missing a journal entry.");
    }
    this.supplies = plan.suppliesAfter;
    this.fatigue = plan.fatigueAfter;
    const entry = this.recordRepeatableEntry(entryDraft, plan.minutes);
    return {
      ...result,
      message: entry.text,
      entry,
    };
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

  private questAreaName(quest: OverworldQuest): string {
    return this.areaById(quest.area)?.name ?? quest.area;
  }

  private applyLocalDiscovery(discovery: OverworldLocalDiscoveryResult): void {
    let changed = false;
    for (const area of discovery.discoveredAreas) {
      if (this.discoveredAreaIds.has(area.id)) continue;
      this.discoveredAreaIds.add(area.id);
      changed = true;
    }
    for (const job of discovery.discoveredJobs) {
      if (this.discoveredJobIds.has(job.id)) continue;
      this.discoveredJobIds.add(job.id);
      changed = true;
    }
    for (const site of discovery.discoveredSites) {
      if (this.discoveredSiteIds.has(site.id)) continue;
      this.discoveredSiteIds.add(site.id);
      changed = true;
    }
    for (const quest of discovery.discoveredQuests) {
      if (this.discoveredQuestIds.has(quest.id)) continue;
      this.discoveredQuestIds.add(quest.id);
      changed = true;
    }
    if (changed) this.clearSnapshotCache();
  }

  private discoverLocalProgressForTown(nodeId: string): OverworldLocalDiscoveryResult {
    const discovery = planOverworldLocalDiscovery({
      townId: nodeId,
      currentTownId: this.currentId,
      areasByTown: this.areasByTown,
      jobsByTown: this.jobsByTown,
      currentAreaSites: nodeId === this.currentId ? this.currentAreaSites() : [],
      questsByTown: this.questsByTown,
      discoveredAreaIds: this.discoveredAreaIds,
      discoveredJobIds: this.discoveredJobIds,
      discoveredSiteIds: this.discoveredSiteIds,
      discoveredQuestIds: this.discoveredQuestIds,
    });
    this.applyLocalDiscovery(discovery);
    return discovery;
  }

  private withLocalDiscovery(result: OverworldActionResult, nodeId: string): OverworldActionResult {
    const discovery = result.alreadyKnown
      ? emptyOverworldLocalDiscovery()
      : this.discoverLocalProgressForTown(nodeId);
    return {
      ...result,
      ...discovery,
    };
  }

  private routeWithEstimate(plan: OverworldRoutePlan): OverworldSessionRoutePlan {
    return withOverworldRouteEstimate(plan, {
      fatigue: this.fatigue,
      supplies: this.supplies,
    });
  }

  private discoveredRouteOptions(): OverworldSessionRoutePlan[] {
    if (this.routeOptionsCache) return this.routeOptionsCache;
    const current = this.currentNode();
    const options: OverworldSessionRoutePlan[] = [];
    for (const id of this.discoveredIds) {
      if (id === this.currentId) continue;
      const plan = indexedOverworldRoute(
        this.routePlannerIndex,
        this.currentId,
        id,
        this.discoveredIds,
      );
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
    for (const plan of this.discoveredRouteOptions()) options.push(cloneOverworldRouteOption(plan));
    return options;
  }

  private cachedRegionalArcProgress(): OverworldRegionalArcProgress[] {
    if (this.regionalArcProgressCache) return this.regionalArcProgressCache;
    this.regionalArcProgressCache = this.buildRegionalArcProgress();
    return this.regionalArcProgressCache;
  }

  private regionalArcProgressForView(): OverworldRegionalArcProgress[] {
    const progress: OverworldRegionalArcProgress[] = [];
    for (const arc of this.cachedRegionalArcProgress()) {
      progress.push(cloneOverworldRegionalArcProgress(arc));
    }
    return progress;
  }

  private buildRegionalArcProgress(): OverworldRegionalArcProgress[] {
    return buildOverworldRegionalArcProgress(
      this.world.regional_arcs,
      this.currentNode().region,
      this.regionalArcAnchorTownsById,
      this.resolvedEventHomeIds,
      this.completedRegionalArcIds,
    );
  }

  private checkRegionalArcCompletion(region: string): void {
    const completions = regionalArcCompletionsForRegion(
      region,
      this.regionalArcsByRegion,
      this.resolvedEventHomeIds,
      this.completedRegionalArcIds,
      this.minutes,
    );
    if (completions.length === 0) return;
    for (const completion of completions) {
      this.completedRegionalArcIds.add(completion.arc.id);
      this.addJournalEntry(completion.entry);
    }
    this.clearSnapshotCache();
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
    this.pendingRoadEncounter = buildOverworldPendingRoadEncounter(
      from,
      to,
      edge,
      roadEvent,
      this.minutes,
    );
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
      routeOptions: view.routeOptions.map((plan) => cloneOverworldRouteOption(plan)),
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
      regionalArcs: view.regionalArcs.map((arc) => cloneOverworldRegionalArcProgress(arc)),
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
    return this.withLocalDiscovery(result, current.id);
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
          ...emptyOverworldLocalDiscovery(),
        };
      }
    }

    const result = this.recordLocalAction(describeOverworldAreaAction(area), current.name);
    if (!result.alreadyKnown) this.visitedAreaIds.add(area.id);
    return this.withLocalDiscovery(result, current.id);
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
          ...emptyOverworldLocalDiscovery(),
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
    return this.withLocalDiscovery(result, current.id);
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
    return this.withLocalDiscovery(result, current.id);
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
    return this.withLocalDiscovery(result, current.id);
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
    return this.withLocalDiscovery(result, current.id);
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
    return this.withLocalDiscovery(result, current.id);
  }

  restAtTown(): OverworldServiceResult {
    const current = this.currentNode();
    return this.applyServicePlan(
      planOverworldTownRest({
        fatigue: this.fatigue,
        services: current.services,
        supplies: this.supplies,
        townName: current.name,
      }),
    );
  }

  resupplyAtTown(): OverworldServiceResult {
    const current = this.currentNode();
    return this.applyServicePlan(
      planOverworldTownResupply({
        fatigue: this.fatigue,
        services: current.services,
        supplies: this.supplies,
        townName: current.name,
      }),
    );
  }

  planRoute(destinationId: string): OverworldSessionRoutePlan {
    if (destinationId === this.currentId) throw new Error("You are already there.");
    if (!this.discoveredIds.has(destinationId)) {
      throw new Error("That destination is not discovered yet.");
    }
    const plan = indexedOverworldRoute(
      this.routePlannerIndex,
      this.currentId,
      destinationId,
      this.discoveredIds,
    );
    if (!plan) throw new Error("No discovered route reaches that destination yet.");
    return this.routeWithEstimate(plan);
  }

  resolveRoadEncounter(strategy: OverworldRoadEncounterStrategy): OverworldRoadEncounterResult {
    const encounter = this.pendingRoadEncounter;
    if (!encounter) throw new Error("There is no pending road encounter.");
    const current = this.currentNode();
    const resolution = resolveOverworldRoadEncounter(encounter, strategy, {
      fatigue: this.fatigue,
      minutes: this.minutes,
      supplies: this.supplies,
      townName: current.name,
    });

    this.supplies = resolution.suppliesAfter;
    this.fatigue = resolution.fatigueAfter;
    this.minutes = resolution.minutesAfter;
    if (resolution.result.renownGained > 0) {
      this.regionRenown.set(
        current.region,
        (this.regionRenown.get(current.region) ?? 0) + resolution.result.renownGained,
      );
    }
    this.pendingRoadEncounter = null;
    this.addJournalEntry(resolution.result.entry);
    this.clearSnapshotCache();
    return resolution.result;
  }

  travel(edgeId: string): TravelLogEntry {
    if (this.pendingRoadEncounter) {
      throw new Error("Address the pending road encounter before choosing another road.");
    }
    const edge = this.roadFrom(this.currentId, edgeId);
    if (!edge) throw new Error("That road is not reachable from here.");
    const from = this.currentNode();
    const roadEvent = this.roadEventFor(edge.id);
    const travelResult = resolveOverworldTravelLeg(edge.travel_minutes, roadEvent, {
      fatigue: this.fatigue,
      supplies: this.supplies,
    });
    this.supplies = travelResult.suppliesAfter;
    this.fatigue = travelResult.fatigueAfter;
    this.minutes += travelResult.elapsedMinutes;
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
      delayMinutes: travelResult.delayMinutes,
      minutes: travelResult.elapsedMinutes,
      arrivedAt: this.minutes,
      suppliesUsed: travelResult.suppliesUsed,
      suppliesAfter: this.supplies,
      fatigueGained: travelResult.fatigueGained,
      fatigueAfter: this.fatigue,
      roadEvent,
    };
    this.travelLog.unshift(entry);
    this.clearSnapshotCache();
    return entry;
  }
}
