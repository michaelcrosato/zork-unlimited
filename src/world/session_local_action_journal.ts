import {
  describeOverworldContactAction,
  describeOverworldEventAction,
  describeOverworldJobAction,
  describeOverworldSiteAction,
} from "./local_actions.js";
import { questCompletionMinutes } from "./session_quests.js";
import type {
  OverworldArea,
  OverworldCharacter,
  OverworldExplorationSite,
  OverworldLocalEvent,
  OverworldLocalJob,
  OverworldPoi,
  OverworldQuest,
} from "./overworld.js";
import {
  presentOverworldContact,
  type OverworldContactPresentation,
} from "./session_contact_presentation.js";
import { journalSourceId, type OverworldJournalTimelineIndex } from "./session_journal_timeline.js";
import type { OverworldJournalEntry } from "./session_snapshot.js";
import { indexedList } from "./session_collections.js";
import type { CampaignCharacterState } from "./campaign_character_state.js";
import { resolveLocalJobSceneOption } from "./local_job_scene.js";
import { resolveLocalEventSceneOption } from "./local_event_scene.js";
import type { JourneyCountedDecisionReason, JourneyDecisionProofLast } from "./journey_contract.js";

export type OverworldDiscoveryLocalityIndex = {
  areaHomes: ReadonlyMap<string, string>;
  completedQuestIds: ReadonlySet<string>;
  directQuestAnchorIds?: ReadonlySet<string>;
  discoveredAreaIds: ReadonlySet<string>;
  discoveredJobIds: ReadonlySet<string>;
  discoveredQuestIds: ReadonlySet<string>;
  discoveredSiteIds: ReadonlySet<string>;
  eventsById: ReadonlyMap<string, OverworldLocalEvent>;
  jobsById: ReadonlyMap<string, OverworldLocalJob>;
  questIdsAllowedOutsideDiscoveredArea?: ReadonlySet<string>;
  questsById: ReadonlyMap<string, OverworldQuest>;
  resolvedEventIds: ReadonlySet<string>;
  sitesById: ReadonlyMap<string, OverworldExplorationSite>;
  startedQuestIds: ReadonlySet<string>;
  visitedAreaIds: ReadonlySet<string>;
  visitedTownIds: ReadonlySet<string>;
};

export type OverworldLocalActionJournalReachabilityIndex = {
  areasById: ReadonlyMap<string, OverworldArea>;
  areasByTown: ReadonlyMap<string, readonly OverworldArea[]>;
  campaignDecisionProofsByOrdinal?: ReadonlyMap<
    number,
    Readonly<{
      decision: JourneyDecisionProofLast | null;
      decisionProofHash: string;
      townId: string | null;
      areaId: string | null;
    }>
  >;
  charactersById: ReadonlyMap<string, OverworldCharacter>;
  contactPresentationsByJournalId: ReadonlyMap<string, OverworldContactPresentation>;
  discoveredAreaIds: ReadonlySet<string>;
  discoveredJobIds: ReadonlySet<string>;
  discoveredQuestIds: ReadonlySet<string>;
  discoveredSiteIds: ReadonlySet<string>;
  directQuestAnchorIds?: ReadonlySet<string>;
  directQuestAnchorActivationOrdinals?: ReadonlyMap<string, number>;
  eventsById: ReadonlyMap<string, OverworldLocalEvent>;
  jobsById: ReadonlyMap<string, OverworldLocalJob>;
  jobsByTown: ReadonlyMap<string, readonly OverworldLocalJob[]>;
  nonFifoQuestIds?: ReadonlySet<string>;
  poisById: ReadonlyMap<string, OverworldPoi>;
  questsById: ReadonlyMap<string, OverworldQuest>;
  questsByTown: ReadonlyMap<string, readonly OverworldQuest[]>;
  sitesByArea: ReadonlyMap<string, readonly OverworldExplorationSite[]>;
  sitesById: ReadonlyMap<string, OverworldExplorationSite>;
  townVisitMinutes: ReadonlyMap<string, number>;
  townNameForSource: (nodeId: string) => string;
  visitedTownIds: ReadonlySet<string>;
};

type OverworldLocalJournalSource = {
  sourceLabel: string;
  sourceId: string;
  home: string;
  area: string;
};

export type OverworldLocalActionJournalReplayEntry = {
  entry: OverworldJournalEntry;
  source: OverworldLocalJournalSource;
  recordedAt: number;
  duration: number | null;
  acceptedDecisions: number | null;
};

export type OverworldLocalActionJournalReplayIndex = {
  entries: readonly OverworldLocalActionJournalReplayEntry[];
  localActionCountByArea: ReadonlyMap<string, number>;
  localActionCountByTown: ReadonlyMap<string, number>;
};

