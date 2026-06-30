/**
 * Regression (§15) for bug_0287 — *The Clockwork Heist*'s study scene used
 * "take what this page can tell you and be gone before it strikes" (ticks>=2 variant)
 * and "no still room left in which to read a stolen page" (ticks>=7 variant) even
 * after the player had taken the `read_ledger` action (has_flag: read_ledger set).
 * Both phrases presuppose the steward's ledger is unread; a player who reads the
 * ledger and then revisits the study (e.g. while circling upstairs) is still directed
 * to read a page they already consumed. Reactive-description-blindness class, same as
 * bug_0282 (watchtower mossy_brook), bug_0283 (tower_top brazier), bug_0284
 * (midnight_edition alley_door), bug_0286 (crawlspace strongbox "locked fast").
 *
 * The ticks>=4 variant ("the watch has begun to walk the gallery") describes
 * observable facts (the watch IS walking, the hour HAS come), not player-read
 * knowledge — it is state-neutral and requires no read_ledger companion.
 *
 * Fix (content, pure prose — bug_0287): two new variants added to the study scene,
 * each placed ABOVE its plain tick-tier counterpart (first-match-wins):
 *   - ticks>=7 AND has_flag:read_ledger: "its last page already turned; you have what
 *     the schedule could give you … There is nothing left in this still room for you"
 *   - ticks>=2 AND has_flag:read_ledger: "its last page already turned; the schedule it
 *     kept is yours now … you know what the chime wakes, so be gone before it rings"
 * No choice/flag/effect/item/exit/gating/ending change — prose only.
 *
 * Routes note: on_enter for study increments ticks; same-scene choices (next: study,
 * as used by read_ledger) do NOT re-fire on_enter (confirmed by clockwork_kitchen_
 * study_escalation.test.ts — "take_pick self-loops, no re-tick"). So after
 * climb_stairs(+1) → enter_study(+1=2) → read_ledger(self-loop, ticks stays 2), the
 * state is: current=study, ticks=2, read_ledger=true — exactly the ticks>=2 AND
 * read_ledger condition.
 *
 * Locked here:
 *   (1) ticks>=2, read_ledger UNSET: still shows "take what this page can tell you";
 *   (2) ticks>=2, read_ledger SET: NOT "take what this page"; shows "already turned" +
 *       "you know what the chime wakes";
 *   (3) ticks>=7, read_ledger UNSET: still shows "read a stolen page";
 *   (4) ticks>=7, read_ledger SET: NOT "read a stolen page"; shows "already turned" +
 *       "nothing left in this still room";
 *   (5) ticks>=4 (4-6 range) WITH read_ledger: the plain ticks>=4 variant fires (not a
 *       new companion) — "watch has begun to walk the gallery" is state-neutral;
 *   (6) choices: read_ledger action hidden after reading; leave_study always present;
 *       saw_plate set on every study entry;
 *   (7) reachability unchanged — all five endings still fire (prose-only edit).
 */
import { describe, it, expect } from "vitest";
import { loadPackFile } from "../../src/cyoa/pack.js";
import { indexPack, buildRules, initStateForPack } from "../../src/cyoa/runner.js";
import { buildObservation } from "../../src/cyoa/observation.js";
import { makeStep } from "../../src/core/engine.js";
import type { GameState } from "../../src/core/state.js";

const loaded = loadPackFile("content/cyoa/pack/clockwork_heist.yaml");
if (!loaded.ok) throw new Error("clockwork_heist pack must compile");
const index = indexPack(loaded.compiled.pack);
const rules = buildRules(index);
const choose = (id: string) => ({ type: "CHOOSE", choiceId: id }) as const;

function play(ids: string[]): GameState {
  const step = makeStep(rules);
  let s = initStateForPack(index, 42);
  for (const id of ids) s = step(s, choose(id)).state;
  return s;
}

const obsText = (ids: string[]) => buildObservation(index, play(ids)).text;
const optionIds = (ids: string[]) =>
  buildObservation(index, play(ids)).available_actions.map((a) => a.id);

// climb(landing+1=1) → enter_study(study+1=2) → ticks=2, read_ledger UNSET
const STUDY_T2_UNREAD = ["climb_stairs", "enter_study"];

// climb(1) → enter_study(2) → read_ledger (self-loop, no re-tick, ticks=2) → read_ledger SET
const STUDY_T2_LEDGER = ["climb_stairs", "enter_study", "read_ledger"];

// climb(1) study(2) ledger(self-loop) leave(landing+3) study(+4) leave(+5) study(+6) leave(+7) study(+8)
// → ticks=8 (>=7), read_ledger SET
const STUDY_T8_LEDGER = [
  "climb_stairs",
  "enter_study",
  "read_ledger",
  "leave_study",
  "enter_study",
  "leave_study",
  "enter_study",
  "leave_study",
  "enter_study",
];

// same loop WITHOUT reading ledger → ticks=8, read_ledger UNSET
const STUDY_T8_UNREAD = [
  "climb_stairs",
  "enter_study",
  "leave_study",
  "enter_study",
  "leave_study",
  "enter_study",
  "leave_study",
  "enter_study",
];

// climb(1) study(2) ledger(self-loop) leave(3) study(4) → ticks=4, read_ledger SET
const STUDY_T4_LEDGER = [
  "climb_stairs",
  "enter_study",
  "read_ledger",
  "leave_study",
  "enter_study",
];

