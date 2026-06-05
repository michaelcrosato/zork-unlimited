/**
 * bug_0273 — content_fix: complete wreckers_light's reactive-epilogue device on the ONE
 * non-gated ending that was missing it. The pack's whole "truth" mechanism is that reading
 * the keeper's journal (knows_truth) reframes the SAME deliberate act in the epilogue:
 *   - ending_saved   reframes  ("...you saved her KNOWING whose hand is at the wheel")
 *   - ending_wrecker reframes  ("...you tell yourself it was justice")
 *   - ending_mercy   reframes  ("...he sees that you already know")
 *   - ending_drowned did NOT reframe — yet it is NOT gated, so it has both an ignorant climb
 *                    (enter -> out_gallery -> climb_to_wreck) AND a KNOWING climb (read the
 *                    journal first, return to the hub, climb anyway). Only the ignorant text
 *                    existed. The 2026-06-05 blind pass (wreckers_light, seed 3) came back clean
 *                    (clarity 5/5, enjoyment 5/5, four endings + the death reached) — this was a
 *                    reactive-DEPTH gap the static checks and that pass could pass over, not a
 *                    live defect.
 *
 * The fix adds a `knows_truth` variant to ending_drowned (the dramatic irony: you go over the
 * rail KNOWING the Mourning Star carries the man who drowned the keeper's son, and the lamp
 * stays dark, so she drowns with you — "the rocks do not trouble to tell them apart"). This
 * freezes the new contract AND guards the device's symmetry — the base text must stay reached
 * by the uninformed climb (no dead fallback), the variant must fire on the informed climb, and
 * both must land on the same endingId (cosmetic reframe, never a reroute), exactly like
 * saved/wrecker/mercy. Same shape as bug_0272 (tithe_barn's ending_fall).
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
const text = (s: ReturnType<typeof play>) => obs(s).text.toLowerCase();
const endId = (s: ReturnType<typeof play>) => obs(s).ending_id;

// Uninformed climb: straight out to the gallery and over the rail, journal unread.
const DROWN = ["enter", "out_gallery", "climb_to_wreck"];
// Informed climb: take the key, read the journal (knows_truth), return to the hub, climb anyway.
const DROWN_TRUTH = [
  "enter",
  "hear_keeper",
  "search_keeper",
  "go_down",
  "unlock_chest",
  "read_journal",
  "back_up",
  "out_gallery",
  "climb_to_wreck",
];

// Layer-unique markers (lowercased; each appears once in the ending_drowned block).
const KNOWING = "you go down knowing whose bell still tolls"; // variant only
const BASE_ONLY = "the white water is not cold for long"; // base only

describe("wreckers_light — the informed drowning reframes (knows_truth variant on ending_drowned)", () => {
  it("the knowing climb renders the reframed epilogue (she drowns with you, the dark lamp unlit)", () => {
    const t = text(play(DROWN_TRUTH));
    expect(t).toContain(KNOWING); // the variant is live on the informed climb
    expect(t).toContain("the rocks do not trouble to tell them apart");
    expect(t).not.toContain(BASE_ONLY); // the variant supersedes the base
  });

  it("the uninformed climb still renders the base text (no dead fallback)", () => {
    const t = text(play(DROWN));
    expect(t).toContain(BASE_ONLY); // base stays reached by the ignorant climb
    expect(t).not.toContain(KNOWING); // the knowing layer is dormant (journal unread)
  });
});

describe("wreckers_light — the drowned variant is cosmetic, not a route change (device symmetry)", () => {
  it("informed and uninformed climbs converge on the SAME endingId", () => {
    expect(endId(play(DROWN))).toBe("ending_drowned");
    expect(endId(play(DROWN_TRUTH))).toBe("ending_drowned");
    expect(endId(play(DROWN_TRUTH))).toBe(endId(play(DROWN)));
  });

  it("the two climbs are genuinely distinct renders (non-vacuity)", () => {
    expect(text(play(DROWN))).not.toBe(text(play(DROWN_TRUTH)));
  });
});