type OverworldLocalJournalDecisionExpectation = Readonly<{
  actionId: string;
  allowsOptionSuffix: boolean;
  reason: JourneyCountedDecisionReason;
}>;

function localJournalDecisionExpectation(
  entry: OverworldJournalEntry,
  source: OverworldLocalJournalSource,
): OverworldLocalJournalDecisionExpectation | null {
  switch (entry.kind) {
    case "area":
      return {
        actionId: `explore_area:${source.sourceId}`,
        allowsOptionSuffix: false,
        reason: "stateful_clue",
      };
    case "contact":
      return {
        actionId: `talk:${source.sourceId}`,
        allowsOptionSuffix: false,
        reason: "substantive_dialogue",
      };
    case "event":
      return {
        actionId: `investigate_event:${source.sourceId}`,
        allowsOptionSuffix: false,
        reason: "stateful_clue",
      };
    case "job":
      return {
        actionId: `work_job:${source.sourceId}`,
        allowsOptionSuffix: true,
        reason: "situation_changed",
      };
    case "poi":
      return {
        actionId: `scout:${source.sourceId}`,
        allowsOptionSuffix: false,
        reason: "stateful_clue",
      };
    case "resolution":
      return {
        actionId: `resolve_event:${source.sourceId}`,
        allowsOptionSuffix: true,
        reason: "situation_changed",
      };
    case "site":
      return {
        actionId: `explore_site:${source.sourceId}`,
        allowsOptionSuffix: false,
        reason: "situation_changed",
      };
    case "quest_done":
      return null;
    default:
      return null;
  }
}

function localJournalDecisionMatches(
  expectation: OverworldLocalJournalDecisionExpectation,
  decision: JourneyDecisionProofLast,
): boolean {
  const actionMatches =
    decision.actionId === expectation.actionId ||
    (expectation.allowsOptionSuffix && decision.actionId.startsWith(`${expectation.actionId}:`));
  return (
    actionMatches && decision.surface === "overworld" && decision.reason === expectation.reason
  );
}

function localJournalActionDuration(
  entry: OverworldJournalEntry,
  sources: OverworldLocalActionJournalReachabilityIndex,
): number | null {
  switch (entry.kind) {
    case "area": {
      const sourceId = journalSourceId(entry, "area:");
      const area = sourceId ? sources.areasById.get(sourceId) : undefined;
      return area?.travel_minutes ?? null;
    }
    case "contact": {
      const presentation = sources.contactPresentationsByJournalId.get(entry.id);
      return presentation
        ? describeOverworldContactAction(presentation.contact, presentation.presentationId).minutes
        : null;
    }
    case "event": {
      const sourceId = journalSourceId(entry, "investigate:");
      const event = sourceId ? sources.eventsById.get(sourceId) : undefined;
      return event ? describeOverworldEventAction(event).minutes : null;
    }
    case "job": {
      const sourceId = journalSourceId(entry, "job:");
      const job = sourceId ? sources.jobsById.get(sourceId) : undefined;
      if (!job) return null;
      const area = sources.areasById.get(job.area) ?? null;
      if (!job.authored_scene) {
        if (entry.localSceneProof) {
          throw new Error(
            `Overworld session snapshot legacy job "${job.id}" cannot carry local-scene proof.`,
          );
        }
        return describeOverworldJobAction(job, area).minutes;
      }
      const proof = entry.localSceneProof;
      if (!proof || proof.sceneId !== job.authored_scene.id) {
        throw new Error(
          `Overworld session snapshot authored job "${job.id}" is missing its exact local-scene proof.`,
        );
      }
      const option = resolveLocalJobSceneOption(job.authored_scene, proof.optionId);
      return describeOverworldJobAction(job, area, option).minutes;
    }
    case "poi": {
      const sourceId = journalSourceId(entry, "scout:");
      const poi = sourceId ? sources.poisById.get(sourceId) : undefined;
      return poi ? 20 : null;
    }
    case "quest_done": {
      const sourceId = journalSourceId(entry, "quest_done:");
      const quest = sourceId ? sources.questsById.get(sourceId) : undefined;
      return quest ? questCompletionMinutes(quest, sources.areasById) : null;
    }
    case "resolution": {
      const sourceId = journalSourceId(entry, "resolve:");
      const event = sourceId ? sources.eventsById.get(sourceId) : undefined;
      if (!event) return null;
      if (!event.authored_scene) {
        if (entry.localSceneProof) {
          throw new Error(
            `Overworld session snapshot legacy event "${event.id}" cannot carry local-scene proof.`,
          );
        }
        return 30 + event.intensity * 10;
      }
      const proof = entry.localSceneProof;
      if (!proof || proof.sceneId !== event.authored_scene.id) {
        throw new Error(
          `Overworld session snapshot authored event "${event.id}" is missing its exact local-scene proof.`,
        );
      }
      return resolveLocalEventSceneOption(event.authored_scene, proof.optionId).terms.minutes;
    }
    case "site": {
      const sourceId = journalSourceId(entry, "site:");
      const site = sourceId ? sources.sitesById.get(sourceId) : undefined;
      return site ? describeOverworldSiteAction(site).minutes : null;
    }
    default:
      return null;
  }
}

