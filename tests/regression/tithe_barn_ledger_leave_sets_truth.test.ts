/**
 * Regression (§15) for bug_0328 — content_fix: tithe_barn leave_book now sets
 * knows_truth so the player who reads the ledger but leaves before hitting decipher
 * still receives the flag and its downstream content.
 *
 * The ledger scene shows the full damning revelation in its base text (the clerk's
 * neat hand, the lord's sealed order, "the town is not starving because the harvest
 * failed"). The `decipher` action ("Read on, week by week") was the sole setter of
 * `knows_truth`, so a player who read the scene text and then chose `leave_book`
 * (plausible: "I've seen enough — time to act") exited silently without the flag.
 * Consequence: `open_doors` never appeared at reckoning, and both ending_bounty
 * and ending_mercy showed base text rather than the reactive "KNOWING" variants —
 * the heart of the pack's moral engine quietly misfired with no warning.
 *
 * Fix: `leave_book` now carries `set_flag: knows_truth` and
 * `set_quest_stage: truth_read` effects (no add_journal — the decipher path retains
 * the journal entry; leave_book fires the same no-op on second visit). Flag and
 * quest-stage change only; no choice label, route, or ending change.
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

// Route: read book, immediately leave without deciphering, then face thief.
const LEAVE_NO_DECIPHER = ["go_in", "read_book", "leave_book", "face_thief"];

describe("tithe_barn — leave_book sets knows_truth (bug_0328)", () => {
  it("open_doors is available at reckoning after read+leave (no decipher required)", () => {
    const actions = actionIds(play(LEAVE_NO_DECIPHER));
    expect(actions).toContain("open_doors");
  });

  it("ending_doors is reachable via read+leave (no decipher)", () => {
    const state = play([...LEAVE_NO_DECIPHER, "open_doors"]);
    expect(endId(state)).toBe("ending_doors");
  });

  it("ending_bounty shows the KNOWING reactive variant after read+leave", () => {
    const t = text(play([...LEAVE_NO_DECIPHER, "take_her"]));
    expect(t).toContain("and you do it knowing");
    expect(t).not.toContain("you only kept a law");
  });

  it("ending_mercy shows the haunted half-measure variant after read+leave", () => {
    const t = text(play([...LEAVE_NO_DECIPHER, "let_her_go"]));
    expect(t).toContain("you saved the one you could see");
    expect(t).not.toContain("one family eats this week");
  });

  it("decipher path still sets knows_truth and reaches ending_doors (existing behavior)", () => {
    const LEARN = ["go_in", "read_book", "decipher", "leave_book", "face_thief"];
    expect(actionIds(play(LEARN))).toContain("open_doors");
    expect(endId(play([...LEARN, "open_doors"]))).toBe("ending_doors");
  });

  it("second leave_book (after decipher already set flag) is a harmless no-op", () => {
    // decipher sets knows_truth, then leave_book fires set_flag again (no-op), then
    // player can return to ledger (read_book) and leave again — no crash, no bad state.
    const DECIPHER_THEN_REVISIT = [
      "go_in",
      "read_book",
      "decipher",
      "leave_book",
      "read_book",
      "leave_book",
      "face_thief",
    ];
    const actions = actionIds(play(DECIPHER_THEN_REVISIT));
    expect(actions).toContain("open_doors");
  });
});
