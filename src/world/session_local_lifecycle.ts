import {
  describeOverworldContactAction,
  describeOverworldEventAction,
  describeOverworldPoiAction,
  type OverworldLocalActionDescriptor,
  type OverworldLocalActionKind,
} from "./local_actions.js";
import type {
  OverworldArea,
  OverworldAreaExit,
  OverworldCharacter,
  OverworldExplorationSite,
  OverworldExit,
  OverworldLocalEvent,
  OverworldLocalJob,
  OverworldNode,
  OverworldPoi,
} from "./overworld.js";
import {
  recordOverworldSessionLocalAction,
  type OverworldSessionActionApplication,
} from "./session_action_application.js";
import type { OverworldActionJournalState } from "./session_action_recording.js";
import { presentOverworldContact } from "./session_contact_presentation.js";
import {
  applyOverworldAreaExploration,
  applyOverworldAreaTravel,
  applyOverworldLocalJobCompletion,
  applyOverworldSiteExploration,
  applyOverworldTownVisit,
  planOverworldAreaExploration,
  planOverworldLocalJobCompletion,
  planOverworldSiteExploration,
  type OverworldAppliedAreaTravel,
  type OverworldAppliedTownVisit,
  type OverworldAreaExplorationPlan,
  type OverworldLocalJobCompletionPlan,
  type OverworldSiteExplorationPlan,
} from "./session_local_actions.js";
import type { OverworldJournalEntry } from "./session_snapshot.js";
import type { CampaignCharacterState } from "./campaign_character_state.js";
import { localEventSceneRequirementsMet } from "./local_event_scene.js";

export type OverworldSessionAreaPlanState = {
  areaId: string;
  areasById: ReadonlyMap<string, OverworldArea>;
  currentTownId: string;
  currentAreaId: string | null;
  discoveredAreaIds: ReadonlySet<string>;
  visitedAreaIds: ReadonlySet<string>;
  journalEntries: ReadonlyMap<string, OverworldJournalEntry>;
};

export type OverworldSessionAreaTravelPlanState = {
  areaRouteId: string;
  currentArea: OverworldArea | null;
  areaExitsByAreaAndId: ReadonlyMap<string, ReadonlyMap<string, OverworldAreaExit>>;
  discoveredAreaIds: ReadonlySet<string>;
};

export type OverworldSessionAreaTravelPlan = {
  currentArea: OverworldArea;
  edge: OverworldAreaExit;
};

export type MutableOverworldSessionTownVisitState = {
  nodeId: string;
  areasByTown: ReadonlyMap<string, readonly OverworldArea[]>;
  roadExitsByTown: ReadonlyMap<string, readonly OverworldExit[]>;
  currentAreaId: string | null;
  currentAreaByTown: Map<string, string>;
  discoveredAreaIds: Set<string>;
  discoveredIds: Set<string>;
  visitedIds: Set<string>;
};

export type OverworldSessionLocalJobPlanState = {
  jobId: string;
  optionId?: string | undefined;
  jobsById: ReadonlyMap<string, OverworldLocalJob>;
  areasById: ReadonlyMap<string, OverworldArea>;
  currentTownId: string;
  currentRegion: string;
  currentAreaId: string | null;
  discoveredJobIds: ReadonlySet<string>;
  completedJobIds: ReadonlySet<string>;
  completedQuestIds?: ReadonlySet<string> | undefined;
  resolvedEventIds?: ReadonlySet<string> | undefined;
  campaignWorldFactIds?: ReadonlySet<string> | undefined;
  journalEntries: ReadonlyMap<string, OverworldJournalEntry>;
};

export type OverworldSessionSitePlanState = {
  siteId: string;
  sitesById: ReadonlyMap<string, OverworldExplorationSite>;
  currentTownId: string;
  currentAreaId: string | null;
  discoveredSiteIds: ReadonlySet<string>;
  exploredSiteIds: ReadonlySet<string>;
  journalEntries: ReadonlyMap<string, OverworldJournalEntry>;
};

