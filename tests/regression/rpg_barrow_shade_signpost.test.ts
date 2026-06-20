/**
 * Regression (§15) for bug_0170 — missing in-scene signpost to the optional shade in
 * The Sunken Barrow's Entry Hall. The Entry Hall is the pack's real fork: west to the
 * optional reaver's shade (whose +3 ward, bug_0113, is the decisive survival lever) and
 * north into the under-armed, ~43%-lethal wight (bug_0102). The old prose narrated the
 * west breach as a bare "cramped side cell" with no cue anything was there, so a
 * first-timer could walk past the prepared path and die to RNG with no signpost the
 * counsel ever existed — the bug_0027/0029 anti-gotcha failure mode (a player loses a
 * winnable game for want of a telegraph), here on the wight (blind seed 42/7,
 * ai-runs/2026-06-03T11-37-52-305Z/playtest.md §5).
 *
 * The fix is pure CONTENT — the west-breach prose telegraphs the shade IN SCENE. bug_0398
 * sharpened the original "something lingers" cue into explicit counsel/not-an-ambush
 * wording because the shade is load-bearing preparation, not merely atmosphere. It only
 * signposts the choice; the shade stays optional and bug_0102's lethal under-armed gamble
 * is untouched — no flags/vars/items/exits/gating/scoring/reachable endings change.
 *
 * Locked here:
 *   (1) the base Entry Hall (bar not yet taken) carries the watchful side-cell cue;
 *   (2) the has_item:iron_bar variant ALSO carries it (both renderings agree);
 *   (3) the cue is text-only — taking the bar yields no incidental state change.
 */
import { describe, it, expect } from "vitest";
import { loadRpgPackFile } from "../../src/rpg/pack.js";
import { indexRpgPack, buildRpgRules, initStateForRpgPack } from "../../src/rpg/runner.js";
import { buildRpgObservation } from "../../src/rpg/observation.js";
import { makeStep, actionEquals } from "../../src/core/engine.js";
import type { Action } from "../../src/api/types.js";
import type { GameState } from "../../src/core/state.js";

const loaded = loadRpgPackFile("content/rpg/pack/sunken_barrow.yaml");
if (!loaded.ok) throw new Error("sunken_barrow must compile");
const index = indexRpgPack(loaded.compiled.pack);
const rules = buildRpgRules(index);
const step = makeStep(rules);

/** Issue an action, asserting it was legal first (legal ⊇ executable). */
function act(state: GameState, action: Action): GameState {
  const legal = rules.legalActions(state).some((a) => actionEquals(a, action));
  expect(legal, `action ${JSON.stringify(action)} must be legal in ${state.current}`).toBe(true);
  const r = step(state, action);
  expect(r.ok).toBe(true);
  return r.state;
}

const desc = (s: GameState): string => buildRpgObservation(index, s).description;

// The cue must draw a player to the side cell (safe/helpful counsel before the
// north fight) and must not collapse into a bare "empty side cell" reading.
const CUE = /old counsel, not an ambush|counsel before blood/;

describe("bug_0170 — Entry Hall signposts the optional shade in the side cell", () => {
  it("the base description (bar not yet taken) telegraphs the watchful side cell", () => {
    let s = initStateForRpgPack(index, 1);
    s = act(s, { type: "MOVE", direction: "down" }); // entry_hall
    expect(s.current).toBe("entry_hall");
    expect(s.inventory).not.toContain("iron_bar");
    expect(desc(s)).toMatch(CUE);
    expect(desc(s)).toContain("unwarned blade");
    expect(desc(s)).not.toContain("something lingers");
  });

  it("the has_item:iron_bar variant ALSO telegraphs it (both renderings agree)", () => {
    let s = initStateForRpgPack(index, 1);
    s = act(s, { type: "MOVE", direction: "down" });
    s = act(s, { type: "TAKE", item: "iron_bar" });
    expect(s.current).toBe("entry_hall");
    expect(s.inventory).toContain("iron_bar");
    // The bar-variant still drops the stale-bar clause (bug_0028) AND keeps the cue.
    expect(desc(s)).toContain("scuffed bare");
    expect(desc(s)).toMatch(CUE);
    expect(desc(s)).toContain("unwarned blade");
    expect(desc(s)).not.toContain("something lingers");
  });

  it("the cue is text-only — taking the bar changes no game state", () => {
    let s = initStateForRpgPack(index, 1);
    s = act(s, { type: "MOVE", direction: "down" });
    const before = s;
    s = act(s, { type: "TAKE", item: "iron_bar" });
    expect(s.inventory).toContain("iron_bar");
    expect(s.flags).toEqual(before.flags);
    expect(s.vars).toEqual(before.vars);
    expect(s.journal).toEqual(before.journal);
    expect(s.questStage).toEqual(before.questStage);
  });
});
