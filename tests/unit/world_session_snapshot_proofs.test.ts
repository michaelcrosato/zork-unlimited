import { describe, expect, it } from "vitest";
import {
  assertSnapshotCurrentAreaReachability,
  assertSnapshotCurrentAreaMapBindings,
  assertSnapshotCurrentAreaMapExact,
  assertSnapshotCurrentLocationManifestBinding,
  assertSnapshotCurrentTownReachability,
  assertSnapshotDiscoveredAreaPrefix,
  assertSnapshotDiscoveredLocalSourcePrefixes,
  assertSnapshotDiscoveredTownFrontier,
  assertSnapshotPendingRoadEncounterBinding,
  assertSnapshotPendingRoadEncounterUnresolved,
  assertSnapshotTravelPathContinuity,
  assertSnapshotVisitedTownTravelProof,
  expectedDiscoveredTownIds,
} from "../../src/world/session_snapshot_proofs.js";
import type { OverworldTravelTimelineIndex } from "../../src/world/session_snapshot_timeline.js";
import type { TravelLogEntrySnapshot } from "../../src/world/session_snapshot.js";

function travelEntry(
  edgeId: string,
  fromId: string,
  toId: string,
  arrivedAt: number,
): TravelLogEntrySnapshot {
  return {
    edgeId,
    fromId,
    toId,
    delayMinutes: 0,
    minutes: 60,
    arrivedAt,
    suppliesUsed: 1,
    suppliesAfter: 5,
    fatigueGained: 1,
    fatigueAfter: 1,
  };
}

function timeline(
  entries: readonly TravelLogEntrySnapshot[] = [travelEntry("road:a-b", "town_a", "town_b", 540)],
): OverworldTravelTimelineIndex {
  return {
    arrivals: new Set(entries.map((entry) => `${entry.edgeId}@${entry.arrivedAt}`)),
    arrivedTownIds: new Set(entries.map((entry) => entry.toId)),
    byArrival: new Map(entries.map((entry) => [`${entry.edgeId}@${entry.arrivedAt}`, entry])),
    latest: entries[entries.length - 1] ?? null,
    oldestFirst: entries,
    townByArrival: new Map(
      entries.map((entry) => [`${entry.edgeId}@${entry.arrivedAt}`, entry.toId]),
    ),
    townVisitMinutes: new Map([
      ["town_a", 480],
      ...entries.map((entry) => [entry.toId, entry.arrivedAt] as const),
    ]),
  };
}

