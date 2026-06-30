/**
 * Regression (§15) for bug_0296 — *The White Stag*'s tarn scene showed `read_stone`
 * as an available action even after `knows_truth` was set, despite `decipher` (the
 * only meaningful action inside shrine) already being gated on `not_flag: knows_truth`.
 * A blind playtester (seed 7, ai-runs/2026-06-08T07-12-31-913Z/playtest.md §4)
 * flagged the inconsistency: clicking the stale `read_stone` after reading sends you
 * to shrine which handles it gracefully, but surfacing the action is mild clutter
 * and inconsistent with `decipher`'s own gating.
 *
 * The fix adds `conditions: [{ not_flag: knows_truth }]` to `read_stone` in tarn,
 * mirroring the gate already on `decipher`. shrine's `knows_truth` variant remains
 * live — reachable via the decipher → next: shrine re-render path (decipher sets
 * knows_truth then returns to shrine, which renders the variant).
 *
 * This test locks:
 * (1) Without knows_truth: read_stone IS in tarn's available_actions.
 * (2) With knows_truth set: read_stone is NOT in tarn's available_actions.
 * (3) The shrine knows_truth variant is live (not dead): reachable via decipher→re-render.
 * (4) All four endings remain reachable with the fix in place.
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
  let s = initStateForPack(index, 7);
  for (const id of ids) s = step(s, choose(id)).state;
  return s;
}
const obs = (s: ReturnType<typeof play>) => buildObservation(index, s);
const actionIds = (s: ReturnType<typeof play>) => obs(s).available_actions.map((a) => a.id);
const endId = (s: ReturnType<typeof play>) => obs(s).ending_id;
const obsText = (s: ReturnType<typeof play>) => obs(s).text.toLowerCase();

// Tarn without knows_truth (first arrival).
const AT_TARN_IGNORANT = ["go_on"];

// Tarn with knows_truth set — achieved by: read_stone → decipher → leave_stone → back at tarn.
const AT_TARN_INFORMED = ["go_on", "read_stone", "decipher", "leave_stone"];

// Post-decipher shrine re-render: decipher sets knows_truth and next: shrine.
const SHRINE_AFTER_DECIPHER = ["go_on", "read_stone", "decipher"];

describe("bug_0296 — read_stone gated on not_flag: knows_truth (tarn choice clutter)", () => {
  it("without knows_truth: read_stone is in tarn's available_actions", () => {
    const s = play(AT_TARN_IGNORANT);
    expect(s.current).toBe("tarn");
    expect(s.flags["knows_truth"]).not.toBe(true);
    expect(actionIds(s)).toContain("read_stone");
  });

  it("with knows_truth set: read_stone is NOT in tarn's available_actions", () => {
    const s = play(AT_TARN_INFORMED);
    expect(s.current).toBe("tarn");
    expect(s.flags["knows_truth"]).toBe(true);
    expect(actionIds(s)).not.toContain("read_stone");
    // take_shore and cross_ice remain (routing unchanged)
    expect(actionIds(s)).toContain("take_shore");
    expect(actionIds(s)).toContain("cross_ice");
  });

  it("shrine knows_truth variant is live: fires on decipher→re-render, not a dead variant", () => {
    const s = play(SHRINE_AFTER_DECIPHER);
    expect(s.current).toBe("shrine");
    expect(s.flags["knows_truth"]).toBe(true);
    // The knows_truth variant text — "kneeling here a second time does not unsay it"
    expect(obsText(s)).toContain("kneeling here a second time does not unsay it");
  });

  it("all four endings remain reachable with the fix in place", () => {
    const LEARN = ["go_on", "read_stone", "decipher", "leave_stone", "take_shore"];
    const results = [
      endId(play(["go_on", "take_shore", "loose_arrow"])), // ending_quarry
      endId(play(["go_on", "take_shore", "lower_bow"])), // ending_thaw
      endId(play([...LEARN, "lay_offering"])), // ending_offering
      endId(play(["go_on", "cross_ice"])), // ending_lost
    ];
    expect(results).toEqual(["ending_quarry", "ending_thaw", "ending_offering", "ending_lost"]);
  });
});
