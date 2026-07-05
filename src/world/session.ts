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
import {
  describeOverworldContactAction,
  describeOverworldEventAction,
  describeOverworldPoiAction,
} from "./local_actions.js";
import { cloneOverworldCompactView, type OverworldCompactView } from "./compact_view.js";
import {
  OVERWORLD_STARTING_MINUTES as STARTING_MINUTES,
  OVERWORLD_STARTING_SUPPLIES as STARTING_SUPPLIES,
  type OverworldRoadEncounterStrategy,
} from "./travel_mechanics.js";
import {
  indexedOverworldRoute,
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
  type OverworldQuestStartPlan,
} from "./session_quests.js";
import {
  applyOverworldSessionQuestCompletion,
  applyOverworldSessionQuestStart,
  planOverworldSessionQuestCompletion,
  planOverworldSessionQuestStart,
} from "./session_quest_lifecycle.js";
import { type OverworldSnapshotManifestIndex } from "./session_manifest_index.js";
import {
  planOverworldTownRest,
  planOverworldTownResupply,
  type OverworldServicePlan,
  type OverworldServiceResult,
} from "./session_services.js";
import {
  applyOverworldAreaTravel,
  applyOverworldTownVisit,
  type OverworldAreaTravelResult,
} from "./session_local_actions.js";
import {
  applyOverworldSessionArea,
  applyOverworldSessionLocalJob,
  applyOverworldSessionSite,
  planOverworldSessionArea,
  planOverworldSessionLocalJob,
  planOverworldSessionSite,
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
  buildOverworldSessionSnapshotFromState,
  restoreOverworldSessionSnapshotIntoState,
  type OverworldSessionPersistenceState,
} from "./session_persistence.js";
import {
  buildOverworldSessionCompactViewFromSource,
  buildOverworldSessionViewFromSource,
  type OverworldSessionViewModelSourceState,
} from "./session_view_state.js";
import { withOverworldSessionRouteEstimate } from "./session_route_progress.js";
import {
  applyOverworldSessionEventResolution,
  planOverworldSessionEventResolution,
} from "./session_event_lifecycle.js";
import {
  applyOverworldSessionCurrentAreaForTown,
  applyOverworldSessionLocalDiscoveryForTown,
  buildOverworldSessionCurrentLocalView,
  overworldSessionLocalAreas,
  requireOverworldSessionCurrentAreaId,
  resolveOverworldSessionCurrentArea,
  visibleOverworldSessionAreaExits,
  type MutableOverworldSessionLocalState,
} from "./session_local_state.js";
import {
  applyOverworldSessionServicePlan,
  recordOverworldSessionAction,
  recordOverworldSessionLocalAction,
  withOverworldSessionLocalDiscovery,
  type OverworldActionResult,
  type OverworldSessionActionApplication,
  type OverworldSessionLocalAction,
} from "./session_action_application.js";
import {
  applyOverworldSessionRoadEncounter,
  applyOverworldSessionRoadTravel,
} from "./session_road_travel.js";

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

  private clearSnapshotCache(): void {
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
    this.rebuildResolvedEventHomeIds();
    this.applyPendingRoadEncounterState(applied);
    this.clearSnapshotCache();
  }

  private rebuildResolvedEventHomeIds(): void {
    this.resolvedEventHomeIds.clear();
    for (const eventId of this.resolvedEventIds) {
      const event = this.localEventsById.get(eventId);
      if (event) this.resolvedEventHomeIds.add(event.home);
    }
  }

  private markSeen(nodeId: string): void {
    const applied = applyOverworldTownVisit({
      nodeId,
      localAreas: this.localAreas(nodeId),
      currentAreaId: this.currentAreaId,
      currentAreaByTown: this.currentAreaByTown,
      discoveredAreaIds: this.discoveredAreaIds,
      discoveredIds: this.discoveredIds,
      roadDestinationIds: this.roadsFrom(nodeId).map((edge) => edge.destination.id),
      visitedIds: this.visitedIds,
    });
    this.applyCurrentAreaState(applied);
    if (applied.stateChanged) this.clearSnapshotCache();
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
    if (applied.stateChanged) this.clearSnapshotCache();
    return applied.result;
  }

  private recordAction(
    entry: Omit<OverworldJournalEntry, "recordedAt">,
    minutes: number,
  ): OverworldActionResult {
    return this.applyActionApplication(
      recordOverworldSessionAction(this.actionJournalState(), entry, minutes),
    );
  }

  private recordLocalAction(
    action: OverworldSessionLocalAction,
    town: string,
  ): OverworldActionResult {
    return this.applyActionApplication(
      recordOverworldSessionLocalAction(this.actionJournalState(), action, town),
    );
  }

  private applyServicePlan(plan: OverworldServicePlan): OverworldServiceResult {
    const applied = applyOverworldSessionServicePlan(this.actionJournalState(), plan);
    if (applied.stateChanged) {
      this.applyResourceClockState(applied);
      this.clearSnapshotCache();
    }
    return applied.result;
  }

  private localAreas(nodeId: string): OverworldArea[] {
    return [...overworldSessionLocalAreas(this.localState(), nodeId)];
  }

  private setCurrentAreaForTown(nodeId: string): void {
    const applied = applyOverworldSessionCurrentAreaForTown(this.localState(), nodeId);
    this.applyCurrentAreaState(applied);
    if (applied.stateChanged) this.clearSnapshotCache();
  }

  private currentArea(): OverworldArea | null {
    const resolution = resolveOverworldSessionCurrentArea(this.localState());
    if (resolution.applied) {
      this.applyCurrentAreaState(resolution.applied);
      if (resolution.applied.stateChanged) this.clearSnapshotCache();
    }
    return resolution.area;
  }

  private areaExitFrom(areaId: string, routeId: string): OverworldAreaExit | null {
    return this.areaExitsByAreaAndId.get(areaId)?.get(routeId) ?? null;
  }

  private currentAreaIdOrThrow(): string {
    return requireOverworldSessionCurrentAreaId(this.currentArea());
  }

  private discoverLocalProgressForTown(nodeId: string): OverworldLocalDiscoveryResult {
    const applied = applyOverworldSessionLocalDiscoveryForTown(this.localState(), nodeId);
    if (applied.stateChanged) this.clearSnapshotCache();
    return applied.discovery;
  }

  private withLocalDiscovery(result: OverworldActionResult, nodeId: string): OverworldActionResult {
    return withOverworldSessionLocalDiscovery(
      result,
      result.alreadyKnown ? null : this.discoverLocalProgressForTown(nodeId),
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

  private questStartPlan(questId: string): OverworldQuestStartPlan {
    this.assertNoPendingRoadEncounter("starting a quest");
    return planOverworldSessionQuestStart({
      questId,
      questsById: this.questsById,
      areasById: this.areasById,
      currentTownId: this.currentId,
      currentTownName: this.currentNode().name,
      currentAreaId: this.currentArea()?.id ?? null,
      discoveredQuestIds: this.discoveredQuestIds,
      startedQuestIds: this.startedQuestIds,
    });
  }

  previewQuestStart(questId: string): OverworldQuestView {
    return this.questStartPlan(questId).quest;
  }

  startQuest(questId: string): OverworldQuestView {
    const plan = this.questStartPlan(questId);
    const applied = applyOverworldSessionQuestStart(
      {
        ...this.actionJournalState(),
        startedQuestIds: this.startedQuestIds,
      },
      plan,
    );
    this.applyClockState(applied);
    if (applied.stateChanged) {
      this.clearSnapshotCache();
    }
    return applied.quest;
  }

  completeQuest(
    questId: string,
    outcome: OverworldQuestCompletionOutcome,
  ): OverworldQuestCompletionResult {
    this.assertNoPendingRoadEncounter("completing a quest");
    const applied = applyOverworldSessionQuestCompletion(
      {
        ...this.actionJournalState(),
        completedQuestIds: this.completedQuestIds,
      },
      planOverworldSessionQuestCompletion({
        questId,
        outcome,
        questsById: this.questsById,
        nodesById: this.nodes,
        startedQuestIds: this.startedQuestIds,
      }),
    );
    this.applyClockState(applied);
    if (applied.stateChanged) {
      this.clearSnapshotCache();
    }
    return applied.result;
  }

  scoutPoi(poiId: string): OverworldActionResult {
    this.assertNoPendingRoadEncounter("scouting a point of interest");
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
    this.assertNoPendingRoadEncounter("exploring a local area");
    const current = this.currentNode();
    const result = this.applyActionApplication(
      applyOverworldSessionArea(
        {
          ...this.actionJournalState(),
          visitedAreaIds: this.visitedAreaIds,
        },
        planOverworldSessionArea({
          areaId,
          areasById: this.areasById,
          currentTownId: this.currentId,
          currentAreaId: this.currentArea()?.id ?? null,
          discoveredAreaIds: this.discoveredAreaIds,
          visitedAreaIds: this.visitedAreaIds,
          journalEntries: this.journalEntriesById,
        }),
        current.name,
      ),
    );
    return this.withLocalDiscovery(result, current.id);
  }

  moveArea(areaRouteId: string): OverworldAreaTravelResult {
    this.assertNoPendingRoadEncounter("moving between local areas");
    const currentArea = this.currentArea();
    if (!currentArea) throw new Error("There is no current local area in this town.");
    const edge = this.areaExitFrom(currentArea.id, areaRouteId);
    if (!edge) throw new Error("That local route is not reachable from here.");
    if (!this.discoveredAreaIds.has(edge.destination.id)) {
      throw new Error("Map that local area before moving there.");
    }
    const applied = applyOverworldAreaTravel(currentArea, edge, {
      currentAreaByTown: this.currentAreaByTown,
      currentTownId: this.currentId,
      minutes: this.minutes,
    });
    this.applyCurrentAreaTravelState(applied);
    this.clearSnapshotCache();
    return {
      from: applied.from,
      to: applied.to,
      route: applied.route,
      minutes: applied.minutes,
      arrivedAt: applied.arrivedAt,
    };
  }

  workLocalJob(jobId: string): OverworldActionResult {
    this.assertNoPendingRoadEncounter("working a local job");
    const current = this.currentNode();
    const result = this.applyActionApplication(
      applyOverworldSessionLocalJob(
        {
          ...this.actionJournalState(),
          regionRenown: this.regionRenown,
          completedJobIds: this.completedJobIds,
        },
        planOverworldSessionLocalJob({
          jobId,
          jobsById: this.jobsById,
          areasById: this.areasById,
          currentTownId: this.currentId,
          currentRegion: current.region,
          currentAreaId: this.currentAreaIdOrThrow(),
          discoveredJobIds: this.discoveredJobIds,
          completedJobIds: this.completedJobIds,
          journalEntries: this.journalEntriesById,
        }),
        current.name,
      ),
    );
    return this.withLocalDiscovery(result, current.id);
  }

  talkToCharacter(characterId: string): OverworldActionResult {
    this.assertNoPendingRoadEncounter("talking to a contact");
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
    this.assertNoPendingRoadEncounter("investigating a local event");
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
    this.assertNoPendingRoadEncounter("resolving a local event");
    const current = this.currentNode();
    const result = this.applyActionApplication(
      applyOverworldSessionEventResolution(
        {
          ...this.actionJournalState(),
          resolvedEventIds: this.resolvedEventIds,
          resolvedEventHomeIds: this.resolvedEventHomeIds,
          regionRenown: this.regionRenown,
          regionalArcsByRegion: this.regionalArcsByRegion,
          completedRegionalArcIds: this.completedRegionalArcIds,
        },
        planOverworldSessionEventResolution({
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
        }),
      ),
    );
    return this.withLocalDiscovery(result, current.id);
  }

  exploreSite(siteId: string): OverworldActionResult {
    this.assertNoPendingRoadEncounter("exploring a site");
    const current = this.currentNode();
    const result = this.applyActionApplication(
      applyOverworldSessionSite(
        {
          ...this.actionJournalState(),
          regionRenown: this.regionRenown,
          exploredSiteIds: this.exploredSiteIds,
        },
        planOverworldSessionSite({
          siteId,
          sitesById: this.sitesById,
          currentTownId: this.currentId,
          currentAreaId: this.currentAreaIdOrThrow(),
          discoveredSiteIds: this.discoveredSiteIds,
          exploredSiteIds: this.exploredSiteIds,
          journalEntries: this.journalEntriesById,
        }),
        current.name,
      ),
    );
    return this.withLocalDiscovery(result, current.id);
  }

  restAtTown(): OverworldServiceResult {
    this.assertNoPendingRoadEncounter("resting at town");
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
    this.assertNoPendingRoadEncounter("resupplying at town");
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
    this.assertNoPendingRoadEncounter("planning another road route");
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
    return withOverworldSessionRouteEstimate(plan, {
      fatigue: this.fatigue,
      supplies: this.supplies,
    });
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
    this.clearSnapshotCache();
    return applied.result;
  }

  travel(edgeId: string): TravelLogEntry {
    const recorded = applyOverworldSessionRoadTravel(
      {
        pendingRoadEncounter: this.pendingRoadEncounter,
        current: this.currentNode(),
        currentId: this.currentId,
        roadExitsByTownAndId: this.roadExitsByTownAndId,
        roadEventsByEdgeId: this.roadEventsByEdgeId,
        minutes: this.minutes,
        supplies: this.supplies,
        fatigue: this.fatigue,
        travelLog: this.travelLog,
      },
      edgeId,
    );
    this.applyResourceClockState(recorded);
    this.applyCurrentTownState(recorded);
    this.markSeen(this.currentId);
    this.applyPendingRoadEncounterState(recorded);
    this.clearSnapshotCache();
    return recorded.entry;
  }
}
