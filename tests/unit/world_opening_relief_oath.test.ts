import { describe, expect, it } from "vitest";

import {
  buildCampaignCharacterState,
  cloneCampaignCharacterState,
} from "../../src/world/campaign_character_state.js";
import {
  OPENING_RELIEF_OATH_OPTION_COUNT,
  OpeningReliefOathSchema,
  applyOpeningReliefOathOption,
  cloneOpeningReliefOath,
  formatOpeningReliefOathCost,
  openingReliefOathOptionById,
  parseOpeningReliefOath,
  type OpeningReliefOath,
} from "../../src/world/opening_relief_oath.js";
import { presentOpeningReliefOath } from "../../src/world/opening_relief_oath_presentation.js";

const CLERK = "albany:rowan_quill";

function reliefOathScene(): OpeningReliefOath {
  return parseOpeningReliefOath({
    version: 1,
    id: "albany:wolf_relief_oath",
    after_registration: "albany:relief_registration",
    target_quest: "wolf_winter",
    home: "albany_city",
    area: "albany_city__civic_core",
    contact: "albany_city__civic_core__contact",
    clerk_npc_id: CLERK,
    title: "Set the Wolf-Winter Duty",
    message:
      "Rowan separates permanent background from the terms under which this dispatch may use Albany's name.",
    options: [
      {
        id: "albany:oath_official_relief",
        kind: "official",
        title: "Take the Official Relief Oath",
        summary: "Carry Albany's public authority into the Wolf-Winter dispatch.",
        preview: "The full seal opens the public record and makes restraint a binding duty.",
        access: "Full emergency records and the sealed public stores.",
        duty: "Protect people and herd before property, then return a complete account.",
        consequence: "Rowan witnesses the official oath and enters it under your own name.",
        terms: { minutes: 10 },
        effects: [
          {
            type: "learn_knowledge",
            knowledge_id: "albany:knowledge_official_relief_oath",
          },
          {
            type: "affirm_value",
            value_id: "value:public_stewardship",
            strength_at_least: 4,
          },
          {
            type: "raise_faction_standing",
            faction_id: "faction:albany_relief_compact",
            standing_at_least: 4,
          },
          {
            type: "remember_relationship",
            npc_id: CLERK,
            memory_id: "albany:memory_rowan_witnessed_official_relief_oath",
            trust_at_least: 3,
            regard_at_least: 3,
          },
          {
            type: "record_promise",
            promise_id: "albany:promise_official_relief_duty",
            recipient_id: CLERK,
          },
        ],
      },
      {
        id: "albany:oath_limited_relief",
        kind: "limited",
        title: "Negotiate Limited Duty",
        summary: "Accept a bounded public commission for the named steading only.",
        preview: "The limited tag grants the route record but withholds unrestricted stores.",
        access: "Wolf-Winter route records and one witnessed emergency requisition.",
        duty: "Hold the byre if possible and report any departure from the named task.",
        consequence: "Rowan writes the limit into the margin before either of you signs.",
        terms: { minutes: 5 },
        effects: [
          {
            type: "learn_knowledge",
            knowledge_id: "albany:knowledge_limited_relief_oath",
          },
          {
            type: "affirm_value",
            value_id: "value:bounded_duty",
            strength_at_least: 4,
          },
          {
            type: "raise_faction_standing",
            faction_id: "faction:albany_relief_compact",
            standing_at_least: 2,
          },
          {
            type: "remember_relationship",
            npc_id: CLERK,
            memory_id: "albany:memory_rowan_negotiated_limited_relief_duty",
            trust_at_least: 2,
            regard_at_least: 3,
          },
          {
            type: "record_promise",
            promise_id: "albany:promise_limited_relief_duty",
            recipient_id: CLERK,
          },
        ],
      },
      {
        id: "albany:oath_unaffiliated_helper",
        kind: "unaffiliated",
        title: "Remain an Unaffiliated Helper",
        summary: "Carry the public facts without accepting Albany's command authority.",
        preview: "You keep independent judgment and receive no oath-gated requisition.",
        access: "The public Wolf-Winter docket and ordinary paid services.",
        duty: "No civic promise; your conduct and truthful return stand on their own.",
        consequence:
          "Rowan records the clean refusal and binds only your personal promise to return a truthful account.",
        terms: { minutes: 0 },
        effects: [
          {
            type: "learn_knowledge",
            knowledge_id: "albany:knowledge_unaffiliated_relief_terms",
          },
          {
            type: "affirm_value",
            value_id: "value:independent_judgment",
            strength_at_least: 4,
          },
          {
            type: "raise_faction_standing",
            faction_id: "faction:independent_carriers",
            standing_at_least: 2,
          },
          {
            type: "remember_relationship",
            npc_id: CLERK,
            memory_id: "albany:memory_rowan_recorded_unaffiliated_relief_terms",
            trust_at_least: 1,
            regard_at_least: 2,
          },
          {
            type: "record_promise",
            promise_id: "albany:promise_unaffiliated_truthful_return",
            recipient_id: CLERK,
          },
        ],
      },
    ],
  });
}

