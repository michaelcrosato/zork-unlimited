/**
 * Tide-Mill flood-hatch temptation: it should be an informed seeded gamble
 * before the head-race is solved, not a stale death action after the safe repair.
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

const bestRng = (): Rng => ({ next: () => 0.999999, int: (_min, max) => max });
const worstRng = (): Rng => ({ next: () => 0, int: (min) => min });

function stateAt(flags: Record<string, boolean>, vars: Record<string, number> = {}): GameState {
  const state = initStateForRpgPack(index, 173);
  return {
    ...state,
    current: "head_race",
    visited: { ...state.visited, head_race: true },
    inventory: ["crow_bar", "billhook"],
    flags: { ...state.flags, ...flags },
    vars: { ...state.vars, ...vars },
  };
}

const hatchAction: RpgAction = {
  type: "USE",
  item: "crow_bar",
  target: "flood_hatch",
};

function hatchOptions(state: GameState) {
  return enumerateRpgActions(index, state).filter((option) =>
    actionEquals(option.action, hatchAction),
  );
}

function narration(events: GameEvent[]): string {
  return events
    .filter((event): event is { type: "narration"; text: string } => event.type === "narration")
    .map((event) => event.text)
    .join("\n");
}

describe("Tide-Mill flood-hatch branch", () => {
  it("removes the hatch lever action once the safe sluice repair is already done", () => {
    const state = stateAt({ sluice_clear: true });

    expect(hatchOptions(state)).toHaveLength(0);
  });

  it("keeps the pre-repair hatch as a telegraphed lethal gamble on failed rolls", () => {
    const step = makeStep(buildRpgRules(index, worstRng));
    const state = stateAt({});

    expect(hatchOptions(state)).toHaveLength(1);
    const result = step(state, hatchAction);

    expect(result.ok).toBe(true);
    expect(result.state.ended).toBe(true);
    expect(result.state.endingId).toBe("ending_drowned");
    expect(narration(result.events)).toMatch(/exactly as the board warned/i);
  });

  it("lets a strong roll force the hatch as a risky alternate repair", () => {
    const step = makeStep(buildRpgRules(index, bestRng));
    const state = stateAt({ pawl_free: true }, { might: 8 });

    expect(hatchOptions(state)).toHaveLength(1);
    const result = step(state, hatchAction);

    expect(result.ok).toBe(true);
    expect(result.state.ended).toBe(false);
    expect(result.state.flags["sluice_clear"]).toBe(true);
    expect(result.state.vars.score).toBe(10);
    expect(narration(result.events)).toMatch(/both faults are answered/i);
    expect(hatchOptions(result.state)).toHaveLength(0);
  });
});
