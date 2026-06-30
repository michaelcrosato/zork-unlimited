/**
 * Regression (§15) for bug_0055 — *The Watchtower Road* `confront_smuggler` scene
 * text was self-contradicting on the no-proof branch. A blind MCP playtester
 * (seed 19, report ai-runs/2026-06-01T15-33-04-222Z/playtest.md) reached the
 * sergeant holding the sealed letter but having learned nothing (no cellar, no
 * hermit). The single static scene text narrated the sergeant "reading his own
 * name" (a damning reveal) — yet the only forward choice there, `press_bluff`
 * (gated not_flag learned_truth), reads "the letter's still sealed and you can
 * prove nothing." You cannot both read his name AND prove nothing.
 *
 * The fix makes the scene text reactive: the base text is the learned_truth payoff
 * (you know what the letter/ledger holds, so it damns him), and a not_flag
 * learned_truth variant covers the bluffer handing over an unbroken seal. This
 * locks both renderings and confirms no route/ending changed.
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
  let s = initStateForPack(index, 1);
  for (const id of ids) s = step(s, choose(id)).state;
  return s;
}
const obs = (s: ReturnType<typeof play>) => buildObservation(index, s);
const optionIds = (s: ReturnType<typeof play>): string[] =>
  obs(s).available_actions.map((a) => a.id);

// Take the letter (east) but learn NOTHING (skip cellar + hermit), then present it.
const TO_CONFRONT_NO_PROOF = [
  "go_east",
  "approach_base",
  "search_rubble",
  "take_letter",
  "leave_cart",
  "leave_base",
  "return_crossroads",
  "go_west",
  "ford_brook",
  "cross_north",
  "approach_checkpoint",
  "show_papers",
];

// Take the letter AND learn the truth in the cellar (ledger), then present it.
const TO_CONFRONT_WITH_PROOF = [
  "go_east",
  "approach_base",
  "search_rubble",
  "take_lantern",
  "take_letter",
  "leave_cart",
  "leave_base",
  "circle_cellar",
  "light_lantern",
  "descend_cellar",
  "search_cache",
  "take_ledger",
  "climb_out",
  "cellar_back",
  "approach_base",
  "climb_stairs",
  "continue_up",
  "survey_road",
  "approach_checkpoint",
  "show_papers",
];

describe("bug_0055 — confront_smuggler text matches the player's actual proof", () => {
  it("no-proof branch: the bluffer sees an unbroken seal, NOT the sergeant reading his name", () => {
    const s = play(TO_CONFRONT_NO_PROOF);
    expect(s.current).toBe("confront_smuggler");
    expect(s.flags["learned_truth"]).not.toBe(true);
    const text = obs(s).text.toLowerCase();
    // The variant the bluff choice presumes: an unbroken seal, no real proof.
    expect(text).toContain("unbroken");
    expect(text).toContain("no kind of proof");
    // It must NOT claim the sergeant already read his own name — that would
    // contradict the only available choice ("you can prove nothing").
    expect(text).not.toContain("his own name");
    const opts = optionIds(s);
    expect(opts).toContain("press_bluff");
    expect(opts).not.toContain("reveal_evidence");
  });

  it("with-proof branch: the sergeant reads his own name and the reveal pays off", () => {
    const s = play(TO_CONFRONT_WITH_PROOF);
    expect(s.current).toBe("confront_smuggler");
    expect(s.flags["learned_truth"]).toBe(true);
    expect(s.inventory).toContain("ledger");
    const text = obs(s).text.toLowerCase();
    expect(text).toContain("his own name");
    expect(text).not.toContain("unbroken");
    const opts = optionIds(s);
    expect(opts).toContain("reveal_evidence");
    expect(opts).not.toContain("press_bluff");
  });

  it("routes/endings are unchanged: no-proof bluff still captures, proof still exposes", () => {
    const captured = play([...TO_CONFRONT_NO_PROOF, "press_bluff"]);
    expect(captured.ended).toBe(true);
    expect(captured.endingId).toBe("ending_captured");

    const truth = play([...TO_CONFRONT_WITH_PROOF, "reveal_evidence", "expose_the_plot"]);
    expect(truth.ended).toBe(true);
    expect(truth.endingId).toBe("ending_truth");
  });
});
