import { describe, expect, it } from "vitest";
import type {
  OverworldArea,
  OverworldAreaExit,
  OverworldExplorationSite,
  OverworldLocalJob,
} from "../../src/world/overworld.js";
import {
  applyOverworldAreaTravel,
  applyOverworldLocalJobCompletion,
  applyOverworldSiteExploration,
  planOverworldAreaExploration,
  planOverworldLocalJobCompletion,
  planOverworldSiteExploration,
} from "../../src/world/session_local_actions.js";
import type { OverworldJournalEntry } from "../../src/world/session_snapshot.js";

function area(id: string, home = "town_a"): OverworldArea {
  return {
    id,
    home,
    name: `${id} name`,
    kind: "civic_core",
    summary: `${id} summary`,
    discovery: `${id} discovery`,
    travel_minutes: 20,
    services: [],
  };
}

function areaExit(destination = area("area_b")): OverworldAreaExit {
  return {
    id: "area-route:a-b",
    home: "town_a",
    from_area: "area_a",
    to_area: destination.id,
    route: "Arcade walk",
    travel_minutes: 18,
    destination,
  };
}

function job(id: string, areaId = "area_a", home = "town_a"): OverworldLocalJob {
  return {
    id,
    home,
    area: areaId,
    kind: "courier",
    title: `${id} title`,
    summary: `${id} summary`,
    objective: `${id} objective`,
    reward: `${id} reward`,
    minutes: 30,
    difficulty: 2,
    visibility: "local_job_board",
  };
}

function site(id: string, areaId = "area_a", nearestTown = "town_a"): OverworldExplorationSite {
  return {
    id,
    region: "Test Region",
    nearest_town: nearestTown,
    area: areaId,
    kind: "civic",
    title: `${id} title`,
    summary: `${id} summary`,
    discovery: `${id} discovery`,
    danger: 3,
    reward: `${id} reward`,
  };
}

function journalEntry(id: string, kind: OverworldJournalEntry["kind"]): OverworldJournalEntry {
  return {
    id,
    kind,
    town: "Alden",
    title: id,
    text: id,
    recordedAt: "Day 1, 10:00",
  };
}

