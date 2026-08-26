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
    expect(steadingYard?.variants?.map((variant) => variant.when)).toContainEqual([
      { visited: "byre_yard" },
    ]);

    let state = initStateForRpgPack(index, 497);
    expect(buildRpgObservation(index, state).description).toContain(
      "protect the cattle until dawn",
    );
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
    expect(hub).toContain("yearling wolf is dead");
    expect(hub).toContain("face the flank-wolf at the Byre Door");
    expect(hub).not.toContain("first of the wolves is already through");

    state = act(state, "go_north");
    state = act(state, "go_north");
    state = attackUntil(state, "flank_wolf", "flank_wolf_down");
    expect(state.questStage.the_watch).toBe("threshold_held");
    state = act(state, "go_south");
    state = act(state, "go_south");
    expect(state.questStage.the_watch).toBe("threshold_held");
    hub = buildRpgObservation(index, state).description;
    expect(hub).toContain("yearling wolf and flank-wolf are dead");
    expect(hub).toContain("Go north to face the grey leader");
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
    expect(hub).toContain("All three wolves are dead");
    expect(hub).toContain("the herd is whole");
    expect(hub).not.toContain("first of the wolves is already through");

    state = act(state, "go_south");
    const yard = buildRpgObservation(index, state).description;
    expect(yard).toContain("Go north through the gate to the byre-yard and continue the watch");
    expect(yard).toContain("Albany route tag and relief spear");
    expect(yard).not.toContain("the wolves are in it");
  });

  it("keeps the preparation evidence in the day-book and the safety guidance in Cade's counsel", () => {
    const book = pack.objects.find((object) => object.id === "day_book");
    expect(book?.read_text).toMatch(/three wolves[^]*yearling wolf[^]*flank-wolf[^]*grey leader/i);
    expect(book?.read_text).toMatch(
      /TALK TO old Cade the houndsman[^]*PREPARE SUPPORT for \+2 attack[^]*DON padded byre-jerkin for \+2 defense/i,
    );
    expect(book?.read_text).toMatch(/bonuses affect fights still ahead/i);
    expect(book?.read_text).not.toMatch(/NO WOLF[^]*PULL YOU DOWN/i);

    const counsel = pack.npcs
      .find((npc) => npc.id === "houndsman")
      ?.dialogue.nodes.find((node) => node.id === "cade_wolves");
    expect(counsel?.npc_text).toMatch(/\+2 attack, \+5 score/i);
    expect(counsel?.npc_text).toMatch(/DON padded byre-jerkin[^]*\+2 defense/i);
    expect(counsel?.npc_text).toMatch(/Both make worst-roll HUNT safe/i);
    expect(counsel?.npc_text).not.toMatch(/NO WOLF WILL TOUCH YOU/i);
  });

  it("keeps the one shared combat-death ending truthful in snow, doorway, or straw", () => {
    const death = pack.endings.find((ending) => ending.id === "ending_pulled_down");
    expect(pack.enemies.every((enemy) => enemy.death_ending === death?.id)).toBe(true);
    expect(death).toMatchObject({ title: "Pulled Down", death: true });
    expect(death?.text).not.toMatch(/snow|door|straw/i);
    expect(death?.text).toContain("You are killed");
    expect(death?.text).toContain("The surviving wolf or wolves take the byre and cattle");
  });
});
