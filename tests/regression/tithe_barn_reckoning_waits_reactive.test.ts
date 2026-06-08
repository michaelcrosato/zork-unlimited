/**
 * Regression (§15) for bug_0295 — content_fix: tithe_barn reckoning knows_truth variant
 * now acknowledges that the woman waited during the player's time at the ledger table.
 *
 * The reckoning knows_truth variant originally opened "The thief straightens against the
 * sacks, past running, and meets your eye…" — a description that works for a first approach
 * but gives no signal that she held still while the watchman walked away to read the book
 * (the back_to_floor → granary_floor → read ledger → face_thief path). A fresh blind
 * playtester (2026-06-08T07-01-32-096Z) specifically noted the implicit time-pause was
 * unacknowledged: "A curious player might wonder why the thief just waits patiently while
 * the watchman ambles back to read a ledger."
 *
 * Fix: first sentence of the knows_truth variant changed to "She has not moved; she
 * straightens against the sacks to meet your eye, past running…" — works for both the
 * direct informed approach (read first, face after) and the mid-confrontation book-detour
 * (face → back → read → face again). Prose-only; no flag/route/choice/ending change.
 * All existing test anchors ("year of waste", "do what he pays you for") preserved.
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
const text = (s: ReturnType<typeof play>) => buildObservation(index, s).text.toLowerCase();

// Route: read book first, then face the thief (knows_truth via direct path).
const LEARN_THEN_FACE = ["go_in", "read_book", "decipher", "leave_book", "face_thief"];
// Route: face thief, retreat to read the book, face thief again (mid-confrontation detour).
const FACE_THEN_LEARN = [
  "go_in",
  "face_thief",
  "back_to_floor",
  "read_book",
  "decipher",
  "leave_book",
  "face_thief",
];
// Route: straight to reckoning, book never read.
const IGNORANT = ["go_in", "face_thief"];

const WAITS_ANCHOR = "she has not moved"; // new anchor — fires in knows_truth variant only
const TRUTH_ANCHOR = "year of waste"; // existing anchor — preserved in knows_truth variant
const SHARED = "do what he pays you for"; // present in both variants (base and knows_truth)

describe("tithe_barn reckoning — knows_truth variant acknowledges the woman waited", () => {
  it("direct informed approach renders the waits acknowledgment", () => {
    const t = text(play(LEARN_THEN_FACE));
    expect(t).toContain(WAITS_ANCHOR);
    expect(t).toContain(TRUTH_ANCHOR); // existing anchor preserved
  });

  it("mid-confrontation book-detour path also renders the waits acknowledgment", () => {
    const t = text(play(FACE_THEN_LEARN));
    expect(t).toContain(WAITS_ANCHOR);
    expect(t).toContain(TRUTH_ANCHOR);
  });

  it("ignorant path does NOT render the waits acknowledgment (base text fires)", () => {
    const t = text(play(IGNORANT));
    expect(t).not.toContain(WAITS_ANCHOR);
    expect(t).toContain(SHARED); // shared phrase still present
  });

  it("both paths still contain the shared 'do what he pays you for' phrase", () => {
    expect(text(play(LEARN_THEN_FACE))).toContain(SHARED);
    expect(text(play(IGNORANT))).toContain(SHARED);
  });
});
