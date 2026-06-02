/**
 * Regression (§15) for bug_0136 — content_new: *The Tithe-Barn*, the project's 9th
 * pack and the third purpose-built BRANCHING CYOA. Authored to press the one standing
 * product lever every recent cycle named: breadth via branching, the device shown to
 * lift enjoyment to 5/5 (wreckers_light, bug_0099) where the linear single-chain packs
 * top out at 4/5. The mandated blind pass this cycle (white_stag, seed 23) re-confirmed
 * that pack blind-clean at 4/5, and named the standing gap to 5/5: wreckers_light's edge
 * is FOUR genuinely-distinct moral STANCES, while white_stag's two mercy outcomes
 * CONVERGE (the stag lives either way). The Tithe-Barn is built to close exactly that —
 * a famine night, a lord's full grain-barn, a thief caught at it — with four stances that
 * do NOT converge:
 *   - ending_bounty: seize her, take the lord's silver (betrayal)
 *   - ending_mercy:  let her slip out with one sack (private mercy — barn stays locked)
 *   - ending_doors:  throw the doors wide, feed the whole town (public justice — GATED)
 *   - ending_fall:   climb the rotten loft after more (greed; the telegraphed death pole)
 *
 * The hidden "truth" (the steward's open account-book proving the grain is held back to
 * rot to keep the price up) is the wreckers_light/white_stag device: reading it sets
 * `knows_truth`, which (a) fires reactive endingText variants on the bounty and the mercy,
 * and (b) UNLOCKS throwing the doors — the gated "best" ending. This test locks that
 * structure:
 *   (1) all four endings (bounty / mercy / doors / fall) are reachable and distinct;
 *   (2) the moral fork is real — the SAME approach to the reckoning reaches betrayal or
 *       private mercy by choice alone (different endingId);
 *   (3) the doors ending is GATED on knows_truth — the choice is absent until the book is
 *       read and present after (the truth is mechanically load-bearing, not just flavor);
 *   (4) the public liberation does NOT converge with the private mercy — distinct endingIds
 *       with distinct outcomes (the lever's whole point);
 *   (5) knows_truth fires reactive variants on the bounty AND mercy endings, while the
 *       uninformed route renders the base text;
 *   (6) those variants are cosmetic — informed and uninformed bounty/mercy converge on the
 *       SAME endingId (the truth changes prose and unlocks the doors, never silently reroutes
 *       an existing choice);
 *   (7) the truth reframes the reckoning scene in the moment (reactive prose), not only the
 *       epilogue.
 */
import { describe, it, expect } from "vitest";
import { loadPackFile } from "../../src/cyoa/pack.js";
import { indexPack, buildRules, initStateForPack } from "../../src/cyoa/runner.js";
import { buildObservation } from "../../src/cyoa/observation.js";
import { makeStep } from "../../src/core/engine.js";
import type { Action } from "../../src/api/types.js";

const loaded = loadPackFile("content/cyoa/pack/tithe_barn.yaml");
if (!loaded.ok) throw new Error("tithe_barn pack must compile");
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
const text = (s: ReturnType<typeof play>) => obs(s).text.toLowerCase();
const endId = (s: ReturnType<typeof play>) => obs(s).ending_id;
const actionIds = (s: ReturnType<typeof play>) => obs(s).available_actions.map((a) => a.id);

// ── Route fragments ──────────────────────────────────────────────────────────
// Uninformed: straight to the reckoning, never reading the book.
const TO_RECKONING = ["go_in", "face_thief"];
// Informed: read and decipher the book, then face the thief (knows_truth set).
const LEARN = ["go_in", "read_book", "decipher", "leave_book", "face_thief"];

const BOUNTY = [...TO_RECKONING, "take_her"];
const MERCY = [...TO_RECKONING, "let_her_go"];
const FALL = ["go_in", "climb_loft"];

