/**
 * Regression (§15) for bug_0115 — content_fix: make the knows_truth reframe LEGIBLE at the
 * moment of moral choice, not only in the epilogue.
 *
 * The blind playtest this cycle (ai-runs/2026-06-02T10-35-28-612Z/playtest.md, seed 11)
 * rated The Wrecker's Light clarity 5/5, enjoyment 5/5 and raised exactly ONE finding,
 * twice (§4 + §5): reading the keeper's journal (knows_truth) had a payoff that was
 * "invisible within a single playthrough" — it reframed only the ENDING prose, never the
 * decision the player was actually making. The most investigative players got narrative-
 * only payoff they could not perceive in one run.
 *
 * The pack's design is deliberately a REFRAME, not a route (the journal must never unlock
 * a new ending — wreckers_light_branching.test.ts locks that). So the fix keeps the route
 * topology byte-identical and instead adds knows_truth-aware decision-point variants to the
 * two beats where the player commits the moral act:
 *   - lantern_room (the save-beat): with oil+striker AND knows_truth, the scene names the
 *     Mourning Star and frames waking the lamp as a debt paid by a steady hand.
 *   - gallery (the wreck-beat): with oil+striker AND knows_truth, the false light becomes
 *     vengeance for the keeper's drowned son, not bare greed.
 * Uninformed players (no journal) still see the original inventory-only variants verbatim.
 *
 * This test locks:
 *   (1) the informed save/wreck DECISION scenes name the Mourning Star; the uninformed ones
 *       do not (and still render their original inventory text);
 *   (2) the variant is purely cosmetic at the decision point — same available actions, so the
 *       reframe never changes what the player can DO, only how the moment reads.
 */
import { describe, it, expect } from "vitest";
import { loadPackFile } from "../../src/cyoa/pack.js";
import { indexPack, buildRules, initStateForPack } from "../../src/cyoa/runner.js";
import { buildObservation } from "../../src/cyoa/observation.js";
import { makeStep } from "../../src/core/engine.js";
import type { Action } from "../../src/api/types.js";

const loaded = loadPackFile("content/cyoa/pack/wreckers_light.yaml");
if (!loaded.ok) throw new Error("wreckers_light pack must compile");
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
const sceneText = (s: ReturnType<typeof play>) => obs(s).text.toLowerCase();
const actionIds = (s: ReturnType<typeof play>) =>
  (obs(s).available_actions ?? []).map((a) => a.id).sort();

// Arm with oil + striker without reading the journal.
const ARM = ["take_striker", "go_down", "take_oil", "back_up"];
// Read the journal first (sets knows_truth), then re-arm the striker.
const LEARN_AND_ARM = [
  "hear_keeper",
  "search_keeper",
  "go_down",
  "take_oil",
  "unlock_chest",
  "read_journal",
  "back_up",
  "take_striker",
];

// Stop AT the decision scene (do not commit the ending).
const SAVE_DECISION = ["enter", ...ARM, "climb_ladder"];
const SAVE_DECISION_TRUTH = ["enter", ...LEARN_AND_ARM, "climb_ladder"];
const WRECK_DECISION = ["enter", ...ARM, "out_gallery"];
const WRECK_DECISION_TRUTH = ["enter", ...LEARN_AND_ARM, "out_gallery"];

describe("wreckers_light — knows_truth reframes the DECISION, visible before the ending", () => {
  it("lantern (save-beat): informed names the Mourning Star, uninformed shows the plain prompt", () => {
    expect(sceneText(play(SAVE_DECISION_TRUTH))).toContain("mourning star");
    expect(sceneText(play(SAVE_DECISION_TRUTH))).toContain("steers him clear");
    expect(sceneText(play(SAVE_DECISION))).not.toContain("mourning star");
    expect(sceneText(play(SAVE_DECISION))).toContain("lights up for her");
  });

  it("gallery (wreck-beat): informed names the Mourning Star, uninformed shows the plain prompt", () => {
    expect(sceneText(play(WRECK_DECISION_TRUTH))).toContain("mourning star");
    expect(sceneText(play(WRECK_DECISION_TRUTH))).toContain("the teeth that took the boy");
    expect(sceneText(play(WRECK_DECISION))).not.toContain("mourning star");
    expect(sceneText(play(WRECK_DECISION))).toContain("ape a safe harbor");
  });

  it("the reframe is cosmetic: same available actions informed vs uninformed", () => {
    // The journal changes how the moment READS, never what the player can do.
    expect(actionIds(play(SAVE_DECISION_TRUTH))).toEqual(actionIds(play(SAVE_DECISION)));
    expect(actionIds(play(WRECK_DECISION_TRUTH))).toEqual(actionIds(play(WRECK_DECISION)));
  });
});
