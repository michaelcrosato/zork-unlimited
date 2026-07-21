import { describe, expect, it } from "vitest";
import {
  CAMPAIGN_CHARACTER_MAX_EQUIPMENT_CONDITION,
  CAMPAIGN_CHARACTER_MAX_EQUIPMENT_QUANTITY,
  CAMPAIGN_CHARACTER_MAX_HEALTH,
  CAMPAIGN_CHARACTER_MAX_ID_LENGTH,
  CAMPAIGN_CHARACTER_MAX_MONEY,
  CAMPAIGN_CHARACTER_MAX_OWED,
  CAMPAIGN_CHARACTER_MAX_RANK,
  CAMPAIGN_CHARACTER_MAX_SCORE,
  CAMPAIGN_CHARACTER_MIN_SCORE,
  buildCampaignCharacterState,
} from "../../src/world/campaign_character_state.js";
import {
  buildCampaignCharacterView,
  campaignCharacterStandingTier,
  cloneCampaignCharacterView,
} from "../../src/world/campaign_character_view.js";
import {
  OVERWORLD_COMPACT_CHARACTER_ENTRY_LIMIT,
  OVERWORLD_COMPACT_CHARACTER_MEMORY_LIMIT,
  OVERWORLD_COMPACT_LEGEND,
  OVERWORLD_COMPACT_VIEW_VERSION,
  cloneOverworldCompactView,
  compactCampaignCharacterView,
  compactOverworldView,
} from "../../src/world/compact_view.js";
import { OverworldSession } from "../../src/world/session.js";
import { loadOverworldManifest } from "../../src/world/source.js";

function populatedCharacter() {
  return buildCampaignCharacterState({
    background: "background:road_warden",
    skills: [{ skillId: "skill:fieldcraft", rank: 3 }],
    values: [{ valueId: "value:keep_promises", strength: 4 }],
    health: { current: 23, max: 30 },
    wounds: [{ woundId: "wound:wolf_bite", severity: 2, treatment: "stabilized" }],
    equipment: [
      {
        equipmentId: "equipment:warden_spear_1",
        itemId: "item:warden_spear",
        quantity: 1,
        condition: 76,
        equipped: true,
      },
    ],
    money: 18,
    abilities: ["ability:brace"],
    knowledge: ["knowledge:wolf_spoor"],
    promises: [
      {
        promiseId: "promise:return_wagon",
        recipientId: "npc:hayden_hale",
        status: "active",
      },
    ],
    companions: ["npc:june_pike"],
    crimes: [
      {
        crimeId: "crime:steading_trespass",
        jurisdictionId: "jurisdiction:albany_hinterland",
        severity: 1,
        status: "suspected",
      },
    ],
    relationships: [
      {
        npcId: "npc:old_cade",
        trust: -61,
        regard: 59,
        owesPlayer: 2,
        playerOwes: 1,
        memories: ["memory:kept_watch"],
      },
    ],
    factionStanding: [{ factionId: "faction:road_wardens", standing: 60 }],
  });
}

function maximumLengthId(namespace: string, index: number): string {
  const prefix = `${namespace}:${index.toString().padStart(6, "0")}_`;
  return `${prefix}${"x".repeat(CAMPAIGN_CHARACTER_MAX_ID_LENGTH - prefix.length)}`;
}

