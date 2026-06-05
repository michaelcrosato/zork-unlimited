/**
 * Regression (§15) for bug_0271 — the Dead Reckoning deck HUB now reframes by accumulated
 * knowledge (content/cyoa/pack/dead_reckoning.yaml). The mandated blind pass (seed 11,
 * ai-runs/2026-06-05T05-20-47-339Z/playtest.md, clarity 5/5 enjoyment 5/5) found the only
 * missed beat of reactivity: the chest, hold and cask all reframed by what the player had
 * learned, but the deck hub the player crosses BETWEEN investigations printed one identical
 * `adrift` line however much was known.
 *
 * The fix layers the deck's `adrift` window into four variants (most-specific first):
 *   knows_course ∧ knows_pilot  → synthesis (names both truths)
 *   knows_course                → "Hale's last reckoning is in your head"
 *   knows_pilot                 → "a marsh-town child who has read the inshore water"
 *   (none)                      → the unchanged bare "gone looking... wholly, to be done" line
 * All keep the quest_stage:adrift gate, so the hub still drops to base text past the cask, and
 * no routing/ending gating changed (proven by dead_reckoning_branching.test.ts + the CYOA bar).
 *
 * Locked BEHAVIOURALLY on the REAL buildObservation surface, at the hub states a live player
 * actually stands in when returning from a side-room.
 */
import { describe, it, expect } from "vitest";
import { loadPackFile } from "../../src/cyoa/pack.js";
import { indexPack, buildRules, initStateForPack } from "../../src/cyoa/runner.js";
import { buildObservation } from "../../src/cyoa/observation.js";
import { makeStep } from "../../src/core/engine.js";
import type { Action } from "../../src/api/types.js";

const loaded = loadPackFile("content/cyoa/pack/dead_reckoning.yaml");
if (!loaded.ok) throw new Error("dead_reckoning pack must compile");
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

// The knowledge-blind base line — the regression witness the informed hubs must NOT carry.
const BARE_ADRIFT = /what you do with it is still, wholly, to be done/i;

describe("bug_0271 — Dead Reckoning deck hub reframes by accumulated knowledge", () => {
  it("hub after reading the log only speaks the knows_course framing, not the bare adrift line", () => {
    const t = text(play(["to_chest", "read_log", "leave_chest"]));
    expect(t).toMatch(/hale's last reckoning is in your head/i);
    expect(t).toMatch(/two days east/i);
    expect(t).not.toMatch(BARE_ADRIFT);
  });

  it("hub after hearing the girl only speaks the knows_pilot framing, not the bare adrift line", () => {
    const t = text(play(["to_hold", "speak_girl", "leave_hold"]));
    expect(t).toMatch(/marsh-town child who has read the inshore water/i);
    expect(t).not.toMatch(BARE_ADRIFT);
  });

  it("hub after both truths speaks the synthesis framing naming course AND pilot", () => {
    const t = text(
      play(["to_chest", "read_log", "leave_chest", "to_hold", "speak_girl", "leave_hold"]),
    );
    expect(t).toMatch(/land lies two days east/i);
    expect(t).toMatch(/the one hand aboard who could read the boat onto it/i);
    expect(t).not.toMatch(BARE_ADRIFT);
  });

  it("the pistol alone (no truth learned) still reads the bare adrift base line", () => {
    // has_pistol is deliberately not read at the hub (mirrors the cask's two-truth device).
    const t = text(play(["to_chest", "take_pistol", "leave_chest"]));
    expect(t).toMatch(BARE_ADRIFT);
  });

  it("entering a side-room and leaving without learning anything still reads the bare adrift base line", () => {
    const t = text(play(["to_chest", "leave_chest"]));
    expect(t).toMatch(BARE_ADRIFT);
  });

  it("every hub variant preserves the 'shared five ways' scarcity (bug_0254 consistency)", () => {
    for (const route of [
      ["to_chest", "read_log", "leave_chest"],
      ["to_hold", "speak_girl", "leave_hold"],
      ["to_chest", "read_log", "leave_chest", "to_hold", "speak_girl", "leave_hold"],
      ["to_chest", "leave_chest"],
    ]) {
      expect(text(play(route))).toMatch(/shared five ways/i);
    }
  });
});
