/**
 * Regression for bug_0484 -- coroners_errand's medicine chest text must be
 * valid whether the player examines the chest before or after the dark bottle.
 *
 * A fresh blind pass (blind-tester/reports/20260623T005604Z_coroners_errand_seed7.md)
 * found that examining the dark bottle first and the medicine chest second made
 * the chest narration point forward to an action already completed.
 */
import { describe, expect, it } from "vitest";
import { makeStep } from "../../src/core/engine.js";
import type { GameState } from "../../src/core/state.js";
import { enumerateActions, resolveParserAction } from "../../src/parser/legal_actions.js";
import { buildParserObservation } from "../../src/parser/observation.js";
import { loadParserPackFile } from "../../src/parser/pack.js";
import {
  buildParserRules,
  indexParserPack,
  initStateForParserPack,
} from "../../src/parser/runner.js";
import { validateParser } from "../../src/validate/parser_validator.js";

const loaded = loadParserPackFile("content/parser/pack/coroners_errand.yaml");
if (!loaded.ok) throw new Error("coroners_errand must compile");
const pack = loaded.compiled.pack;
const index = indexParserPack(pack);
const step = makeStep(buildParserRules(index));

function playCapture(s: GameState, ids: string[]): { state: GameState; narration: string } {
  let narration = "";
  for (const id of ids) {
    const opt = enumerateActions(index, s).find((o) => o.id === id);
    if (!opt) {
      throw new Error(
        `"${id}" not legal in ${s.current}: [${enumerateActions(index, s)
          .map((o) => o.id)
          .join(", ")}]`,
      );
    }
    const result = step(s, opt.action);
    expect(result.ok).toBe(true);
    s = result.state;
    narration = result.events
      .filter((e): e is { type: "narration"; text: string } => e.type === "narration")
      .map((e) => e.text)
      .join(" ");
  }
  return { state: s, narration };
}

function play(s: GameState, ids: string[]): GameState {
  return playCapture(s, ids).state;
}

function examineNarration(s: GameState, target: string): string {
  const res = resolveParserAction(index, s, { type: "LOOK", target });
  const effect = res?.effects[0];
  if (!effect || !("narrate" in effect)) throw new Error(`no examine narration for ${target}`);
  return effect.narrate;
}

const TO_BACK_PASSAGE = ["take_commission", "go_north"];

const JUSTICE_ROUTE_AFTER_BACK_PASSAGE = [
  "go_south",
  "go_east",
  "use_commission_on_body",
  "take_sealed_letter",
  "go_north",
  "read_ledger",
  "read_draft_contract",
  "go_south",
  "go_west",
  "go_west",
  "use_commission_on_muddy_boots",
  "go_east",
  "go_south",
];

describe("bug_0484 -- coroners_errand medicine chest wording is order-neutral", () => {
  it("examining the chest before the bottle still identifies the displaced bottle without overpromising", () => {
    const { state, narration } = playCapture(initStateForParserPack(index, 7), [
      ...TO_BACK_PASSAGE,
      "use_commission_on_medicine_chest",
    ]);

    expect(state.flags["chest_examined"]).toBe(true);
    expect(state.flags["poison_identified"]).toBeUndefined();
    expect(narration).toMatch(/displaced bottle is the chest's\s+answer/i);
    expect(narration).not.toMatch(/USE your commission ON it/i);
    expect(buildParserObservation(index, state).score).toBe(10);
  });

  it("after the bottle is identified first, the chest prose acknowledges it instead of pointing backward", () => {
    const afterBottle = play(initStateForParserPack(index, 7), [
      ...TO_BACK_PASSAGE,
      "use_commission_on_nightshade_bottle",
    ]);
    const beforeChestText = examineNarration(afterBottle, "medicine_chest");

    expect(afterBottle.flags["poison_identified"]).toBe(true);
    expect(afterBottle.flags["chest_examined"]).toBeUndefined();
    expect(beforeChestText).toMatch(/dark bottle you documented as forged\s+nightshade/i);

    const { state, narration } = playCapture(afterBottle, ["use_commission_on_medicine_chest"]);
    expect(state.flags["chest_examined"]).toBe(true);
    expect(state.flags["poison_identified"]).toBe(true);
    expect(narration).toMatch(/displaced bottle is the chest's\s+answer/i);
    expect(narration).not.toMatch(/USE your commission ON it/i);
    expect(buildParserObservation(index, state).score).toBe(15);
  });

  it("both evidence orders still reach the full-score justice ending", () => {
    const chestFirst = play(initStateForParserPack(index, 7), [
      ...TO_BACK_PASSAGE,
      "use_commission_on_medicine_chest",
      "use_commission_on_nightshade_bottle",
      ...JUSTICE_ROUTE_AFTER_BACK_PASSAGE,
    ]);
    const bottleFirst = play(initStateForParserPack(index, 7), [
      ...TO_BACK_PASSAGE,
      "use_commission_on_nightshade_bottle",
      "use_commission_on_medicine_chest",
      ...JUSTICE_ROUTE_AFTER_BACK_PASSAGE,
    ]);

    for (const state of [chestFirst, bottleFirst]) {
      expect(state.ended).toBe(true);
      expect(state.endingId).toBe("ending_justice");
      expect(buildParserObservation(index, state).score).toBe(pack.meta.max_score);
    }
  });

  it("the pack validates clean", () => {
    const report = validateParser(pack);
    expect(report.ok).toBe(true);
    expect(report.findings).toHaveLength(0);
  });
});
