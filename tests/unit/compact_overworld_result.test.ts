import { describe, expect, it } from "vitest";

import { compactOverworldActionResult } from "../../src/mcp/compact_overworld_result.js";
import { OVERWORLD_COMPACT_LOCAL_REF_LIMIT } from "../../src/world/compact_view.js";
import type { OverworldActionResult } from "../../src/world/session.js";

function refs(count: number): { id: string; name: string; title: string }[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `dense_${index}`,
    name: `Dense Name ${index}`,
    title: `Dense Title ${index}`,
  }));
}

describe("compactOverworldActionResult", () => {
  it("caps compact discovery buckets and reports truncated keys", () => {
    const dense = refs(OVERWORLD_COMPACT_LOCAL_REF_LIMIT + 2);
    const result: OverworldActionResult = {
      minutes: 10,
      alreadyKnown: false,
      entry: {
        id: "entry",
        kind: "area",
        town: "town",
        title: "Dense discovery",
        text: "Verbose entry text",
        recordedAt: "Day 1, 08:10",
      },
      discoveredAreas: dense,
      discoveredJobs: dense,
      discoveredSites: dense,
      discoveredQuests: dense.map((quest) => ({
        id: quest.id,
        title: quest.title,
        home: "home",
        area: "area",
        discovery: "lead",
        visibility: "local",
      })),
    } as unknown as OverworldActionResult;

    const compact = compactOverworldActionResult(result);

    expect(compact.areas).toHaveLength(OVERWORLD_COMPACT_LOCAL_REF_LIMIT);
    expect(compact.jobs).toHaveLength(OVERWORLD_COMPACT_LOCAL_REF_LIMIT);
    expect(compact.sites).toHaveLength(OVERWORLD_COMPACT_LOCAL_REF_LIMIT);
    expect(compact.quests).toHaveLength(OVERWORLD_COMPACT_LOCAL_REF_LIMIT);
    expect(compact.discovered_truncated).toEqual(["areas", "jobs", "sites", "quests"]);
    expect(JSON.stringify(compact)).not.toContain("Verbose entry text");
  });
});
