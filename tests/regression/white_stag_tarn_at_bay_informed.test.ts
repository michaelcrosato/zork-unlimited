/**
 * Regression (§15) for bug_0297 — the tarn scene's knows_truth variant fired even
 * when the player had also been to the bluff (at_bay set), producing text that
 * acknowledged the stone's truth but not the hesitation at bowshot. Meanwhile the
 * at_bay-only variant correctly acknowledged the bluff-and-back but said the stone
 * was "unread" — wrong when knows_truth is set.
 *
 * A blind playtest (seed 7, ai-runs/2026-06-08T07-22-13-606Z/playtest.md §4) surfaced
 * the seam: on session 6 (knows_truth + bluff hesitation), the tarn text didn't
 * acknowledge standing within bowshot.
 *
 * Fix: a compound variant gated on BOTH has_flag:knows_truth AND quest_stage:at_bay,
 * placed above the existing knows_truth and at_bay variants (first-match-wins).
 * No flag/choice/route/ending change — prose only.
 *
 * This test locks:
 * (1) knows_truth + at_bay → compound variant fires (anchor: "cannot unknow it").
 * (2) knows_truth only (not at_bay) → knows_truth variant fires ("stone behind you says").
 * (3) at_bay only (not knows_truth) → at_bay variant fires ("unread").
 * (4) neither → base text fires ("eyes too steady and too old for a beast").
 * (5) All four endings remain reachable after the edit.
 */
import { describe, it, expect } from "vitest";
import { loadPackFile } from "../../src/cyoa/pack.js";
import { indexPack, buildRules, initStateForPack } from "../../src/cyoa/runner.js";
import { buildObservation } from "../../src/cyoa/observation.js";
import { makeStep } from "../../src/core/engine.js";
import type { Action } from "../../src/api/types.js";

const loaded = loadPackFile("content/cyoa/pack/white_stag.yaml");
if (!loaded.ok) throw new Error("white_stag pack must compile");
const index = indexPack(loaded.compiled.pack);
const rules = buildRules(index);
const choose = (id: string): Action => ({ type: "CHOOSE", choiceId: id });

function play(ids: string[]) {
  const step = makeStep(rules);
  let s = initStateForPack(index, 1);
  for (const id of ids) s = step(s, choose(id)).state;
  return s;
}
const obsText = (s: ReturnType<typeof play>) => buildObservation(index, s).text.toLowerCase();
const endId = (s: ReturnType<typeof play>) => buildObservation(index, s).ending_id;

// knows_truth=true AND at_bay=true: read stone → go to bluff → come back.
const AT_TARN_INFORMED_AT_BAY = [
  "go_on",
  "read_stone",
  "decipher",
  "leave_stone",
  "take_shore", // sets at_bay
  "back_to_tarn", // back to tarn
];

// knows_truth=true, at_bay NOT set: read stone, return to tarn, no bluff visit.
const AT_TARN_INFORMED_ONLY = ["go_on", "read_stone", "decipher", "leave_stone"];

// at_bay=true, knows_truth NOT set: go straight to bluff, come back without reading.
const AT_TARN_AT_BAY_ONLY = ["go_on", "take_shore", "back_to_tarn"];

// Neither flag: first arrival at tarn.
const AT_TARN_BASE = ["go_on"];

describe("bug_0297 — tarn compound variant fires when knows_truth AND at_bay", () => {
  it("(1) knows_truth + at_bay: compound variant fires — 'cannot unknow it'", () => {
    const t = obsText(play(AT_TARN_INFORMED_AT_BAY));
    expect(t).toContain("cannot unknow it");
    expect(t).toContain("winter's keeper");
    expect(t).toContain("all that is left is the choosing");
    // Must NOT say "unread" (the stone has been read)
    expect(t).not.toContain("unread");
    // Must acknowledge having been within bowshot
    expect(t).toContain("stood within bowshot");
  });

  it("(2) knows_truth only (not at_bay): knows_truth variant fires — 'stone behind you says'", () => {
    const t = obsText(play(AT_TARN_INFORMED_ONLY));
    expect(t).toContain("stone behind you says");
    expect(t).not.toContain("cannot unknow it");
    expect(t).not.toContain("stood within bowshot");
  });

  it("(3) at_bay only (not knows_truth): at_bay variant fires — 'unread'", () => {
    const t = obsText(play(AT_TARN_AT_BAY_ONLY));
    expect(t).toContain("unread");
    expect(t).toContain("stood within bowshot");
    expect(t).not.toContain("stone behind you says");
    expect(t).not.toContain("cannot unknow it");
  });

  it("(4) neither flag: base text fires — original first-arrival description", () => {
    const t = obsText(play(AT_TARN_BASE));
    expect(t).toContain("eyes too steady and too old for a beast");
    expect(t).not.toContain("stone behind you says");
    expect(t).not.toContain("unread");
    expect(t).not.toContain("cannot unknow it");
  });

  it("(5) all four endings remain reachable after the edit", () => {
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
