import type {
  OverworldArea,
  OverworldExplorationSite,
  OverworldLocalJob,
  OverworldQuest,
} from "./overworld.js";
import { questView, type OverworldQuestView } from "./session_local_discovery.js";
import { availableLocalJobSceneOptions } from "./local_job_scene.js";
import type { OverworldJournalEntry } from "./session_snapshot.js";
import type { CampaignCharacterState } from "./campaign_character_state.js";

export type OverworldSessionLocalView = {
  areas: OverworldArea[];
  hiddenAreaCount: number;
  jobs: OverworldLocalJob[];
  rememberedJobs: OverworldLocalJob[];
  hiddenJobCount: number;
  sites: OverworldExplorationSite[];
  hiddenSiteCount: number;
  quests: OverworldQuestView[];
  hiddenQuestCount: number;
};

export type OverworldSessionLocalViewState = {
  localAreas: readonly OverworldArea[];
  currentAreaId: string;
  localJobs: readonly OverworldLocalJob[];
  currentAreaSites: readonly OverworldExplorationSite[];
  localQuests: readonly OverworldQuest[];
  discoveredAreaIds: ReadonlySet<string>;
  discoveredJobIds: ReadonlySet<string>;
  completedJobIds: ReadonlySet<string>;
  discoveredSiteIds: ReadonlySet<string>;
  discoveredQuestIds: ReadonlySet<string>;
  completedQuestIds: ReadonlySet<string>;
  resolvedEventIds?: ReadonlySet<string>;
  campaignWorldFactIds?: ReadonlySet<string>;
  campaignStoryChoiceKeys?: ReadonlySet<string>;
  campaignCharacter?: CampaignCharacterState;
  journalEntries?: ReadonlyMap<string, OverworldJournalEntry>;
};

function discoveredValues<T extends { id: string }>(
  values: readonly T[],
  discoveredIds: ReadonlySet<string>,
): T[] {
  const discovered: T[] = [];
  for (const value of values) {
    if (discoveredIds.has(value.id)) discovered.push(value);
  }
  return discovered;
}

function hiddenCount<T extends { id: string }>(
  values: readonly T[],
  discoveredIds: ReadonlySet<string>,
): number {
  let count = 0;
  for (const value of values) {
    if (!discoveredIds.has(value.id)) count += 1;
  }
  return count;
}

export function projectOverworldSessionLocalJob(
  job: OverworldLocalJob,
  state: Pick<
    OverworldSessionLocalViewState,
    | "completedQuestIds"
    | "resolvedEventIds"
    | "campaignWorldFactIds"
    | "campaignStoryChoiceKeys"
    | "campaignCharacter"
    | "journalEntries"
  >,
  retainUnavailable: true,
): OverworldLocalJob;
export function projectOverworldSessionLocalJob(
  job: OverworldLocalJob,
  state: Pick<
    OverworldSessionLocalViewState,
    | "completedQuestIds"
    | "resolvedEventIds"
    | "campaignWorldFactIds"
    | "campaignStoryChoiceKeys"
    | "campaignCharacter"
    | "journalEntries"
  >,
  retainUnavailable?: false,
): OverworldLocalJob | null;
export function projectOverworldSessionLocalJob(
  job: OverworldLocalJob,
  state: Pick<
    OverworldSessionLocalViewState,
    | "completedQuestIds"
    | "resolvedEventIds"
    | "campaignWorldFactIds"
    | "campaignStoryChoiceKeys"
    | "campaignCharacter"
    | "journalEntries"
  >,
  retainUnavailable = false,
): OverworldLocalJob | null {
  if (!job.authored_scene) return job;
  const resolvedEventIds = state.resolvedEventIds ?? new Set<string>();
  const campaignWorldFactIds = state.campaignWorldFactIds ?? new Set<string>();
  const journalEntries = state.journalEntries ?? new Map<string, OverworldJournalEntry>();
  const options = availableLocalJobSceneOptions(job.authored_scene, {
    completedQuestIds: state.completedQuestIds,
    resolvedEventIds,
    worldFactIds: campaignWorldFactIds,
    storyChoiceKeys: state.campaignStoryChoiceKeys ?? new Set<string>(),
    ...(state.campaignCharacter ? { character: state.campaignCharacter } : {}),
    eventOptionIdFor: (eventId) =>
      journalEntries.get(`resolve:${eventId}`)?.localSceneProof?.optionId ?? null,
  });
  if (options.length === 0 && !retainUnavailable) return null;
  const projectedOptions = options.map(
    ({
      requires_event_options: _eventOptions,
      requires_all_world_facts: _requiredFacts,
      forbids_any_world_facts: _forbiddenFacts,
      requires_all_story_choices: _requiredChoices,
      forbids_any_story_choices: _forbiddenChoices,
      character_conditions: _characterConditions,
      ...option
    }) => option,
  );
  const hasPlayerHiddenPredicates = options.some(
    (option) =>
      option.requires_event_options !== undefined ||
      option.requires_all_world_facts !== undefined ||
      option.forbids_any_world_facts !== undefined ||
      option.requires_all_story_choices !== undefined ||
      option.forbids_any_story_choices !== undefined ||
      option.character_conditions !== undefined,
  );
  if (!hasPlayerHiddenPredicates && options.length === job.authored_scene.options.length)
    return job;
  return {
    ...job,
    authored_scene: {
      ...job.authored_scene,
      options: projectedOptions,
    },
  };
}