describe("overworld local action planning", () => {
  it("applies local area travel into arrival state", () => {
    const currentArea = area("area_a");
    const destination = area("area_b");

    expect(
      applyOverworldAreaTravel(currentArea, areaExit(destination), {
        currentTownId: "town_a",
        minutes: 480,
      }),
    ).toEqual({
      from: currentArea,
      to: destination,
      route: "Arcade walk",
      minutes: 18,
      arrivedAt: "Day 1, 08:18",
      currentAreaIdAfter: "area_b",
      currentAreaByTownEntry: ["town_a", "area_b"],
      minutesAfter: 498,
    });
  });

  it("plans area exploration and preserves idempotent journal replay", () => {
    const localArea = area("area_a");
    const visitedAreaIds = new Set<string>();

    expect(
      planOverworldAreaExploration({
        areaId: localArea.id,
        areasById: new Map([[localArea.id, localArea]]),
        currentTownId: "town_a",
        currentAreaId: localArea.id,
        discoveredAreaIds: new Set([localArea.id]),
        visitedAreaIds,
        journalEntries: new Map(),
      }),
    ).toEqual({
      alreadyKnown: false,
      areaId: localArea.id,
      action: {
        id: `area:${localArea.id}`,
        kind: "area",
        title: `Explored ${localArea.name}`,
        text: `${localArea.summary} ${localArea.discovery}`,
        minutes: localArea.travel_minutes,
      },
    });
    expect([...visitedAreaIds]).toEqual([]);

    const existing = journalEntry(`area:${localArea.id}`, "area");
    expect(
      planOverworldAreaExploration({
        areaId: localArea.id,
        areasById: new Map([[localArea.id, localArea]]),
        currentTownId: "town_a",
        currentAreaId: localArea.id,
        discoveredAreaIds: new Set([localArea.id]),
        visitedAreaIds: new Set([localArea.id]),
        journalEntries: new Map([[existing.id, existing]]),
      }),
    ).toEqual({ alreadyKnown: true, minutes: 0, entry: existing });
  });

  it("rejects area exploration before local map gates are satisfied", () => {
    const localArea = area("area_a");
    const baseState = {
      areaId: localArea.id,
      areasById: new Map([[localArea.id, localArea]]),
      currentTownId: "town_a",
      currentAreaId: localArea.id,
      discoveredAreaIds: new Set([localArea.id]),
      visitedAreaIds: new Set<string>(),
      journalEntries: new Map<string, OverworldJournalEntry>(),
    };

    expect(() => planOverworldAreaExploration({ ...baseState, areaId: "missing_area" })).toThrow(
      /not in this town/,
    );
    expect(() =>
      planOverworldAreaExploration({ ...baseState, discoveredAreaIds: new Set() }),
    ).toThrow(/map that district/);
    expect(() =>
      planOverworldAreaExploration({ ...baseState, currentAreaId: "other_area" }),
    ).toThrow(/Move to that local area/);
  });

  it("plans local job completion with renown and idempotent replay", () => {
    const localArea = area("area_a");
    const localJob = job("job_a", localArea.id);
    const existing = journalEntry(`job:${localJob.id}`, "job");

    expect(
      planOverworldLocalJobCompletion({
        jobId: localJob.id,
        jobsById: new Map([[localJob.id, localJob]]),
        areasById: new Map([[localArea.id, localArea]]),
        currentTownId: "town_a",
        currentRegion: "North",
        currentAreaId: localArea.id,
        discoveredJobIds: new Set([localJob.id]),
        completedJobIds: new Set(),
        journalEntries: new Map(),
      }),
    ).toMatchObject({
      alreadyKnown: false,
      jobId: localJob.id,
      renownRegion: "North",
      renown: localJob.difficulty,
      action: {
        id: `job:${localJob.id}`,
        kind: "job",
        title: `Completed ${localJob.title}`,
        minutes: localJob.minutes,
      },
    });

    expect(
      planOverworldLocalJobCompletion({
        jobId: localJob.id,
        jobsById: new Map([[localJob.id, localJob]]),
        areasById: new Map([[localArea.id, localArea]]),
        currentTownId: "town_a",
        currentRegion: "North",
        currentAreaId: localArea.id,
        discoveredJobIds: new Set([localJob.id]),
        completedJobIds: new Set([localJob.id]),
        journalEntries: new Map([[existing.id, existing]]),
      }),
    ).toEqual({ alreadyKnown: true, minutes: 0, entry: existing });
  });

  it("applies local job completion into completion ids and regional renown", () => {
    const localJob = job("job_a");
    const plan = planOverworldLocalJobCompletion({
      jobId: localJob.id,
      jobsById: new Map([[localJob.id, localJob]]),
      areasById: new Map([["area_a", area("area_a")]]),
      currentTownId: "town_a",
      currentRegion: "North",
      currentAreaId: "area_a",
      discoveredJobIds: new Set([localJob.id]),
      completedJobIds: new Set(),
      journalEntries: new Map(),
    });
    if (plan.alreadyKnown) throw new Error("expected a new job completion plan");
    const completedJobIds = new Set<string>();
    const regionRenown = new Map([["North", 1]]);

    expect(applyOverworldLocalJobCompletion({ completedJobIds, regionRenown }, plan)).toEqual({
      completedId: localJob.id,
      renownRegion: "North",
      renownGained: 2,
      renownAfter: 3,
    });
    expect([...completedJobIds]).toEqual([localJob.id]);
    expect(regionRenown.get("North")).toBe(3);
  });

  it("rejects local job completion before discovery or area alignment", () => {
    const localJob = job("job_a", "area_a");
    const baseState = {
      jobId: localJob.id,
      jobsById: new Map([[localJob.id, localJob]]),
      areasById: new Map([["area_a", area("area_a")]]),
      currentTownId: "town_a",
      currentRegion: "North",
      currentAreaId: "area_a",
      discoveredJobIds: new Set([localJob.id]),
      completedJobIds: new Set<string>(),
      journalEntries: new Map<string, OverworldJournalEntry>(),
    };

    expect(() => planOverworldLocalJobCompletion({ ...baseState, jobId: "missing_job" })).toThrow(
      /not in this town/,
    );
    expect(() =>
      planOverworldLocalJobCompletion({ ...baseState, discoveredJobIds: new Set() }),
    ).toThrow(/before working that job/);
    expect(() =>
      planOverworldLocalJobCompletion({ ...baseState, currentAreaId: "other_area" }),
    ).toThrow(/Move to that local area/);
  });

  it("plans exploration site completion with regional renown and idempotent replay", () => {
    const localSite = site("site_a");
    const existing = journalEntry(`site:${localSite.id}`, "site");

    expect(
      planOverworldSiteExploration({
        siteId: localSite.id,
        sitesById: new Map([[localSite.id, localSite]]),
        currentTownId: "town_a",
        currentAreaId: localSite.area,
        discoveredSiteIds: new Set([localSite.id]),
        exploredSiteIds: new Set(),
        journalEntries: new Map(),
      }),
    ).toEqual({
      alreadyKnown: false,
      siteId: localSite.id,
      renownRegion: localSite.region,
      renown: localSite.danger,
      action: {
        id: `site:${localSite.id}`,
        kind: "site",
        title: `Explored ${localSite.title}`,
        text: `${localSite.summary} ${localSite.reward}`,
        minutes: 45 + localSite.danger * 15,
        regionalRenown: localSite.danger,
      },
    });

    expect(
      planOverworldSiteExploration({
        siteId: localSite.id,
        sitesById: new Map([[localSite.id, localSite]]),
        currentTownId: "town_a",
        currentAreaId: localSite.area,
        discoveredSiteIds: new Set([localSite.id]),
        exploredSiteIds: new Set([localSite.id]),
        journalEntries: new Map([[existing.id, existing]]),
      }),
    ).toEqual({ alreadyKnown: true, minutes: 0, entry: existing });
  });

  it("applies site exploration into explored ids and regional renown", () => {
    const localSite = site("site_a");
    const plan = planOverworldSiteExploration({
      siteId: localSite.id,
      sitesById: new Map([[localSite.id, localSite]]),
      currentTownId: "town_a",
      currentAreaId: localSite.area,
      discoveredSiteIds: new Set([localSite.id]),
      exploredSiteIds: new Set(),
      journalEntries: new Map(),
    });
    if (plan.alreadyKnown) throw new Error("expected a new site exploration plan");
    const exploredSiteIds = new Set<string>();
    const regionRenown = new Map([["Test Region", 4]]);

    expect(applyOverworldSiteExploration({ exploredSiteIds, regionRenown }, plan)).toEqual({
      completedId: localSite.id,
      renownRegion: "Test Region",
      renownGained: 3,
      renownAfter: 7,
    });
    expect([...exploredSiteIds]).toEqual([localSite.id]);
    expect(regionRenown.get("Test Region")).toBe(7);
  });

  it("rejects exploration site completion before scouting or area alignment", () => {
    const localSite = site("site_a");
    const baseState = {
      siteId: localSite.id,
      sitesById: new Map([[localSite.id, localSite]]),
      currentTownId: "town_a",
      currentAreaId: localSite.area,
      discoveredSiteIds: new Set([localSite.id]),
      exploredSiteIds: new Set<string>(),
      journalEntries: new Map<string, OverworldJournalEntry>(),
    };

    expect(() => planOverworldSiteExploration({ ...baseState, siteId: "missing_site" })).toThrow(
      /not reachable from this town/,
    );
    expect(() =>
      planOverworldSiteExploration({ ...baseState, discoveredSiteIds: new Set() }),
    ).toThrow(/Scout a local point of interest/);
    expect(() =>
      planOverworldSiteExploration({ ...baseState, currentAreaId: "other_area" }),
    ).toThrow(/Move to that local area/);
  });
});
