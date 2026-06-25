/**
 * Regression for bug_0363 -- blind-playtest polish for The Surveyor's Round.
 * A fresh MCP-only blind player found the pack mechanically sound but flagged
 * stale office prose after partial measurements, quest-stage resets on every
 * office return, and an under-signposted final steadiness check. The fix keeps
 * the evidence gates and score economy intact while making survey state honest.
 *
 * bug_0469: a later blind pass noted that exhausted evidence rooms stayed in
 * the office action list even when they only contained a return action. The
 * navigation now retires fully searched side rooms while leaving partially
 * searched rooms reachable.
 */
import { describe, expect, it } from "vitest";
import { loadPackFile } from "../../src/cyoa/pack.js";
import { indexPack, buildRules, initStateForPack } from "../../src/cyoa/runner.js";
import { buildObservation } from "../../src/cyoa/observation.js";
import { makeStep, type Rules } from "../../src/core/engine.js";
import type { Action } from "../../src/api/types.js";
import type { Rng } from "../../src/core/rng.js";

const loaded = loadPackFile("content/cyoa/pack/excise_surveyors_round.yaml");
if (!loaded.ok) throw new Error("excise_surveyors_round pack must compile");
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

const fullEvidenceRoute = [
  "check_declarations",
  "go_to_malting_floor",
  "survey_grain",
  "leave_malting",
  "go_to_cellar",
  "measure_tun",
  "test_wort",
  "leave_cellar",
  "go_to_yard_gate",
  "invoke_right",
  "count_tubs",
  "find_tally",
  "leave_yard",
];

const forcedRoll = (roll: number) => (): Rng => ({
  next: () => 0,
  int: () => roll,
});

describe("bug_0363 -- Surveyor's Round blind polish", () => {
  it("keeps the no-measurement close only before contrary evidence exists", () => {
    expect(actionIds(["check_declarations"])).toContain("accept_declared_figures");

    const office = obs([
      "check_declarations",
      "go_to_malting_floor",
      "survey_grain",
      "leave_malting",
    ]);
    expect(office.text).toMatch(/begun to check it against the premises/i);
    expect(office.text).toMatch(/clean acceptance impossible/i);
    expect(office.text).not.toMatch(/yet to measure whether they are honest/i);
    expect(office.available_actions.map((a) => a.id)).not.toContain("accept_declared_figures");
  });

  it("advances the survey quest stage on evidence instead of resetting on office return", () => {
    expect(play(["check_declarations"]).questStage.the_survey).toBe("declarations_checked");
    expect(
      play(["check_declarations", "go_to_malting_floor", "survey_grain", "leave_malting"])
        .questStage.the_survey,
    ).toBe("measurements_underway");
    expect(play(fullEvidenceRoute).questStage.the_survey).toBe("concealment_case_built");
  });

  it("keeps cellar prose honest if the player tests wort before measuring the tuns", () => {
    const cellar = obs(["go_to_cellar", "test_wort"]);

    expect(cellar.text).toMatch(/gravity reading is in your notebook/i);
    expect(cellar.text).toMatch(/tuns themselves still want measuring/i);
    expect(cellar.text).not.toMatch(/gravity of the wort still wants testing/i);
  });

  it("keeps yard prose honest if the tally is found before the tubs are measured", () => {
    const yard = obs(["go_to_yard_gate", "invoke_right", "find_tally"]);

    expect(yard.text).toMatch(/XIIII is cut into the beam/i);
    expect(yard.text).toMatch(/fourteen batches/i);
    expect(yard.text).toMatch(/tubs beneath still need measuring/i);
    expect(yard.text).not.toMatch(/No excise licence plates are mounted anywhere/i);
  });

  it("signposts the final steadiness check and keeps failure convergent", () => {
    const office = obs(fullEvidenceRoute);
    const concealment = office.available_actions.find((a) => a.id === "file_concealment_report");

    expect(office.text).toMatch(/steady hand/i);
    expect(concealment?.text).toMatch(/Steady yourself/i);
    expect(concealment?.skill_check).toEqual({
      skill: "steadiness",
      difficulty: 11,
      die: "d20",
    });

    const failRules = buildRules(index, forcedRoll(1));
    const failedCheck = obs([...fullEvidenceRoute, "file_concealment_report"], failRules);
    expect(failedCheck.ending_id).toBe("ending_concealment");
    expect(failedCheck.state.vars.score).toBe(50);
    expect(failedCheck.state.journal.at(-1)).toMatch(/first line is not entirely smooth/i);
    expect(
      play([...fullEvidenceRoute, "file_concealment_report"], failRules).questStage.the_survey,
    ).toBe("concealment_report_filed");
  });

  it("retires fully searched evidence rooms without hiding unfinished rooms", () => {
    expect(actionIds(["go_to_malting_floor", "survey_grain", "leave_malting"])).not.toContain(
      "go_to_malting_floor",
    );

    expect(actionIds(["go_to_cellar", "measure_tun", "leave_cellar"])).toContain("go_to_cellar");
    expect(actionIds(["go_to_cellar", "measure_tun", "test_wort", "leave_cellar"])).not.toContain(
      "go_to_cellar",
    );

    expect(actionIds(["go_to_yard_gate", "invoke_right", "count_tubs", "leave_yard"])).toContain(
      "go_to_yard_outbuildings",
    );
    expect(
      actionIds(["go_to_yard_gate", "invoke_right", "count_tubs", "find_tally", "leave_yard"]),
    ).not.toContain("go_to_yard_outbuildings");
  });
});
