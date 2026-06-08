/**
 * Regression (§15) for bug_0280 — the sealed letter's pickup journal in *The Watchtower Road*
 * framed the letter as "papers a checkpoint guard would demand to see", which reads as a
 * travel permit the player shows to pass the checkpoint. In reality the letter is
 * incriminating evidence that NAMES the sergeant; the misleading framing undercut the
 * game's best dramatic moment (the sergeant finding his own name).
 *
 * Surfaced by a blind MCP playtester (seed 7, ai-runs/2026-06-08T02-03-27-776Z/playtest.md
 * §4): "the framing undercuts the dramatic payoff, or at minimum sets up a false
 * expectation that makes the moment surprising for the wrong reason."
 *
 * Fix: rewrote the journal entry to frame the letter as suspicious private correspondence
 * ("not a traveler's permit but the kind of private record that moves between men with
 * something to arrange and someone to pay"), with the checkpoint hint reframed as the guard
 * wanting to INVESTIGATE its contents, not accept it as a pass. The existing bug_0108 hint
 * machinery (checkpoint + seal/read) is preserved; only the travel-pass framing is removed.
 */
import { describe, it, expect } from "vitest";
import { loadPackFile } from "../../src/cyoa/pack.js";
import { indexPack, buildRules, initStateForPack } from "../../src/cyoa/runner.js";
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

const TO_LETTER = ["go_east", "approach_base", "search_rubble", "take_letter"];

describe("bug_0280 — sealed letter framing does not mislead the player as a travel pass", () => {
  it("journal entry no longer contains the travel-pass phrasing 'demand to see'", () => {
    const s = play(TO_LETTER);
    const entry = s.journal.find((j) => /sealed letter|addressed to no one/i.test(j));
    expect(entry).toBeDefined();
    // The OLD misleading phrase — a guard demanding to see your papers reads as a travel pass.
    expect(entry).not.toMatch(/demand to see/i);
  });

  it("journal entry explicitly distinguishes the letter from a travel permit", () => {
    const s = play(TO_LETTER);
    const entry = s.journal.find((j) => /sealed letter|addressed to no one/i.test(j));
    expect(entry).toBeDefined();
    // The fix adds "not a traveler's permit" to drop the travel-pass implication.
    expect(entry).toMatch(/traveler/i);
  });

  it("journal entry frames the checkpoint use as the guard wanting to read/investigate", () => {
    const s = play(TO_LETTER);
    const entry = s.journal.find((j) => /sealed letter|addressed to no one/i.test(j));
    expect(entry).toBeDefined();
    // The guard is described as wanting to READ what is inside (investigate), not demanding papers.
    expect(entry).toMatch(/checkpoint/i);
    expect(entry).toMatch(/read/i);
  });

  it("the fix is prose-only: show_papers at the checkpoint still routes to the confrontation", () => {
    const s = play([
      ...TO_LETTER,
      "leave_cart",
      "leave_base",
      "return_crossroads",
      "go_west",
      "ford_brook",
      "cross_north",
      "approach_checkpoint",
      "show_papers",
    ]);
    expect(s.current).toBe("confront_smuggler");
  });
});