describe("opening relief oath authoring", () => {
  it("strictly parses one official, limited, and unaffiliated contract", () => {
    const scene = reliefOathScene();
    expect(OPENING_RELIEF_OATH_OPTION_COUNT).toBe(3);
    expect(OpeningReliefOathSchema.parse(scene)).toEqual(scene);
    expect(scene.options.map((option) => option.kind)).toEqual([
      "official",
      "limited",
      "unaffiliated",
    ]);

    const clone = cloneOpeningReliefOath(scene);
    expect(clone).not.toBe(scene);
    expect(clone.options[0]).not.toBe(scene.options[0]);
    clone.options[0]!.title = "Detached";
    expect(scene.options[0]!.title).toBe("Take the Official Relief Oath");

    expect(() => parseOpeningReliefOath({ ...scene, unexpected: true })).toThrow();
    expect(() =>
      parseOpeningReliefOath({ ...scene, options: scene.options.slice(0, 2) }),
    ).toThrow();

    const duplicateKind = cloneOpeningReliefOath(scene);
    duplicateKind.options[2]!.kind = "limited";
    expect(() => parseOpeningReliefOath(duplicateKind)).toThrow(/duplicate.*kind|exactly one/i);
  });

  it("requires the four durable identities and only disclosed effect families", () => {
    const requiredTypes = [
      ["learn_knowledge", /exactly one knowledge/i],
      ["affirm_value", /exactly one value/i],
      ["raise_faction_standing", /exactly one faction standing/i],
      ["remember_relationship", /exactly one clerk relationship memory/i],
    ] as const;
    for (const [effectType, message] of requiredTypes) {
      const missing = reliefOathScene();
      missing.options[0]!.effects = missing.options[0]!.effects.filter(
        (effect) => effect.type !== effectType,
      );
      expect(() => parseOpeningReliefOath(missing)).toThrow(message);
    }

    const forbidden = reliefOathScene();
    forbidden.options[0]!.effects.push({
      type: "set_world_fact",
      fact_id: "fact:forged_relief_oath",
    });
    expect(() => parseOpeningReliefOath(forbidden)).toThrow(/may teach knowledge.*duty promise/i);

    const wrongClerk = reliefOathScene();
    const memory = wrongClerk.options[0]!.effects.find(
      (effect) => effect.type === "remember_relationship",
    );
    if (!memory || memory.type !== "remember_relationship") throw new Error("expected memory");
    memory.npc_id = "albany:someone_else";
    expect(() => parseOpeningReliefOath(wrongClerk)).toThrow(/target the named clerk/i);

    const wrongRecipient = reliefOathScene();
    const promise = wrongRecipient.options[1]!.effects.find(
      (effect) => effect.type === "record_promise",
    );
    if (!promise || promise.type !== "record_promise") throw new Error("expected promise");
    promise.recipient_id = "albany:someone_else";
    expect(() => parseOpeningReliefOath(wrongRecipient)).toThrow(/bind the named clerk/i);
  });

  it("requires one disclosed promise on every branch and distinct option carriers", () => {
    const officialWithoutPromise = reliefOathScene();
    officialWithoutPromise.options[0]!.effects = officialWithoutPromise.options[0]!.effects.filter(
      (effect) => effect.type !== "record_promise",
    );
    expect(() => parseOpeningReliefOath(officialWithoutPromise)).toThrow(
      /every relief-oath option.*exactly one.*promise/i,
    );

    const unaffiliatedWithoutPromise = reliefOathScene();
    unaffiliatedWithoutPromise.options[2]!.effects =
      unaffiliatedWithoutPromise.options[2]!.effects.filter(
        (effect) => effect.type !== "record_promise",
      );
    expect(() => parseOpeningReliefOath(unaffiliatedWithoutPromise)).toThrow(
      /every relief-oath option.*exactly one.*promise/i,
    );

    const duplicateOption = reliefOathScene();
    duplicateOption.options[1]!.id = duplicateOption.options[0]!.id;
    expect(() => parseOpeningReliefOath(duplicateOption)).toThrow(/duplicate.*option id/i);

    const duplicateKnowledge = reliefOathScene();
    const firstKnowledge = duplicateKnowledge.options[0]!.effects.find(
      (effect) => effect.type === "learn_knowledge",
    );
    const secondKnowledge = duplicateKnowledge.options[1]!.effects.find(
      (effect) => effect.type === "learn_knowledge",
    );
    if (!firstKnowledge || !secondKnowledge) throw new Error("expected knowledge effects");
    secondKnowledge.knowledge_id = firstKnowledge.knowledge_id;
    expect(() => parseOpeningReliefOath(duplicateKnowledge)).toThrow(
      /knowledge.*repeated across options/i,
    );

    const duplicateValue = reliefOathScene();
    const firstValue = duplicateValue.options[0]!.effects.find(
      (effect) => effect.type === "affirm_value",
    );
    const secondValue = duplicateValue.options[1]!.effects.find(
      (effect) => effect.type === "affirm_value",
    );
    if (!firstValue || !secondValue) throw new Error("expected value effects");
    secondValue.value_id = firstValue.value_id;
    expect(() => parseOpeningReliefOath(duplicateValue)).toThrow(/value.*repeated across options/i);

    const duplicateMemory = reliefOathScene();
    const firstMemory = duplicateMemory.options[0]!.effects.find(
      (effect) => effect.type === "remember_relationship",
    );
    const secondMemory = duplicateMemory.options[1]!.effects.find(
      (effect) => effect.type === "remember_relationship",
    );
    if (!firstMemory || !secondMemory) throw new Error("expected memory effects");
    secondMemory.memory_id = firstMemory.memory_id;
    expect(() => parseOpeningReliefOath(duplicateMemory)).toThrow(
      /memory.*repeated across options/i,
    );

    const duplicatePromise = reliefOathScene();
    const firstPromise = duplicatePromise.options[0]!.effects.find(
      (effect) => effect.type === "record_promise",
    );
    const secondPromise = duplicatePromise.options[1]!.effects.find(
      (effect) => effect.type === "record_promise",
    );
    if (!firstPromise || !secondPromise) throw new Error("expected promise effects");
    secondPromise.promise_id = firstPromise.promise_id;
    expect(() => parseOpeningReliefOath(duplicatePromise)).toThrow(
      /promise.*repeated across options/i,
    );
  });
});

