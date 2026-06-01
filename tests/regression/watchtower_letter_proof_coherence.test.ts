/**
 * Regression (§15) for bug_0006 — the sealed-letter proof beat on *The Watchtower
 * Road*, surfaced by a blind MCP playtester (seed 42, report
 * ai-runs/2026-06-01T05-41-02-671Z/playtest.md). Three things are locked here:
 *   (1) Showing the letter now journals the reveal and sets seal_broken (it was
 *       silent, setting only learned_truth);
 *   (2) "Show him the sealed letter" no longer loops — it is gated on
 *       not_flag seal_broken, so the hermit can't re-break an already-opened seal;
 *   (3) ending_truth no longer presumes route-specific evidence ("the broken seal",
 *       "the oil in the cellar") — it reads truthfully whether the player won via
 *       the carried ledger OR the hermit-opened letter, and both routes still win.
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

// Grab the letter (east), then take it to the hermit and show it (west).
const TO_LETTER_REVEAL = [
  "go_east",
  "approach_base",
  "search_rubble",
  "take_letter",
  "leave_cart",
  "leave_base",
  "return_crossroads",
  "go_west",
  "follow_to_camp",
  "talk_hermit",
  "show_letter",
  "back_from_letter_talk",
];

describe("bug_0006 — the letter reveal is earned-once, recorded, and the ending stays honest", () => {
  it("breaking the seal sets seal_broken + learned_truth and writes a journal entry", () => {
    const s = play(TO_LETTER_REVEAL);
    expect(s.current).toBe("hermit_talk");
    expect(s.flags["seal_broken"]).toBe(true);
    expect(s.flags["learned_truth"]).toBe(true);
    expect(s.journal.some((j) => /seal/i.test(j) && /checkpoint/i.test(j))).toBe(true);
  });

  it("the seal cannot be re-broken — show_letter is gone and the journal can't restack", () => {
    const s = play(TO_LETTER_REVEAL);
    expect(optionIds(s)).not.toContain("show_letter");
    const sealEntries = s.journal.filter((j) => /broke the letter's seal/i.test(j));
    expect(sealEntries.length).toBe(1);
    expect(new Set(s.journal).size).toBe(s.journal.length);
  });

  it("the hermit/letter route still reaches ending_truth", () => {
    const s = play([
      ...TO_LETTER_REVEAL,
      "say_goodbye",
      "leave_camp",
      "ford_brook",
      "cross_north",
      "approach_checkpoint",
      "show_papers",
      "reveal_evidence",
      "expose_the_plot",
    ]);
    expect(s.ended).toBe(true);
    expect(s.endingId).toBe("ending_truth");
  });

  it("ending_truth no longer presumes the broken seal or the cellar oil", () => {
    const truth = index.pack.endings.find((e) => e.id === "ending_truth");
    expect(truth).toBeDefined();
    const text = truth!.text.toLowerCase();
    expect(text).not.toContain("broken seal");
    expect(text).not.toContain("oil in the cellar");
    // It still reads as the proof being laid out before the magistrate.
    expect(text).toContain("proof");
  });
});