function assertVisitedTownForDiscovery(
  sourceLabel: string,
  sourceId: string,
  townId: string,
  visitedTownIds: ReadonlySet<string>,
): void {
  if (!visitedTownIds.has(townId)) {
    throw new Error(
      `Overworld session snapshot ${sourceLabel} "${sourceId}" belongs to unvisited town "${townId}".`,
    );
  }
}

function assertDiscoveredAreaForDiscovery(
  sourceLabel: string,
  sourceId: string,
  areaId: string,
  discoveredAreaIds: ReadonlySet<string>,
): void {
  if (!discoveredAreaIds.has(areaId)) {
    throw new Error(
      `Overworld session snapshot ${sourceLabel} "${sourceId}" is in undiscovered area "${areaId}".`,
    );
  }
}

export function assertSnapshotDiscoveryLocality(sources: OverworldDiscoveryLocalityIndex): void {
  const directAnchorAreaIds = new Set(
    [...(sources.directQuestAnchorIds ?? [])]
      .map((questId) => sources.questsById.get(questId)?.area)
      .filter((areaId): areaId is string => areaId !== undefined),
  );
  for (const areaId of sources.discoveredAreaIds) {
    const home = sources.areaHomes.get(areaId);
    if (home && !directAnchorAreaIds.has(areaId)) {
      assertVisitedTownForDiscovery("discovered area", areaId, home, sources.visitedTownIds);
    }
  }
  for (const areaId of sources.visitedAreaIds) {
    const home = sources.areaHomes.get(areaId);
    if (home) {
      assertVisitedTownForDiscovery("visited area", areaId, home, sources.visitedTownIds);
    }
  }
  for (const jobId of sources.discoveredJobIds) {
    const job = sources.jobsById.get(jobId);
    if (!job) continue;
    assertVisitedTownForDiscovery("discovered job", jobId, job.home, sources.visitedTownIds);
    assertDiscoveredAreaForDiscovery("discovered job", jobId, job.area, sources.discoveredAreaIds);
  }
  for (const siteId of sources.discoveredSiteIds) {
    const site = sources.sitesById.get(siteId);
    if (!site) continue;
    assertVisitedTownForDiscovery(
      "discovered site",
      siteId,
      site.nearest_town,
      sources.visitedTownIds,
    );
    assertDiscoveredAreaForDiscovery(
      "discovered site",
      siteId,
      site.area,
      sources.discoveredAreaIds,
    );
  }
  for (const questId of sources.discoveredQuestIds) {
    const quest = sources.questsById.get(questId);
    if (!quest) continue;
    if (!sources.directQuestAnchorIds?.has(questId)) {
      assertVisitedTownForDiscovery(
        "discovered quest",
        questId,
        quest.home,
        sources.visitedTownIds,
      );
    }
    if (sources.questIdsAllowedOutsideDiscoveredArea?.has(questId)) continue;
    assertDiscoveredAreaForDiscovery(
      "discovered quest",
      questId,
      quest.area,
      sources.discoveredAreaIds,
    );
  }
  for (const questId of sources.startedQuestIds) {
    const quest = sources.questsById.get(questId);
    if (!quest) continue;
    if (!sources.discoveredQuestIds.has(questId)) {
      throw new Error(`Overworld session snapshot started quest "${questId}" is not discovered.`);
    }
    assertVisitedTownForDiscovery("started quest", questId, quest.home, sources.visitedTownIds);
    assertDiscoveredAreaForDiscovery(
      "started quest",
      questId,
      quest.area,
      sources.discoveredAreaIds,
    );
  }
  for (const questId of sources.completedQuestIds) {
    const quest = sources.questsById.get(questId);
    if (!quest) continue;
    if (!sources.startedQuestIds.has(questId)) {
      throw new Error(`Overworld session snapshot completed quest "${questId}" is not started.`);
    }
    assertVisitedTownForDiscovery("completed quest", questId, quest.home, sources.visitedTownIds);
    assertDiscoveredAreaForDiscovery(
      "completed quest",
      questId,
      quest.area,
      sources.discoveredAreaIds,
    );
  }
  for (const eventId of sources.resolvedEventIds) {
    const event = sources.eventsById.get(eventId);
    if (!event) continue;
    assertVisitedTownForDiscovery("resolved event", eventId, event.home, sources.visitedTownIds);
    assertDiscoveredAreaForDiscovery(
      "resolved event",
      eventId,
      event.area,
      sources.discoveredAreaIds,
    );
  }
}

