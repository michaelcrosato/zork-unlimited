/**
 * bug_0255 — absolute-witness coverage for the `the_barn` quest-stage reactive-prose
 * contract on tithe_barn's `granary_floor` hub. NOT a discovered defect (parity with the
 * bug_0230/0240 canonicalize witnesses): the behaviour is correct today; this freezes it.
 *
 * tithe_barn.yaml carries ~40 lines of design commentary promising a precise, load-bearing
 * invariant on the barn-interior hub — two reactive layers that are TEMPORALLY MUTUALLY
 * EXCLUSIVE so neither suppresses the other (the bug_0145/0146 "provably-reachable-as-
 * displayed-text" liveness discipline):
 *
 *   (1) quest `the_barn` at stage `watch_begun` — the window after you have gone in but
 *       before you have read the book — set on the go_in CHOICE, read on `granary_floor`,
 *       which has no on_enter to reset it, so it shows on the very FIRST look inside the barn;
 *   (2) once the book is read, `knows_truth` fires AND the same effect advances the quest to
 *       `truth_read`, which CLOBBERS `watch_begun` — so layer (1) goes false the instant
 *       layer (2) becomes true, and the two never co-render.
 *
 * The existing tithe_barn_branching.test.ts locks the four-ending structure, the knows_truth
 * gate on open_doors, and the knows_truth reckoning/epilogue variants — but says NOTHING about
 * the quest-stage hub prose. So a future edit that broke the temporal exclusivity (reordered
 * the variants, dropped the `truth_read` clobber so `watch_begun` persisted alongside the
 * knows_truth layer, or left the base text showing on the first look) would pass every test
 * while regressing exactly the reactive rewrite a blind playtester (seed 11) singled out as
 * "a highlight". This pins it.
 *
 * Three single-line, layer-UNIQUE discriminators (each occurs once in the pack):
 *   - base only:        "frozen mid-reach"               (the unreached authored fallback)
 *   - watch_begun only: "you are in it now"
 *   - knows_truth only: "the way you did an hour ago"
 */
import { describe, it, expect } from "vitest";
import { loadPackFile } from "../../src/cyoa/pack.js";
import { indexPack, buildRules, initStateForPack } from "../../src/cyoa/runner.js";
import { buildObservation } from "../../src/cyoa/observation.js";
import { makeStep } from "../../src/core/engine.js";

const loaded = loadPackFile("content/cyoa/pack/tithe_barn.yaml");
if (!loaded.ok) throw new Error("tithe_barn pack must compile");
const index = indexPack(loaded.compiled.pack);
const rules = buildRules(index);
const choose = (id: string) => ({ type: "CHOOSE", choiceId: id }) as const;

function play(ids: string[]) {
  const step = makeStep(rules);
  let s = initStateForPack(index, 1);
  for (const id of ids) s = step(s, choose(id)).state;
  return s;
}
const text = (s: ReturnType<typeof play>) => buildObservation(index, s).text.toLowerCase();

// First look inside the barn: go_in set the_barn=watch_begun, granary_floor reads it.
const FIRST_LOOK = ["go_in"];
// Back at the hub AFTER reading the book to the foot of the page: decipher set knows_truth
// AND advanced the quest to truth_read (clobbering watch_begun); leave_book returns here.
const AFTER_READ = ["go_in", "read_book", "decipher", "leave_book"];

// Layer-unique markers (lowercased; each appears exactly once in the pack).
const BASE = "frozen mid-reach"; // authored fallback — never the reachable render
const WATCH_BEGUN = "you are in it now";
const KNOWS_TRUTH = "the way you did an hour ago";

describe("tithe_barn — the watch_begun hub variant is live on the FIRST look (bug_0145/0146 liveness)", () => {
  it("the first look inside the barn renders the watch_begun layer, superseding the base", () => {
    const t = text(play(FIRST_LOOK));
    expect(t).toContain(WATCH_BEGUN); // the early reactive layer is provably displayed text
    expect(t).not.toContain(BASE); // the reactive layer covers the first look — base never shows
    expect(t).not.toContain(KNOWS_TRUTH); // the truth layer is still dormant (book unread)
  });
});

describe("tithe_barn — reading the book retires watch_begun and lights knows_truth (temporal exclusivity)", () => {
  it("back at the hub after reading, only the knows_truth layer renders — watch_begun is clobbered", () => {
    const t = text(play(AFTER_READ));
    expect(t).toContain(KNOWS_TRUTH); // the truth layer is now live
    expect(t).not.toContain(WATCH_BEGUN); // truth_read clobbered watch_begun — the two never co-render
    expect(t).not.toContain(BASE); // still superseded
  });
});

describe("tithe_barn — the two hub layers are genuinely distinct renders (non-vacuity)", () => {
  it("the hub re-renders between the two windows — they are not the same text", () => {
    const first = text(play(FIRST_LOOK));
    const after = text(play(AFTER_READ));
    expect(first).not.toBe(after);
    // And each window shows exactly ONE layer (mutual exclusivity, restated as a matrix):
    expect(first).toContain(WATCH_BEGUN);
    expect(first).not.toContain(KNOWS_TRUTH);
    expect(after).toContain(KNOWS_TRUTH);
    expect(after).not.toContain(WATCH_BEGUN);
  });
});
