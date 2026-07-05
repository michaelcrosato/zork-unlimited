import { describe, expect, it } from "vitest";

import {
  compactOverworldActionResult,
  compactOverworldAreaTravelResult,
  compactOverworldQuestCompletionResult,
} from "../../src/mcp/compact_overworld_result.js";
import {
  OVERWORLD_COMPACT_LABEL_CHAR_LIMIT,
  OVERWORLD_COMPACT_LOCAL_REF_LIMIT,
  OVERWORLD_COMPACT_TITLE_CHAR_LIMIT,
} from "../../src/world/compact_view.js";
import type {
  OverworldActionResult,
  OverworldAreaTravelResult,
  OverworldQuestCompletionResult,
} from "../../src/world/session.js";

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

  it("caps compact quest completion ending titles", () => {
    const longEndingTitle = `Victory ${"x".repeat(400)}`;
    const result: OverworldQuestCompletionResult = {
      minutes: 45,
      alreadyKnown: false,
      quest: {
        id: "quest:long",
        title: "Long Quest",
        home: "town",
        area: "area",
        discovery: "lead",
        visibility: "local_notice_board",
      },
      endingId: "ending:long",
      endingTitle: longEndingTitle,
      entry: {
        id: "entry",
        kind: "quest_done",
        town: "town",
        title: "Completed Long Quest",
        text: "Verbose entry text",
        recordedAt: "Day 1, 08:45",
      },
    };

    const compact = compactOverworldQuestCompletionResult(result);

    expect(compact.ending[0]).toBe("ending:long");
    expect(compact.ending[1]).not.toBe(longEndingTitle);
    expect(compact.ending[1]).toHaveLength(OVERWORLD_COMPACT_TITLE_CHAR_LIMIT);
    expect(JSON.stringify(compact)).not.toContain(longEndingTitle);
  });

  it("caps compact local area travel route labels", () => {
    const longRoute = `A long internal corridor ${"x".repeat(400)}`;
    const result: OverworldAreaTravelResult = {
      from: { id: "area:from", name: "From Area" } as OverworldAreaTravelResult["from"],
      to: { id: "area:to", name: "To Area" } as OverworldAreaTravelResult["to"],
      route: longRoute,
      minutes: 12,
      arrivedAt: "Day 1, 08:12",
    };

    const compact = compactOverworldAreaTravelResult(result);

    expect(compact.from).toEqual(["area:from", "From Area"]);
    expect(compact.to).toEqual(["area:to", "To Area"]);
    expect(compact.route).not.toBe(longRoute);
    expect(compact.route).toHaveLength(OVERWORLD_COMPACT_LABEL_CHAR_LIMIT);
    expect(JSON.stringify(compact)).not.toContain(longRoute);
  });
});
