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
  type OverworldRoadEvent,
} from "./overworld.js";
import { cloneOverworldCompactView, type OverworldCompactView } from "./compact_view.js";
import {
  OVERWORLD_STARTING_MINUTES as STARTING_MINUTES,
  OVERWORLD_STARTING_SUPPLIES as STARTING_SUPPLIES,
  type OverworldRoadEncounterStrategy,
} from "./travel_mechanics.js";
import {
  cloneOverworldRouteOption,
  type OverworldRoutePlannerIndex,
  type OverworldSessionRoutePlan,
} from "./session_routes.js";
import { type OverworldRoadEncounterResult } from "./session_road_encounters.js";
import { type OverworldActionJournalState } from "./session_action_recording.js";
import {
  type OverworldLocalDiscoveryResult,
  type OverworldQuestView,
} from "./session_local_discovery.js";
import {
  type OverworldQuestCompletionOutcome,
  type OverworldQuestCompletionResult,
} from "./session_quests.js";
import {
  applyOverworldSessionQuestCompletionFromState,
  applyOverworldSessionQuestStartFromState,
  previewOverworldSessionQuestStart,
  type OverworldSessionQuestStartState,
} from "./session_quest_lifecycle.js";
import { type OverworldSnapshotManifestIndex } from "./session_manifest_index.js";
import {
  applyOverworldSessionTownRestFromState,
  applyOverworldSessionTownResupplyFromState,
  type OverworldServiceResult,
  type OverworldSessionServiceApplication,
} from "./session_service_lifecycle.js";
import { type OverworldAreaTravelResult } from "./session_local_actions.js";
import {
  applyOverworldSessionAreaFromState,
  applyOverworldSessionAreaTravelFromState,
  applyOverworldSessionContactTalkFromState,
  applyOverworldSessionEventInvestigationFromState,
  applyOverworldSessionLocalJobFromState,
  applyOverworldSessionPoiScoutFromState,
  applyOverworldSessionSiteFromState,
  applyOverworldSessionTownVisit,
} from "./session_local_lifecycle.js";
import {
  OverworldSessionSnapshotSchema,
  cloneOverworldSessionSnapshot,
  type OverworldJournalEntry,
  type OverworldPendingRoadEncounter,
  type OverworldSessionSnapshot,
  type TravelLogEntry,
} from "./session_snapshot.js";
import {
  clearOverworldSessionCaches,
  type OverworldSessionCaches,
  type OverworldSessionSnapshotCache,
} from "./session_cache.js";
import { cloneOverworldView } from "./session_view_clone.js";
import type { OverworldView } from "./session_view.js";
import { buildOverworldSessionIndexes } from "./session_indices.js";
import {
  cloneOverworldActionResult,
  cloneOverworldAreaTravelResult,
  cloneOverworldQuestCompletionResult,
  cloneOverworldQuestView,
  cloneOverworldRoadEncounterResult,
  cloneOverworldServiceResult,
  cloneOverworldTravelLogEntry,
} from "./session_result_clone.js";
import {
  buildOverworldSessionSnapshotFromState,
  restoreOverworldSessionSnapshotIntoState,
  type OverworldSessionPersistenceState,
} from "./session_persistence.js";
import {
  buildOverworldSessionCompactViewFromSource,
  buildOverworldSessionViewFromSource,
  type OverworldSessionViewModelSourceState,
} from "./session_view_state.js";
import { planOverworldSessionRoadRoute } from "./session_route_lifecycle.js";
import { applyOverworldSessionEventResolutionFromState } from "./session_event_lifecycle.js";
import {
  applyOverworldSessionCurrentAreaForTown,
  applyOverworldSessionLocalDiscoveryForTown,
  buildOverworldSessionCurrentLocalView,
  requireOverworldSessionCurrentAreaId,
  resolveOverworldSessionCurrentArea,
  visibleOverworldSessionAreaExits,
  type MutableOverworldSessionLocalState,
} from "./session_local_state.js";
import {
  withOverworldSessionLocalDiscovery,
  type OverworldActionResult,
  type OverworldSessionActionApplication,
} from "./session_action_application.js";
import {
  applyOverworldSessionRoadEncounter,
  applyOverworldSessionRoadTravelArrival,
} from "./session_road_travel.js";

