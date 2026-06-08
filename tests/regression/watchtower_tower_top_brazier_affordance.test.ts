/**
 * Regression (§15) for bug_0283 — *The Watchtower Road*'s tower_top scene showed
 * "A cold brazier waits, begging for a flame" even when the player had no lantern,
 * making the brazier read as an available affordance while light_beacon was invisible
 * (gated on has_item: lantern). False affordance — same reactive-description-blindness
 * class as bug_0120/bug_0134/bug_0282.
 *
 * A blind playtester (seed 42, ai-runs/2026-06-08T04-04-29-865Z/playtest.md §4) noted
 * the mismatch: "the scene is describing an interactable object the player cannot
 * interact with" when visiting the tower top before finding the lantern.
 *
 * The fix adds a not_item: lantern variant (ordered after raised_alarm, before the base)
 * that shows a neutral description. The "begging for a flame" base now only renders when
 * the player holds the lantern but has not yet lit the beacon — the right moment.
 *
 * This test locks:
 * (1) Without lantern: neutral "dark and empty" text shows; "begging for a flame" absent.
 * (2) With lantern, no alarm: "begging for a flame" base shows; neutral text absent.
 * (3) With raised_alarm: blazing beacon variant shows (existing behavior preserved).
 * (4) Cosmetic only: tower_top choices are unchanged; the beacon route still works.
 */
import { describe, it, expect } from "vitest";
import { loadPackFile } from "../../src/cyoa/pack.js";
import { indexPack, buildRules, initStateForPack } from "../../src/cyoa/runner.js";
import { buildObservation } from "../../src/cyoa/observation.js";
import { makeStep } from "../../src/core/engine.js";
import type { Action } from "../../src/api/types.js";

const loaded = loadPackFile("content/cyoa/pack/watchtower_road.yaml");
if (!loaded.ok) throw new Error("watchtower pack must compile");
const index = indexPack(loaded.compiled.pack);
const rules = buildRules(index);
const choose = (id: string): Action => ({ type: "CHOOSE", choiceId: id });

function play(ids: string[], seed = 7) {
  const step = makeStep(rules);
  let s = initStateForPack(index, seed);
  for (const id of ids) s = step(s, choose(id)).state;
  return s;
}
const obs = (s: ReturnType<typeof play>) => buildObservation(index, s);

// Reach tower_top WITHOUT the lantern.
const TOP_NO_LANTERN = ["go_east", "approach_base", "climb_stairs", "continue_up"];

// Reach tower_top WITH the lantern but without lighting the beacon.
const TOP_WITH_LANTERN = [
  "go_east",
  "approach_base",
  "search_rubble",
  "take_lantern",
  "leave_cart",
  "climb_stairs",
  "continue_up",
];

// Reach tower_top AFTER lighting the beacon (raised_alarm set).
const TOP_AFTER_ALARM = [...TOP_WITH_LANTERN, "light_beacon", "back_to_top"];

const INVITE = "begging for a flame"; // the false-affordance invite text
const NEUTRAL = "dark and empty"; // the lantern-absent neutral form
const BLAZING = "still blazes"; // the raised_alarm variant text

describe("bug_0283 — tower_top brazier shows false affordance without lantern", () => {
  it("without lantern: neutral 'dark and empty' brazier text shows, 'begging for a flame' absent", () => {
    const s = play(TOP_NO_LANTERN);
    expect(s.current).toBe("tower_top");
    expect(s.inventory).not.toContain("lantern");
    expect(s.flags["raised_alarm"]).not.toBe(true);
    const text = obs(s).text.toLowerCase();
    expect(text).toContain(NEUTRAL);
    expect(text).not.toContain(INVITE);
  });

  it("with lantern (no alarm): 'begging for a flame' base shows; neutral text absent", () => {
    const s = play(TOP_WITH_LANTERN);
    expect(s.current).toBe("tower_top");
    expect(s.inventory).toContain("lantern");
    expect(s.flags["raised_alarm"]).not.toBe(true);
    const text = obs(s).text.toLowerCase();
    expect(text).toContain(INVITE);
    expect(text).not.toContain(NEUTRAL);
  });

  it("after lighting beacon: blazing variant shows; neither invite nor neutral text present", () => {
    const s = play(TOP_AFTER_ALARM);
    expect(s.current).toBe("tower_top");
    expect(s.flags["raised_alarm"]).toBe(true);
    const text = obs(s).text.toLowerCase();
    expect(text).toContain(BLAZING);
    expect(text).not.toContain(INVITE);
    expect(text).not.toContain(NEUTRAL);
  });

  it("cosmetic only: tower_top choices unchanged; beacon route still reaches ending_escape", () => {
    const s = play(TOP_WITH_LANTERN);
    const actions = obs(s).available_actions.map((a) => a.id);
    expect(actions).toContain("light_beacon");
    expect(actions).toContain("survey_road");
    expect(actions).toContain("descend");

    // Full beacon route: light → decision_point → slip_away → ending_escape.
    const final = play([...TOP_WITH_LANTERN, "light_beacon", "watch_for_help", "slip_away"]);
    expect(final.ended).toBe(true);
    expect(final.endingId).toBe("ending_escape");
  });
});