function localJournalSource(
  entry: OverworldJournalEntry,
  sources: OverworldLocalActionJournalReachabilityIndex,
): OverworldLocalJournalSource | null {
  switch (entry.kind) {
    case "area": {
      const sourceId = journalSourceId(entry, "area:");
      if (!sourceId) return null;
      const area = sources.areasById.get(sourceId);
      if (!area) return null;
      return {
        sourceLabel: "journal area",
        sourceId,
        home: area.home,
        area: area.id,
      };
    }
    case "contact": {
      const presentation = sources.contactPresentationsByJournalId.get(entry.id);
      if (!presentation) return null;
      return {
        sourceLabel: "journal contact",
        sourceId: presentation.character.id,
        home: presentation.character.home,
        area: presentation.character.area,
      };
    }
    case "event": {
      const sourceId = journalSourceId(entry, "investigate:");
      if (!sourceId) return null;
      const event = sources.eventsById.get(sourceId);
      if (!event) return null;
      return {
        sourceLabel: "journal event",
        sourceId,
        home: event.home,
        area: event.area,
      };
    }
    case "job": {
      const sourceId = journalSourceId(entry, "job:");
      if (!sourceId) return null;
      const job = sources.jobsById.get(sourceId);
      if (!job) return null;
      return {
        sourceLabel: "journal job",
        sourceId,
        home: job.home,
        area: job.area,
      };
    }
    case "poi": {
      const sourceId = journalSourceId(entry, "scout:");
      if (!sourceId) return null;
      const poi = sources.poisById.get(sourceId);
      if (!poi) return null;
      return {
        sourceLabel: "journal point of interest",
        sourceId,
        home: poi.home,
        area: poi.area,
      };
    }
    case "quest_done": {
      const sourceId = journalSourceId(entry, "quest_done:");
      if (!sourceId) return null;
      const quest = sources.questsById.get(sourceId);
      if (!quest) return null;
      return {
        sourceLabel: "journal completed quest",
        sourceId,
        home: quest.home,
        area: quest.area,
      };
    }
    case "resolution": {
      const sourceId = journalSourceId(entry, "resolve:");
      if (!sourceId) return null;
      const event = sources.eventsById.get(sourceId);
      if (!event) return null;
      return {
        sourceLabel: "journal resolved event",
        sourceId,
        home: event.home,
        area: event.area,
      };
    }
    case "site": {
      const sourceId = journalSourceId(entry, "site:");
      if (!sourceId) return null;
      const site = sources.sitesById.get(sourceId);
      if (!site) return null;
      return {
        sourceLabel: "journal site",
        sourceId,
        home: site.nearest_town,
        area: site.area,
      };
    }
    default:
      return null;
  }
}

/**
 * Prove that every stored contact line was the one authored for the quest state
 * that existed at its timestamp. This keeps future dialogue and shadowed phases
 * out of forged saves while preserving an earlier base conversation honestly.
 */
export function assertSnapshotContactPresentationProofs(
  sources: OverworldLocalActionJournalReachabilityIndex,
  journalTimeline: OverworldJournalTimelineIndex,
  characterAt: (entry: OverworldJournalEntry, recordedAt: number) => CampaignCharacterState,
): void {
  for (const { entry, recordedAt } of journalTimeline.localActionEntries) {
    if (entry.kind !== "contact") continue;
    const stored = sources.contactPresentationsByJournalId.get(entry.id);
    if (!stored) continue; // The timeline source gate reports the precise unknown-id error.

    const completedQuestIds = new Set<string>();
    for (const questId of sources.questsById.keys()) {
      const completedAt = journalTimeline.eventResolutionProofs.recordedAtById.get(
        `quest_done:${questId}`,
      );
      if (completedAt !== undefined && completedAt <= recordedAt) {
        completedQuestIds.add(questId);
      }
    }
    const expected = presentOverworldContact(stored.character, {
      character: characterAt(entry, recordedAt),
      completedQuestIds,
    });
    if (expected.journalId !== entry.id) {
      throw new Error(
        `Overworld session snapshot contact presentation "${entry.id}" was not active at ${entry.recordedAt}.`,
      );
    }

    const expectedTown = sources.townNameForSource(expected.character.home);
    if (entry.town !== expectedTown) {
      throw new Error(
        `Overworld session snapshot contact presentation "${entry.id}" is bound to town "${entry.town}", expected "${expectedTown}".`,
      );
    }
  }
}

