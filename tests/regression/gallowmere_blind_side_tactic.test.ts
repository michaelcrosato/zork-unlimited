/**
 * Regression for bug_0447 — Gallowmere's learned hunting tactics must become a
 * player-facing choice at the fight, not only silent stat prep.
 *
 * The seed-7 blind pass won cleanly but found the climax anticlimactic: the game
 * spends multiple beats teaching wind quarter, charge angle, and tusk side, then
 * the sow fight only offered repeated ATTACK. The fix adds a one-shot knife command
 * in `moor_hollow`, gated on the actual prep knowledge, with a small attack payoff
 * and no score change.
 */
import { describe, it, expect } from "vitest";
import { loadRpgSourceFile } from "../../src/rpg/source.js";
import {
  buildRpgRules,
  enumerateRpgActions,
  indexRpgPack,
  initStateForRpgPack,
} from "../../src/rpg/runner.js";
import { buildRpgObservation } from "../../src/rpg/observation.js";
import { validateRpg } from "../../src/validate/rpg_validator.js";
import { makeStep } from "../../src/core/engine.js";
import type { GameState } from "../../src/core/state.js";
import type { Rng } from "../../src/core/rng.js";

const loaded = loadRpgSourceFile("content/rpg/quests/gallowmere.yaml");
if (!loaded.ok) throw new Error("gallowmere must compile");
const pack = loaded.compiled.pack;
const index = indexRpgPack(pack);

const highRng = (): Rng => ({
  next: () => 0.999999,
  int: (_min: number, max: number) => max,
});

const rules = buildRpgRules(index, () => highRng());
const step = makeStep(rules);

function actId(s: GameState, id: string): GameState {
  const opt = enumerateRpgActions(index, s).find((o) => o.id === id);
  if (!opt) {
    throw new Error(
      `"${id}" not legal in ${s.current}; legal=[${enumerateRpgActions(index, s)
        .map((o) => `${o.id}:${o.command}`)
        .join(", ")}]`,
    );
  }
  const r = step(s, opt.action);
  expect(r.ok, r.rejectionReason).toBe(true);
  if (!r.ok) throw new Error("unreachable");
  return r.state;
}

function hearSowCounsel(s: GameState): GameState {
  s = actId(s, "talk_hedrick");
  s = actId(s, "ask_ask_sow");
  const ids = enumerateRpgActions(index, s).map((option) => option.id);
  expect(ids).not.toContain("ask_hedrick_sow_back");
  expect(ids).toEqual([
    "ask_ask_father",
    "ask_leave_hedrick",
    "go_east",
    "examine_shepherd_log",
    "read_shepherd_log",
    "examine_hunting_knife",
    "drop_hunting_knife",
    "look_around",
    "inventory",
  ]);
  return s;
}

function fullPrepToHollow(): GameState {
  let s = initStateForRpgPack(index, 7);
  for (const id of ["take_hunting_knife", "go_west"]) s = actId(s, id);
  s = hearSowCounsel(s);
  for (const id of [
    // Reading the log preserves the exchange; the following eastward move closes it.
    "read_shepherd_log",
    "go_east",
    "go_north",
    "go_east",
    "use_hunting_knife_on_spoor_ground",
    "go_west",
    "go_north",
    "use_hunting_knife_on_wind_stone",
    "go_north",
  ]) {
    s = actId(s, id);
  }
  expect(s.current).toBe("moor_hollow");
  expect(s.flags["found_kill"]).toBe(true);
  expect(s.flags["read_wind"]).toBe(true);
  return s;
}

function windOnlyToHollow(): GameState {
  let s = initStateForRpgPack(index, 7);
  for (const id of ["take_hunting_knife", "go_west"]) s = actId(s, id);
  s = hearSowCounsel(s);
  for (const id of [
    // Leaving by the east exit interrupts the conversation without a filler step.
    "go_east",
    "go_north",
    "go_north",
    "use_hunting_knife_on_wind_stone",
    "go_north",
  ]) {
    s = actId(s, id);
  }
  expect(s.current).toBe("moor_hollow");
  expect(s.flags["found_kill"]).toBeUndefined();
  expect(s.flags["read_wind"]).toBe(true);
  return s;
}

const commands = (s: GameState): string[] => enumerateRpgActions(index, s).map((o) => o.command);
const actionIds = (s: GameState): string[] => enumerateRpgActions(index, s).map((o) => o.id);

describe("bug_0447 — Gallowmere turns learned charge-angle prep into a fight tactic", () => {
  it("fully prepared hunters see a blind-side command alongside the normal attack", () => {
    const s = fullPrepToHollow();
    expect(commands(s)).toContain("strike the blind side with hunting-knife");
    expect(commands(s)).toContain("attack Gallowmere sow");
    expect(buildRpgObservation(index, s).description).toContain("blind-side opening");
  });

  it("hunters who skipped the kill-site do not get the learned blind-side tactic", () => {
    const s = windOnlyToHollow();
    expect(commands(s)).not.toContain("strike the blind side with hunting-knife");
    expect(actionIds(s)).not.toContain("use_hunting_knife_on_sow_blind_side");
    expect(commands(s)).toContain("attack Gallowmere sow");
  });

  it("the blind-side strike is one-shot, visible, and score-neutral", () => {
    let s = fullPrepToHollow();
    const beforeAttack = s.vars["attack"] ?? 0;
    const beforeScore = s.vars["score"] ?? 0;
    const opt = enumerateRpgActions(index, s).find(
      (o) => o.id === "use_hunting_knife_on_sow_blind_side",
    );
    expect(opt?.command).toBe("strike the blind side with hunting-knife");

    const r = step(s, opt!.action);
    expect(r.ok, r.rejectionReason).toBe(true);
    s = r.state;

    const narration = r.events
      .filter((e): e is { type: "narration"; text: string } => e.type === "narration")
      .map((e) => e.text)
      .join("\n");
    expect(narration).toContain("the angle Cradoc died leaving for you");
    expect(s.flags["blind_side_struck"]).toBe(true);
    expect(s.vars["attack"]).toBe(beforeAttack + 2);
    expect(s.vars["score"]).toBe(beforeScore);
    expect(actionIds(s)).not.toContain("use_hunting_knife_on_sow_blind_side");
    expect(buildRpgObservation(index, s).description).toContain("first cut found the blind side");
  });

  it("the perfect-score route still reaches the hunt_won ending after using the tactic", () => {
    let s = fullPrepToHollow();
    s = actId(s, "use_hunting_knife_on_sow_blind_side");
    for (let guard = 0; guard < 20 && !s.flags["sow_slain"]; guard += 1) {
      s = actId(s, "attack_gallowmere_sow");
    }
    expect(s.flags["sow_slain"]).toBe(true);
    s = actId(s, "go_north");
    expect(s.ended).toBe(true);
    expect(s.endingId).toBe("ending_hunt_won");
    expect(s.vars["score"]).toBe(50);
  });

  it("still validates green under the RPG validator", () => {
    const report = validateRpg(pack);
    expect(report.findings.filter((f) => f.severity === "error")).toEqual([]);
    expect(report.ok).toBe(true);
  });
});
