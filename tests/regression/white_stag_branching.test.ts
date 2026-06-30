/**
 * Regression (§15) for bug_0135 — content_new: *The White Stag*, the project's 8th
 * pack and the second purpose-built BRANCHING CYOA pack. Authored to press the one
 * standing product lever every recent cycle named: breadth via branching, the only
 * device shown to lift enjoyment to 5/5 (wreckers_light, bug_0099), where the linear
 * single-chain packs top out at 4/5. Like wreckers_light its THESIS is a moral fork,
 * not a lock-and-key chain — and here the OBVIOUS, sanctioned goal is the dark one
 * (a starving village + a lord's bounty make killing the white stag the easy choice),
 * so the depth is the player who stays the hand.
 *
 * The hidden "truth" (a carved boundary-stone naming the white stag as the winter's
 * keeper, whose killing brings an unbreaking winter) is the wreckers_light/clockwork
 * device: reading it sets `knows_truth`, which (a) fires reactive endingText variants
 * on the kill and the sparing, and (b) UNLOCKS the offering — the gated "best" ending,
 * a payoff reserved for the player who stopped to read the stone (cf. watchtower's
 * proof-gated finale). This test locks that structure:
 *   (1) all four endings (quarry / thaw / offering / lost) are reachable and distinct;
 *   (2) the moral fork is real — the SAME approach to the bluff reaches the kill or the
 *       mercy by choice alone (different endingId);
 *   (3) the offering is GATED on knows_truth — the choice is absent until the stone is
 *       read, and present after (the truth is mechanically load-bearing, not just flavor);
 *   (4) knows_truth fires reactive variants on the quarry AND thaw endings, while the
 *       uninformed route renders the base text;
 *   (5) those variants are cosmetic — informed and uninformed kills/sparings converge on
 *       the SAME endingId (the truth changes prose and unlocks the offering, never silently
 *       reroutes an existing choice);
 *   (6) the truth reframes the bluff scene in the moment (reactive prose), not only the
 *       epilogue.
 */
import { describe, it, expect } from "vitest";
import { loadPackFile } from "../../src/cyoa/pack.js";
import { indexPack, buildRules, initStateForPack } from "../../src/cyoa/runner.js";
import { buildObservation } from "../../src/cyoa/observation.js";
import { makeStep } from "../../src/core/engine.js";

const loaded = loadPackFile("content/cyoa/pack/white_stag.yaml");
if (!loaded.ok) throw new Error("white_stag pack must compile");
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
const text = (s: ReturnType<typeof play>) => obs(s).text.toLowerCase();
const endId = (s: ReturnType<typeof play>) => obs(s).ending_id;
const actionIds = (s: ReturnType<typeof play>) => obs(s).available_actions.map((a) => a.id);

// ── Route fragments ──────────────────────────────────────────────────────────
// Uninformed: straight down to the bluff, never reading the stone.
const TO_BLUFF = ["go_on", "take_shore"];
// Informed: read and decipher the stone, then go to the bluff (knows_truth set).
const LEARN = ["go_on", "read_stone", "decipher", "leave_stone", "take_shore"];

const QUARRY = [...TO_BLUFF, "loose_arrow"];
const THAW = [...TO_BLUFF, "lower_bow"];
const LOST = ["go_on", "cross_ice"];

const QUARRY_TRUTH = [...LEARN, "loose_arrow"];
const THAW_TRUTH = [...LEARN, "lower_bow"];
const OFFERING = [...LEARN, "lay_offering"]; // gated on knows_truth

describe("white_stag — four distinct endings are all reachable (anti-linearity)", () => {
  it("reaches quarry / thaw / offering / lost, each a distinct endingId", () => {
    const ids = [QUARRY, THAW, OFFERING, LOST].map((r) => endId(play(r)));
    expect(ids).toEqual(["ending_quarry", "ending_thaw", "ending_offering", "ending_lost"]);
    expect(new Set(ids).size).toBe(4); // genuinely distinct, not aliases
  });
});

