/**
 * Regression for bug_0506: Tanner's Fever spatially exposed the herb store but
 * never connected Godwin's exhausted dialogue or Holt's blockade to the actual
 * bedside treatment. It also left Holt attackable after the boy was treated and
 * let a no-remedy combat route invent meadowsweet in its ending.
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

const loaded = loadRpgSourceFile("content/rpg/quests/tanners_fever.yaml");
if (!loaded.ok) throw new Error("tanners_fever must compile");
const pack = loaded.compiled.pack;
const index = indexRpgPack(pack);
const bestRng: Rng = {
  next: () => 0,
  int: (_min, max) => max,
};
const step = makeStep(buildRpgRules(index, () => bestRng));

function actionIds(state: GameState): string[] {
  return enumerateRpgActions(index, state).map((option) => option.id);
}

function act(state: GameState, id: string): { state: GameState; events: GameEvent[] } {
  const option = enumerateRpgActions(index, state).find((candidate) => candidate.id === id);
  if (!option) {
    throw new Error(`Missing ${id} in ${state.current}; legal=[${actionIds(state).join(", ")}]`);
  }
  const result = step(state, option.action);
  expect(result.ok).toBe(true);
  return { state: result.state, events: result.events };
}

function play(state: GameState, ids: string[]): GameState {
  for (const id of ids) state = act(state, id).state;
  return state;
}

function narration(events: GameEvent[]): string {
  return events
    .filter(
      (event): event is Extract<GameEvent, { type: "narration" }> => event.type === "narration",
    )
    .map((event) => event.text)
    .join(" ");
}

function fullyPreparedSickroom(seed = 31): GameState {
  return play(initStateForRpgPack(index, seed), [
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

describe("bug_0506 - Tanner's Fever makes its peaceful route player-legible", () => {
  it("uses natural inspection and points evidence back to the bedside", () => {
    let state = initStateForRpgPack(index, 31);
    const opening = buildRpgObservation(index, state);

    expect(opening.description).toMatch(/dose ledger.*west/i);
    expect(opening.description).toMatch(/remedies.*east/i);
    expect(opening.description).toMatch(/Edric's bedside/i);
    expect(actionIds(state)).toContain("examine_sick_edric");
    expect(actionIds(state)).not.toContain("read_sick_edric");

    const examined = act(state, "examine_sick_edric");
    state = examined.state;
    expect(state.flags.edric_examined).toBe(true);
    expect(state.vars.physick).toBe(6);
    expect(state.vars.score).toBe(5);
    expect(narration(examined.events)).toMatch(/dosage formula.*case notes/i);

    state = act(state, "examine_sick_edric").state;
    expect(state.vars.physick).toBe(6);
    expect(state.vars.score).toBe(5);

    state = play(state, ["go_east", "take_meadowsweet"]);
    expect(actionIds(state)).toContain("examine_meadowsweet");
    expect(actionIds(state)).not.toContain("read_meadowsweet");
    state = act(state, "examine_meadowsweet").state;
    expect(state.flags.herbs_examined).toBe(true);
    expect(state.vars.score).toBe(15);
  });

  it("turns Godwin's exhausted loop and Holt's blockade into honest route cues", () => {
    let state = initStateForRpgPack(index, 41);
    state = play(state, ["talk_godwin", "ask_ask_diagnosis"]);
    const returned = act(state, "ask_diagnosis_back");
    state = returned.state;
    const rootText = narration(returned.events);

    expect(rootText).toMatch(/questions alone will not change a treatment/i);
    expect(rootText).toMatch(/grounded in the boy/i);
    expect(rootText).toMatch(/written dose/i);
    expect(rootText).toMatch(/safer correction/i);
    expect(rootText).toMatch(/bedside/i);
    expect(rootText).not.toMatch(/meadowsweet|go east|go west/i);

    state = play(state, ["ask_leave_godwin", "go_north"]);
    const corridor = buildRpgObservation(index, state);
    const north = corridor.blocked_exits.find((exit) => exit.direction === "north");
    expect(north?.message).toMatch(/nonviolent case is back south/i);
    expect(north?.message).toMatch(/Edric's condition/i);
    expect(north?.message).toMatch(/written dose/i);
    expect(north?.message).toMatch(/settles the stomach/i);
    expect(north?.message).toMatch(/at the bedside/i);
    expect(north?.message).not.toMatch(/examine Edric|go east|go west/i);
    expect(actionIds(state)).toContain("go_south");
    expect(actionIds(state)).toContain("attack_holt");
  });

  it("retires Holt after treatment and preserves a full-score peaceful ending", () => {
    let state = fullyPreparedSickroom();
    state = act(state, "use_meadowsweet_on_sick_edric").state;

    expect(state.flags.treatment_given).toBe(true);
    state = act(state, "talk_godwin").state;
    expect(actionIds(state)).toEqual(["ask_leave_godwin"]);
    state = act(state, "ask_leave_godwin").state;

    state = act(state, "go_north").state;
    const corridor = buildRpgObservation(index, state);
    expect(corridor.exits.map((exit) => exit.direction)).toContain("north");
    expect(corridor.enemies_present).toHaveLength(0);
    expect(actionIds(state)).not.toContain("attack_holt");

    state = act(state, "go_north").state;
    const ending = buildRpgObservation(index, state);
    expect(ending.ended).toBe(true);
    expect(ending.ending_id).toBe("ending_recovered");
    expect(ending.score).toBe(pack.meta.max_score);
    expect(ending.inventory).not.toContain("meadowsweet");
    expect(ending.ending?.text).toMatch(/Edric has the meadowsweet in him/i);
    expect(validateRpg(pack).findings).toHaveLength(0);
  });

  it("retires unresolved clue rewards after a lucky unprepared cure", () => {
    let state = play(initStateForRpgPack(index, 47), [
      "go_east",
      "take_meadowsweet",
      "go_west",
      "use_meadowsweet_on_sick_edric",
    ]);
    expect(state.flags.treatment_given).toBe(true);
    expect(state.vars.score).toBe(10);

    const before = state;
    state = act(state, "examine_sick_edric").state;
    expect(state.vars.physick).toBe(before.vars.physick);
    expect(state.vars.score).toBe(before.vars.score);
    expect(state.flags.edric_examined).toBeUndefined();

    state = play(state, ["go_west", "take_godwin_notes"]);
    expect(actionIds(state)).not.toContain("read_godwin_notes");
    state = play(state, ["go_east", "go_east"]);
    expect(actionIds(state)).toContain("examine_meadowsweet");
    state = act(state, "examine_meadowsweet").state;
    expect(state.vars.score).toBe(10);
    expect(state.flags.herbs_examined).toBeUndefined();
  });

  it("makes forced passage find a real remedy instead of inventing one", () => {
    let state = play(initStateForRpgPack(index, 51), ["go_north", "attack_holt", "attack_holt"]);

    expect(state.flags.holt_defeated).toBe(true);
    expect(actionIds(state)).not.toContain("go_north");
    expect(buildRpgObservation(index, state).blocked_exits[0]?.message).toMatch(
      /identified remedy/i,
    );

    state = play(state, [
      "go_south",
      "go_east",
      "take_meadowsweet",
      "examine_meadowsweet",
      "go_west",
      "go_north",
    ]);
    expect(actionIds(state)).toContain("go_north");

    state = act(state, "go_north").state;
    const ending = buildRpgObservation(index, state);
    expect(ending.ended).toBe(true);
    expect(ending.score).toBe(25);
    expect(ending.inventory).not.toContain("meadowsweet");
    expect(ending.ending?.text).toMatch(/left the meadowsweet with the factor's boy/i);
    expect(ending.ending?.text).not.toMatch(/Edric has the meadowsweet in him/i);
  });
});
