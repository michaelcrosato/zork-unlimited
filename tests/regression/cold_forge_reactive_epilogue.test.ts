/**
 * Regression (§15) for bug_0275 — The Cold Forge's endings carry REACTIVE epilogues
 * (the terminal-state sibling of its already fully-reactive rooms/objects).
 *
 * A fresh source-blind MCP playtester (seeds 17 & 3,
 * ai-runs/2026-06-05T06-39-54-147Z/playtest.md §5) found the pack bug-free but noted
 * that thorough exploration — hearing the lantern-spirit's tale of the forge's last
 * master, finding his cell, reading his epitaph — earns the SAME epilogue as a rusher
 * who skipped it all. The optional founder arc is the pack's whole second branch and
 * its emotional payoff (you carry out the dead master's last work, fulfilling the plea
 * cut into his stone) was invisible at the one moment it should land.
 *
 * The fix reframes BOTH terminals under a `knows_founder` predicate (visited his cell
 * OR heard the spirit name him), honoring the reactive-ending-blindness class: when one
 * terminal reframes by knowledge, every terminal reachable on both an informed and an
 * uninformed path must too. This test pins, against the real runner + observation:
 *   - WIN without founder knowledge → base epilogue ("the old forge is breathing again").
 *   - WIN with founder knowledge (visited cell)    → reframed ("the last master's").
 *   - WIN via the heard_founder leg (asked, never visited the cell) → reframed too.
 *   - DEATH without founder knowledge → base epilogue ("grave chill closes over you").
 *   - DEATH with founder knowledge (visited cell)  → reframed ("keep him company").
 *   - the player-facing `description` carries the resolved epilogue; structured
 *     `ending.text` is the pure epilogue (no "Final score" tally).
 *   - NEGATIVE CONTROL for the new validator code: a shadowed / unsatisfiable ending
 *     variant is flagged UNREACHABLE_VARIANT / UNSATISFIABLE_CONDITION.
 */
import { describe, it, expect } from "vitest";
import { compileRpgSource, loadRpgSourceFile } from "../../src/rpg/source.js";
import {
  indexRpgPack,
  buildRpgRules,
  initStateForRpgPack,
  enumerateRpgActions,
} from "../../src/rpg/runner.js";
import { buildRpgObservation } from "../../src/rpg/observation.js";
import { validateRpg } from "../../src/validate/rpg_validator.js";
import { makeStep } from "../../src/core/engine.js";
import type { GameState } from "../../src/core/state.js";
import type { Action } from "../../src/api/types.js";

const loaded = loadRpgSourceFile("content/rpg/quests/cold_forge.yaml");
if (!loaded.ok) throw new Error("cold_forge must compile");
const pack = loaded.compiled.pack;
const index = indexRpgPack(pack);
const step = makeStep(buildRpgRules(index));

const options = (s: GameState) => enumerateRpgActions(index, s);
function act(s: GameState, pred: (a: Action) => boolean): GameState {
  const opt = options(s).find((o) => pred(o.action));
  if (!opt)
    throw new Error(
      `no action; legal=[${options(s)
        .map((o) => o.id)
        .join(", ")}] in ${s.current}`,
    );
  const r = step(s, opt.action);
  expect(r.ok).toBe(true);
  if (!r.ok) throw new Error("step failed");
  return r.state;
}

const move = (dir: string) => (a: Action) => a.type === "MOVE" && a.direction === dir;
const isAttack = (a: Action) => a.type === "ATTACK";
const isUse = (a: Action) => a.type === "USE";
const isTakeBar = (a: Action) => a.type === "TAKE" && (a as { item?: string }).item === "pry_bar";
const isTakePlate = (a: Action) =>
  a.type === "TAKE" && (a as { item?: string }).item === "cold_iron_plate";
const isTalk = (a: Action) => a.type === "TALK";
const askTopic = (topic: string) => (a: Action) =>
  a.type === "ASK" && (a as { topic?: string }).topic === topic;

