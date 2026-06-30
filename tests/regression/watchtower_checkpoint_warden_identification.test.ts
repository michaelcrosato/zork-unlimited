/**
 * Regression for bug_0462: a blind west-first player reached the checkpoint as a
 * road warden with no papers and saw only death-by-bluster or retreat. The
 * checkpoint now offers an in-character way to identify yourself and learn that
 * the tower evidence is required before the gate scene becomes productive.
 */
import { describe, expect, it } from "vitest";
import { makeStep } from "../../src/core/engine.js";
import type { GameState } from "../../src/core/state.js";
import { buildObservation } from "../../src/cyoa/observation.js";
import { loadPackFile } from "../../src/cyoa/pack.js";
import { buildRules, indexPack, initStateForPack } from "../../src/cyoa/runner.js";

const loaded = loadPackFile("content/cyoa/pack/watchtower_road.yaml");
if (!loaded.ok) throw new Error("watchtower pack must compile");
const index = indexPack(loaded.compiled.pack);
const rules = buildRules(index);
const step = makeStep(rules);
const choose = (id: string) => ({ type: "CHOOSE", choiceId: id }) as const;

function actionIds(state: GameState): string[] {
  return buildObservation(index, state).available_actions.map((a) => a.id);
}

function play(ids: string[], seed = 7): GameState {
  let state = initStateForPack(index, seed);
  for (const id of ids) {
    const result = step(state, choose(id));
    expect(result.ok, `"${id}" legal from ${state.current}; legal=[${actionIds(state)}]`).toBe(
      true,
    );
    state = result.state;
  }
  return state;
}

const WEST_FIRST_CHECKPOINT = [
  "go_west",
  "follow_to_camp",
  "talk_hermit",
  "ask_about_tower",
  "back_from_tower_talk",
  "say_goodbye",
  "leave_camp",
  "ford_brook",
  "cross_north",
  "approach_checkpoint",
];

describe("bug_0462 - Watchtower checkpoint handles west-first wardens fairly", () => {
  it("offers no-paper players a warden identification option before the death option", () => {
    const state = play(WEST_FIRST_CHECKPOINT);
    expect(state.current).toBe("checkpoint");
    expect(state.inventory).not.toContain("sealed_letter");
    expect(state.flags.heard_hermit_lore).toBe(true);
    expect(actionIds(state)).toContain("identify_as_warden");
    expect(actionIds(state)).toContain("force_through");
    expect(actionIds(state)).toContain("retreat_checkpoint");
    expect(actionIds(state)).not.toContain("show_papers");
  });

  it("identifying as warden redirects safely and names the missing tower proof", () => {
    const before = play(WEST_FIRST_CHECKPOINT);
    const result = step(before, choose("identify_as_warden"));
    expect(result.ok).toBe(true);
    expect(result.state.current).toBe("road_north");
    expect(result.state.ended).toBe(false);
    expect(result.state.vars.score).toBe(before.vars.score);

    const narration = result.events
      .filter((event) => event.type === "narration")
      .map((event) => event.text)
      .join(" ");
    expect(narration).toContain("warden's badge");
    expect(narration).toContain("tower");
    expect(narration).toContain("proof");
    expect(narration).toContain("magistrate");
  });

  it("leaves the existing checkpoint outcomes intact", () => {
    const captured = play([...WEST_FIRST_CHECKPOINT, "force_through"]);
    expect(captured.endingId).toBe("ending_captured");

    const withPapers = play([
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
    ]);
    expect(actionIds(withPapers)).toContain("show_papers");
    expect(actionIds(withPapers)).not.toContain("identify_as_warden");
  });
});
