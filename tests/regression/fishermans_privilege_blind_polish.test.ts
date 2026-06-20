/**
 * Regression for bug_0366 -- blind-playtest polish for The Fisherman's Privilege.
 * A fresh MCP-only blind player found the pack strong but flagged three state-honesty
 * problems: the missing countersignature clue did not pay off, the Admiralty referral
 * gate hid the muster-roll requirement, and "dismiss without investigation" stayed
 * available after the clerk had gathered evidence. The fix makes those evidence
 * thresholds visible without changing the 50-point score economy.
 */
import { describe, expect, it } from "vitest";
import { loadPackFile } from "../../src/cyoa/pack.js";
import { indexPack, buildRules, initStateForPack } from "../../src/cyoa/runner.js";
import { buildObservation } from "../../src/cyoa/observation.js";
import { makeStep, type Rules } from "../../src/core/engine.js";
import type { Action } from "../../src/api/types.js";
import type { Rng } from "../../src/core/rng.js";

const loaded = loadPackFile("content/cyoa/pack/fishermans_privilege.yaml");
if (!loaded.ok) throw new Error("fishermans_privilege pack must compile");
const index = indexPack(loaded.compiled.pack);
const rules = buildRules(index);
const choose = (id: string): Action => ({ type: "CHOOSE", choiceId: id });

function play(ids: string[], activeRules: Rules = rules, seed = 7) {
  const step = makeStep(activeRules);
  let state = initStateForPack(index, seed);
  for (const id of ids) state = step(state, choose(id)).state;
  return state;
}

const obs = (ids: string[], activeRules: Rules = rules) =>
  buildObservation(index, play(ids, activeRules));
const actionIds = (ids: string[]) => obs(ids).available_actions.map((a) => a.id);

const forcedRoll = (roll: number) => (): Rng => ({
  next: () => 0,
  int: () => roll,
});

const DIRECT_FINDING_ROUTE = [
  "go_to_harbour",
  "check_license",
  "read_exemption_act",
  "leave_harbour",
  "go_to_wharf",
  "find_witness",
  "leave_wharf",
];

const FULL_RECORD_ROUTE = [
  "read_complaint",
  "go_to_harbour",
  "check_license",
  "read_exemption_act",
  "leave_harbour",
  "go_to_wharf",
  "find_witness",
  "leave_wharf",
  "go_to_pressing_room",
  "question_pryce",
  "check_roster",
  "leave_anchor",
];

describe("bug_0366 -- Fisherman's Privilege blind polish", () => {
  it("signposts that direct-finding evidence is not the full Admiralty referral record", () => {
    const office = obs(DIRECT_FINDING_ROUTE);

    expect(office.text).toMatch(/enough for a direct finding/i);
    expect(office.text).toMatch(/Pryce's account and the Ardent muster entry/i);
    expect(office.available_actions.map((a) => a.id)).toContain("rule_illegal");
    expect(office.available_actions.map((a) => a.id)).not.toContain("report_contested");
    expect(office.available_actions.map((a) => a.id)).not.toContain("dismiss_complaint");
  });

  it("points players who heard Pryce but skipped the roster back to the missing muster entry", () => {
    const office = obs(["go_to_pressing_room", "question_pryce", "leave_anchor"]);

    expect(office.text).toMatch(/Ardent muster entry still needs to be seen/i);
    expect(office.available_actions.map((a) => a.id)).not.toContain("report_contested");
    expect(office.available_actions.map((a) => a.id)).not.toContain("dismiss_complaint");
  });

  it("does not keep saying the muster is next after the roster has been checked", () => {
    const office = obs([
      "go_to_harbour",
      "check_license",
      "leave_harbour",
      "go_to_pressing_room",
      "question_pryce",
      "check_roster",
      "leave_anchor",
    ]);

    expect(office.text).toMatch(/Gent's ledger, Pryce's denial, and the Ardent muster/i);
    expect(office.text).toMatch(/formal complaint in the record/i);
    expect(office.text).not.toMatch(/muster roll.*next/i);
  });

  it("pays off the missing countersignature clue in Pryce's account, the roster, and endings", () => {
    const pryce = obs(["go_to_pressing_room", "question_pryce"]);
    expect(pryce.state.journal.at(-1)).toMatch(/missing magistrate's countersignature/i);

    const roster = obs(["go_to_pressing_room", "check_roster"]);
    expect(roster.state.journal.at(-1)).toMatch(/bare of any magistrate's countersignature/i);

    const contestedOffice = obs(FULL_RECORD_ROUTE);
    const referral = contestedOffice.available_actions.find((a) => a.id === "report_contested");
    expect(contestedOffice.text).toMatch(/missing countersignature/i);
    expect(referral?.text).toMatch(/warrant and muster defects/i);

    const contested = obs([...FULL_RECORD_ROUTE, "report_contested"]);
    expect(contested.text).toMatch(/without a magistrate's countersignature/i);

    const illegal = obs([...FULL_RECORD_ROUTE, "rule_illegal"]);
    expect(illegal.text).toMatch(/no magistrate's countersignature/i);
  });

  it("keeps the direct-finding steadiness failure branch convergent and max-scoring", () => {
    const failRules = buildRules(index, forcedRoll(1));
    const failed = obs([...FULL_RECORD_ROUTE, "rule_illegal"], failRules);

    expect(failed.ending_id).toBe("ending_illegal");
    expect(failed.state.vars.score).toBe(50);
    expect(failed.state.journal.at(-1)).toMatch(/hand is not entirely steady/i);
  });

  it("only offers dismissal before any investigation has begun", () => {
    expect(actionIds([])).toContain("dismiss_complaint");
    expect(actionIds(["read_complaint"])).not.toContain("dismiss_complaint");
    expect(actionIds(["go_to_harbour", "check_license", "leave_harbour"])).not.toContain(
      "dismiss_complaint",
    );
  });
});