function expectSpiritRoot(s: GameState): void {
  const dialogue = buildRpgObservation(index, s).dialogue;
  expect(dialogue?.npc).toBe("lantern_spirit");
  expect(dialogue?.npc_text).toMatch(/What else would you know/i);
}

/** From a freshly-opened sentinel fight, finish it, lever the grate, and descend to win. */
function finishToWin(s: GameState): GameState {
  let guard = 0;
  while (!s.ended && !s.flags["sentinel_stilled"]) {
    s = act(s, isAttack);
    if (++guard > 30) throw new Error("fight did not resolve");
  }
  expect(s.ended).toBe(false); // buffed at seed 1: the player survives
  s = act(s, move("east")); // → forge_heart
  guard = 0;
  while (s.questStage["forge"] !== "grate_open" && !s.ended) {
    s = act(s, isUse); // lever the grate (might check; retry until it gives)
    if (++guard > 40) throw new Error("grate never opened");
  }
  s = act(s, move("down")); // → ember_chamber: win fires on entry
  expect(s.endingId).toBe("ending_victory");
  return s;
}

/** Talk to the spirit, take the +2-attack counsel, optionally ask about the founder. */
function takeSpiritCounsel(s: GameState, alsoAskFounder: boolean): GameState {
  s = act(s, isTalk);
  s = act(s, askTopic("ask_sentinel")); // +2 attack
  expect(s.flags["heard_sentinel"]).toBe(true);
  expectSpiritRoot(s);
  if (alsoAskFounder) {
    s = act(s, askTopic("ask_founder")); // sets heard_founder, no stat change
    expect(s.flags["heard_founder"]).toBe(true);
    expectSpiritRoot(s);
  }
  s = act(s, askTopic("leave_spirit")); // ungated escape → dialogue ends
  return s;
}

