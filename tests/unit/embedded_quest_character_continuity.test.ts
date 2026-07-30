import { describe, expect, it } from "vitest";

import { hashState } from "../../src/core/hash.js";
import {
  EMBEDDED_QUEST_CONTINUITY_EXPLANATION,
  buildEmbeddedQuestCharacterContinuity,
  compactEmbeddedQuestCharacterContinuity,
  projectEmbeddedQuestCharacterContinuity,
} from "../../src/rpg/embedded_quest_character_continuity.js";
import { indexRpgPack, initStateForRpgPack } from "../../src/rpg/runner.js";
import { loadRpgSourceFile } from "../../src/rpg/source.js";
import { buildCampaignCharacterState } from "../../src/world/campaign_character_state.js";

const loaded = loadRpgSourceFile("content/rpg/quests/gallowmere.yaml");
if (!loaded.ok) throw new Error("gallowmere must compile");
const pack = loaded.compiled.pack;
const index = indexRpgPack(pack);

describe("embedded quest character continuity contract", () => {
  it("projects an importless quest without changing its exact child state or mechanics", () => {
    const character = buildCampaignCharacterState({
      background: "albany:road_warden",
      health: { current: 30, max: 30 },
      skills: [{ skillId: "skill:fieldcraft", rank: 5 }],
    });
    const syntheticImportlessPack = structuredClone(pack);
    syntheticImportlessPack.meta.title = "Synthetic importless continuity proof";
    const syntheticIndex = indexRpgPack(syntheticImportlessPack);
    const child = initStateForRpgPack(syntheticIndex, 7);
    const exactChild = structuredClone(child);
    const exactHash = hashState(child);

    const continuity = buildEmbeddedQuestCharacterContinuity({
      character,
      pack: syntheticImportlessPack,
      state: child,
    });

    expect(child).toEqual(exactChild);
    expect(hashState(child)).toBe(exactHash);
    expect(continuity).toEqual({
      continuity: "same_campaign_character",
      profile_scope: "quest_local",
      persistent_record: {
        identity: "persistent_campaign_record",
        background: "albany:road_warden",
        health: { current: 30, max: 30 },
      },
      quest_local_profile: {
        hp: 24,
        attack: 4,
        defense: 2,
        skills: [
          { id: "lore", value: 3 },
          { id: "tracking", value: 3 },
        ],
        inventory: ["hunting_knife"],
      },
      applied_campaign_import_effects: [],
      explanation: EMBEDDED_QUEST_CONTINUITY_EXPLANATION,
    });
    expect(JSON.parse(JSON.stringify(continuity))).toEqual(continuity);
  });

  it("uses a self-describing compact projection without aliasing the full projection", () => {
    const character = buildCampaignCharacterState({
      background: "albany:road_warden",
      health: { current: 30, max: 30 },
    });
    const child = initStateForRpgPack(index, 7);
    const continuity = buildEmbeddedQuestCharacterContinuity({ character, pack, state: child });
    continuity.applied_campaign_import_effects.push({
      rule_id: "import:test_health_current",
      type: "health_current_to_var",
      target_var: "hp",
      value: 30,
    });
    const compact = compactEmbeddedQuestCharacterContinuity(continuity);

    expect(compact).toEqual({
      continuity: "same_campaign_character",
      cross_boundary: "authored_imports_exports_only",
      persistent_record: {
        background: "albany:road_warden",
        health: { current: 30, max: 30 },
      },
      quest_local_profile: {
        hp: 24,
        attack: 4,
        defense: 2,
        skills: [
          { id: "lore", value: 3 },
          { id: "tracking", value: 3 },
        ],
        inventory: ["hunting_knife"],
      },
      applied_campaign_import_effects: [
        {
          rule_id: "import:test_health_current",
          type: "health_current_to_var",
          target_var: "hp",
          value: 30,
        },
      ],
    });
    expect(compact).not.toHaveProperty("profile_scope");
    expect(compact).not.toHaveProperty("explanation");

    continuity.persistent_record.health.current = 12;
    continuity.quest_local_profile.skills[0]!.value = 9;
    continuity.quest_local_profile.inventory.push("caller_mutation");
    const sourceEffect = continuity.applied_campaign_import_effects[0]!;
    if (sourceEffect.type !== "health_current_to_var") throw new Error("expected health import");
    sourceEffect.value = 12;

    expect(compact.persistent_record.health.current).toBe(30);
    expect(compact.quest_local_profile.skills[0]?.value).toBe(3);
    expect(compact.quest_local_profile.inventory).toEqual(["hunting_knife"]);
    expect(compact.applied_campaign_import_effects[0]).toMatchObject({ value: 30 });
    expect(child.inventory).toEqual(["hunting_knife"]);

    compact.persistent_record.health.current = 5;
    compact.quest_local_profile.skills[0]!.value = 6;
    compact.quest_local_profile.inventory.push("compact_mutation");
    const compactEffect = compact.applied_campaign_import_effects[0]!;
    if (compactEffect.type !== "health_current_to_var") throw new Error("expected health import");
    compactEffect.value = 5;

    expect(continuity.persistent_record.health.current).toBe(12);
    expect(continuity.quest_local_profile.skills[0]?.value).toBe(9);
    expect(continuity.quest_local_profile.inventory).toEqual(["hunting_knife", "caller_mutation"]);
    expect(sourceEffect.value).toBe(12);
  });

  it("is smaller than the previous tuple-plus-legend compact payload on Gallowmere", () => {
    const character = buildCampaignCharacterState({
      background: "albany:road_warden",
      health: { current: 30, max: 30 },
    });
    const child = initStateForRpgPack(index, 7);
    const compact = compactEmbeddedQuestCharacterContinuity(
      buildEmbeddedQuestCharacterContinuity({ character, pack, state: child }),
    );
    const previousPayload = {
      character_continuity: [
        "same_campaign_character",
        "quest_local",
        ["persistent_campaign_record", "albany:road_warden", 30, 30],
        [
          24,
          4,
          2,
          [
            ["lore", 3],
            ["tracking", 3],
          ],
          ["hunting_knife"],
        ],
        [],
        EMBEDDED_QUEST_CONTINUITY_EXPLANATION,
      ],
      character_continuity_legend:
        "[continuity, profile_scope, [persistent_record_identity, background|null, health_current, health_max], [quest_hp, quest_attack, quest_defense, [[quest_skill_id, value], ...], [quest_inventory_item_id, ...]], [applied_campaign_import_effect, ...], explanation]; import effects are [rule_id, type, target_var|target_flag, value] or [rule_id, equipment_to_item, target_object]",
    };

    expect(JSON.stringify({ character_continuity: compact }).length).toBeLessThan(
      JSON.stringify(previousPayload).length,
    );
  });

  it("keeps identity/import provenance fixed while projecting the current child profile", () => {
    const character = buildCampaignCharacterState({
      background: "albany:road_warden",
      health: { current: 30, max: 30 },
    });
    const child = initStateForRpgPack(index, 7);
    const continuity = buildEmbeddedQuestCharacterContinuity({ character, pack, state: child });
    const changed = {
      ...child,
      vars: { ...child.vars, hp: 9, attack: 8, lore: 11 },
      inventory: [...child.inventory, "field_trophy"],
    };

    const projected = projectEmbeddedQuestCharacterContinuity({
      continuity,
      pack,
      state: changed,
    });

    expect(projected.persistent_record).toEqual(continuity.persistent_record);
    expect(projected.applied_campaign_import_effects).toEqual(
      continuity.applied_campaign_import_effects,
    );
    expect(projected.quest_local_profile).toMatchObject({
      hp: 9,
      attack: 8,
      defense: 2,
      skills: [
        { id: "lore", value: 11 },
        { id: "tracking", value: 3 },
      ],
      inventory: ["hunting_knife", "field_trophy"],
    });
    expect(continuity.quest_local_profile).toMatchObject({ hp: 24, attack: 4 });
  });
});
