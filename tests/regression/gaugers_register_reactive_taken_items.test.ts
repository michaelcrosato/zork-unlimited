/**
 * Regression for stale room-item prose in gaugers_register: the weighing room
 * kept placing the marked stave and crowbar at their starting positions.
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

const loaded = loadParserPackFile("content/parser/pack/gaugers_register.yaml");
if (!loaded.ok) throw new Error("gaugers_register must compile");
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

describe("gaugers_register weighing room reacts to taken tools", () => {
  it("removes the marked-stave peg prose after the stave is taken", () => {
    const s = play(initStateForParserPack(index, 37), ["go_north", "take_marked_stave"]);

    expect(s.inventory).toContain("marked_stave");
    expect(s.flags["marked_stave_taken"]).toBe(true);
    expect(desc(s)).toContain("peg beside the beam is bare");
    expect(desc(s)).not.toContain("marked stave hangs on a peg beside the beam");
    expect(lookNarration(s)).toBe(desc(s));
  });

  it("removes the crowbar wall prose after the crowbar is taken", () => {
    const s = play(initStateForParserPack(index, 37), ["go_north", "take_crowbar"]);

    expect(s.inventory).toContain("crowbar");
    expect(s.flags["crowbar_taken"]).toBe(true);
    expect(desc(s)).toContain("south wall is bare where the crowbar leaned");
    expect(desc(s)).not.toContain("A crowbar leans against the south wall");
    expect(lookNarration(s)).toBe(desc(s));
  });

  it("uses both-taken text after the stave and crowbar are taken", () => {
    const s = play(initStateForParserPack(index, 37), [
      "go_north",
      "take_marked_stave",
      "take_crowbar",
    ]);

    expect(s.inventory).toContain("marked_stave");
    expect(s.inventory).toContain("crowbar");
    expect(desc(s)).toContain("crowbar and marked stave started the night");
    expect(desc(s)).not.toContain("A crowbar leans against the south wall");
    expect(desc(s)).not.toContain("marked stave hangs on a peg beside the beam");
    expect(lookNarration(s)).toBe(desc(s));
  });

  it("keeps starting positions empty after taken tools are dropped", () => {
    const s = play(initStateForParserPack(index, 37), [
      "go_north",
      "take_marked_stave",
      "take_crowbar",
      "drop_marked_stave",
      "drop_crowbar",
    ]);

    expect(s.inventory).not.toContain("marked_stave");
    expect(s.inventory).not.toContain("crowbar");
    expect(s.flags["marked_stave_taken"]).toBe(true);
    expect(s.flags["crowbar_taken"]).toBe(true);
    expect(desc(s)).toContain("crowbar and marked stave started the night");
    expect(desc(s)).not.toContain("A crowbar leans against the south wall");
    expect(desc(s)).not.toContain("marked stave hangs on a peg beside the beam");
    expect(lookNarration(s)).toBe(desc(s));
  });
});
