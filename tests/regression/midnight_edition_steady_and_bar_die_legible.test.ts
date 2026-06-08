/**
 * Regression (§15) for bug_0311 — engine/legibility: the `skill_check` annotation
 * in `available_actions` now includes `die: "d20"` so a player reading
 * `skill_check: { skill: "nerve", difficulty: 12 }` alongside `vars: { nerve: 3 }`
 * understands the roll as "d20 + nerve(3) vs 12" (60% success on 9+), not a flat
 * "3 vs 12" comparison that looks structurally impossible.
 *
 * THE FLAW. A blind playtester of *The Midnight Edition* (seed 7,
 * ai-runs/2026-06-08T10-49-23-392Z/playtest.md §4/§5) saw `steady_and_bar` at the
 * alley door carry `skill_check: { skill: "nerve", difficulty: 12 }` and `vars:
 * { nerve: 3 }` in the observation. Reading 3 < 12 as a flat comparison, they
 * concluded the check was "mechanically impossible to pass" and avoided it entirely —
 * falling back to the free `bar_door` equivalent. In fact the engine rolls d20+nerve vs
 * difficulty: d20+3 ≥ 12 requires 9+ on a d20, a 60% hit rate. The same confusion
 * class previously hit sunken_barrow (bug_0141, post-roll narration) and clockwork_heist
 * (bug_0269, pre-roll legibility). This is the pre-roll companion to bug_0141.
 *
 * THE FIX. `buildObservation` (CYOA) and `enumerateActions` (parser/RPG) now surface
 * `die: "d20"` alongside `skill` and `difficulty` in the skill_check annotation. It
 * tells any reader the check is "d20 + stat vs difficulty" — the ceiling is d20(max 20)
 * + nerve(3) = 23 ≥ 12, so the check is always passable on a better roll.
 *
 * Locked here:
 *   (1) at the alley_door, `steady_and_bar` carries `skill_check: { skill: "nerve",
 *       difficulty: 12, die: "d20" }` in the observation;
 *   (2) `die` is always "d20" — the same engine path resolves every skill check;
 *   (3) plain choices on the same scene carry NO `skill_check` field (legacy shape);
 *   (4) observation-only: adding `die` does not touch the state hash.
 */
import { describe, it, expect } from "vitest";
import { loadPackFile } from "../../src/cyoa/pack.js";
import { indexPack, buildRules, initStateForPack } from "../../src/cyoa/runner.js";
import { buildObservation } from "../../src/cyoa/observation.js";
import { makeStep } from "../../src/core/engine.js";
import { hashState } from "../../src/core/hash.js";
import type { Action } from "../../src/api/types.js";

const loaded = loadPackFile("content/cyoa/pack/midnight_edition.yaml");
if (!loaded.ok) throw new Error("midnight_edition pack must compile");
const index = indexPack(loaded.compiled.pack);
const rules = buildRules(index);
const choose = (id: string): Action => ({ type: "CHOOSE", choiceId: id });

function playFrom(seed: number, ids: string[]) {
  const step = makeStep(rules);
  let s = initStateForPack(index, seed);
  for (const id of ids) s = step(s, choose(id)).state;
  return s;
}

describe("bug_0311 — steady_and_bar skill_check annotation includes die: d20", () => {
  it("steady_and_bar at alley_door carries skill_check { skill, difficulty, die: d20 }", () => {
    const s = playFrom(7, ["go_alley"]);
    expect(s.current).toBe("alley_door");
    const obs = buildObservation(index, s);
    const sab = obs.available_actions.find((a) => a.id === "steady_and_bar");
    expect(sab, "alley_door must offer steady_and_bar").toBeDefined();
    expect(sab!.skill_check).toEqual({ skill: "nerve", difficulty: 12, die: "d20" });
  });

  it("die is always 'd20' — the engine path is the same for every skill check", () => {
    // Independently verify via a different seed to confirm it is not seed-specific.
    const s = playFrom(53, ["go_alley"]);
    const obs = buildObservation(index, s);
    const sab = obs.available_actions.find((a) => a.id === "steady_and_bar");
    expect(sab!.skill_check!.die).toBe("d20");
    // Ceiling: d20(max 20) + nerve(3) = 23 >= difficulty(12) — always passable.
    expect(20 + (s.vars["nerve"] ?? 0)).toBeGreaterThanOrEqual(sab!.skill_check!.difficulty);
  });

  it("plain choices on the alley_door carry NO skill_check field (legacy shape)", () => {
    const s = playFrom(7, ["go_alley"]);
    const obs = buildObservation(index, s);
    for (const id of ["confront_men", "bar_door"]) {
      const plain = obs.available_actions.find((a) => a.id === id);
      expect(plain, `alley_door must offer ${id}`).toBeDefined();
      expect("skill_check" in plain!).toBe(false);
    }
  });

  it("adding die does not touch the state hash (observation-only)", () => {
    const s = playFrom(7, ["go_alley"]);
    const h = hashState(s);
    // Build the observation twice — must be byte-identical and must not mutate state.
    const obs1 = buildObservation(index, s);
    const obs2 = buildObservation(index, s);
    expect(obs1).toEqual(obs2);
    expect(hashState(s)).toBe(h);
  });
});
