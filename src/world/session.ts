import { hashState } from "../core/hash.js";
import {
  overworldContactTalkJournalId,
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
  type OverworldRoutePlan,
} from "./overworld.js";
import {
  OVERWORLD_COMPACT_LOCAL_REF_LIMIT,
  cloneOverworldCompactView,
  type OverworldCompactJobChoice,
  type OverworldCompactQuestStart,
  type OverworldCompactView,
} from "./compact_view.js";
import {
  OVERWORLD_STARTING_MINUTES as STARTING_MINUTES,
  OVERWORLD_STARTING_SUPPLIES as STARTING_SUPPLIES,
  resolveOverworldTravelLeg,
  travelCondition,
  type OverworldRoadEncounterStrategy,
  type OverworldTravelLegResult,
} from "./travel_mechanics.js";
import {
  cloneOverworldRouteOption,
  indexedOverworldRoute,
  withOverworldRouteEstimate,
  withOverworldSessionRoadEvents,
  type OverworldRoutePlannerIndex,
  type OverworldSessionRoutePlan,
} from "./session_routes.js";
import { type OverworldRoadEncounterResult } from "./session_road_encounters.js";
import {
  recordOverworldRepeatableEntry,
  type OverworldActionJournalState,
} from "./session_action_recording.js";
import {
  type OverworldLocalDiscoveryResult,
  type OverworldQuestView,
} from "./session_local_discovery.js";
import {
  questCampaignEffectGroupsForOutcomes,
  type OverworldQuestCompletionOutcome,
  type OverworldQuestCompletionResult,
  type OverworldQuestStartPreparation,
} from "./session_quests.js";
import { deriveCampaignWorldFactIds } from "./campaign_consequences.js";
import {
  resolveCampaignServiceRules,
  type CampaignServiceOffer,
} from "./campaign_service_rules.js";
import {
  applyOverworldSessionQuestStart,
  applyOverworldSessionQuestCompletion,
  planOverworldSessionQuestStart,
  planOverworldSessionQuestCompletion,
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
import { campaignServiceJourneyActionId } from "./session_services.js";
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
  planOverworldSessionLocalJob,
} from "./session_local_lifecycle.js";
import {
  cloneOpeningLeadSourceDecisionTrail,
  cloneQuestCharacterDeathBoundary,
  cloneOverworldSessionSnapshot,
  parseOverworldSessionSnapshot,
  redactOverworldJournalEntryForPresentation,
  type OverworldJournalEntry,
  type OverworldOpeningLeadSourceDecisionTrail,
  type OverworldPendingRoadEncounter,
  type OverworldQuestCharacterDeathBoundary,
  type OverworldSessionSnapshot,
  type TravelLogEntry,
} from "./session_snapshot.js";
import {
  cloneCampaignCharacterState,
  createInitialCampaignCharacterState,
  serializeCampaignCharacterState,
  type CampaignCharacterState,
} from "./campaign_character_state.js";
import { applyOpeningRegistrationProfile } from "./opening_registration.js";
import { applyOpeningAllyOption } from "./opening_ally.js";
import {
  openingAllyJournalEntry,
  openingAllyJournalId,
  openingAllyOfferJournalEntry,
  openingAllyOfferJournalId,
} from "./opening_ally_journal.js";
import { presentOpeningAlly } from "./opening_ally_presentation.js";
import { applyOpeningLeadSourceOption } from "./opening_lead_source.js";
import { applyOpeningPreparationProfile } from "./opening_preparation.js";
import {
  openingLeadSourceJournalEntry,
  openingLeadSourceJournalId,
  openingLeadSourceOfferJournalEntry,
  openingLeadSourceOfferJournalId,
} from "./opening_lead_source_journal.js";
import { presentOpeningLeadSource } from "./opening_lead_source_presentation.js";
import {
  openingPreparationJournalEntry,
  openingPreparationJournalId,
  openingPreparationOfferJournalEntry,
  openingPreparationOfferJournalId,
} from "./opening_preparation_journal.js";
import { presentOpeningPreparation } from "./opening_preparation_presentation.js";
import { applyOpeningReliefAllocationOption } from "./opening_relief_allocation.js";
import {
  openingReliefAllocationJournalEntry,
  openingReliefAllocationJournalId,
  openingReliefAllocationOfferJournalEntry,
  openingReliefAllocationOfferJournalId,
} from "./opening_relief_allocation_journal.js";
import { presentOpeningReliefAllocation } from "./opening_relief_allocation_presentation.js";
import { applyOpeningReliefOathOption } from "./opening_relief_oath.js";
import {
  openingReliefOathJournalEntry,
  openingReliefOathJournalId,
  openingReliefOathOfferJournalEntry,
  openingReliefOathOfferJournalId,
} from "./opening_relief_oath_journal.js";
import { presentOpeningReliefOath } from "./opening_relief_oath_presentation.js";
import {
  openingRegistrationJournalEntry,
  openingRegistrationJournalId,
  openingRegistrationOfferJournalEntry,
  openingRegistrationOfferJournalId,
} from "./opening_registration_journal.js";
import { presentOpeningRegistration } from "./opening_registration_presentation.js";
import { withOpeningDispatchBriefing } from "./opening_dispatch_briefing.js";
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
  cloneOverworldGoalPassageResult,
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
  roadEventForOverworldSessionTravel,
} from "./session_road_travel.js";
import {
  buildJourneyGoalPassagePresentation,
  goalPassageHitsResourceBoundary,
  goalPassageJourneyActionId,
  overworldTravelDelayTier,
  type OverworldGoalPassageResult,
  type OverworldGoalPassageStopReason,
} from "./session_goal_passage.js";
import {
  activateJourneyGoal,
  assertJourneyAcceptingDecision as assertJourneyContractAcceptingDecision,
  chooseJourney as chooseJourneyContract,
  createInitialJourneyContractSnapshot,
  INITIAL_JOURNEY_GOAL,
  journeyExitReceipt,
  journeyPresentation,
  recordJourneyCharacterDied,
  recordJourneyDecision,
  recordJourneyGoalCompleted,
  type JourneyChoice,
  type JourneyChoiceResult,
  type JourneyContractSnapshot,
  type JourneyDecisionClassification,
  type JourneyExitReceipt,
  type JourneyGoalDefinition,
  type JourneyGoalPresentation,
  type JourneyPresentation,
  type JourneyPresentationContext,
} from "./journey_contract.js";
import {
  assertJourneyCampaignQuestOutcome,
  journeyCampaignGoalIsComplete,
  journeyCampaignGoalJournalCopy,
  journeyCampaignGoalDefinition,
  journeyCampaignPresentationContext,
  journeyCampaignSelectedStoryChoiceRefs,
  journeyCampaignStoryChoiceSelection,
  materializeJourneyCampaignGoal,
  nextJourneyCampaignGoal,
  type JourneyCampaignGoalDefinition,
} from "./journey_campaign.js";
import {
  classifyOverworldJourneyDecision,
  withJourneyDecision,
  type JourneyDecisionAnnotated,
  type OverworldJourneyActionKind,
} from "./journey_decision.js";
import { addOverworldJournalEntry } from "./session_journal_store.js";
import { timeLabel } from "./session_journal_codec.js";
import type { CampaignStoryChoiceRef } from "./campaign_story_choices.js";

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
export type { OverworldQuestStartPreparation } from "./session_quests.js";
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
export type {
  OverworldGoalPassageResult,
  OverworldGoalPassageStopReason,
} from "./session_goal_passage.js";
export type { OverworldView } from "./session_view.js";
export type {
  JourneyChoice,
  JourneyChoiceResult,
  JourneyExitReceipt,
  JourneyGoalPassagePresentation,
  JourneyPresentation,
  JourneyRetentionEvent,
} from "./journey_contract.js";

export type OverworldJourneyActionResult = JourneyDecisionAnnotated<OverworldActionResult>;
export type OverworldJourneyAreaTravelResult = JourneyDecisionAnnotated<OverworldAreaTravelResult>;
export type OverworldJourneyQuestCompletionResult =
  JourneyDecisionAnnotated<OverworldQuestCompletionResult>;
export type OverworldJourneyQuestStartResult = JourneyDecisionAnnotated<OverworldQuestView>;
export type OverworldJourneyRoadEncounterResult =
  JourneyDecisionAnnotated<OverworldRoadEncounterResult>;
export type OverworldJourneyServiceResult = JourneyDecisionAnnotated<OverworldServiceResult>;
export type OverworldJourneyTravelResult = JourneyDecisionAnnotated<TravelLogEntry>;
export type OverworldJourneyGoalPassageResult =
  JourneyDecisionAnnotated<OverworldGoalPassageResult>;

export type OverworldJourneyStoryChoiceResult = Readonly<{
  storyChoiceId: string;
  choiceId: string;
  consequence: string;
  goal: JourneyGoalPresentation;
  entry: OverworldJournalEntry;
  journeyDecision: JourneyDecisionClassification;
}>;

