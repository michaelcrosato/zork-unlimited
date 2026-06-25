/**
 * Regression for bug_0359 -- blind-playtest polish for The Bread Assize.
 * A fresh MCP-only blind player found the pack mechanically sound but flagged
 * report-table discoverability: weighing before reading the assize table hit an
 * invisible wall, partial evidence states did not say what was missing, and the
 * full suspension threshold was only explained after taking the lesser ending.
 * Later blind review caught the market-hall hub still listing completed
 * investigation branches as missing. The fix keeps verdict gates unchanged and
 * makes the current proof state visible before the player commits.
 *
 * bug_0465 covers the remaining stale side-branch states: completed factor and
 * parish inquiries now read as resolved, and exhausted hub actions retire.
 */
import { describe, expect, it } from "vitest";
import { loadPackFile } from "../../src/cyoa/pack.js";
import { indexPack, buildRules, initStateForPack } from "../../src/cyoa/runner.js";
import { buildObservation } from "../../src/cyoa/observation.js";
import { makeStep } from "../../src/core/engine.js";
import type { Action } from "../../src/api/types.js";

const loaded = loadPackFile("content/cyoa/pack/bread_assize.yaml");
if (!loaded.ok) throw new Error("bread_assize pack must compile");
const index = indexPack(loaded.compiled.pack);
const rules = buildRules(index);
const choose = (id: string): Action => ({ type: "CHOOSE", choiceId: id });

function play(ids: string[], seed = 7) {
  const step = makeStep(rules);
  let state = initStateForPack(index, seed);
  for (const id of ids) state = step(state, choose(id)).state;
  return state;
}

const obs = (ids: string[], seed = 7) => buildObservation(index, play(ids, seed));
const actionIds = (ids: string[]) => obs(ids).available_actions.map((a) => a.id);

