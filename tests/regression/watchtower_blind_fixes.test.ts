/**
 * Regression (§15) for bug_0002 — the four findings a blind MCP playtester raised
 * on *The Watchtower Road* (stale scene text, stale gate text, a journal entry
 * that stacked on cellar re-entry, and a ledger referenced by an ending but never
 * carried). This locks the content fixes: the ledger is now carried, the journal
 * never duplicates, and the cellar/ledger route still reaches ending_truth
 * deterministically.
 */
import { describe, it, expect } from "vitest";
import { loadPackFile } from "../../src/cyoa/pack.js";
import { indexPack, buildRules, initStateForPack } from "../../src/cyoa/runner.js";
import { runActions } from "../../src/trace/record.js";
import { hashState } from "../../src/core/hash.js";
import type { Action } from "../../src/api/types.js";

const loaded = loadPackFile("content/cyoa/pack/watchtower_road.yaml");
if (!loaded.ok) throw new Error("watchtower pack must compile");
const index = indexPack(loaded.compiled.pack);
const rules = buildRules(index);
const choose = (id: string): Action => ({ type: "CHOOSE", choiceId: id });

// The cellar/ledger truth route: arm up, read the ledger, light the beacon, expose.
const LEDGER_ROUTE = [
  "inspect_ground", "go_east", "approach_base", "search_rubble", "take_lantern",
  "leave_cart", "leave_base", "circle_cellar", "light_lantern", "descend_cellar",
  "search_cache", "take_ledger", "leave_cache", "climb_out", "cellar_back",
  "approach_base", "climb_stairs", "continue_up", "light_beacon", "watch_for_help",
  "expose_the_plot",
].map(choose);

describe("bug_0002 — watchtower blind-playtest fixes", () => {
  it("the ledger is carried into inventory and the route reaches ending_truth", () => {
    const run = runActions(rules, initStateForPack(index, 7), LEDGER_ROUTE);
    // Every step was legal (no rejections) — legal ⊇ executable.
    expect(run.steps.every((s) => s.ok)).toBe(true);
    expect(run.finalState.ended).toBe(true);
    expect(run.finalState.endingId).toBe("ending_truth");
    expect(run.finalState.inventory).toContain("ledger"); // Fix 4: ledger is real
  });

  it("the journal never contains a duplicate entry on this route", () => {
    const run = runActions(rules, initStateForPack(index, 7), LEDGER_ROUTE);
    const journal = run.finalState.journal;
    expect(new Set(journal).size).toBe(journal.length); // Fix 3: no stacking
    expect(journal.some((j) => /smells of pitch/.test(j))).toBe(false); // ambiance moved to scene text
  });

  it("is deterministic (same seed + actions ⇒ identical final hash)", () => {
    const a = runActions(rules, initStateForPack(index, 7), LEDGER_ROUTE);
    const b = runActions(rules, initStateForPack(index, 7), LEDGER_ROUTE);
    expect(hashState(a.finalState)).toBe(hashState(b.finalState));
  });
});
