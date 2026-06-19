/**
 * Regression for stale room-item prose in friars_postern: the turnkey's lodge
 * kept placing the key-ring on its peg after the player had taken it.
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

const loaded = loadParserPackFile("content/parser/pack/friars_postern.yaml");
if (!loaded.ok) throw new Error("friars_postern must compile");
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

describe("friars_postern lodge reacts to the taken key-ring", () => {
  it("removes the key-ring peg prose after the ring is taken", () => {
    const s = play(initStateForParserPack(index, 31), ["go_north", "go_east", "take_gate_key"]);

    expect(s.inventory).toContain("gate_key");
    expect(s.flags["key_ring_taken"]).toBe(true);
    expect(desc(s)).toContain("peg behind him is bare");
    expect(desc(s)).not.toContain("A peg behind him holds his key-ring");
    expect(lookNarration(s)).toBe(desc(s));
  });

  it("keeps the peg bare after the taken ring is dropped", () => {
    const s = play(initStateForParserPack(index, 31), [
      "go_north",
      "go_east",
      "take_gate_key",
      "drop_gate_key",
    ]);

    expect(s.inventory).not.toContain("gate_key");
    expect(s.flags["key_ring_taken"]).toBe(true);
    expect(desc(s)).toContain("peg behind him is bare");
    expect(desc(s)).not.toContain("A peg behind him holds his key-ring");
    expect(lookNarration(s)).toBe(desc(s));
  });
});
