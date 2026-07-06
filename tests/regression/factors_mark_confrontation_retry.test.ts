/**
 * Regression for bug_0455: a natural-1 authority roll in Factor's Mark consumed
 * the only social confrontation after the player had gathered every piece of
 * evidence, leaving combat as the only remaining route.
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

const loaded = loadRpgSourceFile("content/rpg/pack/factors_mark.yaml");
if (!loaded.ok) throw new Error("factors_mark must compile");
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
    "read_seal_notice",
    "go_west",
    "talk_silas",
    "ask_ask_testimony",
    "ask_testimony_back",
    "ask_leave_silas",
    "go_east",
    "go_east",
    "take_factor_ledger",
    "read_factor_ledger",
    "go_west",
  ]);
}

describe("bug_0455 - Factor's Mark confrontation can recover from a bad roll", () => {
  it("keeps the social confrontation available after a failed prepared authority check", () => {
    let state = fullyPreparedYard();
    expect(state.vars.authority).toBe(9);
    expect(actionIds(state)).toContain("use_factor_ledger_on_seal_notice");

    const failed = actById(state, "use_factor_ledger_on_seal_notice");
    state = failed.state;

    expect(narrations(failed.events)).toContain("authority check: d20 1 + 9 = 10 vs 11");
    expect(narrations(failed.events)).toContain("the evidence has not left the yard");
    expect(state.flags.confrontation_attempted).toBeUndefined();
    expect(state.flags.factor_shamed).toBeUndefined();
    expect(actionIds(state)).toContain("use_factor_ledger_on_seal_notice");

    state = actById(state, "use_factor_ledger_on_seal_notice").state;
    expect(state.flags.confrontation_attempted).toBe(true);
    expect(state.flags.factor_shamed).toBe(true);
    expect(actionIds(state)).not.toContain("use_factor_ledger_on_seal_notice");

    state = play(state, ["go_north", "go_north"]);
    const obs = buildRpgObservation(index, state);

    expect(obs.ended).toBe(true);
    expect(obs.ending_id).toBe("ending_cleared");
    expect(obs.state.vars.score).toBe(pack.meta.max_score);
    expect(validateRpg(pack).findings).toHaveLength(0);
  });
});
