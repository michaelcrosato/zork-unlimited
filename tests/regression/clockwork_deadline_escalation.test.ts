/**
 * Regression (§15) for bug_0082 — *The Clockwork Heist*'s overstay deadline had a
 * missing middle. bug_0079 gave the namesake clock real teeth (meta.deadline:
 * linger to ticks >= 10 and `ending_overstayed` fires), but every room's reactive
 * prose topped out at the ticks >= 4 "the hour has come round" tier, so a lingering
 * player saw the SAME chime line at ticks 4 through 9 and then died at 10 with no
 * mounting dread. A fresh blind MCP playtester (seed 13, report
 * ai-runs/2026-06-01T21-46-13-894Z/playtest.md, §5) caught it precisely: the
 * warning prose "plateaus after the chime at tick 4 and stops escalating," so the
 * urgency "overpromises relative to what the clock mechanically enforces ... a
 * player can't tell how close the real deadline is."
 *
 * The fix is content-only: a ticks >= 7 escalation tier in the two scenes that
 * cover every tick-accruing loop a lingering player can take — the foyer (the
 * namesake-clock hub, the only entrance to the kitchen tick-source) and the gallery
 * (the patrolled danger room, the only entrance to the study tick-source). Both
 * escalate from the lone watchman of the hour toward the ticks >= 10 ending's
 * whole-house waking ("the watchman's tread no longer alone but answered now by
 * others"). The gallery's read_ledger split is preserved exactly as at ticks >= 4
 * (reader keeps the ledger callback and the solved time-it-in-his-wake framing; the
 * non-reader keeps the "right under his beam" gamble and is never told of a ledger
 * he didn't read). No choice/flag/tick/gate/ending change.
 *
 * Locked here:
 *   (1) the foyer shows the chime tier at ticks 4-6 and the NEW escalation at ticks
 *       7-9, while still carrying an on-the-hour watchman cue (the bug_0020 invariant);
 *   (2) the gallery non-reader shows the patrol tier at ticks 4-6 and the NEW
 *       escalation at ticks 7-9, keeping the "right under his beam" gamble framing and
 *       never naming the ledger (the bug_0066 invariant), with choices unchanged;
 *   (3) the gallery reader's escalation keeps the ledger callback and drops "right
 *       under his beam" (the bug_0066/bug_0067 invariant), still offering the safe
 *       crossing and not the blind gamble;
 *   (4) the escalation does NOT fire the ending early — a ticks-7 dawdle is still
 *       playable — and the deadline still bites at ticks >= 10 (ending_overstayed);
 *   (5) reachability is unchanged — all five endings still fire (text-only edit).
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
  let s = initStateForPack(index, 13);
  for (const id of ids) s = step(s, choose(id)).state;
  return s;
}
const sceneText = (s: GameState): string => buildObservation(index, s).text;
const optionIds = (s: GameState): string[] =>
  buildObservation(index, s).available_actions.map((a) => a.id);

// ticks advance only on a real room change; oscillate study <-> gallery to climb.
//   climb(1) study(2) landing(3) study(4) landing(5) -> back_down to foyer @ t5
const FOYER_T5 = [
  "climb_stairs",
  "enter_study",
  "leave_study",
  "enter_study",
  "leave_study",
  "back_down",
];
//   ...study(6) landing(7) -> back_down to foyer @ t7
const FOYER_T7 = [
  "climb_stairs",
  "enter_study",
  "leave_study",
  "enter_study",
  "leave_study",
  "enter_study",
  "leave_study",
  "back_down",
];
// Gallery, no ledger read.
const GALLERY_T5 = ["climb_stairs", "enter_study", "leave_study", "enter_study", "leave_study"];
const GALLERY_T7 = [...GALLERY_T5, "enter_study", "leave_study"];
// Gallery at the same high tick, but with the ledger read on the first study visit.
const READER_GALLERY_T7 = [
  "climb_stairs",
  "enter_study",
  "read_ledger",
  "leave_study",
  "enter_study",
  "leave_study",
  "enter_study",
  "leave_study",
];
// Aimless circling all the way to the deadline.
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

// The chime tier (ticks 4-6) names the hour coming round / having chimed.
const CHIME = /come round to the hour|the hour has chimed/i;
// The escalation tier (ticks 7-9): the house rousing in earnest, time nearly out.
const ESCALATION = /lingered too long|fully awake|waking in earnest|few beats? (?:more|left)/i;
// An on-the-hour watchman cue must remain (the bug_0020 / bug_0019 invariants).
const WATCHMAN = /watchman/i;

describe("bug_0082 — the overstay deadline escalates before it bites (ticks>=7 tier)", () => {
  it("foyer: chime tier at ticks 4-6, the NEW escalation at ticks 7-9, watchman cue kept throughout", () => {
    const t5 = play(FOYER_T5);
    expect(t5.current).toBe("foyer");
    expect(t5.vars.ticks).toBe(5);
    const t5text = sceneText(t5);
    expect(t5text).toMatch(CHIME);
    expect(t5text).not.toMatch(ESCALATION);

    const t7 = play(FOYER_T7);
    expect(t7.current).toBe("foyer");
    expect(t7.vars.ticks).toBe(7);
    const t7text = sceneText(t7);
    expect(t7text).toMatch(ESCALATION);
    expect(t7text).toMatch(WATCHMAN); // still an honest on-the-hour cue (bug_0020)
    expect(t7text).not.toBe(t5text); // the plateau is broken — prose moved on
  });

  it("gallery non-reader: patrol tier at ticks 4-6, the NEW escalation at ticks 7-9, gamble framing + choices unchanged", () => {
    const t5 = play(GALLERY_T5);
    expect(t5.current).toBe("landing");
    expect(t5.vars.ticks).toBe(5);
    expect(sceneText(t5)).not.toMatch(ESCALATION);

    const t7 = play(GALLERY_T7);
    expect(t7.current).toBe("landing");
    expect(t7.vars.ticks).toBe(7);
    expect(t7.flags.read_ledger).toBeFalsy();
    const text = sceneText(t7);
    expect(text).toMatch(ESCALATION);
    expect(text).toMatch(WATCHMAN);
    expect(/right under his beam/i.test(text)).toBe(true); // gamble framing preserved
    expect(/ledger/i.test(text)).toBe(false); // no foreknowledge leak (bug_0066)
    expect(text).not.toBe(sceneText(t5)); // plateau broken
    // Choices are untouched: the blind gamble and the safe exits remain.
    const ids = optionIds(t7);
    expect(ids).toContain("cross_to_vault_blind");
    expect(ids).not.toContain("approach_vault");
    expect(ids).toContain("enter_study");
    expect(ids).toContain("back_down");
  });

  it("gallery reader: escalation keeps the ledger callback, drops 'right under his beam', offers the safe crossing", () => {
    const s = play(READER_GALLERY_T7);
    expect(s.current).toBe("landing");
    expect(s.vars.ticks).toBe(7);
    expect(s.flags.read_ledger).toBe(true);
    const text = sceneText(s);
    expect(text).toMatch(ESCALATION);
    expect(
      /his rounds by heart|just as the ledger swore|the steward's ledger warned of/i.test(text),
    ).toBe(true);
    expect(/right under his beam/i.test(text)).toBe(false); // reader's crossing is solved, not live danger (bug_0067)
    const ids = optionIds(s);
    expect(ids).toContain("approach_vault");
    expect(ids).not.toContain("cross_to_vault_blind");
  });

  it("the escalation does not end the game early, but the deadline still bites at ticks >= 10", () => {
    const t7 = play(GALLERY_T7);
    expect(t7.ended).toBe(false);
    expect(t7.vars.ticks).toBe(7);

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
    expect(play([...GALLERY_T7, "cross_to_vault_blind"]).endingId).toBe("ending_patrol");
    expect(play(OVERSTAY).endingId).toBe("ending_overstayed");
  });
});
