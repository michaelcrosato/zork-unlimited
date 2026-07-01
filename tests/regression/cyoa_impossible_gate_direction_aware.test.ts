/**
 * Regression (§15) for bug_0110 — the CYOA choice-feasibility check (IMPOSSIBLE_GATE)
 * is now DIRECTION-AWARE for `var_gte`, the choice-gate sibling of the deadline fix
 * bug_0109.
 *
 * The feasibility loop flags a choice whose condition requires a var bound that no
 * effect can ever satisfy (the choice would never be offered). bug_0110 closes the
 * same coarse-test gap bug_0109 closed for deadlines: for a `var_gte: V` gate needing
 * a raise above init, the old code only asked `writes.writtenVars.has(name)` — "is the
 * var written at ALL?" — ignoring direction. A var that IS written but only ever DROPS
 * (every write a dec_var, an inc_var with by<=0, or a set_var that lands BELOW V)
 * starts below V and can never reach it: the gate is exactly as impossible as if the
 * var were never written, yet the coarse test passed it. Now the `var_gte` branch
 * reuses `varCanReachGte` (the directional VarWrite data collectFalsifiers builds,
 * hoisted and shared) and errors unless some write can actually raise the var to the
 * bound.
 *
 * Soundness, same stance as bug_0109: only flag the PROVABLY impossible. The `var_eq`
 * branch is LEFT on the coarse "is it ever written?" test — an inc/dec/set could land
 * on an `==` value, so a written var is not provably dead. A positive synthetic
 * `var_gte` pack below locks the soundness case where an increment can satisfy the gate.
 */
import { describe, it, expect } from "vitest";
import { compilePack } from "../../src/cyoa/pack.js";
import { validateCyoa } from "../../src/validate/cyoa_validator.js";

function codes(src: string): string[] {
  const r = compilePack(src);
  expect(r.ok).toBe(true);
  if (!r.ok) return [];
  return validateCyoa(r.compiled.pack).findings.map((f) => f.code);
}

// A scene whose `gated` choice requires `doom >= 5` from a sub-bound init (0), with
// `doom` driven ONLY by the supplied effect on a self-loop tick choice — so the var IS
// written (the coarse test would pass), and only the direction decides feasibility.
// `leave` keeps an unconditional path to the ending so the only var-keyed signal under
// test is IMPOSSIBLE_GATE on the gated choice.
const gatePack = (doomEffect: string, gate = "{ var_gte: { name: doom, value: 5 } }"): string => `
meta:
  id: t
  title: T
  start: s
  flags_init: []
  vars_init: { doom: 0 }
scenes:
  - id: s
    title: S
    text: "x"
    choices:
      - { id: tick, text: tick, effects: [ ${doomEffect} ], next: s }
      - { id: gated, text: gated, conditions: [ ${gate} ], next: e }
      - { id: leave, text: leave, next: e }
endings:
  - { id: e, title: E, text: "done" }
`;

describe("bug_0110 — a var-gte choice gate whose var only ever DROPS is flagged impossible", () => {
  it("flags a gate whose watched var is only ever DECREMENTED", () => {
    expect(codes(gatePack("{ dec_var: { name: doom, by: 1 } }"))).toContain("IMPOSSIBLE_GATE");
  });

  it("flags a gate whose var is only ever SET below the bound", () => {
    expect(codes(gatePack("{ set_var: { name: doom, value: 2 } }"))).toContain("IMPOSSIBLE_GATE");
  });

  it("flags a gate whose var is only INCREMENTED by a non-positive amount", () => {
    expect(codes(gatePack("{ inc_var: { name: doom, by: 0 } }"))).toContain("IMPOSSIBLE_GATE");
  });

  it("does NOT flag when some effect can RAISE the var to the bound (positive inc) — soundness", () => {
    expect(codes(gatePack("{ inc_var: { name: doom, by: 1 } }"))).not.toContain("IMPOSSIBLE_GATE");
  });

  it("does NOT flag when a `set` lands AT/ABOVE the bound — soundness", () => {
    expect(codes(gatePack("{ set_var: { name: doom, value: 7 } }"))).not.toContain(
      "IMPOSSIBLE_GATE",
    );
  });

  it("does NOT flag a `var_eq` gate on a written (decrement-only) var — eq stays on the coarse test", () => {
    // An inc/dec/set could land ON an `==` value, so a written var is not provably
    // dead for `eq`; only an entirely unwritten var is. (Here doom IS written.)
    expect(
      codes(gatePack("{ dec_var: { name: doom, by: 1 } }", "{ var_eq: { name: doom, value: 5 } }")),
    ).not.toContain("IMPOSSIBLE_GATE");
  });

  it("still flags a `var_eq` gate on an entirely UNWRITTEN var (coarse test retained)", () => {
    // `other` is never written anywhere, and eq value differs from init 0.
    expect(
      codes(
        gatePack("{ dec_var: { name: doom, by: 1 } }", "{ var_eq: { name: other, value: 3 } }"),
      ),
    ).toContain("IMPOSSIBLE_GATE");
  });
});
