/**
 * Regression (§15) for bug_0405 — Tidewaiter's Watch allowed an immediate
 * irregularity report whose ending asserted evidence the player had not found.
 *
 * The report ending says "seventy-two declared, eighty billed", so the choice must
 * not be offered before the manifest/bill mismatch is discovered. It also has an
 * alderman-specific paragraph that should only render after checking the harbour
 * register for the prior buried query.
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

  it("allows a discrepancy-only report without claiming the alderman prior was known", () => {
    const s = play(["go_to_quarterdeck", "examine_manifest", "return_from_quarterdeck"]);
    expect(actionIds(s)).toContain("file_report");

    const reported = choose(s, "file_report");
    const obs = buildObservation(index, reported);

    expect(obs.ended).toBe(true);
    expect(obs.ending_id).toBe("ending_reported");
    expect(obs.text).toContain("seventy-two");
    expect(obs.text).toContain("eighty billed");
    expect(obs.text).not.toContain("alderman's name was in the register once before");
    expect(obs.state.vars.score).toBe(15);
  });

  it("renders the alderman-specific report only after the register query is found", () => {
    const reported = play([
      "go_to_quarterdeck",
      "examine_manifest",
      "return_from_quarterdeck",
      "go_to_office",
      "check_records",
      "return_from_office",
      "file_report",
    ]);
    const obs = buildObservation(index, reported);

    expect(obs.ending_id).toBe("ending_reported");
    expect(obs.text).toContain("alderman's name was in the register once before");
    expect(obs.text).toContain("query that went nowhere");
    expect(obs.state.vars.score).toBe(20);
    expect(validateCyoa(pack).findings).toHaveLength(0);
  });
});
