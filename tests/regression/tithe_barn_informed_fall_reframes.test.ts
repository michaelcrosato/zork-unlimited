/**
 * bug_0272 — content_fix: complete tithe_barn's reactive-epilogue device on the ONE
 * non-gated ending that was missing it. The pack's whole "truth" mechanism is that reading
 * the steward's book (knows_truth) reframes the SAME deliberate act in the epilogue:
 *   - ending_bounty  reframes  ("...and you do it KNOWING")
 *   - ending_mercy   reframes  ("you saved the one you could see" / "...you read the book")
 *   - ending_doors   needs no variant — it is GATED on knows_truth, so it is ALWAYS the
 *                    knowing act (you cannot throw the doors without having read the book).
 *   - ending_fall    did NOT reframe — yet it is NOT gated, so it has both an ignorant climb
 *                    (go_in -> climb_loft) and a KNOWING climb (read the book first, return to
 *                    the hub, climb anyway). Only the ignorant text existed. The 2026-06-05
 *                    blind pass (tithe_barn, seed 13) came back clean (clarity 5/5, enjoyment
 *                    4/5, all five endings reached) — this was a reactive-DEPTH gap the static
 *                    checks and that pass could pass over, not a live defect.
 *
 * The fix adds a `knows_truth` variant to ending_fall (the dramatic irony: you read that the
 * loft holds the oldest of a deliberate hoard, climb after more of it for yourself alone, and
 * that same hoard buries the one man who read the lie). This freezes the new contract AND
 * guards the device's symmetry — the base text must stay reached by the uninformed climb (no
 * dead fallback), the variant must fire on the informed climb, and both must land on the same
 * endingId (cosmetic reframe, never a reroute), exactly like bounty/mercy.
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

// Uninformed climb: straight up the rotten ladder, book unread.
const FALL = ["go_in", "climb_loft"];
// Informed climb: read & decipher the book (knows_truth), return to the hub, climb anyway.
const FALL_TRUTH = ["go_in", "read_book", "decipher", "leave_book", "climb_loft"];

// Layer-unique markers (lowercased; each appears once in the ending_fall block).
const KNOWING = "you set a boot to the ladder knowing"; // variant only
const BASE_ONLY = "you set a boot to the ladder, and for three rungs"; // base only

describe("tithe_barn — the informed fall reframes the death (knows_truth variant on ending_fall)", () => {
  it("the knowing climb renders the reframed epilogue (the hoard buries the man who read it)", () => {
    const t = text(play(FALL_TRUTH));
    expect(t).toContain(KNOWING); // the variant is live on the informed climb
    expect(t).toContain("the one man who read it");
    expect(t).not.toContain(BASE_ONLY); // the variant supersedes the base
  });

  it("the uninformed climb still renders the base text (no dead fallback)", () => {
    const t = text(play(FALL));
    expect(t).toContain(BASE_ONLY); // base stays reached by the ignorant climb
    expect(t).not.toContain(KNOWING); // the knowing layer is dormant (book unread)
  });
});

describe("tithe_barn — the fall variant is cosmetic, not a route change (device symmetry)", () => {
  it("informed and uninformed climbs converge on the SAME endingId", () => {
    expect(endId(play(FALL))).toBe("ending_fall");
    expect(endId(play(FALL_TRUTH))).toBe("ending_fall");
    expect(endId(play(FALL_TRUTH))).toBe(endId(play(FALL)));
  });

  it("the two climbs are genuinely distinct renders (non-vacuity)", () => {
    expect(text(play(FALL))).not.toBe(text(play(FALL_TRUTH)));
  });
});
