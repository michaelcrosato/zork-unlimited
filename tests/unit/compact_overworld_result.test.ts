import { describe, expect, it } from "vitest";

import {
  compactOverworldActionResult,
  compactOverworldAreaTravelResult,
  compactOverworldQuestCompletionResult,
  compactOverworldRoadEncounterResult,
  compactOverworldTravelResult,
  OVERWORLD_COMPACT_ACTION_TEXT_CHAR_LIMIT,
  OVERWORLD_COMPACT_ROAD_ENCOUNTER_TEXT_CHAR_LIMIT,
} from "../../src/mcp/compact_overworld_result.js";
import {
  OVERWORLD_COMPACT_LABEL_CHAR_LIMIT,
  OVERWORLD_COMPACT_LOCAL_REF_LIMIT,
  OVERWORLD_COMPACT_ROAD_EVENT_SUMMARY_CHAR_LIMIT,
  OVERWORLD_COMPACT_TITLE_CHAR_LIMIT,
} from "../../src/world/compact_view.js";
import type {
  OverworldActionResult,
  OverworldAreaTravelResult,
  OverworldQuestCompletionResult,
  OverworldRoadEncounterResult,
  TravelLogEntry,
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
    expect(compact.text).toBe("Verbose entry text");
  });

  it("preserves immediate action prose under a transparent hard cap", () => {
    const verboseText = `The contact says ${"specific consequence ".repeat(40)}`;
    const result: OverworldActionResult = {
      minutes: 15,
      alreadyKnown: false,
      entry: {
        id: "talk:contact",
        kind: "contact",
        town: "Albany city",
        title: "Talked to Rowan Quill",
        text: verboseText,
        recordedAt: "Day 1, 08:15",
      },
      discoveredAreas: [],
      discoveredJobs: [],
      discoveredSites: [],
      discoveredQuests: [],
    };

    const compact = compactOverworldActionResult(result);

    expect(compact.text).not.toBe(verboseText);
    expect(compact.text).toHaveLength(OVERWORLD_COMPACT_ACTION_TEXT_CHAR_LIMIT);
    expect(compact.text).toMatch(/\.\.\.\(\+\d+ chars\)$/);
    expect(compact.text).toContain("The contact says");
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
      renownRegion: "Capital Region",
      renownGained: 8,
      renownAfter: 15,
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
    expect(compact.renown).toEqual(["Capital Region", 8, 15]);
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

describe("compactOverworldRoadEncounterResult", () => {
  it("keeps the player-facing road scene, labels, and bounded chosen consequence", () => {
    const verboseText = `The chosen road consequence ${"keeps unfolding ".repeat(60)}`;
    const optionOutcome = "You spend stores and pull the stranded travelers clear.";
    const result: OverworldRoadEncounterResult = {
      strategy: "assist_travelers",
      minutes: 40,
      suppliesUsed: 1,
      fatigueGained: 1,
      renownGained: 2,
      encounter: {
        id: "road:albany-colonie:600",
        edgeId: "road_albany_colonie",
        from: "Albany city",
        to: "Colonie town",
        route: "I-90 / New York State Thruway",
        arrivedAt: "Day 1, 10:00",
        timing: "On the road from Albany city to Colonie town.",
        event: {
          id: "road_event_albany_colonie",
          edge: "road_albany_colonie",
          title: "Thruway shoulder flare-up",
          risk: "low",
          summary: "A jackknifed box truck narrows the shoulder behind state-police flares.",
        },
        options: [
          {
            strategy: "assist_travelers",
            label: "Help clear the shoulder",
            minutes: 40,
            suppliesCost: 1,
            fatigueGained: 1,
            renownGained: 2,
            outcome: optionOutcome,
          },
        ],
      },
      entry: {
        id: "road:albany-colonie:600:assist_travelers",
        kind: "road",
        town: "Colonie town",
        title: "Help clear the shoulder: Thruway shoulder flare-up",
        text: verboseText,
        recordedAt: "Day 1, 10:40",
      },
    };

    const compact = compactOverworldRoadEncounterResult(result);

    expect(compact.encounter.route).toBe(result.encounter.route);
    expect(compact.encounter.event).toEqual([
      result.encounter.event.id,
      result.encounter.event.risk,
      result.encounter.event.title,
      result.encounter.event.summary,
    ]);
    expect(compact.encounter.options[0]).toEqual([
      "assist_travelers",
      "Help clear the shoulder",
      40,
      1,
      1,
      2,
    ]);
    expect(JSON.stringify(compact.encounter)).not.toContain(optionOutcome);
    expect(compact.text).not.toBe(verboseText);
    expect(compact.text).toHaveLength(OVERWORLD_COMPACT_ROAD_ENCOUNTER_TEXT_CHAR_LIMIT);
    expect(compact.text).toMatch(/\.\.\.\(\+\d+ chars\)$/);
  });
});

describe("compactOverworldTravelResult", () => {
  it("adds bounded immediate road-scene prose without changing the log-compatible prefix", () => {
    const longTitle = `A road scene ${"title ".repeat(40)}`;
    const longSummary = `A specific roadside consequence ${"keeps unfolding ".repeat(40)}`;
    const result: TravelLogEntry = {
      edgeId: "road_albany_colonie",
      fromId: "albany_city",
      toId: "colonie_town",
      from: "Albany city",
      to: "Colonie town",
      route: "I-90 / New York State Thruway",
      distanceMi: 7.1,
      baseMinutes: 9,
      delayMinutes: 4,
      minutes: 13,
      arrivedAt: 613,
      suppliesUsed: 1,
      suppliesAfter: 7,
      fatigueGained: 2,
      fatigueAfter: 2,
      roadEvent: {
        id: "road_event_albany_colonie",
        edge: "road_albany_colonie",
        risk: "medium",
        title: longTitle,
        summary: longSummary,
      },
    };

    const compact = compactOverworldTravelResult(result);

    expect(compact.slice(0, 7)).toEqual([
      result.edgeId,
      result.fromId,
      result.toId,
      result.minutes,
      result.suppliesUsed,
      result.fatigueGained,
      result.roadEvent?.id,
    ]);
    expect(compact[7]).toBe("medium");
    expect(compact[8]).not.toBe(longTitle);
    expect(compact[8]).toHaveLength(OVERWORLD_COMPACT_TITLE_CHAR_LIMIT);
    expect(compact[9]).not.toBe(longSummary);
    expect(compact[9]).toHaveLength(OVERWORLD_COMPACT_ROAD_EVENT_SUMMARY_CHAR_LIMIT);
  });

  it("uses explicit null scene fields for travel without a road event", () => {
    const result = {
      edgeId: "road_a_b",
      fromId: "a",
      toId: "b",
      from: "A",
      to: "B",
      route: "Plain road",
      distanceMi: 1,
      baseMinutes: 5,
      delayMinutes: 0,
      minutes: 5,
      arrivedAt: 605,
      suppliesUsed: 0,
      suppliesAfter: 8,
      fatigueGained: 0,
      fatigueAfter: 0,
      roadEvent: null,
    } satisfies TravelLogEntry;

    expect(compactOverworldTravelResult(result).slice(6)).toEqual([null, null, null, null]);
  });
});
