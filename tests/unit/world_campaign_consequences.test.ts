import { describe, expect, it } from "vitest";

import {
  CAMPAIGN_CHARACTER_MAX_OWED,
  CAMPAIGN_CHARACTER_MAX_SCORE,
  CAMPAIGN_CHARACTER_MIN_SCORE,
  buildCampaignCharacterState,
  cloneCampaignCharacterState,
  type CampaignCharacterState,
} from "../../src/world/campaign_character_state.js";
import {
  CampaignConsequenceEffectSchema,
  CampaignConsequenceEffectsSchema,
  RememberRelationshipConsequenceSchema,
  SetWorldFactConsequenceSchema,
  applyCampaignConsequences,
  campaignConsequenceEffectKey,
  deriveCampaignWorldFactIds,
  type CampaignConsequenceEffect,
  type CampaignConsequenceEffects,
} from "../../src/world/campaign_consequences.js";

function baseCharacter(): CampaignCharacterState {
  return buildCampaignCharacterState({
    health: { current: 24, max: 30 },
    knowledge: ["knowledge:private_map"],
    relationships: [
      {
        npcId: "npc:synthetic_guide",
        trust: -20,
        regard: 10,
        owesPlayer: 1,
        playerOwes: 2,
        memories: ["memory:first_met"],
      },
    ],
  });
}

function syntheticEffects(): CampaignConsequenceEffects {
  return CampaignConsequenceEffectsSchema.parse([
    {
      type: "remember_relationship",
      npc_id: "npc:synthetic_guide",
      memory_id: "memory:rescued_archive",
      trust_at_least: 25,
      regard_at_least: 30,
      owes_player_at_least: 4,
    },
    {
      type: "remember_relationship",
      npc_id: "npc:synthetic_archivist",
      memory_id: "memory:shared_evidence",
    },
    {
      type: "set_world_fact",
      fact_id: "fact:archive_preserved",
    },
  ]);
}

