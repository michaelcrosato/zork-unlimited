/**
 * Regression for the stale room-item prose class in apothecaries_standard:
 * the shop counter named the suspect vial and glass drawstick as if they still
 * sat in their starting places after the player had taken them.
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

const loaded = loadParserPackFile("content/parser/pack/apothecaries_standard.yaml");
if (!loaded.ok) throw new Error("apothecaries_standard must compile");
const index = indexParserPack(loaded.compiled.pack);
const step = makeStep(buildParserRules(index));

function play(s: GameState, ids: string[]): GameState {
  for (const id of ids) {
    const opt = enumerateActions(index, s).find((o) => o.id === id);
    if (!opt)
      throw new Error(
        `"${id}" not legal in ${s.current}: [${enumerateActions(index, s)
          .map((o) => o.id)
          .join(", ")}]`,
      );
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

describe("apothecaries_standard shop counter reacts to taken evidence items", () => {
  it("removes the suspect-vial starting-position prose after the vial is taken", () => {
    const s = play(initStateForParserPack(index, 11), ["take_suspect_vial"]);

    expect(s.inventory).toContain("suspect_vial");
    expect(desc(s)).toContain("suspect vial is with you now");
    expect(desc(s)).not.toContain("single amber bottle has been set apart");
    expect(desc(s)).not.toContain("left by the physician");
  });

  it("removes the drawstick starting-position prose after the drawstick is taken", () => {
    const s = play(initStateForParserPack(index, 11), ["take_glass_drawstick"]);

    expect(s.inventory).toContain("glass_drawstick");
    expect(desc(s)).toContain("testing drawer below is empty");
    expect(desc(s)).not.toContain("testing drawer below holds the glass drawstick");
  });

  it("uses the both-held counter text for observation and explicit LOOK", () => {
    const s = play(initStateForParserPack(index, 11), [
      "take_suspect_vial",
      "take_glass_drawstick",
    ]);

    expect(desc(s)).toContain("suspect vial and glass drawstick are now in your evidence kit");
    expect(desc(s)).not.toContain("single amber bottle has been set apart");
    expect(desc(s)).not.toContain("testing drawer below holds the glass drawstick");
    expect(lookNarration(s)).toBe(desc(s));
  });

  it("keeps the comparison-complete text accurate when both evidence items are held", () => {
    const s = play(initStateForParserPack(index, 11), [
      "take_suspect_vial",
      "take_glass_drawstick",
      "use_glass_drawstick_on_suspect_vial",
      "use_glass_drawstick_on_dispensatory",
    ]);

    expect(s.flags["proved_substitution"]).toBe(true);
    expect(desc(s)).toContain("comparison complete");
    expect(desc(s)).toContain("suspect vial and glass drawstick are with you as evidence");
    expect(desc(s)).not.toContain("lie open side by side");
  });
});
