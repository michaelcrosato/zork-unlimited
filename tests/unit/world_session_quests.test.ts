import { describe, expect, it } from "vitest";
import { createInitialCampaignCharacterState } from "../../src/world/campaign_character_state.js";
import type { OverworldArea, OverworldNode, OverworldQuest } from "../../src/world/overworld.js";
import {
  applyOverworldQuestCompletion,
  applyOverworldQuestStart,
  planOverworldQuestCompletion,
  planOverworldQuestStart,
  questCompletionMinutes,
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

function catalogedQuest(): OverworldQuest {
  return {
    ...quest("wolf_winter"),
    campaign_exports: [
      {
        ending_id: "ending_gate_barred",
        ending_title: "The Gate Barred",
        effects: [
          {
            type: "remember_relationship",
            npc_id: "npc:old_cade",
            memory_id: "memory:wolf_winter_gate_barred",
            trust_at_least: 10,
            regard_at_least: 9,
            owes_player_at_least: 1,
          },
          { type: "set_world_fact", fact_id: "fact:wolf_winter_gate_barred" },
        ],
      },
    ],
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
    const areasById = new Map([[lead.area, area(lead.area, "Old Market")]]);
    const minutes = questCompletionMinutes(lead, areasById);

    expect(
      planOverworldQuestCompletion({
        questId: lead.id,
        outcome: {
          endingId: "ending_victory",
          endingTitle: "Victory",
          death: false,
        },
        character: createInitialCampaignCharacterState(),
        questsById: new Map([[lead.id, lead]]),
        areasById,
        nodesById: new Map([[lead.home, node(lead.home, "Alden")]]),
        questOutcomeIds: new Map(),
        startedQuestIds,
      }),
    ).toEqual({
      minutes,
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
      characterAfter: createInitialCampaignCharacterState(),
      worldFactIds: [],
      renownRegion: "Test Region",
      renown: 8,
      entryDraft: {
        id: `quest_done:${lead.id}`,
        kind: "quest_done",
        town: "Alden",
        title: `Completed ${lead.title}`,
        text: `The quest closed at Victory after ${minutes} minutes of local work.`,
      },
    });
    expect([...startedQuestIds]).toEqual([lead.id]);
    expect(minutes).toBe(140);
  });

  it("applies quest completion into lifecycle state", () => {
    const lead = quest("lost_letter", "market", "town_a");
    const areasById = new Map([[lead.area, area(lead.area, "Old Market")]]);
    const plan = planOverworldQuestCompletion({
      questId: lead.id,
      outcome: {
        endingId: "ending_victory",
        endingTitle: "Victory",
        death: false,
      },
      character: createInitialCampaignCharacterState(),
      questsById: new Map([[lead.id, lead]]),
      areasById,
      nodesById: new Map([[lead.home, node(lead.home, "Alden")]]),
      questOutcomeIds: new Map(),
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
      character: createInitialCampaignCharacterState(),
      questsById: new Map([[lead.id, lead]]),
      areasById: new Map([[lead.area, area(lead.area, "Old Market")]]),
      nodesById: new Map([[lead.home, node(lead.home, "Alden")]]),
      questOutcomeIds: new Map<string, string>(),
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

  it("plans a declared campaign export transactionally from its canonical ending", () => {
    const lead = catalogedQuest();
    const character = createInitialCampaignCharacterState();
    const state = {
      questId: lead.id,
      outcome: {
        endingId: "ending_gate_barred",
        endingTitle: "The Gate Barred",
        death: false,
      },
      character,
      questsById: new Map([[lead.id, lead]]),
      areasById: new Map([[lead.area, area(lead.area)]]),
      nodesById: new Map([[lead.home, node(lead.home)]]),
      questOutcomeIds: new Map<string, string>(),
      startedQuestIds: new Set([lead.id]),
    };

    const plan = planOverworldQuestCompletion(state);

    expect(plan.endingTitle).toBe("The Gate Barred");
    expect(plan.characterAfter.relationships).toEqual([
      {
        npcId: "npc:old_cade",
        trust: 10,
        regard: 9,
        owesPlayer: 1,
        playerOwes: 0,
        memories: ["memory:wolf_winter_gate_barred"],
      },
    ]);
    expect(plan.worldFactIds).toEqual(["fact:wolf_winter_gate_barred"]);
    expect(character).toEqual(createInitialCampaignCharacterState());
  });

  it("rejects undeclared, mislabeled, death, and replacement outcomes for cataloged quests", () => {
    const lead = catalogedQuest();
    const state = {
      questId: lead.id,
      outcome: {
        endingId: "ending_gate_barred",
        endingTitle: "The Gate Barred",
        death: false,
      },
      character: createInitialCampaignCharacterState(),
      questsById: new Map([[lead.id, lead]]),
      areasById: new Map([[lead.area, area(lead.area)]]),
      nodesById: new Map([[lead.home, node(lead.home)]]),
      questOutcomeIds: new Map<string, string>(),
      startedQuestIds: new Set([lead.id]),
    };

    expect(() =>
      planOverworldQuestCompletion({
        ...state,
        outcome: { ...state.outcome, endingId: "ending_unknown" },
      }),
    ).toThrow(/no declared campaign export/);
    expect(() =>
      planOverworldQuestCompletion({
        ...state,
        outcome: { ...state.outcome, endingTitle: "A Forged Title" },
      }),
    ).toThrow(/expected canonical title/);
    expect(() =>
      planOverworldQuestCompletion({
        ...state,
        outcome: { ...state.outcome, death: true },
      }),
    ).toThrow(/death ending/);
    expect(() =>
      planOverworldQuestCompletion({
        ...state,
        questOutcomeIds: new Map([[lead.id, "ending_other"]]),
      }),
    ).toThrow(/cannot replace it/);

    expect(() =>
      planOverworldQuestCompletion({
        ...state,
        questOutcomeIds: new Map([[lead.id, state.outcome.endingId]]),
      }),
    ).not.toThrow();
  });
});
