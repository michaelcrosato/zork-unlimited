/**
 * Regression for validator coverage of effects nested under skill_check branches.
 *
 * Skill checks are authored interactions/choices; their on_success/on_failure lists
 * can route, set flags, award score, grant/remove items, and end the game. Static
 * validation must scan those branch effects just like direct interaction effects,
 * otherwise branch-only typos slip past reference checks and branch-provided state
 * is misread as impossible.
 */
import { describe, expect, it } from "vitest";
import { compileParserPack } from "../../src/parser/pack.js";
import { validateParser } from "../../src/validate/parser_validator.js";

const codes = (findings: { code: string }[]): string[] => findings.map((f) => f.code);

describe("validator scans skill_check branch effects", () => {
  it("rejects a parser skill_check branch that targets an undeclared ending", () => {
    const compiled = compileParserPack(`
meta: { id: parser_branch_end, title: Parser Branch End, start_room: a, vars_init: { nerve: 3 } }
rooms:
  - id: a
    name: A
    description: Start.
    objects: [lever]
    exits: [ { direction: north, to: b } ]
  - { id: b, name: B, description: Done. }
objects:
  - id: lever
    name: lever
    description: A lever.
    interactions:
      - verb: USE
        item: lever
        target: lever
        skill_check:
          skill: nerve
          difficulty: 1
          on_success: [ { end_game: missing_ending } ]
win_conditions:
  - { id: w, conditions: [ { visited: b } ], ending: win }
endings:
  - { id: win, title: Win, text: Done. }
`);
    expect(compiled.ok).toBe(true);
    if (!compiled.ok) return;

    const report = validateParser(compiled.compiled.pack);
    expect(report.ok).toBe(false);
    expect(codes(report.findings)).toContain("END_GAME_UNDECLARED");
  });

  it("allows a parser gate satisfied only by a skill_check branch set_flag", () => {
    const compiled = compileParserPack(`
meta: { id: parser_branch_flag, title: Parser Branch Flag, start_room: a, vars_init: { nerve: 3 } }
rooms:
  - id: a
    name: A
    description: Start.
    objects: [lever]
    exits:
      - { direction: north, to: b, conditions: [ { has_flag: opened } ] }
  - { id: b, name: B, description: Done. }
objects:
  - id: lever
    name: lever
    description: A lever.
    interactions:
      - verb: USE
        item: lever
        target: lever
        skill_check:
          skill: nerve
          difficulty: 1
          on_success: [ { set_flag: opened } ]
          on_failure: [ { set_flag: opened } ]
win_conditions:
  - { id: w, conditions: [ { visited: b } ], ending: win }
endings:
  - { id: win, title: Win, text: Done. }
`);
    expect(compiled.ok).toBe(true);
    if (!compiled.ok) return;

    const report = validateParser(compiled.compiled.pack);
    expect(codes(report.findings)).not.toContain("IMPOSSIBLE_GATE");
  });
});
