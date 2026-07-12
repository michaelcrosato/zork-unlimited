/**
 * Regression for bug_0458/bug_0506: a natural-1 physick roll in Tanner's Fever
 * once consumed the only medical route. The first fix made the same random check
 * infinitely retryable. The durable contract is one rolled presentation followed
 * by a same-id, deterministic recovery after the player orders all three clues.
 */
import { describe, expect, it } from "vitest";
import { makeStep } from "../../src/core/engine.js";
import type { GameEvent } from "../../src/core/events.js";
import type { Rng } from "../../src/core/rng.js";
import type { GameState } from "../../src/core/state.js";
import { buildRpgObservation } from "../../src/rpg/observation.js";
import { loadRpgSourceFile } from "../../src/rpg/source.js";
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

const loaded = loadRpgSourceFile("content/rpg/quests/tanners_fever.yaml");
if (!loaded.ok) throw new Error("tanners_fever must compile");
const pack = loaded.compiled.pack;
const index = indexRpgPack(pack);
let step = makeStep(buildRpgRules(index, () => queuedRng([20])));

function useRolls(rolls: number[]): void {
  const rng = queuedRng([...rolls]);
  step = makeStep(buildRpgRules(index, () => rng));
}

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
    "examine_sick_edric",
    "go_west",
    "take_godwin_notes",
    "read_godwin_notes",
    "go_east",
    "go_east",
    "take_meadowsweet",
    "examine_meadowsweet",
    "go_west",
  ]);
}

describe("bug_0458 - Tanner's Fever treatment can recover from a bad roll", () => {
  it("turns a failed prepared check into a finite same-id recovery", () => {
    useRolls([1]);
    let state = fullyPreparedSickroom();
    expect(state.vars.physick).toBe(9);
    expect(state.inventory).toEqual(["godwin_notes", "meadowsweet"]);
    expect(actionIds(state)).toContain("use_meadowsweet_on_sick_edric");

    const failed = actById(state, "use_meadowsweet_on_sick_edric");
    state = failed.state;
    const failedText = narrations(failed.events);

    expect(failedText).toContain("physick check: d20 1 + 9 = 10 vs 12");
    expect(failedText).toContain("will not hear the same loose case twice");
    expect(failedText).toMatch(/inspect Edric/i);
    expect(failedText).toMatch(/read Godwin's case notes/i);
    expect(failedText).toMatch(/inspect the meadowsweet/i);
    expect(failedText).toMatch(/treat Edric again at the bedside/i);
    expect(state.flags.confrontation_attempted).toBe(true);
    expect(state.flags.treatment_given).toBeUndefined();
    expect(state.inventory).toContain("meadowsweet");
    expect(actionIds(state)).toContain("use_meadowsweet_on_sick_edric");
    const recovery = enumerateRpgActions(index, state).find(
      (option) => option.id === "use_meadowsweet_on_sick_edric",
    );
    expect(recovery?.command).toContain("after ordering the evidence");
    expect(recovery?.skill_check).toBeUndefined();

    const recovered = actById(state, "use_meadowsweet_on_sick_edric");
    state = recovered.state;
    expect(narrations(recovered.events)).not.toContain("physick check:");
    expect(state.flags.confrontation_attempted).toBe(true);
    expect(state.flags.treatment_given).toBe(true);
    expect(actionIds(state)).not.toContain("use_meadowsweet_on_sick_edric");

    state = actById(state, "go_north").state;
    const corridor = buildRpgObservation(index, state);
    expect(corridor.enemies_present).toHaveLength(0);
    expect(actionIds(state)).not.toContain("attack_holt");

    state = actById(state, "go_north").state;
    const obs = buildRpgObservation(index, state);

    expect(obs.ended).toBe(true);
    expect(obs.ending_id).toBe("ending_recovered");
    expect(obs.state.vars.score).toBe(pack.meta.max_score);
    expect(obs.ending?.text).toContain("Godwin has the revised formula");
    expect(obs.ending?.text).not.toContain("not win this the right way");
    expect(validateRpg(pack).findings).toHaveLength(0);
  });

  it("makes an underprepared failure gather evidence instead of rerolling", () => {
    useRolls([1]);
    let state = play(initStateForRpgPack(index, 17), ["go_east", "take_meadowsweet", "go_west"]);

    const failed = actById(state, "use_meadowsweet_on_sick_edric");
    state = failed.state;
    const failedText = narrations(failed.events);

    expect(failedText).not.toContain("three parts wormwood");
    expect(failedText).toMatch(/inspect Edric/i);
    expect(failedText).toMatch(/read Godwin's case notes/i);
    expect(failedText).toMatch(/inspect the meadowsweet/i);
    expect(failedText).toMatch(/treat Edric again at the bedside/i);
    expect(actionIds(state)).not.toContain("use_meadowsweet_on_sick_edric");

    state = play(state, [
      "examine_sick_edric",
      "go_west",
      "take_godwin_notes",
      "read_godwin_notes",
      "go_east",
      "examine_meadowsweet",
    ]);

    const recovery = enumerateRpgActions(index, state).find(
      (option) => option.id === "use_meadowsweet_on_sick_edric",
    );
    expect(recovery?.skill_check).toBeUndefined();
    expect(recovery?.command).toContain("ordering the evidence");

    state = actById(state, "use_meadowsweet_on_sick_edric").state;
    expect(state.flags.treatment_given).toBe(true);
    expect(state.inventory).toContain("meadowsweet");
  });
});
