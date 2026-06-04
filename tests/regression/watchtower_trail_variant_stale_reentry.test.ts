/**
 * Regression (§15) for bug_0248 — *The Watchtower Road*'s ruined_watchtower re-showed its
 * `on_the_trail` reactive variant ("…the trail you came to follow runs in there") to a player
 * who had ALREADY followed the trail in and learned the truth.
 *
 * Root cause: forest_crossroads' on_enter UNCONDITIONALLY re-seats the quest `the_road` to
 * `setting_out` on every revisit, and go_east then re-advances it to `on_the_trail`. The
 * watchtower variant gated ONLY on `quest_stage == on_the_trail`, so a player who pried the
 * barrels (set_flag learned_truth, score on the board) and looped back through the crossroads
 * re-matched the variant and read the first-arrival flavor a second time, as if fresh — the
 * same stale-on-re-entry class as bug_0120 (tower_top brazier) and bug_0134 (hermit greeting).
 * An earlier design comment in the pack explicitly (and wrongly) claimed a later return "no
 * longer matches" because the quest would by then sit at `truth_known`; it does not, because the
 * crossroads regresses the stage. Reproduced live via the MCP tools (seed 23) before fixing.
 *
 * Fix (content only): add a second `not_flag: learned_truth` guard to the variant's `when`. Once
 * the truth is out the variant is suppressed and the base text shows; the un-informed first-timer
 * (no flag) still sees it verbatim. Reactive TEXT ONLY — no choice/flag/route/ending change, and
 * the state_hash on the repro route is byte-identical pre/post-fix. This locks:
 *   (1) first east-bound arrival (no learned_truth) still shows the variant;
 *   (2) after learning the truth and looping crossroads→east, the variant is gone and base shows;
 *   (3) the guard keys on learned_truth, not the stage — a return BEFORE learning truth still
 *       shows the variant (the stage alone is not the suppressor);
 *   (4) text-only — the scene's choices are unchanged across the re-entry.
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
// crossroads (on_enter regresses the quest to setting_out) and go east again (re-advances on_the_trail).
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
