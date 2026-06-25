/**
 * Regression for bug_0475 -- a later blind pass found that Aldric's infirmary
 * clue sounded like a visitable location or major lead, but the cellar evidence
 * never explicitly paid it off.
 */
import { describe, expect, it } from "vitest";
import { loadPackFile } from "../../src/cyoa/pack.js";
import { buildObservation } from "../../src/cyoa/observation.js";
import { indexPack, buildRules, initStateForPack } from "../../src/cyoa/runner.js";
import { makeStep } from "../../src/core/engine.js";
import type { Action } from "../../src/api/types.js";

const loaded = loadPackFile("content/cyoa/pack/priors_cellar.yaml");
if (!loaded.ok) throw new Error("priors_cellar pack must compile");
const index = indexPack(loaded.compiled.pack);
const rules = buildRules(index);
const choose = (id: string): Action => ({ type: "CHOOSE", choiceId: id });

function play(ids: string[]) {
  const step = makeStep(rules);
  let state = initStateForPack(index, 7);
  for (const id of ids) state = step(state, choose(id)).state;
  return buildObservation(index, state);
}

describe("bug_0475 -- Prior's Cellar resolves the infirmary clue", () => {
  it("connects Aldric's missing infirmary victim to the cellar cache", () => {
    const state = play([
      "go_to_hall",
      "go_to_sick_pilgrim",
      "listen_to_aldric",
      "ask_about_others",
      "leave_aldric",
      "leave_hall",
      "go_to_study",
      "snoop_while_prior_present",
      "leave_study",
      "go_to_cloister",
      "go_to_cellar_door",
      "unlock_cellar",
      "examine_cache",
    ]);

    expect(state.scene_id).toBe("cellar");
    expect(state.state.flags).toContain("seen_cache");

    const cacheEntry = state.state.journal.find(
      (entry) => /infirmary-tied satchel/i.test(entry) && /Aldric's missing pilgrim/i.test(entry),
    );

    expect(cacheEntry).toBeDefined();
    expect(cacheEntry).toMatch(/Arden/i);
    expect(cacheEntry).toMatch(/silver ring/i);
  });
});
