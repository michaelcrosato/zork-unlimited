/**
 * Regression (§15) for bug_0080 — the opt-in engine `meta.deadline` (bug_0079) is
 * evaluated by the §8.4.5 `checkWin` hook AFTER any action's effects, including a
 * CHOICE's effects (src/core/engine.ts: checkWin runs against the post-effects
 * `next` state). But the CYOA validator's reachability/soft-lock model only taught
 * itself the deadline's structural edge for scenes whose `on_enter` advances a
 * watched var — it ignored choice-effect var writes. So a pack that advances its
 * deadline var purely through a choice effect (a natural "spend an hour searching"
 * action) had its deadline ending wrongly flagged ENDING_UNREACHABLE, failing
 * validation on a pack that ends there perfectly well at runtime.
 *
 * The clockwork pack happens to advance `ticks` only via on_enter, so it never hit
 * this — the gap was latent, surfaced while auditing the new deadline feature during
 * the clockwork_heist blind-playtest cycle (seed 7,
 * ai-runs/2026-06-01T21-21-58-139Z/playtest.md). The fix extends the validator edge
 * to also fire when any of a scene's choices write a watched var.
 *
 * Locked here, tying the validator's guarantee to real engine behaviour:
 *   (1) a deadline whose var is advanced ONLY by a choice effect validates clean —
 *       no ENDING_UNREACHABLE, no SOFTLOCK, no errors at all;
 *   (2) the engine actually ends the game at that deadline when the choice effect
 *       crosses the threshold (the validator was telling the truth);
 *   (3) the clockwork pack (whose ticks advance via on_enter, not choices) is
 *       unaffected — still validates clean with no new findings.
 */
import { describe, it, expect } from "vitest";
import { compilePack, loadPackFile } from "../../src/cyoa/pack.js";
import { indexPack, buildRules, initStateForPack } from "../../src/cyoa/runner.js";
import { validateCyoa } from "../../src/validate/cyoa_validator.js";
import { makeStep } from "../../src/core/engine.js";

// A deadline whose watched var `t` is advanced ONLY by the `wait` choice's effect —
// nothing in any on_enter touches it. At runtime, one `wait` pushes t to 3 and the
// deadline (t >= 3) ends the game at `over`.
const CHOICE_DEADLINE = `
meta:
  id: dc
  title: DC
  start: a
  vars_init: { t: 0 }
  deadline: { when: [ { var_gte: { name: t, value: 3 } } ], ending: over }
scenes:
  - id: a
    title: A
    text: x
    choices:
      - { id: wait, text: wait, effects: [ { inc_var: { name: t, by: 3 } } ], next: a }
      - { id: go, text: go, next: win }
endings:
  - { id: win, title: W, text: won }
  - { id: over, title: O, text: "out of time" }
`;

const choose = (id: string) => ({ type: "CHOOSE", choiceId: id }) as const;

describe("bug_0080 — a choice-effect-driven deadline is reachable to the validator and fires in the engine", () => {
  it("validates clean — no ENDING_UNREACHABLE / SOFTLOCK / errors", () => {
    const r = compilePack(CHOICE_DEADLINE);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const report = validateCyoa(r.compiled.pack);
    expect(report.findings.filter((f) => f.severity === "error")).toEqual([]);
    expect(report.findings.some((f) => f.code === "ENDING_UNREACHABLE")).toBe(false);
    expect(report.findings.some((f) => f.code === "SOFTLOCK")).toBe(false);
  });

  it("the engine really ends at the deadline when a choice effect crosses the threshold", () => {
    const r = compilePack(CHOICE_DEADLINE);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const index = indexPack(r.compiled.pack);
    const step = makeStep(buildRules(index));
    let s = initStateForPack(index, 1);
    s = step(s, choose("wait")).state; // inc t -> 3, checkWin fires on the post-effects state
    expect(s.ended).toBe(true);
    expect(s.endingId).toBe("over");
    expect(s.vars.t).toBeGreaterThanOrEqual(3);
  });

  it("clockwork (ticks via on_enter, not choices) is unaffected — still validates clean", () => {
    const loaded = loadPackFile("content/cyoa/pack/clockwork_heist.yaml");
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    const report = validateCyoa(loaded.compiled.pack);
    expect(report.findings.filter((f) => f.severity === "error")).toEqual([]);
  });
});
