/**
 * Regression for stale room-item prose in assayers_mark: the assay hall and
 * record room kept placing taken evidence at its starting position.
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

const loaded = loadParserPackFile("content/parser/pack/assayers_mark.yaml");
if (!loaded.ok) throw new Error("assayers_mark must compile");
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

describe("assayers_mark rooms react to taken evidence items", () => {
  it("removes the silver-plate starting-position prose after the plate is taken", () => {
    const s = play(initStateForParserPack(index, 13), ["take_silver_plate"]);

    expect(s.inventory).toContain("silver_plate");
    expect(desc(s)).toContain("broad silver porringer is with you now");
    expect(desc(s)).not.toContain("centre of the bench -- a broad silver porringer");
    expect(desc(s)).not.toContain("awaiting judgment");
  });

  it("removes the acid-vial starting-position prose after the aqua fortis is taken", () => {
    const s = play(initStateForParserPack(index, 13), ["take_aqua_fortis"]);

    expect(s.inventory).toContain("aqua_fortis");
    expect(desc(s)).toContain("aqua fortis vial is with you now");
    expect(desc(s)).not.toContain("glass vial of aqua fortis in its wooden stand");
  });

  it("uses both-held assay hall text for observation and explicit LOOK", () => {
    const s = play(initStateForParserPack(index, 13), ["take_silver_plate", "take_aqua_fortis"]);

    expect(desc(s)).toContain("porringer and the aqua fortis vial are with you now");
    expect(desc(s)).not.toContain("glass vial of aqua fortis in its wooden stand");
    expect(desc(s)).not.toContain("centre of the bench -- a broad silver porringer");
    expect(lookNarration(s)).toBe(desc(s));
  });

  it("keeps the completed assay hall text accurate when both assay items are held", () => {
    const s = play(initStateForParserPack(index, 13), [
      "take_silver_plate",
      "take_aqua_fortis",
      "use_silver_plate_on_touchstone",
      "use_aqua_fortis_on_touchstone",
    ]);

    expect(s.flags["proved_debased"]).toBe(true);
    expect(desc(s)).toContain("porringer and acid vial are with you now");
    expect(desc(s)).toContain("assay complete");
    expect(desc(s)).not.toContain("aqua fortis has spoken");
  });

  it("removes the commission-paper box prose after the paper is taken", () => {
    const s = play(initStateForParserPack(index, 13), ["go_west", "take_commission_paper"]);

    expect(s.inventory).toContain("commission_paper");
    expect(desc(s)).toContain("Fitch's commission paper is with you now");
    expect(desc(s)).not.toContain("commission papers are in the open box");
    expect(lookNarration(s)).toBe(desc(s));
  });
});
