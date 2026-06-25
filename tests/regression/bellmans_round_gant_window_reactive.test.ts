/**
 * Regression for bug_0457 — a blind playtest of The Bellman's Round found
 * Wool Lane still saying the evidence was "not proof yet" after the player had
 * checked Gant's window and seen the torn sleeve, blood, and purse.
 */
import { describe, it, expect } from "vitest";
import { loadPackFile } from "../../src/cyoa/pack.js";
import { indexPack, buildRules, initStateForPack } from "../../src/cyoa/runner.js";
import { buildObservation } from "../../src/cyoa/observation.js";
import { makeStep } from "../../src/core/engine.js";
import { validateCyoa } from "../../src/validate/cyoa_validator.js";
import type { GameState } from "../../src/core/state.js";

const loaded = loadPackFile("content/cyoa/pack/bellmans_round.yaml");
if (!loaded.ok) throw new Error("bellmans_round must compile");
const pack = loaded.compiled.pack;
const index = indexPack(pack);
const step = makeStep(buildRules(index));

function choose(s: GameState, id: string): GameState {
  const obs = buildObservation(index, s);
  const actions = obs.available_actions.map((a) => a.id);
  expect(actions, `"${id}" should be available in ${obs.scene_id}`).toContain(id);
  const result = step(s, { type: "CHOOSE", choiceId: id });
  expect(result.ok).toBe(true);
  return result.state;
}

describe("bug_0457 — bellmans_round Wool Lane reacts after Gant's window", () => {
  it("stops calling the case 'not proof yet' after the torn sleeve and purse are seen", () => {
    let s = initStateForPack(index, 7);
    s = choose(s, "inspect_doorway");
    s = choose(s, "go_to_counting_house");
    s = choose(s, "read_ledger");
    s = choose(s, "leave_counting_house");
    s = choose(s, "go_to_south_lane");
    s = choose(s, "check_gants_room");
    s = choose(s, "return_from_south");

    const obs = buildObservation(index, s);
    const actionIds = obs.available_actions.map((a) => a.id);

    expect(obs.scene_id).toBe("wool_lane");
    expect(obs.text).toContain("torn sleeve");
    expect(obs.text).toContain("fat purse");
    expect(obs.text).toContain("the night has a name");
    expect(obs.text).not.toContain("not proof yet");
    expect(actionIds).toContain("confront_gant");
    expect(validateCyoa(pack).findings).toHaveLength(0);
  });
});
