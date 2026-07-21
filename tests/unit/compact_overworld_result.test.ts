import { describe, expect, it } from "vitest";

import {
  compactOverworldActionResult,
  compactOverworldAreaTravelResult,
  compactOverworldGoalPassageResult,
  compactOverworldJourneyStoryChoiceResult,
  compactOverworldQuestCompletionResult,
  compactOverworldRoadEncounterResult,
  compactOverworldServiceResult,
  compactOverworldTravelResult,
  OVERWORLD_COMPACT_ACTION_TEXT_CHAR_LIMIT,
  OVERWORLD_COMPACT_ROAD_ENCOUNTER_TEXT_CHAR_LIMIT,
  OVERWORLD_COMPACT_SERVICE_TEXT_CHAR_LIMIT,
} from "../../src/mcp/compact_overworld_result.js";
import {
  OVERWORLD_COMPACT_LABEL_CHAR_LIMIT,
  OVERWORLD_COMPACT_LOCAL_REF_LIMIT,
  OVERWORLD_COMPACT_ROAD_EVENT_SUMMARY_CHAR_LIMIT,
  OVERWORLD_COMPACT_ROUTE_STEP_LIMIT,
  OVERWORLD_COMPACT_TITLE_CHAR_LIMIT,
} from "../../src/world/compact_view.js";
import type {
  OverworldActionResult,
  OverworldAreaTravelResult,
  OverworldJourneyGoalPassageResult,
  OverworldJourneyStoryChoiceResult,
  OverworldQuestCompletionResult,
  OverworldRoadEncounterResult,
  OverworldServiceResult,
  TravelLogEntry,
} from "../../src/world/session.js";

function refs(count: number): { id: string; name: string; title: string }[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `dense_${index}`,
    name: `Dense Name ${index}`,
    title: `Dense Title ${index}`,
  }));
}

function storyChoiceResult(
  consequence: string,
  entryText = consequence,
): OverworldJourneyStoryChoiceResult {
  return {
    storyChoiceId: "albany:relief_registration",
    choiceId: "albany:road_warden",
    consequence,
    goal: {
      version: 1,
      id: "albany_local_lead",
      text: "Find one local lead in Albany and see it through.",
      status: "active",
      completedAtDecision: null,
    },
    entry: {
      id: "registration:albany:road_warden",
      kind: "registration",
      town: "Albany city",
      title: "Registered as a Road-Warden Relief Hand",
      text: entryText,
      recordedAt: "Day 1, 08:00",
      registrationBoundary: {
        acceptedDecisions: 1,
        decisionProofHash: "a".repeat(64),
        townId: "albany_city",
        areaId: "albany_civic_center",
        minutes: 480,
      },
    },
    journeyDecision: { countsTowardJourney: true, reason: "situation_changed" },
  };
}

describe("compactOverworldJourneyStoryChoiceResult", () => {
  it("keeps one authoritative opening consequence and redacts journal proof metadata", () => {
    const consequence = "The Road-Warden commission is now permanent.";
    const result = storyChoiceResult(consequence);
    const before = structuredClone(result);

    const compact = compactOverworldJourneyStoryChoiceResult(result);

    expect(compact).toEqual({
      storyChoiceId: result.storyChoiceId,
      choiceId: result.choiceId,
      consequence,
      goal: result.goal,
      entry: ["registration", "Registered as a Road-Warden Relief Hand", "Day 1, 08:00"],
      journeyDecision: result.journeyDecision,
    });
    expect(JSON.stringify(compact).match(new RegExp(consequence, "g"))).toHaveLength(1);
    expect(JSON.stringify(compact)).not.toContain("registrationBoundary");
    expect(JSON.stringify(compact)).not.toContain("a".repeat(64));
    expect(result).toEqual(before);
  });

  it("preserves distinct campaign journal prose without truncating either receipt", () => {
    const consequence = `The selected consequence ${"remains complete ".repeat(40)}`;
    const entryText = `A distinct next-goal journal entry ${"also remains complete ".repeat(40)}`;

    const compact = compactOverworldJourneyStoryChoiceResult(
      storyChoiceResult(consequence, entryText),
    );

    expect(compact.consequence).toBe(consequence);
    expect(compact.entry_text).toBe(entryText);
    expect(JSON.stringify(compact)).not.toMatch(/\.\.\.\(\+\d+ chars\)/);
  });
});

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

