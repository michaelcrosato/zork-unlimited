/**
 * Regression for bug_0360 -- blind-playtest polish for The Croft Inquest.
 * A fresh MCP-only blind player found the pack strong but flagged two material
 * risks: Alice Croft's false stairs account was proven false without being
 * acknowledged by the inquest, and Jack Finch's composure failure branch needed
 * explicit proof that it did not block the correct felony verdict. The fix adds
 * an optional, unscored Alice contradiction beat and pins Finch's failure branch
 * as non-blocking. Later blind review caught the rushed inquest base text
 * claiming the player had already examined and heard everything; that base text
 * is now neutral and evidence-honest.
 *
 * bug_0466 keeps the stronger inquest and felony-ending prose from naming
 * evidence the player has not actually collected.
 */
import { describe, expect, it } from "vitest";
import { loadPackFile } from "../../src/cyoa/pack.js";
import { indexPack, buildRules, initStateForPack } from "../../src/cyoa/runner.js";
import { buildObservation } from "../../src/cyoa/observation.js";
import { makeStep } from "../../src/core/engine.js";

const loaded = loadPackFile("content/cyoa/pack/croft_inquest.yaml");
if (!loaded.ok) throw new Error("croft_inquest pack must compile");
const index = indexPack(loaded.compiled.pack);
const rules = buildRules(index);
const choose = (id: string) => ({ type: "CHOOSE", choiceId: id }) as const;

function play(ids: string[], seed = 7) {
  const step = makeStep(rules);
  let state = initStateForPack(index, seed);
  for (const id of ids) state = step(state, choose(id)).state;
  return state;
}

const obs = (ids: string[], seed = 7) => buildObservation(index, play(ids, seed));
const actionIds = (ids: string[], seed = 7) => obs(ids, seed).available_actions.map((a) => a.id);

const WIDOW_AND_STAIRS = [
  "speak_widow",
  "hear_widow",
  "leave_widow",
  "examine_stairs",
  "check_scene",
  "return_to_hall",
  "speak_widow",
];

describe("bug_0360 -- Croft Inquest blind polish", () => {
  it("keeps a rushed inquest from claiming unearned investigation", () => {
    const table = obs(["convene_inquest"]);

    expect(table.text).toMatch(/record you have actually made/i);
    expect(table.text).toMatch(/record is still thin/i);
    expect(table.text).not.toMatch(/examined the body/i);
    expect(table.text).not.toMatch(/heard the witnesses/i);
    expect(table.available_actions.map((a) => a.id)).toEqual([
      "return_natural_causes",
      "return_to_examine",
    ]);
  });

  it("lets the player press Alice once her stairs account is contradicted by scene evidence", () => {
    expect(actionIds(["speak_widow", "hear_widow"])).not.toContain("press_widow_on_stairs");

    const widow = obs(WIDOW_AND_STAIRS);
    expect(widow.text).toMatch(/fall at the foot of the stairs/i);
    expect(widow.text).toMatch(/less that version can bear/i);
    expect(widow.available_actions.map((a) => a.id)).toContain("press_widow_on_stairs");

    const pressed = obs([...WIDOW_AND_STAIRS, "press_widow_on_stairs"]);
    expect(pressed.text).toMatch(/fall account has narrowed to silence/i);
    expect(pressed.text).toMatch(/will not name the supper visitor/i);
    expect(pressed.state.journal.at(-1)).toMatch(/contradiction belongs in the inquest record/i);
  });

  it("makes the inquest acknowledge Alice's contradicted account even if the player does not press her", () => {
    const table = obs([
      "speak_widow",
      "hear_widow",
      "leave_widow",
      "examine_stairs",
      "check_scene",
      "return_to_hall",
      "convene_inquest",
    ]);

    expect(table.text).toMatch(/account of a fall on the stairs/i);
    expect(table.text).toMatch(/dry treads/i);
    expect(table.text).toMatch(/blood under the counting-room desk/i);
    expect(table.text).toMatch(/why her story cannot govern it/i);
  });

  it("uses the stronger inquest text after Alice has been pressed", () => {
    const table = obs([
      ...WIDOW_AND_STAIRS,
      "press_widow_on_stairs",
      "leave_widow",
      "speak_apprentice",
      "hear_apprentice",
      "leave_apprentice",
      "convene_inquest",
    ]);

    expect(table.text).toMatch(/account has been pressed/i);
    expect(table.text).toMatch(/Jack Finch placing Daniel Merton/i);
    expect(table.text).toMatch(/need not accuse the widow/i);
  });

  it("does not name Jack Finch in the pressed-widow inquest text before he has been heard", () => {
    const table = obs([
      ...WIDOW_AND_STAIRS,
      "press_widow_on_stairs",
      "leave_widow",
      "convene_inquest",
    ]);

    expect(table.text).toMatch(/account has been pressed/i);
    expect(table.text).toMatch(/blood beneath the counting-room desk/i);
    expect(table.text).not.toMatch(/Jack Finch placing Daniel Merton/i);
    expect(table.available_actions.map((a) => a.id)).not.toContain("commit_to_grand_jury");
  });

  it("keeps Jack Finch's failed composure branch non-blocking for the felony verdict", () => {
    const state = play(
      [
        "view_body",
        "examine_body",
        "leave_parlour",
        "examine_stairs",
        "check_scene",
        "return_to_hall",
        "speak_apprentice",
        "hear_apprentice",
        "leave_apprentice",
        "convene_inquest",
        "commit_to_grand_jury",
      ],
      3,
    );

    expect(state.journal.join("\n")).toMatch(/glances at the ceiling/i);
    expect(state.journal.join("\n")).toMatch(/Merton came after supper/i);
    expect(state.journal.join("\n")).toMatch(/body on the counting-room floor/i);
    expect(state.endingId).toBe("ending_committed");
  });

  it("keeps the felony ending from naming uncollected physician or debt evidence", () => {
    const end = obs([
      "view_body",
      "examine_body",
      "leave_parlour",
      "examine_stairs",
      "check_scene",
      "return_to_hall",
      "speak_apprentice",
      "hear_apprentice",
      "leave_apprentice",
      "convene_inquest",
      "commit_to_grand_jury",
    ]);

    expect(end.ending_id).toBe("ending_committed");
    expect(end.text).toMatch(/record you actually made/i);
    expect(end.text).toMatch(/wound pattern/i);
    expect(end.text).toMatch(/Jack Finch's account/i);
    expect(end.text).not.toMatch(/Dr\. Stott's note form the spine/i);
    expect(end.text).not.toMatch(/ledger entry proving the unpaid bond/i);
  });

  it("preserves the maximum-score route when the optional Alice beat is taken", () => {
    const end = obs([
      "hear_physician",
      "view_body",
      "examine_body",
      "leave_parlour",
      "examine_stairs",
      "check_scene",
      "enter_counting_room",
      "read_account_book",
      "leave_counting_room",
      "return_to_hall",
      "speak_widow",
      "hear_widow",
      "press_widow_on_stairs",
      "leave_widow",
      "speak_apprentice",
      "hear_apprentice",
      "leave_apprentice",
      "convene_inquest",
      "commit_to_grand_jury",
    ]);

    expect(end.ending_id).toBe("ending_committed");
    expect(end.text).toMatch(/Dr\. Stott's note form the spine/i);
    expect(end.text).toMatch(/ledger entry proving the unpaid bond/i);
    expect(end.state.vars.score).toBe(50);
    expect(index.pack.meta.max_score).toBe(50);
  });
});
