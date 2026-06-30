/**
 * Regression (§15) for bug_0282 — *The Watchtower Road*'s mossy_brook scene kept
 * discovery-framing ("a thread of smoke marks a small camp downstream") even after the
 * player had visited the hermit's camp and meaningfully interacted with him. A blind
 * playtester (seed 7, ai-runs/2026-06-08T03-49-19-615Z/playtest.md §4) reached ending_truth
 * (50/50) and flagged the stale "marks a small camp" line on return to the brook after
 * hearing the smuggler's tale and having the letter read.
 *
 * The fix adds a scene variant gated on any_of[heard_hermit_lore, seal_broken] — the same
 * guard used by hermit_talk's bug_0134 fix — that replaces the discovery-framing with text
 * acknowledging the known hermit's camp. Base text is unchanged for a first-time visitor.
 *
 * This test locks:
 * (1) Before interacting with the hermit: the base discovery text shows; no variant fires.
 * (2) After hearing the lore (heard_hermit_lore): the variant shows; "small camp" is gone.
 * (3) After the letter is read (seal_broken, no lore): the variant fires on that arm too.
 * (4) Cosmetic only: the choices at mossy_brook are unchanged; the route still reaches an ending.
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

// Reach mossy_brook without visiting the hermit (first entry).
const BROOK_FIRST = ["go_west"];

// Hear the lore, then leave the camp back to the brook.
const BROOK_AFTER_LORE = [
  "go_west",
  "follow_to_camp",
  "talk_hermit",
  "ask_about_tower",
  "back_from_tower_talk",
  "say_goodbye",
  "leave_camp",
];

// Take the letter east, go west, show it (seal_broken), then leave back to the brook.
const BROOK_AFTER_SEAL = [
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
  "leave_camp",
];

const DISCOVERY = "small camp"; // the stale discovery-framing
const KNOWN = "hermit's camp"; // the post-visit variant text

describe("bug_0282 — mossy_brook shows stale discovery-framing after visiting the hermit", () => {
  it("first visit: base discovery text shows and variant does not fire", () => {
    const s = play(BROOK_FIRST);
    expect(s.current).toBe("mossy_brook");
    expect(s.flags["heard_hermit_lore"]).not.toBe(true);
    expect(s.flags["seal_broken"]).not.toBe(true);
    const text = obs(s).text.toLowerCase();
    expect(text).toContain(DISCOVERY);
    expect(text).not.toContain(KNOWN);
  });

  it("after hearing the lore: variant shows 'hermit's camp' and 'small camp' is gone", () => {
    const s = play(BROOK_AFTER_LORE);
    expect(s.current).toBe("mossy_brook");
    expect(s.flags["heard_hermit_lore"]).toBe(true);
    const text = obs(s).text.toLowerCase();
    expect(text).toContain(KNOWN);
    expect(text).not.toContain(DISCOVERY);
  });

  it("after seal_broken (no lore): the same variant fires on the seal arm", () => {
    const s = play(BROOK_AFTER_SEAL);
    expect(s.current).toBe("mossy_brook");
    expect(s.flags["seal_broken"]).toBe(true);
    expect(s.flags["heard_hermit_lore"]).not.toBe(true);
    const text = obs(s).text.toLowerCase();
    expect(text).toContain(KNOWN);
    expect(text).not.toContain(DISCOVERY);
  });

  it("cosmetic only: brook choices are unchanged and the route reaches ending_truth", () => {
    const s = play(BROOK_AFTER_LORE);
    expect(optionIds(s)).toContain("ford_brook");
    expect(optionIds(s)).toContain("follow_to_camp");
    expect(optionIds(s)).toContain("return_from_brook");

    // The BROOK_AFTER_LORE route did not pick up the letter; verify via a full path instead.
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
      "leave_camp", // ← now at mossy_brook with variant active
      "ford_brook",
      "cross_north",
      "approach_checkpoint",
      "show_papers",
      "reveal_evidence",
      "expose_the_plot",
    ]);
    expect(full.ended).toBe(true);
    expect(full.endingId).toBe("ending_truth");
    // Variant was active at mossy_brook (heard_hermit_lore + seal_broken both set by this point).
    expect(full.flags["heard_hermit_lore"]).toBe(true);
    expect(full.flags["seal_broken"]).toBe(true);
  });
});
