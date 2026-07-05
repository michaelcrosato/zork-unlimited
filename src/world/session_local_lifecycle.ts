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
import {
  applyOverworldAreaExploration,
  applyOverworldAreaTravel,
  applyOverworldLocalJobCompletion,
  applyOverworldSiteExploration,
  planOverworldAreaExploration,
  planOverworldLocalJobCompletion,
  planOverworldSiteExploration,
  type OverworldAppliedAreaTravel,
  type OverworldAreaExplorationPlan,
  type OverworldLocalJobCompletionPlan,
  type OverworldSiteExplorationPlan,
} from "./session_local_actions.js";
import type { OverworldJournalEntry } from "./session_snapshot.js";

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

export type OverworldSessionLocalJobPlanState = {
  jobId: string;
  jobsById: ReadonlyMap<string, OverworldLocalJob>;
  areasById: ReadonlyMap<string, OverworldArea>;
  currentTownId: string;
  currentRegion: string;
  currentAreaId: string | null;
  discoveredJobIds: ReadonlySet<string>;
  completedJobIds: ReadonlySet<string>;
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
  characterId: string;
  charactersById: ReadonlyMap<string, OverworldCharacter>;
  currentTownId: string;
  currentAreaId: () => string;
};

export type OverworldSessionEventInvestigationPlanState = {
  eventId: string;
  eventsById: ReadonlyMap<string, OverworldLocalEvent>;
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
  return { action: describeOverworldContactAction(character) };
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
  return { action: describeOverworldEventAction(event) };
}

export function applyOverworldSessionLocalInteraction(
  state: OverworldActionJournalState,
  plan: OverworldSessionLocalInteractionPlan,
  townName: string,
): OverworldSessionActionApplication {
  return recordOverworldSessionLocalAction(state, plan.action, townName);
}

export function applyOverworldSessionAreaTravel(
  state: MutableOverworldSessionAreaTravelState,
  plan: OverworldSessionAreaTravelPlan,
): OverworldAppliedAreaTravel {
  return applyOverworldAreaTravel(plan.currentArea, plan.edge, state);
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