export type {
  OverworldRoadEncounterOption,
  OverworldRoadEncounterStrategy,
} from "./travel_mechanics.js";
export type { OverworldRouteEstimate, OverworldSessionRoutePlan } from "./session_routes.js";
export type { OverworldRoadEncounterResult } from "./session_road_encounters.js";
export type { OverworldRegionalArcProgress } from "./session_regional_arcs.js";
export type { OverworldServiceResult } from "./session_service_lifecycle.js";
export type { OverworldQuestView } from "./session_local_discovery.js";
export type { OverworldQuestCompletionResult } from "./session_quests.js";
export type { OverworldAreaTravelResult } from "./session_local_actions.js";
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
export type { OverworldActionResult } from "./session_action_application.js";
export type { OverworldView } from "./session_view.js";

type OverworldClockState = {
  minutesAfter: number;
};

type OverworldResourceClockState = OverworldClockState & {
  suppliesAfter: number;
  fatigueAfter: number;
};

type OverworldCurrentTownState = {
  currentIdAfter: string;
};

type OverworldCurrentAreaState = {
  currentAreaIdAfter: string | null;
};

type OverworldCurrentAreaTravelState = OverworldCurrentAreaState & OverworldClockState;

type OverworldPendingRoadEncounterState = {
  pendingRoadEncounterAfter: OverworldPendingRoadEncounter | null;
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

  private clearSessionCaches(): void {
    clearOverworldSessionCaches(this.caches);
  }

  private applyClockState(state: OverworldClockState): void {
    this.minutes = state.minutesAfter;
  }

  private applyResourceClockState(state: OverworldResourceClockState): void {
    this.supplies = state.suppliesAfter;
    this.fatigue = state.fatigueAfter;
    this.applyClockState(state);
  }

  private applyCurrentTownState(state: OverworldCurrentTownState): void {
    this.currentId = state.currentIdAfter;
  }

  private applyCurrentAreaState(state: OverworldCurrentAreaState): void {
    this.currentAreaId = state.currentAreaIdAfter;
  }

  private applyCurrentAreaTravelState(state: OverworldCurrentAreaTravelState): void {
    this.applyClockState(state);
    this.applyCurrentAreaState(state);
  }

  private applyPendingRoadEncounterState(state: OverworldPendingRoadEncounterState): void {
    this.pendingRoadEncounter = state.pendingRoadEncounterAfter;
  }

  private assertNoPendingRoadEncounter(action: string): void {
    if (this.pendingRoadEncounter) {
      throw new Error(`Resolve the pending road encounter before ${action}.`);
    }
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

  private persistenceState(): OverworldSessionPersistenceState {
    return {
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
      journalEntriesById: this.journalEntriesById,
      resolvedEventIds: this.resolvedEventIds,
      resolvedEventHomeIds: this.resolvedEventHomeIds,
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
    };
  }

  private buildSnapshot(): OverworldSessionSnapshot {
    return buildOverworldSessionSnapshotFromState(this.persistenceState());
  }

  private applySnapshot(snapshot: OverworldSessionSnapshot): void {
    const applied = restoreOverworldSessionSnapshotIntoState({
      indexes: this.snapshotManifestIndex,
      snapshot,
      startTownId: this.world.start,
      state: this.persistenceState(),
      worldHash: this.worldHash,
      worldId: this.world.id,
    });
    this.applyCurrentTownState(applied);
    this.applyCurrentAreaState(applied);
    this.applyResourceClockState(applied);
    this.applyPendingRoadEncounterState(applied);
    this.clearSessionCaches();
  }

  private markSeen(nodeId: string): void {
    const applied = applyOverworldSessionTownVisit({
      nodeId,
      currentAreaId: this.currentAreaId,
      currentAreaByTown: this.currentAreaByTown,
      areasByTown: this.areasByTown,
      discoveredAreaIds: this.discoveredAreaIds,
      discoveredIds: this.discoveredIds,
      roadExitsByTown: this.roadExitsByTown,
      visitedIds: this.visitedIds,
    });
    this.applyCurrentAreaState(applied);
    if (applied.stateChanged) this.clearSessionCaches();
  }

  private currentNode(): OverworldNode {
    const current = this.nodes.get(this.currentId);
    if (!current) throw new Error(`Current overworld node "${this.currentId}" is missing.`);
    return current;
  }

  private roadsFrom(nodeId: string): OverworldExit[] {
    return this.roadExitsByTown.get(nodeId) ?? [];
  }

  private localState(): MutableOverworldSessionLocalState {
    return {
      currentTownId: this.currentId,
      currentAreaId: this.currentAreaId,
      areasById: this.areasById,
      areasByTown: this.areasByTown,
      currentAreaByTown: this.currentAreaByTown,
      areaExitsByArea: this.areaExitsByArea,
      poisByArea: this.poisByArea,
      charactersByArea: this.charactersByArea,
      eventsByArea: this.eventsByArea,
      sitesByArea: this.sitesByArea,
      jobsByTown: this.jobsByTown,
      questsByTown: this.questsByTown,
      discoveredAreaIds: this.discoveredAreaIds,
      discoveredJobIds: this.discoveredJobIds,
      discoveredSiteIds: this.discoveredSiteIds,
      discoveredQuestIds: this.discoveredQuestIds,
    };
  }

  private actionJournalState(): OverworldActionJournalState {
    return {
      minutes: this.minutes,
      journalEntries: this.journalEntries,
      journalEntriesById: this.journalEntriesById,
    };
  }

  private applyActionApplication(
    applied: OverworldSessionActionApplication,
  ): OverworldActionResult {
    this.applyClockState(applied);
    if (applied.stateChanged) this.clearSessionCaches();
    return applied.result;
  }

  private applyServiceApplication(
    applied: OverworldSessionServiceApplication,
  ): OverworldServiceResult {
    if (applied.stateChanged) {
      this.applyResourceClockState(applied);
      this.clearSessionCaches();
    }
    return cloneOverworldServiceResult(applied.result);
  }

  private setCurrentAreaForTown(nodeId: string): void {
    const applied = applyOverworldSessionCurrentAreaForTown(this.localState(), nodeId);
    this.applyCurrentAreaState(applied);
    if (applied.stateChanged) this.clearSessionCaches();
  }

  private currentArea(): OverworldArea | null {
    const resolution = resolveOverworldSessionCurrentArea(this.localState());
    if (resolution.applied) {
      this.applyCurrentAreaState(resolution.applied);
      if (resolution.applied.stateChanged) this.clearSessionCaches();
    }
    return resolution.area;
  }

  private currentAreaIdOrThrow(): string {
    return requireOverworldSessionCurrentAreaId(this.currentArea());
  }

  private discoverLocalProgressForTown(nodeId: string): OverworldLocalDiscoveryResult {
    const applied = applyOverworldSessionLocalDiscoveryForTown(this.localState(), nodeId);
    if (applied.stateChanged) this.clearSessionCaches();
    return applied.discovery;
  }

  private withLocalDiscovery(result: OverworldActionResult, nodeId: string): OverworldActionResult {
    return withOverworldSessionLocalDiscovery(
      result,
      result.alreadyKnown ? null : this.discoverLocalProgressForTown(nodeId),
    );
  }

  private applyLocalActionWithDiscovery(
    current: OverworldNode,
    applied: OverworldSessionActionApplication,
  ): OverworldActionResult {
    return cloneOverworldActionResult(
      this.withLocalDiscovery(this.applyActionApplication(applied), current.id),
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

  private viewModelSourceState(): OverworldSessionViewModelSourceState {
    const current = this.currentNode();
    const currentArea = this.currentArea();
    const localState = this.localState();
    const currentAreaId = requireOverworldSessionCurrentAreaId(currentArea);
    return {
      caches: this.caches,
      worldName: this.world.name,
      worldTownCount: this.world.nodes.length,
      current,
      currentArea,
      currentId: this.currentId,
      minutes: this.minutes,
      supplies: this.supplies,
      fatigue: this.fatigue,
      roads: this.roadsFrom(this.currentId),
      areaExits: visibleOverworldSessionAreaExits(localState, currentArea),
      localState,
      localView: buildOverworldSessionCurrentLocalView(localState, currentAreaId),
      routePlannerIndex: this.routePlannerIndex,
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
    };
  }

  private buildCompactView(): OverworldCompactView {
    return buildOverworldSessionCompactViewFromSource(this.viewModelSourceState());
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
    return buildOverworldSessionViewFromSource({
      ...this.viewModelSourceState(),
      regionalArcs: this.world.regional_arcs,
      regionalArcAnchorTownsById: this.regionalArcAnchorTownsById,
      resolvedEventHomeIds: this.resolvedEventHomeIds,
    });
  }

  private questStartState(questId: string): OverworldSessionQuestStartState {
    this.assertNoPendingRoadEncounter("starting a quest");
    return {
      ...this.actionJournalState(),
      questId,
      questsById: this.questsById,
      areasById: this.areasById,
      currentTownId: this.currentId,
      currentTownName: this.currentNode().name,
      currentAreaId: this.currentArea()?.id ?? null,
      discoveredQuestIds: this.discoveredQuestIds,
      startedQuestIds: this.startedQuestIds,
    };
  }

  previewQuestStart(questId: string): OverworldQuestView {
    return cloneOverworldQuestView(
      previewOverworldSessionQuestStart(this.questStartState(questId)),
    );
  }

  startQuest(questId: string): OverworldQuestView {
    const applied = applyOverworldSessionQuestStartFromState(this.questStartState(questId));
    this.applyClockState(applied);
    if (applied.stateChanged) {
      this.clearSessionCaches();
    }
    return cloneOverworldQuestView(applied.quest);
  }

  completeQuest(
    questId: string,
    outcome: OverworldQuestCompletionOutcome,
  ): OverworldQuestCompletionResult {
    this.assertNoPendingRoadEncounter("completing a quest");
    const applied = applyOverworldSessionQuestCompletionFromState({
      ...this.actionJournalState(),
      completedQuestIds: this.completedQuestIds,
      regionRenown: this.regionRenown,
      questId,
      outcome,
      questsById: this.questsById,
      areasById: this.areasById,
      nodesById: this.nodes,
      startedQuestIds: this.startedQuestIds,
    });
    this.applyClockState(applied);
    if (applied.stateChanged) {
      this.clearSessionCaches();
    }
    return cloneOverworldQuestCompletionResult(applied.result);
  }

  scoutPoi(poiId: string): OverworldActionResult {
    this.assertNoPendingRoadEncounter("scouting a point of interest");
    const current = this.currentNode();
    return this.applyLocalActionWithDiscovery(
      current,
      applyOverworldSessionPoiScoutFromState({
        ...this.actionJournalState(),
        poiId,
        poisById: this.poisById,
        currentTown: current,
        currentAreaId: () => this.currentAreaIdOrThrow(),
      }),
    );
  }

  exploreArea(areaId: string): OverworldActionResult {
    this.assertNoPendingRoadEncounter("exploring a local area");
    const current = this.currentNode();
    return this.applyLocalActionWithDiscovery(
      current,
      applyOverworldSessionAreaFromState({
        ...this.actionJournalState(),
        areaId,
        areasById: this.areasById,
        currentTownId: this.currentId,
        currentAreaId: this.currentArea()?.id ?? null,
        discoveredAreaIds: this.discoveredAreaIds,
        visitedAreaIds: this.visitedAreaIds,
        journalEntriesById: this.journalEntriesById,
        currentTownName: current.name,
      }),
    );
  }

  moveArea(areaRouteId: string): OverworldAreaTravelResult {
    this.assertNoPendingRoadEncounter("moving between local areas");
    const applied = applyOverworldSessionAreaTravelFromState({
      currentAreaByTown: this.currentAreaByTown,
      currentTownId: this.currentId,
      minutes: this.minutes,
      areaRouteId,
      currentArea: this.currentArea(),
      areaExitsByAreaAndId: this.areaExitsByAreaAndId,
      discoveredAreaIds: this.discoveredAreaIds,
    });
    this.applyCurrentAreaTravelState(applied);
    this.clearSessionCaches();
    return cloneOverworldAreaTravelResult({
      from: applied.from,
      to: applied.to,
      route: applied.route,
      minutes: applied.minutes,
      arrivedAt: applied.arrivedAt,
    });
  }

  workLocalJob(jobId: string): OverworldActionResult {
    this.assertNoPendingRoadEncounter("working a local job");
    const current = this.currentNode();
    return this.applyLocalActionWithDiscovery(
      current,
      applyOverworldSessionLocalJobFromState({
        ...this.actionJournalState(),
        jobId,
        jobsById: this.jobsById,
        areasById: this.areasById,
        currentTownId: this.currentId,
        currentRegion: current.region,
        currentAreaId: this.currentAreaIdOrThrow(),
        discoveredJobIds: this.discoveredJobIds,
        completedJobIds: this.completedJobIds,
        journalEntriesById: this.journalEntriesById,
        regionRenown: this.regionRenown,
        currentTownName: current.name,
      }),
    );
  }

  talkToCharacter(characterId: string): OverworldActionResult {
    this.assertNoPendingRoadEncounter("talking to a contact");
    const current = this.currentNode();
    return this.applyLocalActionWithDiscovery(
      current,
      applyOverworldSessionContactTalkFromState({
        ...this.actionJournalState(),
        characterId,
        charactersById: this.charactersById,
        currentTownId: this.currentId,
        currentAreaId: () => this.currentAreaIdOrThrow(),
        currentTownName: current.name,
      }),
    );
  }

  investigateEvent(eventId: string): OverworldActionResult {
    this.assertNoPendingRoadEncounter("investigating a local event");
    const current = this.currentNode();
    return this.applyLocalActionWithDiscovery(
      current,
      applyOverworldSessionEventInvestigationFromState({
        ...this.actionJournalState(),
        eventId,
        eventsById: this.localEventsById,
        currentTownId: this.currentId,
        currentAreaId: () => this.currentAreaIdOrThrow(),
        currentTownName: current.name,
      }),
    );
  }

  resolveEvent(eventId: string): OverworldActionResult {
    this.assertNoPendingRoadEncounter("resolving a local event");
    const current = this.currentNode();
    return this.applyLocalActionWithDiscovery(
      current,
      applyOverworldSessionEventResolutionFromState({
        ...this.actionJournalState(),
        eventId,
        eventsById: this.localEventsById,
        currentTownId: this.currentId,
        currentTownName: current.name,
        currentRegion: current.region,
        currentAreaId: this.currentAreaIdOrThrow(),
        resolvedEventIds: this.resolvedEventIds,
        resolvedEventHomeIds: this.resolvedEventHomeIds,
        regionRenown: this.regionRenown,
        regionalArcsByRegion: this.regionalArcsByRegion,
        completedRegionalArcIds: this.completedRegionalArcIds,
        poisByArea: this.poisByArea,
        charactersByArea: this.charactersByArea,
      }),
    );
  }

  exploreSite(siteId: string): OverworldActionResult {
    this.assertNoPendingRoadEncounter("exploring a site");
    const current = this.currentNode();
    return this.applyLocalActionWithDiscovery(
      current,
      applyOverworldSessionSiteFromState({
        ...this.actionJournalState(),
        siteId,
        sitesById: this.sitesById,
        currentTownId: this.currentId,
        currentAreaId: this.currentAreaIdOrThrow(),
        discoveredSiteIds: this.discoveredSiteIds,
        exploredSiteIds: this.exploredSiteIds,
        journalEntriesById: this.journalEntriesById,
        regionRenown: this.regionRenown,
        currentTownName: current.name,
      }),
    );
  }

  restAtTown(): OverworldServiceResult {
    this.assertNoPendingRoadEncounter("resting at town");
    const current = this.currentNode();
    return this.applyServiceApplication(
      applyOverworldSessionTownRestFromState({
        ...this.actionJournalState(),
        currentTown: current,
        fatigue: this.fatigue,
        supplies: this.supplies,
      }),
    );
  }

  resupplyAtTown(): OverworldServiceResult {
    this.assertNoPendingRoadEncounter("resupplying at town");
    const current = this.currentNode();
    return this.applyServiceApplication(
      applyOverworldSessionTownResupplyFromState({
        ...this.actionJournalState(),
        currentTown: current,
        fatigue: this.fatigue,
        supplies: this.supplies,
      }),
    );
  }

  planRoute(destinationId: string): OverworldSessionRoutePlan {
    this.assertNoPendingRoadEncounter("planning another road route");
    return cloneOverworldRouteOption(
      planOverworldSessionRoadRoute({
        destinationId,
        routePlannerIndex: this.routePlannerIndex,
        currentId: this.currentId,
        discoveredIds: this.discoveredIds,
        resources: {
          fatigue: this.fatigue,
          supplies: this.supplies,
        },
      }),
    );
  }

  resolveRoadEncounter(strategy: OverworldRoadEncounterStrategy): OverworldRoadEncounterResult {
    const applied = applyOverworldSessionRoadEncounter(
      {
        pendingRoadEncounter: this.pendingRoadEncounter,
        current: this.currentNode(),
        minutes: this.minutes,
        supplies: this.supplies,
        fatigue: this.fatigue,
        regionRenown: this.regionRenown,
        journalEntries: this.journalEntries,
        journalEntriesById: this.journalEntriesById,
      },
      strategy,
    );
    this.applyResourceClockState(applied);
    this.applyPendingRoadEncounterState(applied);
    this.clearSessionCaches();
    return cloneOverworldRoadEncounterResult(applied.result);
  }

  travel(edgeId: string): TravelLogEntry {
    const recorded = applyOverworldSessionRoadTravelArrival(
      {
        pendingRoadEncounter: this.pendingRoadEncounter,
        current: this.currentNode(),
        currentId: this.currentId,
        roadExitsByTownAndId: this.roadExitsByTownAndId,
        roadEventsByEdgeId: this.roadEventsByEdgeId,
        areasByTown: this.areasByTown,
        roadExitsByTown: this.roadExitsByTown,
        currentAreaId: this.currentAreaId,
        currentAreaByTown: this.currentAreaByTown,
        discoveredAreaIds: this.discoveredAreaIds,
        discoveredIds: this.discoveredIds,
        visitedIds: this.visitedIds,
        minutes: this.minutes,
        supplies: this.supplies,
        fatigue: this.fatigue,
        travelLog: this.travelLog,
      },
      edgeId,
    );
    this.applyResourceClockState(recorded);
    this.applyCurrentTownState(recorded);
    this.applyCurrentAreaState(recorded);
    this.applyPendingRoadEncounterState(recorded);
    this.clearSessionCaches();
    return cloneOverworldTravelLogEntry(recorded.entry);
  }

  travelTo(destinationTownId: string): TravelLogEntry {
    const matchingRoads = this.roadsFrom(this.currentId).filter(
      (road) => road.destination.id === destinationTownId,
    );
    if (matchingRoads.length === 0) {
      throw new Error(
        `No road from "${this.currentId}" reaches destination town "${destinationTownId}".`,
      );
    }
    if (matchingRoads.length > 1) {
      throw new Error(
        `Multiple roads from "${this.currentId}" reach "${destinationTownId}"; use road_id.`,
      );
    }
    return this.travel(matchingRoads[0]!.id);
  }
}
