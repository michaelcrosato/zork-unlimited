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
import { buildObservation } from "../../src/cyoa/observation.js";
import { makeStep } from "../../src/core/engine.js";
import { hashState } from "../../src/core/hash.js";

const loaded = loadPackFile("content/cyoa/pack/watchtower_road.yaml");
if (!loaded.ok) throw new Error("watchtower pack must compile");
const index = indexPack(loaded.compiled.pack);
const rules = buildRules(index);
const choose = (id: string) => ({ type: "CHOOSE", choiceId: id }) as const;

/** Play a sequence of choice ids and return the resulting state. */
function play(ids: string[]) {
  const step = makeStep(rules);
  let s = initStateForPack(index, 1);
  for (const id of ids) s = step(s, choose(id)).state;
  return s;
}
const optionIds = (s: ReturnType<typeof play>): string[] =>
  buildObservation(index, s).available_actions.map((a) => a.id);

// The cellar/ledger truth route: arm up, read the ledger, light the beacon, expose.
const LEDGER_ROUTE = [
  "inspect_ground",
  "go_east",
  "approach_base",
  "search_rubble",
  "take_lantern",
  "leave_cart",
  "leave_base",
  "circle_cellar",
  "light_lantern",
  "descend_cellar",
  "search_cache",
  "take_ledger",
  "climb_out",
  "cellar_back",
  "approach_base",
  "climb_stairs",
  "continue_up",
  "light_beacon",
  "watch_for_help",
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

describe("bug_0002 deferred — structural fixes (orbit + dead-end confrontation)", () => {
  // Reach the sergeant holding the letter but WITHOUT having corroborated the truth.
  const TO_CONFRONT_NO_PROOF = [
    "go_east",
    "approach_base",
    "search_rubble",
    "take_letter",
    "leave_cart",
    "leave_base",
    "return_crossroads",
    "go_west",
    "ford_brook",
    "cross_north",
    "approach_checkpoint",
    "show_papers",
  ];

  it("the confrontation is no longer a dead-end: without proof you can press (and get seized)", () => {
    const atSergeant = play(TO_CONFRONT_NO_PROOF);
    expect(atSergeant.current).toBe("confront_smuggler");
    const opts = optionIds(atSergeant);
    expect(opts).toContain("press_bluff"); // a real, risky action — not just "back off"
    expect(opts).toContain("back_off");
    expect(opts).not.toContain("reveal_evidence"); // gated on learned_truth
    // Pressing without proof has a real consequence: capture.
    const after = play([...TO_CONFRONT_NO_PROOF, "press_bluff"]);
    expect(after.ended).toBe(true);
    expect(after.endingId).toBe("ending_captured");
  });

  it("at the climax WITH proof, you must commit — no dithering loop back to the road", () => {
    // LEDGER_ROUTE reaches decision_point with learned_truth set.
    const ledgerPath = [
      "inspect_ground",
      "go_east",
      "approach_base",
      "search_rubble",
      "take_lantern",
      "leave_cart",
      "leave_base",
      "circle_cellar",
      "light_lantern",
      "descend_cellar",
      "search_cache",
      "take_ledger",
      "climb_out",
      "cellar_back",
      "approach_base",
      "climb_stairs",
      "continue_up",
      "light_beacon",
      "watch_for_help",
    ];
    const s = play(ledgerPath);
    expect(s.current).toBe("decision_point");
    expect(s.flags["learned_truth"]).toBe(true);
    const opts = optionIds(s);
    expect(opts).toContain("expose_the_plot");
    expect(opts).toContain("slip_away");
    expect(opts).not.toContain("turn_back"); // the orbit edge is gone once you have proof
  });

  it("at the climax WITHOUT proof, a purposeful back-path remains (find proof) plus a clean exit", () => {
    const s = play(["go_west", "ford_brook", "cross_north", "slip_into_woods"]);
    expect(s.current).toBe("decision_point");
    expect(s.flags["learned_truth"]).not.toBe(true);
    const opts = optionIds(s);
    expect(opts).toContain("turn_back"); // go back to find proof — intentional, signposted
    expect(opts).toContain("slip_away"); // always a terminating exit (no soft-lock)
    expect(opts).not.toContain("expose_the_plot"); // can't win without proof
  });
});
