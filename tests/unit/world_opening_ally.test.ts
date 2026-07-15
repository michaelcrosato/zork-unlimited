import { describe, expect, it } from "vitest";

import { cloneCampaignCharacterState } from "../../src/world/campaign_character_state.js";
import {
  applyOpeningAllyOption,
  OpeningAllySchema,
  formatOpeningAllyCost,
} from "../../src/world/opening_ally.js";
import { presentOpeningAlly } from "../../src/world/opening_ally_presentation.js";
import { loadOverworldManifest } from "../../src/world/source.js";

const WORLD = loadOverworldManifest(process.cwd());
const ALLY = WORLD.opening_ally!;
const CHARACTER = WORLD.opening_registration!.profiles[0]!.character;

describe("opening ally contract", () => {
  it("presents capability, condition, exact cost, and one real joining bond", () => {
    const prompt = presentOpeningAlly(ALLY, CHARACTER);
    expect(prompt).toMatchObject({ id: ALLY.id, kind: "ally" });
    expect(prompt.message).toMatch(/capability:.*condition:/i);
    expect(prompt.options).toHaveLength(3);
    expect(prompt.options.map((option) => option.consequence)).toEqual([
      expect.stringMatching(/actual cost: 15 minutes/i),
      expect.stringMatching(/actual cost: 5 minutes/i),
      expect.stringMatching(/actual cost: no added time/i),
    ]);
    expect(formatOpeningAllyCost({ minutes: 0 })).toBe("no added time");

    const before = cloneCampaignCharacterState(CHARACTER);
    const joined = applyOpeningAllyOption({
      scene: ALLY,
      character: CHARACTER,
      optionId: "albany:ally_june_cattle_first",
    }).characterAfter;
    expect(joined.companions).toEqual(["albany:june_pike"]);
    expect(joined.promises).toContainEqual({
      promiseId: "albany:promise_june_cattle_first",
      recipientId: "albany:june_pike",
      status: "active",
    });
    expect(CHARACTER).toEqual(before);
  });

  it("rejects contracts without three distinct choices, one join, and a zero-time solo path", () => {
    const tooFew = structuredClone(ALLY);
    tooFew.options = tooFew.options.slice(0, 2);
    expect(OpeningAllySchema.safeParse(tooFew).success).toBe(false);

    const noJoin = structuredClone(ALLY);
    noJoin.options[0]!.effects = noJoin.options[0]!.effects.filter(
      (effect) => effect.type !== "add_companion" && effect.type !== "record_promise",
    );
    expect(OpeningAllySchema.safeParse(noJoin).success).toBe(false);

    const delayedSolo = structuredClone(ALLY);
    delayedSolo.options.find((option) => option.id === delayedSolo.solo_option_id)!.terms.minutes =
      1;
    expect(OpeningAllySchema.safeParse(delayedSolo).success).toBe(false);

    const wrongAlly = structuredClone(ALLY);
    const joinEffect = wrongAlly.options[0]!.effects.find(
      (effect) => effect.type === "add_companion",
    );
    if (!joinEffect || joinEffect.type !== "add_companion") throw new Error("missing join effect");
    joinEffect.npc_id = "npc:someone_else";
    expect(OpeningAllySchema.safeParse(wrongAlly).success).toBe(false);
  });
});
