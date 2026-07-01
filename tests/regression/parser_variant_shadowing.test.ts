/**
 * Regression (§15) for bug_0091 — the PARSER validator now flags dead reactive
 * content the same way the CYOA validator has since bug_0085/0086:
 *   - UNREACHABLE_VARIANT: in a room's / object's `variants` list (first-match-wins,
 *     model.ts roomDescription/objectDescription), a later variant whose `when` is
 *     ENTAILED by an earlier sibling's can never be the first match, so its text is
 *     dead content; and
 *   - UNSATISFIABLE_CONDITION: a variant `when` — or an exit/interaction `conditions`
 *     — whose conjunction is internally contradictory can never hold at all, so the
 *     variant never displays / the gate is never offered.
 *
 * Parser rooms (bug-era) and objects gained reactive `variants` with the exact
 * first-match-wins semantics CYOA scenes/endings have, but the parser validator never
 * checked their ordering or satisfiability — a maintainer appending a tier in the
 * wrong place, duplicating a `when`, or pinning a flag both ways would ship
 * silently-dead prose a blind playtest can't see (it simply never appears). This
 * ports the two CYOA checks to parser variants (plus the unsatisfiable-guard check to
 * exit/interaction conditions, the analogue of CYOA choice conditions).
 *
 * Soundness is the bar: a finding is emitted ONLY when entailment/contradiction is
 * provable over a pure conjunction of literals/var-bounds. Any any_of/none_of is
 * opaque and never drives a shadowing finding — no false positives (fewer cases
 * detected, never wrong ones). Locked here:
 *   (1) the shipped parser + RPG packs produce ZERO new findings and stay green;
 *   (2) general-before-specific on a var threshold is flagged;
 *   (3) a flag superset shadow and an identical `when` are flagged;
 *   (4) OBJECT variants are checked, not just room variants;
 *   (5) correctly-ordered (specific-first) and incomparable variants are NOT flagged;
 *   (6) soundness — an any_of (opaque) sibling never proves shadowing;
 *   (7) an unsatisfiable variant `when` and an unsatisfiable exit condition are flagged.
 */
import { describe, it, expect } from "vitest";
import { compileParserPack, loadParserPackFile } from "../../src/parser/pack.js";
import { loadRpgPackFile } from "../../src/rpg/pack.js";
import { validateParser } from "../../src/validate/parser_validator.js";
import { validateRpg } from "../../src/validate/rpg_validator.js";
import type { ValidationReport } from "../../src/validate/report.js";

function codes(src: string): string[] {
  const r = compileParserPack(src);
  expect(r.ok).toBe(true);
  if (!r.ok) return [];
  return validateParser(r.compiled.pack).findings.map((f) => f.code);
}

/** A minimal winnable parser pack whose start room `a` carries the given variants. */
const roomVariants = (variants: string): string => `
meta: { id: t, title: T, start_room: a }
rooms:
  - id: a
    name: A
    description: "base"
    variants:
${variants}
    exits: [{ direction: north, to: b }]
  - id: b
    name: B
    description: "B"
    exits: [{ direction: south, to: a }]
win_conditions: [{ id: w, conditions: [{ visited: b }], ending: e }]
endings: [{ id: e, title: E, text: "done" }]
`;

