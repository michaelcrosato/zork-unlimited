/**
 * Regression (§15) for bug_0127 — the sealed letter's pickup journal on *The Watchtower
 * Road* still read as a SELF-affordance after bug_0108. A fresh blind MCP playtester
 * (seeds 31/77/12, report ai-runs/2026-06-02T13-20-51-530Z/playtest.md §4/§5) took the
 * letter and went east (tower/beacon/checkpoint, never west to the hermit), parsed
 * "a knowing eye could break open and read" as "I could break this open myself," and
 * hunted for a non-existent self-action.
 *
 * There is no self-break action by design — only the hermit ("a knowing eye", west) breaks
 * the seal, and an unread letter is explicitly not proof at the checkpoint. The fix is
 * hint_text only: the journal now says "the right pair of eyes — not your own; the seal is
 * set too hard for that — could break open and read," disclaiming the self-action and
 * reframing the knowing eye as someone else (the hermit) the player must find.
 *
 * This locks:
 *   (1) the take_letter journal entry DISCLAIMS the self-affordance (points at someone else)
 *       and no longer carries the bare ambiguous "a knowing eye";
 *   (2) bug_0108's two-use foreshadow is intact (still mentions papers/checkpoint AND
 *       break/read/seal);
 *   (3) the foreshadowed affordances still EXIST: the hermit's show_letter still breaks the
 *       seal (learned_truth + seal_broken), and the change is signposting-only (no route).
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

describe("bug_0127 — the sealed letter's journal no longer reads as a self-affordance", () => {
  it("the pickup journal disclaims the self-action and points at someone else's eyes", () => {
    const s = play(TO_LETTER);
    expect(s.inventory).toContain("sealed_letter");
    const entry = s.journal.find((j) => /sealed letter/i.test(j) || /addressed to no one/i.test(j));
    expect(entry).toBeDefined();
    const text = entry ?? "";
    // Disclaims the player's own capability / reframes the knowing eye as someone else.
    expect(/not your own/i.test(text)).toBe(true);
    expect(/the right pair of eyes/i.test(text)).toBe(true);
    // The bare, ambiguous "a knowing eye" phrasing (read by the playtester as a self-action) is gone.
    expect(/a knowing eye/i.test(text)).toBe(false);
  });

  it("bug_0108's two-use foreshadow is preserved (checkpoint papers AND break/read the seal)", () => {
    const s = play(TO_LETTER);
    const entry =
      s.journal.find((j) => /sealed letter/i.test(j) || /addressed to no one/i.test(j)) ?? "";
    expect(/papers|checkpoint/i.test(entry)).toBe(true);
    expect(/break|read|seal/i.test(entry)).toBe(true);
    // No duplicate stacking on a single pickup.
    const matches = s.journal.filter(
      (j) => /sealed letter/i.test(j) || /addressed to no one/i.test(j),
    );
    expect(matches.length).toBe(1);
  });

  it("the foreshadowed hermit use still works: show_letter breaks the seal (signposting-only)", () => {
    const s = play([
      ...TO_LETTER,
      "leave_cart",
      "leave_base",
      "return_crossroads",
      "go_west",
      "follow_to_camp",
      "talk_hermit",
      "show_letter",
    ]);
    expect(s.flags["seal_broken"]).toBe(true);
    expect(s.flags["learned_truth"]).toBe(true);
  });
});
