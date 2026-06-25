/**
 * Regression for stale room-item prose in chandlers_lot: rooms kept placing
 * taken inspection tools and the adulteration book at their starting positions.
 */
import { describe, it, expect } from "vitest";
import { loadParserPackFile } from "../../src/parser/pack.js";
import {
  indexParserPack,
  buildParserRules,
  initStateForParserPack,
} from "../../src/parser/runner.js";
import { enumerateActions, resolveParserAction } from "../../src/parser/legal_actions.js";
import { buildParserObservation } from "../../src/parser/observation.js";
import { makeStep } from "../../src/core/engine.js";
import type { GameState } from "../../src/core/state.js";

const loaded = loadParserPackFile("content/parser/pack/chandlers_lot.yaml");
if (!loaded.ok) throw new Error("chandlers_lot must compile");
const index = indexParserPack(loaded.compiled.pack);
const step = makeStep(buildParserRules(index));

function play(s: GameState, ids: string[]): GameState {
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
  }
  return s;
}

const desc = (s: GameState): string => buildParserObservation(index, s).description;

function lookNarration(s: GameState): string {
  const res = resolveParserAction(index, s, { type: "LOOK" });
  const effect = res?.effects[0];
  if (!effect || !("narrate" in effect)) throw new Error("LOOK produced no narration");
  return effect.narrate;
}

describe("chandlers_lot rooms react to taken inspection items", () => {
  it("removes the lantern peg prose after the inspector's lantern is taken", () => {
    const s = play(initStateForParserPack(index, 19), ["take_inspector_lantern"]);

    expect(s.inventory).toContain("inspector_lantern");
    expect(desc(s)).toContain("peg by the door is bare");
    expect(desc(s)).not.toContain("inspector's lantern hangs from a peg");
    expect(lookNarration(s)).toBe(desc(s));
  });

  it("removes the wick-gauge nail prose after the gauge is taken", () => {
    const s = play(initStateForParserPack(index, 19), ["go_east", "take_wick_gauge"]);

    expect(s.inventory).toContain("wick_gauge");
    expect(desc(s)).toContain("nail where the wick gauge hung is bare");
    expect(desc(s)).not.toContain("A wick gauge hangs from a nail");
  });

  it("removes the snuffing-shears trough prose after the shears are taken", () => {
    const s = play(initStateForParserPack(index, 19), ["go_east", "take_snuffing_shears"]);

    expect(s.inventory).toContain("snuffing_shears");
    expect(desc(s)).toContain("bare where the snuffing shears rested");
    expect(desc(s)).not.toContain("snuffing shears rest near the trough");
  });

  it("uses both-held dipping-floor text for observation and explicit LOOK", () => {
    const s = play(initStateForParserPack(index, 19), [
      "go_east",
      "take_wick_gauge",
      "take_snuffing_shears",
    ]);

    expect(desc(s)).toContain("wick gauge and snuffing shears are with you");
    expect(desc(s)).not.toContain("A wick gauge hangs from a nail");
    expect(desc(s)).not.toContain("snuffing shears rest near the trough");
    expect(lookNarration(s)).toBe(desc(s));
  });

  it("removes the book-on-chest prose after the adulteration book is taken", () => {
    const s = play(initStateForParserPack(index, 19), [
      "go_east",
      "go_up",
      "take_adulteration_book",
    ]);

    expect(s.inventory).toContain("adulteration_book");
    expect(desc(s)).toContain("bare place where the adulteration book lay");
    expect(desc(s)).not.toContain("beside a plain adulteration book");
    expect(lookNarration(s)).toBe(desc(s));
  });

  it("keeps the proved wax-loft text accurate when the stamped book is held", () => {
    const s = play(initStateForParserPack(index, 19), [
      "take_inspector_lantern",
      "go_east",
      "take_wick_gauge",
      "take_snuffing_shears",
      "use_wick_gauge_on_false_candles",
      "use_snuffing_shears_on_proof_candle",
      "go_up",
      "take_adulteration_book",
      "use_adulteration_book_on_tallow_ledger",
      "use_inspector_lantern_on_adulteration_book",
    ]);

    expect(s.flags["fraud_proved"]).toBe(true);
    expect(desc(s)).toContain("false account no longer harmless after your stamp");
    expect(desc(s)).not.toContain("adulteration book no longer harmless on the chest");
    expect(desc(s)).not.toContain("beside a plain adulteration book");
  });
});
