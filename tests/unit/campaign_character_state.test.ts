import { describe, expect, it } from "vitest";

import {
  CAMPAIGN_CHARACTER_DEFAULT_HEALTH,
  CAMPAIGN_CHARACTER_MAX_EQUIPMENT_CONDITION,
  CAMPAIGN_CHARACTER_MAX_EQUIPMENT_QUANTITY,
  CAMPAIGN_CHARACTER_MAX_HEALTH,
  CAMPAIGN_CHARACTER_MAX_ID_LENGTH,
  CAMPAIGN_CHARACTER_MAX_MONEY,
  CAMPAIGN_CHARACTER_MAX_OWED,
  CAMPAIGN_CHARACTER_MAX_RANK,
  CAMPAIGN_CHARACTER_MAX_SCORE,
  CAMPAIGN_CHARACTER_MIN_SCORE,
  CAMPAIGN_CHARACTER_STATE_VERSION,
  CampaignCharacterStateSchema,
  buildCampaignCharacterState,
  cloneCampaignCharacterState,
  createInitialCampaignCharacterState,
  deserializeCampaignCharacterState,
  evolveCampaignCharacterState,
  parseCampaignCharacterState,
  serializeCampaignCharacterState,
  type CampaignCharacterState,
  type CampaignCharacterStateBuildInput,
} from "../../src/world/campaign_character_state.js";

function richInput(): CampaignCharacterStateBuildInput {
  return {
    background: "background:road_warden",
    skills: [
      { skillId: "skill:survival", rank: 4 },
      { skillId: "skill:observation", rank: 3 },
    ],
    values: [
      { valueId: "value:community", strength: 5 },
      { valueId: "value:truth", strength: 2 },
    ],
    health: { current: 23, max: 35 },
    wounds: [
      { woundId: "wound:wolf_bite:2", severity: 2, treatment: "stabilized" },
      { woundId: "wound:old_burn:1", severity: 1, treatment: "treated" },
    ],
    equipment: [
      {
        equipmentId: "equipment:spear:2",
        itemId: "item:hunting_spear",
        quantity: 1,
        condition: 42,
        equipped: false,
      },
      {
        equipmentId: "equipment:spear:1",
        itemId: "item:hunting_spear",
        quantity: 1,
        condition: 88,
        equipped: true,
      },
    ],
    money: 127,
    abilities: ["ability:guarded_thrust", "ability:field_dressing"],
    knowledge: ["knowledge:wolf_trail", "knowledge:cade_warning"],
    promises: [
      {
        promiseId: "promise:return_wagon",
        recipientId: "npc:hayden_hale",
        status: "active",
      },
      {
        promiseId: "promise:protect_cattle",
        recipientId: "npc:old_cade",
        status: "kept",
      },
    ],
    crimes: [
      {
        crimeId: "crime:trespass:2",
        jurisdictionId: "jurisdiction:albany",
        severity: 1,
        status: "suspected",
      },
      {
        crimeId: "crime:theft:1",
        jurisdictionId: "jurisdiction:albany",
        severity: 3,
        status: "known",
      },
    ],
    relationships: [
      {
        npcId: "npc:old_cade",
        trust: 40,
        regard: 20,
        owesPlayer: 1,
        playerOwes: 0,
        memories: ["memory:truth_told", "memory:cattle_saved"],
      },
      {
        npcId: "npc:hayden_hale",
        trust: -10,
        regard: 5,
        owesPlayer: 0,
        playerOwes: 2,
        memories: ["memory:wagon_promised", "memory:late_return"],
      },
    ],
    factionStanding: [
      { factionId: "faction:road_wardens", standing: 25 },
      { factionId: "faction:greenway", standing: -15 },
    ],
    companions: ["npc:synthetic_scout", "npc:synthetic_guide"],
  };
}

function richState(): CampaignCharacterState {
  return buildCampaignCharacterState(richInput());
}

