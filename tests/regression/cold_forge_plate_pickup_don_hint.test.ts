/**
 * Regression for bug_0445: taking the cold-iron plate gave only generic pickup
 * text, so the player was not told at the acquisition moment that `don` is a
 * separate protective step.
 */
import { describe, expect, it } from "vitest";
import { makeStep, actionEquals } from "../../src/core/engine.js";
import type { RpgAction } from "../../src/api/types.js";
import type { GameEvent } from "../../src/core/events.js";
import type { GameState } from "../../src/core/state.js";
import { loadRpgSourceFile } from "../../src/rpg/source.js";
import {
  buildRpgRules,
  enumerateRpgActions,
  indexRpgPack,
  initStateForRpgPack,
} from "../../src/rpg/runner.js";

const loaded = loadRpgSourceFile("content/rpg/quests/cold_forge.yaml");
if (!loaded.ok) throw new Error("cold_forge must compile");
const index = indexRpgPack(loaded.compiled.pack);
const rules = buildRpgRules(index);
const step = makeStep(rules);

function act(state: GameState, RpgAction: RpgAction): { state: GameState; events: GameEvent[] } {
  expect(
    rules.legalActions(state).some((legal) => actionEquals(legal, RpgAction)),
    `RpgAction ${JSON.stringify(RpgAction)} must be legal in ${state.current}`,
  ).toBe(true);
  const result = step(state, RpgAction);
  expect(result.ok, result.rejectionReason).toBe(true);
  return { state: result.state, events: result.events };
}

function commands(state: GameState): string[] {
  return enumerateRpgActions(index, state).map((option) => option.command);
}

function narrations(events: GameEvent[]): string {
  return events
    .filter(
      (event): event is Extract<GameEvent, { type: "narration" }> => event.type === "narration",
    )
    .map((event) => event.text)
    .join(" ");
}

function enterFounderCell(): GameState {
  let state = initStateForRpgPack(index, 7);
  state = act(state, { type: "MOVE", direction: "down" }).state;
  state = act(state, { type: "MOVE", direction: "west" }).state;
  expect(state.current).toBe("founder_cell");
  return state;
}

describe("bug_0445 - Cold Forge plate pickup points at donning", () => {
  it("adds immediate pickup feedback without equipping the plate automatically", () => {
    const taken = act(enterFounderCell(), { type: "TAKE", item: "cold_iron_plate" });

    expect(taken.state.inventory).toContain("cold_iron_plate");
    expect(taken.state.flags["plate_donned"]).toBeUndefined();
    expect(taken.state.vars["defense"]).toBe(2);
    expect(narrations(taken.events)).toContain("not yet on your body");
    expect(narrations(taken.events)).toMatch(/Don it before the sentinel/i);
    expect(taken.state.journal.at(-1)).toMatch(/only weight.*until it is buckled on/i);
    expect(commands(taken.state)).toContain("don cold-iron plate");
  });

  it("keeps the don RpgAction as the actual one-shot defense buff", () => {
    let state = enterFounderCell();
    state = act(state, { type: "TAKE", item: "cold_iron_plate" }).state;
    state = act(state, {
      type: "USE",
      item: "cold_iron_plate",
      target: "cold_iron_plate",
    }).state;

    expect(state.flags["plate_donned"]).toBe(true);
    expect(state.vars["defense"]).toBe(4);
    expect(commands(state)).not.toContain("don cold-iron plate");
  });
});
