import { describe, it, expect } from "vitest";
import { makeStep } from "../../src/core/engine.js";
import { hashState } from "../../src/core/hash.js";
import { loadPackFile } from "../../src/cyoa/pack.js";
import { indexPack, buildRules, initStateForPack } from "../../src/cyoa/runner.js";
import { buildObservation } from "../../src/cyoa/observation.js";
import { runActions, type Trace } from "../../src/trace/record.js";
import { replayTrace } from "../../src/trace/replay.js";
import type { Action } from "../../src/api/types.js";

const result = loadPackFile("content/cyoa/pack/watchtower_road.yaml");
if (!result.ok) throw new Error("fixture pack must compile");
const compiled = result.compiled;
const index = indexPack(compiled.pack);
const rules = buildRules(index);

const choose = (id: string): Action => ({ type: "CHOOSE", choiceId: id });

describe("CYOA runner", () => {
  it("offers only condition-satisfied choices", () => {
    const s0 = initStateForPack(index, 1);
    const obs0 = buildObservation(index, s0);
    expect(obs0.available_actions.map((a) => a.id)).toContain("inspect_ground");

    // After inspecting, found_bootprints is set and the choice disappears.
    const s1 = makeStep(rules)(s0, choose("inspect_ground")).state;
    const obs1 = buildObservation(index, s1);
    expect(obs1.available_actions.map((a) => a.id)).not.toContain("inspect_ground");
  });

  it("a condition-locked choice is hidden until its flag is set", () => {
    const step = makeStep(rules);
    let s = initStateForPack(index, 1);
    s = step(s, choose("go_east")).state; // ruined_watchtower
    s = step(s, choose("circle_cellar")).state; // cellar_door
    const before = buildObservation(index, s).available_actions.map((a) => a.id);
    expect(before).not.toContain("descend_cellar"); // needs lantern_lit
  });

  it("entering an ending terminates the game", () => {
    const step = makeStep(rules);
    let s = initStateForPack(index, 1);
    s = step(s, choose("go_west")).state;
    s = step(s, choose("ford_brook")).state;
    s = step(s, choose("cross_north")).state;
    s = step(s, choose("slip_into_woods")).state;
    const r = step(s, choose("slip_away"));
    expect(r.ok).toBe(true);
    expect(r.state.ended).toBe(true);
    expect(r.state.endingId).toBe("ending_escape");
    expect(buildObservation(index, r.state).available_actions).toEqual([]);
  });

  it("on_enter wiring fires (hermit_about_letter sets learned_truth on entry)", () => {
    const step = makeStep(rules);
    let s = initStateForPack(index, 1);
    for (const id of [
      "go_east",
      "approach_base",
      "search_rubble",
      "take_letter",
      "leave_cart",
      "leave_base",
      "return_crossroads",
      "go_west",
      "follow_to_camp",
      "talk_hermit",
    ]) {
      s = step(s, choose(id)).state;
    }
    expect(s.flags["learned_truth"]).not.toBe(true);
    s = step(s, choose("show_letter")).state; // → hermit_about_letter, on_enter sets the flag
    expect(s.current).toBe("hermit_about_letter");
    expect(s.flags["learned_truth"]).toBe(true);
  });

  it("re-entering the cellar does not stack journal entries (blind-playtest fix)", () => {
    // The cellar's ambiance was moved from a per-entry on_enter add_journal into
    // the static scene text, so revisiting it can no longer duplicate the journal.
    const step = makeStep(rules);
    let s = initStateForPack(index, 1);
    for (const id of [
      "go_east",
      "approach_base",
      "search_rubble",
      "take_lantern",
      "leave_cart",
      "leave_base",
      "circle_cellar",
      "light_lantern",
    ]) {
      s = step(s, choose(id)).state;
    }
    s = step(s, choose("descend_cellar")).state; // first entry → cellar
    const afterFirst = [...s.journal];
    s = step(s, choose("climb_out")).state; // back to cellar_door
    s = step(s, choose("descend_cellar")).state; // second entry → cellar
    expect(s.journal).toEqual(afterFirst); // no growth, no duplicate ambiance
    expect(s.journal.some((j) => /smells of pitch/.test(j))).toBe(false);
  });
});

describe("CYOA determinism + replay (Stage 1 acceptance §13.9)", () => {
  const TRUTH_ROUTE = [
    "inspect_ground",
    "go_east",
    "approach_base",
    "search_rubble",
    "take_lantern",
    "take_letter",
    "leave_cart",
    "leave_base",
    "return_crossroads",
    "go_west",
    "follow_to_camp",
    "talk_hermit",
    "show_letter",
    "back_from_letter_talk",
    "say_goodbye",
    "leave_camp",
    "ford_brook",
    "cross_north",
    "slip_into_woods",
    "expose_the_plot",
  ].map(choose);

  it("the truth route reaches ending_truth deterministically", () => {
    const a = runActions(rules, initStateForPack(index, 7), TRUTH_ROUTE);
    const b = runActions(rules, initStateForPack(index, 7), TRUTH_ROUTE);
    expect(a.finalState.endingId).toBe("ending_truth");
    expect(a.finalState.ended).toBe(true);
    expect(hashState(a.finalState)).toBe(hashState(b.finalState));
    expect(a.hashes).toEqual(b.hashes);
  });

  it("a recorded trace replays to the identical final hash", () => {
    const initial = initStateForPack(index, 7);
    const run = runActions(rules, initial, TRUTH_ROUTE);
    const trace: Trace = {
      trace_id: "tr_truth",
      pack_id: compiled.pack.meta.id,
      content_hash: compiled.contentHash,
      seed: initial.seed,
      initial_state: initial,
      actions: TRUTH_ROUTE,
      expected_final_hash: hashState(run.finalState),
    };
    const replay = replayTrace(trace, rules);
    expect(replay.ok).toBe(true);
  });

  it("every major ending is reachable by some route", () => {
    const step = makeStep(rules);
    const play = (ids: string[]) => {
      let s = initStateForPack(index, 1);
      for (const id of ids) s = step(s, choose(id)).state;
      return s.endingId;
    };
    expect(
      play(["go_west", "ford_brook", "cross_north", "approach_checkpoint", "force_through"]),
    ).toBe("ending_captured");
    expect(play(["go_west", "ford_brook", "cross_north", "slip_into_woods", "slip_away"])).toBe(
      "ending_escape",
    );
  });
});
