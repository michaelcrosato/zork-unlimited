/**
 * Regression (§15) for bug_0403 — Bellman's Round's low-confidence constable
 * report leaked Gant's name when the player reported immediately from the opening.
 *
 * A blind playtest (2026-06-21, seed 7) also found that once the full naming case
 * was assembled, the weaker report action still sat beside the direct naming action
 * with nearly duplicate copy. The early report should render only facts the player
 * can know, and it should retire once the stronger named report is available.
 */
import { describe, it, expect } from "vitest";
import { loadPackFile } from "../../src/cyoa/pack.js";
import { indexPack, buildRules, initStateForPack } from "../../src/cyoa/runner.js";
import { buildObservation } from "../../src/cyoa/observation.js";
import { makeStep } from "../../src/core/engine.js";
import { validateCyoa } from "../../src/validate/cyoa_validator.js";
import type { GameState } from "../../src/core/state.js";

const loaded = loadPackFile("content/cyoa/pack/bellmans_round.yaml");
if (!loaded.ok) throw new Error("bellmans_round must compile");
const pack = loaded.compiled.pack;
const index = indexPack(pack);
const step = makeStep(buildRules(index));

function choose(s: GameState, id: string): GameState {
  const actions = buildObservation(index, s).available_actions.map((a) => a.id);
  expect(actions, `"${id}" should be available in ${s.current}`).toContain(id);
  const result = step(s, { type: "CHOOSE", choiceId: id });
  expect(result.ok).toBe(true);
  return result.state;
}

function actionIds(s: GameState): string[] {
  return buildObservation(index, s).available_actions.map((a) => a.id);
}

describe("bug_0403 — bellmans_round constable report stays knowledge-honest", () => {
  it("does not name Gant when the bellman reports immediately from the opening", () => {
    const s = choose(initStateForPack(index, 7), "report_what_you_saw");
    const obs = buildObservation(index, s);

    expect(obs.ended).toBe(true);
    expect(obs.ending_id).toBe("ending_reported");
    expect(obs.text).toContain("no named assailant");
    expect(obs.text).not.toMatch(/\bGant\b/);
    expect(obs.state.vars.score).toBe(10);
  });

  it("keeps the low-confidence report while evidence is incomplete, but hides it once Gant can be named", () => {
    let s = initStateForPack(index, 7);

    s = choose(s, "inspect_doorway");
    s = choose(s, "go_to_counting_house");
    s = choose(s, "read_ledger");
    s = choose(s, "leave_counting_house");
    expect(actionIds(s)).toContain("report_what_you_saw");
    expect(actionIds(s)).not.toContain("name_to_constable");

    s = choose(s, "go_to_market_cross");
    s = choose(s, "ask_stallkeeper");
    s = choose(s, "leave_cross");

    const ids = actionIds(s);
    expect(ids).toContain("name_to_constable");
    expect(ids).not.toContain("report_what_you_saw");
  });

  it("uses the Gant-specific report only after documentary evidence has introduced him", () => {
    let s = initStateForPack(index, 7);
    s = choose(s, "go_to_alley");
    s = choose(s, "search_alley");
    s = choose(s, "leave_alley");
    s = choose(s, "report_what_you_saw");

    const obs = buildObservation(index, s);
    expect(obs.ending_id).toBe("ending_reported");
    expect(obs.text).toMatch(/\bGant\b/);
    expect(obs.text).toContain("had cause to carry a grudge");
    expect(validateCyoa(pack).findings).toHaveLength(0);
  });
});
