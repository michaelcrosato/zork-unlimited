/**
 * Regression (§15) for bug_0108 — the sealed letter on *The Watchtower Road* read as a
 * Chekhov's gun on the dominant east/beacon route. Surfaced by a blind MCP playtester
 * (seed 7, report ai-runs/2026-06-02T08-37-28-787Z/playtest.md §5): it took the
 * sealed_letter at the cart and found it "never had any use, examine action, or effect
 * on any ending or the checkpoint." The letter is NOT inert — show_letter breaks the
 * seal at the hermit (learned_truth) and show_papers presents it at the checkpoint — but
 * both uses sit on routes the tower/beacon path bypasses, and the pickup journal gave no
 * hint of its purpose.
 *
 * The fix is hint_text only: the take_letter pickup journal now foreshadows the letter's
 * two real uses (papers a checkpoint guard demands; a seal a knowing eye can break/read).
 * This locks:
 *   (1) taking the letter writes ONE journal entry that points at BOTH uses (papers/
 *       checkpoint AND breaking/reading the seal) — no longer the bare "addressed to no one";
 *   (2) the foreshadowed affordances still EXIST and are reachable: show_letter at the
 *       hermit still breaks the seal (learned_truth + seal_broken), and show_papers at the
 *       checkpoint appears only with the letter and routes to confront_smuggler;
 *   (3) the change is signposting-only — no route/gate/ending changed (letter still
 *       optional; the no-letter player's checkpoint options are unchanged).
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

// East to the cart, then take the sealed letter.
const TO_LETTER = ["go_east", "approach_base", "search_rubble", "take_letter"];

describe("bug_0108 — the sealed letter's pickup journal signposts its uses", () => {
  it("taking the letter writes one journal entry pointing at BOTH the checkpoint and the seal", () => {
    const s = play(TO_LETTER);
    expect(s.inventory).toContain("sealed_letter");
    const entry = s.journal.find((j) => /sealed letter/i.test(j) || /addressed to no one/i.test(j));
    expect(entry).toBeDefined();
    // Foreshadows the checkpoint "Papers" use ...
    expect(/papers|checkpoint/i.test(entry ?? "")).toBe(true);
    // ... and the hermit's break-the-seal-and-read use.
    expect(/read|break|seal/i.test(entry ?? "")).toBe(true);
    // The bare inert line is gone (it now says more than just "addressed to no one").
    expect(entry).not.toBe("A wax-sealed letter, addressed to no one.");
    // No duplicate stacking on a single pickup.
    const matches = s.journal.filter(
      (j) => /sealed letter/i.test(j) || /addressed to no one/i.test(j),
    );
    expect(matches.length).toBe(1);
  });

  it("the foreshadowed hermit use still works: show_letter breaks the seal", () => {
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

  it("the foreshadowed checkpoint use still works: show_papers appears with the letter and routes to the confrontation", () => {
    // With the letter, the checkpoint offers show_papers.
    const withLetter = play([
      ...TO_LETTER,
      "leave_cart",
      "leave_base",
      "return_crossroads",
      "go_west",
      "ford_brook",
      "cross_north",
      "approach_checkpoint",
    ]);
    expect(withLetter.current).toBe("checkpoint");
    expect(optionIds(withLetter)).toContain("show_papers");
    const presented = play([
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
    expect(presented.current).toBe("confront_smuggler");

    // Without the letter, the no-letter player's checkpoint options are unchanged
    // (no papers verb) — the fix touched signposting only, not the gate.
    const noLetter = play(["go_west", "ford_brook", "cross_north", "approach_checkpoint"]);
    expect(noLetter.current).toBe("checkpoint");
    expect(optionIds(noLetter)).not.toContain("show_papers");
  });
});
