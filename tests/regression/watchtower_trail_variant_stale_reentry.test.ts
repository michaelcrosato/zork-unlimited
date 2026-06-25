/**
 * Regression (§15) for bug_0248 / bug_0408 — *The Watchtower Road*'s ruined_watchtower
 * must not re-show first-arrival trail flavor, or regress quest progress, after the
 * player has already learned the truth.
 *
 * Earlier fixes suppressed the stale prose with a `not_flag: learned_truth` companion guard,
 * but the underlying quest stage still regressed: forest_crossroads' on_enter set
 * `the_road=setting_out` on every revisit, and go_east set `the_road=on_the_trail` again
 * as the player left the hub. A fresh blind playtest caught the contradiction: after the
 * evidence beats set `truth_known`, returning through the hub made the quest tracker read
 * like the opening again.
 *
 * Fix (content only): the hub no longer writes an opening quest stage, go_east no longer
 * writes a transient trail stage, and the watchtower flavor keys directly on the durable
 * `learned_truth` flag. This locks:
 *   (1) first east-bound arrival (no learned_truth) still shows the variant;
 *   (2) after learning the truth and looping crossroads→east, the variant is gone and base shows;
 *   (3) the quest stage remains `truth_known` across the hub loop;
 *   (4) the guard keys on learned_truth, not the stage — a return BEFORE learning truth still
 *       shows the variant (the stage alone is not the suppressor);
 *   (5) text-only — the scene's choices are unchanged across the re-entry.
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
  let s = initStateForPack(index, 23);
  for (const id of ids) s = step(s, choose(id)).state;
  return s;
}
const obs = (s: ReturnType<typeof play>) => buildObservation(index, s);
const optionIds = (s: ReturnType<typeof play>): string[] =>
  obs(s).available_actions.map((a) => a.id);

const TRAIL = "the trail you came to follow runs in there"; // the on_the_trail first-arrival variant
const BASE = "the door hangs from one hinge"; // the base watchtower text (no variant)

// First time turning off the road toward the smoke (learned_truth not yet set).
const FIRST_ARRIVAL = ["go_east"];
// Pry the barrels (sets learned_truth + quest truth_known), climb out, then loop back through the
// crossroads and go east again.
const LOOP_BACK_AFTER_TRUTH = [
  "go_east",
  "approach_base",
  "search_rubble",
  "take_lantern",
  "carry_lantern_to_cellar",
  "light_lantern",
  "descend_cellar",
  "examine_barrels",
  "climb_out",
  "cellar_back",
  "return_crossroads",
  "go_east",
];
// A return to the watchtower BEFORE learning anything: east, back to crossroads, east again.
const LOOP_BACK_NO_TRUTH = ["go_east", "return_crossroads", "go_east"];

describe("bug_0248 — the watchtower re-shows the on_the_trail flavor after the truth is known", () => {
  it("first east-bound arrival (no learned_truth) still shows the trail variant", () => {
    const s = play(FIRST_ARRIVAL);
    expect(s.current).toBe("ruined_watchtower");
    expect(s.flags["learned_truth"]).not.toBe(true);
    const text = obs(s).text.toLowerCase();
    expect(text).toContain(TRAIL);
  });

  it("after learning the truth and looping back, the variant is gone and the base text shows", () => {
    const s = play(LOOP_BACK_AFTER_TRUTH);
    expect(s.current).toBe("ruined_watchtower");
    expect(s.flags["learned_truth"]).toBe(true);
    expect(s.questStage.the_road).toBe("truth_known");
    const text = obs(s).text.toLowerCase();
    expect(text).not.toContain(TRAIL);
    expect(text).toContain(BASE);
    // Text-only: the scene still offers exactly its four navigation choices.
    const ids = optionIds(s);
    expect(ids).toEqual(
      expect.arrayContaining(["approach_base", "force_door", "circle_cellar", "return_crossroads"]),
    );
  });

  it("the suppressor is learned_truth, not the stage: a pre-truth return still shows the variant", () => {
    const s = play(LOOP_BACK_NO_TRUTH);
    expect(s.current).toBe("ruined_watchtower");
    expect(s.flags["learned_truth"]).not.toBe(true);
    const text = obs(s).text.toLowerCase();
    expect(text).toContain(TRAIL);
  });
});
