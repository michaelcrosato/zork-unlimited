/**
 * Regression for the first Tide-Mill blind finding: after the crank-handle was taken,
 * later Wheel-Room variants could still say it hung on its peg. The fix is pure content
 * variant ordering: held-handle states must beat the broader sluice/pawl variants.
 */
import { describe, it, expect } from "vitest";
import { loadRpgSourceFile } from "../../src/rpg/source.js";
import { indexRpgPack, buildRpgRules, initStateForRpgPack } from "../../src/rpg/runner.js";
import { buildRpgObservation } from "../../src/rpg/observation.js";
import { validateRpg } from "../../src/validate/rpg_validator.js";
import { makeStep, actionEquals } from "../../src/core/engine.js";
import type { GameState } from "../../src/core/state.js";
import type { RpgAction } from "../../src/api/types.js";

const loaded = loadRpgSourceFile("content/rpg/quests/tide_mill.yaml");
if (!loaded.ok) throw new Error("tide_mill must compile");
const pack = loaded.compiled.pack;
const index = indexRpgPack(pack);
const rules = buildRpgRules(index);
const step = makeStep(rules);

function act(state: GameState, action: RpgAction): GameState {
  expect(
    rules.legalActions(state).some((candidate) => actionEquals(candidate, action)),
    `RpgAction ${JSON.stringify(action)} must be legal in ${state.current}`,
  ).toBe(true);
  const result = step(state, action);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error("step failed");
  return result.state;
}

function desc(state: GameState): string {
  return buildRpgObservation(index, state).description.replace(/\s+/g, " ");
}

function visibleIds(state: GameState): string[] {
  return buildRpgObservation(index, state).visible_objects.map((object) => object.id);
}

function wheelRoomWithHeldCrank(flags: Record<string, boolean>): GameState {
  const state = initStateForRpgPack(index, 73);
  return {
    ...state,
    current: "wheel_room",
    flags: { ...state.flags, crank_handle_taken: true, ...flags },
    inventory: [...state.inventory, "crank_handle"],
  };
}

describe("Tide-Mill Wheel-Room reacts to the taken crank-handle", () => {
  it("the pack still validates green", () => {
    const report = validateRpg(pack);
    expect(report.ok).toBe(true);
    expect(report.findings.filter((finding) => finding.severity === "error")).toEqual([]);
  });

  it("after the real take action, the room names the bare peg instead of the hanging handle", () => {
    let state = initStateForRpgPack(index, 73);
    state = act(state, { type: "MOVE", direction: "north" });
    expect(state.current).toBe("wheel_room");
    expect(desc(state)).toContain("handle itself hangs on a peg");

    state = act(state, { type: "TAKE", item: "crank_handle" });

    expect(state.inventory).toContain("crank_handle");
    expect(desc(state)).toContain("peg beside it is bare");
    expect(desc(state)).not.toMatch(/crank-handle hangs on (?:a|its) peg/i);
    expect(visibleIds(state)).not.toContain("crank_handle");
  });

  it.each([
    ["sluice clear", { sluice_clear: true }],
    ["pawl free", { pawl_free: true }],
    ["both faults fixed", { sluice_clear: true, pawl_free: true }],
  ])("keeps the peg bare in the held-handle %s variant", (_label, flags) => {
    const state = wheelRoomWithHeldCrank(flags);
    const text = desc(state);

    expect(text).not.toMatch(/crank-handle hangs on (?:a|its) peg/i);
    expect(text).not.toContain("handle itself hangs on a peg");
    expect(text).toMatch(/crank-handle (?:is already in your kit|in your kit)/i);
    expect(visibleIds(state)).not.toContain("crank_handle");
  });
});
