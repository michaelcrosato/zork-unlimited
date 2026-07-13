/**
 * Regression for bug_0392 — Dawn Beacon's watchman gave the useful briefing but
 * did not cue players that Hale's orders-board still held a score-bearing order.
 */
import { describe, it, expect } from "vitest";
import { loadRpgSourceFile } from "../../src/rpg/source.js";
import {
  indexRpgPack,
  buildRpgRules,
  initStateForRpgPack,
  enumerateRpgActions,
} from "../../src/rpg/runner.js";
import { buildRpgObservation } from "../../src/rpg/observation.js";
import { makeStep, actionEquals } from "../../src/core/engine.js";
import type { RpgAction } from "../../src/api/types.js";
import type { GameState } from "../../src/core/state.js";

const loaded = loadRpgSourceFile("content/rpg/quests/dawn_beacon.yaml");
if (!loaded.ok) throw new Error("dawn_beacon must compile");
const index = indexRpgPack(loaded.compiled.pack);
const rules = buildRpgRules(index);
const step = makeStep(rules);

function act(state: GameState, RpgAction: RpgAction): GameState {
  expect(
    rules.legalActions(state).some((a) => actionEquals(a, RpgAction)),
    `RpgAction ${JSON.stringify(RpgAction)} must be legal in ${state.current}`,
  ).toBe(true);
  const result = step(state, RpgAction);
  expect(result.ok, result.rejectionReason).toBe(true);
  return result.state;
}

function askBeaconFirst(): GameState {
  let state = initStateForRpgPack(index, 7);
  state = act(state, { type: "MOVE", direction: "north" });
  state = act(state, { type: "TALK", npc: "watchman" });
  state = act(state, { type: "ASK", npc: "watchman", topic: "ask_beacon" });
  const ids = enumerateRpgActions(index, state).map((option) => option.id);
  expect(ids).toContain("ask_ask_fight");
  expect(ids).not.toContain("ask_beacon_back");
  return state;
}

describe("bug_0392 — Dawn Beacon watchman points unread players to Hale's board", () => {
  it("reminds a briefed player to read the orders-board before climbing", () => {
    const state = askBeaconFirst();

    expect(state.flags["heard_beacon"]).toBe(true);
    expect(state.flags["read_orders"]).toBeUndefined();

    const obs = buildRpgObservation(index, state);
    expect(obs.dialogue?.npc_text).toContain("read Hale's board before you climb");
    expect(obs.dialogue?.npc_text).toContain("chalk has the whole order");
  });

  it("drops the board reminder once the order has been read", () => {
    let state = askBeaconFirst();
    state = act(state, { type: "ASK", npc: "watchman", topic: "leave_watch" });
    state = act(state, { type: "READ", target: "orders_board" });
    state = act(state, { type: "TALK", npc: "watchman" });

    expect(state.flags["read_orders"]).toBe(true);

    const obs = buildRpgObservation(index, state);
    expect(obs.dialogue?.npc_text).toContain("what else");
    expect(obs.dialogue?.npc_text).not.toContain("read Hale's board before you climb");
  });
});
