/**
 * Regression (§15) for bug_0098 — *The Watchtower Road*'s lit signal beacon was a
 * Chekhov's gun the engine never fired. tower_top → `light_beacon` sets the flag
 * `raised_alarm` and signal_fire narrates "a horn answers. Help — or trouble — is
 * coming," yet `raised_alarm` was read NOWHERE: a player who lit the beacon and one
 * who never climbed the tower reached the same endings with identical epilogues, so
 * the dramatic promise never materialised. A fresh blind MCP playtester (seed 19,
 * report ai-runs/2026-06-02T01-02-26-045Z/playtest.md §1/§5) flagged it directly.
 *
 * The fix FIRES the gun (rather than muting the prose): each ending the beacon route
 * can reach now carries a reactive `raised_alarm` variant (engine endingText,
 * first-match-wins — the same reactive-ending machinery as clockwork's ending_truth,
 * bug_0051), so the watch the player summoned shows up in the epilogue. No
 * scene/choice/route/gating change and no new ending: the base text is the un-alarmed
 * fallback, and the beacon-lighter reaches the SAME endingId as the un-alarmed player.
 *
 * This locks: (1) lighting the beacon sets raised_alarm (and it is unset otherwise);
 * (2) every ending renders its alarm variant on the beacon route and its base text
 * off it; (3) the variant is purely cosmetic — beacon and no-beacon routes converge
 * on the same endingId, so the fix changed no route, gate, or reachable ending.
 */
import { describe, it, expect } from "vitest";
import { loadPackFile } from "../../src/cyoa/pack.js";
import { indexPack, buildRules, initStateForPack } from "../../src/cyoa/runner.js";
import { buildObservation } from "../../src/cyoa/observation.js";
import { makeStep } from "../../src/core/engine.js";

const loaded = loadPackFile("content/cyoa/pack/watchtower_road.yaml");
if (!loaded.ok) throw new Error("watchtower pack must compile");
const index = indexPack(loaded.compiled.pack);
const rules = buildRules(index);
const choose = (id: string) => ({ type: "CHOOSE", choiceId: id }) as const;

function play(ids: string[]) {
  const step = makeStep(rules);
  let s = initStateForPack(index, 1);
  for (const id of ids) s = step(s, choose(id)).state;
  return s;
}
const endingText = (s: ReturnType<typeof play>) => buildObservation(index, s).text.toLowerCase();

// ── Beacon routes (raised_alarm SET) ──────────────────────────────────────────
// Take the lantern, climb the tower, light the beacon, then resolve each ending.
const TO_BEACON = [
  "go_east",
  "approach_base",
  "search_rubble",
  "take_lantern",
  "leave_cart",
  "climb_stairs",
  "continue_up",
  "light_beacon",
  "watch_for_help",
]; // -> decision_point, raised_alarm set, no proof yet

const BEACON_ESCAPE = [...TO_BEACON, "slip_away"];
const BEACON_CAPTURED = [...TO_BEACON, "turn_back", "approach_checkpoint", "force_through"];
// For the truth ending we need proof too: detour through the cellar for the ledger
// BEFORE climbing the tower to light the beacon.
const BEACON_TRUTH = [
  "go_east",
  "approach_base",
  "search_rubble",
  "take_lantern",
  "leave_cart",
  "leave_base",
  "circle_cellar",
  "light_lantern",
  "descend_cellar",
  "search_cache",
  "take_ledger",
  "climb_out",
  "cellar_back",
  "approach_base",
  "climb_stairs",
  "continue_up",
  "light_beacon",
  "watch_for_help",
  "expose_the_plot",
];

// ── No-beacon routes (raised_alarm UNSET) ─────────────────────────────────────
const BASE_ESCAPE = ["go_west", "ford_brook", "cross_north", "slip_into_woods", "slip_away"];
const BASE_CAPTURED = [
  "go_west",
  "ford_brook",
  "cross_north",
  "approach_checkpoint",
  "force_through",
];
const BASE_TRUTH = [
  "go_east",
  "approach_base",
  "search_rubble",
  "take_lantern", // lantern only to reach the cellar; never lit as a beacon
  "leave_cart",
  "leave_base",
  "circle_cellar",
  "light_lantern",
  "descend_cellar",
  "search_cache",
  "take_ledger",
  "climb_out",
  "cellar_back",
  "approach_base",
  "climb_stairs",
  "continue_up",
  "survey_road", // tower_top -> road_north WITHOUT lighting the beacon
  "slip_into_woods",
  "expose_the_plot",
];

describe("bug_0098 — the lit beacon's raised_alarm finally fires in the endings", () => {
  it("lighting the beacon sets raised_alarm; not climbing/lighting leaves it unset", () => {
    const lit = play(TO_BEACON);
    expect(lit.flags["raised_alarm"]).toBe(true);
    const unlit = play(["go_west", "ford_brook", "cross_north"]);
    expect(unlit.flags["raised_alarm"]).not.toBe(true);
  });

  it("ending_escape: alarm variant on the beacon route, base text off it", () => {
    const lit = play(BEACON_ESCAPE);
    expect(lit.ended).toBe(true);
    expect(lit.endingId).toBe("ending_escape");
    expect(lit.flags["raised_alarm"]).toBe(true);
    expect(endingText(lit)).toContain("beacon");

    const base = play(BASE_ESCAPE);
    expect(base.endingId).toBe("ending_escape");
    expect(base.flags["raised_alarm"]).not.toBe(true);
    expect(endingText(base)).not.toContain("beacon");
  });

  it("ending_truth: alarm variant on the beacon route, base text off it", () => {
    const lit = play(BEACON_TRUTH);
    expect(lit.ended).toBe(true);
    expect(lit.endingId).toBe("ending_truth");
    expect(lit.flags["raised_alarm"]).toBe(true);
    expect(lit.flags["learned_truth"]).toBe(true);
    expect(endingText(lit)).toContain("beacon");

    const base = play(BASE_TRUTH);
    expect(base.endingId).toBe("ending_truth");
    expect(base.flags["raised_alarm"]).not.toBe(true);
    expect(endingText(base)).not.toContain("beacon");
  });

  it("ending_captured: alarm variant on the beacon route, base text off it", () => {
    const lit = play(BEACON_CAPTURED);
    expect(lit.ended).toBe(true);
    expect(lit.endingId).toBe("ending_captured");
    expect(lit.flags["raised_alarm"]).toBe(true);
    expect(endingText(lit)).toContain("beacon");

    const base = play(BASE_CAPTURED);
    expect(base.endingId).toBe("ending_captured");
    expect(base.flags["raised_alarm"]).not.toBe(true);
    expect(endingText(base)).not.toContain("beacon");
  });

  it("the variant is cosmetic: beacon and no-beacon routes converge on the same endingId", () => {
    // No route, gate, or reachable ending changed — only the epilogue prose differs.
    expect(play(BEACON_ESCAPE).endingId).toBe(play(BASE_ESCAPE).endingId);
    expect(play(BEACON_TRUTH).endingId).toBe(play(BASE_TRUTH).endingId);
    expect(play(BEACON_CAPTURED).endingId).toBe(play(BASE_CAPTURED).endingId);
  });
});
