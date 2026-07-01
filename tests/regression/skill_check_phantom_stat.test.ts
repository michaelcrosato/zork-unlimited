/**
 * Regression for the skill-check reference boundary: a `skill_check.skill` is a
 * rolled var name, so it must be declared in `meta.vars_init`. Without this guard,
 * a typo silently rolls d20 + 0 and can make authoring look correct while the
 * intended stat is never used.
 */
import { describe, expect, it } from "vitest";
import { generateRpgPack } from "../../src/gen/rpg_generator.js";
import { compileParserPack } from "../../src/parser/pack.js";
import type { RpgPack } from "../../src/rpg/schema.js";
import { validateParser } from "../../src/validate/parser_validator.js";
import { validateRpg } from "../../src/validate/rpg_validator.js";

const CODE = "SKILL_CHECK_PHANTOM_STAT";

const codes = (findings: { code: string }[]): string[] => findings.map((f) => f.code);

function pointFirstSkillCheckAtPhantom(pack: RpgPack): void {
  for (const obj of pack.objects) {
    for (const interaction of obj.interactions) {
      if (interaction.skill_check) {
        interaction.skill_check.skill = "spectral_poise";
        interaction.skill_check.difficulty = 1;
        return;
      }
    }
  }
  throw new Error("generated RPG pack has no skill_check to mutate");
}

describe("skill_check.skill must reference a declared meta.vars_init stat", () => {
  it("rejects a parser skill_check whose skill var is undeclared", () => {
    const compiled = compileParserPack(`
meta: { id: parser_phantom_skill, title: Parser Phantom Skill, start_room: a, vars_init: { nerve: 3 } }
rooms:
  - id: a
    name: A
    description: Start.
    objects: [door]
    exits: [ { direction: north, to: b } ]
  - { id: b, name: B, description: Done. }
objects:
  - id: door
    name: door
    description: A stuck door.
    interactions:
      - verb: USE
        item: door
        target: door
        skill_check:
          skill: spectral_poise
          difficulty: 1
win_conditions:
  - { id: w, conditions: [ { visited: b } ], ending: win }
endings:
  - { id: win, title: Win, text: Done. }
`);
    expect(compiled.ok).toBe(true);
    if (!compiled.ok) return;

    const report = validateParser(compiled.compiled.pack);
    expect(report.ok).toBe(false);
    expect(codes(report.findings)).toContain(CODE);
  });

  it("rejects an RPG skill_check whose skill var is undeclared through the parser layer", () => {
    const pack = structuredClone(generateRpgPack(0));
    pointFirstSkillCheckAtPhantom(pack);

    const report = validateRpg(pack);
    expect(report.ok).toBe(false);
    expect(codes(report.findings)).toContain(CODE);
    expect(codes(report.findings)).not.toContain("SKILL_CHECK_IMPOSSIBLE");
  });
});
