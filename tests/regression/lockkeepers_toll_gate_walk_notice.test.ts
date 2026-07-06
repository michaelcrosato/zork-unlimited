/**
 * Regression for bug_0394 — Lock-Keeper's Toll's gate walk felt empty on the
 * peaceful route and did not surface the risk of rushing the sluice-chain check.
 */
import { describe, it, expect } from "vitest";
import { loadRpgSourceFile } from "../../src/rpg/source.js";
import { indexRpgPack, buildRpgRules, initStateForRpgPack } from "../../src/rpg/runner.js";
import { buildRpgObservation } from "../../src/rpg/observation.js";
import { makeStep, actionEquals } from "../../src/core/engine.js";
import type { RpgAction } from "../../src/api/types.js";
import type { GameEvent } from "../../src/core/events.js";
import type { GameState } from "../../src/core/state.js";

const loaded = loadRpgSourceFile("content/rpg/pack/lockkeepers_toll.yaml");
if (!loaded.ok) throw new Error("lockkeepers_toll must compile");
const index = indexRpgPack(loaded.compiled.pack);
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

describe("bug_0394 — Lock-Keeper's Toll gate walk has a readable risk cue", () => {
  it("offers a toll notice on the non-combat gate walk instead of only Marrick", () => {
    let state = initStateForRpgPack(index, 7);
    state = act(state, { type: "MOVE", direction: "north" }).state;

    const obs = buildRpgObservation(index, state);
    expect(obs.description).toContain("tariff notice");
    expect(obs.visible_objects.map((o) => o.id)).toContain("toll_notice");
    expect(obs.available_actions.map((a) => a.id)).toContain("examine_toll_notice");
    expect(obs.available_actions.map((a) => a.id)).toContain("read_toll_notice");
    expect(obs.available_actions.map((a) => a.id)).toContain("attack_marrick");
  });

  it("reading the notice warns that rushed chain work can lock or snap the chain", () => {
    let state = initStateForRpgPack(index, 7);
    state = act(state, { type: "MOVE", direction: "north" }).state;

    const read = act(state, { type: "READ", target: "toll_notice" });

    expect(read.text).toContain("staged turns");
    expect(read.text).toContain("rushed pull");
    expect(read.text).toContain("lock the chain or snap it");
    expect(read.state.vars.score ?? 0).toBe(0);
  });
});
