/**
 * Regression for stale room-item prose in dyers_weight: the dye house kept
 * placing taken indigo cakes and copper tongs at their starting positions.
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

const loaded = loadParserPackFile("content/parser/pack/dyers_weight.yaml");
if (!loaded.ok) throw new Error("dyers_weight must compile");
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

const proveAdulteration = [
  "go_east",
  "take_acid_vial",
  "use_acid_vial_on_chalk_casks",
  "go_west",
  "use_acid_vial_on_dye_vat",
];

describe("dyers_weight dye house reacts to taken evidence and tools", () => {
  it("removes the indigo-cakes rack prose after the cakes are taken", () => {
    const s = play(initStateForParserPack(index, 29), ["take_indigo_cakes"]);

    expect(s.inventory).toContain("indigo_cakes");
    expect(desc(s)).toContain("curing rack is bare");
    expect(desc(s)).not.toContain("curing rack holds a dozen finished indigo cakes");
    expect(lookNarration(s)).toBe(desc(s));
  });

  it("removes the copper-tongs hook prose after the tongs are taken", () => {
    const s = play(initStateForParserPack(index, 29), ["take_copper_tongs"]);

    expect(s.inventory).toContain("copper_tongs");
    expect(desc(s)).toContain("hook by the vat is bare");
    expect(desc(s)).not.toContain("Long copper tongs hang by the vat");
    expect(lookNarration(s)).toBe(desc(s));
  });

  it("uses both-held dye-house text for observation and explicit LOOK", () => {
    const s = play(initStateForParserPack(index, 29), ["take_indigo_cakes", "take_copper_tongs"]);

    expect(desc(s)).toContain("finished indigo cakes and long copper tongs are with you");
    expect(desc(s)).not.toContain("curing rack holds a dozen finished indigo cakes");
    expect(desc(s)).not.toContain("Long copper tongs hang by the vat");
    expect(lookNarration(s)).toBe(desc(s));
  });

  it("keeps proved-adulteration text accurate when the cakes are held", () => {
    const s = play(initStateForParserPack(index, 29), ["take_indigo_cakes", ...proveAdulteration]);

    expect(s.flags["proved_adulteration"]).toBe(true);
    expect(s.inventory).toContain("indigo_cakes");
    expect(desc(s)).toContain("curing rack is bare where the indigo cakes were");
    expect(desc(s)).not.toContain("The indigo cakes on the rack are the product");
  });

  it("keeps proved-adulteration text accurate when the tongs are held", () => {
    const s = play(initStateForParserPack(index, 29), ["take_copper_tongs", ...proveAdulteration]);

    expect(s.flags["proved_adulteration"]).toBe(true);
    expect(s.inventory).toContain("copper_tongs");
    expect(desc(s)).toContain("hook by the vat is bare where the copper tongs hung");
    expect(desc(s)).not.toContain("Long copper tongs hang by the vat");
  });
});