export type OverworldSessionPoiScoutPlanState = {
  poiId: string;
  poisById: ReadonlyMap<string, OverworldPoi>;
  currentTown: OverworldNode;
  currentAreaId: () => string;
};

export type OverworldSessionContactTalkPlanState = {
  character: CampaignCharacterState;
  characterId: string;
  charactersById: ReadonlyMap<string, OverworldCharacter>;
  completedQuestIds: ReadonlySet<string>;
  currentTownId: string;
  currentAreaId: () => string;
};

export type OverworldSessionEventInvestigationPlanState = {
  eventId: string;
  eventsById: ReadonlyMap<string, OverworldLocalEvent>;
  completedQuestIds: ReadonlySet<string>;
  currentTownId: string;
  currentAreaId: () => string;
};

export type OverworldSessionLocalInteractionPlan<
  Kind extends OverworldLocalActionKind = OverworldLocalActionKind,
> = {
  action: OverworldLocalActionDescriptor<Kind>;
};

export type MutableOverworldSessionLocalJobState = OverworldActionJournalState & {
  completedJobIds: Set<string>;
  regionRenown: Map<string, number>;
};

export type MutableOverworldSessionAreaState = OverworldActionJournalState & {
  visitedAreaIds: Set<string>;
};

export type MutableOverworldSessionAreaTravelState = {
  currentAreaByTown: Map<string, string>;
  currentTownId: string;
  minutes: number;
};

export type MutableOverworldSessionSiteState = OverworldActionJournalState & {
  exploredSiteIds: Set<string>;
  regionRenown: Map<string, number>;
};

export type OverworldSessionPoiScoutState = OverworldActionJournalState &
  OverworldSessionPoiScoutPlanState;

export type OverworldSessionContactTalkState = OverworldActionJournalState &
  OverworldSessionContactTalkPlanState & {
    currentTownName: string;
  };

export type OverworldSessionEventInvestigationState = OverworldActionJournalState &
  OverworldSessionEventInvestigationPlanState & {
    currentTownName: string;
  };

export type OverworldSessionAreaState = Omit<OverworldSessionAreaPlanState, "journalEntries"> &
  MutableOverworldSessionAreaState & {
    currentTownName: string;
    journalEntriesById: ReadonlyMap<string, OverworldJournalEntry>;
  };

export type OverworldSessionLocalJobState = Omit<
  OverworldSessionLocalJobPlanState,
  "journalEntries"
> &
  MutableOverworldSessionLocalJobState & {
    currentTownName: string;
    journalEntriesById: ReadonlyMap<string, OverworldJournalEntry>;
  };

export type OverworldSessionSiteState = Omit<OverworldSessionSitePlanState, "journalEntries"> &
  MutableOverworldSessionSiteState & {
    currentTownName: string;
    journalEntriesById: ReadonlyMap<string, OverworldJournalEntry>;
  };

export type OverworldSessionAreaTravelState = OverworldSessionAreaTravelPlanState &
  MutableOverworldSessionAreaTravelState;

export function planOverworldSessionArea(
  state: OverworldSessionAreaPlanState,
): OverworldAreaExplorationPlan {
  return planOverworldAreaExploration(state);
}

export function planOverworldSessionAreaTravel(
  state: OverworldSessionAreaTravelPlanState,
): OverworldSessionAreaTravelPlan {
  if (!state.currentArea) throw new Error("There is no current local area in this town.");

  const edge = state.areaExitsByAreaAndId.get(state.currentArea.id)?.get(state.areaRouteId);
  if (!edge) throw new Error("That local route is not reachable from here.");
  if (!state.discoveredAreaIds.has(edge.destination.id)) {
    throw new Error("Map that local area before moving there.");
  }

  return {
    currentArea: state.currentArea,
    edge,
  };
}

export function planOverworldSessionLocalJob(
  state: OverworldSessionLocalJobPlanState,
): OverworldLocalJobCompletionPlan {
  return planOverworldLocalJobCompletion(state);
}