export function localActionJournalReplayIndex(
  sources: OverworldLocalActionJournalReachabilityIndex,
  journalTimeline: OverworldJournalTimelineIndex,
): OverworldLocalActionJournalReplayIndex {
  const replayEntries: Array<
    OverworldLocalActionJournalReplayEntry & { newestFirstIndex: number }
  > = [];
  const localActionCountByTown = new Map<string, number>();
  const localActionCountByArea = new Map<string, number>();

  journalTimeline.localActionEntries.forEach(({ entry, recordedAt }, newestFirstIndex) => {
    const source = localJournalSource(entry, sources);
    if (!source) return;
    replayEntries.push({
      entry,
      source,
      recordedAt,
      duration: localJournalActionDuration(entry, sources),
      acceptedDecisions: null,
      newestFirstIndex,
    });
    if (entry.kind !== "quest_done") {
      incrementCount(localActionCountByTown, source.home);
      incrementCount(localActionCountByArea, source.area);
    }
  });

  // The journal is newest-first. Reverse equal-clock entries while sorting so
  // replay stays oldest-first even when multiple zero-minute boundaries share
  // one timestamp.
  replayEntries.sort(
    (left, right) =>
      left.recordedAt - right.recordedAt || right.newestFirstIndex - left.newestFirstIndex,
  );
  const usedDecisionOrdinals = new Set<number>();
  for (const replayEntry of replayEntries) {
    const expectation = localJournalDecisionExpectation(replayEntry.entry, replayEntry.source);
    if (!expectation || !sources.campaignDecisionProofsByOrdinal) continue;
    const storedBoundary =
      replayEntry.entry.localSceneProof?.boundary ?? replayEntry.entry.questCompletionBoundary;
    const matches = [...sources.campaignDecisionProofsByOrdinal.entries()]
      .filter(([acceptedDecisions, proof]) => {
        if (
          usedDecisionOrdinals.has(acceptedDecisions) ||
          !proof.decision ||
          proof.townId !== replayEntry.source.home ||
          proof.areaId !== replayEntry.source.area ||
          !localJournalDecisionMatches(expectation, proof.decision)
        ) {
          return false;
        }
        return (
          !storedBoundary ||
          (storedBoundary.acceptedDecisions === acceptedDecisions &&
            storedBoundary.decisionProofHash === proof.decisionProofHash)
        );
      })
      .sort(([left], [right]) => left - right);
    const match = matches[0];
    if (!match) continue;
    replayEntry.acceptedDecisions = match[0];
    usedDecisionOrdinals.add(match[0]);
  }

  const entries = replayEntries.map(({ newestFirstIndex: _newestFirstIndex, ...entry }) => entry);
  return { entries, localActionCountByArea, localActionCountByTown };
}

function assertJournalAfterTownVisit(
  sourceLabel: string,
  sourceId: string,
  recordedAt: number,
  townId: string,
  townVisitMinutes: ReadonlyMap<string, number>,
): void {
  const visitedAt = townVisitMinutes.get(townId);
  if (visitedAt !== undefined && recordedAt < visitedAt) {
    throw new Error(
      `Overworld session snapshot ${sourceLabel} "${sourceId}" was recorded before visiting town "${townId}".`,
    );
  }
}

export function assertSnapshotLocalActionJournalReachability(
  localActionJournal: OverworldLocalActionJournalReplayIndex,
  sources: OverworldLocalActionJournalReachabilityIndex,
): void {
  for (const { source, recordedAt } of localActionJournal.entries) {
    assertVisitedTownForDiscovery(
      source.sourceLabel,
      source.sourceId,
      source.home,
      sources.visitedTownIds,
    );
    assertDiscoveredAreaForDiscovery(
      source.sourceLabel,
      source.sourceId,
      source.area,
      sources.discoveredAreaIds,
    );
    assertJournalAfterTownVisit(
      source.sourceLabel,
      source.sourceId,
      recordedAt,
      source.home,
      sources.townVisitMinutes,
    );
  }
}

function replayedDiscoveredAreaIdsBeforeLocalAction(
  areasByTown: ReadonlyMap<string, readonly OverworldArea[]>,
  townId: string,
  priorLocalActionCount: number,
): ReadonlySet<string> {
  const localAreas = indexedList(areasByTown, townId);
  const discovered = new Set<string>();
  const limit = Math.min(localAreas.length, 1 + priorLocalActionCount);
  for (let index = 0; index < limit; index += 1) {
    discovered.add(localAreas[index]!.id);
  }
  return discovered;
}

