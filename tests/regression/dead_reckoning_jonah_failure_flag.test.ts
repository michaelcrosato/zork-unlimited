/**
 * Regression for bug_0413 -- Dead Reckoning's Jonah ending is a failure ending.
 *
 * A blind playtest (2026-06-22, seed 7) reached ending_jonah by giving the
 * stowaway to the sea and noted that `ending_death: false` made the outcome look
 * like a neutral survival result to tooling. The CYOA schema defines `death` as a
 * death/failure marker, and this ending is the pack's moral capitulation: the
 * child is drowned, the wind does not come, and the crew survives broken and
 * guilty. Both the ignorant and informed variants should therefore surface as a
 * failure terminal.
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

describe("bug_0413 -- Dead Reckoning marks ending_jonah as a failure", () => {
  it("the uninformed Jonah route reports ending_death: true", () => {
    const obs = buildObservation(index, play(["to_cask", "give_jonah"]));
    expect(obs.ended).toBe(true);
    expect(obs.ending_id).toBe("ending_jonah");
    expect(obs.ending_death).toBe(true);
  });

  it("the informed Jonah route also reports ending_death: true", () => {
    const obs = buildObservation(
      index,
      play(["to_hold", "speak_girl", "leave_hold", "to_cask", "give_jonah"]),
    );
    expect(obs.ended).toBe(true);
    expect(obs.ending_id).toBe("ending_jonah");
    expect(obs.ending_death).toBe(true);
    expect(obs.text.toLowerCase()).toContain("you knew what she was");
  });

  it("the pack schema declares ending_jonah with death: true", () => {
    const jonahEnding = index.pack.endings.find((e) => e.id === "ending_jonah");
    expect(jonahEnding).toBeDefined();
    expect(jonahEnding?.death).toBe(true);
  });
});
