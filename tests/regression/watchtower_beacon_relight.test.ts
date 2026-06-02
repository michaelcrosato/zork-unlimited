/**
 * Regression (§15) for bug_0120 — *The Watchtower Road*'s tower_top.light_beacon was a
 * one-shot dramatic act rendered as a repeatable, state-blind toggle. The choice set the
 * `raised_alarm` flag but gated only on `{ has_item: lantern }`; the lantern is never
 * consumed, so a player who lit the beacon, entered signal_fire, and stepped back to the
 * tower top found "Light the signal beacon" still offered AND the scene text still reading
 * "A cold brazier waits, begging for a flame" — contradicting the fire they had just lit.
 * A fresh blind MCP playtester (seed 11, ai-runs/2026-06-02T11-34-06-334Z/playtest.md §5)
 * flagged it directly.
 *
 * The fix tightens the condition to all_of [ has_item: lantern, not_flag: raised_alarm ]
 * (the beacon fires once, then the choice retires) and adds a raised_alarm scene variant so
 * the returning player reads the lit beacon. This locks: (1) before lighting, the base text
 * shows and light_beacon is offered; (2) after lighting and returning, the variant shows,
 * the base "begging for a flame" prose is gone, and light_beacon is no longer offered; while
 * (3) raised_alarm is still set exactly once and the beacon route still reaches its endings
 * (the bug_0098 payoff test stays green) — no route, gate, or reachable ending changed.
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

function play(ids: string[]) {
  const step = makeStep(rules);
  let s = initStateForPack(index, 11);
  for (const id of ids) s = step(s, choose(id)).state;
  return s;
}
const obs = (s: ReturnType<typeof play>) => buildObservation(index, s);
const optionIds = (s: ReturnType<typeof play>): string[] =>
  obs(s).available_actions.map((a) => a.id);

// Take the lantern, climb to the tower top (raised_alarm still unset).
const TO_TOWER_TOP = [
  "go_east",
  "approach_base",
  "search_rubble",
  "take_lantern",
  "leave_cart",
  "climb_stairs",
  "continue_up",
];
// Light the beacon, then step back from signal_fire to the (now lit) tower top.
const RELIT_TOWER_TOP = [...TO_TOWER_TOP, "light_beacon", "back_to_top"];

describe("bug_0120 — the tower-top beacon is a one-shot, and its scene text follows the flag", () => {
  it("before lighting: base text invites the flame and light_beacon is offered", () => {
    const s = play(TO_TOWER_TOP);
    expect(s.current).toBe("tower_top");
    expect(s.flags["raised_alarm"]).not.toBe(true);
    expect(s.inventory).toContain("lantern");
    const text = obs(s).text.toLowerCase();
    expect(text).toContain("begging for a flame");
    expect(text).not.toContain("still blazes");
    expect(optionIds(s)).toContain("light_beacon");
  });

  it("after lighting and returning: variant shows a lit beacon and light_beacon retires", () => {
    const s = play(RELIT_TOWER_TOP);
    expect(s.current).toBe("tower_top");
    expect(s.flags["raised_alarm"]).toBe(true);
    expect(s.inventory).toContain("lantern"); // lantern not consumed — proves the gate, not item loss, retires the choice
    const text = obs(s).text.toLowerCase();
    expect(text).toContain("still blazes");
    expect(text).not.toContain("begging for a flame");
    // The already-done action can no longer be re-offered over an already-lit fire.
    expect(optionIds(s)).not.toContain("light_beacon");
    // The other two ways off the top remain.
    expect(optionIds(s)).toContain("survey_road");
    expect(optionIds(s)).toContain("descend");
  });

  it("the beacon still fires exactly once and the route still reaches an ending (cosmetic-only)", () => {
    // Light once, then resolve to the escape ending via the woods — raised_alarm persists.
    const ended = play([...RELIT_TOWER_TOP, "survey_road", "slip_into_woods", "slip_away"]);
    expect(ended.ended).toBe(true);
    expect(ended.endingId).toBe("ending_escape");
    expect(ended.flags["raised_alarm"]).toBe(true);
  });
});