function denseMaximumCharacter(entryCount: number, memoriesPerRelationship: number) {
  const indexes = Array.from({ length: entryCount }, (_, index) => index);
  const memoryIndexes = Array.from({ length: memoriesPerRelationship }, (_, index) => index);
  return buildCampaignCharacterState({
    background: maximumLengthId("background", 0),
    skills: indexes.map((index) => ({
      skillId: maximumLengthId("skill", index),
      rank: CAMPAIGN_CHARACTER_MAX_RANK,
    })),
    values: indexes.map((index) => ({
      valueId: maximumLengthId("value", index),
      strength: CAMPAIGN_CHARACTER_MAX_RANK,
    })),
    health: {
      current: CAMPAIGN_CHARACTER_MAX_HEALTH,
      max: CAMPAIGN_CHARACTER_MAX_HEALTH,
    },
    wounds: indexes.map((index) => ({
      woundId: maximumLengthId("wound", index),
      severity: CAMPAIGN_CHARACTER_MAX_RANK,
      treatment: "stabilized" as const,
    })),
    equipment: indexes.map((index) => ({
      equipmentId: maximumLengthId("equipment", index),
      itemId: maximumLengthId("item", index),
      quantity: CAMPAIGN_CHARACTER_MAX_EQUIPMENT_QUANTITY,
      condition: CAMPAIGN_CHARACTER_MAX_EQUIPMENT_CONDITION,
      equipped: true,
    })),
    money: CAMPAIGN_CHARACTER_MAX_MONEY,
    abilities: indexes.map((index) => maximumLengthId("ability", index)),
    knowledge: indexes.map((index) => maximumLengthId("knowledge", index)),
    promises: indexes.map((index) => ({
      promiseId: maximumLengthId("promise", index),
      recipientId: maximumLengthId("recipient", index),
      status: "released" as const,
    })),
    companions: indexes.map((index) => maximumLengthId("companion", index)),
    crimes: indexes.map((index) => ({
      crimeId: maximumLengthId("crime", index),
      jurisdictionId: maximumLengthId("jurisdiction", index),
      severity: CAMPAIGN_CHARACTER_MAX_RANK,
      status: "suspected" as const,
    })),
    relationships: indexes.map((index) => ({
      npcId: maximumLengthId("npc", index),
      trust: CAMPAIGN_CHARACTER_MIN_SCORE,
      regard: CAMPAIGN_CHARACTER_MAX_SCORE,
      owesPlayer: CAMPAIGN_CHARACTER_MAX_OWED,
      playerOwes: CAMPAIGN_CHARACTER_MAX_OWED,
      memories: memoryIndexes.map((memoryIndex) =>
        maximumLengthId(`memory_${index.toString().padStart(6, "0")}`, memoryIndex),
      ),
    })),
    factionStanding: indexes.map((index) => ({
      factionId: maximumLengthId("faction", index),
      standing: CAMPAIGN_CHARACTER_MAX_SCORE,
    })),
  });
}

