import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { createToolApi } from "../../src/mcp/tools.js";
import { parseOverworldManifest } from "../../src/world/overworld.js";

const api = () => createToolApi({ root: process.cwd() });
const overworld = parseOverworldManifest(
  JSON.parse(readFileSync("content/world/new_york_overworld.json", "utf8")),
);

type Snapshot = ReturnType<typeof exportedSnapshotAfterTwoRoads>["snapshot"];
type JournalEntry = Snapshot["journalEntries"][number];
type LocalEvent = (typeof overworld.local_events)[number];

function townName(nodeId: string): string {
  const town = overworld.nodes.find((node) => node.id === nodeId);
  if (!town) throw new Error(`unknown test town ${nodeId}`);
  return town.name;
}

function townRegion(nodeId: string): string {
  const town = overworld.nodes.find((node) => node.id === nodeId);
  if (!town) throw new Error(`unknown test town ${nodeId}`);
  return town.region;
}

function appendUnique(values: readonly string[], value: string): string[] {
  return values.includes(value) ? [...values] : [...values, value];
}

function addRenown(
  values: readonly (readonly [string, number])[],
  region: string,
  amount: number,
): [string, number][] {
  const totals = new Map(values);
  totals.set(region, (totals.get(region) ?? 0) + amount);
  return [...totals.entries()];
}

function unresolvedEventInDiscoveredArea(snapshot: Snapshot): LocalEvent {
  const event = overworld.local_events.find(
    (candidate) =>
      !snapshot.resolvedEventIds.includes(candidate.id) &&
      snapshot.visitedIds.includes(candidate.home) &&
      snapshot.discoveredAreaIds.includes(candidate.area),
  );
  if (!event) throw new Error("expected an unresolved event in a discovered area");
  return event;
}

function prerequisiteEntriesForEvent(
  snapshot: Snapshot,
  event: LocalEvent,
  prerequisites: { scout?: boolean; contact?: boolean; investigate?: boolean },
): JournalEntry[] {
  const recordedAt = snapshot.journalEntries[0]!.recordedAt;
  const entries: JournalEntry[] = [];
  if (prerequisites.scout) {
    const poi = overworld.points_of_interest.find((candidate) => candidate.area === event.area);
    if (!poi) throw new Error(`expected a point of interest in ${event.area}`);
    entries.push({
      id: `scout:${poi.id}`,
      kind: "poi",
      town: townName(poi.home),
      title: "Forged scout",
      text: "Forged local scout prerequisite.",
      recordedAt,
    });
  }
  if (prerequisites.contact) {
    const character = overworld.characters.find((candidate) => candidate.area === event.area);
    if (!character) throw new Error(`expected a contact in ${event.area}`);
    entries.push({
      id: `talk:${character.id}`,
      kind: "contact",
      town: townName(character.home),
      title: "Forged contact",
      text: "Forged local contact prerequisite.",
      recordedAt,
    });
  }
  if (prerequisites.investigate) {
    entries.push({
      id: `investigate:${event.id}`,
      kind: "event",
      town: townName(event.home),
      title: "Forged investigation",
      text: "Forged event investigation prerequisite.",
      recordedAt,
    });
  }
  return entries;
}

function forgeResolvedEventSnapshot(
  snapshot: Snapshot,
  event: LocalEvent,
  prerequisites: { scout?: boolean; contact?: boolean; investigate?: boolean },
): Snapshot {
  const recordedAt = snapshot.journalEntries[0]!.recordedAt;
  return {
    ...snapshot,
    resolvedEventIds: appendUnique(snapshot.resolvedEventIds, event.id),
    regionRenown: addRenown(snapshot.regionRenown, townRegion(event.home), event.intensity),
    journalEntries: [
      {
        id: `resolve:${event.id}`,
        kind: "resolution",
        town: townName(event.home),
        title: "Forged resolution",
        text: "Forged resolution journal proof.",
        recordedAt,
      },
      ...prerequisiteEntriesForEvent(snapshot, event, prerequisites),
      ...snapshot.journalEntries,
    ],
  };
}