describe("bug_0275 — The Cold Forge's reactive epilogues reward knowing the last master", () => {
  it("WIN without founder knowledge → the base epilogue (rusher's ending)", () => {
    let s = initStateForRpgPack(index, 1);
    s = act(s, move("down")); // → outer_forge
    s = act(s, isTakeBar);
    s = takeSpiritCounsel(s, false); // +2 attack only; never asks about the founder
    s = act(s, move("north")); // → bellows_walk
    s = finishToWin(s);
    expect(s.flags["heard_founder"]).toBeUndefined();
    expect(s.visited["founder_cell"]).toBeUndefined();

    const obs = buildRpgObservation(index, s);
    expect(obs.ending!.id).toBe("ending_victory");
    expect(obs.ending!.text).toContain("the old forge is breathing again");
    expect(obs.ending!.text.toLowerCase()).not.toContain("last master");
    expect(obs.ending!.text).not.toContain("Final score"); // structured text stays pure
    expect(obs.description).toContain("the old forge is breathing again");
    expect(obs.description).toContain("Final score: 50 of 50."); // closure rides description
  });

  it("WIN after visiting the founder's cell → the reframed epilogue", () => {
    let s = initStateForRpgPack(index, 1);
    s = act(s, move("down")); // → outer_forge
    s = act(s, move("west")); // → founder_cell (visited!)
    s = act(s, isTakePlate);
    s = act(s, isUse); // don the plate (def 2→4), for a robust win
    s = act(s, move("east")); // → outer_forge
    s = act(s, isTakeBar);
    s = takeSpiritCounsel(s, false);
    s = act(s, move("north")); // → bellows_walk
    s = finishToWin(s);
    expect(s.visited["founder_cell"]).toBe(true);

    const obs = buildRpgObservation(index, s);
    expect(obs.ending!.id).toBe("ending_victory");
    expect(obs.ending!.text.toLowerCase()).toContain("last master");
    expect(obs.ending!.text).toContain("you are the hand that kept it so");
    expect(obs.description).toContain("you are the hand that kept it so");
  });

  it("WIN via the heard_founder leg (asked the spirit, never entered the cell) → reframed too", () => {
    let s = initStateForRpgPack(index, 1);
    s = act(s, move("down")); // → outer_forge
    s = act(s, isTakeBar);
    s = takeSpiritCounsel(s, true); // +2 attack AND ask_founder → heard_founder
    expect(s.flags["heard_founder"]).toBe(true);
    s = act(s, move("north")); // → bellows_walk
    s = finishToWin(s);
    expect(s.visited["founder_cell"]).toBeUndefined(); // the OTHER leg

    const obs = buildRpgObservation(index, s);
    expect(obs.ending!.text.toLowerCase()).toContain("last master");
  });

  it("DEATH without founder knowledge → the base death epilogue", () => {
    let s = initStateForRpgPack(index, 2);
    s = act(s, move("down")); // → outer_forge
    s = act(s, isTakeBar); // skip the spirit's buff → base attack 4
    s = act(s, move("north")); // → bellows_walk, under-armed
    let guard = 0;
    while (!s.ended && !s.flags["sentinel_stilled"]) {
      s = act(s, isAttack);
      if (++guard > 30) throw new Error("fight did not resolve");
    }
    expect(s.endingId).toBe("ending_fallen");

    const obs = buildRpgObservation(index, s);
    expect(obs.ending!.text).toContain("grave chill closes over you");
    expect(obs.ending!.text.toLowerCase()).not.toContain("last master");
    expect(obs.description).toContain("grave chill closes over you");
  });

  it("DEATH after visiting the founder's cell → the reframed death epilogue", () => {
    let s = initStateForRpgPack(index, 2);
    s = act(s, move("down")); // → outer_forge
    s = act(s, move("west")); // → founder_cell (visited!)
    s = act(s, move("east")); // → outer_forge
    s = act(s, isTakeBar);
    s = act(s, move("north")); // → bellows_walk, still under-armed (no buff, no plate)
    let guard = 0;
    while (!s.ended && !s.flags["sentinel_stilled"]) {
      s = act(s, isAttack);
      if (++guard > 30) throw new Error("fight did not resolve");
    }
    expect(s.endingId).toBe("ending_fallen");
    expect(s.visited["founder_cell"]).toBe(true);

    const obs = buildRpgObservation(index, s);
    expect(obs.ending!.text).toContain("keep him company");
    expect(obs.ending!.text).toContain("one more set of bones");
    expect(obs.description).toContain("keep him company");
  });

  // ── NEGATIVE CONTROL: the new validator code bites on dead ending variants ──────────
  function endingVariantCodes(variants: string): string[] {
    const src = `
meta: { id: t, title: T, start_room: a }
rooms:
  - id: a
    name: A
    description: "base"
    exits: [{ direction: north, to: b }]
  - id: b
    name: B
    description: "B"
    exits: [{ direction: south, to: a }]
win_conditions: [{ id: w, conditions: [{ visited: b }], ending: e }]
endings:
  - id: e
    title: E
    text: "done"
    variants:
${variants}
enemies: []
`;
    const r = compileRpgSource(src);
    expect(r.ok).toBe(true);
    if (!r.ok) return [];
    return validateRpg(r.compiled.pack).findings.map((f) => f.code);
  }

  it("flags a SHADOWED ending variant (general-before-specific) — UNREACHABLE_VARIANT", () => {
    const codes = endingVariantCodes(
      `      - { when: [ { has_flag: won } ], text: "fires first" }
      - { when: [ { has_flag: won }, { has_flag: also } ], text: "dead — superset never first" }`,
    );
    expect(codes).toContain("UNREACHABLE_VARIANT");
  });

  it("flags an UNSATISFIABLE ending variant `when` — UNSATISFIABLE_CONDITION", () => {
    const codes = endingVariantCodes(
      `      - { when: [ { has_flag: x }, { not_flag: x } ], text: "dead — contradictory guard" }`,
    );
    expect(codes).toContain("UNSATISFIABLE_CONDITION");
  });

  it("a correctly-ordered, satisfiable ending variant is NOT flagged", () => {
    const codes = endingVariantCodes(
      `      - { when: [ { visited: b } ], text: "reframed for the b-visitor" }`,
    );
    expect(codes).not.toContain("UNREACHABLE_VARIANT");
    expect(codes).not.toContain("UNSATISFIABLE_CONDITION");
  });
});
