/**
 * Regression (§15) for the RPG-only author → validate → revise loop.
 *
 * This file used to pin the temporary parser authoring adapter. The project now has
 * one public authoring target: RPG packs validated by `validateRpg`. Keep the valuable
 * regression shape from the old file — first-round validator rejection, convergence,
 * beat classification, and engine playability — but route it through the single
 * adapter that remains.
 */
import { describe, it, expect } from "vitest";
import * as adapterModule from "../../agents/authoring/adapter.js";
import { MockAuthorProvider } from "../../agents/authoring/mock_author.js";
import { loadEngineContract, runWriter } from "../../agents/authoring/writer.js";
import { runRpgAdapter } from "../../agents/authoring/adapter.js";
import type { RpgAction } from "../../src/api/types.js";
import { actionEquals, makeStep } from "../../src/core/engine.js";
import type { Rng } from "../../src/core/rng.js";
import type { GameState } from "../../src/core/state.js";
import {
  buildRpgRules,
  enumerateRpgActions,
  indexRpgPack,
  initStateForRpgPack,
  type RpgIndex,
} from "../../src/rpg/runner.js";
import { ATTACK_VAR, DEFENSE_VAR, HP_VAR } from "../../src/rpg/schema.js";
import { validateRpg } from "../../src/validate/rpg_validator.js";

const provider = new MockAuthorProvider();
const contract = loadEngineContract();
const PREMISE = "A keeper must relight a dead lighthouse before a ship wrecks.";

const bestRng = (): Rng => ({
  next: () => 0.999999,
  int: (_min: number, max: number) => max,
});

function legalAction(index: RpgIndex, state: GameState, action: RpgAction): RpgAction {
  const option = enumerateRpgActions(index, state).find((o) => actionEquals(o.action, action));
  if (!option) throw new Error(`Expected legal RPG action ${JSON.stringify(action)}`);
  return option.action;
}

describe("RPG-only authoring loop (§12.2–3, §13 Stage 4)", () => {
  it("the RPG validator rejects the first attempt with ENEMY_DEATH_ENDING_UNDECLARED", async () => {
    const story = await runWriter(provider, { premise: PREMISE, contract });
    const first = await runRpgAdapter(provider, { story, contract, maxRounds: 1 });
    expect(first.ok).toBe(false);
    expect(first.rounds).toBe(1);
    expect(
      first.report.findings.filter((f) => f.severity === "error").map((f) => f.code),
    ).toContain("ENEMY_DEATH_ENDING_UNDECLARED");
  });

  it("loops against validateRpg and converges to a GREEN pack", async () => {
    const story = await runWriter(provider, { premise: PREMISE, contract });
    const result = await runRpgAdapter(provider, { story, contract });
    expect(result.ok).toBe(true);
    expect(result.report.ok).toBe(true);
    expect(result.rounds).toBeGreaterThanOrEqual(2);
    expect(validateRpg(result.pack).ok).toBe(true);
    expect(result.pack.enemies.length).toBeGreaterThanOrEqual(1);
    for (const stat of [HP_VAR, ATTACK_VAR, DEFENSE_VAR]) {
      expect(result.pack.meta.vars_init[stat]).toBeGreaterThan(0);
    }
  });

  it("classifies every beat against the §11 adaptation labels", async () => {
    const story = await runWriter(provider, { premise: PREMISE, contract });
    const result = await runRpgAdapter(provider, { story, contract });
    const beatIds = story.beats.map((b) => b.id).sort();
    expect(result.classifications.map((c) => c.beat_id).sort()).toEqual(beatIds);
  });

  it("the authored RPG pack is playable to its win through the engine", async () => {
    const story = await runWriter(provider, { premise: PREMISE, contract });
    const { pack } = await runRpgAdapter(provider, { story, contract });
    const index = indexRpgPack(pack);
    const step = makeStep(buildRpgRules(index, () => bestRng()));
    let state = initStateForRpgPack(index, 1);

    for (const action of [
      { type: "TAKE", item: "iron_spike" },
      { type: "MOVE", direction: "north" },
      { type: "ATTACK", enemy: "storm_wight" },
      { type: "ATTACK", enemy: "storm_wight" },
      { type: "MOVE", direction: "up" },
      { type: "USE", item: "iron_spike", target: "lamp" },
    ] satisfies RpgAction[]) {
      const result = step(state, legalAction(index, state, action));
      expect(result.ok, JSON.stringify(action)).toBe(true);
      state = result.state;
    }

    expect(state.flags["wight_banished"]).toBe(true);
    expect(state.flags["lamp_freed"]).toBe(true);
    expect(state.ended).toBe(true);
    expect(state.endingId).toBe("ending_saved");
  });

  it("does not re-export legacy CYOA or parser adapter entry points", () => {
    const exports = adapterModule as Record<string, unknown>;
    expect(exports.runRpgAdapter).toBeTypeOf("function");
    expect(exports.runAdapter).toBeUndefined();
    expect(exports.runParserAdapter).toBeUndefined();
  });
});