describe("generic campaign consequences", () => {
  it("parses the complete strict monotonic vocabulary", () => {
    expect(
      RememberRelationshipConsequenceSchema.parse({
        type: "remember_relationship",
        npc_id: "npc:synthetic_guide",
        memory_id: "memory:shared_evidence",
        trust_at_least: CAMPAIGN_CHARACTER_MIN_SCORE,
        regard_at_least: CAMPAIGN_CHARACTER_MAX_SCORE,
        owes_player_at_least: CAMPAIGN_CHARACTER_MAX_OWED,
      }),
    ).toEqual({
      type: "remember_relationship",
      npc_id: "npc:synthetic_guide",
      memory_id: "memory:shared_evidence",
      trust_at_least: CAMPAIGN_CHARACTER_MIN_SCORE,
      regard_at_least: CAMPAIGN_CHARACTER_MAX_SCORE,
      owes_player_at_least: CAMPAIGN_CHARACTER_MAX_OWED,
    });
    expect(
      SetWorldFactConsequenceSchema.parse({
        type: "set_world_fact",
        fact_id: "fact:archive_preserved",
      }),
    ).toEqual({ type: "set_world_fact", fact_id: "fact:archive_preserved" });
    expect(CampaignConsequenceEffectSchema.parse(syntheticEffects()[0])).toEqual(
      syntheticEffects()[0],
    );
  });

  it("rejects unknown effects and unknown fields on either variant", () => {
    expect(() =>
      CampaignConsequenceEffectSchema.parse({
        type: "rewrite_character",
        character: {},
      }),
    ).toThrow();
    expect(() =>
      CampaignConsequenceEffectSchema.parse({
        type: "remember_relationship",
        npc_id: "npc:synthetic_guide",
        memory_id: "memory:shared_evidence",
        trust_delta: 100,
      }),
    ).toThrow();
    expect(() =>
      CampaignConsequenceEffectSchema.parse({
        type: "set_world_fact",
        fact_id: "fact:archive_preserved",
        value: false,
      }),
    ).toThrow();
  });

  it.each([
    [
      "unscoped npc id",
      {
        type: "remember_relationship",
        npc_id: "guide",
        memory_id: "memory:shared_evidence",
      },
    ],
    [
      "uppercase memory id",
      {
        type: "remember_relationship",
        npc_id: "npc:synthetic_guide",
        memory_id: "Memory:shared_evidence",
      },
    ],
    ["unscoped fact id", { type: "set_world_fact", fact_id: "archive_preserved" }],
    [
      "trust floor below score range",
      {
        type: "remember_relationship",
        npc_id: "npc:synthetic_guide",
        memory_id: "memory:shared_evidence",
        trust_at_least: -101,
      },
    ],
    [
      "trust floor above score range",
      {
        type: "remember_relationship",
        npc_id: "npc:synthetic_guide",
        memory_id: "memory:shared_evidence",
        trust_at_least: 101,
      },
    ],
    [
      "non-integer regard floor",
      {
        type: "remember_relationship",
        npc_id: "npc:synthetic_guide",
        memory_id: "memory:shared_evidence",
        regard_at_least: 1.5,
      },
    ],
    [
      "negative owed floor",
      {
        type: "remember_relationship",
        npc_id: "npc:synthetic_guide",
        memory_id: "memory:shared_evidence",
        owes_player_at_least: -1,
      },
    ],
    [
      "owed floor above range",
      {
        type: "remember_relationship",
        npc_id: "npc:synthetic_guide",
        memory_id: "memory:shared_evidence",
        owes_player_at_least: 101,
      },
    ],
  ] satisfies readonly [string, unknown][])(
    "rejects malformed consequence: %s",
    (_label, effect) => {
      expect(() => CampaignConsequenceEffectSchema.parse(effect)).toThrow();
    },
  );

  it("rejects duplicate semantic effects without conflating distinct memories", () => {
    expect(() =>
      CampaignConsequenceEffectsSchema.parse([
        { type: "set_world_fact", fact_id: "fact:archive_preserved" },
        { type: "set_world_fact", fact_id: "fact:archive_preserved" },
      ]),
    ).toThrow(/duplicate campaign consequence effect/i);

    expect(() =>
      CampaignConsequenceEffectsSchema.parse([
        {
          type: "remember_relationship",
          npc_id: "npc:synthetic_guide",
          memory_id: "memory:shared_evidence",
          trust_at_least: 10,
        },
        {
          type: "remember_relationship",
          npc_id: "npc:synthetic_guide",
          memory_id: "memory:shared_evidence",
          trust_at_least: 20,
        },
      ]),
    ).toThrow(/duplicate campaign consequence effect/i);

    expect(
      CampaignConsequenceEffectsSchema.parse([
        {
          type: "remember_relationship",
          npc_id: "npc:synthetic_guide",
          memory_id: "memory:shared_evidence",
        },
        {
          type: "remember_relationship",
          npc_id: "npc:synthetic_guide",
          memory_id: "memory:returned_archive",
        },
      ]),
    ).toHaveLength(2);
  });

  it("uses collision-safe semantic keys for namespaced ids", () => {
    const left: CampaignConsequenceEffect = {
      type: "remember_relationship",
      npc_id: "npc:a",
      memory_id: "memory:b:c",
    };
    const right: CampaignConsequenceEffect = {
      type: "remember_relationship",
      npc_id: "npc:a:memory",
      memory_id: "b:c",
    };

    expect(campaignConsequenceEffectKey(left)).not.toBe(campaignConsequenceEffectKey(right));
  });

  it("applies every primitive to a synthetic non-quest-specific character", () => {
    const source = baseCharacter();
    const sourceBefore = cloneCampaignCharacterState(source);
    const effects = syntheticEffects();
    const effectsBefore = structuredClone(effects);
    const result = applyCampaignConsequences({ character: source, effects });

    expect(source).toEqual(sourceBefore);
    expect(effects).toEqual(effectsBefore);
    expect(result.worldFactIds).toEqual(["fact:archive_preserved"]);
    expect(result.characterAfter.knowledge).toEqual(["knowledge:private_map"]);
    expect(result.characterAfter.relationships).toEqual([
      {
        npcId: "npc:synthetic_archivist",
        trust: 0,
        regard: 0,
        owesPlayer: 0,
        playerOwes: 0,
        memories: ["memory:shared_evidence"],
      },
      {
        npcId: "npc:synthetic_guide",
        trust: 25,
        regard: 30,
        owesPlayer: 4,
        playerOwes: 2,
        memories: ["memory:first_met", "memory:rescued_archive"],
      },
    ]);
  });

  it("treats floors monotonically and never lowers existing relationship state", () => {
    const source = buildCampaignCharacterState({
      relationships: [
        {
          npcId: "npc:synthetic_guide",
          trust: 80,
          regard: 70,
          owesPlayer: 9,
          playerOwes: 3,
          memories: [],
        },
      ],
    });
    const result = applyCampaignConsequences({
      character: source,
      effects: [
        {
          type: "remember_relationship",
          npc_id: "npc:synthetic_guide",
          memory_id: "memory:minor_favor",
          trust_at_least: 20,
          regard_at_least: 30,
          owes_player_at_least: 2,
        },
      ],
    });

    expect(result.characterAfter.relationships[0]).toEqual({
      npcId: "npc:synthetic_guide",
      trust: 80,
      regard: 70,
      owesPlayer: 9,
      playerOwes: 3,
      memories: ["memory:minor_favor"],
    });
  });

  it("is idempotent when the identical outcome is replayed", () => {
    const effects = syntheticEffects();
    const first = applyCampaignConsequences({ character: baseCharacter(), effects });
    const second = applyCampaignConsequences({ character: first.characterAfter, effects });

    expect(second).toEqual(first);
    expect(deriveCampaignWorldFactIds([effects, effects])).toEqual(["fact:archive_preserved"]);
  });

  it("derives a sorted, deduplicated fact collection across outcome groups", () => {
    const first = CampaignConsequenceEffectsSchema.parse([
      { type: "set_world_fact", fact_id: "fact:zeta_recorded" },
      {
        type: "remember_relationship",
        npc_id: "npc:synthetic_guide",
        memory_id: "memory:saw_zeta",
      },
      { type: "set_world_fact", fact_id: "fact:alpha_recorded" },
    ]);
    const second = CampaignConsequenceEffectsSchema.parse([
      { type: "set_world_fact", fact_id: "fact:middle_recorded" },
      { type: "set_world_fact", fact_id: "fact:alpha_recorded" },
    ]);
    const derived = deriveCampaignWorldFactIds([first, second]);

    expect(derived).toEqual(["fact:alpha_recorded", "fact:middle_recorded", "fact:zeta_recorded"]);
    derived.push("fact:caller_mutation");
    expect(deriveCampaignWorldFactIds([first, second])).not.toContain("fact:caller_mutation");
  });

  it("rolls back the complete effect list when a later effect is invalid", () => {
    const source = baseCharacter();
    const before = cloneCampaignCharacterState(source);
    const effects: unknown[] = [
      {
        type: "remember_relationship",
        npc_id: "npc:synthetic_guide",
        memory_id: "memory:would_have_applied",
        trust_at_least: 100,
      },
      { type: "set_world_fact", fact_id: "not_namespaced" },
    ];

    expect(() => applyCampaignConsequences({ character: source, effects })).toThrow();
    expect(source).toEqual(before);
    expect(source.relationships[0]?.memories).not.toContain("memory:would_have_applied");
  });

  it("returns detached graphs even for fact-only and empty applications", () => {
    const source = baseCharacter();
    const factOnly = applyCampaignConsequences({
      character: source,
      effects: [{ type: "set_world_fact", fact_id: "fact:archive_preserved" }],
    });
    const empty = applyCampaignConsequences({ character: source, effects: [] });

    expect(factOnly.characterAfter).toEqual(source);
    expect(factOnly.characterAfter).not.toBe(source);
    expect(factOnly.characterAfter.relationships[0]).not.toBe(source.relationships[0]);
    expect(empty.characterAfter).toEqual(source);
    expect(empty.characterAfter).not.toBe(source);

    factOnly.characterAfter.relationships[0]!.memories.push("memory:caller_mutation");
    factOnly.worldFactIds.push("fact:caller_mutation");
    empty.characterAfter.health.current = 1;
    expect(source.relationships[0]?.memories).toEqual(["memory:first_met"]);
    expect(source.health.current).toBe(24);
    expect(
      applyCampaignConsequences({
        character: source,
        effects: [{ type: "set_world_fact", fact_id: "fact:archive_preserved" }],
      }).worldFactIds,
    ).toEqual(["fact:archive_preserved"]);
  });
});
