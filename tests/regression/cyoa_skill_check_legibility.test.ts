/**
 * Regression (§15) for bug_0269 — engine/legibility: a skill-checked CYOA choice now
 * SURFACES the stat it rolls and the difficulty in the agent-/UI-facing observation.
 *
 * THE FLAW. A fresh blind playtester (clockwork_heist, seed 23,
 * ai-runs/2026-06-05T02-32-58-653Z/playtest.md §4/§5) flagged that the `guile` stat is
 * shown in the observation's `state.vars` the whole game but "never read or changed by
 * anything" — it reads as a vestigial number. In fact `guile` IS the var rolled by the
 * kitchen's optional `slip_out_quiet` choice (a convergent narrative-only skill check),
 * but the observation exposed only the choice `{ id, text }`, so NOTHING on screen told a
 * player a stat was ever in play. CYOA skill checks are a first-class mechanic; a declared
 * skill var that never visibly does anything is a real legibility gap.
 *
 * THE FIX. `buildObservation` now attaches a `skill_check: { skill, difficulty, die }`
 * annotation to a skill-checked choice's `available_actions` entry. It surfaces ONLY the
 * rolled var, the difficulty, and the die type — never the check's `on_success`/
 * `on_failure` effects, which carry the branch's `goto`/`end_game` routing — so the
 * destination graph stays hidden by construction, exactly as a plain choice never exposes
 * `choice.next`. `die: "d20"` was added (bug_0311) so that a player reading the
 * annotation understands the roll as "d20 + stat vs difficulty" rather than a flat
 * "stat vs difficulty" comparison that makes checks with low stats look impossible
 * (the same playtester-confusion class as sunken_barrow bug_0141). The field is OMITTED
 * on a plain choice, so the observation is byte-identical to the legacy shape for every
 * non-skill choice in every existing pack.
 *
 * Locked here:
 *   (1) the skill-checked `slip_out_quiet` choice carries `skill_check: { skill: "guile",
 *       difficulty: 12, die: "d20" }`, and ONLY those three keys (no effects/branch leak);
 *   (2) plain choices on the same scene carry NO `skill_check` field (legacy shape);
 *   (3) the annotation mirrors the pack's authored skill/difficulty exactly (die is engine-added);
 *   (4) observation-only: surfacing the field does not change the state hash.
 */
import { describe, it, expect } from "vitest";
import { loadPackFile } from "../../src/cyoa/pack.js";
import { indexPack, buildRules, initStateForPack } from "../../src/cyoa/runner.js";
import { buildObservation } from "../../src/cyoa/observation.js";
import { makeStep } from "../../src/core/engine.js";
import { hashState } from "../../src/core/hash.js";

const PACK = "content/cyoa/pack/clockwork_heist.yaml";

describe("bug_0269 — a skill-checked CYOA choice surfaces its stat + difficulty", () => {
  const loaded = loadPackFile(PACK);
  if (!loaded.ok) throw new Error("clockwork_heist failed to load");
  const index = indexPack(loaded.compiled.pack);
  const rules = buildRules(index);
  const step = makeStep(rules);

  /** Walk foyer → kitchen, where the `slip_out_quiet` skill check is offered. */
  function kitchenObs() {
    const start = initStateForPack(index, 7);
    const startObs = buildObservation(index, start);
    const toKitchen = startObs.available_actions.find((a) => a.id === "kitchens");
    expect(toKitchen, "foyer must offer the kitchen choice").toBeDefined();
    const r = step(start, { type: "CHOOSE", choiceId: "kitchens" });
    expect(r.ok).toBe(true);
    return { state: r.state, obs: buildObservation(index, r.state) };
  }

  it("annotates the skill-checked choice with exactly { skill, difficulty }", () => {
    const { obs } = kitchenObs();
    const slip = obs.available_actions.find((a) => a.id === "slip_out_quiet");
    expect(slip, "the kitchen must offer slip_out_quiet").toBeDefined();
    expect(slip!.skill_check).toEqual({ skill: "guile", difficulty: 12, die: "d20" });
    // No branch/effect leak: the surfaced object has ONLY skill + difficulty + die.
    expect(Object.keys(slip!.skill_check!).sort()).toEqual(["die", "difficulty", "skill"]);
  });

  it("leaves plain choices without a skill_check field (legacy shape)", () => {
    const { obs } = kitchenObs();
    for (const id of ["take_pick", "dumbwaiter", "back_foyer"]) {
      const plain = obs.available_actions.find((a) => a.id === id);
      expect(plain, `kitchen must offer ${id}`).toBeDefined();
      expect("skill_check" in plain!).toBe(false);
    }
  });

  it("mirrors the pack's authored skill_check exactly (die is engine-added, always d20)", () => {
    const kitchen = index.scenes.get("kitchen");
    const authored = kitchen?.choices.find((c) => c.id === "slip_out_quiet")?.skill_check;
    expect(authored).toBeDefined();
    const { obs } = kitchenObs();
    const slip = obs.available_actions.find((a) => a.id === "slip_out_quiet");
    expect(slip!.skill_check).toEqual({
      skill: authored!.skill,
      difficulty: authored!.difficulty,
      die: "d20",
    });
  });

  it("is observation-only — surfacing it does not touch the state hash", () => {
    const { state, obs } = kitchenObs();
    // Building the observation a second time must not have mutated state, and the hash is
    // a pure function of state (narration/observation are never part of it).
    const obs2 = buildObservation(index, state);
    expect(obs2).toEqual(obs);
    // A sanity anchor that the kitchen state is a real, non-ended mid-game state.
    expect(state.ended).toBe(false);
    expect(typeof hashState(state)).toBe("string");
  });
});
