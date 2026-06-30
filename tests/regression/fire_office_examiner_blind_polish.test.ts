/**
 * Regression for bug_0365 -- blind-playtest polish for The Fire Office Examiner.
 * A fresh MCP-only blind player found the pack mechanically sound but flagged
 * that the warehouse could imply the investigation was complete while Varley
 * was still uninterviewed, and that Varley's own contradictory claim earned no
 * score or final-report weight. The fix makes Varley's account part of the
 * full criminal referral chain.
 *
 * Regression for bug_0471 -- a later blind pass found submission affordances
 * could invite a zero-evidence report, pointless returns to exhausted evidence
 * rooms, and editorially loaded full-file payment wording.
 */
import { describe, expect, it } from "vitest";
import { loadPackFile } from "../../src/cyoa/pack.js";
import { indexPack, buildRules, initStateForPack } from "../../src/cyoa/runner.js";
import { buildObservation } from "../../src/cyoa/observation.js";
import { makeStep } from "../../src/core/engine.js";

const loaded = loadPackFile("content/cyoa/pack/fire_office_examiner.yaml");
if (!loaded.ok) throw new Error("fire_office_examiner pack must compile");
const index = indexPack(loaded.compiled.pack);
const rules = buildRules(index);
const choose = (id: string) => ({ type: "CHOOSE", choiceId: id }) as const;

function play(ids: string[], seed = 7) {
  const step = makeStep(rules);
  let state = initStateForPack(index, seed);
  for (const id of ids) state = step(state, choose(id)).state;
  return state;
}

const obs = (ids: string[]) => buildObservation(index, play(ids));

const COMPLETE_EXCEPT_VARLEY = [
  "read_claim_documents",
  "check_debt_instruments",
  "proceed_to_site",
  "question_thomas",
  "enter_ruins",
  "examine_burn_origin",
  "leave_ruins",
  "check_yard",
  "check_yard_tracks",
  "leave_yard",
  "find_cook",
  "question_hannah",
  "leave_cook",
];

const FULL_CHAIN = [...COMPLETE_EXCEPT_VARLEY, "speak_varley"];

describe("bug_0365 -- Fire Office Examiner blind polish", () => {
  it("does not offer a zero-evidence report on first arrival at the ruins", () => {
    const warehouse = obs(["proceed_to_site"]);
    const actions = warehouse.available_actions.map((a) => a.id);

    expect(actions).not.toContain("submit_report");
    expect(actions).toEqual(
      expect.arrayContaining([
        "speak_varley",
        "enter_ruins",
        "check_yard",
        "question_thomas",
        "find_cook",
      ]),
    );
  });

  it("offers report filing once the examiner has at least one finding", () => {
    const warehouse = obs(["read_claim_documents", "proceed_to_site"]);

    expect(warehouse.available_actions.map((a) => a.id)).toContain("submit_report");
  });

  it("does not call the warehouse investigation complete while Varley is still pending", () => {
    const warehouse = obs(COMPLETE_EXCEPT_VARLEY);

    expect(warehouse.text).toMatch(/Varley himself still waits/i);
    expect(warehouse.text).toMatch(/claimant's own story/i);
    expect(warehouse.text).not.toMatch(/last stop/i);
    expect(warehouse.available_actions.map((a) => a.id)).toContain("speak_varley");
  });

  it("retires exhausted evidence side rooms once their findings are collected", () => {
    const warehouse = obs(FULL_CHAIN);
    const actions = warehouse.available_actions.map((a) => a.id);

    expect(actions).not.toContain("enter_ruins");
    expect(actions).not.toContain("check_yard");
    expect(actions).not.toContain("find_cook");
    expect(actions).toContain("submit_report");
  });

  it("scores Varley's oral claim mismatch as real evidence", () => {
    const warehouse = obs(["proceed_to_site", "speak_varley"]);

    expect(warehouse.state.flags).toContain("heard_varley");
    expect(warehouse.state.vars.score).toBe(5);
    expect(warehouse.state.journal.at(-1)).toMatch(/oral list does not match the paper/i);
  });

  it("keeps criminal referral unavailable until Varley's account completes the chain", () => {
    const desk = obs([...COMPLETE_EXCEPT_VARLEY, "submit_report"]);

    expect(desk.text).toMatch(/criminal referral needs the fuller chain/i);
    expect(desk.text).toMatch(/Varley's own account/i);
    expect(desk.available_actions.map((a) => a.id)).toContain("dispute_claim");
    expect(desk.available_actions.map((a) => a.id)).not.toContain("refer_to_law");
  });

  it("offers criminal referral with full submission prose after all seven evidence flags", () => {
    const desk = obs([...FULL_CHAIN, "submit_report"]);
    const referral = desk.available_actions.find((a) => a.id === "refer_to_law");

    expect(desk.text).toMatch(/file is complete/i);
    expect(desk.text).toMatch(/overfull oral loss list/i);
    expect(referral?.text).toMatch(/documentary, physical, and testimonial chain/i);
  });

  it("does not call payment evidence-inconclusive after the full fraud chain is complete", () => {
    const desk = obs([...FULL_CHAIN, "submit_report"]);

    expect(desk.available_actions.map((a) => a.id)).not.toContain("approve_claim");
    expect(desk.available_actions.map((a) => a.id)).not.toContain("back_to_investigate");
    const badPayment = desk.available_actions.find((a) => a.id === "approve_claim_against_file");
    expect(badPayment?.text).toMatch(/treat the file as insufficient/i);
    expect(badPayment?.text).not.toMatch(/completed fraud evidence/i);

    const end = obs([...FULL_CHAIN, "submit_report", "approve_claim_against_file"]);
    expect(end.ending_id).toBe("ending_approved");
    expect(end.text).toMatch(/your own file had already proved false/i);
  });

  it("leaves the full prosecution ending reachable with the new maximum score", () => {
    const end = obs([...FULL_CHAIN, "submit_report", "refer_to_law"]);

    expect(end.ending_id).toBe("ending_referred");
    expect(end.text).toMatch(/oral loss list swelling beyond the written claim/i);
    expect(end.state.vars.score).toBe(55);
    expect(index.pack.meta.max_score).toBe(55);
  });
});
