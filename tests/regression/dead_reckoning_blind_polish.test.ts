/**
 * Regression (§15) for bug_0254 — blind-playtest polish for Dead Reckoning
 * (content/cyoa/pack/dead_reckoning.yaml, seed 5). A fresh MCP-only blind playtester
 * reached five distinct endings (landfall / holdfast / jonah / irons) with clarity 5/5,
 * enjoyment 4/5, mechanics flawless, flagging ONE first-pass clarity blemish on the very
 * first observation a player sees:
 *
 *   The deck (start) scene's base water-scarcity line read
 *   "...shared four ways, let alone five." The intent is a deliberate sacrifice-is-futile
 *   seed (even FOUR ways — the girl already over the side — won't buy two days, let alone
 *   the present five), but at the opening beat nothing has introduced the idea of putting
 *   anyone over, so the bare "four ways" has no referent and reads oddly. Only the opening
 *   used "four ways"; every later scene says "five ways".
 *
 * The fix leads with the present reality ("five ways") and grounds the hypothetical in the
 * crew's Jonah-reckoning the prior sentence sets up:
 *   "...shared five ways — nor four, the way the hands have begun to reckon it."
 * The futility seed is kept (won't last at five, nor at four) and "four" now has its referent.
 *
 * Locked BEHAVIOURALLY on the REAL buildObservation surface, at the start state a live player
 * actually stands in. All five endings' reachability + the two-axis knowledge branching are
 * proven by dead_reckoning_branching.test.ts and the auto-discovered CYOA bar.
 */
import { describe, it, expect } from "vitest";
import { loadPackFile } from "../../src/cyoa/pack.js";
import { indexPack, buildRules, initStateForPack } from "../../src/cyoa/runner.js";
import { buildObservation } from "../../src/cyoa/observation.js";
import { makeStep } from "../../src/core/engine.js";

const loaded = loadPackFile("content/cyoa/pack/dead_reckoning.yaml");
if (!loaded.ok) throw new Error("dead_reckoning pack must compile");
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

// The confusing original construction — the regression witness it must never carry again.
const BARE_FOUR_WAYS = /four ways, let alone five/i;

describe("bug_0254 — Dead Reckoning blind polish: the opening water-scarcity line grounds 'four'", () => {
  it("the deck opening leads with 'five ways' and grounds the hypothetical four-ways in the hands' reckoning", () => {
    const t = text(play([])); // start state — the literally-first observation
    expect(t).toMatch(/shared five ways/i); // present reality leads
    expect(t).toMatch(/nor four, the way the hands have begun to reckon it/i); // four now has its referent
  });

  it("the opening no longer carries the bare 'four ways, let alone five' construction", () => {
    const t = text(play([]));
    expect(t).not.toMatch(BARE_FOUR_WAYS);
  });

  it("the adrift hub variant still says 'five ways' (consistency preserved across scenes)", () => {
    // Turning aft to the chest sets quest stage `adrift`; back on deck the reactive variant renders.
    const t = text(play(["to_chest", "leave_chest"]));
    expect(t).toMatch(/shared five ways/i);
    expect(t).not.toMatch(BARE_FOUR_WAYS);
  });
});
