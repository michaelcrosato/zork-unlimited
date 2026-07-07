import { describe, expect, it } from "vitest";
import type { OverworldArea, OverworldNode, OverworldQuest } from "../../src/world/overworld.js";
import {
  applyOverworldQuestCompletion,
  applyOverworldQuestStart,
  planOverworldQuestCompletion,
  planOverworldQuestStart,
} from "../../src/world/session_quests.js";

function area(id: string, name = `${id} name`): OverworldArea {
  return {
    id,
    home: "town_a",
    name,
    kind: "civic_core",
    summary: `${id} summary`,
    discovery: `${id} discovery`,
    travel_minutes: 20,
    services: [],
  };
}

function node(id: string, name = `${id} name`): OverworldNode {
  return {
    id,
    name,
    kind: "town",
    source_geography: "incorporated_place",
    geoid: id,
    county_fips: "001",
    population_2025: 10_000,
    lat: 0,
    lon: 0,
    region: "Test Region",
    services: [],
    description: `${id} description`,
  };
}

function quest(id = "lost_letter", areaId = "market", home = "town_a"): OverworldQuest {
  return {
    id,
    title: `${id} title`,
    source: `${id}_source`,
    home,
    area: areaId,
    discovery: `${id} discovery`,
    visibility: "local_notice_board",
  };
}

describe("overworld quest lifecycle planning", () => {
  it("plans quest start entries without mutating lifecycle sets", () => {
    const lead = quest();
    const startedQuestIds = new Set<string>();

    expect(
      planOverworldQuestStart({
        questId: lead.id,
        questsById: new Map([[lead.id, lead]]),
        areasById: new Map([[lead.area, area(lead.area, "Old Market")]]),
        currentTownId: lead.home,
        currentTownName: "Alden",
        currentAreaId: lead.area,
        discoveredQuestIds: new Set([lead.id]),
        startedQuestIds,
      }),
    ).toEqual({
      minutes: 0,
      quest: {
        id: lead.id,
        title: lead.title,
        home: lead.home,
        area: lead.area,
        discovery: lead.discovery,
        visibility: lead.visibility,
      },
      entryDraft: {
        id: `quest:${lead.id}`,
        kind: "quest",
        town: "Alden",
        title: `Started ${lead.title}`,
        text: `You turn the local lead "${lead.discovery}" into an active quest.`,
      },
    });
    expect([...startedQuestIds]).toEqual([]);
  });

  it("rejects quest start attempts before the local lead is startable", () => {
    const lead = quest();
    const questsById = new Map([[lead.id, lead]]);
    const areasById = new Map([[lead.area, area(lead.area, "Old Market")]]);
    const startableState = {
      questId: lead.id,
      questsById,
      areasById,
      currentTownId: lead.home,
      currentTownName: "Alden",
      currentAreaId: lead.area,
      discoveredQuestIds: new Set([lead.id]),
      startedQuestIds: new Set<string>(),
    };

    expect(() => planOverworldQuestStart({ ...startableState, questId: "missing_quest" })).toThrow(
      /not in this town/,
    );
    expect(() =>
      planOverworldQuestStart({ ...startableState, discoveredQuestIds: new Set() }),
    ).toThrow(/Discover that local quest lead/);
    expect(() =>
      planOverworldQuestStart({
        ...startableState,
        startedQuestIds: new Set([lead.id]),
      }),
    ).toThrow(/already been started/);
    expect(() =>
      planOverworldQuestStart({ ...startableState, currentAreaId: "other_area" }),
    ).toThrow(/Move to Old Market before starting/);
  });

  it("applies quest start into lifecycle state", () => {
    const lead = quest();
    const plan = planOverworldQuestStart({
      questId: lead.id,
      questsById: new Map([[lead.id, lead]]),
      areasById: new Map([[lead.area, area(lead.area, "Old Market")]]),
      currentTownId: lead.home,
      currentTownName: "Alden",
      currentAreaId: lead.area,
      discoveredQuestIds: new Set([lead.id]),
      startedQuestIds: new Set(),
    });
    const startedQuestIds = new Set<string>();

    expect(applyOverworldQuestStart({ startedQuestIds }, plan)).toEqual({ questId: lead.id });
    expect([...startedQuestIds]).toEqual([lead.id]);
  });

  it("plans quest completion entries without mutating completion state", () => {
    const lead = quest("lost_letter", "market", "town_a");
    const startedQuestIds = new Set([lead.id]);

    expect(
      planOverworldQuestCompletion({
        questId: lead.id,
        outcome: {
          endingId: "ending_victory",
          endingTitle: "Victory",
          death: false,
        },
        questsById: new Map([[lead.id, lead]]),
        nodesById: new Map([[lead.home, node(lead.home, "Alden")]]),
        startedQuestIds,
      }),
    ).toEqual({
      minutes: 0,
      quest: {
        id: lead.id,
        title: lead.title,
        home: lead.home,
        area: lead.area,
        discovery: lead.discovery,
        visibility: lead.visibility,
      },
      endingId: "ending_victory",
      endingTitle: "Victory",
      renownRegion: "Test Region",
      renown: 8,
      entryDraft: {
        id: `quest_done:${lead.id}`,
        kind: "quest_done",
        town: "Alden",
        title: `Completed ${lead.title}`,
        text: "The quest closed at Victory.",
      },
    });
    expect([...startedQuestIds]).toEqual([lead.id]);
  });

  it("applies quest completion into lifecycle state", () => {
    const lead = quest("lost_letter", "market", "town_a");
    const plan = planOverworldQuestCompletion({
      questId: lead.id,
      outcome: {
        endingId: "ending_victory",
        endingTitle: "Victory",
        death: false,
      },
      questsById: new Map([[lead.id, lead]]),
      nodesById: new Map([[lead.home, node(lead.home, "Alden")]]),
      startedQuestIds: new Set([lead.id]),
    });
    const completedQuestIds = new Set<string>();
    const regionRenown = new Map<string, number>([["Test Region", 3]]);

    expect(applyOverworldQuestCompletion({ completedQuestIds, regionRenown }, plan)).toEqual({
      questId: lead.id,
      renownRegion: "Test Region",
      renownGained: 8,
      renownAfter: 11,
    });
    expect([...completedQuestIds]).toEqual([lead.id]);
    // The marquee accomplishment must top any single job (difficulty 1-5).
    expect(plan.renown).toBeGreaterThan(5);
    expect(regionRenown.get("Test Region")).toBe(11);
  });

  it("rejects quest completion attempts that cannot close overworld progress", () => {
    const lead = quest();
    const completableState = {
      questId: lead.id,
      outcome: {
        endingId: "ending_victory",
        endingTitle: "Victory",
        death: false,
      },
      questsById: new Map([[lead.id, lead]]),
      nodesById: new Map([[lead.home, node(lead.home, "Alden")]]),
      startedQuestIds: new Set([lead.id]),
    };

    expect(() =>
      planOverworldQuestCompletion({ ...completableState, questId: "missing_quest" }),
    ).toThrow(/Unknown overworld quest/);
    expect(() =>
      planOverworldQuestCompletion({ ...completableState, startedQuestIds: new Set() }),
    ).toThrow(/Start that local quest lead/);
    expect(() =>
      planOverworldQuestCompletion({
        ...completableState,
        outcome: { endingId: "ending_fallen", endingTitle: "Fallen", death: true },
      }),
    ).toThrow(/death ending/);
  });
});
