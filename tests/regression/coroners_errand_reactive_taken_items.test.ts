/**
 * Regression for stale room-item prose in coroners_errand: rooms kept placing
 * taken legal evidence at its starting position.
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

const loaded = loadParserPackFile("content/parser/pack/coroners_errand.yaml");
if (!loaded.ok) throw new Error("coroners_errand must compile");
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

describe("coroners_errand rooms react to taken legal evidence", () => {
  it("removes the commission side-table prose after the commission is taken", () => {
    const s = play(initStateForParserPack(index, 23), ["take_commission"]);

    expect(s.inventory).toContain("commission");
    expect(desc(s)).toContain("side table by the door is bare now");
    expect(desc(s)).toContain("letter of commission safely with you");
    expect(desc(s)).not.toContain("letter of commission on the side table");
    expect(lookNarration(s)).toBe(desc(s));
  });

  it("removes the sealed-letter starting-position prose after the letter is taken", () => {
    const s = play(initStateForParserPack(index, 23), ["go_east", "take_sealed_letter"]);

    expect(s.inventory).toContain("sealed_letter");
    expect(desc(s)).toContain("place beside the dead man's hand is bare");
    expect(desc(s)).not.toContain("Beside the dead man's hand lies a sealed letter");
    expect(lookNarration(s)).toBe(desc(s));
  });

  it("keeps the examined-body study text accurate when the letter is held", () => {
    const s = play(initStateForParserPack(index, 23), [
      "take_commission",
      "go_east",
      "take_sealed_letter",
      "use_commission_on_body",
    ]);

    expect(s.flags["manner_known"]).toBe(true);
    expect(s.inventory).toContain("sealed_letter");
    expect(desc(s)).toContain("Rendell's sealed letter is with you now");
    expect(desc(s)).not.toContain("sealed letter lies where you found it");
    expect(desc(s)).not.toContain("Beside the dead man's hand lies a sealed letter");
    expect(lookNarration(s)).toBe(desc(s));
  });
});
