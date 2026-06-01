/**
 * Regression (§15) for bug_0084 — *The Clockwork Heist*'s deadline-escalation arc had a
 * twin gap. bug_0082 gave the FOYER and GALLERY a ticks >= 7 escalation tier so a lingering
 * player SEES the deadline mount on every loop (they re-read one of those two hubs each
 * circuit) — but it argued the kitchen and study didn't need it. That is true for warning
 * VISIBILITY and false for IN-ROOM continuity: the kitchen and study are themselves
 * tick-charging rooms a circling player stands in at ticks 7-9, yet their own prose plateaued
 * at the ticks >= 4 tier. A fresh, MCP-only blind playtester (seed 31, report
 * ai-runs/2026-06-01T22-19-03-485Z/playtest.md, §5) stood IN the kitchen at ticks 9 and saw
 * it revert to the ticks >= 4 "the sleeping house has begun to stir" line — "the same line
 * shown at ticks 5" — while the foyer/gallery read "waking in earnest." The study is the
 * structural twin (the other remaining tick-source room) with the identical gap.
 *
 * The fix is content-only: a ticks >= 7 escalation tier on the kitchen (composed with the
 * existing lockpick-present/taken pairing) and on the study, escalating each toward the
 * ticks >= 10 ending's whole-house waking. The kitchen keeps the bug_0072 constraint (named
 * only by the manor-wide motif + the house overhead, NEVER the watchman/ledger/plate); the
 * study keeps the bug_0068 constraint (named by the gears/chime + the visible open ledger
 * page, and naming "the watch" is sound there). New variants sit above the ticks >= 4 tier
 * (first-match-wins, higher threshold first). No choice/flag/tick/gate/ending change.
 *
 * Locked here:
 *   (1) the kitchen shows the bug_0072 chime tier at ticks 4-6 and the NEW escalation at
 *       ticks >= 7, in both the pick-present and pick-taken wordings, never leaking the
 *       watchman/ledger/plate (the bug_0072/bug_0058 invariant);
 *   (2) the study shows the bug_0068 hour tier at ticks 4-6 and the NEW escalation at
 *       ticks >= 7, still naming the open ledger page (the load-bearing clue) and still
 *       offering read_ledger / leave_study with saw_plate set;
 *   (3) the escalation does NOT end the game early, and the deadline still bites at
 *       ticks >= 10 (ending_overstayed);
 *   (4) reachability is unchanged — all five endings still fire (text-only edit).
 */
import { describe, it, expect } from "vitest";
import { loadPackFile } from "../../src/cyoa/pack.js";
import { indexPack, buildRules, initStateForPack } from "../../src/cyoa/runner.js";
import { buildObservation } from "../../src/cyoa/observation.js";
import { makeStep } from "../../src/core/engine.js";
import type { Action } from "../../src/api/types.js";
import type { GameState } from "../../src/core/state.js";

const loaded = loadPackFile("content/cyoa/pack/clockwork_heist.yaml");
if (!loaded.ok) throw new Error("clockwork_heist pack must compile");
const index = indexPack(loaded.compiled.pack);
const rules = buildRules(index);
const choose = (id: string): Action => ({ type: "CHOOSE", choiceId: id });

function play(ids: string[]): GameState {
  const step = makeStep(rules);
  let s = initStateForPack(index, 31);
  for (const id of ids) s = step(s, choose(id)).state;
  return s;
}
const sceneText = (s: GameState): string => buildObservation(index, s).text;
const optionIds = (s: GameState): string[] =>
  buildObservation(index, s).available_actions.map((a) => a.id);

// ---- routes (ticks advance only on a real room change into kitchen/landing/study) ----
// Kitchen at ticks 4 (bug_0072 chime tier): landing(1) study(2) landing(3) -> foyer -> kitchen(4).
const KITCHEN_T4 = ["climb_stairs", "enter_study", "leave_study", "back_down", "kitchens"];
// Kitchen at ticks 7, NO pick: kitchen(1) -> foyer -> landing(2) study(3) landing(4) study(5)
// landing(6) -> foyer -> kitchen(7).
const KITCHEN_T7_NOPICK = [
  "kitchens",
  "back_foyer",
  "climb_stairs",
  "enter_study",
  "leave_study",
  "enter_study",
  "leave_study",
  "back_down",
  "kitchens",
];
// Same, but pocket the pick on the first kitchen visit (take_pick self-loops, no re-tick).
const KITCHEN_T7_PICK = [
  "kitchens",
  "take_pick",
  "back_foyer",
  "climb_stairs",
  "enter_study",
  "leave_study",
  "enter_study",
  "leave_study",
  "back_down",
  "kitchens",
];
// Study at ticks 4 (bug_0068 hour tier): climb(1) study(2) landing(3) study(4).
const STUDY_T4 = ["climb_stairs", "enter_study", "leave_study", "enter_study"];
// Study at ticks 8 (>= 7 escalation): oscillate study<->landing; study lands on even ticks.
const STUDY_T8 = [
  "climb_stairs",
  "enter_study",
  "leave_study",
  "enter_study",
  "leave_study",
  "enter_study",
  "leave_study",
  "enter_study",
];
// Aimless circling to the deadline.
const OVERSTAY = [
  "climb_stairs",
  "enter_study",
  "leave_study",
  "enter_study",
  "leave_study",
  "enter_study",
  "leave_study",
  "enter_study",
  "leave_study",
  "enter_study",
];

