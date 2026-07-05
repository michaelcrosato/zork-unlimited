/**
 * Stage 4 acceptance — Hero's-Quest RPG (spec §13 Stage 4, §14 gate).
 *
 * Proves the gated mechanics end to end on the same deterministic core:
 *  1. The pack passes the RPG validator (which includes the full parser checks).
 *  2. An AI completes the game using ONLY the structured legal-action API —
 *     including a seeded fight and a seeded skill check — with no raw-parser guessing.
 *  3. Determinism holds: the exact action sequence replays to an identical hash.
 *  4. A death ending is reached AND is recoverable from an earlier save (§8.7).
 *  5. Legal ⊇ executable: every action the driver issues was in the legal set.
 */
import { describe, it, expect } from "vitest";
import { loadRpgPackFile } from "../../src/rpg/pack.js";
import { validateRpg } from "../../src/validate/rpg_validator.js";
import { indexRpgPack, buildRpgRules, initStateForRpgPack } from "../../src/rpg/runner.js";
import { buildRpgObservation } from "../../src/rpg/observation.js";
import { makeStep, actionEquals } from "../../src/core/engine.js";
import { hashState } from "../../src/core/hash.js";
import { recordTrace } from "../../src/trace/record.js";
import { replayTrace } from "../../src/trace/replay.js";
import { save, load } from "../../src/persist/save_load.js";
import type { RpgAction } from "../../src/api/types.js";
import type { GameState } from "../../src/core/state.js";

const PACK = "content/rpg/pack/sunken_barrow.yaml";
const loaded = loadRpgPackFile(PACK);
if (!loaded.ok) throw new Error("sunken_barrow failed to compile");
const compiled = loaded.compiled;
const index = indexRpgPack(compiled.pack);
const rules = buildRpgRules(index);
const step = makeStep(rules);

/** Issue an action, asserting it was legal first (legal ⊇ executable, §14). */
function act(state: GameState, action: RpgAction, log: RpgAction[]): GameState {
  const legal = rules.legalActions(state).some((a) => actionEquals(a, action));
  expect(legal, `action ${JSON.stringify(action)} must be legal in ${state.current}`).toBe(true);
  const r = step(state, action);
  expect(r.ok).toBe(true);
  log.push(action);
  return r.state;
}

/** A mainline hero: descend, arm, fight the wight, lever the slab, claim the relic. */
function playToVictory(seed: number): { state: GameState; actions: RpgAction[] } {
  const actions: RpgAction[] = [];
  let state = initStateForRpgPack(index, seed);
  state = act(state, { type: "MOVE", direction: "down" }, actions); // entry_hall
  state = act(state, { type: "TAKE", item: "iron_bar" }, actions);
  state = act(state, { type: "MOVE", direction: "north" }, actions); // guard_crypt

  // Turn-based fight: attack until the wight falls (or we do).
  for (let i = 0; i < 40 && !state.ended; i++) {
    const obs = buildRpgObservation(index, state);
    if (!obs.enemies_present.some((e) => e.id === "barrow_wight")) break;
    state = act(state, { type: "ATTACK", enemy: "barrow_wight" }, actions);
  }
  expect(state.ended, "the hero should survive the wight on this seed").toBe(false);
  expect(state.flags["wight_slain"]).toBe(true);

  state = act(state, { type: "MOVE", direction: "east" }, actions); // slab_passage
  // Skill check: heave the slab until the might check passes.
  for (let i = 0; i < 40 && state.questStage["barrow"] !== "slab_moved"; i++) {
    state = act(state, { type: "USE", item: "iron_bar", target: "stone_slab" }, actions);
  }
  expect(state.questStage["barrow"]).toBe("slab_moved");

  state = act(state, { type: "MOVE", direction: "down" }, actions); // relic_chamber
  // The win turns on the deliberate CLAIM, not on bare room entry (bug_0056): entering
  // the chamber does not end the game — the circlet sits on its plinth and is taken.
  expect(state.ended, "entering the relic chamber must not auto-win").toBe(false);
  state = act(state, { type: "TAKE", item: "circlet" }, actions); // claim the circlet → win
  return { state, actions };
}

describe("Stage 4 — The Sunken Barrow", () => {
  it("validates green under the RPG validator (§10, §13)", () => {
    const report = validateRpg(compiled.pack);
    expect(report.findings.filter((f) => f.severity === "error")).toEqual([]);
    expect(report.ok).toBe(true);
  });

  it("an AI completes the game via the structured action API (combat + skill check)", () => {
    const { state, actions } = playToVictory(1);
    expect(state.ended).toBe(true);
    expect(state.endingId).toBe("ending_victory");
    expect(state.vars["hp"]).toBeGreaterThan(0);
    // The run genuinely exercised both new mechanics.
    expect(actions.filter((a) => a.type === "ATTACK").length).toBeGreaterThan(0);
    expect(actions.filter((a) => a.type === "USE").length).toBeGreaterThan(0);
  });

  it("is deterministic: the recorded run replays to an identical final hash (§8.5)", () => {
    const { state, actions } = playToVictory(1);
    const trace = recordTrace(rules, initStateForRpgPack(index, 1), actions, {
      trace_id: "tr_barrow_victory",
      content_hash: compiled.contentHash,
      worldQuestId: "sunken_barrow",
    });
    const replay = replayTrace(trace, rules);
    expect(replay.ok).toBe(true);
    expect(replay.finalHash).toBe(hashState(state));
  });

  it("a fatal fight is recoverable from an earlier save (§8.7, death/restore)", () => {
    // Reach the wight at full strength and save there.
    const setup: RpgAction[] = [];
    let state = initStateForRpgPack(index, 7);
    state = act(state, { type: "MOVE", direction: "down" }, setup);
    state = act(state, { type: "TAKE", item: "iron_bar" }, setup);
    state = act(state, { type: "MOVE", direction: "north" }, setup);
    const saveStr = save(state, compiled.pack.meta.id, compiled.contentHash, undefined, {
      worldQuestId: "sunken_barrow",
    });

    // A wounded hero (hp 1) walks into the same fight and dies — a real death ending.
    let doomed: GameState = { ...state, vars: { ...state.vars, hp: 1 } };
    for (let i = 0; i < 40 && !doomed.ended; i++)
      doomed = step(doomed, { type: "ATTACK", enemy: "barrow_wight" }).state;
    expect(doomed.ended).toBe(true);
    expect(doomed.endingId).toBe("ending_fallen");
    expect(compiled.pack.endings.find((e) => e.id === "ending_fallen")?.death).toBe(true);

    // Restore from the save (content-hash verified) and the game is winnable again.
    const restored = load(saveStr, compiled.contentHash);
    expect(restored.state.ended).toBe(false);
    expect(restored.state.vars["hp"]).toBe(20);
  });
});
