/**
 * Regression (§15) for bug_0294 — dead_reckoning ending_adrift missing death: true.
 *
 * A fresh blind MCP-only playtester (2026-06-08T06-52-40-980Z, seed 7) reached
 * ending_adrift (the seize path) and observed ending_death: false in the observation,
 * despite the prose unambiguously describing universal death at sea:
 *   "the Marigold is only a thing the slack current pushes about, with whatever is
 *    left aboard her past caring which way."
 *
 * Both variants (base and knows_course) describe the same fate. The pack lacked
 * `death: true` on ending_adrift, causing buildObservation to report ending_death: false
 * — factually wrong, and consequential for any client that gates restart/leaderboard
 * logic on this flag.
 *
 * Fix: added `death: true` to ending_adrift in dead_reckoning.yaml.
 */
import { describe, it, expect } from "vitest";
import { loadPackFile } from "../../src/cyoa/pack.js";
import { indexPack, buildRules, initStateForPack } from "../../src/cyoa/runner.js";
import { buildObservation } from "../../src/cyoa/observation.js";
import { makeStep } from "../../src/core/engine.js";
import type { Action } from "../../src/api/types.js";

const loaded = loadPackFile("content/cyoa/pack/dead_reckoning.yaml");
if (!loaded.ok) throw new Error("dead_reckoning pack must compile");
const index = indexPack(loaded.compiled.pack);
const rules = buildRules(index);
const choose = (id: string): Action => ({ type: "CHOOSE", choiceId: id });

function play(ids: string[]) {
  const step = makeStep(rules);
  let s = initStateForPack(index, 7);
  for (const id of ids) s = step(s, choose(id)).state;
  return s;
}

// Uninformed seize path: straight to the cask and seize.
const SEIZE = ["to_cask", "seize"];
// Informed seize path: read the log first, then seize.
const COURSE_SEIZE = ["to_chest", "read_log", "leave_chest", "to_cask", "seize"];

describe("bug_0294 — dead_reckoning ending_adrift carries death: true", () => {
  it("ending_adrift (uninformed seize) reports ending_death: true — not a survival ending", () => {
    const obs = buildObservation(index, play(SEIZE));
    expect(obs.ended).toBe(true);
    expect(obs.ending_id).toBe("ending_adrift");
    expect(obs.ending_death).toBe(true);
  });

  it("ending_adrift (informed seize — knows_course) also reports ending_death: true", () => {
    const obs = buildObservation(index, play(COURSE_SEIZE));
    expect(obs.ended).toBe(true);
    expect(obs.ending_id).toBe("ending_adrift");
    expect(obs.ending_death).toBe(true);
  });

  it("non-death endings still report ending_death: false (no regression)", () => {
    const holdfast = buildObservation(index, play(["to_cask", "ration"]));
    expect(holdfast.ending_id).toBe("ending_holdfast");
    expect(holdfast.ending_death).toBe(false);

    const jonah = buildObservation(index, play(["to_cask", "give_jonah"]));
    expect(jonah.ending_id).toBe("ending_jonah");
    expect(jonah.ending_death).toBe(false);
  });

  it("the pack schema still declares ending_adrift in the endings list with death: true", () => {
    const adriftEnding = index.pack.endings.find((e) => e.id === "ending_adrift");
    expect(adriftEnding).toBeDefined();
    expect(adriftEnding?.death).toBe(true);
  });
});