describe("opening relief oath application and presentation", () => {
  it("applies its value, standing, memory, knowledge, and promise atomically", () => {
    const scene = reliefOathScene();
    const character = buildCampaignCharacterState({
      values: [{ valueId: "value:public_stewardship", strength: 1 }],
      factionStanding: [{ factionId: "faction:albany_relief_compact", standing: 1 }],
    });
    const before = cloneCampaignCharacterState(character);
    const result = applyOpeningReliefOathOption({
      scene,
      character,
      optionId: "albany:oath_official_relief",
    });

    expect(character).toEqual(before);
    expect(result.characterAfter.knowledge).toContain("albany:knowledge_official_relief_oath");
    expect(result.characterAfter.values).toContainEqual({
      valueId: "value:public_stewardship",
      strength: 4,
    });
    expect(result.characterAfter.factionStanding).toContainEqual({
      factionId: "faction:albany_relief_compact",
      standing: 4,
    });
    expect(result.characterAfter.relationships).toContainEqual({
      npcId: CLERK,
      trust: 3,
      regard: 3,
      owesPlayer: 0,
      playerOwes: 0,
      memories: ["albany:memory_rowan_witnessed_official_relief_oath"],
    });
    expect(result.characterAfter.promises).toContainEqual({
      promiseId: "albany:promise_official_relief_duty",
      recipientId: CLERK,
      status: "active",
    });
    expect(result.terms).toEqual({ minutes: 10 });

    const conflicting = buildCampaignCharacterState({
      promises: [
        {
          promiseId: "albany:promise_official_relief_duty",
          recipientId: "albany:different_recipient",
          status: "active",
        },
      ],
    });
    const conflictingBefore = cloneCampaignCharacterState(conflicting);
    expect(() =>
      applyOpeningReliefOathOption({
        scene,
        character: conflicting,
        optionId: "albany:oath_official_relief",
      }),
    ).toThrow(/already bound to recipient/i);
    expect(conflicting).toEqual(conflictingBefore);
  });

  it("is replay-idempotent and has detached lookup behavior", () => {
    const scene = reliefOathScene();
    const first = applyOpeningReliefOathOption({
      scene,
      character: buildCampaignCharacterState(),
      optionId: "albany:oath_limited_relief",
    });
    const replay = applyOpeningReliefOathOption({
      scene,
      character: first.characterAfter,
      optionId: "albany:oath_limited_relief",
    });
    expect(replay.characterAfter).toEqual(first.characterAfter);

    const found = openingReliefOathOptionById(scene, first.option.id);
    expect(found).toEqual(first.option);
    expect(found).not.toBe(first.option);
    expect(openingReliefOathOptionById(scene, "albany:oath_missing")).toBeNull();

    const original = buildCampaignCharacterState();
    const before = cloneCampaignCharacterState(original);
    expect(() =>
      applyOpeningReliefOathOption({ scene, character: original, optionId: "albany:oath_missing" }),
    ).toThrow(/unknown opening relief oath option/i);
    expect(original).toEqual(before);
  });

  it("discloses access, duty, cost, and consequence for every branch", () => {
    const scene = reliefOathScene();
    const prompt = presentOpeningReliefOath(scene, buildCampaignCharacterState());

    expect(prompt).toMatchObject({
      id: scene.id,
      kind: "relief_oath",
      message:
        "Set the Wolf-Winter Duty. Rowan separates permanent background from the terms under which this dispatch may use Albany's name.",
    });
    expect(prompt.options).toHaveLength(3);
    expect(prompt.options[0]!.consequence).toMatch(
      /access: Full emergency records.*duty: Protect people and herd.*actual cost: 10 minutes.*witnesses the official oath/i,
    );
    expect(prompt.options[2]!.consequence).toMatch(/actual cost: no added time/i);
    expect(formatOpeningReliefOathCost({ minutes: 5 })).toBe("5 minutes");
    expect(formatOpeningReliefOathCost({ minutes: 0 })).toBe("no added time");
    expect(Object.isFrozen(prompt)).toBe(true);
    expect(Object.isFrozen(prompt.options)).toBe(true);
    expect(Object.isFrozen(prompt.options[0])).toBe(true);
  });
});
