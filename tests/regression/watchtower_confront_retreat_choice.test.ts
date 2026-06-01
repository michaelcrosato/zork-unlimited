/**
 * Regression (§15) for bug_0062 — *The Watchtower Road* `confront_smuggler` left its
 * retreat choice unconditional. A blind MCP playtester (seed 7, report
 * ai-runs/2026-06-01T17-13-32-290Z/playtest.md) reached this scene with the truth
 * already in hand (letter + ledger), saw the sergeant go white reading his own name —
 * and the third option still read "Pocket the letter and slip away to find real proof
 * first." You cannot already hold the damning proof AND need to "find real proof
 * first." (Sibling of bug_0055, which made the scene *text* reactive but left this
 * *choice* text untouched.)
 *
 * The fix gates the no-proof line to the bluffer (`back_off`, not_flag learned_truth)
 * and gives the proof-bearer a coherent retreat (`hold_off`, has_flag learned_truth):
 * "Hold your tongue for now — pocket the letter and back away from the gate." Both go
 * to road_north. No route/ending change.
 */
import { describe, it, expect } from "vitest";
import { loadPackFile } from "../../src/cyoa/pack.js";
import { indexPack, buildRules, initStateForPack } from "../../src/cyoa/runner.js";
import { buildObservation } from "../../src/cyoa/observation.js";
import { makeStep } from "../../src/core/engine.js";
import type { Action } from "../../src/api/types.js";

const loaded = loadPackFile("content/cyoa/pack/watchtower_road.yaml");
if (!loaded.ok) throw new Error("watchtower pack must compile");
const index = indexPack(loaded.compiled.pack);
const rules = buildRules(index);
const choose = (id: string): Action => ({ type: "CHOOSE", choiceId: id });

function play(ids: string[]) {
  const step = makeStep(rules);
  let s = initStateForPack(index, 1);
  for (const id of ids) s = step(s, choose(id)).state;
  return s;
}
const obs = (s: ReturnType<typeof play>) => buildObservation(index, s);
const optionIds = (s: ReturnType<typeof play>): string[] =>
  obs(s).available_actions.map((a) => a.id);
const optionText = (s: ReturnType<typeof play>, id: string): string =>
  obs(s).available_actions.find((a) => a.id === id)?.text ?? "";

// Take the letter (east) but learn NOTHING (skip cellar + hermit), then present it.
const TO_CONFRONT_NO_PROOF = [
  "go_east",
  "approach_base",
  "search_rubble",
  "take_letter",
  "leave_cart",
  "leave_base",
  "return_crossroads",
  "go_west",
  "ford_brook",
  "cross_north",
  "approach_checkpoint",
  "show_papers",
];

// Take the letter AND learn the truth in the cellar (ledger), then present it.
const TO_CONFRONT_WITH_PROOF = [
  "go_east",
  "approach_base",
  "search_rubble",
  "take_lantern",
  "take_letter",
  "leave_cart",
  "leave_base",
  "circle_cellar",
  "light_lantern",
  "descend_cellar",
  "search_cache",
  "take_ledger",
  "climb_out",
  "cellar_back",
  "approach_base",
  "climb_stairs",
  "continue_up",
  "survey_road",
  "approach_checkpoint",
  "show_papers",
];

describe("bug_0062 — confront_smuggler retreat choice matches the player's actual proof", () => {
  it("no-proof branch: the bluffer's retreat still reads 'find real proof first'", () => {
    const s = play(TO_CONFRONT_NO_PROOF);
    expect(s.current).toBe("confront_smuggler");
    expect(s.flags["learned_truth"]).not.toBe(true);
    const opts = optionIds(s);
    expect(opts).toContain("back_off");
    expect(opts).not.toContain("hold_off");
    expect(optionText(s, "back_off").toLowerCase()).toContain("find real proof first");
  });

  it("with-proof branch: the proof-bearer gets a coherent retreat, NOT 'find real proof first'", () => {
    const s = play(TO_CONFRONT_WITH_PROOF);
    expect(s.current).toBe("confront_smuggler");
    expect(s.flags["learned_truth"]).toBe(true);
    const opts = optionIds(s);
    // The contradictory no-proof line must be gone for someone who already has proof.
    expect(opts).not.toContain("back_off");
    expect(opts).toContain("hold_off");
    const text = optionText(s, "hold_off").toLowerCase();
    expect(text).not.toContain("find real proof first");
    expect(text).toContain("hold your tongue");
  });

  it("both retreats go back to the road and leave every ending reachable", () => {
    // Proof-bearer retreats, then still wins ending_truth via the edge of town.
    const held = play([...TO_CONFRONT_WITH_PROOF, "hold_off"]);
    expect(held.current).toBe("road_north");
    expect(held.ended).toBe(false);
    const truthAfterRetreat = play([
      ...TO_CONFRONT_WITH_PROOF,
      "hold_off",
      "slip_into_woods",
      "expose_the_plot",
    ]);
    expect(truthAfterRetreat.ended).toBe(true);
    expect(truthAfterRetreat.endingId).toBe("ending_truth");

    // Bluffer retreats and the no-proof routes are unchanged.
    const backedOff = play([...TO_CONFRONT_NO_PROOF, "back_off"]);
    expect(backedOff.current).toBe("road_north");
    expect(backedOff.ended).toBe(false);
  });

  it("the climactic routes/endings are unchanged: proof exposes, no-proof bluff captures", () => {
    const truth = play([...TO_CONFRONT_WITH_PROOF, "reveal_evidence", "expose_the_plot"]);
    expect(truth.ended).toBe(true);
    expect(truth.endingId).toBe("ending_truth");

    const captured = play([...TO_CONFRONT_NO_PROOF, "press_bluff"]);
    expect(captured.ended).toBe(true);
    expect(captured.endingId).toBe("ending_captured");
  });
});
