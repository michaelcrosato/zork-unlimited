/**
 * Regression (§15) for bug_0007 — the hidden_cache "stale ledger" beat on *The
 * Watchtower Road*, surfaced by a blind MCP playtester (seed 55, report
 * ai-runs/2026-06-01T05-51-01-531Z/playtest.md) and also logged as the bug_0006
 * deferred next-focus. Two things are locked here:
 *   (1) take_ledger exits cleanly to the cellar (not back to hidden_cache), so the
 *       "A ledger lies forgotten in the dust" text is never re-rendered after the
 *       ledger is taken, and the cache cannot be re-entered (search_cache requires
 *       not_item ledger). The cellar-only route still reaches ending_truth.
 *   (2) The hidden_cache description is path-agnostic — it no longer presumes the
 *       player saw the letter ("a seal you recognize from the letter" is gone).
 */
import { describe, it, expect } from "vitest";
import { loadPackFile } from "../../src/cyoa/pack.js";
import { indexPack, buildRules, initStateForPack } from "../../src/cyoa/runner.js";
import { buildObservation } from "../../src/cyoa/observation.js";
import { makeStep } from "../../src/core/engine.js";
import type { Action } from "../../src/api/types.js";

const loaded = loadPackFile("content/cyoa/pack/watchtower_road.yaml");
if (!loaded.ok) throw new Error("watchtower pack must compile");
const index = indexPack(loaded.compiled.pack);
const rules = buildRules(index);
const choose = (id: string): Action => ({ type: "CHOOSE", choiceId: id });

function play(ids: string[]) {
  const step = makeStep(rules);
  let s = initStateForPack(index, 1);
  for (const id of ids) s = step(s, choose(id)).state;
  return s;
}
const optionIds = (s: ReturnType<typeof play>): string[] =>
  buildObservation(index, s).available_actions.map((a) => a.id);

// Cellar-only route (no letter): lantern → cellar → cache → take ledger.
const TO_TAKE_LEDGER = [
  "go_east",
  "approach_base",
  "search_rubble",
  "take_lantern",
  "carry_lantern_to_cellar",
  "light_lantern",
  "descend_cellar",
  "search_cache",
  "take_ledger",
];

describe("bug_0007 — taking the ledger exits cleanly and the cache text stays honest", () => {
  it("take_ledger leaves the cache for the cellar, so the stale ledger text can't re-render", () => {
    const s = play(TO_TAKE_LEDGER);
    expect(s.current).toBe("cellar");
    expect(s.inventory).toContain("ledger");
    // Clean exit: the cellar only offers climb_out once the ledger is taken.
    expect(optionIds(s)).toEqual(["climb_out"]);
  });

  it("the cache cannot be re-entered after the ledger is taken (no stale view at all)", () => {
    // Back into the cellar and confirm search_cache is gone (not_item ledger fails).
    const s = play([...TO_TAKE_LEDGER, "climb_out", "cellar_back"]);
    expect(s.current).toBe("ruined_watchtower");
    // Walk back down to the cellar; the cache route is closed.
    const back = play([...TO_TAKE_LEDGER]);
    expect(optionIds(back)).not.toContain("search_cache");
  });

  it("the cellar-only route (never seeing the letter) still reaches ending_truth", () => {
    const s = play([
      ...TO_TAKE_LEDGER,
      "climb_out",
      "cellar_back",
      "approach_base",
      "climb_stairs",
      "continue_up",
      "survey_road",
      "slip_into_woods",
      "expose_the_plot",
    ]);
    expect(s.ended).toBe(true);
    expect(s.endingId).toBe("ending_truth");
  });

  it("the cache description no longer presumes the player saw the letter", () => {
    const cache = index.pack.scenes.find((sc) => sc.id === "hidden_cache");
    expect(cache).toBeDefined();
    const text = cache!.text.toLowerCase();
    expect(text).not.toContain("recognize from the letter");
    // It still describes a ledger with a seal — just without presuming the letter.
    expect(text).toContain("ledger");
    expect(text).toContain("seal");
  });
});