describe("bug_0359 -- Bread Assize blind polish", () => {
  it("explains why weighing before reading the assize table is not enough for a fine", () => {
    const hall = obs(["weigh_market_loaves"]);
    expect(hall.text).toMatch(/assize schedule still lies unread/i);
    expect(hall.text).toMatch(/no legal comparison/i);

    const table = obs(["weigh_market_loaves", "go_report_table"]);
    expect(table.text).toMatch(/lacks the week's lawful weight/i);
    expect(table.text).toMatch(/no legal comparison for a fine/i);
    expect(table.available_actions.map((a) => a.id)).not.toContain("fine_on_weight");
    expect(table.available_actions.find((a) => a.id === "return_to_hall")?.text).toMatch(
      /complete the record/i,
    );
  });

  it("signposts that assize plus short weight supports a fine but not seal suspension", () => {
    const table = obs(["read_assize_table", "weigh_market_loaves", "go_report_table"]);

    expect(table.text).toMatch(/enough for a short-weight fine/i);
    expect(table.text).toMatch(/not enough to suspend the seal/i);
    expect(table.text).toMatch(/bakehouse proof/i);
    expect(table.text).toMatch(/Crowe's seal sequence/i);
    expect(table.text).toMatch(/factor ledger/i);
    expect(table.text).toMatch(/parish token trail/i);
    expect(table.available_actions.map((a) => a.id)).toContain("fine_on_weight");
    expect(table.available_actions.map((a) => a.id)).not.toContain("suspend_bread_seal");
  });

  it("drops completed investigation branches from the market-hall missing-proof text", () => {
    const afterBakehouse = obs([
      "read_assize_table",
      "weigh_market_loaves",
      "go_bakehouse",
      "inspect_oven_marks",
      "question_baker",
      "return_from_bakehouse",
    ]);

    expect(afterBakehouse.text).toMatch(/factor ledger and parish queue/i);
    expect(afterBakehouse.text).not.toMatch(/rest of the chain from bakehouse/i);
    expect(afterBakehouse.text).not.toMatch(/still needs the.*bakehouse/i);

    const afterBakehouseAndFactor = obs([
      "read_assize_table",
      "weigh_market_loaves",
      "go_bakehouse",
      "inspect_oven_marks",
      "question_baker",
      "return_from_bakehouse",
      "go_factor_book",
      "compare_flour_tally",
      "return_from_factor",
    ]);

    expect(afterBakehouseAndFactor.text).toMatch(/still needs\s+the parish queue/i);
    expect(afterBakehouseAndFactor.text).not.toMatch(/still needs.*factor/i);
    expect(afterBakehouseAndFactor.text).not.toMatch(/still needs.*bakehouse/i);
  });

  it("keeps near-complete evidence from looking complete until the parish token trail is found", () => {
    const table = obs([
      "read_assize_table",
      "weigh_market_loaves",
      "go_bakehouse",
      "inspect_oven_marks",
      "question_baker",
      "return_from_bakehouse",
      "go_factor_book",
      "compare_flour_tally",
      "return_from_factor",
      "go_report_table",
    ]);

    expect(table.text).toMatch(/not enough to suspend the seal/i);
    expect(table.text).toMatch(/parish token trail/i);
    expect(table.available_actions.map((a) => a.id)).toContain("fine_on_weight");
    expect(table.available_actions.map((a) => a.id)).not.toContain("suspend_bread_seal");
  });

  it("names the full chain and offers suspension after all evidence is collected", () => {
    const table = obs([
      "read_assize_table",
      "weigh_market_loaves",
      "go_bakehouse",
      "inspect_oven_marks",
      "question_baker",
      "return_from_bakehouse",
      "go_factor_book",
      "compare_flour_tally",
      "return_from_factor",
      "go_parish_queue",
      "hear_parish_queue",
      "return_from_queue",
      "go_report_table",
    ]);

    expect(table.text).toMatch(/full chain/i);
    expect(table.text).toMatch(/lawful weight/i);
    expect(table.text).toMatch(/parish tokens diverted/i);
    expect(table.text).toMatch(/suspension finding can stand/i);
    expect(table.available_actions.map((a) => a.id)).toContain("suspend_bread_seal");
  });

  it("updates Crowe's bakehouse posture after he admits the false seal sequence", () => {
    const bakehouse = obs(["go_bakehouse", "question_baker"]);

    expect(bakehouse.text).toMatch(/no longer crowds the sealed baskets/i);
    expect(bakehouse.text).toMatch(/admitting the seal was struck before weighing/i);
    expect(bakehouse.text).not.toMatch(/stands too close/i);
  });

  it("updates factor and parish side rooms after their evidence is gathered", () => {
    const factor = obs(["go_factor_book", "compare_flour_tally"]);
    expect(factor.text).toMatch(/ledger match/i);
    expect(factor.text).toMatch(/flour-shortage defense is gone/i);
    expect(factor.text).not.toMatch(/will either support/i);

    const parish = obs(["go_parish_queue", "hear_parish_queue"]);
    expect(parish.text).toMatch(/queue has named the harm plainly/i);
    expect(parish.text).toMatch(/seven missing loaves/i);
    expect(parish.text).not.toMatch(/what the market scale does not show/i);
  });

  it("retires exhausted side-investigation actions from the market hall", () => {
    const afterBakehouse = actionIds([
      "go_bakehouse",
      "inspect_oven_marks",
      "question_baker",
      "return_from_bakehouse",
    ]);
    expect(afterBakehouse).not.toContain("go_bakehouse");
    expect(afterBakehouse).toContain("go_factor_book");
    expect(afterBakehouse).toContain("go_parish_queue");

    const afterFactor = actionIds(["go_factor_book", "compare_flour_tally", "return_from_factor"]);
    expect(afterFactor).not.toContain("go_factor_book");
    expect(afterFactor).toContain("go_bakehouse");
    expect(afterFactor).toContain("go_parish_queue");

    const allSideBranches = actionIds([
      "go_bakehouse",
      "inspect_oven_marks",
      "question_baker",
      "return_from_bakehouse",
      "go_factor_book",
      "compare_flour_tally",
      "return_from_factor",
      "go_parish_queue",
      "hear_parish_queue",
      "return_from_queue",
    ]);
    expect(allSideBranches).not.toContain("go_bakehouse");
    expect(allSideBranches).not.toContain("go_factor_book");
    expect(allSideBranches).not.toContain("go_parish_queue");
    expect(allSideBranches).toContain("go_report_table");
  });

  it("leaves the existing full-win route and maximum score intact", () => {
    const end = obs([
      "read_assize_table",
      "weigh_market_loaves",
      "go_bakehouse",
      "inspect_oven_marks",
      "question_baker",
      "return_from_bakehouse",
      "go_factor_book",
      "compare_flour_tally",
      "return_from_factor",
      "go_parish_queue",
      "hear_parish_queue",
      "return_from_queue",
      "go_report_table",
      "suspend_bread_seal",
    ]);

    expect(end.ending_id).toBe("ending_suspended");
    expect(end.state.vars.score).toBe(50);
    expect(index.pack.meta.max_score).toBe(50);
  });

  it("does not unlock the fine or suspension verdicts earlier than before", () => {
    expect(actionIds([])).not.toContain("fine_on_weight");
    expect(actionIds(["read_assize_table", "go_report_table"])).not.toContain("fine_on_weight");
    expect(actionIds(["weigh_market_loaves", "go_report_table"])).not.toContain("fine_on_weight");
    expect(
      actionIds(["read_assize_table", "weigh_market_loaves", "go_report_table"]),
    ).not.toContain("suspend_bread_seal");
  });
});
