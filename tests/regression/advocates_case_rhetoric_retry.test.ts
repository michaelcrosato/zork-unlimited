/**
 * Regression (§15) for bug_0406 — Advocate's Case rhetoric failure promised
 * "come back when you have the sequence" but permanently removed the legal path.
 *
 * A blind MCP playtest hit the natural-1 failure after gathering every document:
 * the failure text taught the proper sequence, but the only remaining progress was
 * combat. This locks the intended recovery: a prepared player who fails the first
 * presentation can present the register-led sequence and still win legally.
 */
import { describe, it, expect } from "vitest";
import { loadRpgSourceFile } from "../../src/rpg/source.js";
import {
  indexRpgPack,
  buildRpgRules,
  initStateForRpgPack,
  enumerateRpgActions,
} from "../../src/rpg/runner.js";
import { buildRpgObservation } from "../../src/rpg/observation.js";
import { makeStep } from "../../src/core/engine.js";
import { validateRpg } from "../../src/validate/rpg_validator.js";
import type { Rng } from "../../src/core/rng.js";
import type { GameState } from "../../src/core/state.js";

const forcedRng = (roll: number): Rng => ({ int: () => roll }) as unknown as Rng;

const loaded = loadRpgSourceFile("content/rpg/quests/advocates_case.yaml");
if (!loaded.ok) throw new Error("advocates_case must compile");
const pack = loaded.compiled.pack;
const index = indexRpgPack(pack);
const step = makeStep(buildRpgRules(index, () => forcedRng(1)));

function actionIds(s: GameState): string[] {
  return enumerateRpgActions(index, s).map((o) => o.id);
}

function commandFor(s: GameState, id: string): string {
  const action = enumerateRpgActions(index, s).find((o) => o.id === id);
  if (!action) throw new Error(`Missing ${id}; available: ${actionIds(s).join(", ")}`);
  return action.command;
}

function choose(s: GameState, id: string): GameState {
  const action = enumerateRpgActions(index, s).find((o) => o.id === id);
  if (!action) throw new Error(`Missing ${id}; available: ${actionIds(s).join(", ")}`);
  const result = step(s, action.action);
  expect(result.ok).toBe(true);
  return result.state;
}

function fullyPreparedAtCaseRecord(): GameState {
  let s = initStateForRpgPack(index, 7);
  for (const id of [
    "read_charter_roll",
    "take_charter_roll",
    "go_east",
    "take_town_register",
    "read_town_register",
    "go_west",
    "go_west",
    "take_prior_convictions",
    "read_prior_convictions",
    "go_east",
    "go_north",
  ]) {
    s = choose(s, id);
  }
  return s;
}

describe("bug_0406 — advocates_case rhetoric failure has a legal recovery", () => {
  it("unlocks a corrected sequence after a failed prepared rhetoric attempt", () => {
    const failed = choose(fullyPreparedAtCaseRecord(), "use_prior_convictions_on_case_record");

    expect(failed.flags["appeal_attempted"]).toBe(true);
    expect(failed.flags["oswin_overruled"]).not.toBe(true);
    expect(actionIds(failed)).not.toContain("use_prior_convictions_on_case_record");
    expect(actionIds(failed)).toContain("use_town_register_on_case_record");
    expect(commandFor(failed, "use_town_register_on_case_record")).toMatch(
      /present town register with the charter and guild conviction records/i,
    );
  });

  it("lets the recovered legal presentation overrule Oswin and reach the full-score ending", () => {
    let s = choose(fullyPreparedAtCaseRecord(), "use_prior_convictions_on_case_record");
    s = choose(s, "use_town_register_on_case_record");

    expect(s.flags["oswin_overruled"]).toBe(true);
    expect(actionIds(s)).not.toContain("attack_craf");
    expect(buildRpgObservation(index, s).enemies_present).toHaveLength(0);

    s = choose(s, "go_north");
    const obs = buildRpgObservation(index, s);

    expect(obs.ended).toBe(true);
    expect(obs.ending_id).toBe("ending_exempted");
    expect(obs.state.vars.score).toBe(50);
    expect(obs.ending?.text).toContain("charter exemption confirmed");
    expect(obs.description).toContain("Final score: 50 of 50.");
    expect(validateRpg(pack).findings).toHaveLength(0);
  });
});
