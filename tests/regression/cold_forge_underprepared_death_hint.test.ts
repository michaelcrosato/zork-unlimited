/**
 * Regression for bug_0391 — Cold Forge's underprepared sentinel death did not
 * tell the player which optional preparation mattered.
 */
import { describe, it, expect } from "vitest";
import { loadRpgSourceFile } from "../../src/rpg/source.js";
import { indexRpgPack, buildRpgRules, initStateForRpgPack } from "../../src/rpg/runner.js";
import { buildRpgObservation } from "../../src/rpg/observation.js";
import { makeStep, actionEquals } from "../../src/core/engine.js";
import type { RpgAction } from "../../src/api/types.js";
import type { GameState } from "../../src/core/state.js";

const loaded = loadRpgSourceFile("content/rpg/pack/cold_forge.yaml");
if (!loaded.ok) throw new Error("cold_forge must compile");
const index = indexRpgPack(loaded.compiled.pack);
const rules = buildRpgRules(index);
const step = makeStep(rules);

function act(state: GameState, RpgAction: RpgAction): GameState {
  expect(
    rules.legalActions(state).some((a) => actionEquals(a, RpgAction)),
    `RpgAction ${JSON.stringify(RpgAction)} must be legal in ${state.current}`,
  ).toBe(true);
  const result = step(state, RpgAction);
  expect(result.ok, result.rejectionReason).toBe(true);
  return result.state;
}

describe("bug_0391 — underprepared sentinel deaths point back to preparation", () => {
  it("names the spirit counsel and founder's plate when a rusher dies under-armed", () => {
    let state = initStateForRpgPack(index, 1);
    state = act(state, { type: "MOVE", direction: "down" });
    state = act(state, { type: "MOVE", direction: "north" });

    for (let rounds = 0; !state.ended && rounds < 20; rounds++) {
      state = act(state, { type: "ATTACK", enemy: "slag_sentinel" });
    }

    expect(state.ended).toBe(true);
    expect(state.endingId).toBe("ending_fallen");
    expect(state.flags["heard_sentinel"]).toBeUndefined();
    expect(state.flags["plate_donned"]).toBeUndefined();

    const obs = buildRpgObservation(index, state);
    expect(obs.ending!.text).toContain("spirit's borrowed warmth");
    expect(obs.ending!.text).toContain("dead master's cold-iron plate");
    expect(obs.ending!.text).toContain("armed with every lesson");
    expect(obs.description).toContain("spirit's borrowed warmth");
  });
});
