/**
 * Regression (§15) for bug_0072 — *The Clockwork Heist*'s clockwork-deadline arc gave the
 * gallery, vault door, loot room (bug_0019/0040/0042/0043), crawlspace (bug_0064), and
 * study (bug_0068) reactive clock prose — but the `kitchen` was still clock-silent even
 * though it CHARGES a tick on entry. bug_0068 even mislabelled the study the "LAST"
 * tick-charging room without reactive prose, overlooking the kitchen. A fresh, MCP-only
 * blind playtester (seed 59, report ai-runs/2026-06-01T19-16-05-165Z/playtest.md, §5)
 * reached all four endings, rated the pack clarity 5/5 / enjoyment 4/5 with zero functional
 * bugs, and named exactly this: returning to the kitchen with the patrol already walking
 * upstairs (ticks high), the Cold Kitchen text was unchanged — "the one spot that feels
 * clock-blind."
 *
 * The fix is the same content-only `variants` treatment, now COMPOSED with the existing
 * lockpick-taken state (mirroring the foyer's found_passage × tick pairing): each tick tier
 * gets a pick-present and a pick-taken wording, first-match-wins, higher threshold first.
 * The clock is named ONLY by the manor-wide motif (the gears carrying through the walls,
 * the chime) — never by the watchman, ledger, or plate (the bug_0058 leak lesson), since a
 * player can stand in this downstairs service room having met none of them. The base `text`
 * (pick present, low tick) is UNCHANGED. No choice/effect/flag/item/exit/tick/gating/ending
 * change.
 *
 * Locked here:
 *   (1) the first kitchen visit (ticks 1, no pick) renders the unchanged base text, no clock prose;
 *   (2) taking the pick at ticks 1 swaps to the pick-taken text but still shows no clock prose;
 *   (3) a no-pick revisit at ticks >= 2 (<4) shows the grinding/tension prose, pick still present;
 *   (4) a no-pick revisit at the hour (ticks >= 4) shows the chime prose, pick still present;
 *   (5) a pick-held revisit at ticks >= 2 (<4) shows the tension prose with the pick-taken wording;
 *   (6) a pick-held revisit at the hour (ticks >= 4) shows the chime prose with the pick-taken wording;
 *   (7) no reactive variant ever leaks foreknowledge (watchman/guard/ledger/plate);
 *   (8) reachability unchanged — all four endings still fire (text-only edit).
 */
import { describe, it, expect } from "vitest";
import { loadPackFile } from "../../src/cyoa/pack.js";
import { indexPack, buildRules, initStateForPack, sceneText } from "../../src/cyoa/runner.js";
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
  let s = initStateForPack(index, 59);
  for (const id of ids) s = step(s, choose(id)).state;
  return s;
}

// First arrival in the kitchen: foyer -> kitchens (ticks 1, lockpick still on the bench).
const KITCHEN_T1_NOPICK = ["kitchens"];
// Pocket the pick on that first visit (still ticks 1; take_pick self-loops, no re-tick).
const KITCHEN_T1_PICK = ["kitchens", "take_pick"];
// No-pick revisit in the tension band: landing(1) -> foyer -> kitchen(2).
const KITCHEN_T2_NOPICK = ["climb_stairs", "back_down", "kitchens"];
// Pick-held revisit in the tension band: kitchen(1)+take -> landing(2) -> kitchen(3).
const KITCHEN_T2_PICK = [
  "kitchens",
  "take_pick",
  "back_foyer",
  "climb_stairs",
  "back_down",
  "kitchens",
];
// No-pick revisit at the hour: landing(1) -> study(2) -> landing(3) -> foyer -> kitchen(4).
const KITCHEN_T4_NOPICK = ["climb_stairs", "enter_study", "leave_study", "back_down", "kitchens"];
// Pick-held revisit at the hour: kitchen(1)+take -> landing(2) -> study(3) -> landing(4) -> kitchen(5).
const KITCHEN_T4_PICK = [
  "kitchens",
  "take_pick",
  "back_foyer",
  "climb_stairs",
  "enter_study",
  "leave_study",
  "back_down",
  "kitchens",
];

const TENSION = /great clock's working carries through the walls|grinding toward the hour/i;
const HOUR =
  /chime rolls through the manor's gears and reaches even this cold kitchen|overhead the sleeping house has begun to stir/i;
const PICK_PRESENT = /a servant has left a slim roll of lockpicks/i;
const PICK_TAKEN = /the slim roll is in your pocket now/i;
const FOREKNOWLEDGE_LEAK = /watchman|guard|ledger|brass plate|on the hour, every hour/i;

