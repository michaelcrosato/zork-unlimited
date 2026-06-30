/**
 * Regression (§15) for bug_0309 — *The Watchtower Road*'s hermit_camp outer scene kept
 * first-meeting framing ("He watches you with pale, unsurprised eyes") on every re-entry,
 * even after the player had spoken with the hermit and heard the full tale or had the letter
 * read. hermit_talk already has a reactive re-entry variant (bug_0134) and mossy_brook
 * mirrors it (bug_0282); hermit_camp (the outer landing) was the missed member of the trio.
 * A blind playtester (seed 7, ai-runs/2026-06-08T10-25-38-070Z/playtest.md §4) flagged the
 * inconsistency on the most natural route (visit hermit first, then go east, then return).
 *
 * The fix adds a scene variant gated on any_of[heard_hermit_lore, seal_broken] — the same
 * guard as hermit_talk and mossy_brook — that replaces first-meeting framing with text
 * acknowledging the player is no longer a stranger.
 *
 * This test locks:
 * (1) First visit (no flag): base "pale, unsurprised eyes" shows; variant does not fire.
 * (2) After heard_hermit_lore: variant fires; "pale, unsurprised" is gone.
 * (3) After seal_broken only (no lore): variant fires on that arm too.
 * (4) Cosmetic only: choices at hermit_camp are unchanged; route still reaches ending_truth.
 */
import { describe, it, expect } from "vitest";
import { loadPackFile } from "../../src/cyoa/pack.js";
import { indexPack, buildRules, initStateForPack } from "../../src/cyoa/runner.js";
import { buildObservation } from "../../src/cyoa/observation.js";
import { makeStep } from "../../src/core/engine.js";

const loaded = loadPackFile("content/cyoa/pack/watchtower_road.yaml");
if (!loaded.ok) throw new Error("watchtower pack must compile");
const index = indexPack(loaded.compiled.pack);
const rules = buildRules(index);
const choose = (id: string) => ({ type: "CHOOSE", choiceId: id }) as const;

function play(ids: string[], seed = 7) {
  const step = makeStep(rules);
  let s = initStateForPack(index, seed);
  for (const id of ids) s = step(s, choose(id)).state;
  return s;
}
const obs = (s: ReturnType<typeof play>) => buildObservation(index, s);
const optionIds = (s: ReturnType<typeof play>): string[] =>
  obs(s).available_actions.map((a) => a.id);

const STRANGER = "pale, unsurprised"; // the stale first-meeting text
const RETURNING = "no stranger"; // the post-conversation variant

// Reach hermit_camp on first visit (no flags set).
const CAMP_FIRST = ["go_west", "follow_to_camp"];

// Speak with the hermit (hear the lore), then say_goodbye back to hermit_camp.
const CAMP_AFTER_LORE = [
  "go_west",
  "follow_to_camp",
  "talk_hermit",
  "ask_about_tower",
  "back_from_tower_talk",
  "say_goodbye",
];

// Get letter east, go west, show it (seal_broken, no lore), then say_goodbye.
const CAMP_AFTER_SEAL = [
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
  "say_goodbye",
];

describe("bug_0309 — hermit_camp shows stale first-meeting text after speaking with the hermit", () => {
  it("first visit: base 'pale, unsurprised' text shows and the variant does not fire", () => {
    const s = play(CAMP_FIRST);
    expect(s.current).toBe("hermit_camp");
    expect(s.flags["heard_hermit_lore"]).not.toBe(true);
    expect(s.flags["seal_broken"]).not.toBe(true);
    const text = obs(s).text.toLowerCase();
    expect(text).toContain(STRANGER);
    expect(text).not.toContain(RETURNING);
  });

  it("after heard_hermit_lore: variant fires and 'pale, unsurprised' is gone", () => {
    const s = play(CAMP_AFTER_LORE);
    expect(s.current).toBe("hermit_camp");
    expect(s.flags["heard_hermit_lore"]).toBe(true);
    const text = obs(s).text.toLowerCase();
    expect(text).toContain(RETURNING);
    expect(text).not.toContain(STRANGER);
  });

  it("after seal_broken only (no lore): the same variant fires on that arm", () => {
    const s = play(CAMP_AFTER_SEAL);
    expect(s.current).toBe("hermit_camp");
    expect(s.flags["seal_broken"]).toBe(true);
    expect(s.flags["heard_hermit_lore"]).not.toBe(true);
    const text = obs(s).text.toLowerCase();
    expect(text).toContain(RETURNING);
    expect(text).not.toContain(STRANGER);
  });

  it("cosmetic only: hermit_camp choices are unchanged and route reaches ending_truth", () => {
    const s = play(CAMP_AFTER_LORE);
    expect(optionIds(s)).toContain("talk_hermit");
    expect(optionIds(s)).toContain("leave_camp");

    const full = play([
      "go_east",
      "approach_base",
      "search_rubble",
      "take_lantern",
      "take_letter",
      "carry_lantern_to_cellar",
      "light_lantern",
      "descend_cellar",
      "examine_barrels",
      "search_cache",
      "take_ledger",
      "climb_out",
      "cellar_back",
      "return_crossroads",
      "go_west",
      "follow_to_camp",
      "talk_hermit",
      "ask_about_tower",
      "back_from_tower_talk",
      "show_letter",
      "back_from_letter_talk",
      "say_goodbye",
      "leave_camp", // ← hermit_camp now shows variant (heard_hermit_lore + seal_broken)
      "ford_brook",
      "cross_north",
      "approach_checkpoint",
      "show_papers",
      "reveal_evidence",
      "expose_the_plot",
    ]);
    expect(full.ended).toBe(true);
    expect(full.endingId).toBe("ending_truth");
    expect(full.flags["heard_hermit_lore"]).toBe(true);
    expect(full.flags["seal_broken"]).toBe(true);
  });
});
