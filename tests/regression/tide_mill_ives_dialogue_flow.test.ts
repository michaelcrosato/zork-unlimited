/**
 * Regression for the Tide-Mill seed-89 blind finding: Miller Ives' urgent advice
 * worked, but each topic forced a mechanical "back" action before the next question.
 *
 * The content fix keeps every advice reward deliberate while allowing direct
 * follow-up questions from one advice node to another.
 */
import { describe, it, expect } from "vitest";
import { loadRpgSourceFile } from "../../src/rpg/source.js";
import {
  indexRpgPack,
  buildRpgRules,
  initStateForRpgPack,
  enumerateRpgActions,
} from "../../src/rpg/runner.js";
import { buildRpgObservation } from "../../src/rpg/observation.js";
import { validateRpg } from "../../src/validate/rpg_validator.js";
import { makeStep } from "../../src/core/engine.js";
import type { Action } from "../../src/api/types.js";
import type { GameState } from "../../src/core/state.js";

const loaded = loadRpgSourceFile("content/rpg/quests/tide_mill.yaml");
if (!loaded.ok) throw new Error("tide_mill must compile");
const pack = loaded.compiled.pack;
const index = indexRpgPack(pack);
const rules = buildRpgRules(index);
const step = makeStep(rules);

function act(state: GameState, pred: (action: Action) => boolean): GameState {
  const option = enumerateRpgActions(index, state).find((candidate) => pred(candidate.action));
  if (!option) {
    throw new Error(
      `no action; legal=[${enumerateRpgActions(index, state)
        .map((candidate) => candidate.id)
        .join(", ")}] in ${state.current}`,
    );
  }
  const result = step(state, option.action);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error("step failed");
  return result.state;
}

const talkIves = (action: Action): boolean => action.type === "TALK" && action.npc === "ives";
const ask =
  (topic: string) =>
  (action: Action): boolean =>
    action.type === "ASK" && action.topic === topic;

function legalTopicIds(state: GameState): string[] {
  return enumerateRpgActions(index, state)
    .filter((option) => option.action.type === "ASK")
    .map((option) => (option.action as { topic: string }).topic);
}

describe("Tide-Mill Ives dialogue supports direct urgent follow-ups", () => {
  it("the pack still validates green", () => {
    const report = validateRpg(pack);
    expect(report.ok).toBe(true);
    expect(report.findings.filter((finding) => finding.severity === "error")).toEqual([]);
  });

  it("one advice topic does not auto-grant the others", () => {
    let state = initStateForRpgPack(index, 89);
    state = act(state, talkIves);
    state = act(state, ask("ask_race"));

    expect(state.flags["heard_race_trick"]).toBe(true);
    expect(state.flags["heard_pawl_trick"]).toBeUndefined();
    expect(state.flags["heard_yard_trick"]).toBeUndefined();
    expect(state.vars.craft).toBe(8);
    expect(state.vars.might).toBe(3);
    expect(legalTopicIds(state)).toEqual(
      expect.arrayContaining(["race_to_pawl", "race_to_yard", "race_leave"]),
    );
  });

  it("can gather race, pawl, and yard advice with no intermediate back topic", () => {
    let state = initStateForRpgPack(index, 89);
    state = act(state, talkIves);

    const route = ["ask_race", "race_to_pawl", "pawl_to_yard", "yard_leave"];
    expect(route.every((topic) => !topic.endsWith("_back"))).toBe(true);
    for (const topic of route) state = act(state, ask(topic));

    expect(state.flags["heard_race_trick"]).toBe(true);
    expect(state.flags["heard_pawl_trick"]).toBe(true);
    expect(state.flags["heard_yard_trick"]).toBe(true);
    expect(state.vars.craft).toBe(8);
    expect(state.vars.might).toBe(8);
    expect(state.journal.join(" ")).toContain("head-race trick");
    expect(state.journal.join(" ")).toContain("pawl and winch angle");
    expect(state.journal.join(" ")).toContain("gaff-pole and oilskin");
    expect(buildRpgObservation(index, state).dialogue).toBeNull();
  });
});