export function planOverworldSessionSite(
  state: OverworldSessionSitePlanState,
): OverworldSiteExplorationPlan {
  return planOverworldSiteExploration(state);
}

export function planOverworldSessionPoiScout(
  state: OverworldSessionPoiScoutPlanState,
): OverworldSessionLocalInteractionPlan<"poi"> {
  const poi = state.poisById.get(state.poiId);
  if (!poi || poi.home !== state.currentTown.id) {
    throw new Error("That point of interest is not in this town.");
  }
  if (poi.area !== state.currentAreaId()) {
    throw new Error("Move to that local area before scouting this point of interest.");
  }
  return { action: describeOverworldPoiAction(poi, state.currentTown) };
}

export function planOverworldSessionContactTalk(
  state: OverworldSessionContactTalkPlanState,
): OverworldSessionLocalInteractionPlan<"contact"> {
  const character = state.charactersById.get(state.characterId);
  if (!character || character.home !== state.currentTownId) {
    throw new Error("That contact is not in this town.");
  }
  if (character.area !== state.currentAreaId()) {
    throw new Error("Move to that local area before talking to that contact.");
  }
  const presentation = presentOverworldContact(character, {
    character: state.character,
    completedQuestIds: state.completedQuestIds,
  });
  return {
    action: describeOverworldContactAction(presentation.contact, presentation.presentationId),
  };
}

export function planOverworldSessionEventInvestigation(
  state: OverworldSessionEventInvestigationPlanState,
): OverworldSessionLocalInteractionPlan<"event"> {
  const event = state.eventsById.get(state.eventId);
  if (!event || event.home !== state.currentTownId) {
    throw new Error("That event is not active in this town.");
  }
  if (event.area !== state.currentAreaId()) {
    throw new Error("Move to that local area before investigating that event.");
  }
  if (
    event.authored_scene &&
    !localEventSceneRequirementsMet(event.authored_scene, {
      completedQuestIds: state.completedQuestIds,
    })
  ) {
    throw new Error(
      `The authored choice for ${event.title} must be made before completing ${event.authored_scene.forbids_completed_quests?.join(", ") ?? "its forbidden quest"}.`,
    );
  }
  return { action: describeOverworldEventAction(event) };
}

export function applyOverworldSessionLocalInteraction(
  state: OverworldActionJournalState,
  plan: OverworldSessionLocalInteractionPlan,
  townName: string,
): OverworldSessionActionApplication {
  return recordOverworldSessionLocalAction(state, plan.action, townName);
}

export function applyOverworldSessionPoiScoutFromState(
  state: OverworldSessionPoiScoutState,
): OverworldSessionActionApplication {
  return applyOverworldSessionLocalInteraction(
    state,
    planOverworldSessionPoiScout(state),
    state.currentTown.name,
  );
}

export function applyOverworldSessionContactTalkFromState(
  state: OverworldSessionContactTalkState,
): OverworldSessionActionApplication {
  return applyOverworldSessionLocalInteraction(
    state,
    planOverworldSessionContactTalk(state),
    state.currentTownName,
  );
}

export function applyOverworldSessionEventInvestigationFromState(
  state: OverworldSessionEventInvestigationState,
): OverworldSessionActionApplication {
  return applyOverworldSessionLocalInteraction(
    state,
    planOverworldSessionEventInvestigation(state),
    state.currentTownName,
  );
}

export function applyOverworldSessionAreaTravel(
  state: MutableOverworldSessionAreaTravelState,
  plan: OverworldSessionAreaTravelPlan,
): OverworldAppliedAreaTravel {
  return applyOverworldAreaTravel(plan.currentArea, plan.edge, state);
}

export function applyOverworldSessionAreaTravelFromState(
  state: OverworldSessionAreaTravelState,
): OverworldAppliedAreaTravel {
  return applyOverworldSessionAreaTravel(state, planOverworldSessionAreaTravel(state));
}

