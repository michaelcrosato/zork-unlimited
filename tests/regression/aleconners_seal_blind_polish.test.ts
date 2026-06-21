/**
 * Regression for bug_0357 -- blind-playtest polish for The Ale-Conner's Seal.
 * A fresh MCP-only blind player found the pack mechanically sound but flagged the
 * finding table as reachable before any evidence and under-explained for partial
 * evidence states. The fix gates the table until the player has at least one note,
 * signposts partial/retest/full-finding states, and lets Sabel react after the
 * tally/well evidence starts cornering her.
 */
import { describe, expect, it } from "vitest";
import { loadPackFile } from "../../src/cyoa/pack.js";
import { indexPack, buildRules, initStateForPack } from "../../src/cyoa/runner.js";
import { buildObservation } from "../../src/cyoa/observation.js";
import { makeStep } from "../../src/core/engine.js";
import type { Action } from "../../src/api/types.js";

const loaded = loadPackFile("content/cyoa/pack/aleconners_seal.yaml");
if (!loaded.ok) throw new Error("aleconners_seal pack must compile");
const index = indexPack(loaded.compiled.pack);
const rules = buildRules(index);
const choose = (id: string): Action => ({ type: "CHOOSE", choiceId: id });

function play(ids: string[]) {
  const step = makeStep(rules);
  let state = initStateForPack(index, 7);
  for (const id of ids) state = step(state, choose(id)).state;
  return state;
}

const obs = (ids: string[]) => buildObservation(index, play(ids));
const actionIds = (ids: string[]) => obs(ids).available_actions.map((a) => a.id);

describe("bug_0357 -- Ale-Conner's Seal blind polish", () => {
  it("does not offer the finding table before the player has any evidence", () => {
    expect(actionIds([])).not.toContain("go_finding");
    expect(obs([]).text).toMatch(/test what your notes can support/i);
  });

  it("unlocks the finding table after the first evidence note and signposts an underprepared case", () => {
    const stall = obs(["read_complaints"]);
    expect(stall.available_actions.map((a) => a.id)).toContain("go_finding");
    expect(stall.available_actions.find((a) => a.id === "go_finding")?.text).toMatch(
      /review your notes/i,
    );

    const table = obs(["read_complaints", "go_finding"]);
    expect(table.text).toMatch(/only fragments/i);
    expect(table.text).toMatch(/return to the market/i);
    expect(table.available_actions.map((a) => a.id)).toEqual(["pass_seal", "back_to_market"]);
    expect(table.available_actions[1]?.text).toMatch(/assay stall/i);
  });

  it("explains retesting as a partial corrective outcome before the full chain is proven", () => {
    const table = obs([
      "inspect_seal",
      "go_brewhouse",
      "taste_cask",
      "return_to_stall",
      "go_finding",
    ]);

    expect(table.text).toMatch(/enough to stop the sale/i);
    expect(table.text).toMatch(/Retesting would protect the buyers/i);
    expect(table.text).toMatch(/full condemnation will need the rest of the chain/i);
    expect(table.available_actions.map((a) => a.id)).toContain("order_retest");
    expect(table.available_actions.map((a) => a.id)).not.toContain("condemn_batch");
  });

  it("presents the full finding and condemnation only after all six evidence flags are gathered", () => {
    const table = obs([
      "read_complaints",
      "inspect_seal",
      "go_brewhouse",
      "question_brewster",
      "taste_cask",
      "go_cellar",
      "measure_tun",
      "return_from_cellar",
      "go_yard",
      "inspect_well",
      "return_from_yard",
      "return_to_stall",
      "go_finding",
    ]);

    expect(table.text).toMatch(/full chain/i);
    expect(table.text).toMatch(/stand even if Sabel appeals/i);
    expect(table.available_actions.map((a) => a.id)).toContain("condemn_batch");
  });

  it("lets Sabel's brew-house prose react after her tally and well-water story are exposed", () => {
    const brewHouse = obs([
      "go_brewhouse",
      "question_brewster",
      "go_yard",
      "inspect_well",
      "return_from_yard",
    ]);

    expect(brewHouse.text).toMatch(/answer has gone shorter/i);
    expect(brewHouse.text).toMatch(/well water/i);
    expect(brewHouse.text).not.toMatch(/insisting that every cask sold today was tasted/i);
  });

  it("updates cellar and well-yard prose after their evidence is discovered", () => {
    const cellar = obs(["go_brewhouse", "go_cellar", "measure_tun"]);
    expect(cellar.text).toMatch(/full market gallon short/i);
    expect(cellar.text).not.toMatch(/meant to prove honest measure/i);

    const yard = obs(["go_brewhouse", "go_yard", "inspect_well"]);
    expect(yard.text).toMatch(/opened/i);
    expect(yard.text).toMatch(/bung height/i);
    expect(yard.text).not.toMatch(/still wet around the rims/i);
  });
});
