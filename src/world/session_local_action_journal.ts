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

export type OverworldDiscoveryLocalityIndex = {
  areaHomes: ReadonlyMap<string, string>;
  completedQuestIds: ReadonlySet<string>;
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
  charactersById: ReadonlyMap<string, OverworldCharacter>;
  contactPresentationsByJournalId: ReadonlyMap<string, OverworldContactPresentation>;
  discoveredAreaIds: ReadonlySet<string>;
  discoveredJobIds: ReadonlySet<string>;
  discoveredQuestIds: ReadonlySet<string>;
  discoveredSiteIds: ReadonlySet<string>;
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
};

export type OverworldLocalActionJournalReplayIndex = {
  entries: readonly OverworldLocalActionJournalReplayEntry[];
  localActionCountByArea: ReadonlyMap<string, number>;
  localActionCountByTown: ReadonlyMap<string, number>;
};

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
      return describeOverworldJobAction(job, area).minutes;
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
      return event ? 30 + event.intensity * 10 : null;
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
  for (const areaId of sources.discoveredAreaIds) {
    const home = sources.areaHomes.get(areaId);
    if (home) {
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
    assertVisitedTownForDiscovery("discovered quest", questId, quest.home, sources.visitedTownIds);
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

    const action = describeOverworldContactAction(expected.contact, expected.presentationId);
    if (entry.title !== action.title || entry.text !== action.text) {
      throw new Error(
        `Overworld session snapshot contact presentation "${entry.id}" does not match its authored copy.`,
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
  const entries: OverworldLocalActionJournalReplayEntry[] = [];
  const localActionCountByTown = new Map<string, number>();
  const localActionCountByArea = new Map<string, number>();

  for (const { entry, recordedAt } of journalTimeline.localActionEntries) {
    const source = localJournalSource(entry, sources);
    if (!source) continue;
    entries.push({
      entry,
      source,
      recordedAt,
      duration: localJournalActionDuration(entry, sources),
    });
    if (entry.kind !== "quest_done") {
      incrementCount(localActionCountByTown, source.home);
      incrementCount(localActionCountByArea, source.area);
    }
  }

  entries.sort((left, right) => left.recordedAt - right.recordedAt);
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
      if (areaIndex > 0 && priorLocalActionCount < areaIndex) {
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
  for (const townId of sources.visitedTownIds) {
    const localAreas = indexedList(sources.areasByTown, townId);
    const expectedDiscoveredCount =
      localAreas.length === 0
        ? 0
        : Math.min(
            localAreas.length,
            1 + (localActionJournal.localActionCountByTown.get(townId) ?? 0),
          );
    let actualDiscoveredCount = 0;
    for (const area of localAreas) {
      if (sources.discoveredAreaIds.has(area.id)) actualDiscoveredCount += 1;
    }
    if (actualDiscoveredCount !== expectedDiscoveredCount) {
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
