/**
 * Regression for bug_0388 — Bellfounders' Alarm left Rusk attackable after the
 * clean bellcraft solution had made him yield in prose.
 */
import { describe, it, expect } from "vitest";
import { loadRpgSourceFile } from "../../src/rpg/source.js";
import { indexRpgPack, buildRpgRules, initStateForRpgPack } from "../../src/rpg/runner.js";
import { buildRpgObservation } from "../../src/rpg/observation.js";
import { makeStep, actionEquals } from "../../src/core/engine.js";
import type { RpgAction } from "../../src/api/types.js";
import type { GameState } from "../../src/core/state.js";

const loaded = loadRpgSourceFile("content/rpg/pack/bellfounders_alarm.yaml");
if (!loaded.ok) throw new Error("bellfounders_alarm must compile");
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

function hasAttackRusk(state: GameState): boolean {
  return rules.legalActions(state).some((a) => a.type === "ATTACK" && a.enemy === "rusk");
}

describe("bug_0388 — Rusk retires as an enemy after the bell is tuned", () => {
  it("keeps the combat fallback before tuning, but removes Rusk after he yields", () => {
    let state = initStateForRpgPack(index, 7);

    state = act(state, { type: "MOVE", direction: "north" });
    expect(state.current).toBe("ward_gate");
    expect(hasAttackRusk(state)).toBe(true);
    expect(buildRpgObservation(index, state).enemies_present.map((e) => e.id)).toContain("rusk");
    state = act(state, { type: "MOVE", direction: "south" });

    state = act(state, { type: "READ", target: "muster_warrant" });
    state = act(state, { type: "MOVE", direction: "west" });
    state = act(state, { type: "READ", target: "tone_table" });
    state = act(state, { type: "MOVE", direction: "east" });
    state = act(state, { type: "MOVE", direction: "east" });
    state = act(state, { type: "READ", target: "cracked_bell" });
    state = act(state, { type: "TAKE", item: "tuning_hammer" });
    state = act(state, { type: "USE", item: "tuning_hammer", target: "alarm_clapper" });
    expect(state.flags["bell_tuned"]).toBe(true);
    expect(state.flags["rusk_defeated"]).toBeUndefined();

    state = act(state, { type: "MOVE", direction: "west" });
    state = act(state, { type: "MOVE", direction: "north" });

    const obs = buildRpgObservation(index, state);
    expect(obs.description).toContain("Rusk lowers his staff");
    expect(obs.enemies_present).toEqual([]);
    expect(obs.available_actions.map((a) => a.id)).not.toContain("attack_rusk");
    expect(hasAttackRusk(state)).toBe(false);

    const forcedAttack = step(state, { type: "ATTACK", enemy: "rusk" });
    expect(forcedAttack.ok).toBe(false);
    expect(forcedAttack.rejectionReason).toBe("That action is not available right now.");

    state = act(state, { type: "MOVE", direction: "north" });
    expect(state.ended).toBe(true);
    expect(state.endingId).toBe("ending_alarm_raised");
    expect(state.vars["score"]).toBe(50);
  });
});
