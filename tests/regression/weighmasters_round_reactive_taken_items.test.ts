/**
 * Regression for stale room-item prose in weighmasters_round: the
 * counting-house and warehouse floor kept placing taken evidence at its
 * starting position.
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

const loaded = loadParserPackFile("content/parser/pack/weighmasters_round.yaml");
if (!loaded.ok) throw new Error("weighmasters_round must compile");
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

describe("weighmasters_round rooms react to taken evidence", () => {
  it("removes the desk-corner receipt prose after the receipt is taken", () => {
    const s = play(initStateForParserPack(index, 53), ["take_deputy_receipt"]);

    expect(s.inventory).toContain("deputy_receipt");
    expect(s.flags["deputy_receipt_taken"]).toBe(true);
    expect(desc(s)).toContain("corner where the deputy's receipt form lay is bare now");
    expect(desc(s)).not.toContain("The deputy's receipt form lies folded");
    expect(lookNarration(s)).toBe(desc(s));
  });

  it("keeps the desk corner bare after the receipt is dropped", () => {
    const s = play(initStateForParserPack(index, 53), [
      "take_deputy_receipt",
      "drop_deputy_receipt",
    ]);

    expect(s.inventory).not.toContain("deputy_receipt");
    expect(s.flags["deputy_receipt_taken"]).toBe(true);
    expect(desc(s)).toContain("corner where the deputy's receipt form lay is bare now");
    expect(desc(s)).not.toContain("The deputy's receipt form lies folded");
    expect(lookNarration(s)).toBe(desc(s));
  });

  it("removes the measured-sample spot prose after the grain sample is taken", () => {
    const s = play(initStateForParserPack(index, 53), ["go_east", "take_grain_sample"]);

    expect(s.inventory).toContain("grain_sample");
    expect(s.flags["grain_sample_taken"]).toBe(true);
    expect(desc(s)).toContain("measured grain sample waited is empty now");
    expect(desc(s)).not.toContain("a measured grain sample waits near the marked sacks");
    expect(lookNarration(s)).toBe(desc(s));
  });

  it("keeps the measured-sample spot empty after the grain sample is dropped", () => {
    const s = play(initStateForParserPack(index, 53), [
      "go_east",
      "take_grain_sample",
      "drop_grain_sample",
    ]);

    expect(s.inventory).not.toContain("grain_sample");
    expect(s.flags["grain_sample_taken"]).toBe(true);
    expect(desc(s)).toContain("measured grain sample waited is empty now");
    expect(desc(s)).not.toContain("a measured grain sample waits near the marked sacks");
    expect(lookNarration(s)).toBe(desc(s));
  });
});
