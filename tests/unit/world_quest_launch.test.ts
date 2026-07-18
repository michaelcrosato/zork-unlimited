import { describe, expect, it } from "vitest";

import {
  createInitialCampaignCharacterState,
  serializeCampaignCharacterState,
} from "../../src/world/campaign_character_state.js";
import {
  compactOverworldQuestRef,
  compactOverworldQuestStarts,
  OVERWORLD_COMPACT_VIEW_VERSION,
} from "../../src/world/compact_view.js";
import {
  assertOverworldIntegrity,
  type OverworldArea,
  type OverworldNode,
  type OverworldQuest,
} from "../../src/world/overworld.js";
import {
  OverworldQuestLaunchSchema,
  applyOverworldQuestLaunchOption,
  overworldQuestStartPreconditionFingerprint,
  presentOverworldQuestLaunch,
  projectOverworldQuestLaunchOption,
  type OverworldQuestLaunch,
} from "../../src/world/quest_launch.js";
import {
  planOverworldQuestCompletion,
  prepareOverworldQuestStart,
} from "../../src/world/session_quests.js";
import type { OverworldJournalEntry } from "../../src/world/session_snapshot.js";
import { cloneOverworldQuestView } from "../../src/world/session_result_clone.js";
import { loadOverworldManifest } from "../../src/world/source.js";

const LAUNCH: OverworldQuestLaunch = {
  version: 1,
  id: "test:hill_approach",
  prompt: "Choose the road into the hills.",
  options: [
    {
      id: "test:exposed_ridge",
      title: "Take the ridge",
      summary: "Fast, exposed, and tiring.",
      preview: "Spend one supply and arrive tired with a clear view.",
      consequence: "The open ridge reveals the weather but alarms the herd.",
      return_summary: "You returned by way of the exposed ridge.",
      terms: { minutes: 30, supplies: 1, fatigue: 25 },
      effects: [
        { type: "learn_knowledge", knowledge_id: "test:knowledge_exposed_ridge" },
        {
          type: "remember_relationship",
          npc_id: "test:dispatcher",
          memory_id: "test:memory_exposed_ridge",
        },
      ],
    },
    {
      id: "test:sheltered_stockway",
      title: "Take the stockway",
      summary: "Slow, sheltered, and quiet.",
      preview: "Spend two supplies and preserve your strength.",
      consequence: "The sheltered stockway conceals the weather and calms the herd.",
      return_summary: "You returned by way of the sheltered stockway.",
      terms: { minutes: 75, supplies: 2, fatigue: 10 },
      effects: [
        { type: "learn_knowledge", knowledge_id: "test:knowledge_sheltered_stockway" },
        {
          type: "remember_relationship",
          npc_id: "test:dispatcher",
          memory_id: "test:memory_sheltered_stockway",
        },
      ],
    },
  ],
};

