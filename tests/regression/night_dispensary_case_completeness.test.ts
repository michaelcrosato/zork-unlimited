/**
 * Regression for bug_0420 -- Night Dispensary let players file a valid watch
 * report before exhausting the investigation, but the counter did not explain
 * that the report was sufficient-yet-partial or point toward the remaining
 * record that unlocks the richer confrontation and 50/50 route.
 */
import { describe, expect, it } from "vitest";
import { loadPackFile } from "../../src/cyoa/pack.js";
import { indexPack, buildRules, initStateForPack } from "../../src/cyoa/runner.js";
import { buildObservation } from "../../src/cyoa/observation.js";
import { makeStep } from "../../src/core/engine.js";
import type { Action } from "../../src/api/types.js";

const loaded = loadPackFile("content/cyoa/pack/night_dispensary.yaml");
if (!loaded.ok) throw new Error("night_dispensary pack must compile");
const index = indexPack(loaded.compiled.pack);
const rules = buildRules(index);
const choose = (id: string): Action => ({ type: "CHOOSE", choiceId: id });

function play(ids: string[]) {
  const step = makeStep(rules);
  let state = initStateForPack(index, 7);
  for (const id of ids) state = step(state, choose(id)).state;
  return buildObservation(index, state);
}

const REPORT_READY_UNCONFIRMED = [
  "note_mourning_badge",
  "go_to_ledger",
  "read_ledger",
  "leave_ledger",
];

const REPORT_READY_CONFIRMED = [...REPORT_READY_UNCONFIRMED, "read_city_register"];

const CONFRONTATION_READY = [
  "note_mourning_badge",
  "question_the_warehouse",
  "go_to_ledger",
  "read_ledger",
  "leave_ledger",
  "read_city_register",
];

describe("bug_0420 -- Night Dispensary case-completeness signposting", () => {
  it("marks the early watch report as sufficient but still short of the named record", () => {
    const counter = play(REPORT_READY_UNCONFIRMED);
    const report = counter.available_actions.find((a) => a.id === "send_boy_to_watch");

    expect(counter.text).toMatch(/enough to justify sending word to the watch/i);
    expect(counter.text).toMatch(/parish-deaths notice/i);
    expect(counter.text).toMatch(/named record/i);
    expect(report?.text).toMatch(/evidence gathered so far/i);
  });

  it("after confirming the death, points to the missing warehouse lie before closing the record", () => {
    const counter = play(REPORT_READY_CONFIRMED);

    expect(counter.text).toMatch(/parish notice has put Cecilia Cole's death/i);
    expect(counter.text).toMatch(/enough to send word to the watch/i);
    expect(counter.text).toMatch(/warehouse question/i);
    expect(counter.text).toMatch(/before you close the record/i);
  });

  it("when confrontation is unlocked, says the accusation is speakable and extra clues add weight", () => {
    const counter = play(CONFRONTATION_READY);

    expect(counter.available_actions.map((a) => a.id)).toContain("speak_the_name");
    expect(counter.text).toMatch(/enough to speak the accusation aloud/i);
    expect(counter.text).toMatch(/unchecked shelf, window, or stock-room clue/i);
    expect(counter.text).toMatch(/add weight/i);
  });

  it("full investigation plus confrontation still reaches the 50-point Named ending", () => {
    const named = play([
      ...CONFRONTATION_READY,
      "go_to_storeroom",
      "check_arsenic_jar",
      "return_to_counter",
      "go_to_window",
      "watch_driver",
      "leave_window",
      "speak_the_name",
    ]);

    expect(named.ended).toBe(true);
    expect(named.ending_id).toBe("ending_confronted");
    expect(named.state.vars.score).toBe(50);
  });
});
