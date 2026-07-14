import { describe, expect, it } from "vitest";
import { hashState } from "../../src/core/hash.js";
import { cloneGameState } from "../../src/core/state.js";
import { load, save, SAVE_MODE, SaveIntegrityError } from "../../src/persist/save_load.js";
import {
  assertCampaignImportReceiptMatchesCatalog,
  CampaignCharacterImportsSchema,
  CampaignCharacterImportTargetError,
  CampaignImportReceiptCatalogError,
  projectCampaignCharacterImports,
  validateCampaignCharacterImportTargets,
  type CampaignCharacterImports,
} from "../../src/rpg/campaign_character_import.js";
import { buildRpgRules, indexRpgPack, initStateForRpgPack } from "../../src/rpg/runner.js";
import { RpgPackSchema, type RpgPack } from "../../src/rpg/schema.js";
import { assertRpgStateReferences } from "../../src/rpg/state_integrity.js";
import { recordTrace } from "../../src/trace/record.js";
import { replayTrace } from "../../src/trace/replay.js";
import { buildCampaignCharacterState } from "../../src/world/campaign_character_state.js";

function importPack(): RpgPack {
  return RpgPackSchema.parse({
    meta: {
      id: "campaign_import_fixture",
      title: "Campaign Import Fixture",
      start_room: "room",
      vars_init: { hp: 30, lore: 1, score: 0 },
      max_score: 0,
    },
    rooms: [
      {
        id: "room",
        name: "Room",
        description: "A room.",
        on_enter: [{ inc_var: { name: "lore", by: 1 } }, { clear_flag: "from_background" }],
      },
    ],
    objects: [
      {
        id: "local_blade",
        name: "local blade",
        description: "A quest-local blade.",
        takeable: true,
        visible_when: [
          {
            any_of: [
              { has_flag: "from_background" },
              { has_flag: "from_ability" },
              { has_flag: "from_knowledge" },
            ],
          },
        ],
      },
      {
        id: "fixture",
        name: "fixture",
        description: "Not an inventory object.",
      },
    ],
    win_conditions: [{ id: "win", conditions: [{ has_flag: "won" }], ending: "ending" }],
    endings: [{ id: "ending", title: "End", text: "Done." }],
  });
}

function fullImports(): CampaignCharacterImports {
  return CampaignCharacterImportsSchema.parse({
    version: 1,
    rules: [
      {
        id: "import:skill",
        type: "skill_rank_to_var",
        skill_id: "skill:lore",
        target_var: "lore",
      },
      {
        id: "import:health",
        type: "health_current_to_var",
        target_var: "hp",
      },
      {
        id: "import:equipment",
        type: "equipment_to_item",
        item_id: "item:blade",
        target_object: "local_blade",
        equipped: true,
        condition_at_least: 50,
        quantity_at_least: 1,
      },
      {
        id: "import:knowledge",
        type: "knowledge_to_flag",
        knowledge_id: "knowledge:wolves",
        target_flag: "from_knowledge",
      },
      {
        id: "import:background",
        type: "background_to_flag",
        background_id: "background:scout",
        target_flag: "from_background",
      },
      {
        id: "import:ability",
        type: "ability_to_flag",
        ability_id: "ability:listen",
        target_flag: "from_ability",
      },
    ],
  });
}

function richCharacter() {
  return buildCampaignCharacterState({
    background: "background:scout",
    health: { current: 24, max: 30 },
    skills: [{ skillId: "skill:lore", rank: 3 }],
    abilities: ["ability:listen"],
    knowledge: ["knowledge:wolves"],
    equipment: [
      {
        equipmentId: "equipment:blade_instance",
        itemId: "item:blade",
        quantity: 1,
        condition: 75,
        equipped: true,
      },
    ],
  });
}