const DEFAULT_CAMPAIGN_CHARACTER_SERIALIZED = serializeCampaignCharacterState(
  createInitialCampaignCharacterState(),
);

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
  private readonly questOutcomeIds = new Map<string, string>();
  private readonly exploredSiteIds = new Set<string>();
  private readonly regionRenown = new Map<string, number>();
  private readonly completedRegionalArcIds = new Set<string>();
  private pendingRoadEncounter: OverworldPendingRoadEncounter | null = null;
  private characterState: CampaignCharacterState = createInitialCampaignCharacterState();
  private journeyState: JourneyContractSnapshot = createInitialJourneyContractSnapshot();
  private openingLeadSourceDecisionTrail: OverworldOpeningLeadSourceDecisionTrail | null = null;
  private questCharacterDeathBoundary: OverworldQuestCharacterDeathBoundary | null = null;
  private readonly journeyGoalBaseRouteByEndpoints = new Map<string, OverworldRoutePlan>();
  private readonly journeyGoalGuidanceByRoute = new Map<string, string>();
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
    const snapshot = parseOverworldSessionSnapshot(rawSnapshot);
    const session = new OverworldSession(world);
    session.applySnapshot(snapshot);
    if (snapshot.worldHash !== session.worldHash) {
      session.offerOpeningReliefAllocationAtDeparture();
    }
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

  /**
   * Trusted quest-launch input. The clone keeps the persistent character owned
   * by this session; an embedded RPG can project it without gaining a mutable
   * reference back into the overworld.
   */
  campaignCharacterState(): CampaignCharacterState {
    return cloneCampaignCharacterState(this.characterState);
  }

  /** Derived historical world truth; detached so callers cannot mutate session state. */
  campaignWorldFactIds(): string[] {
    return deriveCampaignWorldFactIds(
      questCampaignEffectGroupsForOutcomes(this.questsById, this.questOutcomeIds),
    );
  }

  private consumedCampaignServiceRuleIds(): Set<string> {
    return new Set(
      this.journalEntries.flatMap((entry) =>
        entry.kind === "service" && entry.serviceRuleId ? [entry.serviceRuleId] : [],
      ),
    );
  }

  private campaignServiceOffers(currentAreaId: string): CampaignServiceOffer[] {
    return resolveCampaignServiceRules({
      rules: this.world.campaign_service_rules ?? [],
      currentTownId: this.currentId,
      currentAreaId,
      worldFactIds: this.campaignWorldFactIds(),
      selectedStoryChoices: this.selectedCampaignStoryChoiceRefs(),
      consumedRuleIds: this.consumedCampaignServiceRuleIds(),
      character: this.characterState,
      regionRenown: this.regionRenown,
      providersById: this.charactersById,
    });
  }

  private currentGoalRoute(): OverworldSessionRoutePlan | null {
    const goal = this.journeyState.goal;
    if (goal.version === INITIAL_JOURNEY_GOAL.version || goal.status !== "active") return null;
    const definition = journeyCampaignGoalDefinition(goal);
    if (!definition) return null;
    const destination = this.nodes.get(definition.targetTownId);
    if (!destination) return null;
    const cacheKey = `${this.currentId}->${destination.id}`;
    let route = this.journeyGoalBaseRouteByEndpoints.get(cacheKey);
    if (!route) {
      route =
        indexedOverworldRoute(this.routePlannerIndex, this.currentId, destination.id) ?? undefined;
      if (!route) return null;
      this.journeyGoalBaseRouteByEndpoints.set(cacheKey, route);
    }
    return withOverworldRouteEstimate(
      withOverworldSessionRoadEvents(route, {
        activeGoalId: this.journeyState.goal.id,
        completedQuestIds: this.completedQuestIds,
        travelLog: this.travelLog,
      }),
      { fatigue: this.fatigue, supplies: this.supplies },
    );
  }

  private journeyGoalGuidance(route: OverworldSessionRoutePlan | null): string | null {
    const goal = this.journeyState.goal;
    const definition = journeyCampaignGoalDefinition(goal);
    if (!definition || !route) return null;
    const destination = route.destination;
    const area = this.areasById.get(definition.targetAreaId);
    if (!area) return null;
    if (this.currentId === destination.id) {
      return this.currentAreaId === area.id
        ? `Objective location reached: ${area.name}. Follow the visible authored lead here.`
        : `Objective town reached: move toward ${area.name} to find the authored lead.`;
    }

    const cacheKey = `${this.currentId}->${destination.id}`;
    const cached = this.journeyGoalGuidanceByRoute.get(cacheKey);
    if (cached) return cached;
    const next = route?.steps[0]?.to;
    if (!next) return null;
    const roadCount = route.steps.length;
    const guidance = `Objective route: take the road toward ${next.name}. ${destination.name} is ${String(roadCount)} ${roadCount === 1 ? "road" : "roads"} and about ${String(route.totalMinutes)} road minutes away.`;
    this.journeyGoalGuidanceByRoute.set(cacheKey, guidance);
    return guidance;
  }

  private journeyGoalPassage(
    route: OverworldSessionRoutePlan | null,
    storyChoice: JourneyPresentationContext["storyChoice"],
  ): JourneyPresentationContext["goalPassage"] {
    if (
      !route ||
      route.steps.length === 0 ||
      this.journeyState.status !== "active" ||
      this.pendingRoadEncounter !== null ||
      storyChoice
    ) {
      return null;
    }
    return buildJourneyGoalPassagePresentation(route);
  }

  private openingRegistrationEligible(): NonNullable<
    OverworldManifest["opening_registration"]
  > | null {
    const registration = this.world.opening_registration;
    if (
      !registration ||
      this.journeyState.status === "ended" ||
      this.currentId !== registration.home ||
      this.currentAreaId !== registration.area ||
      this.startedQuestIds.size > 0 ||
      this.completedQuestIds.size > 0 ||
      serializeCampaignCharacterState(this.characterState) !== DEFAULT_CAMPAIGN_CHARACTER_SERIALIZED
    ) {
      return null;
    }
    return registration;
  }

  private openingRegistrationAvailable(): NonNullable<
    OverworldManifest["opening_registration"]
  > | null {
    if (this.journeyState.status !== "active") return null;
    const registration = this.openingRegistrationEligible();
    if (!registration) return null;
    const latestEntry = this.journalEntries[0];
    if (
      latestEntry?.kind !== "registration_offer" ||
      latestEntry.id !== openingRegistrationOfferJournalId(registration.id)
    ) {
      return null;
    }
    return registration;
  }

  private openingLeadSourceResolved(): boolean {
    return this.journalEntries.some(
      (entry) => entry.kind === "lead_source" || entry.kind === "lead_source_legacy",
    );
  }

  private openingReliefOathResolved(): boolean {
    return this.journalEntries.some(
      (entry) => entry.kind === "relief_oath" || entry.kind === "relief_oath_legacy",
    );
  }

  private openingPreparationResolved(): boolean {
    return this.journalEntries.some(
      (entry) => entry.kind === "preparation" || entry.kind === "preparation_legacy",
    );
  }

  private openingReliefAllocationResolved(): boolean {
    return this.journalEntries.some(
      (entry) => entry.kind === "relief_allocation" || entry.kind === "relief_allocation_legacy",
    );
  }

  private openingAllyResolved(): boolean {
    return this.journalEntries.some(
      (entry) => entry.kind === "ally" || entry.kind === "ally_legacy",
    );
  }

  private openingAllyAvailable(): NonNullable<OverworldManifest["opening_ally"]> | null {
    const scene = this.world.opening_ally;
    if (!scene || this.journeyState.status !== "active" || this.openingAllyResolved()) {
      return null;
    }
    const latestEntry = this.journalEntries[0];
    if (
      latestEntry?.kind !== "ally_offer" ||
      latestEntry.id !== openingAllyOfferJournalId(scene.id)
    ) {
      return null;
    }
    return scene;
  }

  private openingPreparationAvailable(): NonNullable<
    OverworldManifest["opening_preparation"]
  > | null {
    const scene = this.world.opening_preparation;
    if (!scene || this.journeyState.status !== "active" || this.openingPreparationResolved()) {
      return null;
    }
    const latestEntry = this.journalEntries[0];
    if (
      latestEntry?.kind !== "preparation_offer" ||
      latestEntry.id !== openingPreparationOfferJournalId(scene.id)
    ) {
      return null;
    }
    return scene;
  }

  private openingReliefAllocationAvailable(): NonNullable<
    OverworldManifest["opening_relief_allocation"]
  > | null {
    const scene = this.world.opening_relief_allocation;
    if (!scene || this.journeyState.status !== "active" || this.openingReliefAllocationResolved()) {
      return null;
    }
    const latestEntry = this.journalEntries[0];
    if (
      latestEntry?.kind !== "relief_allocation_offer" ||
      latestEntry.id !== openingReliefAllocationOfferJournalId(scene.id)
    ) {
      return null;
    }
    return scene;
  }

  private openingReliefOathAvailable(): NonNullable<
    OverworldManifest["opening_relief_oath"]
  > | null {
    const scene = this.world.opening_relief_oath;
    if (!scene || this.journeyState.status !== "active" || this.openingReliefOathResolved()) {
      return null;
    }
    const latestEntry = this.journalEntries[0];
    if (
      latestEntry?.kind !== "relief_oath_offer" ||
      latestEntry.id !== openingReliefOathOfferJournalId(scene.id)
    ) {
      return null;
    }
    return scene;
  }

  private selectedCampaignStoryChoiceRefs(): CampaignStoryChoiceRef[] {
    const selected = [...journeyCampaignSelectedStoryChoiceRefs(this.journeyState)];
    const reliefOath = this.world.opening_relief_oath;
    const oathOption = reliefOath?.options.find((candidate) =>
      this.journalEntriesById.has(openingReliefOathJournalId(reliefOath.id, candidate.id)),
    );
    if (reliefOath && oathOption) {
      selected.push({ story_choice_id: reliefOath.id, choice_id: oathOption.id });
    }
    const preparation = this.world.opening_preparation;
    const profile = preparation?.profiles.find((candidate) =>
      this.journalEntriesById.has(openingPreparationJournalId(preparation.id, candidate.id)),
    );
    if (preparation && profile) {
      selected.push({ story_choice_id: preparation.id, choice_id: profile.id });
    }
    const reliefAllocation = this.world.opening_relief_allocation;
    const allocationOption = reliefAllocation?.options.find((candidate) =>
      this.journalEntriesById.has(
        openingReliefAllocationJournalId(reliefAllocation.id, candidate.id),
      ),
    );
    if (reliefAllocation && allocationOption) {
      selected.push({
        story_choice_id: reliefAllocation.id,
        choice_id: allocationOption.id,
      });
    }
    const ally = this.world.opening_ally;
    const option = ally?.options.find((candidate) =>
      this.journalEntriesById.has(openingAllyJournalId(ally.id, candidate.id)),
    );
    if (ally && option) {
      selected.push({ story_choice_id: ally.id, choice_id: option.id });
    }
    return selected;
  }

  private openingLeadSourceAvailable(): NonNullable<
    OverworldManifest["opening_lead_source"]
  > | null {
    const scene = this.world.opening_lead_source;
    if (!scene || this.journeyState.status !== "active" || this.openingLeadSourceResolved()) {
      return null;
    }
    const latestEntry = this.journalEntries[0];
    if (
      latestEntry?.kind !== "lead_source_offer" ||
      latestEntry.id !== openingLeadSourceOfferJournalId(scene.id)
    ) {
      return null;
    }
    return scene;
  }

  private offerOpeningReliefOathAfterRegistration(): void {
    const scene = this.world.opening_relief_oath;
    const registration = this.world.opening_registration;
    if (
      !scene ||
      !registration ||
      scene.after_registration !== registration.id ||
      this.openingReliefOathResolved() ||
      this.currentId !== scene.home ||
      this.currentAreaId !== scene.area
    ) {
      return;
    }
    const entryId = openingReliefOathOfferJournalId(scene.id);
    if (this.journalEntriesById.has(entryId)) return;
    const offer = openingReliefOathOfferJournalEntry({
      scene,
      town: this.currentNode().name,
      recordedAt: timeLabel(this.minutes),
      storyChoiceBoundary: {
        acceptedDecisions: this.journeyState.acceptedDecisions,
        decisionProofHash: this.journeyState.decisionProof.hash,
        townId: this.currentId,
        areaId: this.currentAreaIdOrThrow(),
        minutes: this.minutes,
      },
    });
    addOverworldJournalEntry(this.journalEntries, this.journalEntriesById, offer);
    this.clearSessionCaches();
  }

  private offerOpeningLeadSourceAfterRegistration(): void {
    const scene = this.world.opening_lead_source;
    const registration = this.world.opening_registration;
    const reliefOath = this.world.opening_relief_oath;
    if (
      !scene ||
      !registration ||
      scene.after_registration !== registration.id ||
      (reliefOath !== undefined &&
        reliefOath.after_registration === registration.id &&
        !this.openingReliefOathResolved()) ||
      this.openingLeadSourceResolved() ||
      this.currentId !== scene.home ||
      this.currentAreaId !== scene.area
    ) {
      return;
    }
    const entryId = openingLeadSourceOfferJournalId(scene.id);
    if (this.journalEntriesById.has(entryId)) return;
    const offer = openingLeadSourceOfferJournalEntry({
      scene,
      town: this.currentNode().name,
      recordedAt: timeLabel(this.minutes),
      storyChoiceBoundary: {
        acceptedDecisions: this.journeyState.acceptedDecisions,
        decisionProofHash: this.journeyState.decisionProof.hash,
        townId: this.currentId,
        areaId: this.currentAreaIdOrThrow(),
        minutes: this.minutes,
      },
    });
    addOverworldJournalEntry(this.journalEntries, this.journalEntriesById, offer);
    this.openingLeadSourceDecisionTrail = {
      anchorId: offer.id,
      baseAcceptedDecisions: this.journeyState.acceptedDecisions,
      baseDecisionProofHash: this.journeyState.decisionProof.hash,
      decisions: [],
    };
    this.clearSessionCaches();
  }

  private offerOpeningPreparationAfterLeadSource(): void {
    const scene = this.world.opening_preparation;
    const leadSource = this.world.opening_lead_source;
    if (
      !scene ||
      !leadSource ||
      scene.after_lead_source !== leadSource.id ||
      !this.openingLeadSourceResolved() ||
      this.openingPreparationResolved() ||
      this.currentId !== scene.home ||
      this.currentAreaId !== scene.area
    ) {
      return;
    }
    const entryId = openingPreparationOfferJournalId(scene.id);
    if (this.journalEntriesById.has(entryId)) return;
    const offer = openingPreparationOfferJournalEntry({
      scene,
      town: this.currentNode().name,
      recordedAt: timeLabel(this.minutes),
      storyChoiceBoundary: {
        acceptedDecisions: this.journeyState.acceptedDecisions,
        decisionProofHash: this.journeyState.decisionProof.hash,
        townId: this.currentId,
        areaId: this.currentAreaIdOrThrow(),
        minutes: this.minutes,
      },
    });
    addOverworldJournalEntry(this.journalEntries, this.journalEntriesById, offer);
    this.clearSessionCaches();
  }

  private offerOpeningReliefAllocationAtDeparture(): void {
    const scene = this.world.opening_relief_allocation;
    const preparation = this.world.opening_preparation;
    if (
      !scene ||
      !preparation ||
      scene.after_preparation !== preparation.id ||
      !this.openingPreparationResolved() ||
      this.openingReliefAllocationResolved() ||
      this.startedQuestIds.has(scene.target_quest) ||
      this.completedQuestIds.has(scene.target_quest) ||
      this.journeyState.status !== "active" ||
      this.currentId !== scene.home ||
      this.currentAreaId !== scene.area ||
      this.openingAllyAvailable() !== null
    ) {
      return;
    }
    const entryId = openingReliefAllocationOfferJournalId(scene.id);
    if (this.journalEntriesById.has(entryId)) return;
    const offer = openingReliefAllocationOfferJournalEntry({
      scene,
      town: this.currentNode().name,
      recordedAt: timeLabel(this.minutes),
      storyChoiceBoundary: {
        acceptedDecisions: this.journeyState.acceptedDecisions,
        decisionProofHash: this.journeyState.decisionProof.hash,
        townId: this.currentId,
        areaId: this.currentAreaIdOrThrow(),
        minutes: this.minutes,
      },
    });
    addOverworldJournalEntry(this.journalEntries, this.journalEntriesById, offer);
    this.clearSessionCaches();
  }

  private openingAllyOfferAfterContact(
    characterId: string,
  ): NonNullable<OverworldManifest["opening_ally"]> | null {
    const scene = this.world.opening_ally;
    const preparation = this.world.opening_preparation;
    if (
      !scene ||
      !preparation ||
      scene.after_preparation !== preparation.id ||
      characterId !== scene.contact ||
      !this.openingPreparationResolved() ||
      this.openingAllyResolved() ||
      this.startedQuestIds.size > 0 ||
      this.completedQuestIds.size > 0 ||
      this.journeyState.status !== "active" ||
      this.currentId !== scene.home ||
      this.currentAreaId !== scene.area
    ) {
      return null;
    }
    const entryId = openingAllyOfferJournalId(scene.id);
    return this.journalEntriesById.has(entryId) ? null : scene;
  }

  private offerOpeningAllyAfterContact(characterId: string): void {
    const scene = this.openingAllyOfferAfterContact(characterId);
    if (!scene) return;
    const offer = openingAllyOfferJournalEntry({
      scene,
      town: this.currentNode().name,
      recordedAt: timeLabel(this.minutes),
      storyChoiceBoundary: {
        acceptedDecisions: this.journeyState.acceptedDecisions,
        decisionProofHash: this.journeyState.decisionProof.hash,
        townId: this.currentId,
        areaId: this.currentAreaIdOrThrow(),
        minutes: this.minutes,
      },
    });
    addOverworldJournalEntry(this.journalEntries, this.journalEntriesById, offer);
    this.clearSessionCaches();
  }

  private openingStoryBlockedQuestIds(): ReadonlySet<string> {
    const reliefAllocation = this.world.opening_relief_allocation;
    if (reliefAllocation && !this.openingReliefAllocationResolved()) {
      return new Set([reliefAllocation.target_quest]);
    }
    const preparation = this.world.opening_preparation;
    if (preparation && !this.openingPreparationResolved()) {
      return new Set([preparation.target_quest]);
    }
    const reliefOath = this.world.opening_relief_oath;
    if (reliefOath && !this.openingReliefOathResolved()) {
      return new Set([reliefOath.target_quest]);
    }
    const scene = this.world.opening_lead_source;
    return scene && !this.openingLeadSourceResolved()
      ? new Set([scene.target_quest])
      : new Set<string>();
  }

  private offerOpeningRegistrationAfterContact(characterId: string): void {
    const registration = this.openingRegistrationEligible();
    if (!registration || characterId !== registration.contact) return;
    const baseContactId = overworldContactTalkJournalId(registration.contact, null);
    if (!this.journalEntriesById.has(baseContactId)) return;
    const offer = openingRegistrationOfferJournalEntry({
      registration,
      town: this.currentNode().name,
      recordedAt: timeLabel(this.minutes),
      registrationBoundary: {
        acceptedDecisions: this.journeyState.acceptedDecisions,
        decisionProofHash: this.journeyState.decisionProof.hash,
        townId: this.currentId,
        areaId: this.currentAreaIdOrThrow(),
        minutes: this.minutes,
      },
    });
    if (this.journalEntriesById.has(offer.id)) return;
    addOverworldJournalEntry(this.journalEntries, this.journalEntriesById, offer);
    this.clearSessionCaches();
  }

  private journeyPresentationContext(): JourneyPresentationContext | undefined {
    const campaign = journeyCampaignPresentationContext({
      journey: this.journeyState,
      questOutcomeIds: this.questOutcomeIds,
      completedQuestIds: this.completedQuestIds,
    });
    const pending = this.journeyState.pendingChoice;
    const pendingGoalCompletion = pending?.reasons.includes("goal_completed") === true;
    const goalRoute = this.currentGoalRoute();
    const goalGuidance = this.journeyGoalGuidance(goalRoute);
    let goalCompletion: JourneyPresentationContext["goalCompletion"];
    const registration = this.openingRegistrationAvailable();
    const reliefOath = this.openingReliefOathAvailable();
    const leadSource = this.openingLeadSourceAvailable();
    const preparation = this.openingPreparationAvailable();
    const reliefAllocation = this.openingReliefAllocationAvailable();
    const ally = this.openingAllyAvailable();
    let storyChoice: JourneyPresentationContext["storyChoice"] = registration
      ? presentOpeningRegistration(registration)
      : reliefOath
        ? presentOpeningReliefOath(reliefOath, this.characterState)
        : leadSource
          ? presentOpeningLeadSource(leadSource, this.characterState)
          : preparation
            ? presentOpeningPreparation(preparation, this.characterState)
            : reliefAllocation
              ? presentOpeningReliefAllocation(reliefAllocation, this.characterState)
              : ally
                ? presentOpeningAlly(ally, this.characterState)
                : undefined;

    storyChoice = withOpeningDispatchBriefing(this.world, storyChoice);

    if (campaign) {
      if (pendingGoalCompletion && campaign.preRetentionTeaser) {
        goalCompletion = {
          goalVersion: pending!.goalVersion!,
          goalId: pending!.goalId!,
          messagePrefix: campaign.completionContext,
          messageSuffix: campaign.preRetentionTeaser,
          ...(campaign.continueConsequencePrefix
            ? { continueConsequencePrefix: campaign.continueConsequencePrefix }
            : {}),
        };
      }
      if (campaign.storyChoice && !storyChoice) {
        storyChoice = {
          ...campaign.storyChoice,
          message: `${campaign.completionContext} ${campaign.storyChoice.message}`,
        };
      }
    } else if (pendingGoalCompletion) {
      const nextGoal = nextJourneyCampaignGoal({ completedQuestIds: this.completedQuestIds });
      if (nextGoal) {
        goalCompletion = {
          goalVersion: pending!.goalVersion!,
          goalId: pending!.goalId!,
          messageSuffix: `Another authored lead is ready: ${nextGoal.text}`,
          continueConsequencePrefix: `Continue with the next objective: ${nextGoal.text}`,
        };
      }
    }
    const goalPassage = this.journeyGoalPassage(goalRoute, storyChoice);
    if (!goalCompletion && !storyChoice && !goalGuidance && !goalPassage) return undefined;
    return {
      ...(goalCompletion ? { goalCompletion } : {}),
      ...(goalGuidance ? { goalGuidance } : {}),
      ...(goalPassage ? { goalPassage } : {}),
      ...(storyChoice ? { storyChoice } : {}),
    };
  }

  journey(): JourneyPresentation {
    return journeyPresentation(this.journeyState, this.journeyPresentationContext());
  }

  journeyExitReceipt(): JourneyExitReceipt | null {
    return journeyExitReceipt(this.journeyState);
  }

  assertJourneyAcceptingDecision(): void {
    assertJourneyContractAcceptingDecision(this.journeyState);
    if (this.journey().storyChoice) {
      throw new Error(
        "Choose the presented story consequence, character registration, relief oath, Albany lead source, preparation, relief allocation, or field-team commitment before taking another action.",
      );
    }
  }

  recordQuestDecision(
    actionId: string,
    classification: JourneyDecisionClassification,
  ): JourneyPresentation {
    this.assertJourneyAcceptingDecision();
    const before = this.journeyState;
    const next = recordJourneyDecision(
      before,
      {
        surface: "quest",
        actionId,
      },
      classification,
    );
    this.appendOpeningLeadSourceDecisionTrail(before, next);
    if (next !== this.journeyState) {
      this.journeyState = next;
      this.clearSessionCaches();
    }
    return this.journey();
  }

  recordQuestCharacterDeath(
    questId: string,
    outcome: Pick<OverworldQuestCompletionOutcome, "endingId" | "death">,
  ): JourneyPresentation {
    if (!this.startedQuestIds.has(questId) || this.completedQuestIds.has(questId)) {
      throw new Error(`Character death requires the exact unfinished started quest "${questId}".`);
    }
    if (!outcome.death || outcome.endingId.trim().length === 0) {
      throw new Error("A quest character-death boundary requires an identified death ending.");
    }
    if (this.questCharacterDeathBoundary !== null) {
      throw new Error("This journey already has a quest character-death boundary.");
    }
    const nextJourneyState = recordJourneyCharacterDied(this.journeyState);
    this.questCharacterDeathBoundary = {
      questId,
      endingId: outcome.endingId,
      acceptedDecisions: this.journeyState.acceptedDecisions,
      journeyDecisionProof: {
        hash: this.journeyState.decisionProof.hash,
        last: this.journeyState.decisionProof.last
          ? { ...this.journeyState.decisionProof.last }
          : null,
      },
    };
    this.journeyState = nextJourneyState;
    this.clearSessionCaches();
    return this.journey();
  }

  chooseJourney(choice: JourneyChoice): JourneyChoiceResult {
    const chosen = chooseJourneyContract(this.journeyState, choice);
    this.journeyState = chosen.state;
    if (
      choice === "continue" &&
      chosen.result.retentionEvent.reasons.includes("goal_completed") &&
      this.journeyState.goal.id !== INITIAL_JOURNEY_GOAL.id
    ) {
      const nextGoal = nextJourneyCampaignGoal({ completedQuestIds: this.completedQuestIds });
      if (nextGoal) {
        this.activateCampaignGoal(nextGoal);
      }
    }
    this.clearSessionCaches();
    return Object.freeze({ ...chosen.result, journey: this.journey() });
  }

  private activateCampaignGoal(definition: JourneyCampaignGoalDefinition): OverworldJournalEntry {
    const goal: JourneyGoalDefinition = materializeJourneyCampaignGoal(
      definition,
      this.journeyState.goal.version,
    );
    this.journeyState = activateJourneyGoal(this.journeyState, goal);
    const journalCopy = journeyCampaignGoalJournalCopy(definition, this.questOutcomeIds);
    const entry: OverworldJournalEntry = {
      id: `campaign_goal:${String(goal.version)}:${goal.id}`,
      kind: "campaign",
      town: this.currentNode().name,
      ...journalCopy,
      recordedAt: timeLabel(this.minutes),
    };
    addOverworldJournalEntry(this.journalEntries, this.journalEntriesById, entry);
    this.clearSessionCaches();
    return entry;
  }

  chooseJourneyStory(choiceId: string): OverworldJourneyStoryChoiceResult {
    assertJourneyContractAcceptingDecision(this.journeyState);
    const storyChoice = this.journey().storyChoice;
    if (!storyChoice) throw new Error("There is no story consequence to choose right now.");
    const option = storyChoice.options.find((candidate) => candidate.id === choiceId);
    if (!option) throw new Error(`Unknown story choice "${String(choiceId)}".`);
    if (storyChoice.kind === "registration") {
      const registration = this.openingRegistrationAvailable();
      if (!registration || storyChoice.id !== registration.id) {
        throw new Error("The presented opening registration is no longer available.");
      }
      const characterAfter = applyOpeningRegistrationProfile({
        registration,
        character: this.characterState,
        profileId: choiceId,
      });
      const entryId = openingRegistrationJournalId(registration.id, choiceId);
      if (this.journalEntriesById.has(entryId)) {
        throw new Error(`Opening registration journal entry "${entryId}" already exists.`);
      }
      const journeyDecision = this.recordOverworldDecision(
        `campaign_story:${storyChoice.id}:${choiceId}`,
        "progress",
        true,
      );
      const entry = openingRegistrationJournalEntry({
        registration,
        profileId: choiceId,
        town: this.currentNode().name,
        recordedAt: timeLabel(this.minutes),
        registrationBoundary: {
          acceptedDecisions: this.journeyState.acceptedDecisions,
          decisionProofHash: this.journeyState.decisionProof.hash,
          townId: this.currentId,
          areaId: this.currentAreaIdOrThrow(),
          minutes: this.minutes,
        },
      });
      this.characterState = characterAfter;
      addOverworldJournalEntry(this.journalEntries, this.journalEntriesById, entry);
      if (this.world.opening_relief_oath?.after_registration === registration.id) {
        this.offerOpeningReliefOathAfterRegistration();
      } else {
        this.offerOpeningLeadSourceAfterRegistration();
      }
      this.clearSessionCaches();
      return Object.freeze({
        storyChoiceId: storyChoice.id,
        choiceId,
        consequence: option.consequence,
        goal: this.journey().goal,
        entry: Object.freeze(redactOverworldJournalEntryForPresentation(entry)),
        journeyDecision,
      });
    }
    if (storyChoice.kind === "relief_oath") {
      const scene = this.openingReliefOathAvailable();
      if (!scene || storyChoice.id !== scene.id) {
        throw new Error("The presented opening relief oath is no longer available.");
      }
      const application = applyOpeningReliefOathOption({
        scene,
        character: this.characterState,
        optionId: choiceId,
      });
      const entryId = openingReliefOathJournalId(scene.id, choiceId);
      if (this.journalEntriesById.has(entryId)) {
        throw new Error(`Opening relief-oath journal entry "${entryId}" already exists.`);
      }
      const characterBefore = this.characterState;
      const journeyDecision = this.recordOverworldDecision(
        `campaign_story:${storyChoice.id}:${choiceId}`,
        "progress",
        true,
      );
      this.minutes += application.terms.minutes;
      const entry = openingReliefOathJournalEntry({
        scene,
        character: characterBefore,
        optionId: choiceId,
        town: this.currentNode().name,
        recordedAt: timeLabel(this.minutes),
        storyChoiceBoundary: {
          acceptedDecisions: this.journeyState.acceptedDecisions,
          decisionProofHash: this.journeyState.decisionProof.hash,
          townId: this.currentId,
          areaId: this.currentAreaIdOrThrow(),
          minutes: this.minutes,
        },
      });
      this.characterState = application.characterAfter;
      addOverworldJournalEntry(this.journalEntries, this.journalEntriesById, entry);
      this.offerOpeningLeadSourceAfterRegistration();
      this.clearSessionCaches();
      return Object.freeze({
        storyChoiceId: storyChoice.id,
        choiceId,
        consequence: option.consequence,
        goal: this.journey().goal,
        entry: Object.freeze(redactOverworldJournalEntryForPresentation(entry)),
        journeyDecision,
      });
    }
    if (storyChoice.kind === "lead_source") {
      const scene = this.openingLeadSourceAvailable();
      if (!scene || storyChoice.id !== scene.id) {
        throw new Error("The presented opening lead source is no longer available.");
      }
      const application = applyOpeningLeadSourceOption({
        scene,
        character: this.characterState,
        optionId: choiceId,
      });
      const entryId = openingLeadSourceJournalId(scene.id, choiceId);
      if (this.journalEntriesById.has(entryId)) {
        throw new Error(`Opening lead-source journal entry "${entryId}" already exists.`);
      }
      const characterBefore = this.characterState;
      const journeyDecision = this.recordOverworldDecision(
        `campaign_story:${storyChoice.id}:${choiceId}`,
        "progress",
        true,
      );
      this.minutes += application.terms.minutes;
      const entry = openingLeadSourceJournalEntry({
        scene,
        character: characterBefore,
        optionId: choiceId,
        town: this.currentNode().name,
        recordedAt: timeLabel(this.minutes),
        storyChoiceBoundary: {
          acceptedDecisions: this.journeyState.acceptedDecisions,
          decisionProofHash: this.journeyState.decisionProof.hash,
          townId: this.currentId,
          areaId: this.currentAreaIdOrThrow(),
          minutes: this.minutes,
        },
      });
      this.characterState = application.characterAfter;
      addOverworldJournalEntry(this.journalEntries, this.journalEntriesById, entry);
      // Source certification is the point at which Wolf-Winter becomes a real,
      // inspectable mission. Preparation remains mandatory before launch, but
      // its choice is now made against the authored quest and route briefing.
      this.discoveredQuestIds.add(scene.target_quest);
      if (this.world.opening_preparation?.after_lead_source === scene.id) {
        this.offerOpeningPreparationAfterLeadSource();
      }
      this.clearSessionCaches();
      return Object.freeze({
        storyChoiceId: storyChoice.id,
        choiceId,
        consequence: option.consequence,
        goal: this.journey().goal,
        entry: Object.freeze(redactOverworldJournalEntryForPresentation(entry)),
        journeyDecision,
      });
    }
    if (storyChoice.kind === "preparation") {
      const scene = this.openingPreparationAvailable();
      if (!scene || storyChoice.id !== scene.id) {
        throw new Error("The presented opening preparation is no longer available.");
      }
      const application = applyOpeningPreparationProfile({
        scene,
        character: this.characterState,
        profileId: choiceId,
      });
      const entryId = openingPreparationJournalId(scene.id, choiceId);
      if (this.journalEntriesById.has(entryId)) {
        throw new Error(`Opening preparation journal entry "${entryId}" already exists.`);
      }
      const characterBefore = this.characterState;
      const journeyDecision = this.recordOverworldDecision(
        `campaign_story:${storyChoice.id}:${choiceId}`,
        "progress",
        true,
      );
      this.minutes += application.terms.minutes;
      const entry = openingPreparationJournalEntry({
        scene,
        character: characterBefore,
        profileId: choiceId,
        town: this.currentNode().name,
        recordedAt: timeLabel(this.minutes),
        storyChoiceBoundary: {
          acceptedDecisions: this.journeyState.acceptedDecisions,
          decisionProofHash: this.journeyState.decisionProof.hash,
          townId: this.currentId,
          areaId: this.currentAreaIdOrThrow(),
          minutes: this.minutes,
        },
      });
      this.characterState = application.characterAfter;
      this.discoveredQuestIds.add(scene.target_quest);
      addOverworldJournalEntry(this.journalEntries, this.journalEntriesById, entry);
      this.offerOpeningReliefAllocationAtDeparture();
      this.clearSessionCaches();
      return Object.freeze({
        storyChoiceId: storyChoice.id,
        choiceId,
        consequence: option.consequence,
        goal: this.journey().goal,
        entry: Object.freeze(redactOverworldJournalEntryForPresentation(entry)),
        journeyDecision,
      });
    }
    if (storyChoice.kind === "relief_allocation") {
      const scene = this.openingReliefAllocationAvailable();
      if (!scene || storyChoice.id !== scene.id) {
        throw new Error("The presented opening relief allocation is no longer available.");
      }
      const application = applyOpeningReliefAllocationOption({
        scene,
        character: this.characterState,
        optionId: choiceId,
      });
      const entryId = openingReliefAllocationJournalId(scene.id, choiceId);
      if (this.journalEntriesById.has(entryId)) {
        throw new Error(`Opening relief allocation journal entry "${entryId}" already exists.`);
      }
      const characterBefore = this.characterState;
      const journeyDecision = this.recordOverworldDecision(
        `campaign_story:${storyChoice.id}:${choiceId}`,
        "progress",
        true,
      );
      this.minutes += application.terms.minutes;
      const entry = openingReliefAllocationJournalEntry({
        scene,
        character: characterBefore,
        optionId: choiceId,
        town: this.currentNode().name,
        recordedAt: timeLabel(this.minutes),
        storyChoiceBoundary: {
          acceptedDecisions: this.journeyState.acceptedDecisions,
          decisionProofHash: this.journeyState.decisionProof.hash,
          townId: this.currentId,
          areaId: this.currentAreaIdOrThrow(),
          minutes: this.minutes,
        },
      });
      this.characterState = application.characterAfter;
      addOverworldJournalEntry(this.journalEntries, this.journalEntriesById, entry);
      this.clearSessionCaches();
      return Object.freeze({
        storyChoiceId: storyChoice.id,
        choiceId,
        consequence: option.consequence,
        goal: this.journey().goal,
        entry: Object.freeze(redactOverworldJournalEntryForPresentation(entry)),
        journeyDecision,
      });
    }
    if (storyChoice.kind === "ally") {
      const scene = this.openingAllyAvailable();
      if (!scene || storyChoice.id !== scene.id) {
        throw new Error("The presented opening ally commitment is no longer available.");
      }
      const application = applyOpeningAllyOption({
        scene,
        character: this.characterState,
        optionId: choiceId,
      });
      const entryId = openingAllyJournalId(scene.id, choiceId);
      if (this.journalEntriesById.has(entryId)) {
        throw new Error(`Opening ally journal entry "${entryId}" already exists.`);
      }
      const characterBefore = this.characterState;
      const journeyDecision = this.recordOverworldDecision(
        `campaign_story:${storyChoice.id}:${choiceId}`,
        "progress",
        true,
      );
      this.minutes += application.terms.minutes;
      const entry = openingAllyJournalEntry({
        scene,
        character: characterBefore,
        optionId: choiceId,
        town: this.currentNode().name,
        recordedAt: timeLabel(this.minutes),
        storyChoiceBoundary: {
          acceptedDecisions: this.journeyState.acceptedDecisions,
          decisionProofHash: this.journeyState.decisionProof.hash,
          townId: this.currentId,
          areaId: this.currentAreaIdOrThrow(),
          minutes: this.minutes,
        },
      });
      this.characterState = application.characterAfter;
      addOverworldJournalEntry(this.journalEntries, this.journalEntriesById, entry);
      this.offerOpeningReliefAllocationAtDeparture();
      this.clearSessionCaches();
      return Object.freeze({
        storyChoiceId: storyChoice.id,
        choiceId,
        consequence: option.consequence,
        goal: this.journey().goal,
        entry: Object.freeze(redactOverworldJournalEntryForPresentation(entry)),
        journeyDecision,
      });
    }
    const selection = journeyCampaignStoryChoiceSelection(storyChoice.id, choiceId);

    const entry = this.activateCampaignGoal(selection.goal);
    const journeyDecision = this.recordOverworldDecision(
      `campaign_story:${selection.storyChoiceId}:${selection.choiceId}`,
      "progress",
      true,
    );
    if (journeyCampaignGoalIsComplete(this.journeyState.goal, this.completedQuestIds)) {
      this.journeyState = recordJourneyGoalCompleted(this.journeyState);
    }
    this.clearSessionCaches();
    return Object.freeze({
      storyChoiceId: selection.storyChoiceId,
      choiceId: selection.choiceId,
      consequence: option.consequence,
      goal: this.journey().goal,
      entry: Object.freeze({ ...entry }),
      journeyDecision,
    });
  }

  private persistenceState(): OverworldSessionPersistenceState {
    return {
      worldId: this.world.id,
      worldHash: this.worldHash,
      character: this.characterState,
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
      questOutcomeIds: this.questOutcomeIds,
      exploredSiteIds: this.exploredSiteIds,
      regionRenown: this.regionRenown,
      completedRegionalArcIds: this.completedRegionalArcIds,
      pendingRoadEncounter: this.pendingRoadEncounter,
      openingLeadSourceDecisionTrail: this.openingLeadSourceDecisionTrail,
      questCharacterDeathBoundary: this.questCharacterDeathBoundary,
      journey: this.journeyState,
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
    this.characterState = applied.characterAfter;
    this.journeyState = applied.journeyAfter;
    this.questCharacterDeathBoundary = snapshot.questCharacterDeathBoundary
      ? cloneQuestCharacterDeathBoundary(snapshot.questCharacterDeathBoundary)
      : null;
    this.assertQuestCharacterDeathBoundary();
    this.openingLeadSourceDecisionTrail = applied.openingLeadSourceDecisionTrailAfter
      ? cloneOpeningLeadSourceDecisionTrail(applied.openingLeadSourceDecisionTrailAfter)
      : null;
    this.clearSessionCaches();
  }

  private assertQuestCharacterDeathBoundary(): void {
    const pendingDeath =
      this.journeyState.pendingChoice?.reasons.includes("character_died") === true;
    const endedDeath =
      this.journeyState.retentionHistory.at(-1)?.reasons.includes("character_died") === true;
    const boundary = this.questCharacterDeathBoundary;
    if (!pendingDeath && !endedDeath) {
      if (boundary !== null) {
        throw new Error(
          "Overworld session quest character-death boundary exists without a death journey.",
        );
      }
      return;
    }
    if (boundary === null) {
      throw new Error("Overworld session character death has no durable quest death boundary.");
    }
    if (
      !this.startedQuestIds.has(boundary.questId) ||
      this.completedQuestIds.has(boundary.questId)
    ) {
      throw new Error(
        `Overworld session character death is not bound to its exact unfinished quest "${boundary.questId}".`,
      );
    }
    if (boundary.acceptedDecisions !== this.journeyState.acceptedDecisions) {
      throw new Error(
        "Overworld session character death does not match its accepted journey decision.",
      );
    }
    if (boundary.journeyDecisionProof.hash !== this.journeyState.decisionProof.hash) {
      throw new Error(
        "Overworld session character death does not match its journey decision proof hash.",
      );
    }
    if (
      hashState(boundary.journeyDecisionProof.last) !==
      hashState(this.journeyState.decisionProof.last)
    ) {
      throw new Error(
        "Overworld session character death does not match its last journey decision proof.",
      );
    }
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
      completedJobIds: this.completedJobIds,
      discoveredSiteIds: this.discoveredSiteIds,
      discoveredQuestIds: this.discoveredQuestIds,
      completedQuestIds: this.completedQuestIds,
    };
  }

  private actionJournalState(): OverworldActionJournalState {
    return {
      minutes: this.minutes,
      journalEntries: this.journalEntries,
      journalEntriesById: this.journalEntriesById,
    };
  }

  private recordOverworldDecision(
    actionId: string,
    kind: OverworldJourneyActionKind,
    stateChanged: boolean,
  ): JourneyDecisionClassification {
    const classification = classifyOverworldJourneyDecision(kind, stateChanged);
    const before = this.journeyState;
    const after = recordJourneyDecision(before, { surface: "overworld", actionId }, classification);
    this.appendOpeningLeadSourceDecisionTrail(before, after);
    this.journeyState = after;
    return classification;
  }

  private appendOpeningLeadSourceDecisionTrail(
    before: JourneyContractSnapshot,
    after: JourneyContractSnapshot,
  ): void {
    const trail = this.openingLeadSourceDecisionTrail;
    if (!trail || after.acceptedDecisions !== before.acceptedDecisions + 1) return;
    const decision = after.decisionProof.last;
    if (!decision) {
      throw new Error("An accepted opening lead-source decision is missing its journey proof.");
    }
    this.openingLeadSourceDecisionTrail = {
      ...trail,
      decisions: [...trail.decisions, { ...decision }],
    };
  }

  private applyActionApplication(
    applied: OverworldSessionActionApplication,
    actionId: string,
    kind: OverworldJourneyActionKind,
  ): OverworldJourneyActionResult {
    this.applyClockState(applied);
    const journeyDecision = this.recordOverworldDecision(actionId, kind, applied.stateChanged);
    const localSceneProof = applied.result.entry.localSceneProof;
    if (localSceneProof && !localSceneProof.boundary) {
      if (!journeyDecision.countsTowardJourney) {
        throw new Error("An authored local scene is missing its accepted decision proof.");
      }
      localSceneProof.boundary = {
        acceptedDecisions: this.journeyState.acceptedDecisions,
        decisionProofHash: this.journeyState.decisionProof.hash,
        townId: this.currentId,
        areaId: this.currentAreaIdOrThrow(),
        minutes: this.minutes,
      };
    }
    if (applied.stateChanged || journeyDecision.countsTowardJourney) this.clearSessionCaches();
    return withJourneyDecision(applied.result, journeyDecision);
  }

  private applyServiceApplication(
    applied: OverworldSessionServiceApplication,
    actionId: string,
  ): OverworldJourneyServiceResult {
    if (applied.stateChanged) {
      this.applyResourceClockState(applied);
    }
    const serviceEntry = applied.result.entry;
    const serviceRuleId = serviceEntry?.serviceRuleId;
    const journeyActionId = serviceRuleId
      ? campaignServiceJourneyActionId(serviceRuleId, applied.result.action)
      : actionId;
    const journeyDecision = this.recordOverworldDecision(
      journeyActionId,
      "preparation",
      applied.stateChanged,
    );
    if (serviceRuleId) {
      const currentAreaId = this.currentAreaIdOrThrow();
      if (
        !serviceEntry ||
        serviceEntry.serviceAreaId !== currentAreaId ||
        !journeyDecision.countsTowardJourney
      ) {
        throw new Error("A campaign service is missing its accepted location decision proof.");
      }
      serviceEntry.serviceBoundary = {
        acceptedDecisions: this.journeyState.acceptedDecisions,
        decisionProofHash: this.journeyState.decisionProof.hash,
        townId: this.currentId,
        areaId: currentAreaId,
        minutes: this.minutes,
      };
    }
    if (applied.stateChanged || journeyDecision.countsTowardJourney) this.clearSessionCaches();
    return withJourneyDecision(cloneOverworldServiceResult(applied.result), journeyDecision);
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
    const applied = applyOverworldSessionLocalDiscoveryForTown(
      this.localState(),
      nodeId,
      this.openingStoryBlockedQuestIds(),
    );
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
    actionId: string,
    kind: OverworldJourneyActionKind,
  ): OverworldJourneyActionResult {
    return cloneOverworldActionResult(
      this.withLocalDiscovery(this.applyActionApplication(applied, actionId, kind), current.id),
    ) as OverworldJourneyActionResult;
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
    const localView = buildOverworldSessionCurrentLocalView(localState, currentAreaId);
    return {
      caches: this.caches,
      character: this.characterState,
      worldName: this.world.name,
      worldTownCount: this.world.nodes.length,
      current,
      currentArea,
      currentId: this.currentId,
      minutes: this.minutes,
      supplies: this.supplies,
      fatigue: this.fatigue,
      serviceOffers: this.campaignServiceOffers(currentAreaId),
      roads: this.roadsFrom(this.currentId),
      areaExits: visibleOverworldSessionAreaExits(localState, currentArea),
      localState,
      localView,
      jobChoices: this.liveJobChoices(localView.jobs),
      questStarts: this.liveQuestStarts(localView.quests),
      routePlannerIndex: this.routePlannerIndex,
      roadEventState: {
        activeGoalId: this.journeyState.goal.id,
        completedQuestIds: this.completedQuestIds,
        travelLog: this.travelLog,
      },
      completedQuestIds: this.completedQuestIds,
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

  private liveJobChoices(jobs: readonly OverworldLocalJob[]): OverworldCompactJobChoice[] {
    try {
      this.assertJourneyAcceptingDecision();
      this.assertNoPendingRoadEncounter("working a local job");
    } catch {
      return [];
    }

    const choices: OverworldCompactJobChoice[] = [];
    for (let index = 0; index < jobs.length; index += 1) {
      const job = jobs[index]!;
      if (!job.authored_scene) continue;
      for (const option of job.authored_scene.options) {
        try {
          const plan = planOverworldSessionLocalJob({
            jobId: job.id,
            optionId: option.id,
            jobsById: this.jobsById,
            areasById: this.areasById,
            currentTownId: this.currentId,
            currentRegion: this.currentNode().region,
            currentAreaId: this.currentAreaIdOrThrow(),
            discoveredJobIds: this.discoveredJobIds,
            completedJobIds: this.completedJobIds,
            completedQuestIds: this.completedQuestIds,
            journalEntries: this.journalEntriesById,
          });
          if (!plan.alreadyKnown) choices.push([job.id, option.id]);
        } catch {
          // Canonical preparation is the sole authority for executable job choices.
        }
      }
    }
    return choices;
  }

  private liveQuestStarts(quests: readonly OverworldQuestView[]): OverworldCompactQuestStart[] {
    try {
      this.assertJourneyAcceptingDecision();
    } catch {
      return [];
    }

    const starts: OverworldCompactQuestStart[] = [];
    const capped = Math.min(quests.length, OVERWORLD_COMPACT_LOCAL_REF_LIMIT);
    for (let index = 0; index < capped; index += 1) {
      const quest = quests[index]!;
      const approachIds = quest.launch
        ? quest.launch.options.map((option) => option.id)
        : [undefined];
      for (const approachId of approachIds) {
        try {
          const plan = this.prepareQuestStart(quest.id, approachId);
          starts.push([plan.quest.id, plan.approachId]);
        } catch {
          // Canonical preparation is the sole authority for executable quest starts.
        }
      }
    }
    return starts;
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

  private questStartState(questId: string, approachId?: string): OverworldSessionQuestStartState {
    this.assertNoPendingRoadEncounter("starting a quest");
    const unfinishedQuestId = [...this.startedQuestIds].find(
      (startedQuestId) => !this.completedQuestIds.has(startedQuestId),
    );
    if (unfinishedQuestId && unfinishedQuestId !== questId) {
      const unfinishedQuest = this.questsById.get(unfinishedQuestId);
      throw new Error(
        `Finish the active quest ${unfinishedQuest?.title ?? unfinishedQuestId} before starting another quest.`,
      );
    }
    const registration = this.world.opening_registration;
    if (
      registration &&
      this.startedQuestIds.size === 0 &&
      this.completedQuestIds.size === 0 &&
      serializeCampaignCharacterState(this.characterState) === DEFAULT_CAMPAIGN_CHARACTER_SERIALIZED
    ) {
      const contact = this.charactersById.get(registration.contact);
      const area = this.areasById.get(registration.area);
      throw new Error(
        `Complete ${registration.title} with ${contact?.name ?? "the registration contact"} in ${area?.name ?? "the opening registration area"} before starting this journey's first quest.`,
      );
    }
    const reliefOath = this.world.opening_relief_oath;
    if (reliefOath?.target_quest === questId && !this.openingReliefOathResolved()) {
      throw new Error(
        `Set ${reliefOath.title} before starting this journey's first relief dispatch.`,
      );
    }
    const leadSource = this.world.opening_lead_source;
    if (leadSource?.target_quest === questId && !this.openingLeadSourceResolved()) {
      throw new Error(
        `Certify ${leadSource.title} before starting this journey's first relief dispatch.`,
      );
    }
    const preparation = this.world.opening_preparation;
    if (preparation?.target_quest === questId && !this.openingPreparationResolved()) {
      throw new Error(
        `Commit ${preparation.title} before starting this journey's first relief dispatch.`,
      );
    }
    const reliefAllocation = this.world.opening_relief_allocation;
    const targetQuest = this.questsById.get(questId);
    if (
      reliefAllocation?.target_quest === questId &&
      !this.openingReliefAllocationResolved() &&
      targetQuest?.home === this.currentId &&
      targetQuest.area === this.currentArea()?.id
    ) {
      throw new Error(
        `Commit ${reliefAllocation.title} in the departure area before starting this journey's first relief dispatch.`,
      );
    }
    return {
      ...this.actionJournalState(),
      questId,
      ...(approachId !== undefined ? { approachId } : {}),
      sessionFingerprint: this.snapshotHash(),
      supplies: this.supplies,
      fatigue: this.fatigue,
      character: this.characterState,
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

  prepareQuestStart(questId: string, approachId?: string): OverworldQuestStartPreparation {
    return planOverworldSessionQuestStart(this.questStartState(questId, approachId));
  }

  commitQuestStart(plan: OverworldQuestStartPreparation): OverworldJourneyQuestStartResult {
    this.assertJourneyAcceptingDecision();
    const canonicalPlan = planOverworldSessionQuestStart(
      this.questStartState(plan.quest.id, plan.approachId === null ? undefined : plan.approachId),
    );
    if (
      canonicalPlan.preconditionFingerprint !== plan.preconditionFingerprint ||
      hashState(canonicalPlan) !== hashState(plan)
    ) {
      throw new Error("Quest start plan is stale; prepare the quest start again.");
    }
    const applied = applyOverworldSessionQuestStart(
      this.questStartState(
        canonicalPlan.quest.id,
        canonicalPlan.approachId === null ? undefined : canonicalPlan.approachId,
      ),
      canonicalPlan,
    );
    this.applyResourceClockState(applied);
    this.characterState = cloneCampaignCharacterState(applied.characterAfter);
    const journeyDecision = this.recordOverworldDecision(
      canonicalPlan.journeyActionId,
      "progress",
      applied.stateChanged,
    );
    if (canonicalPlan.approachId !== null) {
      applied.result.entry.questStartProof = {
        kind: "approach",
        approachId: canonicalPlan.approachId,
        boundary: {
          acceptedDecisions: this.journeyState.acceptedDecisions,
          decisionProofHash: this.journeyState.decisionProof.hash,
          townId: this.currentId,
          areaId: this.currentAreaIdOrThrow(),
          minutes: this.minutes,
        },
      };
    }
    this.clearSessionCaches();
    return withJourneyDecision(cloneOverworldQuestView(applied.quest), journeyDecision);
  }

  startQuest(questId: string, approachId?: string): OverworldJourneyQuestStartResult {
    return this.commitQuestStart(this.prepareQuestStart(questId, approachId));
  }

  completeQuest(
    questId: string,
    outcome: OverworldQuestCompletionOutcome,
  ): OverworldJourneyQuestCompletionResult {
    if (this.journeyState.status === "ended") throw new Error("This journey has ended.");
    this.assertNoPendingRoadEncounter("completing a quest");
    const completionState = {
      ...this.actionJournalState(),
      character: this.characterState,
      completedQuestIds: this.completedQuestIds,
      questOutcomeIds: this.questOutcomeIds,
      regionRenown: this.regionRenown,
      questId,
      outcome,
      questsById: this.questsById,
      areasById: this.areasById,
      nodesById: this.nodes,
      startedQuestIds: this.startedQuestIds,
    };
    const completionPlan = planOverworldSessionQuestCompletion(completionState);
    if (this.questsById.get(questId)?.campaign_exports === undefined) {
      assertJourneyCampaignQuestOutcome(questId, outcome.endingId);
    }
    const applied = applyOverworldSessionQuestCompletion(completionState, completionPlan);
    this.applyClockState(applied);
    if (applied.stateChanged) {
      applied.result.entry.questCompletionBoundary = {
        acceptedDecisions: this.journeyState.acceptedDecisions,
        decisionProofHash: this.journeyState.decisionProof.hash,
        townId: this.currentId,
        areaId: this.currentAreaIdOrThrow(),
        minutes: this.minutes,
      };
    }
    if (applied.stateChanged && !outcome.death) {
      this.characterState = applied.characterAfter;
      this.questOutcomeIds.set(questId, outcome.endingId);
    }
    if (
      applied.stateChanged &&
      !outcome.death &&
      journeyCampaignGoalIsComplete(this.journeyState.goal, this.completedQuestIds)
    ) {
      this.journeyState = recordJourneyGoalCompleted(this.journeyState);
    }
    if (applied.stateChanged) {
      this.clearSessionCaches();
    }
    return withJourneyDecision(
      cloneOverworldQuestCompletionResult(applied.result),
      classifyOverworldJourneyDecision("technical_quest_foldback", applied.stateChanged),
    );
  }

  scoutPoi(poiId: string): OverworldJourneyActionResult {
    this.assertJourneyAcceptingDecision();
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
      `scout:${poiId}`,
      "clue",
    );
  }

  exploreArea(areaId: string): OverworldJourneyActionResult {
    this.assertJourneyAcceptingDecision();
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
      `explore_area:${areaId}`,
      "clue",
    );
  }

  moveArea(areaRouteId: string): OverworldJourneyAreaTravelResult {
    this.assertJourneyAcceptingDecision();
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
    const journeyDecision = this.recordOverworldDecision(
      `move_area:${areaRouteId}`,
      "movement",
      true,
    );
    this.offerOpeningReliefAllocationAtDeparture();
    this.clearSessionCaches();
    return withJourneyDecision(
      cloneOverworldAreaTravelResult({
        from: applied.from,
        to: applied.to,
        route: applied.route,
        minutes: applied.minutes,
        arrivedAt: applied.arrivedAt,
      }),
      journeyDecision,
    );
  }

  workLocalJob(jobId: string, optionId?: string): OverworldJourneyActionResult {
    this.assertJourneyAcceptingDecision();
    this.assertNoPendingRoadEncounter("working a local job");
    const current = this.currentNode();
    return this.applyLocalActionWithDiscovery(
      current,
      applyOverworldSessionLocalJobFromState({
        ...this.actionJournalState(),
        jobId,
        optionId,
        jobsById: this.jobsById,
        areasById: this.areasById,
        currentTownId: this.currentId,
        currentRegion: current.region,
        currentAreaId: this.currentAreaIdOrThrow(),
        discoveredJobIds: this.discoveredJobIds,
        completedJobIds: this.completedJobIds,
        completedQuestIds: this.completedQuestIds,
        journalEntriesById: this.journalEntriesById,
        regionRenown: this.regionRenown,
        currentTownName: current.name,
      }),
      optionId ? `work_job:${jobId}:${optionId}` : `work_job:${jobId}`,
      "progress",
    );
  }

  talkToCharacter(characterId: string): OverworldJourneyActionResult {
    this.assertJourneyAcceptingDecision();
    this.assertNoPendingRoadEncounter("talking to a contact");
    const current = this.currentNode();
    let applied = applyOverworldSessionContactTalkFromState({
      ...this.actionJournalState(),
      character: this.characterState,
      characterId,
      charactersById: this.charactersById,
      completedQuestIds: this.completedQuestIds,
      currentTownId: this.currentId,
      currentAreaId: () => this.currentAreaIdOrThrow(),
      currentTownName: current.name,
    });
    if (!applied.stateChanged && this.openingAllyOfferAfterContact(characterId)) {
      const { recordedAt: _recordedAt, ...contactDraft } = applied.result.entry;
      const repeated = recordOverworldRepeatableEntry(this.actionJournalState(), contactDraft, 0);
      applied = {
        ...applied,
        result: { ...applied.result, entry: repeated.entry },
        stateChanged: true,
      };
    }
    const result = this.applyLocalActionWithDiscovery(
      current,
      applied,
      `talk:${characterId}`,
      "dialogue",
    );
    this.offerOpeningRegistrationAfterContact(characterId);
    this.offerOpeningAllyAfterContact(characterId);
    return result;
  }

  investigateEvent(eventId: string): OverworldJourneyActionResult {
    this.assertJourneyAcceptingDecision();
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
      `investigate_event:${eventId}`,
      "clue",
    );
  }

  resolveEvent(eventId: string): OverworldJourneyActionResult {
    this.assertJourneyAcceptingDecision();
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
      `resolve_event:${eventId}`,
      "progress",
    );
  }

  exploreSite(siteId: string): OverworldJourneyActionResult {
    this.assertJourneyAcceptingDecision();
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
      `explore_site:${siteId}`,
      "progress",
    );
  }

  restAtTown(): OverworldJourneyServiceResult {
    this.assertJourneyAcceptingDecision();
    this.assertNoPendingRoadEncounter("resting at town");
    const current = this.currentNode();
    return this.applyServiceApplication(
      applyOverworldSessionTownRestFromState({
        ...this.actionJournalState(),
        currentTown: current,
        currentAreaId: this.currentAreaIdOrThrow(),
        campaignServiceRules: this.world.campaign_service_rules ?? [],
        campaignWorldFactIds: this.campaignWorldFactIds(),
        campaignStoryChoiceRefs: this.selectedCampaignStoryChoiceRefs(),
        consumedCampaignServiceRuleIds: this.consumedCampaignServiceRuleIds(),
        campaignCharacter: this.characterState,
        regionRenown: this.regionRenown,
        fatigue: this.fatigue,
        supplies: this.supplies,
      }),
      "rest",
    );
  }

  resupplyAtTown(): OverworldJourneyServiceResult {
    this.assertJourneyAcceptingDecision();
    this.assertNoPendingRoadEncounter("resupplying at town");
    const current = this.currentNode();
    return this.applyServiceApplication(
      applyOverworldSessionTownResupplyFromState({
        ...this.actionJournalState(),
        currentTown: current,
        currentAreaId: this.currentAreaIdOrThrow(),
        campaignServiceRules: this.world.campaign_service_rules ?? [],
        campaignWorldFactIds: this.campaignWorldFactIds(),
        campaignStoryChoiceRefs: this.selectedCampaignStoryChoiceRefs(),
        consumedCampaignServiceRuleIds: this.consumedCampaignServiceRuleIds(),
        campaignCharacter: this.characterState,
        regionRenown: this.regionRenown,
        fatigue: this.fatigue,
        supplies: this.supplies,
      }),
      "resupply",
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
        roadEventState: {
          activeGoalId: this.journeyState.goal.id,
          completedQuestIds: this.completedQuestIds,
          travelLog: this.travelLog,
        },
        resources: {
          fatigue: this.fatigue,
          supplies: this.supplies,
        },
      }),
    );
  }

  resolveRoadEncounter(
    strategy: OverworldRoadEncounterStrategy,
  ): OverworldJourneyRoadEncounterResult {
    this.assertJourneyAcceptingDecision();
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
    const journeyDecision = this.recordOverworldDecision(
      `road_encounter:${strategy}`,
      "progress",
      true,
    );
    this.clearSessionCaches();
    return withJourneyDecision(cloneOverworldRoadEncounterResult(applied.result), journeyDecision);
  }

  private previewRoadTravelLeg(edgeId: string): OverworldTravelLegResult {
    const edge = this.roadExitsByTownAndId.get(this.currentId)?.get(edgeId);
    if (!edge) throw new Error("That road is not reachable from here.");
    const roadEvent = roadEventForOverworldSessionTravel(
      this.roadEventsByEdgeId.get(edge.id) ?? null,
      {
        activeGoalId: this.journeyState.goal.id,
        completedQuestIds: this.completedQuestIds,
        travelLog: this.travelLog,
      },
    );
    return resolveOverworldTravelLeg(edge.travel_minutes, roadEvent, {
      fatigue: this.fatigue,
      supplies: this.supplies,
    });
  }

  /** Apply one real road leg without assigning a journey-decision boundary. */
  private applyRoadTravelLeg(edgeId: string): TravelLogEntry {
    const recorded = applyOverworldSessionRoadTravelArrival(
      {
        activeGoalId: this.journeyState.goal.id,
        completedQuestIds: this.completedQuestIds,
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
    return recorded.entry;
  }

  travel(edgeId: string): OverworldJourneyTravelResult {
    this.assertJourneyAcceptingDecision();
    const entry = this.applyRoadTravelLeg(edgeId);
    const journeyDecision = this.recordOverworldDecision(`travel:${edgeId}`, "movement", true);
    this.clearSessionCaches();
    return withJourneyDecision(cloneOverworldTravelLogEntry(entry), journeyDecision);
  }

  followGoalPassage(): OverworldJourneyGoalPassageResult {
    this.assertJourneyAcceptingDecision();
    this.assertNoPendingRoadEncounter("following the current goal passage");
    const route = this.currentGoalRoute();
    if (!route || route.steps.length === 0) {
      throw new Error("There is no current goal passage to follow from here.");
    }

    const goalId = this.journeyState.goal.id;
    const destinationId = route.destination.id;
    const destination = route.destination.name;
    const selectionDelayTier = overworldTravelDelayTier(this.fatigue);
    const selectionSupplies = this.supplies;
    const legs: TravelLogEntry[] = [];
    let stopReason: OverworldGoalPassageStopReason | null = null;

    for (const step of route.steps) {
      const preview = this.previewRoadTravelLeg(step.edge.id);
      if (
        goalPassageHitsResourceBoundary({
          traversedRoadCount: legs.length,
          selectionDelayTier,
          selectionSupplies,
          currentFatigue: this.fatigue,
          preview,
        })
      ) {
        stopReason = "resource_boundary";
        break;
      }

      legs.push(this.applyRoadTravelLeg(step.edge.id));
      if (this.pendingRoadEncounter) {
        stopReason = "road_encounter";
        break;
      }
      if (this.currentId === destinationId) {
        stopReason = "objective";
        break;
      }
    }

    if (legs.length === 0 || stopReason === null) {
      throw new Error("The current goal passage could not advance along its visible route.");
    }

    const journeyDecision = this.recordOverworldDecision(
      goalPassageJourneyActionId(
        goalId,
        legs.map((leg) => leg.edgeId),
      ),
      "movement",
      true,
    );
    this.clearSessionCaches();
    const result: OverworldGoalPassageResult = {
      goalId,
      destination,
      stoppedAt: this.currentNode().name,
      stopReason,
      legs,
      baseMinutes: legs.reduce((sum, leg) => sum + leg.baseMinutes, 0),
      delayMinutes: legs.reduce((sum, leg) => sum + leg.delayMinutes, 0),
      minutes: legs.reduce((sum, leg) => sum + leg.minutes, 0),
      suppliesUsed: legs.reduce((sum, leg) => sum + leg.suppliesUsed, 0),
      suppliesAfter: this.supplies,
      fatigueGained: legs.reduce((sum, leg) => sum + leg.fatigueGained, 0),
      fatigueAfter: this.fatigue,
      travelConditionAfter: travelCondition(this.fatigue, this.supplies),
    };
    return withJourneyDecision(cloneOverworldGoalPassageResult(result), journeyDecision);
  }

  travelTo(destinationTownId: string): OverworldJourneyTravelResult {
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
