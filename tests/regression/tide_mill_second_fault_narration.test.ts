/**
 * Regression for the Tide-Mill seed-127 blind finding: when the player fixed
 * the second mechanical fault, the success narration still claimed only one of
 * the two faults was put right.
 */
import { describe, it, expect } from "vitest";
import { loadRpgSourceFile } from "../../src/rpg/source.js";
import {
  indexRpgPack,
  buildRpgRules,
  initStateForRpgPack,
  enumerateRpgActions,
} from "../../src/rpg/runner.js";
import { actionEquals, makeStep } from "../../src/core/engine.js";
import type { Rng } from "../../src/core/rng.js";
import type { GameEvent } from "../../src/core/events.js";
import type { GameState } from "../../src/core/state.js";
import type { RpgAction } from "../../src/api/types.js";

const loaded = loadRpgSourceFile("content/rpg/quests/tide_mill.yaml");
if (!loaded.ok) throw new Error("tide_mill must compile");
const index = indexRpgPack(loaded.compiled.pack);

const bestRng = (): Rng => ({ next: () => 0.99, int: (_min, max) => max });
const step = makeStep(buildRpgRules(index, () => bestRng()));

function stateAt(room: string, inventory: string[], flags: Record<string, boolean>): GameState {
  const state = initStateForRpgPack(index, 127);
  return {
    ...state,
    current: room,
    visited: { ...state.visited, [room]: true },
    flags: { ...state.flags, ...flags },
    inventory,
  };
}

function narration(events: GameEvent[]): string {
  return events
    .filter((event): event is { type: "narration"; text: string } => event.type === "narration")
    .map((event) => event.text)
    .join("\n");
}

function useOnce(state: GameState, action: RpgAction): string {
  const matches = enumerateRpgActions(index, state).filter((option) =>
    actionEquals(option.action, action),
  );
  expect(matches).toHaveLength(1);

  const result = step(state, action);
  expect(result.ok).toBe(true);
  return narration(result.events);
}

describe("Tide-Mill second-fault repair narration", () => {
  it("says both faults are fixed when the brake-pawl is freed second", () => {
    const text = useOnce(stateAt("wheel_room", ["crow_bar"], { sluice_clear: true }), {
      type: "USE",
      item: "crow_bar",
      target: "brake_pawl",
    });

    expect(text).toMatch(/both faults are now put right/i);
    expect(text).not.toMatch(/one fault of the two/i);
  });

  it("says both faults are fixed when the head-race is cleared second", () => {
    const text = useOnce(stateAt("head_race", ["billhook"], { pawl_free: true }), {
      type: "USE",
      item: "billhook",
      target: "choked_sluice",
    });

    expect(text).toMatch(/both faults are now put right/i);
    expect(text).not.toMatch(/one fault of the two/i);
  });
});
