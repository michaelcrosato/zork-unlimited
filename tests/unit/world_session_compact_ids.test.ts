import { describe, expect, it } from "vitest";
import type { OverworldNode } from "../../src/world/overworld.js";
import { compactOverworldSessionIdPayload } from "../../src/world/session_compact_ids.js";

function town(id: string, population: number): OverworldNode {
  return {
    id,
    name: id.toUpperCase(),
    kind: "city",
    source_geography: "incorporated_place",
    geoid: id,
    county_fips: "001",
    population_2025: population,
    lat: 42,
    lon: -73,
    region: "Capital",
    services: [],
    description: "A test town.",
  };
}

function ids(prefix: string, count: number): string[] {
  const values: string[] = [];
  for (let index = 0; index < count; index += 1) {
    values.push(`${prefix}:${String(index).padStart(2, "0")}`);
  }
  return values;
}

describe("overworld session compact ids", () => {
  it("packs bounded ids with full counts and truncation metadata", () => {
    const townIds = ids("town", 18);
    const nodes = new Map<string, OverworldNode>();
    townIds.forEach((id, index) => nodes.set(id, town(id, 10_000 + index)));

    const payload = compactOverworldSessionIdPayload({
      discoveredIds: new Set(townIds),
      nodes,
      discoveredAreaIds: new Set(ids("area", 3)),
      visitedAreaIds: new Set(ids("area", 2)),
      discoveredJobIds: new Set(ids("job", 17)),
      completedJobIds: new Set(["job:02"]),
      discoveredSiteIds: new Set(ids("site", 1)),
      exploredSiteIds: new Set<string>(),
      discoveredQuestIds: new Set(ids("quest", 2)),
      startedQuestIds: new Set(["quest:01"]),
      completedQuestIds: new Set<string>(),
      resolvedEventIds: new Set(["event:b", "event:a"]),
    });

    expect(payload.ids.discovered_towns).toEqual(townIds.slice().reverse().slice(0, 16));
    expect(payload.ids.discovered_jobs).toHaveLength(16);
    expect(payload.id_counts).toEqual([18, 3, 2, 17, 1, 1, 0, 2, 1, 0, 2]);
    expect(payload.ids_truncated).toEqual(["discovered_towns", "discovered_jobs"]);
    expect(payload.ids.resolved_events).toEqual(["event:a", "event:b"]);
    expect(payload.ids.explored_sites).toBeUndefined();
  });
});