describe("campaign character RPG imports", () => {
  it("projects every supported persistent fact before start-room on_enter", () => {
    const pack = importPack();
    const state = initStateForRpgPack(indexRpgPack(pack), 7, {
      character: richCharacter(),
      imports: fullImports(),
    });

    expect(state.vars).toMatchObject({ hp: 24, lore: 4 });
    expect(state.flags).toMatchObject({
      from_background: false,
      from_ability: true,
      from_knowledge: true,
    });
    expect(state.inventory).toEqual(["local_blade"]);
    expect(state.campaignImportReceipt?.applied_rules).toEqual([
      "import:ability",
      "import:background",
      "import:equipment",
      "import:health",
      "import:knowledge",
      "import:skill",
    ]);
    expect(state.campaignImportReceipt?.catalog_hash).toBe(hashState(fullImports()));
    expect(state.campaignImportReceipt?.character_hash).toBe(hashState(richCharacter()));
    assertRpgStateReferences(indexRpgPack(pack), state);
  });

  it("keeps the exact legacy state shape and hash when projection has no delta", () => {
    const pack = importPack();
    const index = indexRpgPack(pack);
    const legacy = initStateForRpgPack(index, 7);
    const imports = CampaignCharacterImportsSchema.parse({
      version: 1,
      rules: [{ id: "import:health", type: "health_current_to_var", target_var: "hp" }],
    });
    const imported = initStateForRpgPack(index, 7, {
      character: buildCampaignCharacterState(),
      imports,
    });

    expect(imported).toEqual(legacy);
    expect(hashState(imported)).toBe(hashState(legacy));
    expect("campaignImportReceipt" in imported).toBe(false);

    const projected = projectCampaignCharacterImports(
      pack,
      legacy,
      buildCampaignCharacterState(),
      imports,
    );
    expect(projected.state).toBe(legacy);
    expect(projected.receipt).toBeNull();
  });

  it("matches equipment by persistent item kind, never by instance id", () => {
    const pack = importPack();
    const imports = CampaignCharacterImportsSchema.parse({
      version: 1,
      rules: [
        {
          id: "import:equipment",
          type: "equipment_to_item",
          item_id: "equipment:blade_instance",
          target_object: "local_blade",
        },
      ],
    });
    const state = initStateForRpgPack(indexRpgPack(pack), 7, {
      character: richCharacter(),
      imports,
    });

    expect(state.inventory).toEqual([]);
    expect(state.campaignImportReceipt).toBeUndefined();
  });

  it("rejects zero-health starts transactionally even without a health import rule", () => {
    const pack = importPack();
    const base = initStateForRpgPack(indexRpgPack(pack), 7);
    const before = hashState(base);
    const imports = CampaignCharacterImportsSchema.parse({
      version: 1,
      rules: [
        {
          id: "import:skill",
          type: "skill_rank_to_var",
          skill_id: "skill:lore",
          target_var: "lore",
        },
      ],
    });

    expect(() =>
      projectCampaignCharacterImports(
        pack,
        base,
        buildCampaignCharacterState({ health: { current: 0, max: 30 } }),
        imports,
      ),
    ).toThrow(/health 0/);
    expect(hashState(base)).toBe(before);
    expect("campaignImportReceipt" in base).toBe(false);
  });

  it("binds receipts to the exact current catalog while accepting no-op imports", () => {
    const pack = importPack();
    const imports = fullImports();
    const state = initStateForRpgPack(indexRpgPack(pack), 7, {
      character: richCharacter(),
      imports,
    });
    const receipt = state.campaignImportReceipt;
    if (receipt === undefined) throw new Error("fixture import did not produce a receipt");

    expect(() => assertCampaignImportReceiptMatchesCatalog(receipt, imports)).not.toThrow();
    expect(() => assertCampaignImportReceiptMatchesCatalog(undefined, imports)).not.toThrow();
    expect(() => assertCampaignImportReceiptMatchesCatalog(undefined, undefined)).not.toThrow();

    expect(() => assertCampaignImportReceiptMatchesCatalog(receipt, undefined)).toThrow(
      CampaignImportReceiptCatalogError,
    );

    const stale = cloneGameState(state).campaignImportReceipt!;
    stale.catalog_hash = "0".repeat(64);
    expect(() => assertCampaignImportReceiptMatchesCatalog(stale, imports)).toThrow(/hash.*stale/);

    const nonexistent = cloneGameState(state).campaignImportReceipt!;
    nonexistent.applied_rules[0] = "import:aa_missing";
    nonexistent.effects[0]!.rule_id = "import:aa_missing";
    expect(() => assertCampaignImportReceiptMatchesCatalog(nonexistent, imports)).toThrow(
      /not present/,
    );

    const retyped = cloneGameState(state).campaignImportReceipt!;
    (retyped.effects[0] as { type: string }).type = "knowledge_to_flag";
    expect(() => assertCampaignImportReceiptMatchesCatalog(retyped, imports)).toThrow(
      /effect type/,
    );

    const retargeted = cloneGameState(state).campaignImportReceipt!;
    const healthEffect = retargeted.effects.find(
      (effect) => effect.type === "health_current_to_var",
    );
    if (healthEffect?.type !== "health_current_to_var") {
      throw new Error("fixture import did not produce a health effect");
    }
    healthEffect.target_var = "alternate_hp";
    expect(() => assertCampaignImportReceiptMatchesCatalog(retargeted, imports)).toThrow(
      /different quest-state field/,
    );
  });

  it("rejects empty catalogs, duplicate ids, and multiple writers", () => {
    expect(CampaignCharacterImportsSchema.safeParse({ version: 1, rules: [] }).success).toBe(false);
    const rule = { id: "import:health", type: "health_current_to_var", target_var: "hp" };
    expect(
      CampaignCharacterImportsSchema.safeParse({ version: 1, rules: [rule, rule] }).success,
    ).toBe(false);
    expect(
      CampaignCharacterImportsSchema.safeParse({
        version: 1,
        rules: [
          rule,
          {
            id: "import:skill",
            type: "skill_rank_to_var",
            skill_id: "skill:lore",
            target_var: "hp",
          },
        ],
      }).success,
    ).toBe(false);
  });

  it("reports structured pack-target failures", () => {
    const pack = importPack();
    const invalid = CampaignCharacterImportsSchema.parse({
      version: 1,
      rules: [
        {
          id: "import:skill",
          type: "skill_rank_to_var",
          skill_id: "skill:lore",
          target_var: "missing",
        },
        {
          id: "import:flag",
          type: "ability_to_flag",
          ability_id: "ability:listen",
          target_flag: "missing",
        },
        {
          id: "import:item",
          type: "equipment_to_item",
          item_id: "item:blade",
          target_object: "fixture",
        },
      ],
    });

    try {
      validateCampaignCharacterImportTargets(pack, invalid);
      throw new Error("expected target validation to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(CampaignCharacterImportTargetError);
      expect(
        (error as CampaignCharacterImportTargetError).issues.map((issue) => issue.code),
      ).toEqual(["UNKNOWN_VAR", "UNKNOWN_FLAG", "INVALID_INVENTORY_TARGET"]);
    }
  });

  it("round-trips, freezes, and detaches the strict receipt through saves", () => {
    const pack = importPack();
    const index = indexRpgPack(pack);
    const state = initStateForRpgPack(index, 7, {
      character: richCharacter(),
      imports: fullImports(),
    });
    const contentHash = hashState(pack);
    const loaded = load(
      save(state, contentHash, SAVE_MODE, { worldQuestId: "campaign_import_fixture" }),
      contentHash,
    );

    expect(loaded.state).toEqual(state);
    expect(loaded.state.campaignImportReceipt).not.toBe(state.campaignImportReceipt);
    expect(Object.isFrozen(loaded.state.campaignImportReceipt)).toBe(true);
    assertRpgStateReferences(index, loaded.state);

    const clone = cloneGameState(state);
    expect(clone.campaignImportReceipt).not.toBe(state.campaignImportReceipt);
    expect(clone.campaignImportReceipt?.effects).not.toBe(state.campaignImportReceipt?.effects);
  });

  it("rejects forged receipt targets at the pack-aware boundary", () => {
    const pack = importPack();
    const state = initStateForRpgPack(indexRpgPack(pack), 7, {
      character: richCharacter(),
      imports: fullImports(),
    });
    const forged = cloneGameState(state);
    const effect = forged.campaignImportReceipt!.effects.find(
      (candidate) => candidate.type === "equipment_to_item",
    );
    if (effect?.type !== "equipment_to_item") throw new Error("fixture receipt missing item");
    effect.target_object = "missing";
    forged.inventory = ["missing"];

    expect(() => assertRpgStateReferences(indexRpgPack(pack), forged)).toThrow(SaveIntegrityError);
  });

  it("binds imported initial state and its receipt into deterministic trace replay", () => {
    const pack = importPack();
    const index = indexRpgPack(pack);
    const rules = buildRpgRules(index);
    const state = initStateForRpgPack(index, 7, {
      character: richCharacter(),
      imports: fullImports(),
    });
    const trace = recordTrace(rules, state, [], {
      trace_id: "campaign_import_receipt",
      content_hash: hashState(pack),
      worldQuestId: "campaign_import_fixture",
    });

    expect(replayTrace(trace, rules).ok).toBe(true);

    const tamperedInitial = cloneGameState(trace.initial_state);
    tamperedInitial.campaignImportReceipt!.character_hash = "0".repeat(64);
    const diverged = replayTrace({ ...trace, initial_state: tamperedInitial }, rules);
    expect(diverged.ok).toBe(false);
    expect(diverged.finalHash).not.toBe(trace.expected_final_hash);
  });
});