function exportedSnapshotAfterTwoRoads() {
  const a = api();
  const started = a.start_overworld();
  const firstRoad =
    started.observation.exits.find((edge) => edge.destination.id === "colonie_town") ??
    started.observation.exits[0];
  if (!firstRoad) throw new Error("expected an overworld road from start");

  a.travel_overworld_session({ session_id: started.session_id, road_id: firstRoad.id });
  a.resolve_overworld_session_road_encounter({
    session_id: started.session_id,
    strategy: "press_on",
  });

  const afterFirstRoad = a.get_overworld_session({ session_id: started.session_id }).observation;
  const secondRoad = afterFirstRoad.exits[0];
  if (!secondRoad) throw new Error("expected a second overworld road");
  a.travel_overworld_session({ session_id: started.session_id, road_id: secondRoad.id });
  a.resolve_overworld_session_road_encounter({
    session_id: started.session_id,
    strategy: "press_on",
  });

  const snapshot = a.export_overworld_session({ session_id: started.session_id }).snapshot;
  expect(snapshot.travelLog.length).toBeGreaterThanOrEqual(2);
  expect(snapshot.journalEntries.length).toBeGreaterThanOrEqual(2);
  return { a, snapshot };
}

function exportedSnapshotAfterRoadStrategy(strategy: "assist_travelers" | "cautious_scout") {
  const a = api();
  const started = a.start_overworld();
  const firstRoad =
    started.observation.exits.find((edge) => edge.destination.id === "colonie_town") ??
    started.observation.exits[0];
  if (!firstRoad) throw new Error("expected an overworld road from start");

  a.travel_overworld_session({ session_id: started.session_id, road_id: firstRoad.id });
  a.resolve_overworld_session_road_encounter({
    session_id: started.session_id,
    strategy,
  });

  const snapshot = a.export_overworld_session({ session_id: started.session_id }).snapshot;
  expect(snapshot.journalEntries.some((entry) => entry.kind === "road")).toBe(true);
  expect(snapshot.regionRenown.length).toBeGreaterThan(0);
  return { a, snapshot };
}

