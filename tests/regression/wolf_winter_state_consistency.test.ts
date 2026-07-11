/**
 * Cross-cutting state/prose regressions for Wolf-Winter backtracking and shared
 * story surfaces. These routes are legal but intentionally non-optimal, so the
 * straight-through score/combat tests do not naturally exercise them.
 */
import { describe, expect, it } from "vitest";
import { makeStep } from "../../src/core/engine.js";
import type { Rng } from "../../src/core/rng.js";
import type { GameState } from "../../src/core/state.js";
import { buildRpgObservation } from "../../src/rpg/observation.js";
import {
  buildRpgRules,
  enumerateRpgActions,
  indexRpgPack,
  initStateForRpgPack,
} from "../../src/rpg/runner.js";
import { loadRpgSourceFile } from "../../src/rpg/source.js";

const loaded = loadRpgSourceFile("content/rpg/quests/wolf_winter.yaml");
if (!loaded.ok) throw new Error("wolf_winter must compile");
const pack = loaded.compiled.pack;
const index = indexRpgPack(pack);

/** Player d6=6, enemy reply d6=1; fresh for every combat round. */
function bestRng(): Rng {
  let roll = 0;
  return {
    next: () => 0.999999,
    int: (min: number, max: number) => (roll++ === 0 ? max : min),
  };
}

const rules = buildRpgRules(index, () => bestRng());
const step = makeStep(rules);

function act(state: GameState, id: string): GameState {
  const available = enumerateRpgActions(index, state);
  const option = available.find((candidate) => candidate.id === id);
  expect(
    option,
    `expected ${id} in ${state.current}; available: ${available.map((candidate) => candidate.id).join(", ")}`,
  ).toBeDefined();
  if (!option) throw new Error(`missing ${id}`);
  const result = step(state, option.action);
  expect(result.ok, result.rejectionReason).toBe(true);
  return result.state;
}

function attackUntil(state: GameState, enemy: string, defeatFlag: string): GameState {
  for (let guard = 0; guard < 10 && !state.flags[defeatFlag]; guard += 1) {
    state = act(state, `attack_${enemy}`);
  }
  expect(state.flags[defeatFlag]).toBe(true);
  return state;
}

describe("Wolf-Winter state and shared-prose consistency", () => {
  it("uses visit history for the watch and keeps every backtracked milestone truthful", () => {
    const byreYard = pack.rooms.find((room) => room.id === "byre_yard");
    const steadingYard = pack.rooms.find((room) => room.id === "steading_yard");
    expect(byreYard?.on_enter).toEqual([]);
    expect(steadingYard?.variants?.[0]?.when).toContainEqual({ visited: "byre_yard" });

    let state = initStateForRpgPack(index, 497);
    expect(buildRpgObservation(index, state).description).toContain("killing winter night");
    state = act(state, "go_north");
    expect(state.visited.byre_yard).toBe(true);
    expect(state.flags.watch_started).toBeUndefined();
    expect(state.questStage.the_watch).toBeUndefined();
    state = act(state, "go_west");
    state = act(state, "go_east");
    expect(state.flags.watch_started).toBeUndefined();

    state = act(state, "go_north");
    state = act(state, "maneuver_yearling_wolf_set_spear");
    expect(state.questStage.the_watch).toBe("breach_held");
    state = act(state, "go_south");
    expect(state.questStage.the_watch).toBe("breach_held");
    let hub = buildRpgObservation(index, state).description;
    expect(hub).toContain("yearling lies dead");
    expect(hub).toContain("flank-wolf holds the byre door");
    expect(hub).not.toContain("first of the wolves is already through");

    state = act(state, "go_north");
    state = act(state, "go_north");
    state = attackUntil(state, "flank_wolf", "flank_wolf_down");
    expect(state.questStage.the_watch).toBe("threshold_held");
    state = act(state, "go_south");
    state = act(state, "go_south");
    expect(state.questStage.the_watch).toBe("threshold_held");
    hub = buildRpgObservation(index, state).description;
    expect(hub).toContain("flank-wolf across the byre threshold");
    expect(hub).toContain("grey leader still waits deeper in");
    expect(hub).not.toContain("first of the wolves is already through");

    state = act(state, "go_north");
    state = act(state, "go_north");
    state = act(state, "go_north");
    state = attackUntil(state, "grey_leader", "leader_down");
    expect(state.questStage.the_watch).toBe("byre_held");
    state = act(state, "go_south");
    state = act(state, "go_south");
    state = act(state, "go_south");
    expect(state.questStage.the_watch).toBe("byre_held");
    hub = buildRpgObservation(index, state).description;
    expect(hub).toContain("all three wolves lie dead");
    expect(hub).toContain("cattle stand whole");
    expect(hub).not.toContain("first of the wolves is already through");

    state = act(state, "go_south");
    const yard = buildRpgObservation(index, state).description;
    expect(yard).toContain("whatever remains of the night");
    expect(yard).not.toContain("the wolves are in it");
  });

  it("makes the day-book's guarantee the same survival promise Cade actually proves", () => {
    const book = pack.objects.find((object) => object.id === "day_book");
    expect(book?.read_text).toMatch(/DO BOTH AND NO WOLF WILL PULL YOU DOWN/i);
    expect(book?.read_text).not.toMatch(/NO WOLF WILL TOUCH YOU/i);
  });

  it("keeps the one shared combat-death ending truthful in snow, doorway, or straw", () => {
    const death = pack.endings.find((ending) => ending.id === "ending_pulled_down");
    expect(pack.enemies.every((enemy) => enemy.death_ending === death?.id)).toBe(true);
    expect(death).toMatchObject({ title: "Pulled Down", death: true });
    expect(death?.text).not.toMatch(/snow|door|straw/i);
    expect(death?.text).toContain("The wolf's weight bears you down");
    expect(death?.text).toContain("the byre goes to them");
  });
});