describe("bug_0072 — the clock deadline is felt in the kitchen, the last tick-charging room", () => {
  it("first kitchen visit (ticks 1, no pick) renders the unchanged base text, no clock prose", () => {
    const s = play(KITCHEN_T1_NOPICK);
    expect(s.current).toBe("kitchen");
    expect(s.vars.ticks).toBe(1);
    expect(s.inventory).not.toContain("lockpick");
    const text = buildObservation(index, s).text;
    expect(text).toMatch(PICK_PRESENT);
    expect(text).not.toMatch(TENSION);
    expect(text).not.toMatch(HOUR);
  });

  it("taking the pick at ticks 1 swaps to the pick-taken text but shows no clock prose yet", () => {
    const s = play(KITCHEN_T1_PICK);
    expect(s.current).toBe("kitchen");
    expect(s.vars.ticks).toBe(1); // take_pick self-loops; on_enter does not re-fire
    expect(s.inventory).toContain("lockpick");
    const text = buildObservation(index, s).text;
    expect(text).toMatch(PICK_TAKEN);
    expect(text).not.toMatch(TENSION);
    expect(text).not.toMatch(HOUR);
  });

  it("a no-pick revisit in the tension band (ticks 2-3) shows the grinding prose, pick still present", () => {
    const s = play(KITCHEN_T2_NOPICK);
    expect(s.current).toBe("kitchen");
    expect(s.vars.ticks).toBeGreaterThanOrEqual(2);
    expect(s.vars.ticks).toBeLessThan(4);
    expect(s.inventory).not.toContain("lockpick");
    const text = buildObservation(index, s).text;
    expect(text).toMatch(TENSION);
    expect(text).toMatch(PICK_PRESENT);
    expect(text).not.toMatch(HOUR);
  });

  it("a no-pick revisit at the hour (ticks >= 4) shows the chime prose, pick still present", () => {
    const s = play(KITCHEN_T4_NOPICK);
    expect(s.current).toBe("kitchen");
    expect(s.vars.ticks).toBeGreaterThanOrEqual(4);
    expect(s.inventory).not.toContain("lockpick");
    const text = buildObservation(index, s).text;
    expect(text).toMatch(HOUR);
    expect(text).toMatch(PICK_PRESENT);
    expect(text).not.toMatch(TENSION);
  });

  it("a pick-held revisit in the tension band shows the tension prose with the pick-taken wording", () => {
    const s = play(KITCHEN_T2_PICK);
    expect(s.current).toBe("kitchen");
    expect(s.vars.ticks).toBeGreaterThanOrEqual(2);
    expect(s.vars.ticks).toBeLessThan(4);
    expect(s.inventory).toContain("lockpick");
    const text = buildObservation(index, s).text;
    expect(text).toMatch(TENSION);
    expect(text).toMatch(PICK_TAKEN);
    expect(text).not.toMatch(HOUR);
  });

  it("a pick-held revisit at the hour shows the chime prose with the pick-taken wording", () => {
    const s = play(KITCHEN_T4_PICK);
    expect(s.current).toBe("kitchen");
    expect(s.vars.ticks).toBeGreaterThanOrEqual(4);
    expect(s.inventory).toContain("lockpick");
    const text = buildObservation(index, s).text;
    expect(text).toMatch(HOUR);
    expect(text).toMatch(PICK_TAKEN);
    expect(text).not.toMatch(TENSION);
  });

  it("no kitchen variant leaks foreknowledge the entrant may lack (bug_0058 lesson)", () => {
    for (const route of [KITCHEN_T2_NOPICK, KITCHEN_T2_PICK, KITCHEN_T4_NOPICK, KITCHEN_T4_PICK]) {
      const text = buildObservation(index, play(route)).text;
      expect(text).not.toMatch(FOREKNOWLEDGE_LEAK);
    }
  });

  it("the base text is unchanged — names the lockpicks, no clock prose at ticks 0", () => {
    const kitchen = index.pack.scenes.find((sc) => sc.id === "kitchen")!;
    expect(kitchen.text.toLowerCase()).toContain("a servant has left a slim roll of lockpicks");
    // A synthetic fresh state (ticks 0, no pick) falls through to the base text.
    const fresh = initStateForPack(index, 59);
    expect(fresh.vars.ticks).toBe(0);
    const rendered = sceneText(kitchen, fresh);
    expect(rendered).toBe(kitchen.text);
    expect(rendered).not.toMatch(TENSION);
    expect(rendered).not.toMatch(HOUR);
  });

  it("reachability unchanged — all four endings still fire (text-only edit)", () => {
    expect(
      play(["kitchens", "take_pick", "dumbwaiter", "approach_vault", "pick_lock", "grab_gold"])
        .endingId,
    ).toBe("ending_rich");
    expect(
      play(["kitchens", "take_pick", "dumbwaiter", "approach_vault", "pick_lock", "take_letter"])
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
