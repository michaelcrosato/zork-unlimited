/**
 * Regression (§15) for bug_0086 — the CYOA validator now flags a VACUOUS guard: a
 * variant `when` or choice `conditions` whose conjunction is internally
 * contradictory, so it can never hold. Such a guard is dead for a different reason
 * than shadowing (bug_0085): not pre-empted by a sibling, but unsatisfiable in
 * itself — the variant never displays / the choice is never offered.
 *
 * Two sound contradictions over a pure conjunction:
 *   • the same flag/item/visited pinned both true and false (e.g. has_flag:x ∧ not_flag:x);
 *   • a var's `>=` lower bound exceeding its `<=` upper bound (e.g. ticks>=5 ∧ ticks<=3).
 *
 * Soundness is the bar (same as bug_0085): we reuse the conjunctive `WhenProfile`
 * and only flag a contradiction among the CONJUNCTIVE atoms — which makes the whole
 * top-level AND unsatisfiable regardless of any `any_of`/`none_of` sibling (a
 * disjunction can only further constrain). So the check has no false positives on
 * a satisfiable guard; it detects fewer cases, never wrong ones. Locked here:
 *   (1) a shipped reactive pack is NOT flagged;
 *   (2) a flag pinned both ways in a variant `when` is flagged;
 *   (3) crossed var bounds in a variant `when` are flagged;
 *   (4) a contradictory choice `conditions` is flagged;
 *   (5) ending variants are checked too;
 *   (6) a satisfiable guard (incl. one with a disjunction) is NOT flagged;
 *   (7) a contradiction in the CONJUNCTIVE part still bites even alongside a disjunction.
 */
import { describe, it, expect } from "vitest";
import { compilePack, loadPackFile } from "../../src/cyoa/pack.js";
import { validateCyoa } from "../../src/validate/cyoa_validator.js";

function codes(src: string): string[] {
  const r = compilePack(src);
  expect(r.ok).toBe(true);
  if (!r.ok) return [];
  return validateCyoa(r.compiled.pack).findings.map((f) => f.code);
}

const wrapVariants = (variants: string): string => `
meta: { id: t, title: T, start: s, flags_init: [], vars_init: { ticks: 0 } }
scenes:
  - id: s
    title: S
    text: "base"
    variants:
${variants}
    choices: [ { id: g, text: go, next: e } ]
endings: [ { id: e, title: E, text: "done" } ]
`;

describe("bug_0086 — the validator flags vacuous (always-false) guards", () => {
  it("a shipped reactive pack is NOT flagged", () => {
    for (const path of ["content/cyoa/pack/watchtower_road.yaml"]) {
      const r = loadPackFile(path);
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      const found = validateCyoa(r.compiled.pack).findings.map((f) => f.code);
      expect(found).not.toContain("UNSATISFIABLE_CONDITION");
    }
  });

  it("flags a variant whose `when` pins a flag both true and false", () => {
    const src = wrapVariants(
      `      - { when: [ { has_flag: alarm }, { not_flag: alarm } ], text: "impossible" }`,
    );
    expect(codes(src)).toContain("UNSATISFIABLE_CONDITION");
  });

  it("flags crossed var bounds in a variant `when` (>=5 and <=3)", () => {
    const src = wrapVariants(
      `      - { when: [ { var_gte: { name: ticks, value: 5 } }, { var_lte: { name: ticks, value: 3 } } ], text: "empty interval" }`,
    );
    expect(codes(src)).toContain("UNSATISFIABLE_CONDITION");
  });

  it("flags a contradictory choice `conditions` (item pinned both ways)", () => {
    const src = `
meta: { id: t, title: T, start: s }
scenes:
  - id: s
    title: S
    text: "x"
    choices:
      - { id: dead, text: dead, conditions: [ { has_item: key }, { not_item: key } ], next: e }
      - { id: g, text: go, next: e }
endings: [ { id: e, title: E, text: "done" } ]
`;
    expect(codes(src)).toContain("UNSATISFIABLE_CONDITION");
  });

  it("checks ending variants too", () => {
    const src = `
meta: { id: t, title: T, start: s }
scenes:
  - { id: s, title: S, text: "x", choices: [ { id: g, text: go, next: e } ] }
endings:
  - id: e
    title: E
    text: "base"
    variants:
      - { when: [ { has_flag: won }, { not_flag: won } ], text: "impossible epilogue" }
`;
    expect(codes(src)).toContain("UNSATISFIABLE_CONDITION");
  });

  it("does NOT flag a satisfiable guard, including one with a disjunction", () => {
    const src = wrapVariants(
      `      - { when: [ { any_of: [ { has_flag: a }, { has_flag: b } ] }, { var_gte: { name: ticks, value: 2 } } ], text: "fine" }`,
    );
    expect(codes(src)).not.toContain("UNSATISFIABLE_CONDITION");
  });

  it("still bites when the CONJUNCTIVE part is contradictory alongside a disjunction", () => {
    // The any_of is opaque, but the conjunctive atoms (has_flag:x ∧ not_flag:x) are
    // already contradictory, so the whole AND is unsatisfiable regardless.
    const src = wrapVariants(
      `      - { when: [ { has_flag: x }, { not_flag: x }, { any_of: [ { has_flag: a }, { has_flag: b } ] } ], text: "dead despite the or" }`,
    );
    expect(codes(src)).toContain("UNSATISFIABLE_CONDITION");
  });
});