describe("campaign character state", () => {
  it("creates a versioned neutral character at the 30/30 health default", () => {
    expect(createInitialCampaignCharacterState()).toEqual({
      version: CAMPAIGN_CHARACTER_STATE_VERSION,
      background: null,
      skills: [],
      values: [],
      health: {
        current: CAMPAIGN_CHARACTER_DEFAULT_HEALTH,
        max: CAMPAIGN_CHARACTER_DEFAULT_HEALTH,
      },
      wounds: [],
      equipment: [],
      money: 0,
      abilities: [],
      knowledge: [],
      promises: [],
      crimes: [],
      relationships: [],
      factionStanding: [],
      companions: [],
    });

    expect(createInitialCampaignCharacterState("background:relief_rider").background).toBe(
      "background:relief_rider",
    );
    expect(buildCampaignCharacterState({ health: { max: 40 } }).health).toEqual({
      current: 40,
      max: 40,
    });
  });

  it("builds canonical arrays without mutating authoring input", () => {
    const input = richInput();
    const original = structuredClone(input);
    const state = buildCampaignCharacterState(input);

    expect(input).toEqual(original);
    expect(state.skills.map((entry) => entry.skillId)).toEqual([
      "skill:observation",
      "skill:survival",
    ]);
    expect(state.values.map((entry) => entry.valueId)).toEqual(["value:community", "value:truth"]);
    expect(state.wounds.map((entry) => entry.woundId)).toEqual([
      "wound:old_burn:1",
      "wound:wolf_bite:2",
    ]);
    expect(state.equipment.map((entry) => entry.equipmentId)).toEqual([
      "equipment:spear:1",
      "equipment:spear:2",
    ]);
    expect(state.equipment.map((entry) => entry.itemId)).toEqual([
      "item:hunting_spear",
      "item:hunting_spear",
    ]);
    expect(state.abilities).toEqual(["ability:field_dressing", "ability:guarded_thrust"]);
    expect(state.knowledge).toEqual(["knowledge:cade_warning", "knowledge:wolf_trail"]);
    expect(state.companions).toEqual(["npc:synthetic_guide", "npc:synthetic_scout"]);
    expect(state.relationships[0]?.memories).toEqual([
      "memory:late_return",
      "memory:wagon_promised",
    ]);
    expect(state.factionStanding.map((entry) => entry.factionId)).toEqual([
      "faction:greenway",
      "faction:road_wardens",
    ]);
  });

  it("keeps equipment instances distinct even when they share an item kind", () => {
    const state = richState();
    const spears = state.equipment.filter((entry) => entry.itemId === "item:hunting_spear");

    expect(spears).toHaveLength(2);
    expect(spears.map((entry) => [entry.equipmentId, entry.condition, entry.equipped])).toEqual([
      ["equipment:spear:1", 88, true],
      ["equipment:spear:2", 42, false],
    ]);
  });

  it("parses only canonical, strict state at every object boundary", () => {
    const parsed = parseCampaignCharacterState(richState());
    expect(parsed).toEqual(richState());

    expect(() => parseCampaignCharacterState({ ...richState(), unexpected: true })).toThrow();
    expect(() =>
      parseCampaignCharacterState({
        ...richState(),
        skills: [{ skillId: "skill:observation", rank: 3, label: "Notice" }],
      }),
    ).toThrow();
    expect(() =>
      parseCampaignCharacterState({
        ...richState(),
        health: { current: 20, max: 30, temporary: 5 },
      }),
    ).toThrow();
    expect(() =>
      parseCampaignCharacterState({
        ...richState(),
        equipment: [
          {
            equipmentId: "equipment:spear:1",
            itemId: "item:hunting_spear",
            quantity: 1,
            condition: 100,
            equipped: true,
            questLocalObjectId: "SPEAR",
          },
        ],
      }),
    ).toThrow();
  });

  it("rejects duplicate or out-of-order ids in every set-like collection", () => {
    const canonical = richState();
    const duplicateSkill = canonical.skills[0]!;
    const duplicateValue = canonical.values[0]!;
    const duplicateWound = canonical.wounds[0]!;
    const duplicateEquipment = canonical.equipment[0]!;
    const duplicatePromise = canonical.promises[0]!;
    const duplicateCrime = canonical.crimes[0]!;
    const duplicateRelationship = canonical.relationships[0]!;
    const duplicateFaction = canonical.factionStanding[0]!;
    const duplicateCompanion = canonical.companions[0]!;
    const invalidStates: unknown[] = [
      { ...canonical, skills: [duplicateSkill, duplicateSkill] },
      { ...canonical, values: [duplicateValue, duplicateValue] },
      { ...canonical, wounds: [duplicateWound, duplicateWound] },
      { ...canonical, equipment: [duplicateEquipment, duplicateEquipment] },
      { ...canonical, abilities: [...canonical.abilities].reverse() },
      { ...canonical, knowledge: [canonical.knowledge[0], canonical.knowledge[0]] },
      { ...canonical, promises: [duplicatePromise, duplicatePromise] },
      { ...canonical, crimes: [duplicateCrime, duplicateCrime] },
      { ...canonical, relationships: [duplicateRelationship, duplicateRelationship] },
      { ...canonical, factionStanding: [duplicateFaction, duplicateFaction] },
      { ...canonical, companions: [duplicateCompanion, duplicateCompanion] },
      { ...canonical, companions: [...canonical.companions].reverse() },
      {
        ...canonical,
        relationships: canonical.relationships.map((relationship, index) =>
          index === 0
            ? { ...relationship, memories: [...relationship.memories].reverse() }
            : relationship,
        ),
      },
    ];

    for (const invalid of invalidStates) {
      expect(CampaignCharacterStateSchema.safeParse(invalid).success).toBe(false);
    }

    expect(() =>
      buildCampaignCharacterState({
        abilities: ["ability:field_dressing", "ability:field_dressing"],
      }),
    ).toThrow(/Duplicate canonical id/);
  });

  it("requires bounded lowercase namespaced ASCII ids", () => {
    const longestValidId = `namespace:${"a".repeat(CAMPAIGN_CHARACTER_MAX_ID_LENGTH - 10)}`;
    expect(longestValidId).toHaveLength(CAMPAIGN_CHARACTER_MAX_ID_LENGTH);
    expect(buildCampaignCharacterState({ abilities: [longestValidId] }).abilities).toEqual([
      longestValidId,
    ]);

    for (const invalidId of [
      "unscoped",
      "Ability:guard",
      "ability:guard stance",
      "ability:guard!",
      `namespace:${"a".repeat(CAMPAIGN_CHARACTER_MAX_ID_LENGTH - 9)}`,
    ]) {
      expect(() => buildCampaignCharacterState({ abilities: [invalidId] })).toThrow();
    }
  });

  it("accepts numeric boundary values including a character at zero current health", () => {
    const state = buildCampaignCharacterState({
      skills: [{ skillId: "skill:survival", rank: CAMPAIGN_CHARACTER_MAX_RANK }],
      values: [{ valueId: "value:truth", strength: CAMPAIGN_CHARACTER_MAX_RANK }],
      health: { current: 0, max: CAMPAIGN_CHARACTER_MAX_HEALTH },
      wounds: [
        {
          woundId: "wound:wolf_bite:1",
          severity: CAMPAIGN_CHARACTER_MAX_RANK,
          treatment: "untreated",
        },
      ],
      equipment: [
        {
          equipmentId: "equipment:bandage:1",
          itemId: "item:bandage",
          quantity: CAMPAIGN_CHARACTER_MAX_EQUIPMENT_QUANTITY,
          condition: CAMPAIGN_CHARACTER_MAX_EQUIPMENT_CONDITION,
          equipped: false,
        },
      ],
      money: CAMPAIGN_CHARACTER_MAX_MONEY,
      relationships: [
        {
          npcId: "npc:old_cade",
          trust: CAMPAIGN_CHARACTER_MIN_SCORE,
          regard: CAMPAIGN_CHARACTER_MAX_SCORE,
          owesPlayer: CAMPAIGN_CHARACTER_MAX_OWED,
          playerOwes: CAMPAIGN_CHARACTER_MAX_OWED,
          memories: [],
        },
      ],
      factionStanding: [
        { factionId: "faction:greenway", standing: CAMPAIGN_CHARACTER_MIN_SCORE },
        { factionId: "faction:road_wardens", standing: CAMPAIGN_CHARACTER_MAX_SCORE },
      ],
    });

    expect(state.health).toEqual({ current: 0, max: CAMPAIGN_CHARACTER_MAX_HEALTH });
  });

  it.each([
    ["skill rank below one", { skills: [{ skillId: "skill:survival", rank: 0 }] }],
    ["skill rank above five", { skills: [{ skillId: "skill:survival", rank: 6 }] }],
    ["non-integer value strength", { values: [{ valueId: "value:truth", strength: 1.5 }] }],
    ["negative health", { health: { current: -1, max: 30 } }],
    ["zero maximum health", { health: { current: 0, max: 0 } }],
    ["health above cap", { health: { current: 30, max: 1_000 } }],
    ["current health above max", { health: { current: 31, max: 30 } }],
    [
      "wound severity above five",
      { wounds: [{ woundId: "wound:wolf_bite:1", severity: 6, treatment: "untreated" }] },
    ],
    [
      "zero equipment quantity",
      {
        equipment: [
          {
            equipmentId: "equipment:spear:1",
            itemId: "item:hunting_spear",
            quantity: 0,
            condition: 100,
            equipped: true,
          },
        ],
      },
    ],
    [
      "condition above 100",
      {
        equipment: [
          {
            equipmentId: "equipment:spear:1",
            itemId: "item:hunting_spear",
            quantity: 1,
            condition: 101,
            equipped: true,
          },
        ],
      },
    ],
    ["negative money", { money: -1 }],
    ["money above cap", { money: 1_000_000_001 }],
    [
      "relationship score outside range",
      {
        relationships: [
          {
            npcId: "npc:old_cade",
            trust: -101,
            regard: 0,
            owesPlayer: 0,
            playerOwes: 0,
            memories: [],
          },
        ],
      },
    ],
    [
      "relationship debt outside range",
      {
        relationships: [
          {
            npcId: "npc:old_cade",
            trust: 0,
            regard: 0,
            owesPlayer: 101,
            playerOwes: 0,
            memories: [],
          },
        ],
      },
    ],
    [
      "zero faction standing",
      { factionStanding: [{ factionId: "faction:greenway", standing: 0 }] },
    ],
    [
      "faction standing outside range",
      { factionStanding: [{ factionId: "faction:greenway", standing: 101 }] },
    ],
  ] satisfies readonly [string, CampaignCharacterStateBuildInput][])(
    "rejects bounded state: %s",
    (_label, input) => {
      expect(() => buildCampaignCharacterState(input)).toThrow();
    },
  );

  it("rejects unknown enum values and save versions", () => {
    const state = richState();
    expect(() => parseCampaignCharacterState({ ...state, version: 2 })).toThrow();
    expect(() =>
      parseCampaignCharacterState({
        ...state,
        wounds: [{ ...state.wounds[0], treatment: "healed" }],
      }),
    ).toThrow();
    expect(() =>
      parseCampaignCharacterState({
        ...state,
        promises: [{ ...state.promises[0], status: "forgotten" }],
      }),
    ).toThrow();
    expect(() =>
      parseCampaignCharacterState({
        ...state,
        crimes: [{ ...state.crimes[0], status: "pardoned" }],
      }),
    ).toThrow();
  });

  it("upgrades pre-companion v1 state to an empty canonical party", () => {
    const current = richState();
    const { companions: _companions, ...legacy } = current;

    const upgraded = parseCampaignCharacterState(legacy);

    expect(upgraded.companions).toEqual([]);
    expect(upgraded).toEqual({ ...legacy, companions: [] });
  });

  it("deep-clones all nested mutable state", () => {
    const source = richState();
    const before = structuredClone(source);
    const clone = cloneCampaignCharacterState(source);

    clone.skills[0]!.rank = 5;
    clone.health.current = 1;
    clone.wounds[0]!.treatment = "untreated";
    clone.equipment[0]!.condition = 0;
    clone.abilities.push("ability:scout");
    clone.relationships[0]!.trust = 99;
    clone.relationships[0]!.memories.push("memory:new");
    clone.factionStanding[0]!.standing = -99;
    clone.companions.push("npc:synthetic_driver");

    expect(source).toEqual(before);
    expect(clone).not.toEqual(source);
  });

  it("serializes deterministically and deserializes an independent validated state", () => {
    const state = richState();
    const serialized = serializeCampaignCharacterState(state);
    const fromReversedAuthoring = serializeCampaignCharacterState(
      buildCampaignCharacterState({
        ...richInput(),
        abilities: [...(richInput().abilities ?? [])].reverse(),
        relationships: [...(richInput().relationships ?? [])].reverse(),
      }),
    );

    expect(serialized).toBe(JSON.stringify(state));
    expect(fromReversedAuthoring).toBe(serialized);

    const restored = deserializeCampaignCharacterState(serialized);
    expect(restored).toEqual(state);
    restored.health.current = 0;
    restored.relationships[0]!.memories.push("memory:after_restore");
    expect(state.health.current).toBe(23);
    expect(state.relationships[0]!.memories).not.toContain("memory:after_restore");

    expect(() => deserializeCampaignCharacterState("not json")).toThrow();
    expect(() =>
      deserializeCampaignCharacterState(
        JSON.stringify({ ...state, abilities: [...state.abilities].reverse() }),
      ),
    ).toThrow(/canonical order/);
  });

  it("evolves transactionally, re-canonicalizes, and leaves source state untouched", () => {
    const source = richState();
    const before = cloneCampaignCharacterState(source);
    const next = evolveCampaignCharacterState(source, (draft) => {
      draft.money += 20;
      draft.health.current -= 3;
      draft.skills.push({ skillId: "skill:animal_handling", rank: 2 });
      draft.abilities.push("ability:animal_calm");
      draft.relationships[0]!.memories.push("memory:animals_calmed");
    });

    expect(source).toEqual(before);
    expect(next.money).toBe(source.money + 20);
    expect(next.health.current).toBe(source.health.current - 3);
    expect(next.skills.map((entry) => entry.skillId)).toEqual([
      "skill:animal_handling",
      "skill:observation",
      "skill:survival",
    ]);
    expect(next.abilities).toEqual([
      "ability:animal_calm",
      "ability:field_dressing",
      "ability:guarded_thrust",
    ]);
    expect(next.relationships[0]!.memories).toEqual([
      "memory:animals_calmed",
      "memory:late_return",
      "memory:wagon_promised",
    ]);
  });

  it("does not commit an invalid or throwing evolution", () => {
    const source = richState();
    const before = cloneCampaignCharacterState(source);

    expect(() =>
      evolveCampaignCharacterState(source, (draft) => {
        draft.health.current = draft.health.max + 1;
      }),
    ).toThrow(/cannot exceed/);
    expect(source).toEqual(before);

    expect(() =>
      evolveCampaignCharacterState(source, (draft) => {
        draft.money = 0;
        throw new Error("abort transaction");
      }),
    ).toThrow("abort transaction");
    expect(source).toEqual(before);
  });
});
