import { describe, expect, it } from "vitest";

import {
  buildCampaignCharacterState,
  cloneCampaignCharacterState,
} from "../../src/world/campaign_character_state.js";
import {
  OPENING_RELIEF_ALLOCATION_OPTION_COUNT,
  OpeningReliefAllocationSchema,
  applyOpeningReliefAllocationOption,
  cloneOpeningReliefAllocation,
  formatOpeningReliefAllocationCost,
  openingReliefAllocationOptionById,
  parseOpeningReliefAllocation,
  type OpeningReliefAllocation,
} from "../../src/world/opening_relief_allocation.js";
import { presentOpeningReliefAllocation } from "../../src/world/opening_relief_allocation_presentation.js";

export function reliefAllocationScene(): OpeningReliefAllocation {
  return parseOpeningReliefAllocation({
    version: 1,
    id: "albany:wolf_relief_allocation",
    after_preparation: "albany:wolf_preparation",
    target_quest: "wolf_winter",
    home: "albany_city",
    area: "albany_city__transport_hub",
    title: "Allocate Albany's Relief Capacity",
    message:
      "One public packet can cover Cade's steading, Albany's vulnerable residents, or the mobile reserve.",
    options: [
      {
        id: "albany:relief_cade_steading",
        title: "Cover Cade's Steading",
        provider_npc_id: "albany:hayden_hale",
        summary: "Send the packet's barriers and drover hands north with the field team.",
        trigger_category: "Opening relief line at Cade's steading.",
        preview: "The steading begins with a staffed relief line.",
        protects: "Cade's byre and its first failed cattle recovery.",
        leaves_exposed: "Albany's resident counter and the roaming reserve.",
        consequence: "Hayden records that the hill steading received first claim.",
        terms: { minutes: 10 },
        effects: [
          {
            type: "learn_knowledge",
            knowledge_id: "albany:knowledge_relief_cade_steading",
          },
          {
            type: "remember_relationship",
            npc_id: "albany:hayden_hale",
            memory_id: "albany:memory_hayden_relief_cade_steading",
            trust_at_least: 3,
          },
        ],
      },
      {
        id: "albany:relief_vulnerable_residents",
        title: "Cover Vulnerable Residents",
        provider_npc_id: "albany:jamie_tanner",
        summary: "Keep the packet at Albany's public counter for exposed households.",
        trigger_category: "Byre-held return: a short Albany recovery.",
        preview: "The hill dispatch leaves without those public stores.",
        protects: "Albany's heat, medicine, and food claims.",
        leaves_exposed: "Cade's first field recovery and the roaming reserve.",
        consequence: "Jamie records that resident claims remained first in line.",
        terms: { minutes: 0 },
        effects: [
          {
            type: "learn_knowledge",
            knowledge_id: "albany:knowledge_relief_vulnerable_residents",
          },
          {
            type: "remember_relationship",
            npc_id: "albany:jamie_tanner",
            memory_id: "albany:memory_jamie_relief_vulnerable_residents",
            regard_at_least: 3,
          },
        ],
      },
      {
        id: "albany:relief_mobile_reserve",
        title: "Keep a Mobile Reserve",
        provider_npc_id: "albany:rowan_quill",
        summary: "Keep the packet sealed on the relief wagon for one later emergency.",
        trigger_category: "A later break in the winter line.",
        preview: "Neither fixed site receives its protection at departure.",
        protects: "One mobile response where the winter line breaks next.",
        leaves_exposed: "Cade's opening line and Albany's fixed resident counter.",
        consequence: "Rowan records that flexibility outranked immediate coverage.",
        terms: { minutes: 5 },
        effects: [
          {
            type: "learn_knowledge",
            knowledge_id: "albany:knowledge_relief_mobile_reserve",
          },
          {
            type: "remember_relationship",
            npc_id: "albany:rowan_quill",
            memory_id: "albany:memory_rowan_relief_mobile_reserve",
          },
        ],
      },
    ],
  });
}

