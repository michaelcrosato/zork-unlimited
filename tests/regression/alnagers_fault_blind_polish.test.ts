/**
 * Regression for bug_0358 -- blind-playtest polish for The Alnager's Fault.
 * A fresh MCP-only blind player found the pack mechanically sound but flagged
 * state-honesty and signposting problems: the bribe ending could claim the player
 * knew the rod reading without ever measuring, an informed dismissal did not
 * acknowledge that the officer knew better, and the Guild referral route appeared
 * without a clear "you have enough evidence" cue. Later blind review also flagged
 * the condemnation's visible wording as too silent about its composure check. The
 * composure check is pinned as a non-blocking tension beat: both roll branches
 * still condemn.
 */
import { describe, expect, it } from "vitest";
import { loadPackFile } from "../../src/cyoa/pack.js";
import { indexPack, buildRules, initStateForPack } from "../../src/cyoa/runner.js";
import { buildObservation } from "../../src/cyoa/observation.js";
import { makeStep } from "../../src/core/engine.js";
import type { Action } from "../../src/api/types.js";

const loaded = loadPackFile("content/cyoa/pack/alnagers_fault.yaml");
if (!loaded.ok) throw new Error("alnagers_fault pack must compile");
const index = indexPack(loaded.compiled.pack);
const rules = buildRules(index);
const choose = (id: string): Action => ({ type: "CHOOSE", choiceId: id });

function play(ids: string[], seed = 7) {
  const step = makeStep(rules);
  let state = initStateForPack(index, seed);
  for (const id of ids) state = step(state, choose(id)).state;
  return state;
}

const obs = (ids: string[], seed = 7) => buildObservation(index, play(ids, seed));

describe("bug_0358 -- Alnager's Fault blind polish", () => {
  it("does not say the player knows the rod reading when they accept the bribe before measuring", () => {
    const text = obs(["accept_consideration"]).text;

    expect(text).toMatch(/without laying the ell-rod/i);
    expect(text).toMatch(/have not measured it/i);
    expect(text).not.toMatch(/you know what the rod said/i);
  });

  it("makes an informed dismissal acknowledge the measured fraud and moral weight", () => {
    const text = obs([
      "inspect_cloth",
      "measure_with_rod",
      "examine_seal",
      "dismiss_complaint",
    ]).text;

    expect(text).toMatch(/measured the cloth yourself/i);
    expect(text).toMatch(/twenty-eight and a half inches/i);
    expect(text).toMatch(/know better/i);
  });

  it("signposts that the register, Ned, and seal evidence now support Guild referral", () => {
    const hall = obs([
      "examine_seal",
      "go_to_records",
      "consult_register",
      "leave_records",
      "go_to_anteroom",
      "question_ned",
      "leave_anteroom",
    ]);

    expect(hall.text).toMatch(/register, Ned's account, and the too-pale seal/i);
    expect(hall.text).toMatch(/enough to refer the matter to the Guild court/i);
    expect(hall.available_actions.map((a) => a.id)).toContain("refer_to_guild");
  });

  it("keeps the composure roll as a non-blocking condemnation tension beat across seeds", () => {
    const setup = ["inspect_cloth", "measure_with_rod", "examine_seal"];
    const ready = obs(setup);
    const action = ready.available_actions.find((a) => a.id === "condemn_bassett");
    expect(action?.text).toMatch(/composure/i);
    expect(action?.skill_check).toEqual({ skill: "composure", difficulty: 11, die: "d20" });

    const route = [...setup, "condemn_bassett"];

    for (let seed = 1; seed <= 20; seed++) {
      const state = play(route, seed);
      expect(state.ended).toBe(true);
      expect(state.endingId).toBe("ending_condemned");
    }
  });
});
