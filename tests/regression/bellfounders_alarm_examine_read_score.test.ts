/**
 * Regression for bug_0442: examining the cracked bell used to reveal the same
 * flaw diagnosis as the scored READ RpgAction, so a careful examine-first player
 * could reasonably finish at 40/50 without knowing a close read was still owed.
 */
import { describe, expect, it } from "vitest";
import { makeStep, actionEquals } from "../../src/core/engine.js";
import type { RpgAction } from "../../src/api/types.js";
import type { GameState } from "../../src/core/state.js";
import type { GameEvent } from "../../src/core/events.js";
import { loadRpgSourceFile } from "../../src/rpg/source.js";
import { buildRpgRules, indexRpgPack, initStateForRpgPack } from "../../src/rpg/runner.js";
import { buildRpgObservation } from "../../src/rpg/observation.js";

const loaded = loadRpgSourceFile("content/rpg/pack/bellfounders_alarm.yaml");
if (!loaded.ok) throw new Error("bellfounders_alarm must compile");
const index = indexRpgPack(loaded.compiled.pack);
const rules = buildRpgRules(index);
const step = makeStep(rules);

function act(state: GameState, RpgAction: RpgAction): { state: GameState; events: GameEvent[] } {
  expect(
    rules.legalActions(state).some((a) => actionEquals(a, RpgAction)),
    `RpgAction ${JSON.stringify(RpgAction)} must be legal in ${state.current}`,
  ).toBe(true);
  const result = step(state, RpgAction);
  expect(result.ok, result.rejectionReason).toBe(true);
  return { state: result.state, events: result.events };
}

function score(state: GameState): number {
  return state.vars["score"] ?? 0;
}

function narration(events: GameEvent[]): string {
  return events
    .filter(
      (event): event is Extract<GameEvent, { type: "narration" }> => event.type === "narration",
    )
    .map((event) => event.text)
    .join("\n");
}

describe("bug_0442 - cracked bell examine signposts the scored close-read", () => {
  it("does not let examine-first play silently miss the bell-reading score", () => {
    let state = initStateForRpgPack(index, 7);
    state = act(state, { type: "MOVE", direction: "east" }).state;

    const examined = act(state, { type: "LOOK", target: "cracked_bell" });
    expect(narration(examined.events)).toMatch(/read the bell's metal/i);
    expect(narration(examined.events)).not.toMatch(/seat the clapper off the flaw/i);
    expect(examined.state.flags["bell_read"]).toBeUndefined();
    expect(examined.state.vars["bellcraft"]).toBe(3);
    expect(score(examined.state)).toBe(0);
    expect(buildRpgObservation(index, examined.state).available_actions.map((a) => a.id)).toContain(
      "read_cracked_bell",
    );

    const read = act(examined.state, { type: "READ", target: "cracked_bell" });
    expect(read.state.flags["bell_read"]).toBe(true);
    expect(read.state.vars["bellcraft"]).toBe(6);
    expect(score(read.state)).toBe(10);
  });

  it("keeps the examine-first full-score route reachable once the bell is read", () => {
    let state = initStateForRpgPack(index, 7);
    for (const RpgAction of [
      { type: "MOVE", direction: "east" },
      { type: "LOOK", target: "cracked_bell" },
      { type: "READ", target: "cracked_bell" },
      { type: "MOVE", direction: "west" },
      { type: "READ", target: "muster_warrant" },
      { type: "MOVE", direction: "west" },
      { type: "READ", target: "tone_table" },
      { type: "MOVE", direction: "east" },
      { type: "MOVE", direction: "east" },
      { type: "TAKE", item: "tuning_hammer" },
      { type: "USE", item: "tuning_hammer", target: "alarm_clapper" },
      { type: "MOVE", direction: "west" },
      { type: "MOVE", direction: "north" },
      { type: "MOVE", direction: "north" },
    ] satisfies RpgAction[]) {
      state = act(state, RpgAction).state;
    }

    expect(state.ended).toBe(true);
    expect(state.endingId).toBe("ending_alarm_raised");
    expect(score(state)).toBe(50);
  });
});
