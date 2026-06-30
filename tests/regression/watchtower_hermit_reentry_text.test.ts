/**
 * Regression (§15) for bug_0134 — *The Watchtower Road*'s hermit_talk re-greeted a
 * returning player as a stranger. The scene's only text was the cold first-meeting line
 * "You look lost, traveler. Or maybe you found something you weren't meant to." — shown
 * every time the player re-entered the conversation hub, including right after the hermit
 * had told the whole smuggler's tale (heard_hermit_lore) or broken the letter's seal
 * (seal_broken). A fresh blind MCP playtester (seed 88,
 * ai-runs/2026-06-02T15-08-35-167Z/playtest.md §4) hit it via ask_about_tower →
 * back_from_tower_talk and flagged the stranger-greeting micro-loop.
 *
 * The fix adds a reactive scene variant gated on any_of [heard_hermit_lore, seal_broken]
 * (the bug_0120 / confront_smuggler reactive-text machinery, first-match-wins): a player
 * who has already spoken now reads a hermit who knows them and re-points north. This locks:
 * (1) on first entry the base greeting shows; (2) after hearing the lore and returning the
 * variant shows and the stranger greeting is gone; (3) the seal_broken arm fires the same
 * variant; (4) it is text-only — the choices the scene offers are unchanged, no flag/state
 * is added by the variant, and the route still reaches its ending.
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

function play(ids: string[]) {
  const step = makeStep(rules);
  let s = initStateForPack(index, 88);
  for (const id of ids) s = step(s, choose(id)).state;
  return s;
}
const obs = (s: ReturnType<typeof play>) => buildObservation(index, s);
const optionIds = (s: ReturnType<typeof play>): string[] =>
  obs(s).available_actions.map((a) => a.id);

const STRANGER = "you look lost"; // the cold first-meeting greeting
const RETURNING = "still here"; // the reactive re-entry variant

// First entry to the conversation hub (no flag set yet).
const FIRST_TALK = ["go_west", "follow_to_camp", "talk_hermit"];
// Hear the lore, then return to the hub → heard_hermit_lore is set.
const AFTER_LORE = [...FIRST_TALK, "ask_about_tower", "back_from_tower_talk"];
// Take the sealed letter (east), go west, show it (sets seal_broken), then return.
const AFTER_SEAL = [
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

describe("bug_0134 — the hermit greets a returning player as someone he's already met", () => {
  it("first entry: the base stranger-greeting shows and the variant does not", () => {
    const s = play(FIRST_TALK);
    expect(s.current).toBe("hermit_talk");
    expect(s.flags["heard_hermit_lore"]).not.toBe(true);
    expect(s.flags["seal_broken"]).not.toBe(true);
    const text = obs(s).text.toLowerCase();
    expect(text).toContain(STRANGER);
    expect(text).not.toContain(RETURNING);
    // The opening topics are offered.
    expect(optionIds(s)).toContain("ask_about_tower");
    expect(optionIds(s)).toContain("say_goodbye");
  });

  it("after hearing the lore and returning: the variant shows and the stranger-greeting is gone", () => {
    const s = play(AFTER_LORE);
    expect(s.current).toBe("hermit_talk");
    expect(s.flags["heard_hermit_lore"]).toBe(true);
    const text = obs(s).text.toLowerCase();
    expect(text).toContain(RETURNING);
    expect(text).not.toContain(STRANGER);
    // Text-only: the exhausted hub still offers exactly its open choice (say_goodbye);
    // the consumed topic (ask_about_tower, gated not_flag heard_hermit_lore) is retired
    // by its OWN condition, not by the variant.
    expect(optionIds(s)).toContain("say_goodbye");
    expect(optionIds(s)).not.toContain("ask_about_tower");
  });

  it("the seal_broken arm fires the same variant (no lore needed)", () => {
    const s = play(AFTER_SEAL);
    expect(s.current).toBe("hermit_talk");
    expect(s.flags["seal_broken"]).toBe(true);
    expect(s.flags["heard_hermit_lore"]).not.toBe(true);
    const text = obs(s).text.toLowerCase();
    expect(text).toContain(RETURNING);
    expect(text).not.toContain(STRANGER);
    // Choices untouched by the variant: the unconsumed topic is still available
    // (ask_about_tower, since lore was never heard); show_letter is gone (seal broken).
    expect(optionIds(s)).toContain("ask_about_tower");
    expect(optionIds(s)).not.toContain("show_letter");
  });

  it("the variant is cosmetic — the route still reaches ending_truth", () => {
    // Hear the lore, then go north with the broken-seal proof and expose the plot.
    const ended = play([
      ...AFTER_SEAL,
      "ask_about_tower",
      "back_from_tower_talk",
      "say_goodbye",
      "leave_camp",
      "ford_brook",
      "cross_north",
      "approach_checkpoint",
      "show_papers",
      "reveal_evidence",
      "expose_the_plot",
    ]);
    expect(ended.ended).toBe(true);
    expect(ended.endingId).toBe("ending_truth");
    expect(ended.flags["learned_truth"]).toBe(true);
  });
});
