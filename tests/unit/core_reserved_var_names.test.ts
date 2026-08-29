import { describe, it, expect } from "vitest";
import { initState, readVar } from "../../src/core/state.js";
import { applyEffect, applyEffects } from "../../src/core/effects.js";
import { evalCondition } from "../../src/core/conditions.js";
import { resolveSkillCheck } from "../../src/core/skill_check.js";
import { assertWellFormedState } from "../../src/persist/save_load.js";

const base = () => initState({ seed: 1, start: "room0" });

/**
 * `set_var: { name: "__proto__" }` is schema-valid content (the name is only
 * `z.string().min(1)`) and no validator rejects it. Core hardens that key in
 * `hash.ts`, `initState` and `cloneGameState`; the numeric var READ path was the
 * one place left where a plain bracket read resolved Object.prototype's inherited
 * accessor instead of the absent own key.
 */
describe("a var named __proto__ reads as an ordinary unwritten var", () => {
  it("reads 0 on a fresh state instead of the inherited prototype object", () => {
    expect(readVar(base().vars, "__proto__")).toBe(0);
  });

  it("increments to a real number and leaves the state saveable", () => {
    const { state, events } = applyEffects([{ inc_var: { name: "__proto__", by: 5 } }], base());

    // Before the fix `prior` was Object.prototype, so `prior + by` was the STRING
    // "[object Object]5"; guardFinite rejected it and wrote the prototype OBJECT
    // back into a Record<string, number>.
    expect(typeof state.vars["__proto__"]).toBe("number");
    expect(state.vars["__proto__"]).toBe(5);
    expect(Object.prototype.hasOwnProperty.call(state.vars, "__proto__")).toBe(true);
    expect(events).toEqual([
      { type: "state_change", effect: "inc_var", name: "__proto__", value: 5, delta: 5 },
    ]);

    // The consequence that made this a crash rather than a curiosity: the poisoned
    // state failed save integrity ("vars.__proto__ expected number, received object"),
    // which is a hard failure for the MCP save path and the crawler's PERSIST oracle.
    expect(() => assertWellFormedState(state)).not.toThrow();
  });

  it("decrements from a prior value like any other var", () => {
    const set = applyEffect({ set_var: { name: "__proto__", value: 7 } }, base()).state;
    const dec = applyEffect({ dec_var: { name: "__proto__", by: 2 } }, set);

    expect(dec.state.vars["__proto__"]).toBe(5);
    expect(dec.event).toEqual({
      type: "state_change",
      effect: "dec_var",
      name: "__proto__",
      value: 5,
      delta: -2,
    });
  });

  it("keeps gate semantics total: unwritten means 0 in BOTH directions", () => {
    const state = base();

    // Previously var_gte(>= 1) AND var_lte(<= 0) were both false, which no numeric
    // var may be — it is the "an unwritten var reads as 0" rule the validators'
    // feasibility models (PHANTOM_VAR, IMPOSSIBLE_GATE) are built on.
    expect(evalCondition({ var_gte: { name: "__proto__", value: 1 } }, state)).toBe(false);
    expect(evalCondition({ var_lte: { name: "__proto__", value: 0 } }, state)).toBe(true);
    expect(evalCondition({ var_eq: { name: "__proto__", value: 0 } }, state)).toBe(true);
  });

  it("keeps a skill check numeric when the skill itself is named __proto__", () => {
    const resolution = resolveSkillCheck(base(), {
      skill: "__proto__",
      difficulty: 9,
      on_success: [{ set_flag: "passed" }],
      on_failure: [{ set_flag: "failed" }],
    });

    const lead = resolution.effects[0];
    expect(lead).toBeDefined();
    expect("narrate" in lead!).toBe(true);
    const narration = (lead as { narrate: string }).narrate;
    // "d20 <roll> + 0 = <roll>", never "+ [object Object] = 3[object Object]".
    expect(narration).toMatch(/^__proto__ check: d20 (\d+) \+ 0 = \1 vs 9 — (success|failure)\.$/);
  });
});
