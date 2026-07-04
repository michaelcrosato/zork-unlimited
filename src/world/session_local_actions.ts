import {
  describeOverworldAreaAction,
  describeOverworldJobAction,
  describeOverworldSiteAction,
  type OverworldLocalActionDescriptor,
} from "./local_actions.js";
import type {
  OverworldArea,
  OverworldAreaExit,
  OverworldExplorationSite,
  OverworldLocalJob,
} from "./overworld.js";
import { timeLabel } from "./session_journal_codec.js";
import type { OverworldJournalEntry } from "./session_snapshot.js";

export type OverworldJournalEntryLookup = {
  get(id: string): OverworldJournalEntry | undefined;
};

export type OverworldLocalActionKnownPlan = {
  alreadyKnown: true;
  minutes: 0;
  entry: OverworldJournalEntry;
};

export type OverworldAreaExplorationPlan =
  | OverworldLocalActionKnownPlan
  | {
      alreadyKnown: false;
      areaId: string;
      action: OverworldLocalActionDescriptor<"area">;
    };

export type OverworldPlannedAreaExploration = Extract<
  OverworldAreaExplorationPlan,
  { alreadyKnown: false }
>;

export type OverworldLocalJobCompletionPlan =
  | OverworldLocalActionKnownPlan
  | {
      alreadyKnown: false;
      jobId: string;
      action: OverworldLocalActionDescriptor<"job">;
      renownRegion: string;
      renown: number;
    };

export type OverworldPlannedLocalJobCompletion = Extract<
  OverworldLocalJobCompletionPlan,
  { alreadyKnown: false }
>;

export type OverworldSiteExplorationPlan =
  | OverworldLocalActionKnownPlan
  | {
      alreadyKnown: false;
      siteId: string;
      action: OverworldLocalActionDescriptor<"site">;
      renownRegion: string;
      renown: number;
    };

export type OverworldPlannedSiteExploration = Extract<
  OverworldSiteExplorationPlan,
  { alreadyKnown: false }
>;

export type OverworldAreaTravelResult = {
  from: OverworldArea;
  to: OverworldArea;
  route: string;
  minutes: number;
  arrivedAt: string;
};

export type OverworldAreaTravelApplicationState = {
  currentTownId: string;
  minutes: number;
};

export type OverworldAppliedAreaTravel = OverworldAreaTravelResult & {
  currentAreaIdAfter: string;
  currentAreaByTownEntry: readonly [string, string];
  minutesAfter: number;
};

export type OverworldLocalRenownCompletionState = {
  completedIds: Set<string>;
  regionRenown: Map<string, number>;
};

export type OverworldAppliedLocalRenownCompletion = {
  completedId: string;
  renownRegion: string;
  renownGained: number;
  renownAfter: number;
};

export type OverworldAreaExplorationApplicationState = {
  visitedAreaIds: Set<string>;
};

export type OverworldAppliedAreaExploration = {
  areaId: string;
};

export type OverworldAreaExplorationState = {
  areaId: string;
  areasById: ReadonlyMap<string, OverworldArea>;
  currentTownId: string;
  currentAreaId: string | null;
  discoveredAreaIds: ReadonlySet<string>;
  visitedAreaIds: ReadonlySet<string>;
  journalEntries: OverworldJournalEntryLookup;
};

export type OverworldLocalJobCompletionState = {
  jobId: string;
  jobsById: ReadonlyMap<string, OverworldLocalJob>;
  areasById: ReadonlyMap<string, OverworldArea>;
  currentTownId: string;
  currentRegion: string;
  currentAreaId: string | null;
  discoveredJobIds: ReadonlySet<string>;
  completedJobIds: ReadonlySet<string>;
  journalEntries: OverworldJournalEntryLookup;
};

export type OverworldSiteExplorationState = {
  siteId: string;
  sitesById: ReadonlyMap<string, OverworldExplorationSite>;
  currentTownId: string;
  currentAreaId: string | null;
  discoveredSiteIds: ReadonlySet<string>;
  exploredSiteIds: ReadonlySet<string>;
  journalEntries: OverworldJournalEntryLookup;
};

export function applyOverworldAreaTravel(
  currentArea: OverworldArea,
  edge: OverworldAreaExit,
  state: OverworldAreaTravelApplicationState,
): OverworldAppliedAreaTravel {
  const minutesAfter = state.minutes + edge.travel_minutes;
  return {
    from: currentArea,
    to: edge.destination,
    route: edge.route,
    minutes: edge.travel_minutes,
    arrivedAt: timeLabel(minutesAfter),
    currentAreaIdAfter: edge.destination.id,
    currentAreaByTownEntry: [state.currentTownId, edge.destination.id],
    minutesAfter,
  };
}