describe("opening relief allocation authoring", () => {
  it("strictly parses exactly three detached, mutually identified options", () => {
    const scene = reliefAllocationScene();
    expect(OPENING_RELIEF_ALLOCATION_OPTION_COUNT).toBe(3);
    expect(OpeningReliefAllocationSchema.parse(scene)).toEqual(scene);

    const clone = cloneOpeningReliefAllocation(scene);
    expect(clone).not.toBe(scene);
    expect(clone.options[0]).not.toBe(scene.options[0]);
    clone.options[0]!.title = "Detached";
    expect(scene.options[0]!.title).toBe("Cover Cade's Steading");

    expect(() => parseOpeningReliefAllocation({ ...scene, unexpected: true })).toThrow();
    expect(() =>
      parseOpeningReliefAllocation({ ...scene, options: scene.options.slice(0, 2) }),
    ).toThrow();
    expect(() =>
      parseOpeningReliefAllocation({
        ...scene,
        options: [...scene.options, structuredClone(scene.options[0]!)],
      }),
    ).toThrow();

    const duplicate = cloneOpeningReliefAllocation(scene);
    duplicate.options[1]!.id = duplicate.options[0]!.id;
    expect(() => parseOpeningReliefAllocation(duplicate)).toThrow(/duplicate.*option id/i);

    const repeatedKnowledge = cloneOpeningReliefAllocation(scene);
    const first = repeatedKnowledge.options[0]!.effects.find(
      (effect) => effect.type === "learn_knowledge",
    );
    const second = repeatedKnowledge.options[1]!.effects.find(
      (effect) => effect.type === "learn_knowledge",
    );
    if (!first || !second) throw new Error("expected allocation knowledge");
    second.knowledge_id = first.knowledge_id;
    expect(() => parseOpeningReliefAllocation(repeatedKnowledge)).toThrow(
      /knowledge.*repeated across options/i,
    );

    const exactLegacy = cloneOpeningReliefAllocation(scene);
    for (const option of exactLegacy.options) {
      Reflect.deleteProperty(option, "trigger_category");
    }
    expect(parseOpeningReliefAllocation(exactLegacy)).toEqual(exactLegacy);

    const partiallyCategorized = cloneOpeningReliefAllocation(scene);
    Reflect.deleteProperty(partiallyCategorized.options[0]!, "trigger_category");
    expect(() => parseOpeningReliefAllocation(partiallyCategorized)).toThrow(
      /trigger categories must cover every option/i,
    );
  });

  it("requires one knowledge and provider memory while forbidding outcome-owned effects", () => {
    const noKnowledge = reliefAllocationScene();
    noKnowledge.options[0]!.effects = noKnowledge.options[0]!.effects.filter(
      (effect) => effect.type !== "learn_knowledge",
    );
    expect(() => parseOpeningReliefAllocation(noKnowledge)).toThrow(/exactly one.*knowledge/i);

    const duplicateKnowledge = reliefAllocationScene();
    duplicateKnowledge.options[0]!.effects.push({
      type: "learn_knowledge",
      knowledge_id: "albany:knowledge_second_allocation",
    });
    expect(() => parseOpeningReliefAllocation(duplicateKnowledge)).toThrow(
      /exactly one.*knowledge/i,
    );

    const noMemory = reliefAllocationScene();
    noMemory.options[0]!.effects = noMemory.options[0]!.effects.filter(
      (effect) => effect.type !== "remember_relationship",
    );
    expect(() => parseOpeningReliefAllocation(noMemory)).toThrow(/provider relationship memory/i);

    const wrongProvider = reliefAllocationScene();
    const memory = wrongProvider.options[0]!.effects.find(
      (effect) => effect.type === "remember_relationship",
    );
    if (!memory || memory.type !== "remember_relationship") throw new Error("expected memory");
    memory.npc_id = "albany:someone_else";
    expect(() => parseOpeningReliefAllocation(wrongProvider)).toThrow(/named provider/i);

    const forbiddenCases = [
      { type: "set_world_fact", fact_id: "fact:forged_allocation" } as const,
      {
        type: "suffer_wound",
        wound_id: "wound:allocation_shortcut",
        severity: 1,
        treatment: "untreated",
        health_loss: 1,
      } as const,
      { type: "add_companion", npc_id: "albany:forged_companion" } as const,
      {
        type: "record_promise",
        promise_id: "albany:promise_forged_allocation",
        recipient_id: "albany:rowan_quill",
      } as const,
    ];
    for (const effect of forbiddenCases) {
      const forbidden = reliefAllocationScene();
      forbidden.options[0]!.effects.push(effect);
      expect(() => parseOpeningReliefAllocation(forbidden)).toThrow(
        /cannot create world facts, wounds, companions, or promises/i,
      );
    }
  });
});