function replayedDiscoveredJobIdsBeforeLocalAction(
  sources: OverworldLocalActionJournalReachabilityIndex,
  townId: string,
  priorLocalActionCount: number,
): ReadonlySet<string> {
  const discoveredAreaIds = replayedDiscoveredAreaIdsBeforeLocalAction(
    sources.areasByTown,
    townId,
    priorLocalActionCount,
  );
  const discovered = new Set<string>();
  if (priorLocalActionCount <= 0) return discovered;
  for (const job of indexedList(sources.jobsByTown, townId)) {
    if (!discoveredAreaIds.has(job.area)) continue;
    discovered.add(job.id);
    if (discovered.size >= priorLocalActionCount) break;
  }
  return discovered;
}

function revealFirstMissingArea(
  discoveredAreaIds: Set<string>,
  localAreas: readonly OverworldArea[],
): void {
  const next = localAreas.find((area) => !discoveredAreaIds.has(area.id));
  if (next) discoveredAreaIds.add(next.id);
}

function replayExactDiscoveredAreaIds(
  localActionJournal: OverworldLocalActionJournalReplayIndex,
  sources: OverworldLocalActionJournalReachabilityIndex,
  beforeLocalAction?: (
    replayEntry: OverworldLocalActionJournalReplayEntry,
    discoveredAreaIds: ReadonlySet<string>,
  ) => void,
): ReadonlySet<string> {
  const activationOrdinals = sources.directQuestAnchorActivationOrdinals;
  if (!activationOrdinals) {
    throw new Error("Exact local discovery replay requires direct-anchor activation proof.");
  }

  const discoveredAreaIds = new Set<string>();
  for (const townId of sources.visitedTownIds) {
    const initialArea = indexedList(sources.areasByTown, townId)[0];
    if (initialArea) discoveredAreaIds.add(initialArea.id);
  }

  const processLocalAction = (replayEntry: OverworldLocalActionJournalReplayEntry): void => {
    beforeLocalAction?.(replayEntry, discoveredAreaIds);
    revealFirstMissingArea(
      discoveredAreaIds,
      indexedList(sources.areasByTown, replayEntry.source.home),
    );
  };

  // Entries outside the replayable campaign suffix are authenticated by the
  // older local journal/town-visit proofs. They precede every campaign anchor.
  for (const replayEntry of localActionJournal.entries) {
    if (replayEntry.entry.kind === "quest_done" || replayEntry.acceptedDecisions !== null) {
      continue;
    }
    processLocalAction(replayEntry);
  }

  const activationsByOrdinal = new Map<number, string[]>();
  for (const [questId, acceptedDecisions] of activationOrdinals) {
    const questIds = activationsByOrdinal.get(acceptedDecisions) ?? [];
    questIds.push(questId);
    activationsByOrdinal.set(acceptedDecisions, questIds);
  }
  const actionsByOrdinal = new Map<number, OverworldLocalActionJournalReplayEntry[]>();
  for (const replayEntry of localActionJournal.entries) {
    if (replayEntry.entry.kind === "quest_done" || replayEntry.acceptedDecisions === null) {
      continue;
    }
    const entries = actionsByOrdinal.get(replayEntry.acceptedDecisions) ?? [];
    entries.push(replayEntry);
    actionsByOrdinal.set(replayEntry.acceptedDecisions, entries);
  }
  const replayOrdinals = new Set([...activationsByOrdinal.keys(), ...actionsByOrdinal.keys()]);
  for (const acceptedDecisions of [...replayOrdinals].sort((left, right) => left - right)) {
    for (const questId of activationsByOrdinal.get(acceptedDecisions) ?? []) {
      const quest = sources.questsById.get(questId);
      if (quest) discoveredAreaIds.add(quest.area);
    }
    const actions = actionsByOrdinal.get(acceptedDecisions) ?? [];
    if (actions.length > 1) {
      throw new Error(
        `Overworld session snapshot binds multiple local actions to accepted decision ${String(acceptedDecisions)}.`,
      );
    }
    for (const replayEntry of actions) processLocalAction(replayEntry);
  }

  return discoveredAreaIds;
}