describe("compactOverworldServiceResult", () => {
  it("preserves the one-time service cause under a transparent hard cap", () => {
    const message = `Because the retained timber released these stores, ${"specific consequence ".repeat(30)}`;
    const result: OverworldServiceResult = {
      action: "resupply",
      minutes: 15,
      changed: true,
      suppliesBefore: 2,
      suppliesAfter: 8,
      fatigueBefore: 12,
      fatigueAfter: 12,
      message,
      entry: {
        id: "service:resupply:615",
        kind: "service",
        town: "Albany city",
        title: "Reclaim the Unused Repair-Wagon Stores",
        text: message,
        recordedAt: "Day 1, 10:15",
      },
    };

    const compact = compactOverworldServiceResult(result);

    expect(compact).toMatchObject({
      action: "resupply",
      m: 15,
      changed: true,
      supplies: [2, 8],
      fatigue: [12, 12],
      entry: ["service", "Reclaim the Unused Repair-Wagon Stores", "Day 1, 10:15"],
    });
    expect(compact.text).toContain("Because the retained timber released these stores");
    expect(compact.text).toHaveLength(OVERWORLD_COMPACT_SERVICE_TEXT_CHAR_LIMIT);
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

describe("compactOverworldGoalPassageResult", () => {
  it("bounds labels and emits only compact tuples for legs that were actually traversed", () => {
    const traversed = Array.from(
      { length: OVERWORLD_COMPACT_ROUTE_STEP_LIMIT + 2 },
      (_, index) => ({
        edgeId: `road_${index}`,
        fromId: `town_${index}`,
        toId: `town_${index + 1}`,
        from: `Town ${index}`,
        to: `Town ${index + 1}`,
        route: `Route ${index}`,
        distanceMi: 10,
        baseMinutes: 30,
        delayMinutes: 0,
        minutes: 30,
        arrivedAt: 600 + index * 30,
        suppliesUsed: 1,
        suppliesAfter: Math.max(0, 7 - index),
        fatigueGained: 1,
        fatigueAfter: index + 1,
        roadEvent:
          index === OVERWORLD_COMPACT_ROUTE_STEP_LIMIT + 1
            ? {
                id: "event_stopping_leg",
                edge: `road_${index}`,
                risk: "low" as const,
                title: "The scene that stopped the passage",
                summary: "This scene happened on the accepted passage.",
              }
            : null,
      }),
    );
    const result = {
      goalId: "goal_visible_to_player",
      destination: `Destination ${"x".repeat(400)}`,
      stoppedAt: `Stopped ${"y".repeat(400)}`,
      stopReason: "resource_boundary",
      legs: traversed,
      baseMinutes: 420,
      delayMinutes: 30,
      minutes: 450,
      suppliesUsed: 8,
      suppliesAfter: 0,
      fatigueGained: 18,
      fatigueAfter: 61,
      travelConditionAfter: "worn down and out of supplies",
      journeyDecision: { countsTowardJourney: true, reason: "movement" },
      plannedLegs: [{ edgeId: "future_secret_road", eventTitle: "Future secret scene" }],
    } as OverworldJourneyGoalPassageResult & {
      plannedLegs: { edgeId: string; eventTitle: string }[];
    };

    const compact = compactOverworldGoalPassageResult(result);

    expect(compact).toMatchObject({
      goal_id: result.goalId,
      stop_reason: "resource_boundary",
      minutes: [420, 30, 450],
      supplies: [8, 0],
      fatigue: [18, 61],
      travel_condition: "worn down and out of supplies",
      legs_truncated: true,
    });
    expect(compact.destination).toHaveLength(OVERWORLD_COMPACT_LABEL_CHAR_LIMIT);
    expect(compact.stopped_at).toHaveLength(OVERWORLD_COMPACT_LABEL_CHAR_LIMIT);
    expect(compact.legs).toHaveLength(OVERWORLD_COMPACT_ROUTE_STEP_LIMIT);
    // The newest legs survive truncation: the stopping leg's scene tuple is present and
    // only the oldest traversed history (road_0, road_1) drops.
    const stoppingIndex = OVERWORLD_COMPACT_ROUTE_STEP_LIMIT + 1;
    expect(compact.legs[0]?.slice(0, 3)).toEqual(["road_2", "town_2", "town_3"]);
    expect(compact.legs.at(-1)?.slice(0, 9)).toEqual([
      `road_${stoppingIndex}`,
      `town_${stoppingIndex}`,
      `town_${stoppingIndex + 1}`,
      30,
      1,
      1,
      "event_stopping_leg",
      "low",
      "The scene that stopped the passage",
    ]);
    expect(JSON.stringify(compact)).not.toMatch(/road_0\b|road_1\b/);
    expect(JSON.stringify(compact)).not.toMatch(/future_secret_road|Future secret scene/);
  });
});
