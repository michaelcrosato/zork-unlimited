/**
 * Regression for bug_0395 — Powder Mill Surety's clean safety route used an
 * epilogue written for the fight-past-Rafe route and skipped over how Rafe stopped
 * blocking the road once the charge was safe.
 */
import { describe, it, expect } from "vitest";
import { loadRpgSourceFile } from "../../src/rpg/source.js";
import { indexRpgPack, buildRpgRules, initStateForRpgPack } from "../../src/rpg/runner.js";
import { buildRpgObservation } from "../../src/rpg/observation.js";
import { makeStep, actionEquals } from "../../src/core/engine.js";
import type { RpgAction } from "../../src/api/types.js";
import type { GameEvent } from "../../src/core/events.js";
import type { Rng } from "../../src/core/rng.js";
import type { GameState } from "../../src/core/state.js";

const loaded = loadRpgSourceFile("content/rpg/quests/powder_mill_surety.yaml");
if (!loaded.ok) throw new Error("powder_mill_surety must compile");
const index = indexRpgPack(loaded.compiled.pack);

const bestRng = (): Rng => ({
  next: () => 0.999,
  int: (_min: number, max: number) => max,
});

const rules = buildRpgRules(index, bestRng);
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

function safeRoute(): { state: GameState; finalTurnText: string } {
  let state = initStateForRpgPack(index, 7);
  state = act(state, { type: "READ", target: "surety_notice" }).state;
  state = act(state, { type: "MOVE", direction: "west" }).state;
  state = act(state, { type: "READ", target: "charge_formula" }).state;
  state = act(state, { type: "MOVE", direction: "east" }).state;
  state = act(state, { type: "MOVE", direction: "east" }).state;
  state = act(state, { type: "READ", target: "fuse_chart" }).state;
  state = act(state, { type: "TAKE", item: "sand_scoop" }).state;
  state = act(state, { type: "MOVE", direction: "west" }).state;
  const final = act(state, { type: "USE", item: "sand_scoop", target: "priming_tray" });
  return { state: final.state, finalTurnText: final.text };
}

function combatRoute(): GameState {
  let state = initStateForRpgPack(index, 7);
  state = act(state, { type: "MOVE", direction: "north" }).state;
  for (let rounds = 0; !state.flags["rafe_defeated"] && rounds < 20; rounds++) {
    state = act(state, { type: "ATTACK", enemy: "rafe" }).state;
  }
  expect(state.flags["rafe_defeated"]).toBe(true);
  return act(state, { type: "MOVE", direction: "north" }).state;
}

describe("bug_0395 — Powder Mill Surety ending matches the route actually played", () => {
  it("safe smothering explains Rafe stepping aside and does not claim the gate walk broke", () => {
    const { state, finalTurnText } = safeRoute();

    expect(state.ended).toBe(true);
    expect(state.endingId).toBe("ending_mill_report");
    expect(state.flags["rafe_defeated"]).toBeUndefined();
    expect(finalTurnText).toContain("lowers the hooked staff");
    expect(finalTurnText).toContain("lets the report go north");

    const obs = buildRpgObservation(index, state);
    expect(obs.ending!.text).toContain("priming safely buried under dry sand");
    expect(obs.ending!.text).toContain("Rafe left standing on the gate walk");
    expect(obs.ending!.text).not.toContain("Rafe's broken gate walk");
  });

  it("fighting past Rafe keeps the rough-route epilogue", () => {
    const state = combatRoute();

    expect(state.ended).toBe(true);
    expect(state.endingId).toBe("ending_mill_report");
    expect(state.flags["rafe_defeated"]).toBe(true);

    const obs = buildRpgObservation(index, state);
    expect(obs.ending!.text).toContain("Rafe's broken gate walk");
    expect(obs.ending!.text).toContain("exposed priming");
    expect(obs.ending!.text).not.toContain("Rafe left standing");
  });
});
