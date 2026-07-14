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
  type OverworldRoutePlan,
} from "./overworld.js";
import { cloneOverworldCompactView, type OverworldCompactView } from "./compact_view.js";
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
import { type OverworldActionJournalState } from "./session_action_recording.js";
import {
  type OverworldLocalDiscoveryResult,
  type OverworldQuestView,
} from "./session_local_discovery.js";
import {
  questCampaignEffectGroupsForOutcomes,
  type OverworldQuestCompletionOutcome,
  type OverworldQuestCompletionResult,
} from "./session_quests.js";
import { deriveCampaignWorldFactIds } from "./campaign_consequences.js";
import {
  applyOverworldSessionQuestCompletion,
  applyOverworldSessionQuestStartFromState,
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
  cloneOverworldSessionSnapshot,
  parseOverworldSessionSnapshot,
  type OverworldJournalEntry,
  type OverworldPendingRoadEncounter,
  type OverworldSessionSnapshot,
  type TravelLogEntry,
} from "./session_snapshot.js";
import {
  cloneCampaignCharacterState,
  createInitialCampaignCharacterState,
  type CampaignCharacterState,
} from "./campaign_character_state.js";
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
  journeyCampaignStoryChoiceSelection,
  materializeJourneyCampaignGoal,
  nextJourneyCampaignGoal,
  type JourneyCampaignGoalDefinition,
  type JourneyCampaignStoryChoiceId,
  type JourneyCampaignStoryChoiceOptionId,
} from "./journey_campaign.js";
import {
  classifyOverworldJourneyDecision,
  withJourneyDecision,
  type JourneyDecisionAnnotated,
  type OverworldJourneyActionKind,
} from "./journey_decision.js";
import { addOverworldJournalEntry } from "./session_journal_store.js";
import { timeLabel } from "./session_journal_codec.js";

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
  storyChoiceId: JourneyCampaignStoryChoiceId;
  choiceId: JourneyCampaignStoryChoiceOptionId;
  consequence: string;
  goal: JourneyGoalPresentation;
  entry: OverworldJournalEntry;
  journeyDecision: JourneyDecisionClassification;
}>;

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
    let storyChoice: JourneyPresentationContext["storyChoice"];

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
      if (campaign.storyChoice) {
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
      throw new Error("Choose the presented story consequence before taking another action.");
    }
  }

  recordQuestDecision(
    actionId: string,
    classification: JourneyDecisionClassification,
  ): JourneyPresentation {
    this.assertJourneyAcceptingDecision();
    const next = recordJourneyDecision(
      this.journeyState,
      {
        surface: "quest",
        actionId,
      },
      classification,
    );
    if (next !== this.journeyState) {
      this.journeyState = next;
      this.clearSessionCaches();
    }
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
    this.journeyState = recordJourneyDecision(
      this.journeyState,
      { surface: "overworld", actionId },
      classification,
    );
    return classification;
  }

  private applyActionApplication(
    applied: OverworldSessionActionApplication,
    actionId: string,
    kind: OverworldJourneyActionKind,
  ): OverworldJourneyActionResult {
    this.applyClockState(applied);
    const journeyDecision = this.recordOverworldDecision(actionId, kind, applied.stateChanged);
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
    const journeyDecision = this.recordOverworldDecision(
      actionId,
      "preparation",
      applied.stateChanged,
    );
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
      roads: this.roadsFrom(this.currentId),
      areaExits: visibleOverworldSessionAreaExits(localState, currentArea),
      localState,
      localView: buildOverworldSessionCurrentLocalView(localState, currentAreaId),
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

  startQuest(questId: string): OverworldJourneyQuestStartResult {
    this.assertJourneyAcceptingDecision();
    const applied = applyOverworldSessionQuestStartFromState(this.questStartState(questId));
    this.applyClockState(applied);
    const journeyDecision = this.recordOverworldDecision(
      `quest_start:${questId}`,
      "progress",
      applied.stateChanged,
    );
    this.clearSessionCaches();
    return withJourneyDecision(cloneOverworldQuestView(applied.quest), journeyDecision);
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

  workLocalJob(jobId: string): OverworldJourneyActionResult {
    this.assertJourneyAcceptingDecision();
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
      `work_job:${jobId}`,
      "progress",
    );
  }

  talkToCharacter(characterId: string): OverworldJourneyActionResult {
    this.assertJourneyAcceptingDecision();
    this.assertNoPendingRoadEncounter("talking to a contact");
    const current = this.currentNode();
    return this.applyLocalActionWithDiscovery(
      current,
      applyOverworldSessionContactTalkFromState({
        ...this.actionJournalState(),
        characterId,
        charactersById: this.charactersById,
        completedQuestIds: this.completedQuestIds,
        currentTownId: this.currentId,
        currentAreaId: () => this.currentAreaIdOrThrow(),
        currentTownName: current.name,
      }),
      `talk:${characterId}`,
      "dialogue",
    );
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
      goalPassageJourneyActionId(goalId),
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
