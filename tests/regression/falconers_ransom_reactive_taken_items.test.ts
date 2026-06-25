/**
 * Regression for stale room-item prose in falconers_ransom: the guest
 * chambers kept placing the folded bill at the satchel after it was taken.
 */
import { describe, it, expect } from "vitest";
import { loadRpgPackFile } from "../../src/rpg/pack.js";
import {
  indexRpgPack,
  buildRpgRules,
  initStateForRpgPack,
  enumerateRpgActions,
} from "../../src/rpg/runner.js";
import { buildRpgObservation } from "../../src/rpg/observation.js";
import { resolveParserAction } from "../../src/parser/legal_actions.js";
import { makeStep } from "../../src/core/engine.js";
import type { GameState } from "../../src/core/state.js";

const loaded = loadRpgPackFile("content/rpg/pack/falconers_ransom.yaml");
if (!loaded.ok) throw new Error("falconers_ransom must compile");
const index = indexRpgPack(loaded.compiled.pack);
const step = makeStep(buildRpgRules(index));

function play(s: GameState, ids: string[]): GameState {
  for (const id of ids) {
    const opt = enumerateRpgActions(index, s).find((o) => o.id === id);
    if (!opt) {
      throw new Error(
        `"${id}" not legal in ${s.current}: [${enumerateRpgActions(index, s)
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

const desc = (s: GameState): string => buildRpgObservation(index, s).description;

function lookNarration(s: GameState): string {
  const res = resolveParserAction(index, s, { type: "LOOK" });
  const effect = res?.effects[0];
  if (!effect || !("narrate" in effect)) throw new Error("LOOK produced no narration");
  return effect.narrate;
}

describe("falconers_ransom guest chambers react to the taken bill", () => {
  it("removes the satchel-document prose after the hidden bill is taken", () => {
    const s = play(initStateForRpgPack(index, 67), ["go_east", "take_hidden_bill"]);

    expect(s.inventory).toContain("hidden_bill");
    expect(s.flags["hidden_bill_taken"]).toBe(true);
    expect(desc(s)).toContain("folded document is no longer tucked at the satchel's lip");
    expect(desc(s)).not.toContain("A folded document lies half-under");
    expect(lookNarration(s)).toBe(desc(s));
  });

  it("keeps the satchel empty after the hidden bill is dropped", () => {
    const s = play(initStateForRpgPack(index, 67), [
      "go_east",
      "take_hidden_bill",
      "drop_hidden_bill",
    ]);

    expect(s.inventory).not.toContain("hidden_bill");
    expect(s.flags["hidden_bill_taken"]).toBe(true);
    expect(desc(s)).toContain("folded document is no longer tucked at the satchel's lip");
    expect(desc(s)).not.toContain("A folded document lies half-under");
    expect(lookNarration(s)).toBe(desc(s));
  });

  it("does not claim the bill is still in hand after it is read and dropped", () => {
    const s = play(initStateForRpgPack(index, 67), [
      "go_east",
      "take_hidden_bill",
      "read_hidden_bill",
      "drop_hidden_bill",
    ]);

    expect(s.inventory).not.toContain("hidden_bill");
    expect(s.flags["hidden_bill_taken"]).toBe(true);
    expect(s.flags["bill_read"]).toBe(true);
    expect(desc(s)).toContain("forged seal's tell is fixed in your head");
    expect(desc(s)).toContain("folded document is no longer hidden");
    expect(desc(s)).not.toContain("What you needed is in your hands");
    expect(lookNarration(s)).toBe(desc(s));
  });
});
