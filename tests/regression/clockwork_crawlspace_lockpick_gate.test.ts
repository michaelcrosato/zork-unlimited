/**
 * Regression (§15) for bug_0022 — the crawlspace's brute-force strongbox let the
 * player reach the headline "Truth" ending in three actions from the leftmost
 * opening choice (inspect_clock -> pry_panel -> pry_strongbox), bypassing the
 * vault, the lockpick puzzle, the ledger/patrol timing, and the gold-vs-truth
 * moral choice — the game's best content. Surfaced (again) by a blind MCP
 * playtester (seed 29, report ai-runs/2026-06-01T08-38-02-056Z/playtest.md, §4 +
 * §5) and matching the structural item deferred across bug_0019/0020/0021.
 *
 * Fix: the crawlspace strongbox is now a true lockbox requiring the lockpick (the
 * heist's signature item, found in the kitchen), so the secret route complements
 * rather than pre-empts the vault. The brute-force `pry_strongbox` is gone; a
 * no-pick `study_strongbox` nudge routes OUT to the foyer (progress, no self-loop);
 * a foyer `enter_panel` re-entry keeps the crawlspace reachable after you leave to
 * fetch the pick. The truth, on EITHER route, now sits behind a picked lock.
 *
 * Locked here:
 *   (1) discovering the panel without a pick offers study_strongbox + back_crawl
 *       but NOT pry_strongbox / open_strongbox (the freebie is gone);
 *   (2) study_strongbox narrates + MOVES to the foyer (a real scene change, never a
 *       self-loop) and takes no item/flag — it is a pure nudge;
 *   (3) once the panel is found, the foyer offers enter_panel re-entry (and the
 *       spent pry_panel is gone), so the crawlspace is never stranded;
 *   (4) with the lockpick, the crawlspace offers open_strongbox (not the nudge) and
 *       the full lockpick-gated route reaches ending_truth;
 *   (5) reachability is unchanged — ending_rich, ending_caught, and the vault
 *       take-letter ending_truth all still fire (no soft-lock, no lost ending).
 */
import { describe, it, expect } from "vitest";
import { loadPackFile } from "../../src/cyoa/pack.js";
import { indexPack, buildRules, initStateForPack } from "../../src/cyoa/runner.js";
import { buildObservation } from "../../src/cyoa/observation.js";
import { makeStep } from "../../src/core/engine.js";
import type { GameState } from "../../src/core/state.js";

const loaded = loadPackFile("content/cyoa/pack/clockwork_heist.yaml");
if (!loaded.ok) throw new Error("clockwork_heist pack must compile");
const index = indexPack(loaded.compiled.pack);
const rules = buildRules(index);
const choose = (id: string) => ({ type: "CHOOSE", choiceId: id }) as const;

function play(ids: string[]): GameState {
  const step = makeStep(rules);
  let s = initStateForPack(index, 29);
  for (const id of ids) s = step(s, choose(id)).state;
  return s;
}
const optionIds = (s: GameState) => buildObservation(index, s).available_actions.map((a) => a.id);

// New canonical crawlspace truth route: fetch the pick, then crack the box.
const CRAWLSPACE_TRUTH = [
  "inspect_clock",
  "kitchens",
  "take_pick",
  "back_foyer",
  "pry_panel",
  "open_strongbox",
];
const VAULT_LETTER = [
  "kitchens",
  "take_pick",
  "dumbwaiter",
  "approach_vault",
  "pick_lock",
  "take_letter",
];
const VAULT_GOLD = [
  "kitchens",
  "take_pick",
  "dumbwaiter",
  "approach_vault",
  "pick_lock",
  "grab_gold",
];
const FORCE_CAUGHT = ["climb_stairs", "approach_vault", "force_door"];

describe("bug_0022 — the crawlspace truth is gated behind the lockpick", () => {
  it("discovering the panel without a pick offers no brute-force / no-key way into the strongbox", () => {
    const s = play(["inspect_clock", "pry_panel"]);
    expect(s.current).toBe("crawlspace");
    expect(s.inventory).not.toContain("lockpick");
    const opts = optionIds(s);
    expect(opts).not.toContain("pry_strongbox"); // the brute-force freebie is removed
    expect(opts).not.toContain("open_strongbox"); // can't pick without the pick
    expect(opts).toContain("study_strongbox"); // only the nudge + exit remain
    expect(opts).toContain("back_crawl");
  });

  it("the no-pick nudge narrates and MOVES to the foyer (progress, no self-loop) without taking anything", () => {
    const before = play(["inspect_clock", "pry_panel"]);
    const after = play(["inspect_clock", "pry_panel", "study_strongbox"]);
    expect(after.current).toBe("foyer"); // a real scene change, not a same-scene loop
    expect(after.current).not.toBe(before.current);
    expect(after.inventory).toEqual(before.inventory); // pure nudge: no item granted
    expect(after.flags).toEqual(before.flags); // ...and no flag set
    expect(after.ended).toBe(false);
  });

  it("re-entry appears only once you hold the pick (no tool-less bounce into a locked box)", () => {
    // Found the panel, got nudged back out, still no pick: the spent pry_panel is
    // gone AND enter_panel is withheld — nothing to do in a locked crawlspace, so
    // no foyer<->crawlspace bounce for a tool-less player (or the coverage bot).
    const noPick = play(["inspect_clock", "pry_panel", "study_strongbox"]);
    expect(noPick.current).toBe("foyer");
    expect(noPick.flags.found_passage).toBe(true);
    expect(optionIds(noPick)).not.toContain("pry_panel"); // first-time discovery spent
    expect(optionIds(noPick)).not.toContain("enter_panel"); // re-entry gated on the pick

    // Fetch the pick: re-entry now appears and actually returns to the crawlspace.
    const withPick = play([
      "inspect_clock",
      "pry_panel",
      "study_strongbox",
      "kitchens",
      "take_pick",
      "back_foyer",
    ]);
    expect(withPick.current).toBe("foyer");
    expect(withPick.inventory).toContain("lockpick");
    expect(optionIds(withPick)).toContain("enter_panel");
    const reentered = play([
      "inspect_clock",
      "pry_panel",
      "study_strongbox",
      "kitchens",
      "take_pick",
      "back_foyer",
      "enter_panel",
    ]);
    expect(reentered.current).toBe("crawlspace");
  });

  it("with the lockpick the crawlspace offers open_strongbox and the route reaches ending_truth", () => {
    const atBox = play(["inspect_clock", "kitchens", "take_pick", "back_foyer", "pry_panel"]);
    expect(atBox.current).toBe("crawlspace");
    expect(atBox.inventory).toContain("lockpick");
    const opts = optionIds(atBox);
    expect(opts).toContain("open_strongbox");
    expect(opts).not.toContain("study_strongbox"); // the nudge vanishes once equipped

    const end = play(CRAWLSPACE_TRUTH);
    expect(end.ended).toBe(true);
    expect(end.endingId).toBe("ending_truth");
  });

  it("reachability unchanged — vault take-letter truth, rich, and caught all still fire", () => {
    expect(play(VAULT_LETTER).endingId).toBe("ending_truth");
    expect(play(VAULT_GOLD).endingId).toBe("ending_rich");
    expect(play(FORCE_CAUGHT).endingId).toBe("ending_caught");
  });
});