describe("white_stag — the moral fork is real (same approach, opposite ending by choice)", () => {
  it("the identical approach to the bluff reaches the kill or the mercy by choice alone", () => {
    expect(QUARRY.slice(0, 2)).toEqual(THAW.slice(0, 2)); // identical approach prefix
    expect(endId(play(QUARRY))).toBe("ending_quarry");
    expect(endId(play(THAW))).toBe("ending_thaw");
  });
});

describe("white_stag — the offering is gated on the truth (knows_truth is load-bearing)", () => {
  it("lay_offering is absent at the bluff until the stone is read, and present after", () => {
    const ignorant = actionIds(play(TO_BLUFF));
    expect(ignorant).toContain("loose_arrow");
    expect(ignorant).toContain("lower_bow");
    expect(ignorant).not.toContain("lay_offering"); // no offering without the truth

    const informed = actionIds(play(LEARN));
    expect(informed).toContain("lay_offering"); // the stone unlocks it
  });

  it("the offering ending is reachable ONLY via the truth", () => {
    expect(endId(play(OFFERING))).toBe("ending_offering");
    // Sanity: the offering route really did set knows_truth (it ran LEARN first).
    expect(text(play(LEARN))).toContain("winter's keeper");
  });
});

describe("white_stag — knows_truth fires reactive epilogue variants", () => {
  it("ending_quarry: informed is a knowing damnation, uninformed is an ignorant tragedy", () => {
    expect(text(play(QUARRY_TRUTH))).toContain("you knew, and you loosed all the same");
    expect(text(play(QUARRY))).not.toContain("you knew, and you loosed all the same");
    expect(text(play(QUARRY))).toContain("the lord's gold is real");
  });

  it("ending_thaw: informed spares understanding, uninformed spares on instinct", () => {
    expect(text(play(THAW_TRUTH))).toContain("the stone told you true");
    expect(text(play(THAW))).not.toContain("the stone told you true");
    expect(text(play(THAW))).toContain("you never quite understand it");
  });
});

describe("white_stag — the truth variant is cosmetic, not a route change", () => {
  it("informed and uninformed kills/sparings converge on the same endingId", () => {
    expect(endId(play(QUARRY_TRUTH))).toBe(endId(play(QUARRY)));
    expect(endId(play(THAW_TRUTH))).toBe(endId(play(THAW)));
  });
});

describe("white_stag — the truth reframes the bluff scene in the moment, not only the epilogue", () => {
  it("the bluff reads the stag as quarry when uninformed, as the keeper once the stone is read", () => {
    expect(text(play(LEARN))).toContain("winter's keeper");
    expect(text(play(TO_BLUFF))).not.toContain("winter's keeper");
    expect(text(play(TO_BLUFF))).toContain("easy mark for a steady hand");
  });
});

const LOST_TRUTH = ["go_on", "read_stone", "decipher", "leave_stone", "cross_ice"];

describe("white_stag — knows_truth fires reactive epilogue on ending_lost (bug_0293)", () => {
  it("ending_lost: informed death names the stone's warning, uninformed death does not", () => {
    expect(text(play(LOST_TRUTH))).toContain("stone's warning still fresh");
    expect(text(play(LOST))).not.toContain("stone's warning still fresh");
    expect(text(play(LOST))).toContain("the foolish");
  });

  it("ending_lost: informed text anchors 'wood keeps its keeper', base does not", () => {
    expect(text(play(LOST_TRUTH))).toContain("wood keeps its keeper");
    expect(text(play(LOST))).not.toContain("wood keeps its keeper");
    expect(text(play(LOST))).toContain("wood keeps its heart");
  });

  it("both informed and uninformed crossings reach ending_lost (same endingId)", () => {
    expect(endId(play(LOST_TRUTH))).toBe("ending_lost");
    expect(endId(play(LOST))).toBe("ending_lost");
  });

  it("the informed crossing route really did set knows_truth", () => {
    expect(text(play(["go_on", "read_stone", "decipher"]))).toContain("the wood's bound heart");
  });
});
