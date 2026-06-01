/**
 * Regression (§15) for bug_0030 — *The Clockwork Heist*'s "Truth" ending narrated
 * the player breaking the letter's seal "by moonlight" at the moment of the win.
 *
 * ending_truth is a SHARED ending reached two ways: through the vault (take the
 * sealed letter off the velvet cushion) OR through the hidden crawlspace behind the
 * great clock (crack the iron strongbox — bug_0022 made it a true lockbox). The old
 * prose opened "You break the seal by moonlight. ..." — but on the crawlspace route
 * the player breaks the seal while standing in a windowless, dusty crawlspace behind
 * the clock, nowhere near the foyer's moonlit glass dome. A fresh MCP-only blind
 * playtester hit this on the strongbox route (seed 113, report
 * ai-runs/2026-06-01T10-04-47-010Z/playtest.md §5, item 3): "you're standing in a
 * windowless dusty crawlspace, not anywhere with moonlight ... the ending text is
 * written assuming the vault route." Same class as bug_0017 / bug_0025 — shared
 * ending prose presuming one specific route.
 *
 * Fix (content only): the seal is now broken AFTER the escape — "You slip out into
 * the dark with the letter still sealed, and break it open by moonlight only once
 * the manor's walls are well behind you." Breaking the seal outdoors, after leaving
 * the manor, is true on BOTH the vault and the crawlspace/strongbox routes (both end
 * with the thief slipping out into the night), so the evocative moonlight is kept
 * without presuming an interior, lit setting at the moment of the reveal. No flags /
 * items / choices / gating / reachable endings change — text only.
 *
 * Locked here:
 *   (1) ending_truth no longer presumes an interior moonlit setting at the seal-break
 *       (no "break the seal by moonlight" before the escape) yet keeps the moral and
 *       the bug_0025 route-agnostic gold framing (no "untouched"/"leave it");
 *   (2) the crawlspace/strongbox route (a windowless crawlspace, never the lit vault)
 *       still reaches ending_truth — the route the presumptive text contradicted;
 *   (3) reachability is unchanged — the vault take-letter route still reaches
 *       ending_truth, and ending_rich (grab gold) + ending_caught (force) fire.
 */
import { describe, it, expect } from "vitest";
import { loadPackFile } from "../../src/cyoa/pack.js";
import { indexPack, buildRules, initStateForPack } from "../../src/cyoa/runner.js";
import { makeStep } from "../../src/core/engine.js";
import type { Action } from "../../src/api/types.js";

const loaded = loadPackFile("content/cyoa/pack/clockwork_heist.yaml");
if (!loaded.ok) throw new Error("clockwork_heist pack must compile");
const index = indexPack(loaded.compiled.pack);
const rules = buildRules(index);
const choose = (id: string): Action => ({ type: "CHOOSE", choiceId: id });

function play(ids: string[]) {
  const step = makeStep(rules);
  let s = initStateForPack(index, 113);
  for (const id of ids) s = step(s, choose(id)).state;
  return s;
}

// Crawlspace route: discover the panel, fetch the lockpick from the kitchen
// (bug_0022 made the strongbox a true lockbox), crack the strongbox. The player
// stays behind the clock in the crawlspace — never the foyer's moonlit dome.
const CRAWLSPACE_ROUTE = ["inspect_clock", "kitchens", "take_pick", "back_foyer", "pry_panel", "open_strongbox"];
// The vault route, taking the letter instead of the gold.
const VAULT_LETTER_ROUTE = ["kitchens", "take_pick", "dumbwaiter", "approach_vault", "pick_lock", "take_letter"];
// The vault route, grabbing the gold.
const VAULT_GOLD_ROUTE = ["kitchens", "take_pick", "dumbwaiter", "approach_vault", "pick_lock", "grab_gold"];
// Ignore the warning and force the door.
const FORCE_ROUTE = ["climb_stairs", "approach_vault", "force_door"];

describe("bug_0030 — the Truth ending no longer breaks the seal 'by moonlight' indoors", () => {
  it("ending_truth breaks the seal after the escape, not in the windowless crawlspace", () => {
    const truth = index.pack.endings.find((e) => e.id === "ending_truth");
    expect(truth).toBeDefined();
    const text = truth!.text.toLowerCase();
    // The seal is no longer broken up front, before the player is shown leaving.
    expect(text).not.toMatch(/^you break the seal by moonlight/);
    // It is now explicitly broken once the manor is behind the player (outdoors).
    expect(text).toContain("once the manor's walls are well behind you");
    // The moonlight mood survives — but now outdoors, true on either route.
    expect(text).toContain("moonlight");
    // bug_0025's route-agnostic gold framing is preserved (no physical-gold presumption).
    expect(text).not.toContain("untouched");
    expect(text).not.toContain("leave it");
    expect(text).not.toContain("leave the gold");
    // The truth-over-riches moral is intact.
    expect(text).toContain("truth");
    expect(text).toContain("worth more than escaping rich");
  });

  it("the windowless crawlspace/strongbox route still reaches ending_truth", () => {
    const s = play(CRAWLSPACE_ROUTE);
    expect(s.ended).toBe(true);
    expect(s.endingId).toBe("ending_truth");
  });

  it("reachability is unchanged — vault take-letter -> truth, grab-gold -> rich, force -> caught", () => {
    const letter = play(VAULT_LETTER_ROUTE);
    expect(letter.ended).toBe(true);
    expect(letter.endingId).toBe("ending_truth");
    const rich = play(VAULT_GOLD_ROUTE);
    expect(rich.ended).toBe(true);
    expect(rich.endingId).toBe("ending_rich");
    const caught = play(FORCE_ROUTE);
    expect(caught.ended).toBe(true);
    expect(caught.endingId).toBe("ending_caught");
  });
});
