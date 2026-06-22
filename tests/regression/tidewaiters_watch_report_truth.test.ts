/**
 * Regression (§15) for bug_0405 — Tidewaiter's Watch allowed an immediate
 * irregularity report whose ending asserted evidence the player had not found.
 *
 * The report ending says "seventy-two declared, eighty billed", so the choice must
 * not be offered before the manifest/bill mismatch is discovered. It also has an
 * alderman-specific paragraph that should only render after checking the harbour
 * register for the prior buried query.
 *
 * bug_0459 tightened this further: a fresh blind playtest showed the partial
 * report still felt like a trap when it appeared before the player could learn
 * the alderman channel was compromised. The report action now waits for both the
 * discrepancy and the prior buried query.
 */
import { describe, it, expect } from "vitest";
import { loadPackFile } from "../../src/cyoa/pack.js";
import { indexPack, buildRules, initStateForPack } from "../../src/cyoa/runner.js";
import { buildObservation } from "../../src/cyoa/observation.js";
import { makeStep } from "../../src/core/engine.js";
import { validateCyoa } from "../../src/validate/cyoa_validator.js";
import type { GameState } from "../../src/core/state.js";

const loaded = loadPackFile("content/cyoa/pack/tidewaiters_watch.yaml");
if (!loaded.ok) throw new Error("tidewaiters_watch must compile");
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

function play(ids: string[]): GameState {
  let s = initStateForPack(index, 7);
  for (const id of ids) s = choose(s, id);
  return s;
}

function actionIds(s: GameState): string[] {
  return buildObservation(index, s).available_actions.map((a) => a.id);
}

describe("bug_0405 — tidewaiters_watch report stays knowledge-honest", () => {
  it("does not offer file_report before the manifest discrepancy is found", () => {
    expect(actionIds(initStateForPack(index, 7))).not.toContain("file_report");
  });

  it("does not offer file_report after the discrepancy alone, before the alderman prior is known", () => {
    const s = play(["go_to_quarterdeck", "examine_manifest", "return_from_quarterdeck"]);
    expect(actionIds(s)).not.toContain("file_report");
    expect(actionIds(s)).not.toContain("seal_the_cargo");
  });

  it("offers an explicitly compromised report only after the register query is found", () => {
    const ready = play([
      "go_to_quarterdeck",
      "examine_manifest",
      "return_from_quarterdeck",
      "go_to_office",
      "check_records",
      "return_from_office",
    ]);
    const actions = buildObservation(index, ready).available_actions;
    expect(actions.find((a) => a.id === "file_report")?.text).toMatch(/buried alderman query/i);

    const reported = choose(ready, "file_report");
    const obs = buildObservation(index, reported);

    expect(obs.ending_id).toBe("ending_reported");
    expect(obs.text).toContain("alderman's name was in the register once before");
    expect(obs.text).toContain("query that went nowhere");
    expect(obs.state.vars.score).toBe(20);
    expect(validateCyoa(pack).findings).toHaveLength(0);
  });
});
