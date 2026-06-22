/**
 * Regression for bug_0458: a natural-1 physick roll in Tanner's Fever consumed
 * the only medical treatment route after the player had identified the overdose
 * formula and remedy. The failure text also blamed sequencing even when the
 * notes had already been read.
 */
import { describe, expect, it } from "vitest";
import { makeStep } from "../../src/core/engine.js";
import type { GameEvent } from "../../src/core/events.js";
import type { Rng } from "../../src/core/rng.js";
import type { GameState } from "../../src/core/state.js";
import { buildRpgObservation } from "../../src/rpg/observation.js";
import { loadRpgPackFile } from "../../src/rpg/pack.js";
import {
  buildRpgRules,
  enumerateRpgActions,
  indexRpgPack,
  initStateForRpgPack,
} from "../../src/rpg/runner.js";
import { validateRpg } from "../../src/validate/rpg_validator.js";

function queuedRng(rolls: number[]): Rng {
  return {
    next: () => 0,
    int: () => {
      const roll = rolls.shift();
      if (roll === undefined) throw new Error("test RNG exhausted");
      return roll;
    },
  };
}

const loaded = loadRpgPackFile("content/rpg/pack/tanners_fever.yaml");
if (!loaded.ok) throw new Error("tanners_fever must compile");
const pack = loaded.compiled.pack;
const index = indexRpgPack(pack);
const rng = queuedRng([1, 20]);
const step = makeStep(buildRpgRules(index, () => rng));

function actionIds(state: GameState): string[] {
  return enumerateRpgActions(index, state).map((option) => option.id);
}

function actById(state: GameState, id: string): { state: GameState; events: GameEvent[] } {
  const option = enumerateRpgActions(index, state).find((o) => o.id === id);
  if (!option) {
    throw new Error(`"${id}" not legal in ${state.current}: [${actionIds(state).join(", ")}]`);
  }
  const result = step(state, option.action);
  expect(result.ok).toBe(true);
  return { state: result.state, events: result.events };
}

function play(state: GameState, ids: string[]): GameState {
  for (const id of ids) {
    state = actById(state, id).state;
  }
  return state;
}

function narrations(events: GameEvent[]): string {
  return events
    .filter(
      (event): event is Extract<GameEvent, { type: "narration" }> => event.type === "narration",
    )
    .map((event) => event.text)
    .join(" ");
}

function fullyPreparedSickroom(): GameState {
  return play(initStateForRpgPack(index, 7), [
    "read_sick_edric",
    "go_west",
    "take_godwin_notes",
    "read_godwin_notes",
    "go_east",
    "go_east",
    "take_meadowsweet",
    "read_meadowsweet",
    "go_west",
  ]);
}

describe("bug_0458 - Tanner's Fever treatment can recover from a bad roll", () => {
  it("keeps the medical route available after a failed prepared physick check", () => {
    let state = fullyPreparedSickroom();
    expect(state.vars.physick).toBe(9);
    expect(state.inventory).toEqual(["godwin_notes", "meadowsweet"]);
    expect(actionIds(state)).toContain("use_meadowsweet_on_sick_edric");

    const failed = actById(state, "use_meadowsweet_on_sick_edric");
    state = failed.state;
    const failedText = narrations(failed.events);

    expect(failedText).toContain("physick check: d20 1 + 9 = 10 vs 12");
    expect(failedText).toContain("The meadowsweet is still in your hand");
    expect(failedText).toContain("put the evidence to Godwin again");
    expect(failedText).not.toContain("the sequence wrong");
    expect(failedText).not.toContain("formula not yet named");
    expect(state.flags.confrontation_attempted).toBeUndefined();
    expect(state.flags.treatment_given).toBeUndefined();
    expect(state.inventory).toContain("meadowsweet");
    expect(actionIds(state)).toContain("use_meadowsweet_on_sick_edric");

    state = actById(state, "use_meadowsweet_on_sick_edric").state;
    expect(state.flags.confrontation_attempted).toBe(true);
    expect(state.flags.treatment_given).toBe(true);
    expect(actionIds(state)).not.toContain("use_meadowsweet_on_sick_edric");

    state = play(state, ["go_north", "go_north"]);
    const obs = buildRpgObservation(index, state);

    expect(obs.ended).toBe(true);
    expect(obs.ending_id).toBe("ending_recovered");
    expect(obs.state.vars.score).toBe(pack.meta.max_score);
    expect(obs.ending?.text).toContain("Godwin has the revised formula");
    expect(obs.ending?.text).not.toContain("not win this the right way");
    expect(validateRpg(pack).findings).toHaveLength(0);
  });
});
