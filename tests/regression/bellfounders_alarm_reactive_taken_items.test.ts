/**
 * Regression for stale room-item prose in bellfounders_alarm: the casting
 * floor kept placing the tuning hammer on its bench after it was taken.
 */
import { describe, it, expect } from "vitest";
import { loadRpgSourceFile } from "../../src/rpg/source.js";
import {
  indexRpgPack,
  buildRpgRules,
  initStateForRpgPack,
  enumerateRpgActions,
} from "../../src/rpg/runner.js";
import { buildRpgObservation } from "../../src/rpg/observation.js";
import { resolveRpgAction } from "../../src/rpg/legal_actions.js";
import { makeStep } from "../../src/core/engine.js";
import type { GameState } from "../../src/core/state.js";

const loaded = loadRpgSourceFile("content/rpg/pack/bellfounders_alarm.yaml");
if (!loaded.ok) throw new Error("bellfounders_alarm must compile");
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
  const res = resolveRpgAction(index, s, { type: "LOOK" });
  const effect = res?.effects[0];
  if (!effect || !("narrate" in effect)) throw new Error("LOOK produced no narration");
  return effect.narrate;
}

describe("bellfounders_alarm casting floor reacts to the taken tuning hammer", () => {
  it("removes the bench-hammer prose after the tuning hammer is taken", () => {
    const s = play(initStateForRpgPack(index, 61), ["go_east", "take_tuning_hammer"]);

    expect(s.inventory).toContain("tuning_hammer");
    expect(s.flags["tuning_hammer_taken"]).toBe(true);
    expect(desc(s)).toContain("sanded bench is bare where the tuning hammer lay");
    expect(desc(s)).not.toContain("a tuning hammer lies on a sanded bench");
    expect(lookNarration(s)).toBe(desc(s));
  });

  it("keeps the bench bare after the tuning hammer is dropped", () => {
    const s = play(initStateForRpgPack(index, 61), [
      "go_east",
      "take_tuning_hammer",
      "drop_tuning_hammer",
    ]);

    expect(s.inventory).not.toContain("tuning_hammer");
    expect(s.flags["tuning_hammer_taken"]).toBe(true);
    expect(desc(s)).toContain("sanded bench is bare where the tuning hammer lay");
    expect(desc(s)).not.toContain("a tuning hammer lies on a sanded bench");
    expect(lookNarration(s)).toBe(desc(s));
  });
});
