/**
 * Regression for bug_0369 -- Prior's Cellar's hub must not clobber quest progress.
 * The Priory Gate used to set `the_priory=arrived` on every entry. Because every
 * major route returns through that hub, learning the truth in the ledger/cellar
 * was immediately overwritten the next time the player came back to the gate.
 */
import { describe, expect, it } from "vitest";
import { loadPackFile } from "../../src/cyoa/pack.js";
import { indexPack, buildRules, initStateForPack } from "../../src/cyoa/runner.js";
import { makeStep } from "../../src/core/engine.js";

const loaded = loadPackFile("content/cyoa/pack/priors_cellar.yaml");
if (!loaded.ok) throw new Error("priors_cellar pack must compile");
const index = indexPack(loaded.compiled.pack);
const rules = buildRules(index);
const choose = (id: string) => ({ type: "CHOOSE", choiceId: id }) as const;

function play(ids: string[]) {
  const step = makeStep(rules);
  let state = initStateForPack(index, 7);
  for (const id of ids) state = step(state, choose(id)).state;
  return state;
}

describe("bug_0369 -- Prior's Cellar quest stage remains truth_known after hub returns", () => {
  it("does not reset the ledger route when returning from the study to the gate", () => {
    const state = play([
      "go_to_cloister",
      "speak_to_monk",
      "hear_emric_out",
      "leave_emric",
      "wait_for_vespers",
      "return_to_gate_from_cloister",
      "go_to_study",
      "enter_scriptorium",
      "read_ledger",
      "leave_scriptorium",
      "leave_study",
    ]);

    expect(state.current).toBe("priory_gate");
    expect(state.questStage.the_priory).toBe("truth_known");
  });

  it("does not reset the cellar route when returning from the cloister to the gate", () => {
    const state = play([
      "go_to_study",
      "snoop_while_prior_present",
      "leave_study",
      "go_to_cloister",
      "go_to_cellar_door",
      "unlock_cellar",
      "go_back_up",
      "return_to_gate_from_cloister",
    ]);

    expect(state.current).toBe("priory_gate");
    expect(state.questStage.the_priory).toBe("truth_known");
  });
});