function discoveredCurrentAreaJobs(
  jobs: readonly OverworldLocalJob[],
  currentAreaId: string,
  discoveredJobIds: ReadonlySet<string>,
  completedJobIds: ReadonlySet<string>,
): OverworldLocalJob[] {
  const discovered: OverworldLocalJob[] = [];
  for (const job of jobs) {
    if (
      job.area === currentAreaId &&
      discoveredJobIds.has(job.id) &&
      !completedJobIds.has(job.id)
    ) {
      discovered.push(job);
    }
  }
  return discovered;
}

function discoveredOtherAreaJobs(
  jobs: readonly OverworldLocalJob[],
  currentAreaId: string,
  discoveredJobIds: ReadonlySet<string>,
  completedJobIds: ReadonlySet<string>,
): OverworldLocalJob[] {
  const discovered: OverworldLocalJob[] = [];
  for (const job of jobs) {
    if (
      job.area !== currentAreaId &&
      discoveredJobIds.has(job.id) &&
      !completedJobIds.has(job.id)
    ) {
      discovered.push(job);
    }
  }
  return discovered;
}

function discoveredQuestViews(
  quests: readonly OverworldQuest[],
  discoveredQuestIds: ReadonlySet<string>,
  completedQuestIds: ReadonlySet<string>,
): OverworldQuestView[] {
  const discovered: OverworldQuestView[] = [];
  for (const quest of quests) {
    if (discoveredQuestIds.has(quest.id) && !completedQuestIds.has(quest.id)) {
      discovered.push(questView(quest));
    }
  }
  return discovered;
}

export function buildOverworldSessionLocalView(
  state: OverworldSessionLocalViewState,
): OverworldSessionLocalView {
  const chronologicallyAvailableJobs = state.localJobs.flatMap((job) => {
    const projected = projectOverworldSessionLocalJob(job, state);
    return projected ? [projected] : [];
  });
  return {
    areas: discoveredValues(state.localAreas, state.discoveredAreaIds),
    hiddenAreaCount: hiddenCount(state.localAreas, state.discoveredAreaIds),
    jobs: discoveredCurrentAreaJobs(
      chronologicallyAvailableJobs,
      state.currentAreaId,
      state.discoveredJobIds,
      state.completedJobIds,
    ),
    rememberedJobs: discoveredOtherAreaJobs(
      chronologicallyAvailableJobs,
      state.currentAreaId,
      state.discoveredJobIds,
      state.completedJobIds,
    ),
    hiddenJobCount: state.localJobs.filter(
      (job) =>
        !state.discoveredJobIds.has(job.id) ||
        (!state.completedJobIds.has(job.id) && !projectOverworldSessionLocalJob(job, state)),
    ).length,
    sites: discoveredValues(state.currentAreaSites, state.discoveredSiteIds),
    hiddenSiteCount: hiddenCount(state.currentAreaSites, state.discoveredSiteIds),
    quests: discoveredQuestViews(
      state.localQuests,
      state.discoveredQuestIds,
      state.completedQuestIds,
    ),
    hiddenQuestCount: hiddenCount(state.localQuests, state.discoveredQuestIds),
  };
}
