/**
 * Tide-Mill millboard score branch: compressing/signposting the board must not
 * erase the lower-score rescue for players who solve the mill from Ives's advice.
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
import { makeStep } from "../../src/core/engine.js";
import type { Rng } from "../../src/core/rng.js";
import type { GameState } from "../../src/core/state.js";

const loaded = loadRpgSourceFile("content/rpg/quests/tide_mill.yaml");
if (!loaded.ok) throw new Error("tide_mill must compile");
const index = indexRpgPack(loaded.compiled.pack);

const bestRng = (): Rng => ({ next: () => 0.999999, int: (_min, max) => max });
const step = makeStep(buildRpgRules(index, bestRng));

function options(state: GameState) {
  return enumerateRpgActions(index, state);
}

function act(state: GameState, id: string): GameState {
  const option = options(state).find((candidate) => candidate.id === id);
  if (!option) {
    throw new Error(
      `Missing ${id}; legal=[${options(state)
        .map((candidate) => `${candidate.id}:${candidate.command}`)
        .join(", ")}] in ${state.current}`,
    );
  }
  const result = step(state, option.action);
  expect(result.ok).toBe(true);
  return result.state;
}

function fightUntilClear(state: GameState): GameState {
  let next = state;
  for (
    let i = 0;
    i < 10 && options(next).some((option) => option.id === "attack_mill_saboteur");
    i++
  ) {
    next = act(next, "attack_mill_saboteur");
  }
  expect(next.flags["yard_clear"]).toBe(true);
  return next;
}

describe("Tide-Mill no-board score branch", () => {
  it("keeps solving from Ives's advice as a 50/55 rescue", () => {
    let state = initStateForRpgPack(index, 181);
    for (const id of [
      "talk_ives",
      "ask_race",
      "ask_race_to_pawl",
      "ask_pawl_to_yard",
      "ask_yard_leave",
      "take_gaff_hook",
      "go_east",
      "take_oilskin_coat",
      "go_west",
      "go_north",
      "take_crank_handle",
      "go_east",
    ]) {
      state = act(state, id);
    }

    state = fightUntilClear(state);

    for (const id of [
      "go_east",
      "take_billhook",
      "take_crow_bar",
      "go_west",
      "go_west",
      "go_west",
      "use_billhook_on_choked_sluice",
      "go_east",
      "use_crow_bar_on_brake_pawl",
      "use_crank_handle_on_sea_winch",
      "go_down",
    ]) {
      state = act(state, id);
    }

    const observation = buildRpgObservation(index, state);
    expect(state.ended).toBe(true);
    expect(state.endingId).toBe("ending_saved");
    expect(state.flags["read_board"]).not.toBe(true);
    expect(observation.score).toBe(50);
    expect(observation.description).toMatch(/Ives's living advice/i);
    expect(observation.description).toMatch(/not the written millboard order/i);
    expect(observation.description).not.toMatch(/less clean/i);
  });
});
