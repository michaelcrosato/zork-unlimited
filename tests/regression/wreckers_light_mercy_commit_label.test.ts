/**
 * Regression for bug_0424 -- Wrecker's Light offered `tend_keeper` as a peer
 * action beside exploration controls even though it immediately commits to the
 * mercy ending. The label now names the lamp cost before the player chooses it.
 */
import { describe, expect, it } from "vitest";
import { loadPackFile } from "../../src/cyoa/pack.js";
import { indexPack, buildRules, initStateForPack } from "../../src/cyoa/runner.js";
import { buildObservation } from "../../src/cyoa/observation.js";
import { makeStep } from "../../src/core/engine.js";
import type { Action } from "../../src/api/types.js";
import { validateCyoa } from "../../src/validate/cyoa_validator.js";

const loaded = loadPackFile("content/cyoa/pack/wreckers_light.yaml");
if (!loaded.ok) throw new Error("wreckers_light pack must compile");
const pack = loaded.compiled.pack;
const index = indexPack(pack);
const rules = buildRules(index);
const choose = (id: string): Action => ({ type: "CHOOSE", choiceId: id });

function play(ids: string[]) {
  const step = makeStep(rules);
  let state = initStateForPack(index, 7);
  for (const id of ids) state = step(state, choose(id)).state;
  return state;
}

describe("bug_0424 -- Wrecker's Light mercy choice signals its terminal cost", () => {
  it("the mercy action names that the lamp will stay dark", () => {
    const heardKeeper = play(["enter", "hear_keeper"]);
    const action = buildObservation(index, heardKeeper).available_actions.find(
      (candidate) => candidate.id === "tend_keeper",
    );

    expect(action?.text).toMatch(/through the night/i);
    expect(action?.text).toMatch(/lamp stay dark/i);
  });

  it("the label-only fix leaves the mercy route and pack validity intact", () => {
    const mercy = play(["enter", "hear_keeper", "tend_keeper"]);
    const report = validateCyoa(pack);

    expect(mercy.ended).toBe(true);
    expect(mercy.endingId).toBe("ending_mercy");
    expect(report.ok).toBe(true);
    expect(report.findings).toHaveLength(0);
  });
});