describe("overworld quest launch", () => {
  it("projects disclosed costs and blocks unaffordable choices without clamping", () => {
    const ridge = projectOverworldQuestLaunchOption(LAUNCH.options[0]!, {
      minutes: 480,
      supplies: 6,
      fatigue: 0,
    });
    expect(ridge).toEqual({
      available: true,
      minutesAfter: 510,
      suppliesAfter: 5,
      fatigueAfter: 25,
      travelConditionAfter: "tired",
    });

    expect(
      projectOverworldQuestLaunchOption(LAUNCH.options[1]!, {
        minutes: 480,
        supplies: 1,
        fatigue: 0,
      }),
    ).toEqual({
      available: false,
      minutesAfter: 555,
      suppliesAfter: null,
      fatigueAfter: null,
      travelConditionAfter: null,
      blockedReason: "Requires 2 supplies; you have 1.",
    });
  });

  it("prepares one atomic launch transition and rejects absent or stale option input", () => {
    const quest: OverworldQuest = {
      id: "test_quest",
      title: "Test Quest",
      source: "test.yaml",
      home: "test_town",
      area: "test_area",
      discovery: "A dispatcher offers two roads.",
      visibility: "local_notice_board",
      launch: LAUNCH,
    };
    const area: OverworldArea = {
      id: quest.area,
      home: quest.home,
      name: "Test Yard",
      kind: "outskirts",
      summary: "A yard at the edge of town.",
      discovery: "The road reaches the yard.",
      travel_minutes: 10,
      services: [],
    };
    const character = createInitialCampaignCharacterState();
    const base = {
      questId: quest.id,
      minutes: 480,
      supplies: 6,
      fatigue: 0,
      character,
      questsById: new Map([[quest.id, quest]]),
      areasById: new Map([[area.id, area]]),
      currentTownId: quest.home,
      currentTownName: "Test Town",
      currentAreaId: quest.area,
      discoveredQuestIds: new Set([quest.id]),
      startedQuestIds: new Set<string>(),
    };

    expect(() => prepareOverworldQuestStart(base)).toThrow(/Choose an approach/);
    expect(() =>
      prepareOverworldQuestStart({ ...base, approachId: "test:missing_approach" }),
    ).toThrow(/Unknown quest launch approach/);

    const prepared = prepareOverworldQuestStart({
      ...base,
      approachId: "test:exposed_ridge",
    });
    expect(prepared).toMatchObject({
      approachId: "test:exposed_ridge",
      journeyActionId: "quest_start:test_quest:test:exposed_ridge",
      minutes: 30,
      minutesAfter: 510,
      suppliesBefore: 6,
      suppliesAfter: 5,
      fatigueBefore: 0,
      fatigueAfter: 25,
    });
    expect(prepared.quest.launch?.selected?.optionId).toBe("test:exposed_ridge");
    expect(character.knowledge).toEqual([]);

    expect(() =>
      prepareOverworldQuestStart({
        ...base,
        approachId: "test:sheltered_stockway",
        supplies: 1,
      }),
    ).toThrow("Requires 2 supplies; you have 1.");

    const optionless = { ...quest };
    delete optionless.launch;
    expect(() =>
      prepareOverworldQuestStart({
        ...base,
        questsById: new Map([[optionless.id, optionless]]),
        approachId: "test:exposed_ridge",
      }),
    ).toThrow(/does not offer a launch approach/);
  });

  it("carries the proven approach return summary into quest completion copy", () => {
    const quest: OverworldQuest = {
      id: "test_quest",
      title: "Test Quest",
      source: "test.yaml",
      home: "test_town",
      area: "test_area",
      discovery: "A dispatcher offers two roads.",
      visibility: "local_notice_board",
      launch: LAUNCH,
    };
    const area: OverworldArea = {
      id: quest.area,
      home: quest.home,
      name: "Test Yard",
      kind: "outskirts",
      summary: "A yard at the edge of town.",
      discovery: "The road reaches the yard.",
      travel_minutes: 10,
      services: [],
    };
    const node: OverworldNode = {
      id: quest.home,
      name: "Test Town",
      kind: "town",
      source_geography: "incorporated_place",
      geoid: "0000000",
      county_fips: "000",
      population_2025: 10_000,
      lat: 0,
      lon: 0,
      region: "Test Region",
      services: [],
      description: "A test town.",
    };
    const startEntry: OverworldJournalEntry = {
      id: `quest:${quest.id}`,
      kind: "quest",
      town: node.name,
      title: `Started ${quest.title}`,
      text: "Started by the sheltered stockway.",
      recordedAt: "Day 1, 09:15",
      questStartProof: {
        kind: "approach",
        approachId: "test:sheltered_stockway",
        boundary: {
          acceptedDecisions: 1,
          decisionProofHash: "0".repeat(64),
          townId: node.id,
          areaId: area.id,
          minutes: 555,
        },
      },
    };
    const plan = planOverworldQuestCompletion({
      questId: quest.id,
      outcome: { endingId: "test_ending", endingTitle: "Test Ending", death: false },
      character: createInitialCampaignCharacterState(),
      questsById: new Map([[quest.id, quest]]),
      areasById: new Map([[area.id, area]]),
      nodesById: new Map([[node.id, node]]),
      questOutcomeIds: new Map(),
      startedQuestIds: new Set([quest.id]),
      journalEntriesById: new Map([[startEntry.id, startEntry]]),
    });

    expect(plan.entryDraft.text).toBe(
      "The quest closed at Test Ending after 130 minutes of local work. " +
        LAUNCH.options[1]!.return_summary,
    );

    const legacyPlan = planOverworldQuestCompletion({
      questId: quest.id,
      outcome: { endingId: "test_ending", endingTitle: "Test Ending", death: false },
      character: createInitialCampaignCharacterState(),
      questsById: new Map([[quest.id, quest]]),
      areasById: new Map([[area.id, area]]),
      nodesById: new Map([[node.id, node]]),
      questOutcomeIds: new Map(),
      startedQuestIds: new Set([quest.id]),
      journalEntriesById: new Map([
        [
          startEntry.id,
          {
            ...startEntry,
            questStartProof: {
              kind: "legacy",
              sourceWorldHash: "1".repeat(64),
              boundary: { ...startEntry.questStartProof!.boundary },
            },
          },
        ],
      ]),
    });
    expect(legacyPlan.entryDraft.text).toBe(
      "The quest closed at Test Ending after 130 minutes of local work.",
    );
  });

  it("applies only the authored character effects to a detached character", () => {
    const character = createInitialCampaignCharacterState();
    const before = serializeCampaignCharacterState(character);
    const applied = applyOverworldQuestLaunchOption({
      launch: LAUNCH,
      approachId: "test:exposed_ridge",
      character,
      resources: { minutes: 480, supplies: 6, fatigue: 0 },
    });

    expect(serializeCampaignCharacterState(character)).toBe(before);
    expect(applied.characterAfter.knowledge).toContain("test:knowledge_exposed_ridge");
    expect(applied.characterAfter.relationships).toContainEqual({
      npcId: "test:dispatcher",
      trust: 0,
      regard: 0,
      owesPlayer: 0,
      playerOwes: 0,
      memories: ["test:memory_exposed_ridge"],
    });
    expect(applied.projection.suppliesAfter).toBe(5);
  });

  it("presents and compacts launch choices without exposing persistent effect ids", () => {
    const launch = presentOverworldQuestLaunch(
      LAUNCH,
      { minutes: 480, supplies: 6, fatigue: 0 },
      "test:exposed_ridge",
    );
    expect(launch.options[0]).not.toHaveProperty("effects");
    expect(launch.options[0]).not.toHaveProperty("return_summary");
    expect(launch.selected).toMatchObject({
      optionId: "test:exposed_ridge",
      suppliesBefore: 6,
      suppliesAfter: 5,
    });
    const cloned = cloneOverworldQuestView({
      id: "test_quest",
      title: "Test Quest",
      home: "test_town",
      area: "test_area",
      discovery: "Two roads are available.",
      visibility: "local_notice_board",
      launch,
    });
    expect(cloned.launch).not.toBe(launch);
    expect(cloned.launch?.options).not.toBe(launch.options);
    expect(cloned.launch?.options[0]?.terms).not.toBe(launch.options[0]?.terms);
    expect(cloned.launch?.options[0]?.projection).not.toBe(launch.options[0]?.projection);

    expect(
      compactOverworldQuestRef({
        id: "test_quest",
        title: "Test Quest",
        area: "test_area",
        launch,
      }),
    ).toEqual([
      "test_quest",
      "Test Quest",
      "test_area",
      [
        "test:hill_approach",
        "Choose the road into the hills.",
        expect.arrayContaining([
          [
            "test:exposed_ridge",
            "Take the ridge",
            30,
            1,
            25,
            true,
            510,
            5,
            25,
            "tired",
            null,
            LAUNCH.options[0]!.preview,
            LAUNCH.options[0]!.consequence,
          ],
        ]),
        "test:exposed_ridge",
      ],
    ]);
    expect(OVERWORLD_COMPACT_VIEW_VERSION).toBe(19);

    const blocked = compactOverworldQuestRef({
      id: "test_quest",
      title: "Test Quest",
      area: "test_area",
      launch: presentOverworldQuestLaunch(LAUNCH, {
        minutes: 480,
        supplies: 1,
        fatigue: 0,
      }),
    });
    expect(blocked[3]?.[2][1]?.[5]).toBe(false);
    expect(blocked[3]?.[2][1]?.[10]).toBe("Requires 2 supplies; you have 1.");
  });

  it("clones authoritative quest-start tuples without inventing transport choices", () => {
    const source = [
      ["test_quest", "test:exposed_ridge"],
      ["optionless", null],
    ] as const;
    const projected = compactOverworldQuestStarts(source);
    expect(projected).toEqual(source);
    expect(projected).not.toBe(source);
    expect(projected[0]).not.toBe(source[0]);
  });

  it("rejects non-launch effects and fingerprints the exact approach precondition", () => {
    const invalid = structuredClone(LAUNCH) as unknown as Record<string, unknown>;
    const options = invalid.options as Array<Record<string, unknown>>;
    options[0]!.effects = [{ type: "set_world_fact", fact_id: "test:forbidden_fact" }];
    expect(() => OverworldQuestLaunchSchema.parse(invalid)).toThrow();

    const scoredMemory = structuredClone(LAUNCH) as unknown as Record<string, unknown>;
    const scoredOptions = scoredMemory.options as Array<Record<string, unknown>>;
    const effects = scoredOptions[0]!.effects as Array<Record<string, unknown>>;
    effects[1]!.trust_at_least = 1;
    expect(() => OverworldQuestLaunchSchema.parse(scoredMemory)).toThrow();

    const duplicateOption = structuredClone(LAUNCH);
    duplicateOption.options[1]!.id = duplicateOption.options[0]!.id;
    expect(() => OverworldQuestLaunchSchema.parse(duplicateOption)).toThrow(
      /Duplicate quest launch option id/,
    );

    const character = createInitialCampaignCharacterState();
    const base = {
      questId: "test_quest",
      launch: LAUNCH,
      currentTownId: "test_town",
      currentAreaId: "test_area",
      minutes: 480,
      supplies: 6,
      fatigue: 0,
      character,
      discovered: true,
      started: false,
    } as const;
    expect(
      overworldQuestStartPreconditionFingerprint({
        ...base,
        approachId: "test:exposed_ridge",
      }),
    ).not.toBe(
      overworldQuestStartPreconditionFingerprint({
        ...base,
        approachId: "test:sheltered_stockway",
      }),
    );
  });

  it("binds launch memory and knowledge to exact authored campaign targets", () => {
    const authored = loadOverworldManifest(process.cwd());
    const unknownNpc = structuredClone(authored);
    const unknownNpcWolf = unknownNpc.quests.find((quest) => quest.id === "wolf_winter");
    const memory = unknownNpcWolf?.launch?.options[0]?.effects.find(
      (effect) => effect.type === "remember_relationship",
    );
    if (!memory) throw new Error("expected Wolf-Winter launch memory");
    memory.npc_id = "test:unknown_dispatcher";
    expect(() => assertOverworldIntegrity(unknownNpc)).toThrow(/unknown campaign npc/);

    const duplicateImport = structuredClone(authored);
    const duplicateImportWolf = duplicateImport.quests.find((quest) => quest.id === "wolf_winter");
    const knowledge = duplicateImportWolf?.launch?.options[0]?.effects.find(
      (effect) => effect.type === "learn_knowledge",
    );
    if (!knowledge || !duplicateImportWolf?.campaign_imports) {
      throw new Error("expected Wolf-Winter launch knowledge import");
    }
    duplicateImportWolf.campaign_imports.rules.push({
      id: "albany:duplicate_approach_import",
      type: "knowledge_to_flag",
      knowledge_id: knowledge.knowledge_id,
      target_flag: "duplicate_approach_flag",
    });
    expect(() => assertOverworldIntegrity(duplicateImport)).toThrow(
      /exactly one campaign knowledge-to-flag import/,
    );

    const duplicateLaunch = structuredClone(authored);
    const wolf = duplicateLaunch.quests.find((quest) => quest.id === "wolf_winter");
    const other = duplicateLaunch.quests.find((quest) => quest.id !== "wolf_winter");
    if (!wolf?.launch || !wolf.campaign_imports || !other) {
      throw new Error("expected launch and another quest");
    }
    other.launch = structuredClone(wolf.launch);
    other.campaign_imports = structuredClone(wolf.campaign_imports);
    expect(() => assertOverworldIntegrity(duplicateLaunch)).toThrow(
      /Duplicate overworld quest launch id/,
    );

    const duplicateGlobalOption = structuredClone(authored);
    const optionWolf = duplicateGlobalOption.quests.find((quest) => quest.id === "wolf_winter");
    const optionOther = duplicateGlobalOption.quests.find((quest) => quest.id !== "wolf_winter");
    if (!optionWolf?.launch || !optionWolf.campaign_imports || !optionOther) {
      throw new Error("expected launch and another quest");
    }
    optionOther.launch = { ...structuredClone(optionWolf.launch), id: "test:other_launch" };
    optionOther.campaign_imports = structuredClone(optionWolf.campaign_imports);
    expect(() => assertOverworldIntegrity(duplicateGlobalOption)).toThrow(
      /Duplicate overworld quest launch option id/,
    );
  });
});
