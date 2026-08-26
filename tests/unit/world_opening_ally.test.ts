import { describe, expect, it } from "vitest";

import { cloneCampaignCharacterState } from "../../src/world/campaign_character_state.js";
import {
  OPENING_SELECTION_RECEIPT_WORD_LIMIT,
  openingSelectionReceiptWordCount,
} from "../../src/world/opening_choice_receipt.js";
import {
  applyOpeningAllyOption,
  OpeningAllySchema,
  formatOpeningAllyChoiceTiming,
  formatOpeningAllyCost,
  formatOpeningAllyTimingDisclosure,
  openingAllyContactTimingSummary,
  openingAllyTotalTimingSummary,
} from "../../src/world/opening_ally.js";
import { presentOpeningAlly } from "../../src/world/opening_ally_presentation.js";
import { loadOverworldManifest } from "../../src/world/source.js";

const WORLD = loadOverworldManifest(process.cwd());
const ALLY = WORLD.opening_ally!;
const CHARACTER = WORLD.opening_registration!.profiles[0]!.character;

describe("opening ally contract", () => {
  it("presents capability, condition, additional and total time, and one real joining bond", () => {
    const prompt = presentOpeningAlly(ALLY, CHARACTER);
    const exactBenefits = [
      "June joins and controls cattle safety",
      "June refuses and does not join",
      "Travel alone; no ally action",
    ] as const;
    expect(prompt).toMatchObject({ id: ALLY.id, kind: "ally" });
    expect(prompt.message).toBe(`${ALLY.title}. ${ALLY.message}`);
    expect(prompt.options).toHaveLength(3);
    expect(prompt.options.find((option) => option.id === ALLY.solo_option_id)?.label).toBe(
      "Travel Alone",
    );
    prompt.options.forEach((option, index) => {
      const authored = ALLY.options[index]!;
      const cost = formatOpeningAllyChoiceTiming(authored.terms);
      expect(option.summary).toEqual({
        commitment: authored.summary,
        immediateCost: cost,
        tradeoff: authored.tradeoff,
      });
      expect(Object.keys(option.summary ?? {}).sort()).toEqual([
        "commitment",
        "immediateCost",
        "tradeoff",
      ]);
      expect(option.consequence).toBe(
        `Benefit: ${exactBenefits[index]} Cost: ${cost}. Tradeoff: ${authored.tradeoff}`,
      );
      expect(option.consequence).not.toContain(authored.preview);
      expect(openingSelectionReceiptWordCount(option.consequence)).toBeLessThanOrEqual(
        OPENING_SELECTION_RECEIPT_WORD_LIMIT,
      );
    });
    expect(formatOpeningAllyCost({ minutes: 0 })).toBe("no added time");
    expect(formatOpeningAllyTimingDisclosure({ minutes: 15 })).toBe(
      "Conversation: 15 minutes. Choice adds: 15 minutes. Total: 30 minutes.",
    );
    expect(formatOpeningAllyChoiceTiming({ minutes: 15 })).toBe(
      "15-minute talk + 15 minutes additional; 30 minutes total",
    );
    expect(openingAllyContactTimingSummary(ALLY)).toBe(
      "Talking takes 15 minutes. Let June Control Cattle Safety: 15 minutes additional, 30 minutes total; Ask June to Follow Your Orders: 5 minutes additional, 20 minutes total; Travel Alone: no added time, 15 minutes total.",
    );
    expect(openingAllyContactTimingSummary(ALLY, true)).toBe(
      "The 15-minute conversation is already recorded. Reviewing it adds 0 minutes. Let June Control Cattle Safety: 15 minutes additional, 30 minutes total; Ask June to Follow Your Orders: 5 minutes additional, 20 minutes total; Travel Alone: no added time, 15 minutes total.",
    );
    expect(openingAllyTotalTimingSummary(ALLY)).toBe(
      "All totals include the 15-minute conversation: Let June Control Cattle Safety: 15 minutes additional, 30 minutes total; Ask June to Follow Your Orders: 5 minutes additional, 20 minutes total; Travel Alone: no added time, 15 minutes total.",
    );

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

    const woundedAtOffer = structuredClone(ALLY);
    woundedAtOffer.options[0]!.effects.push({
      type: "suffer_wound",
      wound_id: "wound:opening_ally_shortcut",
      severity: 2,
      treatment: "untreated",
      health_loss: 6,
    });
    expect(() => OpeningAllySchema.parse(woundedAtOffer)).toThrow(/cannot apply wounds/i);
  });
});
