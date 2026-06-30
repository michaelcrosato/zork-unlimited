/**
 * Regression (§15) for bug_0017 — the "Truth" thread on *The Clockwork Heist* was
 * written assuming the vault route and read as a contradiction on the crawlspace
 * route. Surfaced by a blind MCP playtester (seed 37, report
 * ai-runs/2026-06-01T07-35-13-159Z/playtest.md, §4 + §5) and matching the
 * deferred bug_0008 next-focus notes.
 *
 * The crawlspace is only ever reached BEFORE / INSTEAD of the vault (entering the
 * vault ends the game on the next choice), so its first-visit text "...that same
 * sealed letter" presumed a vault visit the player has never made — always wrong.
 * And ending_truth's "You leave the gold" presumed the player stood in the vault
 * and saw the gold, false on the crawlspace route where no gold is ever seen.
 *
 * Locked here:
 *   (1) the crawlspace text stands alone — no "that same", still introduces the
 *       sealed letter — and the crawlspace route still reaches ending_truth;
 *   (2) ending_truth no longer presumes the vault route ("leave the gold" gone),
 *       still carries the truth-over-riches moral, and reads truthfully on BOTH
 *       the crawlspace route and the vault take-letter route;
 *   (3) reachability is unchanged — ending_rich (grab gold) and ending_caught
 *       (force the door) still fire, so this was text-only, no gating change.
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
  let s = initStateForPack(index, 37);
  for (const id of ids) s = step(s, choose(id)).state;
  return s;
}

// The crawlspace route to the truth. Since bug_0022 the strongbox is a true
// lockbox: discovering the panel no longer slips straight to an ending — you must
// fetch the lockpick from the kitchen, then crack the box (no more brute-force pry).
const CRAWLSPACE_ROUTE = [
  "inspect_clock",
  "kitchens",
  "take_pick",
  "back_foyer",
  "pry_panel",
  "open_strongbox",
];
// The full vault route, taking the letter instead of the gold.
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

describe("bug_0017 — the Truth thread reads truthfully on every route", () => {
  it("the crawlspace text stands alone (no 'that same') yet still introduces the letter", () => {
    const crawlspace = index.pack.scenes.find((sc) => sc.id === "crawlspace");
    expect(crawlspace).toBeDefined();
    const text = crawlspace!.text.toLowerCase();
    // The continuity slip presuming a prior vault visit is gone...
    expect(text).not.toContain("that same");
    // ...but the strongbox still holds a sealed letter the player can take.
    expect(text).toContain("sealed letter");
  });

  it("the crawlspace-first route still reaches ending_truth", () => {
    const s = play(CRAWLSPACE_ROUTE);
    expect(s.ended).toBe(true);
    expect(s.endingId).toBe("ending_truth");
  });

  it("ending_truth no longer presumes the vault route but keeps its moral", () => {
    const truth = index.pack.endings.find((e) => e.id === "ending_truth");
    expect(truth).toBeDefined();
    const text = truth!.text.toLowerCase();
    // "You leave the gold" presumed the player stood in the vault and saw gold.
    expect(text).not.toContain("leave the gold");
    // The truth-over-riches moral is intact.
    expect(text).toContain("truth");
    expect(text).toContain("worth more than escaping rich");
  });

  it("the vault take-letter route also reaches ending_truth (text fits both)", () => {
    const s = play(VAULT_LETTER_ROUTE);
    expect(s.ended).toBe(true);
    expect(s.endingId).toBe("ending_truth");
  });

  it("reachability is unchanged — ending_rich and ending_caught still fire", () => {
    const rich = play(VAULT_GOLD_ROUTE);
    expect(rich.ended).toBe(true);
    expect(rich.endingId).toBe("ending_rich");
    const caught = play(FORCE_ROUTE);
    expect(caught.ended).toBe(true);
    expect(caught.endingId).toBe("ending_caught");
  });
});
