/**
 * Regression for bug_0421 -- a blind playtest of Prior's Cellar found several
 * stale CYOA scene descriptions: the gate repeated first-arrival text, the
 * cloister kept Emric sweeping after Vespers emptied it, and picked-up evidence
 * stayed visibly in the study/scriptorium.
 */
import { describe, expect, it } from "vitest";
import { loadPackFile } from "../../src/cyoa/pack.js";
import { indexPack, buildRules, initStateForPack } from "../../src/cyoa/runner.js";
import { buildObservation } from "../../src/cyoa/observation.js";
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
  return buildObservation(index, state);
}

const VESPERS_AND_STUDY = [
  "go_to_cloister",
  "speak_to_monk",
  "hear_emric_out",
  "leave_emric",
  "wait_for_vespers",
  "return_to_gate_from_cloister",
  "go_to_study",
];

describe("bug_0421 -- Prior's Cellar stale scene text", () => {
  it("the gate stops greeting a returning player as a first arrival", () => {
    const gate = play(["go_to_hall", "leave_hall"]);

    expect(gate.scene_id).toBe("priory_gate");
    expect(gate.text).toMatch(/gone back to his duties/i);
    expect(gate.text).not.toMatch(/waves you in from the cold/i);
  });

  it("after Vespers, the cloister is empty instead of still showing Emric sweeping", () => {
    const cloister = play([
      "go_to_cloister",
      "speak_to_monk",
      "hear_emric_out",
      "leave_emric",
      "wait_for_vespers",
    ]);

    expect(cloister.scene_id).toBe("cloister_walk");
    expect(cloister.text).toMatch(/Vespers has emptied the\s+walk/i);
    expect(cloister.text).toMatch(/broom leans/i);
    expect(cloister.text).not.toMatch(/young monk sweeps/i);
  });

  it("after taking the cellar key, the study shows a bare hook", () => {
    const study = play([...VESPERS_AND_STUDY, "search_desk_for_key"]);

    expect(study.scene_id).toBe("priors_study");
    expect(study.state.flags).toContain("has_cellar_key");
    expect(study.text).toMatch(/hook where\s+the cellar key hung is bare/i);
    expect(study.text).not.toMatch(/hangs a heavy\s+iron key/i);
  });

  it("after taking the ledger, the scriptorium shows the gap it left", () => {
    const scriptorium = play([
      ...VESPERS_AND_STUDY,
      "enter_scriptorium",
      "read_ledger",
      "take_ledger_item",
    ]);

    expect(scriptorium.scene_id).toBe("scriptorium");
    expect(scriptorium.state.flags).toContain("has_ledger");
    expect(scriptorium.text).toMatch(/rectangular gap/i);
    expect(scriptorium.text).not.toMatch(/bound in plain calfskin but fat with pages/i);
  });

  it("the maximum-score witness route is unchanged", () => {
    const ending = play([
      "go_to_hall",
      "go_to_sick_pilgrim",
      "listen_to_aldric",
      "leave_aldric",
      "leave_hall",
      "go_to_chapel",
      "examine_altar",
      "leave_chapel",
      "go_to_cloister",
      "speak_to_monk",
      "hear_emric_out",
      "leave_emric",
      "wait_for_vespers",
      "return_to_gate_from_cloister",
      "go_to_study",
      "search_desk_for_key",
      "enter_scriptorium",
      "read_ledger",
      "take_ledger_item",
      "leave_scriptorium",
      "leave_study",
      "go_to_cloister",
      "go_to_cellar_door",
      "unlock_cellar",
      "examine_cache",
      "go_back_up",
      "return_to_gate_from_cloister",
      "take_south_road",
      "go_to_bishop",
    ]);

    expect(ending.ended).toBe(true);
    expect(ending.ending_id).toBe("ending_witness");
    expect(ending.state.vars.score).toBe(50);
  });
});
