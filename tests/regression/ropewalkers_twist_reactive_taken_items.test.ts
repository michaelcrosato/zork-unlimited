/**
 * Regression for stale room-item prose in ropewalkers_twist: the office and
 * rope shed kept placing taken inspection tools at their starting positions.
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

const loaded = loadParserPackFile("content/parser/pack/ropewalkers_twist.yaml");
if (!loaded.ok) throw new Error("ropewalkers_twist must compile");
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

describe("ropewalkers_twist rooms react to taken inspection items", () => {
  it("removes the token desk prose after the inspector's token is taken", () => {
    const s = play(initStateForParserPack(index, 41), ["take_inspector_token"]);

    expect(s.inventory).toContain("inspector_token");
    expect(s.flags["inspector_token_taken"]).toBe(true);
    expect(desc(s)).toContain("the place beside it is bare where the inspector's token lay");
    expect(desc(s)).not.toContain("desk beside the inspector's token");
    expect(lookNarration(s)).toBe(desc(s));
  });

  it("keeps the token desk bare after the token is dropped", () => {
    const s = play(initStateForParserPack(index, 41), [
      "take_inspector_token",
      "drop_inspector_token",
    ]);

    expect(s.inventory).not.toContain("inspector_token");
    expect(s.flags["inspector_token_taken"]).toBe(true);
    expect(desc(s)).toContain("the place beside it is bare where the inspector's token lay");
    expect(desc(s)).not.toContain("desk beside the inspector's token");
    expect(lookNarration(s)).toBe(desc(s));
  });

  it("removes the gauge nail prose after the twist gauge is taken", () => {
    const s = play(initStateForParserPack(index, 41), ["go_east", "take_twist_gauge"]);

    expect(s.inventory).toContain("twist_gauge");
    expect(s.flags["twist_gauge_taken"]).toBe(true);
    expect(desc(s)).toContain("nail near the first post is bare where the twist gauge hung");
    expect(desc(s)).not.toContain("A twist gauge hangs on a nail near the first post");
    expect(lookNarration(s)).toBe(desc(s));
  });

  it("removes the knife block prose after the marking knife is taken", () => {
    const s = play(initStateForParserPack(index, 41), ["go_east", "take_marking_knife"]);

    expect(s.inventory).toContain("marking_knife");
    expect(s.flags["marking_knife_taken"]).toBe(true);
    expect(desc(s)).toContain("the block is bare where the marking knife lay");
    expect(desc(s)).not.toContain("a marking knife lies on a block");
    expect(lookNarration(s)).toBe(desc(s));
  });

  it("uses both-taken shed prose after the gauge and knife are taken", () => {
    const s = play(initStateForParserPack(index, 41), [
      "go_east",
      "take_twist_gauge",
      "take_marking_knife",
    ]);

    expect(s.inventory).toContain("twist_gauge");
    expect(s.inventory).toContain("marking_knife");
    expect(desc(s)).toContain("The nail near the first post and the block beside it");
    expect(desc(s)).not.toContain("A twist gauge hangs on a nail near the first post");
    expect(desc(s)).not.toContain("a marking knife lies on a block");
    expect(lookNarration(s)).toBe(desc(s));
  });

  it("keeps the shed starting spots empty after the gauge and knife are dropped", () => {
    const s = play(initStateForParserPack(index, 41), [
      "go_east",
      "take_twist_gauge",
      "take_marking_knife",
      "drop_twist_gauge",
      "drop_marking_knife",
    ]);

    expect(s.inventory).not.toContain("twist_gauge");
    expect(s.inventory).not.toContain("marking_knife");
    expect(s.flags["twist_gauge_taken"]).toBe(true);
    expect(s.flags["marking_knife_taken"]).toBe(true);
    expect(desc(s)).toContain("The nail near the first post and the block beside it");
    expect(desc(s)).not.toContain("A twist gauge hangs on a nail near the first post");
    expect(desc(s)).not.toContain("a marking knife lies on a block");
    expect(lookNarration(s)).toBe(desc(s));
  });
});
