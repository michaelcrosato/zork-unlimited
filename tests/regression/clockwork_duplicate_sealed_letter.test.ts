/**
 * Regression (§15) for bug_0041 — *The Clockwork Heist*'s "truth" letter is the
 * unique MacGuffin (the steward's confession), reachable two ways: the vault
 * take_letter and the crawlspace open_strongbox. Both scenes used to introduce it
 * with the IDENTICAL phrasing "a single sealed letter, addressed to no one," so a
 * blind player who saw both routes read it as TWO literal copies of a one-of-a-kind
 * item (a world-consistency double-take). Surfaced by a fresh MCP-only blind
 * playtester (seed 314, report ai-runs/2026-06-01T12-27-24-550Z/playtest.md §4+§5)
 * and independently the cycle before (seed 101, bug_0040 deferred next-focus (a)).
 *
 * Fix (content only, no gating change): the two descriptions are differentiated so
 * they read as a deliberately-PAIRED set — the vault letter as the DISPLAYED copy
 * ("laid out in plain sight ... among the gold") and the crawlspace letter as the
 * HIDDEN copy ("hidden away here in the dark, apart from the gold"). Each scene
 * stands alone (the crawlspace text does not presume a vault visit, preserving the
 * bug_0017/0025 discipline) and both still introduce a takeable sealed letter that
 * routes to ending_truth.
 *
 * Locked here:
 *   (1) the vault and crawlspace letter descriptions are no longer identical, and
 *       neither still reads as a bare "single sealed letter, addressed to no one";
 *   (2) the vault frames its letter as displayed/found-here; the crawlspace frames
 *       its letter as hidden/apart-from-the-gold — the in-world distinction;
 *   (3) the crawlspace text still stands alone (no "that same") and still names a
 *       "sealed letter" the player can take (bug_0017 invariants preserved);
 *   (4) reachability is unchanged — BOTH truth routes still reach ending_truth, and
 *       ending_rich (grab gold) + ending_caught (force) still fire.
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
  let s = initStateForPack(index, 41);
  for (const id of ids) s = step(s, choose(id)).state;
  return s;
}

// The crawlspace route to the truth: discover the panel, fetch the lockpick from
// the kitchen (bug_0022 made the strongbox a true lockbox), crack the strongbox.
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

const vaultText = () => index.pack.scenes.find((sc) => sc.id === "vault")!.text.toLowerCase();
const crawlText = () => index.pack.scenes.find((sc) => sc.id === "crawlspace")!.text.toLowerCase();

describe("bug_0041 — the truth letter no longer reads as two duplicate copies", () => {
  it("the two letter descriptions are no longer identical bare 'single sealed letter' lines", () => {
    const vault = vaultText();
    const crawl = crawlText();
    // The two scenes describe the letter differently now.
    expect(vault).not.toBe(crawl);
    // The crawlspace no longer opens with the vault's bare phrasing verbatim.
    expect(crawl).not.toContain("a single sealed letter, addressed to no one");
  });

  it("the vault frames its letter as the displayed copy among the gold", () => {
    const vault = vaultText();
    expect(vault).toContain("in plain sight");
    expect(vault).toContain("among the gold");
  });

  it("the crawlspace frames its letter as the hidden copy, apart from the gold", () => {
    const crawl = crawlText();
    expect(crawl).toContain("hidden");
    expect(crawl).toContain("apart from the gold");
    // bug_0017 invariants preserved: stands alone (no vault presumption) and still
    // names a takeable sealed letter.
    expect(crawl).not.toContain("that same");
    expect(crawl).toContain("sealed letter");
  });

  it("both truth routes still reach ending_truth (the letter is still takeable both ways)", () => {
    const crawl = play(CRAWLSPACE_ROUTE);
    expect(crawl.ended).toBe(true);
    expect(crawl.endingId).toBe("ending_truth");
    const vault = play(VAULT_LETTER_ROUTE);
    expect(vault.ended).toBe(true);
    expect(vault.endingId).toBe("ending_truth");
  });

  it("reachability is unchanged — grab-gold -> rich, force -> caught", () => {
    const rich = play(VAULT_GOLD_ROUTE);
    expect(rich.ended).toBe(true);
    expect(rich.endingId).toBe("ending_rich");
    const caught = play(FORCE_ROUTE);
    expect(caught.ended).toBe(true);
    expect(caught.endingId).toBe("ending_caught");
  });
});