describe("overworld snapshot restore integrity", () => {
  it("rejects duplicate journal ids in forged session snapshots", () => {
    const { a, snapshot } = exportedSnapshotAfterTwoRoads();
    const duplicatedJournal = {
      ...snapshot,
      journalEntries: [snapshot.journalEntries[0]!, ...snapshot.journalEntries],
    };

    expect(() => a.restore_overworld_session({ snapshot: duplicatedJournal })).toThrow(
      /duplicate journal entry id/,
    );
  });

  it("rejects malformed journal timestamps in forged session snapshots", () => {
    const { a, snapshot } = exportedSnapshotAfterTwoRoads();
    const malformedJournal = {
      ...snapshot,
      journalEntries: [
        { ...snapshot.journalEntries[0]!, recordedAt: "yesterday" },
        ...snapshot.journalEntries.slice(1),
      ],
    };

    expect(() => a.restore_overworld_session({ snapshot: malformedJournal })).toThrow(
      /malformed journal timestamp/,
    );
  });

  it("rejects journal entries bound to unknown overworld towns", () => {
    const { a, snapshot } = exportedSnapshotAfterTwoRoads();
    const detachedJournalTown = {
      ...snapshot,
      journalEntries: [
        { ...snapshot.journalEntries[0]!, town: "Atlantis" },
        ...snapshot.journalEntries.slice(1),
      ],
    };

    expect(() => a.restore_overworld_session({ snapshot: detachedJournalTown })).toThrow(
      /unknown town/,
    );
  });

  it("rejects journal entries whose kind does not match their source id", () => {
    const { a, snapshot } = exportedSnapshotAfterTwoRoads();
    const mismatchedJournalSource = {
      ...snapshot,
      journalEntries: [
        { ...snapshot.journalEntries[0]!, kind: "job" as const },
        ...snapshot.journalEntries.slice(1),
      ],
    };

    expect(() => a.restore_overworld_session({ snapshot: mismatchedJournalSource })).toThrow(
      /journal job entry id/,
    );
  });

  it("rejects journal entries bound to unknown overworld source ids", () => {
    const { a, snapshot } = exportedSnapshotAfterTwoRoads();
    const roadEntry = snapshot.journalEntries.find((entry) => entry.kind === "road");
    if (!roadEntry) throw new Error("expected a road journal entry");
    const roadMatch = /^road:(.+):(\d+):([a-z_]+)$/.exec(roadEntry.id);
    if (!roadMatch) throw new Error(`unexpected road journal id ${roadEntry.id}`);
    const detachedJournalSource = {
      ...snapshot,
      journalEntries: snapshot.journalEntries.map((entry) =>
        entry === roadEntry
          ? { ...entry, id: `road:missing_road:${roadMatch[2]}:${roadMatch[3]}` }
          : entry,
      ),
    };

    expect(() => a.restore_overworld_session({ snapshot: detachedJournalSource })).toThrow(
      /unknown road/,
    );
  });

  it("restores regional arc journal entries bound to known regions", () => {
    const { a, snapshot } = exportedSnapshotAfterTwoRoads();
    const arc = overworld.regional_arcs[0]!;
    const regionalArcSnapshot = {
      ...snapshot,
      completedRegionalArcIds: [arc.id],
      journalEntries: [
        {
          id: `arc:${arc.id}`,
          kind: "regional_arc" as const,
          town: arc.region,
          title: `Completed ${arc.title}`,
          text: arc.reward,
          recordedAt: snapshot.journalEntries[0]!.recordedAt,
        },
        ...snapshot.journalEntries,
      ],
    };

    expect(() => a.restore_overworld_session({ snapshot: regionalArcSnapshot })).not.toThrow();
  });

  it("rejects unexpected region renown with no journal source", () => {
    const { a, snapshot } = exportedSnapshotAfterTwoRoads();
    const region = overworld.nodes[0]!.region;
    const forgedRenown = {
      ...snapshot,
      regionRenown: [[region, 1] satisfies [string, number]],
    };

    expect(() => a.restore_overworld_session({ snapshot: forgedRenown })).toThrow(
      /unexpected region renown/,
    );
  });

  it("rejects missing region renown earned by road encounters", () => {
    const { a, snapshot } = exportedSnapshotAfterRoadStrategy("cautious_scout");
    const missingRoadRenown = {
      ...snapshot,
      regionRenown: [],
    };

    expect(() => a.restore_overworld_session({ snapshot: missingRoadRenown })).toThrow(
      /region renown.*expected 1/,
    );
  });

  it("rejects discovered areas attached to unvisited towns", () => {
    const { a, snapshot } = exportedSnapshotAfterTwoRoads();
    const area = overworld.areas.find((candidate) => !snapshot.visitedIds.includes(candidate.home));
    if (!area) throw new Error("expected an area in an unvisited town");
    const forgedAreaDiscovery = {
      ...snapshot,
      discoveredAreaIds: appendUnique(snapshot.discoveredAreaIds, area.id),
    };

    expect(() => a.restore_overworld_session({ snapshot: forgedAreaDiscovery })).toThrow(
      /discovered area.*unvisited town/,
    );
  });

  it("rejects saved area positions for unvisited towns", () => {
    const { a, snapshot } = exportedSnapshotAfterTwoRoads();
    const area = overworld.areas.find((candidate) => !snapshot.visitedIds.includes(candidate.home));
    if (!area) throw new Error("expected an area in an unvisited town");
    const forgedSavedArea = {
      ...snapshot,
      discoveredAreaIds: appendUnique(snapshot.discoveredAreaIds, area.id),
      currentAreaByTown: [
        ...snapshot.currentAreaByTown,
        [area.home, area.id] satisfies [string, string],
      ],
    };

    expect(() => a.restore_overworld_session({ snapshot: forgedSavedArea })).toThrow(
      /saved area town.*not visited/,
    );
  });

  it("rejects discovered jobs in undiscovered areas", () => {
    const { a, snapshot } = exportedSnapshotAfterTwoRoads();
    const job = overworld.local_jobs.find(
      (candidate) =>
        snapshot.visitedIds.includes(candidate.home) &&
        !snapshot.discoveredAreaIds.includes(candidate.area),
    );
    if (!job) throw new Error("expected a job in an undiscovered visited-town area");
    const forgedJobDiscovery = {
      ...snapshot,
      discoveredJobIds: appendUnique(snapshot.discoveredJobIds, job.id),
    };

    expect(() => a.restore_overworld_session({ snapshot: forgedJobDiscovery })).toThrow(
      /discovered job.*undiscovered area/,
    );
  });

  it("rejects discovered sites in undiscovered areas", () => {
    const { a, snapshot } = exportedSnapshotAfterTwoRoads();
    const site = overworld.exploration_sites.find(
      (candidate) =>
        snapshot.visitedIds.includes(candidate.nearest_town) &&
        !snapshot.discoveredAreaIds.includes(candidate.area),
    );
    if (!site) throw new Error("expected a site in an undiscovered visited-town area");
    const forgedSiteDiscovery = {
      ...snapshot,
      discoveredSiteIds: appendUnique(snapshot.discoveredSiteIds, site.id),
    };

    expect(() => a.restore_overworld_session({ snapshot: forgedSiteDiscovery })).toThrow(
      /discovered site.*undiscovered area/,
    );
  });

  it("rejects discovered quests in undiscovered areas", () => {
    const { a, snapshot } = exportedSnapshotAfterTwoRoads();
    const quest = overworld.quests.find(
      (candidate) =>
        snapshot.visitedIds.includes(candidate.home) &&
        !snapshot.discoveredAreaIds.includes(candidate.area),
    );
    if (!quest) throw new Error("expected a quest in an undiscovered visited-town area");
    const forgedQuestDiscovery = {
      ...snapshot,
      discoveredQuestIds: appendUnique(snapshot.discoveredQuestIds, quest.id),
    };

    expect(() => a.restore_overworld_session({ snapshot: forgedQuestDiscovery })).toThrow(
      /discovered quest.*undiscovered area/,
    );
  });

  it("rejects resolved events attached to unvisited towns", () => {
    const { a, snapshot } = exportedSnapshotAfterTwoRoads();
    const event = overworld.local_events.find(
      (candidate) => !snapshot.visitedIds.includes(candidate.home),
    );
    if (!event) throw new Error("expected an event in an unvisited town");
    const forgedEventResolution = {
      ...snapshot,
      resolvedEventIds: appendUnique(snapshot.resolvedEventIds, event.id),
      regionRenown: addRenown(snapshot.regionRenown, townRegion(event.home), event.intensity),
      journalEntries: [
        {
          id: `resolve:${event.id}`,
          kind: "resolution" as const,
          town: townName(event.home),
          title: "Forged resolution",
          text: "Forged resolution journal proof.",
          recordedAt: snapshot.journalEntries[0]!.recordedAt,
        },
        ...snapshot.journalEntries,
      ],
    };

    expect(() => a.restore_overworld_session({ snapshot: forgedEventResolution })).toThrow(
      /resolved event.*unvisited town/,
    );
  });

  it("rejects resolved events in undiscovered areas", () => {
    const { a, snapshot } = exportedSnapshotAfterTwoRoads();
    const event = overworld.local_events.find(
      (candidate) =>
        snapshot.visitedIds.includes(candidate.home) &&
        !snapshot.discoveredAreaIds.includes(candidate.area),
    );
    if (!event) throw new Error("expected an event in an undiscovered visited-town area");
    const forgedEventResolution = {
      ...snapshot,
      resolvedEventIds: appendUnique(snapshot.resolvedEventIds, event.id),
      regionRenown: addRenown(snapshot.regionRenown, townRegion(event.home), event.intensity),
      journalEntries: [
        {
          id: `resolve:${event.id}`,
          kind: "resolution" as const,
          town: townName(event.home),
          title: "Forged resolution",
          text: "Forged resolution journal proof.",
          recordedAt: snapshot.journalEntries[0]!.recordedAt,
        },
        ...snapshot.journalEntries,
      ],
    };

    expect(() => a.restore_overworld_session({ snapshot: forgedEventResolution })).toThrow(
      /resolved event.*undiscovered area/,
    );
  });

  it.each([
    {
      label: "local scout",
      prerequisites: { contact: true, investigate: true },
      pattern: /resolved event.*scout prerequisite/,
    },
    {
      label: "local contact",
      prerequisites: { scout: true, investigate: true },
      pattern: /resolved event.*contact prerequisite/,
    },
    {
      label: "event investigation",
      prerequisites: { scout: true, contact: true },
      pattern: /resolved event.*investigated event prerequisite/,
    },
  ])("rejects resolved events missing $label proof", ({ prerequisites, pattern }) => {
    const { a, snapshot } = exportedSnapshotAfterTwoRoads();
    const event = unresolvedEventInDiscoveredArea(snapshot);

    expect(() =>
      a.restore_overworld_session({
        snapshot: forgeResolvedEventSnapshot(snapshot, event, prerequisites),
      }),
    ).toThrow(pattern);
  });

  it("restores resolved events with local prerequisite proof", () => {
    const { a, snapshot } = exportedSnapshotAfterTwoRoads();
    const event = unresolvedEventInDiscoveredArea(snapshot);
    const resolvedWithProof = forgeResolvedEventSnapshot(snapshot, event, {
      scout: true,
      contact: true,
      investigate: true,
    });

    expect(() => a.restore_overworld_session({ snapshot: resolvedWithProof })).not.toThrow();
  });

  it.each([
    {
      label: "completed job",
      forge(snapshot: Snapshot): Snapshot {
        const job = overworld.local_jobs.find(
          (candidate) => !snapshot.completedJobIds.includes(candidate.id),
        );
        if (!job) throw new Error("expected an incomplete job");
        return {
          ...snapshot,
          discoveredJobIds: [...snapshot.discoveredJobIds, job.id],
          completedJobIds: [...snapshot.completedJobIds, job.id],
          journalEntries: [
            {
              id: `job:${job.id}`,
              kind: "job",
              town: townName(job.home),
              title: "Forged job",
              text: "Forged job journal proof.",
              recordedAt: snapshot.journalEntries[0]!.recordedAt,
            },
            ...snapshot.journalEntries,
          ],
        };
      },
    },
    {
      label: "explored site",
      forge(snapshot: Snapshot): Snapshot {
        const site = overworld.exploration_sites.find(
          (candidate) => !snapshot.exploredSiteIds.includes(candidate.id),
        );
        if (!site) throw new Error("expected an unexplored site");
        return {
          ...snapshot,
          discoveredSiteIds: [...snapshot.discoveredSiteIds, site.id],
          exploredSiteIds: [...snapshot.exploredSiteIds, site.id],
          journalEntries: [
            {
              id: `site:${site.id}`,
              kind: "site",
              town: townName(site.nearest_town),
              title: "Forged site",
              text: "Forged site journal proof.",
              recordedAt: snapshot.journalEntries[0]!.recordedAt,
            },
            ...snapshot.journalEntries,
          ],
        };
      },
    },
    {
      label: "resolved event",
      forge(snapshot: Snapshot): Snapshot {
        const event = overworld.local_events.find(
          (candidate) => !snapshot.resolvedEventIds.includes(candidate.id),
        );
        if (!event) throw new Error("expected an unresolved event");
        return {
          ...snapshot,
          resolvedEventIds: [...snapshot.resolvedEventIds, event.id],
          journalEntries: [
            {
              id: `resolve:${event.id}`,
              kind: "resolution",
              town: townName(event.home),
              title: "Forged resolution",
              text: "Forged resolution journal proof.",
              recordedAt: snapshot.journalEntries[0]!.recordedAt,
            },
            ...snapshot.journalEntries,
          ],
        };
      },
    },
  ])("rejects $label journal/progress proof without earned renown", ({ forge }) => {
    const { a, snapshot } = exportedSnapshotAfterTwoRoads();

    expect(() => a.restore_overworld_session({ snapshot: forge(snapshot) })).toThrow(
      /region renown/,
    );
  });

  it.each([
    {
      label: "visited area",
      forge(snapshot: Snapshot): Snapshot {
        const area = overworld.areas.find(
          (candidate) => !snapshot.visitedAreaIds.includes(candidate.id),
        );
        if (!area) throw new Error("expected an unvisited area");
        return {
          ...snapshot,
          discoveredAreaIds: [...snapshot.discoveredAreaIds, area.id],
          visitedAreaIds: [...snapshot.visitedAreaIds, area.id],
        };
      },
      pattern: /visited area id.*matching journal/,
    },
    {
      label: "completed job",
      forge(snapshot: Snapshot): Snapshot {
        const job = overworld.local_jobs.find(
          (candidate) => !snapshot.completedJobIds.includes(candidate.id),
        );
        if (!job) throw new Error("expected an incomplete job");
        return {
          ...snapshot,
          discoveredJobIds: [...snapshot.discoveredJobIds, job.id],
          completedJobIds: [...snapshot.completedJobIds, job.id],
        };
      },
      pattern: /completed job id.*matching journal/,
    },
    {
      label: "explored site",
      forge(snapshot: Snapshot): Snapshot {
        const site = overworld.exploration_sites.find(
          (candidate) => !snapshot.exploredSiteIds.includes(candidate.id),
        );
        if (!site) throw new Error("expected an unexplored site");
        return {
          ...snapshot,
          discoveredSiteIds: [...snapshot.discoveredSiteIds, site.id],
          exploredSiteIds: [...snapshot.exploredSiteIds, site.id],
        };
      },
      pattern: /explored site id.*matching journal/,
    },
    {
      label: "resolved event",
      forge(snapshot: Snapshot): Snapshot {
        const event = overworld.local_events.find(
          (candidate) => !snapshot.resolvedEventIds.includes(candidate.id),
        );
        if (!event) throw new Error("expected an unresolved event");
        return {
          ...snapshot,
          resolvedEventIds: [...snapshot.resolvedEventIds, event.id],
        };
      },
      pattern: /resolved event id.*matching journal/,
    },
    {
      label: "completed regional arc",
      forge(snapshot: Snapshot): Snapshot {
        const arc = overworld.regional_arcs.find(
          (candidate) => !snapshot.completedRegionalArcIds.includes(candidate.id),
        );
        if (!arc) throw new Error("expected an incomplete regional arc");
        return {
          ...snapshot,
          completedRegionalArcIds: [...snapshot.completedRegionalArcIds, arc.id],
        };
      },
      pattern: /completed regional arc id.*matching journal/,
    },
  ])("rejects $label state without matching journal proof", ({ forge, pattern }) => {
    const { a, snapshot } = exportedSnapshotAfterTwoRoads();

    expect(() => a.restore_overworld_session({ snapshot: forge(snapshot) })).toThrow(pattern);
  });

  it.each([
    {
      label: "visited area",
      makeEntry(snapshot: Snapshot): JournalEntry {
        const area = overworld.areas.find(
          (candidate) => !snapshot.visitedAreaIds.includes(candidate.id),
        );
        if (!area) throw new Error("expected an unvisited area");
        return {
          id: `area:${area.id}`,
          kind: "area",
          town: townName(area.home),
          title: "Forged area",
          text: "Forged area journal proof.",
          recordedAt: snapshot.journalEntries[0]!.recordedAt,
        };
      },
      pattern: /journal visited area id.*missing from saved state/,
    },
    {
      label: "completed job",
      makeEntry(snapshot: Snapshot): JournalEntry {
        const job = overworld.local_jobs.find(
          (candidate) => !snapshot.completedJobIds.includes(candidate.id),
        );
        if (!job) throw new Error("expected an incomplete job");
        return {
          id: `job:${job.id}`,
          kind: "job",
          town: townName(job.home),
          title: "Forged job",
          text: "Forged job journal proof.",
          recordedAt: snapshot.journalEntries[0]!.recordedAt,
        };
      },
      pattern: /journal completed job id.*missing from saved state/,
    },
    {
      label: "explored site",
      makeEntry(snapshot: Snapshot): JournalEntry {
        const site = overworld.exploration_sites.find(
          (candidate) => !snapshot.exploredSiteIds.includes(candidate.id),
        );
        if (!site) throw new Error("expected an unexplored site");
        return {
          id: `site:${site.id}`,
          kind: "site",
          town: townName(site.nearest_town),
          title: "Forged site",
          text: "Forged site journal proof.",
          recordedAt: snapshot.journalEntries[0]!.recordedAt,
        };
      },
      pattern: /journal explored site id.*missing from saved state/,
    },
    {
      label: "resolved event",
      makeEntry(snapshot: Snapshot): JournalEntry {
        const event = overworld.local_events.find(
          (candidate) => !snapshot.resolvedEventIds.includes(candidate.id),
        );
        if (!event) throw new Error("expected an unresolved event");
        return {
          id: `resolve:${event.id}`,
          kind: "resolution",
          town: townName(event.home),
          title: "Forged resolution",
          text: "Forged resolution journal proof.",
          recordedAt: snapshot.journalEntries[0]!.recordedAt,
        };
      },
      pattern: /journal resolved event id.*missing from saved state/,
    },
    {
      label: "completed regional arc",
      makeEntry(snapshot: Snapshot): JournalEntry {
        const arc = overworld.regional_arcs.find(
          (candidate) => !snapshot.completedRegionalArcIds.includes(candidate.id),
        );
        if (!arc) throw new Error("expected an incomplete regional arc");
        return {
          id: `arc:${arc.id}`,
          kind: "regional_arc",
          town: arc.region,
          title: "Forged regional arc",
          text: "Forged regional arc journal proof.",
          recordedAt: snapshot.journalEntries[0]!.recordedAt,
        };
      },
      pattern: /journal completed regional arc id.*missing from saved state/,
    },
  ])("rejects $label journal proof missing from progress state", ({ makeEntry, pattern }) => {
    const { a, snapshot } = exportedSnapshotAfterTwoRoads();
    const forgedJournal = {
      ...snapshot,
      journalEntries: [makeEntry(snapshot), ...snapshot.journalEntries],
    };

    expect(() => a.restore_overworld_session({ snapshot: forgedJournal })).toThrow(pattern);
  });

  it("rejects future journal history in forged session snapshots", () => {
    const { a, snapshot } = exportedSnapshotAfterTwoRoads();
    const futureJournal = {
      ...snapshot,
      journalEntries: [
        { ...snapshot.journalEntries[0]!, recordedAt: "Day 999, 00:00" },
        ...snapshot.journalEntries.slice(1),
      ],
    };

    expect(() => a.restore_overworld_session({ snapshot: futureJournal })).toThrow(/future entry/);
  });

  it("rejects journal history that is not newest-first", () => {
    const { a, snapshot } = exportedSnapshotAfterTwoRoads();
    const reversedJournal = {
      ...snapshot,
      journalEntries: [...snapshot.journalEntries].reverse(),
    };

    expect(() => a.restore_overworld_session({ snapshot: reversedJournal })).toThrow(
      /journal must be newest-first/,
    );
  });

  it("rejects forged travel logs that are not newest-first", () => {
    const { a, snapshot } = exportedSnapshotAfterTwoRoads();
    const reversedTravelLog = {
      ...snapshot,
      travelLog: [...snapshot.travelLog].reverse(),
    };

    expect(() => a.restore_overworld_session({ snapshot: reversedTravelLog })).toThrow(
      /newest-first/,
    );
  });

  it("rejects future travel history in forged session snapshots", () => {
    const { a, snapshot } = exportedSnapshotAfterTwoRoads();
    const futureTravelLog = {
      ...snapshot,
      travelLog: [
        { ...snapshot.travelLog[0]!, arrivedAt: snapshot.minutes + 1 },
        ...snapshot.travelLog.slice(1),
      ],
    };

    expect(() => a.restore_overworld_session({ snapshot: futureTravelLog })).toThrow(
      /future arrival/,
    );
  });

  it("rejects impossible post-travel supplies and fatigue", () => {
    const { a, snapshot } = exportedSnapshotAfterTwoRoads();
    const impossibleVitals = {
      ...snapshot,
      travelLog: [{ ...snapshot.travelLog[0]!, suppliesAfter: 9 }, ...snapshot.travelLog.slice(1)],
    };

    expect(() => a.restore_overworld_session({ snapshot: impossibleVitals })).toThrow();
  });
});
