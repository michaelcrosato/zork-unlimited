/**
 * Regression for stale room-item prose in cellarmans_dark: room descriptions
 * kept placing taken cellar tools and the deed-box at their starting positions.
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

const loaded = loadParserPackFile("content/parser/pack/cellarmans_dark.yaml");
if (!loaded.ok) throw new Error("cellarmans_dark must compile");
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

describe("cellarmans_dark rooms react to taken cellar items", () => {
  it("removes the oil-lamp bracket prose after the lamp is taken", () => {
    const s = play(initStateForParserPack(index, 17), ["go_down", "take_lamp"]);

    expect(s.inventory).toContain("lamp");
    expect(desc(s)).toContain("lamp-bracket on the pillar is empty now");
    expect(desc(s)).not.toContain("from it hangs an oil-lamp");
    expect(desc(s)).not.toContain("reservoir bone-dry");
  });

  it("removes the tinderbox ledge prose after the tinderbox is taken", () => {
    const s = play(initStateForParserPack(index, 17), ["go_down", "take_tinderbox"]);

    expect(s.inventory).toContain("tinderbox");
    expect(desc(s)).toContain("ledge beside the bracket is bare");
    expect(desc(s)).not.toContain("A tinderbox sits on the ledge");
  });

  it("uses both-held ale-cellar text for observation and explicit LOOK", () => {
    const s = play(initStateForParserPack(index, 17), ["go_down", "take_lamp", "take_tinderbox"]);

    expect(desc(s)).toContain("oil-lamp and tinderbox are with you");
    expect(desc(s)).not.toContain("from it hangs an oil-lamp");
    expect(desc(s)).not.toContain("A tinderbox sits on the ledge");
    expect(lookNarration(s)).toBe(desc(s));
  });

  it("keeps the lit-cellar text accurate when the lit lamp and tinderbox are held", () => {
    const s = play(initStateForParserPack(index, 17), [
      "go_down",
      "take_lamp",
      "take_tinderbox",
      "go_east",
      "take_oil_jar",
      "go_west",
      "use_oil_jar_on_lamp",
      "use_tinderbox_on_lamp",
    ]);

    expect(s.flags["lamp_lit"]).toBe(true);
    expect(desc(s)).toContain("old lamp in your hand");
    expect(desc(s)).toContain("tinderbox also in your kit");
    expect(desc(s)).not.toContain("The tinderbox is on its ledge");
  });

  it("keeps the lit-cellar text accurate when only the tinderbox is held", () => {
    const s = play(initStateForParserPack(index, 17), [
      "go_down",
      "take_tinderbox",
      "go_east",
      "take_oil_jar",
      "go_west",
      "use_oil_jar_on_lamp",
      "use_tinderbox_on_lamp",
    ]);

    expect(s.flags["lamp_lit"]).toBe(true);
    expect(s.inventory).not.toContain("lamp");
    expect(desc(s)).toContain("old lamp on its bracket");
    expect(desc(s)).toContain("tinderbox is with you now");
    expect(desc(s)).not.toContain("The tinderbox is on its ledge");
  });

  it("removes the deed-box starting-position prose after the deed-box is taken", () => {
    const s = play(initStateForParserPack(index, 17), [
      "go_down",
      "take_lamp",
      "take_tinderbox",
      "go_east",
      "take_oil_jar",
      "go_west",
      "use_oil_jar_on_lamp",
      "use_tinderbox_on_lamp",
      "go_west",
      "take_deed_box",
    ]);

    expect(s.inventory).toContain("deed_box");
    expect(s.flags["found_deeds"]).toBe(true);
    expect(desc(s)).toContain("bare mark on the stone floor");
    expect(desc(s)).toContain("deed-box stood before you took it");
    expect(desc(s)).not.toContain("a deed-box of black iron stands beside");
    expect(lookNarration(s)).toBe(desc(s));
  });
});
