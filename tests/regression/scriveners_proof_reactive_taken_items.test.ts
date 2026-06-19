/**
 * Regression for stale room-item prose in scriveners_proof: the front office
 * and study kept placing taken evidence/tools at their starting positions.
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

const loaded = loadParserPackFile("content/parser/pack/scriveners_proof.yaml");
if (!loaded.ok) throw new Error("scriveners_proof must compile");
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

describe("scriveners_proof rooms react to taken evidence and tools", () => {
  it("removes the deed-box prose after the disputed deed is taken", () => {
    const s = play(initStateForParserPack(index, 43), ["take_disputed_deed"]);

    expect(s.inventory).toContain("disputed_deed");
    expect(s.flags["disputed_deed_taken"]).toBe(true);
    expect(s.vars.score).toBe(20);
    expect(desc(s)).toContain("deed box on the corner of the desk stands open and empty now");
    expect(desc(s)).not.toContain("disputed deed lies folded inside it");
    expect(lookNarration(s)).toBe(desc(s));
  });

  it("keeps the deed box empty after the disputed deed is dropped", () => {
    const s = play(initStateForParserPack(index, 43), ["take_disputed_deed", "drop_disputed_deed"]);

    expect(s.inventory).not.toContain("disputed_deed");
    expect(s.flags["disputed_deed_taken"]).toBe(true);
    expect(desc(s)).toContain("deed box on the corner of the desk stands open and empty now");
    expect(desc(s)).not.toContain("disputed deed lies folded inside it");
    expect(lookNarration(s)).toBe(desc(s));
  });

  it("removes the inkwell prose after the penknife is taken", () => {
    const s = play(initStateForParserPack(index, 43), ["take_penknife"]);

    expect(s.inventory).toContain("penknife");
    expect(s.flags["penknife_taken"]).toBe(true);
    expect(desc(s)).toContain("inkwell tray is bare where the penknife rested");
    expect(desc(s)).not.toContain("A penknife rests against the inkwell");
    expect(lookNarration(s)).toBe(desc(s));
  });

  it("uses both-taken front-office prose after the deed and penknife are taken", () => {
    const s = play(initStateForParserPack(index, 43), ["take_disputed_deed", "take_penknife"]);

    expect(s.inventory).toContain("disputed_deed");
    expect(s.inventory).toContain("penknife");
    expect(desc(s)).toContain("deed box on the corner of the desk stands open and empty now");
    expect(desc(s)).toContain("inkwell tray is bare where the penknife rested");
    expect(desc(s)).not.toContain("disputed deed lies folded inside it");
    expect(desc(s)).not.toContain("A penknife rests against the inkwell");
    expect(lookNarration(s)).toBe(desc(s));
  });

  it("keeps front-office starting spots empty after the deed and penknife are dropped", () => {
    const s = play(initStateForParserPack(index, 43), [
      "take_disputed_deed",
      "take_penknife",
      "drop_disputed_deed",
      "drop_penknife",
    ]);

    expect(s.inventory).not.toContain("disputed_deed");
    expect(s.inventory).not.toContain("penknife");
    expect(s.flags["disputed_deed_taken"]).toBe(true);
    expect(s.flags["penknife_taken"]).toBe(true);
    expect(desc(s)).toContain("deed box on the corner of the desk stands open and empty now");
    expect(desc(s)).toContain("inkwell tray is bare where the penknife rested");
    expect(desc(s)).not.toContain("disputed deed lies folded inside it");
    expect(desc(s)).not.toContain("A penknife rests against the inkwell");
    expect(lookNarration(s)).toBe(desc(s));
  });

  it("removes the writing-case prose after the magnifier is taken and dropped", () => {
    const s = play(initStateForParserPack(index, 43), [
      "go_east",
      "go_north",
      "take_magnifier",
      "drop_magnifier",
    ]);

    expect(s.inventory).not.toContain("magnifier");
    expect(s.flags["magnifier_taken"]).toBe(true);
    expect(desc(s)).toContain("an empty fitted recess where the magnifying glass lay");
    expect(desc(s)).not.toContain("a fitted recess holding a small magnifying glass");
    expect(lookNarration(s)).toBe(desc(s));
  });
});