// Phrases pinning each variant
const UNREAD_T2 = /take what this page can tell you/i;
const UNREAD_T7 = /no still room left in which to read a stolen page/i;
const READ_T2 = /schedule it kept is yours now|you know what the chime wakes/i;
const READ_T7 =
  /nothing left in this still room for you|only a few beats before there are no still rooms/i;
const ALREADY_TURNED = /last page already turned/i;
const STUDY_HOUR = /watch has begun to walk the gallery/i; // ticks>=4 plain variant marker

describe("bug_0287 — study scene reacts to read_ledger: stale 'take/read' prompts gone", () => {
  it("(1) ticks>=2, read_ledger UNSET: shows 'take what this page can tell you'", () => {
    const s = play(STUDY_T2_UNREAD);
    expect(s.current).toBe("study");
    expect(s.vars.ticks).toBeGreaterThanOrEqual(2);
    expect(s.flags.read_ledger).toBeFalsy();
    expect(obsText(STUDY_T2_UNREAD)).toMatch(UNREAD_T2);
    expect(obsText(STUDY_T2_UNREAD)).not.toMatch(READ_T2);
  });

  it("(2) ticks>=2, read_ledger SET: NOT 'take what this page'; shows 'already turned' + 'you know what the chime wakes'", () => {
    const s = play(STUDY_T2_LEDGER);
    expect(s.current).toBe("study");
    expect(s.vars.ticks).toBe(2);
    expect(s.flags.read_ledger).toBe(true);
    const text = obsText(STUDY_T2_LEDGER);
    expect(text).toMatch(ALREADY_TURNED);
    expect(text).toMatch(READ_T2);
    expect(text).not.toMatch(UNREAD_T2);
  });

  it("(3) ticks>=7, read_ledger UNSET: shows 'read a stolen page'", () => {
    const s = play(STUDY_T8_UNREAD);
    expect(s.current).toBe("study");
    expect(s.vars.ticks).toBeGreaterThanOrEqual(7);
    expect(s.flags.read_ledger).toBeFalsy();
    expect(obsText(STUDY_T8_UNREAD)).toMatch(UNREAD_T7);
    expect(obsText(STUDY_T8_UNREAD)).not.toMatch(READ_T7);
  });

  it("(4) ticks>=7, read_ledger SET: NOT 'read a stolen page'; shows 'already turned' + 'nothing left in this still room'", () => {
    const s = play(STUDY_T8_LEDGER);
    expect(s.current).toBe("study");
    expect(s.vars.ticks).toBeGreaterThanOrEqual(7);
    expect(s.flags.read_ledger).toBe(true);
    const text = obsText(STUDY_T8_LEDGER);
    expect(text).toMatch(ALREADY_TURNED);
    expect(text).toMatch(READ_T7);
    expect(text).not.toMatch(UNREAD_T7);
  });

  it("(5) ticks 4-6 WITH read_ledger: plain ticks>=4 variant fires (state-neutral 'watch has begun to walk')", () => {
    const s = play(STUDY_T4_LEDGER);
    expect(s.current).toBe("study");
    expect(s.vars.ticks).toBe(4);
    expect(s.flags.read_ledger).toBe(true);
    const text = obsText(STUDY_T4_LEDGER);
    expect(text).toMatch(STUDY_HOUR);
    expect(text).not.toMatch(READ_T2);
    expect(text).not.toMatch(READ_T7);
    expect(text).not.toMatch(ALREADY_TURNED);
  });

  it("(6) choices: read_ledger hidden after reading; leave_study always present; saw_plate set", () => {
    const s2unread = play(STUDY_T2_UNREAD);
    expect(optionIds(STUDY_T2_UNREAD)).toContain("read_ledger");
    expect(optionIds(STUDY_T2_UNREAD)).toContain("leave_study");
    expect(s2unread.flags.saw_plate).toBe(true);

    const s2ledger = play(STUDY_T2_LEDGER);
    expect(optionIds(STUDY_T2_LEDGER)).not.toContain("read_ledger"); // consumed
    expect(optionIds(STUDY_T2_LEDGER)).toContain("leave_study");
    expect(s2ledger.flags.saw_plate).toBe(true);
  });

  it("(7) reachability unchanged — all five endings still fire (prose-only edit)", () => {
    expect(
      play(["kitchens", "take_pick", "dumbwaiter", "approach_vault", "pick_lock", "grab_gold"])
        .endingId,
    ).toBe("ending_rich");
    expect(
      play([
        "kitchens",
        "take_pick",
        "dumbwaiter",
        "enter_study",
        "read_ledger",
        "leave_study",
        "approach_vault",
        "pick_lock",
        "take_letter",
      ]).endingId,
    ).toBe("ending_truth");
    expect(
      play(["inspect_clock", "kitchens", "take_pick", "back_foyer", "pry_panel", "open_strongbox"])
        .endingId,
    ).toBe("ending_truth");
    expect(play(["climb_stairs", "approach_vault", "force_door"]).endingId).toBe("ending_caught");
    expect(
      play([
        "kitchens",
        "take_pick",
        "dumbwaiter",
        "enter_study",
        "leave_study",
        "cross_to_vault_blind",
      ]).endingId,
    ).toBe("ending_patrol");
  });
});
