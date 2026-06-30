/**
 * Regression (§15) for bug_0025 — *The Clockwork Heist*'s "Truth" ending still
 * presumed the player had physically stood over the vault's gold and declined it.
 *
 * bug_0017 already reworded this ending once ("You leave the gold" -> "There was
 * gold enough in this house to vanish on, but you leave it untouched..."), framing
 * the gold as a property of the manor. But "you leave IT untouched" still presumes
 * the player was beside the gold and chose not to take it — true on the vault
 * take-letter route, FALSE on the crawlspace/strongbox route, where the player
 * never reaches the vault and never sees a single coin. A fresh MCP-only blind
 * playtester re-surfaced exactly this on the crawlspace route (seed 303, report
 * ai-runs/2026-06-01T09-10-35-256Z/playtest.md §5): "you never reach the vault or
 * see the gold, so 'leave it untouched' rings false."
 *
 * Fix (content only): the ending now frames the forgone riches as the heist's
 * PURPOSE ("You came to rob this house and could have vanished rich on its hoard;
 * instead you slip out ... carrying nothing but the truth"), which is true whether
 * the player stood in the vault or cracked the crawlspace strongbox — no physical
 * gold encounter is presumed. No flags / items / choices / gating / reachable
 * endings change — text only.
 *
 * Locked here:
 *   (1) ending_truth no longer presumes a physical gold encounter (no "untouched",
 *       no "leave it", no "leave the gold") yet keeps the truth-over-riches moral;
 *   (2) the crawlspace/strongbox route (which never sees the vault or gold) still
 *       reaches ending_truth — the route the presumptive text contradicted;
 *   (3) reachability is unchanged — the vault take-letter route still reaches
 *       ending_truth, and ending_rich (grab gold) + ending_caught (force) fire.
 */
import { describe, it, expect } from "vitest";
import { loadPackFile } from "../../src/cyoa/pack.js";
import { indexPack, buildRules, initStateForPack } from "../../src/cyoa/runner.js";
import { makeStep } from "../../src/core/engine.js";

const loaded = loadPackFile("content/cyoa/pack/clockwork_heist.yaml");
if (!loaded.ok) throw new Error("clockwork_heist pack must compile");
const index = indexPack(loaded.compiled.pack);
const rules = buildRules(index);
const choose = (id: string) => ({ type: "CHOOSE", choiceId: id }) as const;

function play(ids: string[]) {
  const step = makeStep(rules);
  let s = initStateForPack(index, 25);
  for (const id of ids) s = step(s, choose(id)).state;
  return s;
}

// The crawlspace route never enters the vault: discover the panel, fetch the
// lockpick from the kitchen (bug_0022 made the strongbox a true lockbox), then
// crack the strongbox. No gold is ever seen on this route.
const CRAWLSPACE_ROUTE = [
  "inspect_clock",
  "kitchens",
  "take_pick",
  "back_foyer",
  "pry_panel",
  "open_strongbox",
];
// The vault route, taking the letter instead of the gold.
const VAULT_LETTER_ROUTE = [
  "kitchens",
  "take_pick",
  "dumbwaiter",
  "approach_vault",
  "pick_lock",
  "take_letter",
];
// The vault route, grabbing the gold.
const VAULT_GOLD_ROUTE = [
  "kitchens",
  "take_pick",
  "dumbwaiter",
  "approach_vault",
  "pick_lock",
  "grab_gold",
];
// Ignore the warning and force the door.
const FORCE_ROUTE = ["climb_stairs", "approach_vault", "force_door"];

describe("bug_0025 — the Truth ending presumes no physical gold encounter", () => {
  it("ending_truth no longer presumes the player stood over the gold, keeps its moral", () => {
    const truth = index.pack.endings.find((e) => e.id === "ending_truth");
    expect(truth).toBeDefined();
    const text = truth!.text.toLowerCase();
    // The presumptive phrasings (you stood beside the gold and declined it) are gone.
    expect(text).not.toContain("untouched");
    expect(text).not.toContain("leave it");
    expect(text).not.toContain("leave the gold"); // also held by bug_0017
    // The truth-over-riches moral is intact.
    expect(text).toContain("truth");
    expect(text).toContain("worth more than escaping rich");
  });

  it("the crawlspace/strongbox route (never sees the vault or gold) still reaches ending_truth", () => {
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
