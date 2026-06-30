/**
 * Regression (§15) for bug_0099 — content_new: *The Wrecker's Light*, a new branching
 * CYOA pack authored to attack the one enjoyment knock EVERY blind report raises: the
 * pack's linear, single-ending siblings (sealed_crypt 3/5, alchemists_tower 3/5) score
 * below the branching clockwork_heist (4–5/5). A fresh blind MCP playtester rated this
 * pack clarity 5/5, enjoyment 5/5 (the project's highest), reaching all FOUR distinct
 * endings, and flagged ONE polish gap — ending_mercy re-revealed the Mourning Star
 * truth even to a player who had already read the journal — which the shipped pack
 * fixes with a knows_truth-aware mercy variant (the same reactive-ending device the
 * save/wreck endings use, mirroring clockwork's ending_truth, bug_0051).
 *
 * The pack's THESIS is a moral fork, not a lock-and-key chain: the SAME two tools
 * (lamp_oil from the store, the keeper's striker from the mantel) arm both the honest
 * act and its dark mirror, so it is WHERE you carry them that decides the night — up
 * the ladder to the great lamp (ending_saved) or out to the gallery's false light
 * (ending_wrecker). This test locks that thesis and the reactive epilogues:
 *   (1) all four endings (saved / wrecker / mercy / drowned) are reachable and distinct;
 *   (2) the moral fork — identical oil+striker inventory reaches saved via the lantern
 *       and wrecker via the gallery (different endingId), proving the branch is real;
 *   (3) knows_truth (reading the keeper's journal) fires a reactive variant on the
 *       save, wreck AND mercy endings, while the uninformed route renders the base text;
 *   (4) the truth variant is purely cosmetic — informed and uninformed routes converge
 *       on the SAME endingId, so the journal changes prose, not which ending you reach.
 */
import { describe, it, expect } from "vitest";
import { loadPackFile } from "../../src/cyoa/pack.js";
import { indexPack, buildRules, initStateForPack } from "../../src/cyoa/runner.js";
import { buildObservation } from "../../src/cyoa/observation.js";
import { makeStep } from "../../src/core/engine.js";

const loaded = loadPackFile("content/cyoa/pack/wreckers_light.yaml");
if (!loaded.ok) throw new Error("wreckers_light pack must compile");
const index = indexPack(loaded.compiled.pack);
const rules = buildRules(index);
const choose = (id: string) => ({ type: "CHOOSE", choiceId: id }) as const;

function play(ids: string[]) {
  const step = makeStep(rules);
  let s = initStateForPack(index, 1);
  for (const id of ids) s = step(s, choose(id)).state;
  return s;
}
const obs = (s: ReturnType<typeof play>) => buildObservation(index, s);
const endText = (s: ReturnType<typeof play>) => obs(s).text.toLowerCase();
const endId = (s: ReturnType<typeof play>) => obs(s).ending_id;

// ── Route fragments ──────────────────────────────────────────────────────────
const ARM = ["take_striker", "go_down", "take_oil", "back_up"]; // oil + striker, uninformed
const LEARN = [
  // hear keeper → take key → fill flask → unlock chest → read journal → back up
  "hear_keeper",
  "search_keeper",
  "go_down",
  "take_oil",
  "unlock_chest",
  "read_journal",
  "back_up",
];

// Uninformed routes (never read the journal).
const SAVED = ["enter", ...ARM, "climb_ladder", "light_lamp"];
const WRECKER = ["enter", ...ARM, "out_gallery", "hang_false_light"];
const MERCY = ["enter", "hear_keeper", "tend_keeper"];
const DROWNED = ["enter", "out_gallery", "climb_to_wreck"];

// Informed routes (read the journal first).
const SAVED_TRUTH = ["enter", ...LEARN, "take_striker", "climb_ladder", "light_lamp"];
const WRECKER_TRUTH = ["enter", ...LEARN, "take_striker", "out_gallery", "hang_false_light"];
const MERCY_TRUTH = [
  "enter",
  "hear_keeper",
  "search_keeper",
  "go_down",
  "unlock_chest",
  "read_journal",
  "back_up",
  "tend_keeper",
];

describe("wreckers_light — four distinct endings are all reachable (anti-linearity)", () => {
  it("reaches saved / wrecker / mercy / drowned, each a distinct endingId", () => {
    const ids = [SAVED, WRECKER, MERCY, DROWNED].map((r) => endId(play(r)));
    expect(ids).toEqual(["ending_saved", "ending_wrecker", "ending_mercy", "ending_drowned"]);
    expect(new Set(ids).size).toBe(4); // genuinely distinct, not aliases
  });
});

describe("wreckers_light — the moral fork is real (same tools, different ending)", () => {
  it("identical oil+striker inventory reaches saved via the lantern, wrecker via the gallery", () => {
    // The only difference between SAVED and WRECKER is the final destination of the
    // SAME two items — the pack's whole point.
    expect(SAVED.slice(0, 5)).toEqual(WRECKER.slice(0, 5)); // identical arming prefix
    expect(endId(play(SAVED))).toBe("ending_saved");
    expect(endId(play(WRECKER))).toBe("ending_wrecker");
  });
});

describe("wreckers_light — knows_truth fires reactive epilogue variants", () => {
  it("ending_saved: informed names the Mourning Star, uninformed does not", () => {
    expect(endText(play(SAVED_TRUTH))).toContain("mourning star");
    expect(endText(play(SAVED))).not.toContain("mourning star");
    expect(endText(play(SAVED))).toContain("the keeper's last work is done");
  });

  it("ending_wrecker: informed names the Mourning Star, uninformed is plain greed", () => {
    expect(endText(play(WRECKER_TRUTH))).toContain("mourning star");
    expect(endText(play(WRECKER))).not.toContain("mourning star");
    expect(endText(play(WRECKER))).toContain("a wrecker forever");
  });

  it("ending_mercy: informed confirms what you read, uninformed hears it fresh (the blind finding)", () => {
    // The fix: an informed mercy run must NOT re-reveal the truth as news.
    expect(endText(play(MERCY_TRUTH))).toContain("you already know");
    expect(endText(play(MERCY_TRUTH))).not.toContain("cracked whisper");
    expect(endText(play(MERCY))).toContain("cracked whisper");
  });
});

describe("wreckers_light — the truth variant is cosmetic, not a route change", () => {
  it("informed and uninformed routes converge on the same endingId for each ending", () => {
    expect(endId(play(SAVED_TRUTH))).toBe(endId(play(SAVED)));
    expect(endId(play(WRECKER_TRUTH))).toBe(endId(play(WRECKER)));
    expect(endId(play(MERCY_TRUTH))).toBe(endId(play(MERCY)));
  });
});