// The new ticks >= 7 escalation vocabulary (shared by foyer/gallery/kitchen/study).
const ESCALATION =
  /waking in earnest|few beats? left|whole house stands fully awake|no still room left/i;
// The bug_0072 kitchen chime tier (ticks 4-6).
const KITCHEN_HOUR = /overhead the sleeping house has begun to stir/i;
// The bug_0068 study hour tier (ticks 4-6).
const STUDY_HOUR = /the watch has begun to walk the gallery/i;
const PICK_PRESENT = /a servant has left a slim roll of lockpicks/i;
const PICK_TAKEN = /the slim roll is in your pocket now/i;
// The kitchen must never name the watchman/ledger/plate (bug_0072 / bug_0058 leak lesson).
const KITCHEN_LEAK = /watchman|guard|ledger|brass plate|on the hour, every hour/i;
const LEDGER_PAGE = /when the watch walks its rounds/i; // the study's load-bearing clue

describe("bug_0084 — the deadline escalation reaches the kitchen and study (ticks>=7 tier)", () => {
  it("kitchen: chime tier at ticks 4-6, the NEW escalation at ticks >= 7 (pick present)", () => {
    const t4 = play(KITCHEN_T4);
    expect(t4.current).toBe("kitchen");
    expect(t4.vars.ticks).toBe(4);
    expect(sceneText(t4)).toMatch(KITCHEN_HOUR);
    expect(sceneText(t4)).not.toMatch(ESCALATION);

    const t7 = play(KITCHEN_T7_NOPICK);
    expect(t7.current).toBe("kitchen");
    expect(t7.vars.ticks).toBe(7);
    expect(t7.inventory).not.toContain("lockpick");
    const text = sceneText(t7);
    expect(text).toMatch(ESCALATION);
    expect(text).toMatch(PICK_PRESENT);
    expect(text).not.toMatch(KITCHEN_HOUR); // the plateau is broken — prose moved on
    expect(text).not.toMatch(KITCHEN_LEAK); // no foreknowledge leak (bug_0072/bug_0058)
  });

  it("kitchen: the NEW escalation at ticks >= 7 keeps the pick-taken wording", () => {
    const t7 = play(KITCHEN_T7_PICK);
    expect(t7.current).toBe("kitchen");
    expect(t7.vars.ticks).toBe(7);
    expect(t7.inventory).toContain("lockpick");
    const text = sceneText(t7);
    expect(text).toMatch(ESCALATION);
    expect(text).toMatch(PICK_TAKEN);
    expect(text).not.toMatch(KITCHEN_LEAK);
  });

  it("study: hour tier at ticks 4-6, the NEW escalation at ticks >= 7, ledger clue + mechanics intact", () => {
    const t4 = play(STUDY_T4);
    expect(t4.current).toBe("study");
    expect(t4.vars.ticks).toBe(4);
    expect(sceneText(t4)).toMatch(STUDY_HOUR);
    expect(sceneText(t4)).not.toMatch(ESCALATION);

    const t8 = play(STUDY_T8);
    expect(t8.current).toBe("study");
    expect(t8.vars.ticks).toBeGreaterThanOrEqual(7);
    const text = sceneText(t8);
    expect(text).toMatch(ESCALATION);
    expect(text).not.toMatch(STUDY_HOUR); // plateau broken
    expect(text).toMatch(LEDGER_PAGE); // load-bearing clue retained
    expect(t8.flags.saw_plate).toBe(true); // set on every study entry (bug_0058)
    const ids = optionIds(t8);
    expect(ids).toContain("read_ledger");
    expect(ids).toContain("leave_study");
  });

  it("the escalation does not end the game early, but the deadline still bites at ticks >= 10", () => {
    const t7 = play(KITCHEN_T7_NOPICK);
    expect(t7.ended).toBe(false);
    const over = play(OVERSTAY);
    expect(over.ended).toBe(true);
    expect(over.endingId).toBe("ending_overstayed");
    expect(over.vars.ticks).toBeGreaterThanOrEqual(10);
  });

  it("reachability unchanged — all five endings still fire (text-only edit)", () => {
    expect(
      play(["kitchens", "take_pick", "dumbwaiter", "approach_vault", "pick_lock", "grab_gold"])
        .endingId,
    ).toBe("ending_rich");
    expect(
      play(["inspect_clock", "kitchens", "take_pick", "back_foyer", "pry_panel", "open_strongbox"])
        .endingId,
    ).toBe("ending_truth");
    expect(play(["climb_stairs", "approach_vault", "force_door"]).endingId).toBe("ending_caught");
    expect(
      play([
        "climb_stairs",
        "enter_study",
        "leave_study",
        "enter_study",
        "leave_study",
        "cross_to_vault_blind",
      ]).endingId,
    ).toBe("ending_patrol");
    expect(play(OVERSTAY).endingId).toBe("ending_overstayed");
  });
});
