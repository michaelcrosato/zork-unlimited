/**
 * Regression for bug_0448 -- Lock-Keeper's Toll's combat fallback used to inherit
 * the clean sluice ending. The player could beat Marrick, walk north, and get an
 * epilogue claiming the grain barge had water under her even though the toll chain
 * was never opened.
 */
import { describe, it, expect } from "vitest";
import { loadRpgSourceFile } from "../../src/rpg/source.js";
import { validateRpg } from "../../src/validate/rpg_validator.js";
import { indexRpgPack, buildRpgRules, initStateForRpgPack } from "../../src/rpg/runner.js";
import { buildRpgObservation } from "../../src/rpg/observation.js";
import { makeStep, actionEquals } from "../../src/core/engine.js";
import type { Rng } from "../../src/core/rng.js";
import type { RpgAction } from "../../src/api/types.js";
import type { GameState } from "../../src/core/state.js";

const loaded = loadRpgSourceFile("content/rpg/pack/lockkeepers_toll.yaml");
if (!loaded.ok) throw new Error("lockkeepers_toll must compile");
const pack = loaded.compiled.pack;
const index = indexRpgPack(pack);
const maxRoll = (): Rng => ({ next: () => 0.999, int: (_min, max) => max });
const rules = buildRpgRules(index, maxRoll);
const step = makeStep(rules);

function act(state: GameState, RpgAction: RpgAction): GameState {
  expect(
    rules.legalActions(state).some((a) => actionEquals(a, RpgAction)),
    `RpgAction ${JSON.stringify(RpgAction)} must be legal in ${state.current}`,
  ).toBe(true);
  const result = step(state, RpgAction);
  expect(result.ok, result.rejectionReason).toBe(true);
  return result.state;
}

function cleanRoute(): GameState {
  let state = initStateForRpgPack(index, 7);
  state = act(state, { type: "READ", target: "current_marks" });
  state = act(state, { type: "MOVE", direction: "west" });
  state = act(state, { type: "READ", target: "flood_gauge" });
  state = act(state, { type: "MOVE", direction: "east" });
  state = act(state, { type: "MOVE", direction: "east" });
  state = act(state, { type: "READ", target: "chain_table" });
  state = act(state, { type: "TAKE", item: "windlass_handle" });
  state = act(state, { type: "MOVE", direction: "west" });
  return act(state, { type: "USE", item: "windlass_handle", target: "sluice_chain" });
}

function forcedPassageRoute(): GameState {
  let state = initStateForRpgPack(index, 7);
  state = act(state, { type: "MOVE", direction: "north" });
  for (let i = 0; i < 10 && !state.flags["marrick_gone"]; i++) {
    state = act(state, { type: "ATTACK", enemy: "marrick" });
  }
  expect(state.flags["marrick_gone"]).toBe(true);
  expect(state.questStage["lockkeepers_toll"]).toBe("forced_passage");
  expect(state.vars["score"] ?? 0).toBe(0);
  return act(state, { type: "MOVE", direction: "north" });
}

describe("bug_0448 -- Lock-Keeper's Toll split clean lock work from forced passage", () => {
  it("does not imply the toll chain blocks the combat route itself", () => {
    let state = initStateForRpgPack(index, 7);
    state = act(state, { type: "MOVE", direction: "north" });

    const obs = buildRpgObservation(index, state);
    expect(obs.description).toContain("raises the belaying pin");
    const north = obs.blocked_exits.find((e) => e.direction === "north");
    expect(north?.message).toContain("Marrick blocks the gate walk");
    expect(north?.message).not.toContain("while the toll chain still holds");
  });

  it("combat fallback reaches a partial forced-passage ending, not the clean river-cleared ending", () => {
    const state = forcedPassageRoute();
    const obs = buildRpgObservation(index, state);

    expect(state.ended).toBe(true);
    expect(state.endingId).toBe("ending_forced_passage");
    expect(state.endingId).not.toBe("ending_river_clear");
    expect(state.vars["score"]).toBe(15);
    const forcedRoom = pack.rooms.find((r) => r.id === "forced_river_cut")!;
    expect(forcedRoom.description).toContain("grain barge still strains");
    expect(obs.ending?.text).toContain("grain barge still rides trapped");
    expect(obs.ending?.text).not.toContain("has water under her");
    expect(obs.ending?.text).not.toContain("the city gets its flour");
  });

  it("fighting Marrick first does not let the player stack forced and clean completion scores", () => {
    let state = initStateForRpgPack(index, 7);
    state = act(state, { type: "MOVE", direction: "north" });
    while (!state.flags["marrick_gone"]) state = act(state, { type: "ATTACK", enemy: "marrick" });
    state = act(state, { type: "MOVE", direction: "south" });
    state = act(state, { type: "READ", target: "current_marks" });
    state = act(state, { type: "MOVE", direction: "west" });
    state = act(state, { type: "READ", target: "flood_gauge" });
    state = act(state, { type: "MOVE", direction: "east" });
    state = act(state, { type: "MOVE", direction: "east" });
    state = act(state, { type: "READ", target: "chain_table" });
    state = act(state, { type: "TAKE", item: "windlass_handle" });
    state = act(state, { type: "MOVE", direction: "west" });
    state = act(state, { type: "USE", item: "windlass_handle", target: "sluice_chain" });

    expect(state.ended).toBe(true);
    expect(state.endingId).toBe("ending_river_clear");
    expect(state.vars["score"]).toBe(pack.meta.max_score);
  });

  it("clean sluice work still wins the river-cleared ending at full score", () => {
    const state = cleanRoute();
    const obs = buildRpgObservation(index, state);

    expect(state.ended).toBe(true);
    expect(state.endingId).toBe("ending_river_clear");
    expect(state.questStage["lockkeepers_toll"]).toBe("sluice_open");
    expect(state.vars["score"]).toBe(pack.meta.max_score);
    expect(obs.ending?.text).toContain("grain barge has water");
    expect(obs.ending?.text).toContain("the city gets");
  });

  it("the pack remains valid under the RPG validator", () => {
    const report = validateRpg(pack);
    expect(report.findings.filter((f) => f.severity === "error")).toEqual([]);
    expect(report.ok).toBe(true);
  });
});
