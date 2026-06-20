/**
 * Regression (§15) for bug_0372 — content_fix: wreckers_light's gallery now gives
 * the lethal climb a desperate in-world motive, and its truth-known no-false-light
 * prose no longer assumes the player carries neither tool.
 *
 * A fresh blind playtest (20260620T071450Z_wreckers_light_seed7) still found
 * climb_to_wreck alarming and opaque even after the older label fix: the choice
 * clearly telegraphed danger, but the gallery gave no reason a sensible player
 * would choose it. While reviewing that scene, the truth_known variant also proved
 * over-specific: it said "your hands are empty of oil and flame" even if the player
 * had read the journal while carrying exactly one of those tools.
 */
import { describe, it, expect } from "vitest";
import { loadPackFile } from "../../src/cyoa/pack.js";
import { indexPack, buildRules, initStateForPack } from "../../src/cyoa/runner.js";
import { buildObservation } from "../../src/cyoa/observation.js";
import { makeStep } from "../../src/core/engine.js";
import type { Action } from "../../src/api/types.js";

const loaded = loadPackFile("content/cyoa/pack/wreckers_light.yaml");
if (!loaded.ok) throw new Error("wreckers_light pack must compile");
const index = indexPack(loaded.compiled.pack);
const rules = buildRules(index);
const choose = (id: string): Action => ({ type: "CHOOSE", choiceId: id });

function play(ids: string[]) {
  const step = makeStep(rules);
  let s = initStateForPack(index, 7);
  for (const id of ids) s = step(s, choose(id)).state;
  return s;
}

const obs = (ids: string[]) => buildObservation(index, play(ids));
const text = (ids: string[]) => obs(ids).text.toLowerCase();
const actionIds = (ids: string[]) => obs(ids).available_actions.map((a) => a.id);

const TOOLLESS_GALLERY = ["enter", "out_gallery"];
const TRUTH_WITH_STRIKER_ONLY = [
  "enter",
  "hear_keeper",
  "search_keeper",
  "take_striker",
  "go_down",
  "unlock_chest",
  "read_journal",
  "back_up",
  "out_gallery",
];

describe("wreckers_light — gallery climb has motive and partial-tool prose is accurate", () => {
  it("tool-less gallery text explains the desperate reason someone might climb down", () => {
    const t = text(TOOLLESS_GALLERY);

    expect(t).toContain("service rungs");
    expect(t).toContain("only desperation");
    expect(t).toContain("reach the rocks before the ship does");
  });

  it("truth-known gallery with only the striker does not claim the player's hands are empty", () => {
    const t = text(TRUTH_WITH_STRIKER_ONLY);

    expect(t).toContain("without both oil and flame");
    expect(t).toContain("no false light until");
    expect(t).toContain("cask below and the keeper's flint are both in hand");
    expect(t).not.toContain("hands are empty");
  });

  it("partial tools still do not surface hang_false_light, but the death route remains explicit", () => {
    const actions = actionIds(TRUTH_WITH_STRIKER_ONLY);
    const climb = obs(TRUTH_WITH_STRIKER_ONLY).available_actions.find(
      (a) => a.id === "climb_to_wreck",
    );

    expect(actions).not.toContain("hang_false_light");
    expect(climb?.text.toLowerCase()).toContain("breaking sea");
    expect(obs([...TRUTH_WITH_STRIKER_ONLY, "climb_to_wreck"]).ending_id).toBe("ending_drowned");
  });
});
