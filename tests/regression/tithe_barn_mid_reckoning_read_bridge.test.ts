/**
 * Regression for bug_0476 -- a later blind pass found that the route
 * face_thief -> back_to_floor -> read_book worked mechanically but felt frozen:
 * the thief waited while the player read, with no prose bridge acknowledging the
 * pause before the upgraded reckoning.
 */
import { describe, expect, it } from "vitest";
import { loadPackFile } from "../../src/cyoa/pack.js";
import { buildObservation } from "../../src/cyoa/observation.js";
import { indexPack, buildRules, initStateForPack } from "../../src/cyoa/runner.js";
import { makeStep } from "../../src/core/engine.js";
import type { Action } from "../../src/api/types.js";

const loaded = loadPackFile("content/cyoa/pack/tithe_barn.yaml");
if (!loaded.ok) throw new Error("tithe_barn pack must compile");
const index = indexPack(loaded.compiled.pack);
const rules = buildRules(index);
const choose = (id: string): Action => ({ type: "CHOOSE", choiceId: id });

function obs(ids: string[]) {
  const step = makeStep(rules);
  let state = initStateForPack(index, 7);
  for (const id of ids) state = step(state, choose(id)).state;
  return buildObservation(index, state);
}

const MID_RECKONING_READ = ["go_in", "face_thief", "back_to_floor", "read_book", "leave_book"];

describe("bug_0476 -- Tithe-Barn bridges the mid-reckoning read route", () => {
  it("acknowledges the thief has waited while the player steps back to the ledger", () => {
    const barn = obs(MID_RECKONING_READ);
    const text = barn.text.toLowerCase();

    expect(barn.scene_id).toBe("granary_floor");
    expect(barn.state.flags).toEqual(expect.arrayContaining(["faced_thief", "knows_truth"]));
    expect(text).toContain("stepping back to the steward's table");
    expect(text).toContain("has not put that moment back in the dark");
    expect(text).toContain("you have read the steward's book");
    expect(text).not.toContain("wait to see what kind of man");
  });

  it("keeps the upgraded reckoning available after that bridge", () => {
    const reckoning = obs([...MID_RECKONING_READ, "face_thief"]);

    expect(reckoning.scene_id).toBe("reckoning");
    expect(reckoning.text.toLowerCase()).toContain("you have read the book now");
    expect(reckoning.available_actions.map((action) => action.id)).toContain("open_doors");
  });
});
