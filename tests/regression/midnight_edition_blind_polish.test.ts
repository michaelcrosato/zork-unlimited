/**
 * Regression (§15) for bug_0234 — blind-playtest polish for The Midnight Edition
 * (content/cyoa/pack/midnight_edition.yaml, seed 4). A fresh blind playtester reached
 * all four endings with clarity 5/5, enjoyment 4/5, mechanics flawless, flagging two
 * narration-vs-state honesty blemishes (neither affecting winnability):
 *
 *  (1) STALE HUB after the proof is read. The Composing Room carried only a read_letter
 *      variant, whose text still calls the safe report a thing that "would make it true
 *      or break it" — so after the player has opened the safe and READ the report
 *      (knows_proof), the hub kept describing the proof as still locked away and unread.
 *      The fix adds a most-specific knows_proof hub variant (first-match-wins) that
 *      narrates the proof in hand and reframes the choice as "which page you set"
 *      (the bug_0232 stale-prose discipline).
 *
 *  (2) TYPO in the Press Floor base text: "the great fl-bed press" → "flat-bed". The two
 *      reactive variants spelled it correctly; only the no-letter base text carried it.
 *
 * Locked BEHAVIOURALLY on the REAL buildObservation surface, at the flag state the player
 * actually stands in — so this pins the variant-resolved text a live player sees. All four
 * endings' reachability + the diligence-fork thesis are proven by
 * midnight_edition_branching.test.ts and the auto-discovered CYOA bar.
 */
import { describe, it, expect } from "vitest";
import { loadPackFile } from "../../src/cyoa/pack.js";
import { indexPack, buildRules, initStateForPack } from "../../src/cyoa/runner.js";
import { buildObservation } from "../../src/cyoa/observation.js";
import { makeStep } from "../../src/core/engine.js";
import type { Action } from "../../src/api/types.js";

const loaded = loadPackFile("content/cyoa/pack/midnight_edition.yaml");
if (!loaded.ok) throw new Error("midnight_edition pack must compile");
const index = indexPack(loaded.compiled.pack);
const rules = buildRules(index);
const choose = (id: string): Action => ({ type: "CHOOSE", choiceId: id });

function play(ids: string[]) {
  const step = makeStep(rules);
  let s = initStateForPack(index, 1);
  for (const id of ids) s = step(s, choose(id)).state;
  return s;
}
const sceneText = (s: ReturnType<typeof play>) => buildObservation(index, s).text;

// The verify chain ends back in the Composing Room (leave_office), proof in hand.
const VERIFY = [
  "read_letter",
  "go_office",
  "search_desk",
  "open_safe",
  "read_report",
  "leave_office",
];

// The "still unread" claim the read_letter hub variant carries — the regression witness.
const UNREAD_CLAIM = /would make it true or break it/i;

describe("bug_0234 — Midnight Edition blind polish: the Composing Room stops calling the read report unread", () => {
  it("the read_letter-only hub still names the report as a thing that would make it true or break it (witness)", () => {
    const text = sceneText(play(["read_letter"]));
    expect(text).toMatch(UNREAD_CLAIM);
  });

  it("after reading the report (knows_proof), the hub drops the 'unread' claim and says the proof is in hand", () => {
    const text = sceneText(play(VERIFY));
    expect(text).not.toMatch(UNREAD_CLAIM); // the settled question is no longer posed
    expect(text).toMatch(/read and proven/i); // the proof is in hand…
    expect(text).toMatch(/which page you set/i); // …and the choice is reframed
  });
});

describe("bug_0234 — Midnight Edition blind polish: the Press Floor 'flat-bed' typo is fixed", () => {
  it("the base Press Floor text (no letter read) reads 'flat-bed press', not 'fl-bed'", () => {
    const text = sceneText(play(["go_press"]));
    expect(text).toMatch(/flat-bed press/i);
    expect(text).not.toMatch(/fl-bed/i);
  });
});