const BOUNTY_TRUTH = [...LEARN, "take_her"];
const MERCY_TRUTH = [...LEARN, "let_her_go"];
const DOORS = [...LEARN, "open_doors"]; // gated on knows_truth

describe("tithe_barn — four distinct endings are all reachable (anti-linearity)", () => {
  it("reaches bounty / mercy / doors / fall, each a distinct endingId", () => {
    const ids = [BOUNTY, MERCY, DOORS, FALL].map((r) => endId(play(r)));
    expect(ids).toEqual(["ending_bounty", "ending_mercy", "ending_doors", "ending_fall"]);
    expect(new Set(ids).size).toBe(4); // genuinely distinct, not aliases
  });
});

describe("tithe_barn — the moral fork is real (same approach, opposite ending by choice)", () => {
  it("the identical approach to the reckoning reaches betrayal or mercy by choice alone", () => {
    expect(BOUNTY.slice(0, 2)).toEqual(MERCY.slice(0, 2)); // identical approach prefix
    expect(endId(play(BOUNTY))).toBe("ending_bounty");
    expect(endId(play(MERCY))).toBe("ending_mercy");
  });
});

describe("tithe_barn — the open doors are gated on the truth (knows_truth is load-bearing)", () => {
  it("open_doors is absent at the reckoning until the book is read, and present after", () => {
    const ignorant = actionIds(play(TO_RECKONING));
    expect(ignorant).toContain("take_her");
    expect(ignorant).toContain("let_her_go");
    expect(ignorant).not.toContain("open_doors"); // no liberation without the truth

    const informed = actionIds(play(LEARN));
    expect(informed).toContain("open_doors"); // the book unlocks it
  });

  it("the doors ending is reachable ONLY via the truth", () => {
    expect(endId(play(DOORS))).toBe("ending_doors");
    // Sanity: the doors route really did set knows_truth (it ran LEARN first).
    expect(text(play(LEARN))).toContain("read the book");
  });
});

describe("tithe_barn — the fourth stance does NOT converge with private mercy (the lever)", () => {
  it("public liberation and private mercy are distinct endings with distinct outcomes", () => {
    expect(endId(play(DOORS))).not.toBe(endId(play(MERCY_TRUTH)));
    // The doors feed the whole town; the mercy frees one and leaves the barn locked.
    expect(text(play(DOORS))).toContain("whole");
    expect(text(play(MERCY_TRUTH))).toContain("one");
  });
});

describe("tithe_barn — knows_truth fires reactive epilogue variants", () => {
  it("ending_bounty: informed is a knowing betrayal, uninformed is a man keeping the law", () => {
    expect(text(play(BOUNTY_TRUTH))).toContain("and you do it knowing");
    expect(text(play(BOUNTY))).not.toContain("and you do it knowing");
    expect(text(play(BOUNTY))).toContain("the silver is real");
  });

  it("ending_mercy: informed is a haunted half-measure, uninformed is a clean kindness", () => {
    expect(text(play(MERCY_TRUTH))).toContain("you saved the one you could see");
    expect(text(play(MERCY))).not.toContain("you saved the one you could see");
    expect(text(play(MERCY))).toContain("one family eats");
  });
});

describe("tithe_barn — the truth variant is cosmetic, not a route change", () => {
  it("informed and uninformed bounty/mercy converge on the same endingId", () => {
    expect(endId(play(BOUNTY_TRUTH))).toBe(endId(play(BOUNTY)));
    expect(endId(play(MERCY_TRUTH))).toBe(endId(play(MERCY)));
  });
});

describe("tithe_barn — the truth reframes the reckoning scene in the moment, not only the epilogue", () => {
  it("the reckoning reads her as a thief when uninformed, as wronged once the book is read", () => {
    expect(text(play(LEARN))).toContain("year of waste");
    expect(text(play(TO_RECKONING))).not.toContain("year of waste");
    expect(text(play(TO_RECKONING))).toContain("do what he pays you for");
  });
});
