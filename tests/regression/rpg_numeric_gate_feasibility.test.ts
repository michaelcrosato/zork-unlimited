/**
 * Numeric-gate feasibility (IMPOSSIBLE_GATE on var_gte/var_lte/var_eq) and
 * PHANTOM_VAR.
 *
 * The validator audited every SYMBOLIC gate for unsatisfiability — has_flag,
 * has_item, quest_stage, is_open/is_unlocked — and never looked at the numeric
 * ones. A quest whose only win condition was `var_gte: { name: resolve, value: 5 }`
 * with nothing anywhere writing `resolve` therefore validated green while being
 * unwinnable, and a typo'd var name silently compared against 0 because
 * `evalCondition` reads `state.vars[name] ?? 0`.
 *
 * The analysis is a deliberate OVER-approximation of the reachable range, so the
 * load-bearing assertions here are the ones proving it MISSES rather than
 * false-rejects: a reachable-but-not-attainable value inside the interval must
 * stay green, and a combat-volatile var must never be judged at all. Getting that
 * direction wrong rejects shipped content.
 */
import { describe, expect, it } from "vitest";

import { compileRpgSource } from "../../src/rpg/source.js";
import { validateRpgFoundation } from "../../src/validate/rpg_foundation_validator.js";
import { validateRpg } from "../../src/validate/rpg_validator.js";
import type { Finding } from "../../src/validate/report.js";
import type { RpgPack } from "../../src/rpg/schema.js";

/** A two-room skeleton whose win is reachable, so only the injected gate can fail. */
function packSource(opts: { varsInit?: string; gate: string; effects?: string }): string {
  return `
meta:
  id: numeric_gate_fixture
  title: Numeric Gate Fixture
  start_room: a
  vars_init: { hp: 10, attack: 2, defense: 1${opts.varsInit ?? ""} }
rooms:
  - id: a
    name: A
    description: Room A.
    objects: [lever]
    exits: [{ direction: north, to: b }]
  - id: b
    name: B
    description: Room B.
    exits: [{ direction: south, to: a }]
objects:
  - id: lever
    name: iron lever
    aliases: [lever]
    description: A lever.
    interactions:
      - verb: USE
        target: lever
        effects: [${opts.effects ?? "{ set_flag: pulled }"}]
win_conditions: [{ id: w, conditions: [${opts.gate}], ending: e }]
endings: [{ id: e, title: End, text: Done. }]
`;
}

function compile(source: string): RpgPack {
  const loaded = compileRpgSource(source);
  expect(loaded.ok, "fixture must be schema-valid — unsound, not malformed").toBe(true);
  if (!loaded.ok) throw new Error("unreachable");
  return loaded.compiled.pack;
}

function findings(opts: { varsInit?: string; gate: string; effects?: string }): Finding[] {
  return validateRpgFoundation(compile(packSource(opts))).findings;
}

function codes(f: Finding[]): string[] {
  return f.map((x) => x.code);
}

describe("numeric gate feasibility", () => {
  it("rejects a win gated on a var no effect can ever raise (the shipped-unwinnable case)", () => {
    const f = findings({
      varsInit: ", resolve: 0",
      gate: "{ var_gte: { name: resolve, value: 5 } }",
    });
    const gate = f.filter((x) => x.code === "IMPOSSIBLE_GATE");
    expect(gate).toHaveLength(1);
    expect(gate[0]!.severity).toBe("error");
    expect(gate[0]!.message).toContain('var "resolve" >= 5');
    expect(gate[0]!.where).toEqual(["win:w"]);
  });

  it("rejects a var_lte below everything the var can reach", () => {
    const f = findings({
      varsInit: ", resolve: 0",
      gate: "{ var_lte: { name: resolve, value: -3 } }",
      effects: "{ inc_var: { name: resolve, by: 1 } }",
    });
    expect(codes(f)).toContain("IMPOSSIBLE_GATE");
    expect(f.find((x) => x.code === "IMPOSSIBLE_GATE")!.message).toContain('var "resolve" <= -3');
  });

  it("rejects a var_eq outside the reachable interval on both sides", () => {
    const above = findings({
      varsInit: ", resolve: 0",
      gate: "{ var_eq: { name: resolve, value: 9 } }",
      effects: "{ set_var: { name: resolve, value: 4 } }",
    });
    expect(codes(above)).toContain("IMPOSSIBLE_GATE");

    const below = findings({
      varsInit: ", resolve: 2",
      gate: "{ var_eq: { name: resolve, value: -1 } }",
      effects: "{ set_var: { name: resolve, value: 4 } }",
    });
    expect(codes(below)).toContain("IMPOSSIBLE_GATE");
  });

  it("accepts a gate an inc_var can climb to, however many steps it takes", () => {
    const f = findings({
      varsInit: ", resolve: 0",
      gate: "{ var_gte: { name: resolve, value: 5 } }",
      effects: "{ inc_var: { name: resolve, by: 1 } }",
    });
    expect(codes(f)).not.toContain("IMPOSSIBLE_GATE");
  });

  it("treats a negative dec_var as an increase (the `by` literal is sign-significant)", () => {
    const f = findings({
      varsInit: ", resolve: 0",
      gate: "{ var_gte: { name: resolve, value: 5 } }",
      effects: "{ dec_var: { name: resolve, by: -1 } }",
    });
    expect(codes(f)).not.toContain("IMPOSSIBLE_GATE");
  });

  // ── Soundness direction: the analysis may only MISS ─────────────────────────
  it("MISSES an unattainable value inside the interval rather than rejecting it", () => {
    // Writes are init 0 and a single `set_var: 8`, so `resolve` only ever holds 0 or 8.
    // 5 is genuinely unreachable, but it sits inside [0, 8] and must NOT be flagged —
    // over-approximating is what keeps this check from rejecting healthy packs.
    const f = findings({
      varsInit: ", resolve: 0",
      gate: "{ var_gte: { name: resolve, value: 5 } }",
      effects: "{ set_var: { name: resolve, value: 8 } }",
    });
    expect(codes(f)).not.toContain("IMPOSSIBLE_GATE");
  });

  it("never judges a combat-volatile var, whose writes are not authored effects", () => {
    // hp/attack/defense and enemy HP are written by src/rpg/combat.ts through a dynamic
    // set_var no effect scan can see. A range built without them would be far too narrow.
    for (const stat of ["hp", "attack", "defense"]) {
      const f = findings({ gate: `{ var_gte: { name: ${stat}, value: 999 } }` });
      expect(codes(f), `${stat} must be exempt`).not.toContain("IMPOSSIBLE_GATE");
    }
  });

  it("descends all_of but not any_of, matching the other feasibility collectors", () => {
    const inAnd = findings({
      varsInit: ", resolve: 0",
      gate: "{ all_of: [{ visited: b }, { var_gte: { name: resolve, value: 5 } }] }",
    });
    expect(codes(inAnd)).toContain("IMPOSSIBLE_GATE");

    // A disjunct can be satisfied by its sibling, so flagging it would be a false positive.
    const inOr = findings({
      varsInit: ", resolve: 0",
      gate: "{ any_of: [{ visited: b }, { var_gte: { name: resolve, value: 5 } }] }",
    });
    expect(codes(inOr)).not.toContain("IMPOSSIBLE_GATE");
  });
});

