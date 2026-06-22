/**
 * Regression for bug_0477 -- a later blind pass found that the stag's mystical
 * framing could make crossing the ice read like a safe communion path, despite
 * the scene's fair physical danger warning.
 */
import { describe, expect, it } from "vitest";
import { loadPackFile } from "../../src/cyoa/pack.js";
import { buildObservation } from "../../src/cyoa/observation.js";
import { indexPack, buildRules, initStateForPack } from "../../src/cyoa/runner.js";
import { makeStep } from "../../src/core/engine.js";
import type { Action } from "../../src/api/types.js";

const loaded = loadPackFile("content/cyoa/pack/white_stag.yaml");
if (!loaded.ok) throw new Error("white_stag pack must compile");
const index = indexPack(loaded.compiled.pack);
const rules = buildRules(index);
const choose = (id: string): Action => ({ type: "CHOOSE", choiceId: id });

function obs(ids: string[]) {
  const step = makeStep(rules);
  let state = initStateForPack(index, 7);
  for (const id of ids) state = step(state, choose(id)).state;
  return buildObservation(index, state);
}

describe("bug_0477 -- White Stag ice crossing is labelled as a physical risk", () => {
  it("names the rotten-ice risk in the visible action text", () => {
    const tarn = obs(["go_on"]);
    const crossing = tarn.available_actions.find((action) => action.id === "cross_ice");

    expect(crossing?.text).toMatch(/risk the rotten ice itself/i);
    expect(crossing?.text).toMatch(/cross straight/i);
    expect(crossing?.text).not.toMatch(/^cross the ice to meet/i);
  });

  it("keeps the same telegraphed death route", () => {
    const ending = obs(["go_on", "cross_ice"]);

    expect(ending.ended).toBe(true);
    expect(ending.ending_id).toBe("ending_lost");
    expect(ending.ending_death).toBe(true);
    expect(ending.text.toLowerCase()).toContain("rotten ice");
  });
});
