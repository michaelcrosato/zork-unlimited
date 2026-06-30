/**
 * Regression (§15) for bug_0286 — The Clockwork Heist's crawlspace described
 * the strongbox as "locked fast" even after the player returned with lockpicks.
 *
 * A blind playtester (seed 42, report ai-runs/2026-06-08T04-38-51-995Z/playtest.md)
 * noted: on both visits the scene text read identically — "a forgotten iron
 * strongbox, its lid locked fast." After fetching the pick, the available action
 * changed to open_strongbox, but the description still called the box "locked fast":
 * text contradicted agency. Reactive-description-blindness class (bug_0282/0283/0284).
 *
 * Fix (content, pure prose — bug_0286): crawlspace gains has_item:lockpick variants
 * for each tick tier (ticks>=4, ticks>=2, and base/low) placed above their no-pick
 * counterparts (first-match-wins). With picks: "rusted, but no match for the picks
 * in your pocket" / "rusted but yielding." No-pick text ("locked fast") unchanged.
 *
 * Locked here:
 *   (1) without picks: scene text contains "locked fast";
 *   (2) with picks (base ticks): NOT "locked fast"; contains "picks in your pocket";
 *   (3) with picks (mid ticks >= 2): NOT "locked fast"; contains "picks in your pocket";
 *   (4) available actions unchanged: open_strongbox with picks, study_strongbox without;
 *   (5) crawlspace route still reaches ending_truth (regression).
 */
import { describe, it, expect } from "vitest";
import { loadPackFile } from "../../src/cyoa/pack.js";
import { indexPack, buildRules, initStateForPack } from "../../src/cyoa/runner.js";
import { buildObservation } from "../../src/cyoa/observation.js";
import { makeStep } from "../../src/core/engine.js";

const loaded = loadPackFile("content/cyoa/pack/clockwork_heist.yaml");
if (!loaded.ok) throw new Error("clockwork_heist pack must compile");
const index = indexPack(loaded.compiled.pack);
const rules = buildRules(index);
const choose = (id: string) => ({ type: "CHOOSE", choiceId: id }) as const;

function play(ids: string[], seed = 42) {
  const step = makeStep(rules);
  let s = initStateForPack(index, seed);
  for (const id of ids) s = step(s, choose(id)).state;
  return s;
}

const obsText = (ids: string[]) => buildObservation(index, play(ids)).text.toLowerCase();

const optionIds = (ids: string[]) =>
  buildObservation(index, play(ids)).available_actions.map((a) => a.id);

// First visit: inspect_clock → pry_panel → crawlspace, no picks, ticks=0
const NO_PICK_CRAWLSPACE = ["inspect_clock", "pry_panel"];

// Return visit with picks, low ticks (ticks=1 after kitchen entry)
const WITH_PICK_LOW_TICKS = ["inspect_clock", "kitchens", "take_pick", "back_foyer", "pry_panel"];

// Return visit with picks, mid ticks (ticks=2: landing + kitchen)
const WITH_PICK_MID_TICKS = [
  "inspect_clock",
  "climb_stairs",
  "back_down",
  "kitchens",
  "take_pick",
  "back_foyer",
  "pry_panel",
];

// Full crawlspace truth route
const CRAWLSPACE_TRUTH = [
  "inspect_clock",
  "kitchens",
  "take_pick",
  "back_foyer",
  "pry_panel",
  "open_strongbox",
];

describe("bug_0286 — crawlspace stale lock text when player holds picks", () => {
  it("without picks: scene text contains 'locked fast'", () => {
    const text = obsText(NO_PICK_CRAWLSPACE);
    expect(text).toContain("locked fast");
  });

  it("with picks (base ticks): NOT 'locked fast'; contains 'picks in your pocket'", () => {
    const text = obsText(WITH_PICK_LOW_TICKS);
    expect(text).not.toContain("locked fast");
    expect(text).toContain("picks in your pocket");
  });

  it("with picks (mid ticks >= 2): NOT 'locked fast'; contains 'picks in your pocket'", () => {
    const text = obsText(WITH_PICK_MID_TICKS);
    expect(text).not.toContain("locked fast");
    expect(text).toContain("picks in your pocket");
  });

  it("available actions unchanged: open_strongbox with picks, study_strongbox without", () => {
    expect(optionIds(NO_PICK_CRAWLSPACE)).toContain("study_strongbox");
    expect(optionIds(NO_PICK_CRAWLSPACE)).not.toContain("open_strongbox");
    expect(optionIds(WITH_PICK_LOW_TICKS)).toContain("open_strongbox");
    expect(optionIds(WITH_PICK_LOW_TICKS)).not.toContain("study_strongbox");
  });

  it("crawlspace route still reaches ending_truth", () => {
    const s = play(CRAWLSPACE_TRUTH);
    expect(s.ended).toBe(true);
    expect(s.endingId).toBe("ending_truth");
  });
});
