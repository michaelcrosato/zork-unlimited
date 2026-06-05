/**
 * Regression (§15) for bug_0265 — the western "learn the truth" beat on *The Watchtower
 * Road* now scores. Surfaced by a blind MCP playtester (seed 7, report
 * ai-runs/2026-06-05T01-31-00-798Z/playtest.md §4/§5): it reached the win via the hermit
 * — who breaks the sealed letter and NAMES the man at the checkpoint, the single most
 * pointed piece of evidence on that route — yet `show_letter` awarded 0 points, while the
 * mechanically-equivalent eastern discoveries (examine_barrels +10, take_ledger +10) paid
 * +20. A west-leaning player who learned the truth there finished feeling under-rewarded.
 *
 * The fix is scoring-only: show_letter now grants +5 (one-shot on its existing
 * not_flag seal_broken guard — the ask_about_tower pattern), and max_score lifts 45 → 50.
 * The award rides the seal_broken flag dimension, so the state space does not grow and the
 * exhaustive cyoa_score_economy_sound proof confirms reachable max == 50. This locks:
 *   (1) show_letter awards exactly +5 the first time it fires;
 *   (2) it is one-shot — once the seal is broken, show_letter is no longer offered;
 *   (3) the new ceiling is real: a single connected best path reaches exactly 50;
 *   (4) no route/gate/ending changed — the no-letter / no-hermit player is unaffected.
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
const scoreOf = (s: ReturnType<typeof play>): number => s.vars.score ?? 0;
const optionIds = (s: ReturnType<typeof play>): string[] =>
  buildObservation(index, s).available_actions.map((a) => a.id);

// East to the cart for the sealed letter, then west to the hermit and into the conversation.
const TO_HERMIT_WITH_LETTER = [
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
];

describe("bug_0265 — the hermit's seal-break (show_letter) scores", () => {
  it("show_letter awards exactly +5 (the seal-break that names the checkpoint man)", () => {
    const before = play(TO_HERMIT_WITH_LETTER);
    expect(before.flags["seal_broken"]).toBeFalsy();
    expect(optionIds(before)).toContain("show_letter");
    const beforeScore = scoreOf(before); // 5 so far — only take_letter has fired

    const after = play([...TO_HERMIT_WITH_LETTER, "show_letter"]);
    expect(after.flags["seal_broken"]).toBe(true);
    expect(after.flags["learned_truth"]).toBe(true);
    expect(scoreOf(after) - beforeScore).toBe(5);
  });

  it("the award is one-shot — show_letter is retired once the seal is broken", () => {
    const back = play([...TO_HERMIT_WITH_LETTER, "show_letter", "back_from_letter_talk"]);
    expect(back.current).toBe("hermit_talk");
    expect(optionIds(back)).not.toContain("show_letter"); // seal_broken guard retires it
    // Score does not climb on the return to the conversation.
    expect(scoreOf(back)).toBe(scoreOf(play([...TO_HERMIT_WITH_LETTER, "show_letter"])));
  });

  it("the lifted ceiling is real: one connected best path collects all seven awards = 50", () => {
    const win = play([
      "inspect_ground", //                        +5  the bootprints
      "go_east",
      "approach_base",
      "search_rubble",
      "take_lantern",
      "take_letter", //                           +5  the sealed papers
      "carry_lantern_to_cellar",
      "light_lantern",
      "descend_cellar",
      "examine_barrels", //                        +10 the lamp oil (arson) — sets learned_truth
      "search_cache",
      "take_ledger", //                            +10 the ledger of names
      "climb_out",
      "cellar_back",
      "return_crossroads",
      "go_west",
      "follow_to_camp",
      "talk_hermit",
      "ask_about_tower", //                        +5  the hermit's corroborating account
      "back_from_tower_talk",
      "show_letter", //                            +5  the seal broken, naming the checkpoint man
      "back_from_letter_talk",
      "say_goodbye",
      "leave_camp",
      "ford_brook",
      "cross_north",
      "slip_into_woods",
      "expose_the_plot", //                        +10 carrying the truth home
    ]);
    expect(win.current).toBe("ending_truth");
    expect(scoreOf(win)).toBe(50);
    expect(loaded.ok && loaded.compiled.pack.meta.max_score).toBe(50);
  });

  it("does not touch the no-hermit player: the eastern-only win still tops out below max", () => {
    // A player who never visits the hermit cannot collect ask_about_tower (+5) or
    // show_letter (+5); their best is 40 — the change adds points only on the western beat.
    const eastOnly = play([
      "inspect_ground",
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
      "leave_base",
      "approach_base",
      "climb_stairs",
      "continue_up",
      "light_beacon",
      "watch_for_help",
      "expose_the_plot",
    ]);
    expect(eastOnly.current).toBe("ending_truth");
    expect(scoreOf(eastOnly)).toBe(40);
  });
});