describe("PHANTOM_VAR", () => {
  it("rejects a gate naming a var that is neither declared nor written", () => {
    const f = findings({
      varsInit: ", resolve: 0",
      gate: "{ var_lte: { name: reslove, value: 5 } }",
    });
    const phantom = f.filter((x) => x.code === "PHANTOM_VAR");
    expect(phantom).toHaveLength(1);
    expect(phantom[0]!.severity).toBe("error");
    expect(phantom[0]!.message).toContain('var "reslove"');
  });

  it("accepts a var that is written but never declared in vars_init", () => {
    const f = findings({
      gate: "{ var_gte: { name: tally, value: 1 } }",
      effects: "{ inc_var: { name: tally, by: 1 } }",
    });
    expect(codes(f)).not.toContain("PHANTOM_VAR");
  });

  it("accepts a var that is declared but never written", () => {
    const f = findings({
      varsInit: ", resolve: 3",
      gate: "{ var_lte: { name: resolve, value: 5 } }",
    });
    expect(codes(f)).not.toContain("PHANTOM_VAR");
  });

  it("exempts score, which content increments without declaring", () => {
    const f = findings({ gate: "{ var_gte: { name: score, value: 0 } }" });
    expect(codes(f)).not.toContain("PHANTOM_VAR");
  });

  it("sees reads inside a variant `when:`, which the AND-context collectors skip", () => {
    // 11 of wolf_winter's numeric gates live in variant `when:` blocks. A typo is a typo
    // wherever it appears, so PHANTOM_VAR walks every condition-bearing site.
    const pack = compile(`
meta:
  id: phantom_variant_fixture
  title: Phantom Variant Fixture
  start_room: a
  vars_init: { hp: 10, attack: 2, defense: 1, resolve: 0 }
rooms:
  - id: a
    name: A
    description: Room A.
    variants:
      - when: [{ var_gte: { name: reslove, value: 1 } }]
        text: Room A, resolved.
    exits: [{ direction: north, to: b }]
  - id: b
    name: B
    description: Room B.
    exits: [{ direction: south, to: a }]
win_conditions: [{ id: w, conditions: [{ visited: b }], ending: e }]
endings: [{ id: e, title: End, text: Done. }]
`);
    const f = validateRpgFoundation(pack).findings;
    const phantom = f.filter((x) => x.code === "PHANTOM_VAR");
    expect(phantom).toHaveLength(1);
    expect(phantom[0]!.where).toEqual(["room:a", "variant:0"]);
  });
});

describe("shipped content stays clean under the new checks", () => {
  it("flags neither code on a pack whose numeric gates are all reachable", () => {
    // Mirrors the shape wolf_winter uses: a declared counter, effects that move it,
    // and gates on both sides of the range.
    const pack = compile(`
meta:
  id: reachable_gates_fixture
  title: Reachable Gates Fixture
  start_room: a
  vars_init: { hp: 10, attack: 2, defense: 1, alarm: 2, drive: 0 }
rooms:
  - id: a
    name: A
    description: Room A.
    objects: [lever]
    exits: [{ direction: north, to: b }]
  - id: b
    name: B
    description: Room B.
    exits: [{ direction: south, to: a }]
objects:
  - id: lever
    name: iron lever
    aliases: [lever]
    description: A lever.
    interactions:
      - verb: USE
        target: lever
        conditions: [{ var_lte: { name: alarm, value: 3 } }]
        effects:
          - { inc_var: { name: drive, by: 1 } }
          - { dec_var: { name: alarm, by: 1 } }
win_conditions:
  [{ id: w, conditions: [{ all_of: [{ visited: b }, { var_gte: { name: drive, value: 2 } }] }], ending: e }]
endings: [{ id: e, title: End, text: Done. }]
`);
    const report = validateRpg(pack);
    expect(codes(report.findings)).not.toContain("IMPOSSIBLE_GATE");
    expect(codes(report.findings)).not.toContain("PHANTOM_VAR");
  });
});