function replayedDiscoveredSiteIdsBeforeLocalAction(
  sitesByArea: ReadonlyMap<string, readonly OverworldExplorationSite[]>,
  areaId: string,
  priorAreaLocalActionCount: number,
): ReadonlySet<string> {
  const sites = indexedList(sitesByArea, areaId);
  const discovered = new Set<string>();
  const limit = Math.min(priorAreaLocalActionCount, sites.length);
  for (let index = 0; index < limit; index += 1) {
    discovered.add(sites[index]!.id);
  }
  return discovered;
}

export function assertSnapshotLocalActionDiscoveryChronology(
  localActionJournal: OverworldLocalActionJournalReplayIndex,
  sources: OverworldLocalActionJournalReachabilityIndex,
): void {
  if (sources.directQuestAnchorActivationOrdinals) {
    replayExactDiscoveredAreaIds(localActionJournal, sources, ({ source }, discoveredAreaIds) => {
      if (!discoveredAreaIds.has(source.area)) {
        throw new Error(
          `Overworld session snapshot ${source.sourceLabel} "${source.sourceId}" was recorded before discovering area "${source.area}".`,
        );
      }
    });
  }

  const priorLocalActionCountByTown = new Map<string, number>();
  const priorLocalActionCountByArea = new Map<string, number>();

  for (let index = 0; index < localActionJournal.entries.length; ) {
    const recordedAt = localActionJournal.entries[index]!.recordedAt;
    const group = [];
    while (
      index < localActionJournal.entries.length &&
      localActionJournal.entries[index]!.recordedAt === recordedAt
    ) {
      group.push(localActionJournal.entries[index]!);
      index += 1;
    }

    for (const { entry, source } of group) {
      const priorLocalActionCount = priorLocalActionCountByTown.get(source.home) ?? 0;
      const areaIndex = indexedList(sources.areasByTown, source.home).findIndex(
        (area) => area.id === source.area,
      );
      const certifiedDirectAnchor =
        entry.kind === "quest_done" && sources.directQuestAnchorIds?.has(source.sourceId) === true;
      if (
        !sources.directQuestAnchorActivationOrdinals &&
        areaIndex > 0 &&
        priorLocalActionCount < areaIndex &&
        !certifiedDirectAnchor
      ) {
        throw new Error(
          `Overworld session snapshot ${source.sourceLabel} "${source.sourceId}" was recorded before discovering area "${source.area}".`,
        );
      }
      if (
        entry.kind === "job" &&
        !replayedDiscoveredJobIdsBeforeLocalAction(sources, source.home, priorLocalActionCount).has(
          source.sourceId,
        )
      ) {
        throw new Error(
          `Overworld session snapshot ${source.sourceLabel} "${source.sourceId}" was recorded before discovering job "${source.sourceId}".`,
        );
      }
      const priorAreaLocalActionCount = priorLocalActionCountByArea.get(source.area) ?? 0;
      if (
        entry.kind === "site" &&
        !replayedDiscoveredSiteIdsBeforeLocalAction(
          sources.sitesByArea,
          source.area,
          priorAreaLocalActionCount,
        ).has(source.sourceId)
      ) {
        throw new Error(
          `Overworld session snapshot ${source.sourceLabel} "${source.sourceId}" was recorded before discovering site "${source.sourceId}".`,
        );
      }
    }

    for (const { source } of group) {
      priorLocalActionCountByTown.set(
        source.home,
        (priorLocalActionCountByTown.get(source.home) ?? 0) + 1,
      );
      priorLocalActionCountByArea.set(
        source.area,
        (priorLocalActionCountByArea.get(source.area) ?? 0) + 1,
      );
    }
  }
}

function incrementCount(counts: Map<string, number>, key: string): void {
  counts.set(key, (counts.get(key) ?? 0) + 1);
}

