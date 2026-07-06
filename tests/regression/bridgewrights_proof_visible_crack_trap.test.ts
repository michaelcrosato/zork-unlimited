/**
 * Regression for bug_0444: Bridgewrights' Proof warned players not to strike
 * the visible crack, but no such wrong RpgAction existed. The warning now maps to
 * a real trap RpgAction while the proper engineering route remains full-score.
 */
import { describe, expect, it } from "vitest";
import { makeStep, actionEquals } from "../../src/core/engine.js";
import type { RpgAction } from "../../src/api/types.js";
import type { GameState } from "../../src/core/state.js";
import { loadRpgSourceFile } from "../../src/rpg/source.js";
import {
  buildRpgRules,
  enumerateRpgActions,
  indexRpgPack,
  initStateForRpgPack,
} from "../../src/rpg/runner.js";
import { buildRpgObservation } from "../../src/rpg/observation.js";

const loaded = loadRpgSourceFile("content/rpg/pack/bridgewrights_proof.yaml");
if (!loaded.ok) throw new Error("bridgewrights_proof must compile");
const index = indexRpgPack(loaded.compiled.pack);
const rules = buildRpgRules(index);
const step = makeStep(rules);

function act(state: GameState, RpgAction: RpgAction): GameState {
  expect(
    rules.legalActions(state).some((legal) => actionEquals(legal, RpgAction)),
    `RpgAction ${JSON.stringify(RpgAction)} must be legal in ${state.current}`,
  ).toBe(true);
  const result = step(state, RpgAction);
  expect(result.ok, result.rejectionReason).toBe(true);
  return result.state;
}

function actionIds(state: GameState): string[] {
  return enumerateRpgActions(index, state).map((option) => option.id);
}

function actionCommands(state: GameState): string[] {
  return enumerateRpgActions(index, state).map((option) => option.command);
}

const score = (state: GameState): number => buildRpgObservation(index, state).score;

describe("bug_0444 - Bridgewrights visible-crack warning has teeth", () => {
  it("offers a distinct wrong strike after the player takes the brace mallet", () => {
    let state = initStateForRpgPack(index, 7);
    state = act(state, { type: "MOVE", direction: "east" });
    state = act(state, { type: "READ", target: "truss_plan" });
    state = act(state, { type: "TAKE", item: "brace_mallet" });
    state = act(state, { type: "MOVE", direction: "west" });

    expect(buildRpgObservation(index, state).visible_objects.map((object) => object.id)).toContain(
      "visible_crack",
    );
    expect(actionIds(state)).toContain("use_brace_mallet_on_cracked_kingpost");
    expect(actionIds(state)).toContain("use_brace_mallet_on_visible_crack");
    expect(actionCommands(state)).toContain("brace cracked kingpost with brace mallet");
    expect(actionCommands(state)).toContain("strike visible crack with brace mallet");
  });

  it("turns the warned-against crack strike into the failed-brace state", () => {
    let state = initStateForRpgPack(index, 7);
    state = act(state, { type: "MOVE", direction: "east" });
    state = act(state, { type: "READ", target: "truss_plan" });
    state = act(state, { type: "TAKE", item: "brace_mallet" });
    state = act(state, { type: "MOVE", direction: "west" });

    state = act(state, { type: "USE", item: "brace_mallet", target: "visible_crack" });

    expect(state.flags["brace_attempted"]).toBe(true);
    expect(state.ended).toBe(false);
    expect(score(state)).toBe(10);
    expect(state.journal.at(-1)).toMatch(/visible crack.*compression side/i);
    expect(actionIds(state)).not.toContain("use_brace_mallet_on_cracked_kingpost");
    expect(actionIds(state)).not.toContain("use_brace_mallet_on_visible_crack");
    expect(buildRpgObservation(index, state).description).toMatch(/failed bracing attempt/i);
  });

  it("keeps the proper engineering route at the route-specific 50/50 ending", () => {
    let state = initStateForRpgPack(index, 7);
    state = act(state, { type: "READ", target: "closure_order" });
    state = act(state, { type: "MOVE", direction: "east" });
    state = act(state, { type: "READ", target: "truss_plan" });
    state = act(state, { type: "TAKE", item: "brace_mallet" });
    state = act(state, { type: "MOVE", direction: "west" });
    state = act(state, { type: "MOVE", direction: "west" });
    state = act(state, { type: "READ", target: "pier_marks" });
    state = act(state, { type: "MOVE", direction: "east" });
    state = act(state, { type: "USE", item: "brace_mallet", target: "cracked_kingpost" });

    expect(state.ended).toBe(true);
    expect(state.endingId).toBe("ending_bridge_closed");
    expect(score(state)).toBe(50);
    const observation = buildRpgObservation(index, state);
    expect(observation.ending!.text).toContain("kingpost sits under a proper brace");
    expect(observation.ending!.text).not.toContain("Carden's fall");
  });
});
