/**
 * Regression for bug_0450 -- The Printer's Night asked the player to retrieve
 * the dangerous pamphlet proof, then exposed a proof sheet that could not be
 * taken while the real objective was the type-block. The proof can now be
 * claimed as evidence, but the game explicitly keeps the block as the mission
 * object that stops the print run.
 */
import { describe, it, expect } from "vitest";
import { loadRpgSourceFile } from "../../src/rpg/source.js";
import { validateRpg } from "../../src/validate/rpg_validator.js";
import {
  indexRpgPack,
  buildRpgRules,
  initStateForRpgPack,
  enumerateRpgActions,
} from "../../src/rpg/runner.js";
import { buildRpgObservation } from "../../src/rpg/observation.js";
import { makeStep, actionEquals } from "../../src/core/engine.js";
import type { RpgAction } from "../../src/api/types.js";
import type { GameEvent } from "../../src/core/events.js";
import type { GameState } from "../../src/core/state.js";

const loaded = loadRpgSourceFile("content/rpg/pack/printers_night.yaml");
if (!loaded.ok) throw new Error("printers_night must compile");
const pack = loaded.compiled.pack;
const index = indexRpgPack(pack);
const rules = buildRpgRules(index);
const step = makeStep(rules);

function act(state: GameState, RpgAction: RpgAction): { state: GameState; text: string } {
  expect(
    rules.legalActions(state).some((a) => actionEquals(a, RpgAction)),
    `RpgAction ${JSON.stringify(RpgAction)} must be legal in ${state.current}`,
  ).toBe(true);
  const result = step(state, RpgAction);
  expect(result.ok, result.rejectionReason).toBe(true);
  return {
    state: result.state,
    text: result.events
      .filter((e): e is GameEvent & { type: "narration"; text: string } => e.type === "narration")
      .map((e) => e.text)
      .join(" "),
  };
}

function toPressRoom(): GameState {
  let state = initStateForRpgPack(index, 7);
  state = act(state, { type: "TAKE", item: "dark_lantern" }).state;
  state = act(state, { type: "MOVE", direction: "east" }).state;
  return act(state, { type: "MOVE", direction: "east" }).state;
}

function actionIds(state: GameState): string[] {
  return enumerateRpgActions(index, state).map((a) => a.id);
}

describe("bug_0450 -- Printer's Night proof sheet can be claimed without replacing the block objective", () => {
  it("offers taking the proof sheet and explains that the type-block is still required", () => {
    let state = toPressRoom();
    expect(actionIds(state)).toContain("take_pamphlet_proof");

    const taken = act(state, { type: "TAKE", item: "pamphlet_proof" });
    state = taken.state;

    expect(state.inventory).toContain("pamphlet_proof");
    expect(state.flags["proof_sheet_taken"]).toBe(true);
    expect(state.flags["block_taken"]).toBeUndefined();
    expect(state.vars["score"] ?? 0).toBe(0);
    expect(taken.text).toContain("will not stop the run by itself");
    expect(taken.text).toContain("forme in the chase");

    const obs = buildRpgObservation(index, state);
    expect(obs.description).toContain("proof sheet is gone from the bench");
    expect(obs.description).toContain("type-block that can print it again");
    expect(actionIds(state)).toContain("take_type_block");
  });

  it("does not let the proof sheet substitute for the type-block at the lane exit", () => {
    let state = toPressRoom();
    state = act(state, { type: "TAKE", item: "pamphlet_proof" }).state;
    state = act(state, { type: "MOVE", direction: "north" }).state;

    const obs = buildRpgObservation(index, state);
    expect(obs.room).toBe("back_court");
    expect(obs.exits.map((e) => e.direction)).not.toContain("east");
    expect(obs.blocked_exits.find((e) => e.direction === "east")?.message).toContain(
      "type-block is still in the press room",
    );
  });

  it("reading the proof before taking the block no longer claims the block is already in hand", () => {
    let state = toPressRoom();
    state = act(state, { type: "READ", target: "pamphlet_proof" }).state;

    const proof = pack.objects.find((o) => o.id === "pamphlet_proof")!;
    const readVariant = proof.variants?.find((v) => JSON.stringify(v.when).includes("proof_read"));
    expect(readVariant?.text).toContain("still in the chase until you lift it");

    const obs = buildRpgObservation(index, state);
    expect(obs.visible_objects.map((o) => o.id)).toContain("pamphlet_proof");
    expect(actionIds(state)).toContain("take_type_block");
    expect(actionIds(state)).toContain("take_pamphlet_proof");
  });

  it("the pack remains valid under the RPG validator", () => {
    const report = validateRpg(pack);
    expect(report.findings.filter((f) => f.severity === "error")).toEqual([]);
    expect(report.ok).toBe(true);
  });
});
