import { describe, expect, it } from "vitest";

import { hashState } from "../../src/core/hash.js";
import {
  COMPACT_EMBEDDED_QUEST_CHARACTER_CONTINUITY_LEGEND,
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

  it("uses a bounded compact tuple and legend without aliasing the full projection", () => {
    const character = buildCampaignCharacterState({
      background: "albany:road_warden",
      health: { current: 30, max: 30 },
    });
    const child = initStateForRpgPack(index, 7);
    const continuity = buildEmbeddedQuestCharacterContinuity({ character, pack, state: child });
    const compact = compactEmbeddedQuestCharacterContinuity(continuity);

    expect(compact).toEqual([
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
    ]);
    expect(COMPACT_EMBEDDED_QUEST_CHARACTER_CONTINUITY_LEGEND).toContain(
      "persistent_record_identity",
    );

    (continuity.quest_local_profile.inventory as string[]).push("caller_mutation");
    expect(compact[3][4]).toEqual(["hunting_knife"]);
    expect(child.inventory).toEqual(["hunting_knife"]);
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
