import { hashState } from "../core/hash.js";
import {
  type OverworldArea,
  type OverworldAreaExit,
  type OverworldCharacter,
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
  describeOverworldContactAction,
  describeOverworldEventAction,
  describeOverworldPoiAction,
  type OverworldLocalActionDescriptor,
  type OverworldLocalActionKind,
} from "./local_actions.js";
import { cloneOverworldCompactView, type OverworldCompactView } from "./compact_view.js";
import { replaceStringSet, sortedNumberRecord } from "./session_collections.js";
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
import {
  addOverworldJournalEntry,
  replaceOverworldJournalEntries,
} from "./session_journal_store.js";
import { timeLabel } from "./session_journal_codec.js";
import {
  recordOverworldAction,
  recordOverworldLocalAction,
  recordOverworldRepeatableEntry,
  type OverworldActionJournalState,
  type OverworldRecordedActionResult,
} from "./session_action_recording.js";
import { planOverworldEventResolution } from "./session_event_resolution.js";
import {
  emptyOverworldLocalDiscovery,
  planOverworldLocalDiscovery,
  questView,
  type OverworldLocalDiscoveryResult,
  type OverworldQuestView,
} from "./session_local_discovery.js";
import {
  planOverworldQuestCompletion,
  planOverworldQuestStart,
  type OverworldQuestCompletionOutcome,
  type OverworldQuestCompletionResult,
} from "./session_quests.js";
import { type OverworldSnapshotManifestIndex } from "./session_manifest_index.js";
import {
  buildOverworldRegionalArcProgress,
  cloneOverworldRegionalArcProgress,
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
  planOverworldAreaExploration,
  planOverworldLocalJobCompletion,
  planOverworldSiteExploration,
} from "./session_local_actions.js";
import { buildOverworldSessionSnapshot } from "./session_snapshot_builder.js";
import {
  OverworldSessionSnapshotSchema,
  cloneOverworldSessionSnapshot,
  type OverworldJournalEntry,
  type OverworldPendingRoadEncounter,
  type OverworldSessionSnapshot,
  type TravelLogEntry,
} from "./session_snapshot.js";
import { buildOverworldSessionCompactView } from "./session_compact_view.js";
import {
  clearOverworldSessionCaches,
  type OverworldSessionCaches,
  type OverworldSessionSnapshotCache,
} from "./session_cache.js";
import { cloneOverworldView } from "./session_view_clone.js";
import { buildOverworldSessionIndexes } from "./session_indices.js";
import { planOverworldSessionSnapshotRestore } from "./session_snapshot_restore.js";

