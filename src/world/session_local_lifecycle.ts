import type { OverworldArea, OverworldExplorationSite, OverworldLocalJob } from "./overworld.js";
import {
  recordOverworldSessionLocalAction,
  type OverworldSessionActionApplication,
} from "./session_action_application.js";
import type { OverworldActionJournalState } from "./session_action_recording.js";
import {
  applyOverworldAreaExploration,
  applyOverworldLocalJobCompletion,
  applyOverworldSiteExploration,
  planOverworldAreaExploration,
  planOverworldLocalJobCompletion,
  planOverworldSiteExploration,
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

export type MutableOverworldSessionLocalJobState = OverworldActionJournalState & {
  completedJobIds: Set<string>;
  regionRenown: Map<string, number>;
};

export type MutableOverworldSessionAreaState = OverworldActionJournalState & {
  visitedAreaIds: Set<string>;
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
