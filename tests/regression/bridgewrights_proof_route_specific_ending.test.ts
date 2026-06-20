/**
 * Regression for bug_0390 — Bridgewrights' Proof used one combined-route
 * journal/epilogue for both the engineering and combat resolutions.
 */
import { describe, it, expect } from "vitest";
import { loadRpgPackFile } from "../../src/rpg/pack.js";
import { indexRpgPack, buildRpgRules, initStateForRpgPack } from "../../src/rpg/runner.js";
import { buildRpgObservation } from "../../src/rpg/observation.js";
import { makeStep, actionEquals } from "../../src/core/engine.js";
import type { Action } from "../../src/api/types.js";
import type { GameState } from "../../src/core/state.js";

const loaded = loadRpgPackFile("content/rpg/pack/bridgewrights_proof.yaml");
if (!loaded.ok) throw new Error("bridgewrights_proof must compile");
const index = indexRpgPack(loaded.compiled.pack);
const rules = buildRpgRules(index);
const step = makeStep(rules);

function act(state: GameState, action: Action): GameState {
  expect(
    rules.legalActions(state).some((a) => actionEquals(a, action)),
    `action ${JSON.stringify(action)} must be legal in ${state.current}`,
  ).toBe(true);
  const result = step(state, action);
  expect(result.ok, result.rejectionReason).toBe(true);
  return result.state;
}

function lastJournal(state: GameState): string {
  const entry = state.journal[state.journal.length - 1];
  if (entry === undefined) throw new Error("expected a journal entry");
  return entry;
}

describe("bug_0390 — Bridgewrights' Proof has route-specific closure prose", () => {
  it("engineering win names the braced kingpost and not Carden's fall", () => {
    let state = initStateForRpgPack(index, 7);
    state = act(state, { type: "READ", target: "closure_order" });
    state = act(state, { type: "MOVE", direction: "east" });
    state = act(state, { type: "READ", target: "truss_plan" });
    state = act(state, { type: "TAKE", item: "brace_mallet" });
    state = act(state, { type: "MOVE", direction: "west" });
    state = act(state, { type: "MOVE", direction: "west" });
    state = act(state, { type: "READ", target: "pier_marks" });
    state = act(state, { type: "MOVE", direction: "east" });
    state = act(state, { type: "USE", item: "brace_mallet", target: "cracked_kingpost" });

    expect(state.ended).toBe(true);
    expect(state.endingId).toBe("ending_bridge_closed");
    expect(state.flags["carden_defeated"]).toBeUndefined();
    expect(lastJournal(state)).not.toMatch(/either|Carden's fall/i);

    const obs = buildRpgObservation(index, state);
    expect(obs.ending!.text).toContain("kingpost sits under a proper brace");
    expect(obs.ending!.text).not.toContain("Either");
    expect(obs.ending!.text).not.toContain("Carden's fall");
  });

  it("combat win names Carden forcing the inquiry and not a proper brace", () => {
    let state = initStateForRpgPack(index, 7);
    state = act(state, { type: "MOVE", direction: "north" });
    for (let rounds = 0; !state.flags["carden_defeated"] && rounds < 20; rounds++) {
      state = act(state, { type: "ATTACK", enemy: "carden" });
    }
    expect(state.flags["carden_defeated"]).toBe(true);
    state = act(state, { type: "MOVE", direction: "north" });

    expect(state.ended).toBe(true);
    expect(state.endingId).toBe("ending_bridge_closed");
    expect(lastJournal(state)).not.toMatch(/either|braced and closed cleanly/i);

    const obs = buildRpgObservation(index, state);
    expect(obs.ending!.text).toContain("Carden's fall has forced the inquiry");
    expect(obs.ending!.text).not.toContain("Either");
    expect(obs.ending!.text).not.toContain("kingpost sits under a proper brace");
  });
});