export type {
  OverworldRoadEncounterOption,
  OverworldRoadEncounterStrategy,
} from "./travel_mechanics.js";
export type { OverworldRouteEstimate, OverworldSessionRoutePlan } from "./session_routes.js";
export type { OverworldRoadEncounterResult } from "./session_road_encounters.js";
export type { OverworldRegionalArcProgress } from "./session_regional_arcs.js";
export type { OverworldServiceResult } from "./session_services.js";
export type { OverworldQuestView } from "./session_local_discovery.js";
export type { OverworldQuestCompletionResult } from "./session_quests.js";
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
  private readonly caches: OverworldSessionCaches = {};

  constructor(private readonly world: OverworldManifest) {
    const indexes = buildOverworldSessionIndexes(world);
    this.nodes = indexes.nodes;
    this.roadExitsByTown = indexes.roadExitsByTown;
    this.roadExitsByTownAndId = indexes.roadExitsByTownAndId;
    this.roadEventsByEdgeId = indexes.roadEventsByEdgeId;
    this.areasById = indexes.areasById;
    this.areasByTown = indexes.areasByTown;
    this.areaExitsByArea = indexes.areaExitsByArea;
    this.areaExitsByAreaAndId = indexes.areaExitsByAreaAndId;
    this.poisById = indexes.poisById;
    this.poisByTown = indexes.poisByTown;
    this.poisByArea = indexes.poisByArea;
    this.charactersById = indexes.charactersById;
    this.charactersByTown = indexes.charactersByTown;
    this.charactersByArea = indexes.charactersByArea;
    this.eventsByTown = indexes.eventsByTown;
    this.eventsByArea = indexes.eventsByArea;
    this.localEventsById = indexes.localEventsById;
    this.jobsById = indexes.jobsById;
    this.jobsByTown = indexes.jobsByTown;
    this.sitesById = indexes.sitesById;
    this.sitesByArea = indexes.sitesByArea;
    this.questsById = indexes.questsById;
    this.questsByTown = indexes.questsByTown;
    this.regionalArcsByRegion = indexes.regionalArcsByRegion;
    this.regionalArcAnchorTownsById = indexes.regionalArcAnchorTownsById;
    this.routePlannerIndex = indexes.routePlannerIndex;
    this.snapshotManifestIndex = indexes.snapshotManifestIndex;
    this.worldHash = indexes.worldHash;
    this.currentId = world.start;
    this.markSeen(world.start);
  }

  static restore(world: OverworldManifest, rawSnapshot: unknown): OverworldSession {
    const snapshot = OverworldSessionSnapshotSchema.parse(rawSnapshot);
    const session = new OverworldSession(world);
    session.applySnapshot(snapshot);
    return session;
  }

  private clearSnapshotCache(): void {
    clearOverworldSessionCaches(this.caches);
  }

  private cachedSnapshot(): OverworldSessionSnapshotCache {
    if (this.caches.snapshot) return this.caches.snapshot;
    const snapshot = this.buildSnapshot();
    const hash = hashState(snapshot);
    this.caches.snapshot = { snapshot, hash };
    return this.caches.snapshot;
  }

  snapshotHash(): string {
    return this.cachedSnapshot().hash;
  }

  snapshot(): OverworldSessionSnapshot {
    return cloneOverworldSessionSnapshot(this.cachedSnapshot().snapshot);
  }

  private buildSnapshot(): OverworldSessionSnapshot {
    return buildOverworldSessionSnapshot({
      worldId: this.world.id,
      worldHash: this.worldHash,
      currentId: this.currentId,
      currentAreaId: this.currentAreaId,
      minutes: this.minutes,
      supplies: this.supplies,
      fatigue: this.fatigue,
      discoveredIds: this.discoveredIds,
      visitedIds: this.visitedIds,
      currentAreaByTown: this.currentAreaByTown,
      travelLog: this.travelLog,
      journalEntries: this.journalEntries,
      resolvedEventIds: this.resolvedEventIds,
      discoveredAreaIds: this.discoveredAreaIds,
      visitedAreaIds: this.visitedAreaIds,
      discoveredJobIds: this.discoveredJobIds,
      completedJobIds: this.completedJobIds,
      discoveredSiteIds: this.discoveredSiteIds,
      discoveredQuestIds: this.discoveredQuestIds,
      startedQuestIds: this.startedQuestIds,
      completedQuestIds: this.completedQuestIds,
      exploredSiteIds: this.exploredSiteIds,
      regionRenown: this.regionRenown,
      completedRegionalArcIds: this.completedRegionalArcIds,
      pendingRoadEncounter: this.pendingRoadEncounter,
    });
  }

  private applySnapshot(snapshot: OverworldSessionSnapshot): void {
    const restorePlan = planOverworldSessionSnapshotRestore({
      indexes: this.snapshotManifestIndex,
      snapshot,
      startTownId: this.world.start,
      worldHash: this.worldHash,
      worldId: this.world.id,
    });

    this.currentId = snapshot.currentId;
    this.currentAreaId = snapshot.currentAreaId;
    this.minutes = snapshot.minutes;
    this.supplies = snapshot.supplies;
    this.fatigue = snapshot.fatigue;
    replaceStringSet(this.discoveredIds, snapshot.discoveredIds);
    replaceStringSet(this.visitedIds, snapshot.visitedIds);
    this.currentAreaByTown.clear();
    for (const [townId, areaId] of restorePlan.currentAreaByTown) {
      this.currentAreaByTown.set(townId, areaId);
    }
    this.travelLog.length = 0;
    for (const entry of restorePlan.travelLog) this.travelLog.push(entry);
    replaceOverworldJournalEntries(
      this.journalEntries,
      this.journalEntriesById,
      snapshot.journalEntries,
    );
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
    for (const [region, renown] of restorePlan.regionRenown) this.regionRenown.set(region, renown);
    replaceStringSet(this.completedRegionalArcIds, snapshot.completedRegionalArcIds);
    this.pendingRoadEncounter = restorePlan.pendingRoadEncounter;
    this.clearSnapshotCache();
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

  private actionJournalState(): OverworldActionJournalState {
    return {
      minutes: this.minutes,
      journalEntries: this.journalEntries,
      journalEntriesById: this.journalEntriesById,
    };
  }

  private applyRecordedAction(recorded: OverworldRecordedActionResult): OverworldActionResult {
    this.minutes = recorded.minutesAfter;
    if (recorded.stateChanged) this.clearSnapshotCache();
    return {
      minutes: recorded.minutes,
      alreadyKnown: recorded.alreadyKnown,
      entry: recorded.entry,
    };
  }

  private recordAction(
    entry: Omit<OverworldJournalEntry, "recordedAt">,
    minutes: number,
  ): OverworldActionResult {
    return this.applyRecordedAction(
      recordOverworldAction(this.actionJournalState(), entry, minutes),
    );
  }

  private recordLocalAction<Kind extends OverworldLocalActionKind>(
    action: OverworldLocalActionDescriptor<Kind>,
    town: string,
  ): OverworldActionResult {
    return this.applyRecordedAction(
      recordOverworldLocalAction(this.actionJournalState(), action, town),
    );
  }

  private recordRepeatableEntry(
    entry: Omit<OverworldJournalEntry, "recordedAt">,
    minutes: number,
  ): OverworldJournalEntry {
    const recorded = recordOverworldRepeatableEntry(this.actionJournalState(), entry, minutes);
    this.minutes = recorded.minutesAfter;
    this.clearSnapshotCache();
    return recorded.entry;
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
    if (this.caches.routeOptions) return this.caches.routeOptions;
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
    this.caches.routeOptions = options;
    return options;
  }

  private routeOptionsForView(): OverworldSessionRoutePlan[] {
    const options: OverworldSessionRoutePlan[] = [];
    for (const plan of this.discoveredRouteOptions()) options.push(cloneOverworldRouteOption(plan));
    return options;
  }

  private cachedRegionalArcProgress(): OverworldRegionalArcProgress[] {
    if (this.caches.regionalArcProgress) return this.caches.regionalArcProgress;
    this.caches.regionalArcProgress = this.buildRegionalArcProgress();
    return this.caches.regionalArcProgress;
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
      addOverworldJournalEntry(this.journalEntries, this.journalEntriesById, completion.entry);
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
    if (this.caches.compactView) return this.caches.compactView;
    this.caches.compactView = this.buildCompactView();
    return this.caches.compactView;
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
    const routeOptions = this.discoveredRouteOptions();
    return buildOverworldSessionCompactView({
      worldName: this.world.name,
      worldTownCount: this.world.nodes.length,
      current,
      currentArea,
      minutes: this.minutes,
      supplies: this.supplies,
      fatigue: this.fatigue,
      roads: this.roadsFrom(this.currentId),
      areaExits: this.visibleAreaExits(),
      routeOptions,
      areas: this.discoveredAreasAt(this.currentId),
      poi: this.currentAreaPois(),
      contacts: this.currentAreaCharacters(),
      events: this.currentAreaEvents(),
      jobs: this.discoveredJobsInCurrentArea(),
      sites: this.discoveredSitesInCurrentArea(),
      quests: this.discoveredQuestsAt(this.currentId),
      hiddenAreaCount: this.hiddenAreaCountAt(this.currentId),
      hiddenJobCount: this.hiddenJobCountAt(this.currentId),
      hiddenSiteCount: this.hiddenSiteCountInCurrentArea(),
      hiddenQuestCount: this.hiddenQuestCountAt(this.currentId),
      journalEntries: this.journalEntries,
      travelLog: this.travelLog,
      visitedCount: this.visitedIds.size,
      regionRenown: this.regionRenown,
      completedRegionalArcIds: this.completedRegionalArcIds,
      pendingRoadEncounter: this.pendingRoadEncounter,
      ids: {
        discoveredIds: this.discoveredIds,
        nodes: this.nodes,
        discoveredAreaIds: this.discoveredAreaIds,
        visitedAreaIds: this.visitedAreaIds,
        discoveredJobIds: this.discoveredJobIds,
        completedJobIds: this.completedJobIds,
        discoveredSiteIds: this.discoveredSiteIds,
        exploredSiteIds: this.exploredSiteIds,
        discoveredQuestIds: this.discoveredQuestIds,
        startedQuestIds: this.startedQuestIds,
        completedQuestIds: this.completedQuestIds,
        resolvedEventIds: this.resolvedEventIds,
      },
    });
  }

  private cachedView(): OverworldView {
    if (this.caches.view) return this.caches.view;
    this.caches.view = this.buildView();
    return this.caches.view;
  }

  view(): OverworldView {
    return cloneOverworldView(this.cachedView());
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
    const plan = planOverworldQuestStart({
      questId,
      questsById: this.questsById,
      areasById: this.areasById,
      currentTownId: this.currentId,
      currentTownName: this.currentNode().name,
      currentAreaId: this.currentArea()?.id ?? null,
      discoveredQuestIds: this.discoveredQuestIds,
      startedQuestIds: this.startedQuestIds,
    });
    const result = this.recordAction(plan.entryDraft, plan.minutes);
    if (!result.alreadyKnown) {
      this.startedQuestIds.add(plan.quest.id);
      this.clearSnapshotCache();
    }
    return plan.quest;
  }

  completeQuest(
    questId: string,
    outcome: OverworldQuestCompletionOutcome,
  ): OverworldQuestCompletionResult {
    const plan = planOverworldQuestCompletion({
      questId,
      outcome,
      questsById: this.questsById,
      nodesById: this.nodes,
      startedQuestIds: this.startedQuestIds,
    });
    const result = this.recordAction(plan.entryDraft, plan.minutes);
    if (!result.alreadyKnown) {
      this.completedQuestIds.add(plan.quest.id);
      this.clearSnapshotCache();
    }
    return {
      minutes: result.minutes,
      alreadyKnown: result.alreadyKnown,
      quest: plan.quest,
      endingId: plan.endingId,
      endingTitle: plan.endingTitle,
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
    const plan = planOverworldAreaExploration({
      areaId,
      areasById: this.areasById,
      currentTownId: this.currentId,
      currentAreaId: this.currentArea()?.id ?? null,
      discoveredAreaIds: this.discoveredAreaIds,
      visitedAreaIds: this.visitedAreaIds,
      journalEntries: this.journalEntriesById,
    });
    if (plan.alreadyKnown) {
      return {
        minutes: 0,
        alreadyKnown: true,
        entry: plan.entry,
        ...emptyOverworldLocalDiscovery(),
      };
    }

    const result = this.recordLocalAction(plan.action, current.name);
    if (!result.alreadyKnown) this.visitedAreaIds.add(plan.areaId);
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
    const plan = planOverworldLocalJobCompletion({
      jobId,
      jobsById: this.jobsById,
      areasById: this.areasById,
      currentTownId: this.currentId,
      currentRegion: current.region,
      currentAreaId: this.currentAreaIdOrThrow(),
      discoveredJobIds: this.discoveredJobIds,
      completedJobIds: this.completedJobIds,
      journalEntries: this.journalEntriesById,
    });
    if (plan.alreadyKnown) {
      return {
        minutes: 0,
        alreadyKnown: true,
        entry: plan.entry,
        ...emptyOverworldLocalDiscovery(),
      };
    }

    const result = this.recordLocalAction(plan.action, current.name);
    if (!result.alreadyKnown) {
      this.completedJobIds.add(plan.jobId);
      this.regionRenown.set(
        plan.renownRegion,
        (this.regionRenown.get(plan.renownRegion) ?? 0) + plan.renown,
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
    const plan = planOverworldEventResolution({
      eventId,
      eventsById: this.localEventsById,
      currentTownId: this.currentId,
      currentTownName: current.name,
      currentRegion: current.region,
      currentAreaId: this.currentAreaIdOrThrow(),
      resolvedEventIds: this.resolvedEventIds,
      journalEntries: this.journalEntriesById,
      poisByArea: this.poisByArea,
      charactersByArea: this.charactersByArea,
    });
    if (plan.alreadyKnown) return { minutes: 0, alreadyKnown: true, entry: plan.entry };

    const result = this.recordAction(plan.entryDraft, plan.minutes);
    if (!result.alreadyKnown) {
      this.markEventResolved(plan.event);
      this.regionRenown.set(plan.region, (this.regionRenown.get(plan.region) ?? 0) + plan.renown);
      this.checkRegionalArcCompletion(plan.region);
      this.clearSnapshotCache();
    }
    return this.withLocalDiscovery(result, current.id);
  }

  exploreSite(siteId: string): OverworldActionResult {
    const current = this.currentNode();
    const plan = planOverworldSiteExploration({
      siteId,
      sitesById: this.sitesById,
      currentTownId: this.currentId,
      currentAreaId: this.currentAreaIdOrThrow(),
      discoveredSiteIds: this.discoveredSiteIds,
      exploredSiteIds: this.exploredSiteIds,
      journalEntries: this.journalEntriesById,
    });
    if (plan.alreadyKnown) return { minutes: 0, alreadyKnown: true, entry: plan.entry };

    const result = this.recordLocalAction(plan.action, current.name);
    if (!result.alreadyKnown) {
      this.exploredSiteIds.add(plan.siteId);
      this.regionRenown.set(
        plan.renownRegion,
        (this.regionRenown.get(plan.renownRegion) ?? 0) + plan.renown,
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
    addOverworldJournalEntry(this.journalEntries, this.journalEntriesById, resolution.result.entry);
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