describe("campaign character player view", () => {
  it("allowlists every public family while banding hidden disposition scores", () => {
    const view = buildCampaignCharacterView(populatedCharacter());

    expect(Object.keys(view)).toEqual([
      "background",
      "skills",
      "values",
      "health",
      "wounds",
      "equipment",
      "money",
      "abilities",
      "knowledge",
      "promises",
      "companions",
      "crimes",
      "relationships",
      "factionStanding",
    ]);
    expect(view.relationships[0]).toEqual({
      npcId: "npc:old_cade",
      trust: "very_low",
      regard: "high",
      owesPlayer: 2,
      playerOwes: 1,
      memories: ["memory:kept_watch"],
    });
    expect(view.factionStanding).toEqual([
      { factionId: "faction:road_wardens", standing: "very_high" },
    ]);
    expect(view).not.toHaveProperty("version");
    expect(JSON.stringify(view)).not.toContain('"trust":-61');
    expect(JSON.stringify(view)).not.toContain('"standing":60');
  });

  it("uses deterministic standing thresholds", () => {
    expect(
      [-100, -60, -59, -20, -19, 0, 19, 20, 59, 60, 100].map(campaignCharacterStandingTier),
    ).toEqual([
      "very_low",
      "very_low",
      "low",
      "low",
      "neutral",
      "neutral",
      "neutral",
      "high",
      "high",
      "very_high",
      "very_high",
    ]);
  });

  it("deep-clones public collections and emits the complete compact tuple", () => {
    const source = buildCampaignCharacterView(populatedCharacter());
    const cloned = cloneCampaignCharacterView(source);
    cloned.health.current = 0;
    cloned.skills[0]!.rank = 1;
    cloned.companions.push("npc:mutated_by_test");
    cloned.relationships[0]!.memories.push("memory:mutated_by_test");

    expect(source.health.current).toBe(23);
    expect(source.skills[0]?.rank).toBe(3);
    expect(source.companions).toEqual(["npc:june_pike"]);
    expect(source.relationships[0]?.memories).toEqual(["memory:kept_watch"]);

    const compact = compactCampaignCharacterView(source);
    expect(OVERWORLD_COMPACT_VIEW_VERSION).toBe(26);
    expect(compact).toHaveLength(15);
    expect(compact[0]).toBe("background:road_warden");
    expect(compact[1]).toEqual([23, 30]);
    expect(compact[6][0]).toEqual(["equipment:warden_spear_1", "item:warden_spear", 1, 76, true]);
    expect(compact[10]).toEqual(["npc:june_pike"]);
    expect(compact[12][0]).toEqual([
      "npc:old_cade",
      "very_low",
      "high",
      2,
      1,
      1,
      ["memory:kept_watch"],
    ]);
    expect(compact[14]).toEqual([1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]);
    expect(compact[15]).toBeUndefined();

    const sessionView = new OverworldSession(loadOverworldManifest(process.cwd())).view();
    sessionView.character = source;
    const compactOverworld = compactOverworldView(sessionView);
    const compactClone = cloneOverworldCompactView(compactOverworld);
    (compactClone.character[1] as unknown as number[])[0] = 0;
    (compactClone.character[10] as unknown as string[]).push("npc:mutated_by_test");
    (compactClone.character[12][0]?.[6] as string[]).push("memory:mutated_by_test");
    (compactClone.character[14] as unknown as number[])[0] = 0;
    expect(compactOverworld.character[1][0]).toBe(23);
    expect(compactOverworld.character[10]).toEqual(["npc:june_pike"]);
    expect(compactOverworld.character[12][0]?.[6]).toEqual(["memory:kept_watch"]);
    expect(compactOverworld.character[14][0]).toBe(1);
  });

  it("bounds a maximum-width recurring projection with truthful truncation metadata", () => {
    const entryCount = 64;
    const memoriesPerRelationship = 12;
    const view = buildCampaignCharacterView(
      denseMaximumCharacter(entryCount, memoriesPerRelationship),
    );
    const compact = compactCampaignCharacterView(view);

    for (const familyIndex of [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13] as const) {
      expect(compact[familyIndex]).toHaveLength(OVERWORLD_COMPACT_CHARACTER_ENTRY_LIMIT);
    }
    for (const relationship of compact[12]) {
      expect(relationship[5]).toBe(memoriesPerRelationship);
      expect(relationship[6]).toHaveLength(OVERWORLD_COMPACT_CHARACTER_MEMORY_LIMIT);
    }
    expect(compact[14]).toEqual([
      entryCount,
      entryCount,
      entryCount,
      entryCount,
      entryCount,
      entryCount,
      entryCount,
      entryCount,
      entryCount,
      entryCount,
      entryCount,
    ]);
    expect(compact[15]).toEqual([
      "skills",
      "values",
      "wounds",
      "equipment",
      "abilities",
      "knowledge",
      "promises",
      "companions",
      "crimes",
      "relationships",
      "relationship_memories",
      "faction_standing",
    ]);
    expect(JSON.stringify(compact).length).toBeLessThan(16_000);

    const sessionView = new OverworldSession(loadOverworldManifest(process.cwd())).view();
    sessionView.character = view;
    const original = compactOverworldView(sessionView);
    const cloned = cloneOverworldCompactView(original);
    expect(cloned.character[15]).not.toBe(original.character[15]);
    (cloned.character[15] as unknown as string[]).push("mutated_by_test");
    expect(original.character[15]).toEqual(compact[15]);

    expect(OVERWORLD_COMPACT_LEGEND.character).toContain("lists cap at 8");
    expect(OVERWORLD_COMPACT_LEGEND.character).toContain("memories at 4");
    expect(OVERWORLD_COMPACT_LEGEND.character).toContain("counts are uncapped totals");
    expect(OVERWORLD_COMPACT_LEGEND.character).toContain("truncation categories");
  });
});