export function assertSnapshotDiscoveredAreaCountReplay(
  sources: OverworldLocalActionJournalReachabilityIndex,
  localActionJournal: OverworldLocalActionJournalReplayIndex,
): void {
  if (sources.directQuestAnchorActivationOrdinals) {
    const replayedDiscoveredAreaIds = replayExactDiscoveredAreaIds(localActionJournal, sources);
    for (const [townId, localAreas] of sources.areasByTown) {
      const expectedDiscoveredAreaIds = new Set(
        localAreas.filter((area) => replayedDiscoveredAreaIds.has(area.id)).map((area) => area.id),
      );
      const actualDiscoveredAreaIds = new Set(
        localAreas.filter((area) => sources.discoveredAreaIds.has(area.id)).map((area) => area.id),
      );
      if (
        actualDiscoveredAreaIds.size !== expectedDiscoveredAreaIds.size ||
        [...actualDiscoveredAreaIds].some((areaId) => !expectedDiscoveredAreaIds.has(areaId))
      ) {
        throw new Error(
          `Overworld session snapshot discovered area count in town "${townId}" does not match exact local action replay with campaign anchors.`,
        );
      }
    }
    return;
  }

  for (const townId of sources.visitedTownIds) {
    const localAreas = indexedList(sources.areasByTown, townId);
    const expectedDiscoveredAreaIds = new Set(
      localAreas
        .slice(
          0,
          localAreas.length === 0
            ? 0
            : Math.min(
                localAreas.length,
                1 + (localActionJournal.localActionCountByTown.get(townId) ?? 0),
              ),
        )
        .map((area) => area.id),
    );
    // A certified direct lead is allowed to name its own anchor district
    // outside the ordinary scout prefix. It reveals only that exact district;
    // no adjacent local discovery is spent or reordered.
    for (const questId of sources.directQuestAnchorIds ?? []) {
      const quest = sources.questsById.get(questId);
      if (quest?.home === townId && sources.discoveredQuestIds.has(quest.id)) {
        expectedDiscoveredAreaIds.add(quest.area);
      }
    }
    const actualDiscoveredAreaIds = new Set<string>();
    for (const area of localAreas) {
      if (sources.discoveredAreaIds.has(area.id)) actualDiscoveredAreaIds.add(area.id);
    }
    if (
      actualDiscoveredAreaIds.size !== expectedDiscoveredAreaIds.size ||
      [...actualDiscoveredAreaIds].some((areaId) => !expectedDiscoveredAreaIds.has(areaId))
    ) {
      throw new Error(
        `Overworld session snapshot discovered area count in town "${townId}" does not match local action replay.`,
      );
    }
  }
}

function countValues<T>(values: Iterable<T>, predicate: (value: T) => boolean): number {
  let count = 0;
  for (const value of values) {
    if (predicate(value)) count += 1;
  }
  return count;
}

function assertDiscoveredSourceCountReplay(
  sourceLabel: string,
  contextLabel: string,
  contextId: string,
  discoveredCount: number,
  expectedCount: number,
): void {
  if (discoveredCount !== expectedCount) {
    throw new Error(
      `Overworld session snapshot discovered ${sourceLabel} count in ${contextLabel} "${contextId}" does not match local action proof replay.`,
    );
  }
}

export function assertSnapshotDiscoveredLocalSourceCountReplay(
  sources: OverworldLocalActionJournalReachabilityIndex,
  localActionJournal: OverworldLocalActionJournalReplayIndex,
): void {
  const discoveredJobCountByTown = new Map<string, number>();
  const discoveredQuestCountByTown = new Map<string, number>();
  const discoveredSiteCountByArea = new Map<string, number>();

  for (const jobId of sources.discoveredJobIds) {
    const job = sources.jobsById.get(jobId);
    if (job) incrementCount(discoveredJobCountByTown, job.home);
  }
  for (const siteId of sources.discoveredSiteIds) {
    const site = sources.sitesById.get(siteId);
    if (site) incrementCount(discoveredSiteCountByArea, site.area);
  }
  for (const questId of sources.discoveredQuestIds) {
    if (sources.nonFifoQuestIds?.has(questId)) continue;
    const quest = sources.questsById.get(questId);
    if (quest) incrementCount(discoveredQuestCountByTown, quest.home);
  }

  for (const townId of sources.visitedTownIds) {
    const localActionCount = localActionJournal.localActionCountByTown.get(townId) ?? 0;
    const availableJobCount = countValues(indexedList(sources.jobsByTown, townId), (job) =>
      sources.discoveredAreaIds.has(job.area),
    );
    assertDiscoveredSourceCountReplay(
      "job",
      "town",
      townId,
      discoveredJobCountByTown.get(townId) ?? 0,
      Math.min(localActionCount, availableJobCount),
    );
    const availableQuestCount = countValues(
      indexedList(sources.questsByTown, townId),
      (quest) =>
        sources.discoveredAreaIds.has(quest.area) && !sources.nonFifoQuestIds?.has(quest.id),
    );
    assertDiscoveredSourceCountReplay(
      "quest",
      "town",
      townId,
      discoveredQuestCountByTown.get(townId) ?? 0,
      Math.min(localActionCount, availableQuestCount),
    );
  }
  for (const areaId of sources.discoveredAreaIds) {
    const localActionCount = localActionJournal.localActionCountByArea.get(areaId) ?? 0;
    const availableSiteCount = indexedList(sources.sitesByArea, areaId).length;
    assertDiscoveredSourceCountReplay(
      "site",
      "area",
      areaId,
      discoveredSiteCountByArea.get(areaId) ?? 0,
      Math.min(localActionCount, availableSiteCount),
    );
  }
}