describe("overworld snapshot travel and discovery proofs", () => {
  it("proves visited towns from travel arrivals and rejects missing visits", () => {
    const travelTimeline = timeline();

    expect(
      assertSnapshotVisitedTownTravelProof(new Set(["town_a", "town_b"]), travelTimeline),
    ).toBe(travelTimeline.townVisitMinutes);
    expect(() => assertSnapshotVisitedTownTravelProof(new Set(["town_a"]), travelTimeline)).toThrow(
      /travel arrival town "town_b" is missing from visited towns/,
    );
  });

  it("checks contiguous travel path and current town replay", () => {
    expect(() => assertSnapshotTravelPathContinuity("town_b", "town_a", timeline())).not.toThrow();
    expect(() =>
      assertSnapshotTravelPathContinuity(
        "town_b",
        "town_a",
        timeline([travelEntry("road:b-c", "town_b", "town_c", 540)]),
      ),
    ).toThrow(/not contiguous/);
    expect(() => assertSnapshotTravelPathContinuity("town_a", "town_a", timeline())).toThrow(
      /current town does not match travel history/,
    );
  });

  it("checks pending road encounter binding and unresolved proof", () => {
    const latestTravel = travelEntry("road:a-b", "town_a", "town_b", 540);

    expect(() =>
      assertSnapshotPendingRoadEncounterBinding(
        { edgeId: "road:a-b" },
        latestTravel,
        new Set(["road:a-b"]),
      ),
    ).not.toThrow();
    expect(() =>
      assertSnapshotPendingRoadEncounterBinding(
        { edgeId: "road:b-c" },
        latestTravel,
        new Set(["road:a-b"]),
      ),
    ).toThrow(/latest travel log road/);
    expect(() =>
      assertSnapshotPendingRoadEncounterUnresolved({ edgeId: "road:a-b" }, latestTravel, {
        byKey: new Map([["road:a-b@540", true]]),
      }),
    ).toThrow(/already has a road journal resolution/);
  });

  it("derives and validates the discovered town frontier", () => {
    const roadExitsByTown = new Map([
      ["town_a", [{ destination: { id: "town_b" } }]],
      ["town_b", [{ destination: { id: "town_c" } }]],
    ]);

    expect([...expectedDiscoveredTownIds(roadExitsByTown, new Set(["town_a"]))]).toEqual([
      "town_a",
      "town_b",
    ]);
    expect(() =>
      assertSnapshotDiscoveredTownFrontier(
        new Set(["town_a", "town_b"]),
        roadExitsByTown,
        new Set(["town_a"]),
      ),
    ).not.toThrow();
    expect(() =>
      assertSnapshotDiscoveredTownFrontier(
        new Set(["town_a", "town_b", "town_c"]),
        roadExitsByTown,
        new Set(["town_a"]),
      ),
    ).toThrow(/outside the visited frontier/);
  });

  it("requires discovered area and local source prefixes", () => {
    expect(() =>
      assertSnapshotDiscoveredAreaPrefix(
        new Map([["town_a", [{ id: "area_a" }, { id: "area_b" }]]]),
        new Set(["area_b"]),
        new Set(["town_a"]),
      ),
    ).toThrow(/discovered area "area_b" skips an earlier area/);
    expect(() =>
      assertSnapshotDiscoveredLocalSourcePrefixes(
        {
          discoveredAreaIds: new Set(["area_a"]),
          discoveredJobIds: new Set(["job_b"]),
          discoveredQuestIds: new Set(),
          discoveredSiteIds: new Set(),
          jobsByTown: new Map([
            [
              "town_a",
              [
                { id: "job_a", area: "area_a" },
                { id: "job_b", area: "area_a" },
              ],
            ],
          ]),
          questsByTown: new Map(),
          sitesByArea: new Map(),
        },
        new Set(["town_a"]),
      ),
    ).toThrow(/discovered job "job_b" skips an earlier job/);
  });

  it("checks current location manifest bindings", () => {
    const indexes = {
      nodeIds: new Set(["town_a", "town_b"]),
      areaIds: new Set(["area_a", "area_b"]),
      areaHomes: new Map([
        ["area_a", "town_a"],
        ["area_b", "town_b"],
      ]),
    };

    expect(() =>
      assertSnapshotCurrentLocationManifestBinding(
        { currentId: "town_a", currentAreaId: "area_a" },
        indexes,
      ),
    ).not.toThrow();
    expect(() =>
      assertSnapshotCurrentLocationManifestBinding(
        { currentId: "missing_town", currentAreaId: null },
        indexes,
      ),
    ).toThrow(/unknown current town/);
    expect(() =>
      assertSnapshotCurrentLocationManifestBinding(
        { currentId: "town_a", currentAreaId: "missing_area" },
        indexes,
      ),
    ).toThrow(/unknown current area/);
    expect(() =>
      assertSnapshotCurrentLocationManifestBinding(
        { currentId: "town_a", currentAreaId: "area_b" },
        indexes,
      ),
    ).toThrow(/outside the current town/);
  });

  it("checks current town and area reachability", () => {
    expect(() =>
      assertSnapshotCurrentTownReachability("town_a", new Set(["town_a"]), new Set(["town_a"])),
    ).not.toThrow();
    expect(() =>
      assertSnapshotCurrentTownReachability("town_a", new Set(), new Set(["town_a"])),
    ).toThrow(/current town is not discovered/);
    expect(() =>
      assertSnapshotCurrentTownReachability("town_a", new Set(["town_a"]), new Set()),
    ).toThrow(/current town is not visited/);
    expect(() =>
      assertSnapshotCurrentAreaReachability("area_a", new Set(["area_a"])),
    ).not.toThrow();
    expect(() => assertSnapshotCurrentAreaReachability(null, new Set())).not.toThrow();
    expect(() => assertSnapshotCurrentAreaReachability("area_a", new Set())).toThrow(
      /current area is not discovered/,
    );
  });

  it("checks saved current area map consistency", () => {
    const areasByTown = new Map([["town_a", [{ id: "area_a" }]]]);

    expect(() =>
      assertSnapshotCurrentAreaMapExact(
        "town_a",
        "area_a",
        new Map([["town_a", "area_a"]]),
        areasByTown,
        new Set(["town_a"]),
      ),
    ).not.toThrow();
    expect(() =>
      assertSnapshotCurrentAreaMapExact(
        "town_a",
        null,
        new Map([["town_a", "area_a"]]),
        areasByTown,
        new Set(["town_a"]),
      ),
    ).toThrow(/current area is missing/);
    expect(() =>
      assertSnapshotCurrentAreaMapExact(
        "town_a",
        "area_a",
        new Map(),
        areasByTown,
        new Set(["town_a"]),
      ),
    ).toThrow(/saved area map is missing visited town/);
  });

  it("checks saved current area map bindings against known and reached local state", () => {
    const indexes = {
      nodeIds: new Set(["town_a", "town_b"]),
      areaIds: new Set(["area_a", "area_b"]),
      areaHomes: new Map([
        ["area_a", "town_a"],
        ["area_b", "town_b"],
      ]),
    };

    expect(() =>
      assertSnapshotCurrentAreaMapBindings(
        new Map([["town_a", "area_a"]]),
        indexes,
        new Set(["town_a"]),
        new Set(["area_a"]),
      ),
    ).not.toThrow();
    expect(() =>
      assertSnapshotCurrentAreaMapBindings(
        new Map([["missing_town", "area_a"]]),
        indexes,
        new Set(["missing_town"]),
        new Set(["area_a"]),
      ),
    ).toThrow(/unknown area-map town/);
    expect(() =>
      assertSnapshotCurrentAreaMapBindings(
        new Map([["town_a", "missing_area"]]),
        indexes,
        new Set(["town_a"]),
        new Set(["missing_area"]),
      ),
    ).toThrow(/unknown saved area/);
    expect(() =>
      assertSnapshotCurrentAreaMapBindings(
        new Map([["town_a", "area_b"]]),
        indexes,
        new Set(["town_a"]),
        new Set(["area_b"]),
      ),
    ).toThrow(/outside "town_a"/);
    expect(() =>
      assertSnapshotCurrentAreaMapBindings(
        new Map([["town_a", "area_a"]]),
        indexes,
        new Set(),
        new Set(["area_a"]),
      ),
    ).toThrow(/saved area town "town_a" is not visited/);
    expect(() =>
      assertSnapshotCurrentAreaMapBindings(
        new Map([["town_a", "area_a"]]),
        indexes,
        new Set(["town_a"]),
        new Set(),
      ),
    ).toThrow(/saved area "area_a" is not discovered/);
  });
});
