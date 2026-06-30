/**
 * Regression for bug_0362 -- blind-playtest polish for The Examiner's Commission.
 * A fresh MCP-only blind player found the pack mechanically sound but flagged
 * the finding table as reachable before any evidence, the full-trial label as
 * a checklist spoiler, and partial evidence states as under-explained. The fix
 * keeps verdict gates intact while making the current record state visible.
 *
 * bug_0468: a later blind pass singled out the Henry deposition failure branch
 * as the only serious risk: if a bad composure roll withheld
 * heard_henry_discrepancy, the best finding would become random-loss gated.
 * The pack intends that roll as tension only, so a forced failed roll must still
 * award the same evidence flag, score, and criminal-trial route.
 */
import { describe, expect, it } from "vitest";
import { loadPackFile } from "../../src/cyoa/pack.js";
import { indexPack, buildRules, initStateForPack } from "../../src/cyoa/runner.js";
import { buildObservation } from "../../src/cyoa/observation.js";
import { makeStep } from "../../src/core/engine.js";
import type { Rng } from "../../src/core/rng.js";

const loaded = loadPackFile("content/cyoa/pack/examiners_commission.yaml");
if (!loaded.ok) throw new Error("examiners_commission pack must compile");
const index = indexPack(loaded.compiled.pack);
const rules = buildRules(index);
const choose = (id: string) => ({ type: "CHOOSE", choiceId: id }) as const;
const forcedRng = (roll: number): Rng => ({ int: () => roll }) as unknown as Rng;

function play(ids: string[], seed = 7, activeRules = rules) {
  const step = makeStep(activeRules);
  let state = initStateForPack(index, seed);
  for (const id of ids) state = step(state, choose(id)).state;
  return state;
}

const obs = (ids: string[], seed = 7) => buildObservation(index, play(ids, seed));
const actionIds = (ids: string[]) => obs(ids).available_actions.map((a) => a.id);

const FULL_RECORD_TO_DEPOSITION = [
  "examine_paper",
  "examine_ink",
  "go_witness_records",
  "check_witnesses",
  "compare_letters",
  "return_from_records",
  "go_solicitor",
  "speak_solicitor",
  "leave_solicitor",
  "go_deposition",
];

const TRIAL_ROUTE_AFTER_DEPOSITION = ["leave_deposition", "go_finding", "refer_to_trial"];

describe("bug_0362 -- Examiner's Commission blind polish", () => {
  it("does not offer the finding table before the player has any evidence", () => {
    expect(actionIds([])).not.toContain("go_finding");
    expect(obs([]).text).toMatch(/once your notes can support a finding/i);
    expect(obs([]).available_actions.find((a) => a.id === "go_witness_records")?.text).toMatch(
      /correspondence/i,
    );
  });

  it("unlocks the finding table after one evidence note and explains a fragmentary record", () => {
    expect(actionIds(["examine_paper"])).toContain("go_finding");

    const table = obs(["examine_paper", "go_finding"]);
    expect(table.text).toMatch(/only fragments/i);
    expect(table.text).toMatch(/complete the record/i);
    expect(table.available_actions.map((a) => a.id)).toEqual([
      "certify_genuine",
      "return_undecided",
      "reconsider_finding",
    ]);
    expect(table.available_actions[2]?.text).toMatch(/complete the record/i);
  });

  it("keeps the registry hub honest after only one clue", () => {
    const hub = obs(["examine_paper"]);
    expect(hub.text).toMatch(/at least one ground of suspicion/i);
    expect(hub.text).toMatch(/inquiries you have actually completed/i);
    expect(hub.text).not.toMatch(/witness records, correspondence, solicitor evidence/i);
    expect(hub.text).not.toMatch(/Henry Alderton's own account/i);
  });

  it("signposts material rejection before the full criminal-trial chain is complete", () => {
    const table = obs([
      "examine_paper",
      "go_witness_records",
      "check_witnesses",
      "return_from_records",
      "go_finding",
    ]);

    expect(table.text).toMatch(/enough for a material rejection/i);
    expect(table.text).toMatch(/A criminal referral will be stronger/i);
    expect(table.available_actions.map((a) => a.id)).toContain("reject_on_material");
    expect(table.available_actions.map((a) => a.id)).not.toContain("refer_to_trial");
    expect(table.text).not.toMatch(/paper, ink, witness, correspondence, solicitor, deposition/i);
  });

  it("uses a non-spoiler trial label when the complete chain is proven", () => {
    const table = obs([
      "examine_paper",
      "examine_ink",
      "go_witness_records",
      "check_witnesses",
      "compare_letters",
      "return_from_records",
      "go_solicitor",
      "speak_solicitor",
      "leave_solicitor",
      "go_deposition",
      "examine_henry",
      "leave_deposition",
      "go_finding",
    ]);

    const trial = table.available_actions.find((a) => a.id === "refer_to_trial");
    expect(table.text).toMatch(/complete chain/i);
    expect(trial?.text).toBe("Refer the forgery for criminal trial.");
    expect(trial?.text).not.toMatch(/paper, ink, witness, correspondence, solicitor, deposition/i);
  });

  it("leaves the existing full criminal-trial route and maximum score intact", () => {
    const end = obs([
      ...FULL_RECORD_TO_DEPOSITION,
      "examine_henry",
      ...TRIAL_ROUTE_AFTER_DEPOSITION,
    ]);

    expect(end.ending_id).toBe("ending_trial");
    expect(end.state.vars.score).toBe(50);
    expect(index.pack.meta.max_score).toBe(50);
  });

  it("bug_0468: a failed Henry composure roll still supports the criminal-trial route", () => {
    const failureRules = buildRules(index, () => forcedRng(1));
    const afterFailure = play([...FULL_RECORD_TO_DEPOSITION, "examine_henry"], 7, failureRules);

    expect(afterFailure.flags.heard_henry_discrepancy).toBe(true);
    expect(afterFailure.vars.score).toBe(30);
    expect(afterFailure.journal.at(-1)).toMatch(/discrepancy speaks for itself/i);

    const table = buildObservation(
      index,
      play(
        [...FULL_RECORD_TO_DEPOSITION, "examine_henry", "leave_deposition", "go_finding"],
        7,
        failureRules,
      ),
    );
    expect(table.available_actions.map((a) => a.id)).toContain("refer_to_trial");

    const end = buildObservation(
      index,
      play(
        [...FULL_RECORD_TO_DEPOSITION, "examine_henry", ...TRIAL_ROUTE_AFTER_DEPOSITION],
        7,
        failureRules,
      ),
    );
    expect(end.ending_id).toBe("ending_trial");
    expect(end.state.vars.score).toBe(50);
  });
});
