/**
 * Regression for bug_0361 -- Dead Reckoning deck state honesty.
 * A fresh MCP blind playtest found that after reading Hale's log and taking the
 * pistol, the deck prose said the girl "waits to learn" what the player will do
 * even if the player had never gone below to hear her. The course-known/no-pilot
 * deck variants must describe her as still unheard, while preserving the stronger
 * relationship language once the player has spoken with her.
 */
import { describe, expect, it } from "vitest";
import { loadPackFile } from "../../src/cyoa/pack.js";
import { indexPack, buildRules, initStateForPack } from "../../src/cyoa/runner.js";
import { buildObservation } from "../../src/cyoa/observation.js";
import { makeStep } from "../../src/core/engine.js";

const loaded = loadPackFile("content/cyoa/pack/dead_reckoning.yaml");
if (!loaded.ok) throw new Error("dead_reckoning pack must compile");
const index = indexPack(loaded.compiled.pack);
const rules = buildRules(index);
const choose = (id: string) => ({ type: "CHOOSE", choiceId: id }) as const;

function play(ids: string[]) {
  const step = makeStep(rules);
  let state = initStateForPack(index, 7);
  for (const id of ids) state = step(state, choose(id)).state;
  return state;
}

const text = (ids: string[]) => buildObservation(index, play(ids)).text;

describe("bug_0361 -- Dead Reckoning does not imply the girl has been heard before visiting hold", () => {
  it("keeps the course-known deck return honest after the chest but before the hold", () => {
    const deck = text(["to_chest", "read_log", "take_pistol", "leave_chest"]);

    expect(deck).toMatch(/girl they call the Jonah is still unheard by you/i);
    expect(deck).toMatch(/the shape the men have given their fear/i);
    expect(deck).not.toMatch(/girl waits to learn/i);
  });

  it("keeps the course-known cask stepback honest before the hold", () => {
    const deck = text(["to_chest", "read_log", "leave_chest", "to_cask", "back_deck"]);

    expect(deck).toMatch(/girl remains only a name/i);
    expect(deck).toMatch(/not a voice you have heard/i);
    expect(deck).not.toMatch(/girl waits/i);
  });

  it("preserves the stronger waiting language once the player has heard the girl", () => {
    const deck = text(["to_hold", "speak_girl", "leave_hold", "to_cask", "back_deck"]);

    expect(deck).toMatch(/what you heard there will not leave you/i);
    expect(deck).toMatch(/below, the girl waits to learn what you will do/i);
  });
});
