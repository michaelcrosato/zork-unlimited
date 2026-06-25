/**
 * Regression for bug_0454: the Collector's Warrant already had a noisy
 * crowbar-and-hatch branch, but a blind player reasonably missed it because the
 * door hint avoided naming the crowbar and taking the warrant did not point out
 * that the game still needed an escape step.
 */
import { describe, expect, it } from "vitest";
import { makeStep } from "../../src/core/engine.js";
import type { GameEvent } from "../../src/core/events.js";
import type { GameState } from "../../src/core/state.js";
import { buildParserObservation } from "../../src/parser/observation.js";
import { loadParserPackFile } from "../../src/parser/pack.js";
import {
  buildParserRules,
  indexParserPack,
  initStateForParserPack,
} from "../../src/parser/runner.js";
import { enumerateActions } from "../../src/parser/legal_actions.js";

const loaded = loadParserPackFile("content/parser/pack/collectors_warrant.yaml");
if (!loaded.ok) throw new Error("collectors_warrant must compile");
const pack = loaded.compiled.pack;
const index = indexParserPack(pack);
const step = makeStep(buildParserRules(index));

function actById(state: GameState, id: string): { state: GameState; events: GameEvent[] } {
  const options = enumerateActions(index, state);
  const opt = options.find((o) => o.id === id);
  if (!opt) {
    throw new Error(
      `"${id}" not legal in ${state.current}: [${options.map((o) => o.id).join(", ")}]`,
    );
  }
  const result = step(state, opt.action);
  expect(result.ok).toBe(true);
  return { state: result.state, events: result.events };
}

function play(state: GameState, ids: string[]): GameState {
  for (const id of ids) {
    state = actById(state, id).state;
  }
  return state;
}

const commands = (state: GameState): string[] =>
  enumerateActions(index, state).map((option) => option.command);

function narrations(events: GameEvent[]): string {
  return events
    .filter(
      (event): event is Extract<GameEvent, { type: "narration" }> => event.type === "narration",
    )
    .map((event) => event.text)
    .join(" ");
}

describe("bug_0454 - collectors_warrant noisy route is signposted", () => {
  it("names the crowbar in the locked door hint and confirms the forced-door command after pickup", () => {
    let state = initStateForParserPack(index, 7);
    const westBlock = buildParserObservation(index, state).blocked_exits.find(
      (exit) => exit.direction === "west",
    );

    expect(westBlock?.message).toMatch(/crowbar/i);

    const taken = actById(state, "take_crowbar");
    state = taken.state;

    expect(narrations(taken.events)).toMatch(/weight enough for the iron door/i);
    expect(narrations(taken.events)).toMatch(/Use it on the iron door/i);
    expect(commands(state)).toContain("use crowbar on iron door");
  });

  it("after the warrant is taken, the quiet route points the player out through the passage", () => {
    const beforeWarrant = play(initStateForParserPack(index, 7), [
      "read_collector_ledger",
      "go_east",
      "open_salt_measure",
      "take_strong_key",
      "go_west",
      "use_strong_key_on_strong_room_door",
      "go_west",
    ]);

    const taken = actById(beforeWarrant, "take_salt_warrant");

    expect(taken.state.ended).toBe(false);
    expect(buildParserObservation(index, taken.state).score).toBe(pack.meta.max_score);
    expect(narrations(taken.events)).toMatch(/get back east and out through the passage/i);

    const escaped = play(taken.state, ["go_east", "go_north"]);
    expect(escaped.ended).toBe(true);
    expect(escaped.endingId).toBe("ending_recovered");
  });

  it("after the clerk wakes, the duty-room points warrant carriers at the coal-hatch escape", () => {
    let state = play(initStateForParserPack(index, 7), [
      "take_crowbar",
      "use_crowbar_on_strong_room_door",
    ]);

    expect(buildParserObservation(index, state).description).toContain(
      "the rope and hatch are your way out",
    );

    state = play(state, ["go_west"]);
    const taken = actById(state, "take_salt_warrant");
    state = play(taken.state, ["go_east"]);

    expect(narrations(taken.events)).toMatch(/if the clerk is awake/i);
    expect(commands(state)).toContain("use salt-grant warrant on coal hatch");

    state = play(state, ["use_salt_warrant_on_coal_hatch"]);
    expect(state.ended).toBe(true);
    expect(state.endingId).toBe("ending_recovered");
    expect(buildParserObservation(index, state).score).toBe(20);
  });
});
