/**
 * Regression (§15) for bug_0285 — The Clockwork Heist's crawlspace shortcut
 * ending gave no hint that the vault above was never explored.
 *
 * A blind playtester (seed 42, report ai-runs/2026-06-08T04-28-37-948Z/playtest.md)
 * noted that the letter_hidden variant of ending_truth (the 20/45 shortcut path)
 * landed with no signal that the vault above exists or that a fuller route awaits.
 * A player who takes the crawlspace first may close the game at 20/45 thinking
 * they have seen everything.
 *
 * Fix (content, pure prose — bug_0285): the letter_hidden variant in ending_truth
 * gains one sentence: "The vault above stays cold and locked; his other copy still
 * waits inside it, where he left it for whoever cracked the front door." Plants
 * curiosity without penalizing the crawlspace player. No flag/route/score change.
 *
 * Locked here:
 *   (1) the crawlspace epilogue contains the vault-nudge sentence;
 *   (2) the vault epilogue does NOT contain it (nudge belongs to the shortcut only);
 *   (3) both paths still reach ending_truth;
 *   (4) the letter_hidden epilogue keeps the hidden-copy framing and moral.
 */
import { describe, it, expect } from "vitest";
import { loadPackFile } from "../../src/cyoa/pack.js";
import { indexPack, buildRules, initStateForPack } from "../../src/cyoa/runner.js";
import { buildObservation } from "../../src/cyoa/observation.js";
import { makeStep } from "../../src/core/engine.js";
import type { Action } from "../../src/api/types.js";

const loaded = loadPackFile("content/cyoa/pack/clockwork_heist.yaml");
if (!loaded.ok) throw new Error("clockwork_heist pack must compile");
const index = indexPack(loaded.compiled.pack);
const rules = buildRules(index);
const choose = (id: string): Action => ({ type: "CHOOSE", choiceId: id });

function play(ids: string[], seed = 42) {
  const step = makeStep(rules);
  let s = initStateForPack(index, seed);
  for (const id of ids) s = step(s, choose(id)).state;
  return s;
}

const CRAWLSPACE_ROUTE = [
  "inspect_clock",
  "kitchens",
  "take_pick",
  "back_foyer",
  "pry_panel",
  "open_strongbox",
];

const VAULT_LETTER_ROUTE = [
  "kitchens",
  "take_pick",
  "dumbwaiter",
  "approach_vault",
  "pick_lock",
  "take_letter",
];

describe("bug_0285 — crawlspace ending_truth nudges toward the vault above", () => {
  it("the crawlspace epilogue contains the vault-nudge sentence", () => {
    const s = play(CRAWLSPACE_ROUTE);
    expect(s.endingId).toBe("ending_truth");
    const text = buildObservation(index, s).text.toLowerCase();
    expect(text).toContain("vault above stays cold");
    expect(text).toContain("his other copy still waits");
  });

  it("the vault epilogue does NOT contain the vault-nudge sentence (shortcut-only framing)", () => {
    const s = play(VAULT_LETTER_ROUTE);
    expect(s.endingId).toBe("ending_truth");
    const text = buildObservation(index, s).text.toLowerCase();
    expect(text).not.toContain("vault above stays cold");
  });

  it("both paths still reach ending_truth", () => {
    expect(play(CRAWLSPACE_ROUTE).endingId).toBe("ending_truth");
    expect(play(VAULT_LETTER_ROUTE).endingId).toBe("ending_truth");
  });

  it("the letter_hidden epilogue retains the hidden-copy framing and moral", () => {
    const s = play(CRAWLSPACE_ROUTE);
    const text = buildObservation(index, s).text.toLowerCase();
    expect(text).toContain("hid in the dark");
    expect(text).toContain("worth more than escaping rich");
  });
});