export function applyOverworldAreaExploration(
  state: OverworldAreaExplorationApplicationState,
  plan: OverworldPlannedAreaExploration,
): OverworldAppliedAreaExploration {
  state.visitedAreaIds.add(plan.areaId);
  return { areaId: plan.areaId };
}

function applyOverworldLocalRenownCompletion(
  state: OverworldLocalRenownCompletionState,
  completedId: string,
  renownRegion: string,
  renownGained: number,
): OverworldAppliedLocalRenownCompletion {
  state.completedIds.add(completedId);
  state.regionRenown.set(renownRegion, (state.regionRenown.get(renownRegion) ?? 0) + renownGained);
  return {
    completedId,
    renownRegion,
    renownGained,
    renownAfter: state.regionRenown.get(renownRegion) ?? 0,
  };
}

export function applyOverworldLocalJobCompletion(
  state: {
    completedJobIds: Set<string>;
    regionRenown: Map<string, number>;
  },
  plan: OverworldPlannedLocalJobCompletion,
): OverworldAppliedLocalRenownCompletion {
  return applyOverworldLocalRenownCompletion(
    {
      completedIds: state.completedJobIds,
      regionRenown: state.regionRenown,
    },
    plan.jobId,
    plan.renownRegion,
    plan.renown,
  );
}

export function applyOverworldSiteExploration(
  state: {
    exploredSiteIds: Set<string>;
    regionRenown: Map<string, number>;
  },
  plan: OverworldPlannedSiteExploration,
): OverworldAppliedLocalRenownCompletion {
  return applyOverworldLocalRenownCompletion(
    {
      completedIds: state.exploredSiteIds,
      regionRenown: state.regionRenown,
    },
    plan.siteId,
    plan.renownRegion,
    plan.renown,
  );
}

export function planOverworldAreaExploration(
  state: OverworldAreaExplorationState,
): OverworldAreaExplorationPlan {
  const area = state.areasById.get(state.areaId);
  if (!area || area.home !== state.currentTownId) throw new Error("That area is not in this town.");
  if (!state.discoveredAreaIds.has(area.id)) {
    throw new Error("Scout, talk, investigate, or explore known areas to map that district.");
  }
  if (state.currentAreaId !== area.id) {
    throw new Error("Move to that local area before exploring it.");
  }
  if (state.visitedAreaIds.has(area.id)) {
    const existing = state.journalEntries.get(`area:${area.id}`);
    if (existing) return { alreadyKnown: true, minutes: 0, entry: existing };
  }

  return {
    alreadyKnown: false,
    areaId: area.id,
    action: describeOverworldAreaAction(area),
  };
}

export function planOverworldLocalJobCompletion(
  state: OverworldLocalJobCompletionState,
): OverworldLocalJobCompletionPlan {
  const job = state.jobsById.get(state.jobId);
  if (!job || job.home !== state.currentTownId) {
    throw new Error("That local job is not in this town.");
  }
  if (!state.discoveredJobIds.has(job.id)) {
    throw new Error("Explore local areas or talk to locals before working that job.");
  }
  if (job.area !== state.currentAreaId) {
    throw new Error("Move to that local area before working that job.");
  }
  if (state.completedJobIds.has(job.id)) {
    const existing = state.journalEntries.get(`job:${job.id}`);
    if (existing) return { alreadyKnown: true, minutes: 0, entry: existing };
  }

  const action = describeOverworldJobAction(job, state.areasById.get(job.area) ?? null);
  return {
    alreadyKnown: false,
    jobId: job.id,
    action,
    renownRegion: state.currentRegion,
    renown: action.regionalRenown ?? 0,
  };
}

export function planOverworldSiteExploration(
  state: OverworldSiteExplorationState,
): OverworldSiteExplorationPlan {
  const site = state.sitesById.get(state.siteId);
  if (!site || site.nearest_town !== state.currentTownId) {
    throw new Error("That exploration site is not reachable from this town.");
  }
  if (site.area !== state.currentAreaId) {
    throw new Error("Move to that local area before exploring this site.");
  }
  if (!state.discoveredSiteIds.has(site.id)) {
    throw new Error("Scout a local point of interest before exploring this site.");
  }
  if (state.exploredSiteIds.has(site.id)) {
    const existing = state.journalEntries.get(`site:${site.id}`);
    if (existing) return { alreadyKnown: true, minutes: 0, entry: existing };
  }

  const action = describeOverworldSiteAction(site);
  return {
    alreadyKnown: false,
    siteId: site.id,
    action,
    renownRegion: site.region,
    renown: action.regionalRenown ?? 0,
  };
}