describe("opening relief allocation application and presentation", () => {
  it("applies knowledge and provider memory atomically without money or world facts", () => {
    const scene = reliefAllocationScene();
    const character = buildCampaignCharacterState({ money: 17 });
    const before = cloneCampaignCharacterState(character);
    const result = applyOpeningReliefAllocationOption({
      scene,
      character,
      optionId: "albany:relief_cade_steading",
    });

    expect(character).toEqual(before);
    expect(result.characterAfter.money).toBe(17);
    expect(result.characterAfter.knowledge).toContain("albany:knowledge_relief_cade_steading");
    expect(result.characterAfter.relationships).toContainEqual({
      npcId: "albany:hayden_hale",
      trust: 3,
      regard: 0,
      owesPlayer: 0,
      playerOwes: 0,
      memories: ["albany:memory_hayden_relief_cade_steading"],
    });
    expect(result.terms).toEqual({ minutes: 10 });
    expect(result).not.toHaveProperty("worldFactIds");

    expect(() =>
      applyOpeningReliefAllocationOption({
        scene,
        character,
        optionId: "albany:relief_missing",
      }),
    ).toThrow(/unknown opening relief allocation option/i);
    expect(character).toEqual(before);

    const found = openingReliefAllocationOptionById(scene, result.option.id);
    expect(found).toEqual(result.option);
    expect(found).not.toBe(result.option);
    expect(openingReliefAllocationOptionById(scene, "albany:relief_missing")).toBeNull();
  });

  it("presents exact coverage, exposure, time, and consequence for every option", () => {
    const scene = reliefAllocationScene();
    const prompt = presentOpeningReliefAllocation(scene, buildCampaignCharacterState());

    expect(prompt).toMatchObject({
      id: scene.id,
      kind: "relief_allocation",
      message:
        "Allocate Albany's Relief Capacity. One public packet can cover Cade's steading, Albany's vulnerable residents, or the mobile reserve.",
    });
    expect(prompt.options).toHaveLength(3);
    expect(prompt.options[0]!.consequence).toMatch(
      /full field terms: The steading begins.*protects: Cade's byre.*leaves exposed: Albany's resident counter.*actual cost: 10 minutes/i,
    );
    expect(prompt.options[0]!.summary).toEqual({
      commitment: scene.options[0]!.summary,
      fieldTrigger: scene.options[0]!.trigger_category,
      fieldTriggerScope: "category",
      immediateCost: "10 minutes",
    });
    expect(prompt.options[1]!.consequence).toMatch(/actual cost: no added time/i);
    expect(formatOpeningReliefAllocationCost({ minutes: 5 })).toBe("5 minutes");
    expect(formatOpeningReliefAllocationCost({ minutes: 0 })).toBe("no added time");
    expect(Object.isFrozen(prompt)).toBe(true);
    expect(Object.isFrozen(prompt.options)).toBe(true);
    expect(Object.isFrozen(prompt.options[0])).toBe(true);
  });
});
