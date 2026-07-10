/**
 * Tide-Mill saboteur fairness: the fight is mandatory for the clean route, so
 * fully prepared play should survive even under worst combat rolls while the
 * underprepared warning remains a real death fork.
 */
import { describe, it, expect } from "vitest";
import { loadRpgSourceFile } from "../../src/rpg/source.js";
import {
  indexRpgPack,
  buildRpgRules,
  initStateForRpgPack,
  enumerateRpgActions,
} from "../../src/rpg/runner.js";
import { makeStep } from "../../src/core/engine.js";
import type { Rng } from "../../src/core/rng.js";
import type { GameState } from "../../src/core/state.js";

const loaded = loadRpgSourceFile("content/rpg/quests/tide_mill.yaml");
if (!loaded.ok) throw new Error("tide_mill must compile");
const index = indexRpgPack(loaded.compiled.pack);

const LOW = 0;
const HIGH = 0.999999;
function fixedSeqRng(fracs: number[]): Rng {
  let i = 0;
  const next = (): number => {
    const f = fracs[Math.min(i, fracs.length - 1)] ?? 0;
    i += 1;
    return f;
  };
  return {
    next,
    int(min: number, max: number): number {
      const lo = Math.ceil(min);
      const hi = Math.floor(max);
      return lo + Math.floor(next() * (hi - lo + 1));
    },
  };
}

const playerWorst = (): Rng => fixedSeqRng([LOW, HIGH]);
const step = makeStep(buildRpgRules(index, playerWorst));

const options = (state: GameState) => enumerateRpgActions(index, state);

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

function attackUntilSettled(state: GameState): GameState {
  let next = state;
  for (
    let i = 0;
    i < 10 && !next.ended && options(next).some((option) => option.id === "attack_mill_saboteur");
    i++
  ) {
    next = act(next, "attack_mill_saboteur");
  }
  return next;
}

function enterYardWith(ids: string[]): GameState {
  let state = initStateForRpgPack(index, 167);
  for (const id of ids) state = act(state, id);
  return state;
}

describe("Tide-Mill prepared combat stays fair under worst rolls", () => {
  it("survives with meaningful damage after taking Ives's advice, the gaff, and the oilskin", () => {
    let state = enterYardWith([
      "talk_ives",
      "ask_yard",
      "ask_leave",
      "take_gaff_hook",
      "go_east",
      "take_oilskin_coat",
      "go_west",
      "go_north",
      "go_east",
    ]);

    expect(state.vars.attack).toBe(5);
    expect(state.vars.defense).toBe(3);
    const prepJournal = state.journal.join(" ");
    expect(prepJournal).toMatch(/glancing cut/i);
    expect(prepJournal).not.toMatch(/\+\d+\s*(attack|defense|craft|might)/i);
    expect(prepJournal).not.toMatch(/tool-shed saboteur/i);
    expect(state.flags["heard_yard_trick"]).toBe(true);

    state = attackUntilSettled(state);

    expect(state.ended).toBe(false);
    expect(state.flags["yard_clear"]).toBe(true);
    expect(state.vars.hp).toBeGreaterThanOrEqual(8);
    expect(state.vars.hp).toBeLessThan(20);
  });

  it("still makes barehanded yard combat a real, telegraphed death fork", () => {
    let state = enterYardWith(["go_north", "go_east"]);

    expect(state.vars.attack).toBe(3);
    expect(state.vars.defense).toBe(1);

    state = attackUntilSettled(state);

    expect(state.ended).toBe(true);
    expect(state.endingId).toBe("ending_cut_down");
    expect(state.flags["yard_clear"]).not.toBe(true);
  });
});