describe("bug_0091 — the parser validator flags dead reactive variants/guards", () => {
  it("the shipped parser + RPG packs produce ZERO new findings and stay green", () => {
    // Parser packs validate through validateParser; RPG packs through validateRpg,
    // which delegates to validateParser and so exercises the same new checks.
    const reports: ValidationReport[] = [];
    for (const path of ["content/parser/pack/sealed_crypt.yaml"]) {
      const r = loadParserPackFile(path);
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      reports.push(validateParser(r.compiled.pack));
    }
    for (const path of [
      "content/rpg/pack/cold_forge.yaml",
      "content/rpg/pack/sunken_barrow.yaml",
    ]) {
      const r = loadRpgPackFile(path);
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      reports.push(validateRpg(r.compiled.pack));
    }
    for (const report of reports) {
      const dead = report.findings.filter(
        (f) => f.code === "UNREACHABLE_VARIANT" || f.code === "UNSATISFIABLE_CONDITION",
      );
      expect(dead).toEqual([]);
      expect(report.findings.filter((f) => f.severity === "error")).toEqual([]);
    }
  });

  it("flags general-before-specific room variants on a var threshold (>=2 before >=5)", () => {
    const src = roomVariants(
      `      - { when: [ { var_gte: { name: ticks, value: 2 } } ], text: "stirring" }
      - { when: [ { var_gte: { name: ticks, value: 5 } } ], text: "dead — >=2 always wins" }`,
    );
    expect(codes(src)).toContain("UNREACHABLE_VARIANT");
  });

  it("flags a flag-superset shadow and an identical `when`", () => {
    const superset = roomVariants(
      `      - { when: [ { has_flag: a } ], text: "needs a" }
      - { when: [ { has_flag: a }, { has_flag: b } ], text: "needs a AND b — dead" }`,
    );
    expect(codes(superset)).toContain("UNREACHABLE_VARIANT");
    const dup = roomVariants(
      `      - { when: [ { has_flag: a } ], text: "first" }
      - { when: [ { has_flag: a } ], text: "duplicate — never reached" }`,
    );
    expect(codes(dup)).toContain("UNREACHABLE_VARIANT");
  });

  it("checks OBJECT variants too, not just room variants", () => {
    const src = `
meta: { id: t, title: T, start_room: a }
rooms:
  - id: a
    name: A
    description: "base"
    objects: [chest]
    exits: [{ direction: north, to: b }]
  - id: b
    name: B
    description: "B"
    exits: [{ direction: south, to: a }]
objects:
  - id: chest
    name: chest
    description: "a chest"
    variants:
      - { when: [ { has_flag: open } ], text: "open" }
      - { when: [ { has_flag: open }, { has_flag: emptied } ], text: "dead — open-only wins first" }
win_conditions: [{ id: w, conditions: [{ visited: b }], ending: e }]
endings: [{ id: e, title: E, text: "done" }]
`;
    expect(codes(src)).toContain("UNREACHABLE_VARIANT");
  });

  it("does NOT flag correctly-ordered (specific-first) or incomparable variants", () => {
    const ordered = roomVariants(
      `      - { when: [ { var_gte: { name: ticks, value: 5 } } ], text: "specific first" }
      - { when: [ { var_gte: { name: ticks, value: 2 } } ], text: "general second — both reachable" }`,
    );
    expect(codes(ordered)).not.toContain("UNREACHABLE_VARIANT");
    const incomparable = roomVariants(
      `      - { when: [ { has_flag: a } ], text: "branch a" }
      - { when: [ { has_flag: b } ], text: "branch b — independent" }`,
    );
    expect(codes(incomparable)).not.toContain("UNREACHABLE_VARIANT");
  });

  it("is SOUND: an any_of (opaque) sibling never proves shadowing", () => {
    const src = roomVariants(
      `      - { when: [ { any_of: [ { var_gte: { name: ticks, value: 2 } }, { has_flag: alarm } ] } ], text: "disjunction" }
      - { when: [ { var_gte: { name: ticks, value: 5 } } ], text: "not provably shadowed by a disjunction" }`,
    );
    expect(codes(src)).not.toContain("UNREACHABLE_VARIANT");
  });

  it("flags an unsatisfiable variant `when` (a flag pinned both ways)", () => {
    const src = roomVariants(
      `      - { when: [ { has_flag: x }, { not_flag: x } ], text: "dead — x both set and unset" }`,
    );
    expect(codes(src)).toContain("UNSATISFIABLE_CONDITION");
  });

  it("flags an unsatisfiable exit condition (crossed var bounds)", () => {
    const src = `
meta: { id: t, title: T, start_room: a, vars_init: { lvl: 0 } }
rooms:
  - id: a
    name: A
    description: "base"
    exits:
      - { direction: north, to: b }
      - { direction: east, to: b, conditions: [ { var_gte: { name: lvl, value: 5 } }, { var_lte: { name: lvl, value: 3 } } ] }
  - id: b
    name: B
    description: "B"
    exits: [{ direction: south, to: a }]
win_conditions: [{ id: w, conditions: [{ visited: b }], ending: e }]
endings: [{ id: e, title: E, text: "done" }]
`;
    expect(codes(src)).toContain("UNSATISFIABLE_CONDITION");
  });

  it("flags an unsatisfiable win_condition (the parser analogue of DEADLINE_UNFIREABLE)", () => {
    const src = `
meta: { id: t, title: T, start_room: a }
rooms:
  - id: a
    name: A
    description: "base"
    exits: [{ direction: north, to: b }]
  - id: b
    name: B
    description: "B"
    exits: [{ direction: south, to: a }]
win_conditions:
  - { id: good, conditions: [ { visited: b } ], ending: e }
  - { id: bad, conditions: [ { has_flag: done }, { not_flag: done } ], ending: e }
endings: [{ id: e, title: E, text: "done" }]
`;
    expect(codes(src)).toContain("UNSATISFIABLE_CONDITION");
  });
});