export function applyOverworldSessionTownVisit(
  state: MutableOverworldSessionTownVisitState,
): OverworldAppliedTownVisit {
  return applyOverworldTownVisit({
    nodeId: state.nodeId,
    localAreas: state.areasByTown.get(state.nodeId) ?? [],
    currentAreaId: state.currentAreaId,
    currentAreaByTown: state.currentAreaByTown,
    discoveredAreaIds: state.discoveredAreaIds,
    discoveredIds: state.discoveredIds,
    roadDestinationIds: (state.roadExitsByTown.get(state.nodeId) ?? []).map(
      (edge) => edge.destination.id,
    ),
    visitedIds: state.visitedIds,
  });
}

export function applyOverworldSessionArea(
  state: MutableOverworldSessionAreaState,
  plan: OverworldAreaExplorationPlan,
  townName: string,
): OverworldSessionActionApplication {
  if (plan.alreadyKnown) {
    return {
      result: {
        minutes: 0,
        alreadyKnown: true,
        entry: plan.entry,
      },
      minutesAfter: state.minutes,
      stateChanged: false,
    };
  }

  const applied = recordOverworldSessionLocalAction(state, plan.action, townName);
  if (!applied.result.alreadyKnown) {
    applyOverworldAreaExploration({ visitedAreaIds: state.visitedAreaIds }, plan);
  }
  return applied;
}

export function applyOverworldSessionAreaFromState(
  state: OverworldSessionAreaState,
): OverworldSessionActionApplication {
  return applyOverworldSessionArea(
    state,
    planOverworldSessionArea({
      ...state,
      journalEntries: state.journalEntriesById,
    }),
    state.currentTownName,
  );
}

export function applyOverworldSessionLocalJob(
  state: MutableOverworldSessionLocalJobState,
  plan: OverworldLocalJobCompletionPlan,
  townName: string,
): OverworldSessionActionApplication {
  if (plan.alreadyKnown) {
    return {
      result: {
        minutes: 0,
        alreadyKnown: true,
        entry: plan.entry,
      },
      minutesAfter: state.minutes,
      stateChanged: false,
    };
  }

  const applied = recordOverworldSessionLocalAction(state, plan.action, townName);
  if (!applied.result.alreadyKnown) {
    if (plan.localScene) {
      applied.result.entry.localSceneProof = {
        sceneId: plan.localScene.scene.id,
        optionId: plan.localScene.option.id,
      };
    }
    applyOverworldLocalJobCompletion(
      {
        completedJobIds: state.completedJobIds,
        regionRenown: state.regionRenown,
      },
      plan,
    );
  }
  return applied;
}

export function applyOverworldSessionLocalJobFromState(
  state: OverworldSessionLocalJobState,
): OverworldSessionActionApplication {
  return applyOverworldSessionLocalJob(
    state,
    planOverworldSessionLocalJob({
      ...state,
      journalEntries: state.journalEntriesById,
    }),
    state.currentTownName,
  );
}

export function applyOverworldSessionSite(
  state: MutableOverworldSessionSiteState,
  plan: OverworldSiteExplorationPlan,
  townName: string,
): OverworldSessionActionApplication {
  if (plan.alreadyKnown) {
    return {
      result: {
        minutes: 0,
        alreadyKnown: true,
        entry: plan.entry,
      },
      minutesAfter: state.minutes,
      stateChanged: false,
    };
  }

  const applied = recordOverworldSessionLocalAction(state, plan.action, townName);
  if (!applied.result.alreadyKnown) {
    applyOverworldSiteExploration(
      {
        exploredSiteIds: state.exploredSiteIds,
        regionRenown: state.regionRenown,
      },
      plan,
    );
  }
  return applied;
}

export function applyOverworldSessionSiteFromState(
  state: OverworldSessionSiteState,
): OverworldSessionActionApplication {
  return applyOverworldSessionSite(
    state,
    planOverworldSessionSite({
      ...state,
      journalEntries: state.journalEntriesById,
    }),
    state.currentTownName,
  );
}
