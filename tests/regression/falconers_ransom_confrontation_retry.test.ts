/**
 * Regression for bug_0456: a failed Falconer's Ransom cunning check consumed
 * the only evidence confrontation after the player had gathered the gate log and
 * forged bill. The failure text also claimed Aldric took the bill, while the item
 * remained in inventory.
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

const loaded = loadRpgSourceFile("content/rpg/pack/falconers_ransom.yaml");
if (!loaded.ok) throw new Error("falconers_ransom must compile");
const pack = loaded.compiled.pack;
const index = indexRpgPack(pack);
const rng = queuedRng([1, 20]);
const step = makeStep(buildRpgRules(index, () => rng));

function actById(state: GameState, id: string): { state: GameState; events: GameEvent[] } {
  const options = enumerateRpgActions(index, state);
  const opt = options.find((o) => o.id === id);
  if (!opt) {
    throw new Error(
      `"${id}" not legal in ${state.current}: [${options.map((o) => o.id).join(", ")}]`,
    );
  }
  const result = step(state, opt.action);
  expect(result.ok).toBe(true);
  return { state: result.state, events: result.events };
}

function play(state: GameState, ids: string[]): GameState {
  for (const id of ids) {
    state = actById(state, id).state;
  }
  return state;
}

const actionIds = (state: GameState): string[] =>
  enumerateRpgActions(index, state).map((option) => option.id);

function narrations(events: GameEvent[]): string {
  return events
    .filter(
      (event): event is Extract<GameEvent, { type: "narration" }> => event.type === "narration",
    )
    .map((event) => event.text)
    .join(" ");
}

function fullyPreparedYard(): GameState {
  return play(initStateForRpgPack(index, 7), [
    "read_falcon_jesses",
    "go_west",
    "take_gate_log",
    "read_gate_log",
    "go_east",
    "go_east",
    "take_hidden_bill",
    "read_hidden_bill",
    "go_west",
  ]);
}

describe("bug_0456 - Falconer's Ransom confrontation can recover from a bad roll", () => {
  it("keeps the forged-bill confrontation available after a failed prepared cunning check", () => {
    let state = fullyPreparedYard();
    expect(state.vars.cunning).toBe(9);
    expect(state.inventory).toEqual(["gate_log", "hidden_bill"]);
    expect(actionIds(state)).toContain("use_hidden_bill_on_falcon_jesses");

    const failed = actById(state, "use_hidden_bill_on_falcon_jesses");
    state = failed.state;

    expect(narrations(failed.events)).toContain("cunning check: d20 1 + 9 = 10 vs 12");
    expect(narrations(failed.events)).toContain("the forged bill is still in your hand");
    expect(narrations(failed.events)).toContain("the evidence has not left the yard");
    expect(state.inventory).toContain("hidden_bill");
    expect(state.flags.confrontation_attempted).toBeUndefined();
    expect(state.flags.aldric_shamed).toBeUndefined();
    expect(actionIds(state)).toContain("use_hidden_bill_on_falcon_jesses");

    state = actById(state, "use_hidden_bill_on_falcon_jesses").state;
    expect(state.flags.confrontation_attempted).toBe(true);
    expect(state.flags.aldric_shamed).toBe(true);
    expect(actionIds(state)).not.toContain("use_hidden_bill_on_falcon_jesses");

    state = play(state, ["go_north", "go_north"]);
    const obs = buildRpgObservation(index, state);

    expect(obs.ended).toBe(true);
    expect(obs.ending_id).toBe("ending_cleared");
    expect(obs.state.vars.score).toBe(pack.meta.max_score);
    expect(validateRpg(pack).findings).toHaveLength(0);
  });
});
