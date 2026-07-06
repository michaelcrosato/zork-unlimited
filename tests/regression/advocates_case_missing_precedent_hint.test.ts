/**
 * Regression for bug_0460: a blind playtest flagged that players who reached
 * the antechamber without the guild conviction ledger saw Craf and no legal USE
 * action, making combat look like the only route. The room must point them back
 * to the missing precedent.
 */
import { describe, expect, it } from "vitest";
import { makeStep } from "../../src/core/engine.js";
import type { GameState } from "../../src/core/state.js";
import { buildRpgObservation } from "../../src/rpg/observation.js";
import { loadRpgSourceFile } from "../../src/rpg/source.js";
import {
  buildRpgRules,
  enumerateRpgActions,
  indexRpgPack,
  initStateForRpgPack,
} from "../../src/rpg/runner.js";
import { validateRpg } from "../../src/validate/rpg_validator.js";

const loaded = loadRpgSourceFile("content/rpg/pack/advocates_case.yaml");
if (!loaded.ok) throw new Error("advocates_case must compile");
const pack = loaded.compiled.pack;
const index = indexRpgPack(pack);
const step = makeStep(buildRpgRules(index));

function actionIds(state: GameState): string[] {
  return enumerateRpgActions(index, state).map((option) => option.id);
}

function choose(state: GameState, id: string): GameState {
  const option = enumerateRpgActions(index, state).find((o) => o.id === id);
  if (!option) {
    throw new Error(`"${id}" not legal in ${state.current}: [${actionIds(state).join(", ")}]`);
  }
  const result = step(state, option.action);
  expect(result.ok).toBe(true);
  return result.state;
}

function play(ids: string[]): GameState {
  let state = initStateForRpgPack(index, 7);
  for (const id of ids) {
    state = choose(state, id);
  }
  return state;
}

describe("bug_0460 - Advocate's Case antechamber points to missing precedent", () => {
  it("tells a register-only player to return for the guild records instead of implying combat is the route", () => {
    const early = play([
      "read_charter_roll",
      "go_east",
      "take_town_register",
      "read_town_register",
      "go_west",
      "go_north",
    ]);

    const earlyObs = buildRpgObservation(index, early);
    expect(earlyObs.room).toBe("aldermans_antechamber");
    expect(earlyObs.description).toContain("the legal sequence is not complete yet");
    expect(earlyObs.description).toContain("the guild's own precedent");
    expect(earlyObs.description).toContain("guild records room is west from Marta's stall");
    expect(actionIds(early)).toContain("go_south");
    expect(actionIds(early)).not.toContain("use_prior_convictions_on_case_record");

    const prepared = play([
      "read_charter_roll",
      "go_east",
      "take_town_register",
      "read_town_register",
      "go_west",
      "go_west",
      "take_prior_convictions",
      "read_prior_convictions",
      "go_east",
      "go_north",
    ]);

    const preparedObs = buildRpgObservation(index, prepared);
    expect(preparedObs.description).not.toContain("the legal sequence is not complete yet");
    expect(actionIds(prepared)).toContain("use_prior_convictions_on_case_record");
    expect(validateRpg(pack).findings).toHaveLength(0);
  });
});
