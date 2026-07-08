/**
 * Tide-Mill compact ending payoff: the final win text is the quest's last beat
 * in blind play, so each rescue ending must fit compact mode without truncation.
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
import {
  compactRpgObservation,
  COMPACT_ENDING_TEXT_CHAR_LIMIT,
} from "../../src/mcp/compact_rpg_observation.js";
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

function raiseGate(readBoard: boolean): GameState {
  let state = initStateForRpgPack(index, 191);
  const opening = [
    ...(readBoard ? ["read_millboard"] : []),
    "talk_ives",
    "ask_ask_race",
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
  ];
  for (const id of opening) state = act(state, id);

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
  ]) {
    state = act(state, id);
  }
  expect(state.flags["gate_up"]).toBe(true);
  return state;
}

function compactEndingText(state: GameState): string {
  const obs = buildRpgObservation(index, state);
  const compact = compactRpgObservation(obs, []);
  return compact.ending?.text ?? "";
}

function expectCompactPayoff(state: GameState, pattern: RegExp): void {
  const text = compactEndingText(state);
  expect(text.length).toBeLessThanOrEqual(COMPACT_ENDING_TEXT_CHAR_LIMIT);
  expect(text).not.toMatch(/\(\+\d+ chars\)/);
  expect(text).toMatch(pattern);
  expect(text).toMatch(/\*\*\* You have won\. \*\*\*/);
}

describe("Tide-Mill compact ending payoff", () => {
  it("keeps the clean and no-board rescue endings distinct without compact truncation", () => {
    const clean = act(raiseGate(true), "go_down");
    expect(clean.endingId).toBe("ending_saved");
    expectCompactPayoff(clean, /takings are still on the desk/i);

    const noBoard = act(raiseGate(false), "go_down");
    expect(noBoard.endingId).toBe("ending_saved");
    expectCompactPayoff(noBoard, /without ever taking the millboard's order/i);
  });

  it("keeps the returned and kept takings endings distinct without compact truncation", () => {
    let returned = raiseGate(true);
    returned = act(returned, "go_south");
    returned = act(returned, "go_east");
    returned = act(returned, "use_coin_bag");
    returned = act(returned, "use_coin_bag");
    returned = act(returned, "go_west");
    returned = act(returned, "go_north");
    returned = act(returned, "go_down");
    expect(returned.endingId).toBe("ending_saved_returned_takings");
    expectCompactPayoff(returned, /toll-takings are back/i);

    let kept = raiseGate(true);
    kept = act(kept, "go_south");
    kept = act(kept, "go_east");
    kept = act(kept, "use_coin_bag");
    kept = act(kept, "go_west");
    kept = act(kept, "go_north");
    kept = act(kept, "go_down");
    expect(kept.endingId).toBe("ending_saved_with_takings");
    expectCompactPayoff(kept, /silver rides cold/i);
  });
});
