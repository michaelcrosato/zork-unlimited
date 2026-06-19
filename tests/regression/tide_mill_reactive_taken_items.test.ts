/**
 * Regression for stale room-item prose in tide_mill: the wheel-room and
 * tool-shed kept placing taken tools at their starting positions.
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

const loaded = loadParserPackFile("content/parser/pack/tide_mill.yaml");
if (!loaded.ok) throw new Error("tide_mill must compile");
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

describe("tide_mill rooms react to taken tools", () => {
  it("removes the crank-handle peg prose after the handle is taken and dropped", () => {
    const s = play(initStateForParserPack(index, 47), [
      "go_north",
      "take_crank_handle",
      "drop_crank_handle",
    ]);

    expect(s.inventory).not.toContain("crank_handle");
    expect(s.flags["crank_handle_taken"]).toBe(true);
    expect(desc(s)).toContain("crank-handle peg bare now");
    expect(desc(s)).not.toContain("handle itself hangs on a peg");
    expect(desc(s)).not.toContain("handle hangs on its peg");
    expect(lookNarration(s)).toBe(desc(s));
  });

  it("keeps the crank-handle peg bare after freeing only the brake-pawl", () => {
    const s = play(initStateForParserPack(index, 47), [
      "go_north",
      "take_crank_handle",
      "go_east",
      "take_crow_bar",
      "go_west",
      "use_crow_bar_on_brake_pawl",
    ]);

    expect(s.flags["crank_handle_taken"]).toBe(true);
    expect(s.flags["pawl_free"]).toBe(true);
    expect(desc(s)).toContain("empty peg beside it where the crank-handle hung");
    expect(desc(s)).not.toContain("handle hangs on its peg");
    expect(lookNarration(s)).toBe(desc(s));
  });

  it("keeps the crank-handle peg bare after clearing only the sluice", () => {
    const s = play(initStateForParserPack(index, 47), [
      "go_north",
      "take_crank_handle",
      "go_east",
      "take_billhook",
      "go_west",
      "go_west",
      "use_billhook_on_choked_sluice",
      "go_east",
    ]);

    expect(s.flags["crank_handle_taken"]).toBe(true);
    expect(s.flags["sluice_clear"]).toBe(true);
    expect(desc(s)).toContain("empty peg beside it where the crank-handle hung");
    expect(desc(s)).not.toContain("handle hangs on its peg");
    expect(lookNarration(s)).toBe(desc(s));
  });

  it("removes the billhook corner prose after the billhook is taken", () => {
    const s = play(initStateForParserPack(index, 47), ["go_north", "go_east", "take_billhook"]);

    expect(s.inventory).toContain("billhook");
    expect(s.flags["billhook_taken"]).toBe(true);
    expect(desc(s)).toContain("corner where the billhook leaned is empty now");
    expect(desc(s)).not.toContain("A long-hafted billhook leans in the corner");
    expect(lookNarration(s)).toBe(desc(s));
  });

  it("removes the crow-bar nail prose after the crow-bar is taken", () => {
    const s = play(initStateForParserPack(index, 47), ["go_north", "go_east", "take_crow_bar"]);

    expect(s.inventory).toContain("crow_bar");
    expect(s.flags["crow_bar_taken"]).toBe(true);
    expect(desc(s)).toContain("two nails that held the crow-bar are bare");
    expect(desc(s)).not.toContain("a heavy crow-bar hangs on two nails");
    expect(lookNarration(s)).toBe(desc(s));
  });

  it("keeps the tool-shed starting spots empty after the billhook and crow-bar are dropped", () => {
    const s = play(initStateForParserPack(index, 47), [
      "go_north",
      "go_east",
      "take_billhook",
      "take_crow_bar",
      "drop_billhook",
      "drop_crow_bar",
    ]);

    expect(s.inventory).not.toContain("billhook");
    expect(s.inventory).not.toContain("crow_bar");
    expect(s.flags["billhook_taken"]).toBe(true);
    expect(s.flags["crow_bar_taken"]).toBe(true);
    expect(desc(s)).toContain("corner where the billhook leaned is empty now");
    expect(desc(s)).toContain("two nails that held the crow-bar are bare");
    expect(desc(s)).not.toContain("A long-hafted billhook leans in the corner");
    expect(desc(s)).not.toContain("a heavy crow-bar hangs on two nails");
    expect(lookNarration(s)).toBe(desc(s));
  });
});
