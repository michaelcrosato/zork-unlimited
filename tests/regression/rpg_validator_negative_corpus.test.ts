/**
 * bug_0182 — a SoundnessBench-style NEGATIVE CORPUS for `validateRpg`: a set of
 * deliberately-UNSOUND RPG packs the Stage-4 validator MUST REJECT, each pinning ONE
 * previously-untested error branch in the REJECTION direction.
 *
 * This is the generator/validator-boundary twin of bug_0181's load-boundary rejection
 * gate. The motivating gap (SoundnessBench, arXiv:2412.03154; the single-checker blind
 * spot, arXiv:2510.14253 / [[verifier-assertion-guard]]): a checker is only proven
 * sound if its FAILING branches are exercised on input that SHOULD fail. An audit of
 * the suite (bug_0182) found `validateRpg` emits ten error codes, but SIX had NO
 * rejection-direction witness anywhere in the test suite — only COMBAT_UNWINNABLE,
 * COMBAT_NOT_GUARANTEED, COMBAT_GAUNTLET_NOT_GUARANTEED and ENEMY_DEATH_ENDING_UNDECLARED
 * were pinned red-going. So a regression that silently broke any of the six (a dropped
 * `findings.push`, an inverted guard, a `??` default that swallows the case) would pass
 * every existing test GREEN — the present-but-untested-checker surface.
 *
 * The six this corpus closes:
 *   - MISSING_STAT            — meta.vars_init lacks a required HP/attack/defense stat
 *   - BAD_HP                  — starting HP is not positive
 *   - ENEMY_ROOM_MISSING      — an enemy stands in a room that does not exist
 *   - ENEMY_DEATH_NOT_DEATH   — an enemy's death_ending names a NON-death ending
 *   - SKILL_CHECK_IMPOSSIBLE  — a check whose difficulty exceeds d20 + best skill
 *   - END_GAME_UNDECLARED     — an RPG-only branch (on_defeat) ends at an undeclared ending
 *
 * Method (the bug_0118/0179 copy-mutate discipline): the GREEN base is the canonical
 * sound pack `generateRpgPack(0)` — it validates clean and carries every structure the
 * defects need (two enemies with on_defeat, a `might` skill_check, vars_init stats, a
 * declared non-death ending). Each case structuredClone()s it and introduces EXACTLY
 * ONE defect, so the rejection is attributable to that mutation alone. The differential
 * anchor (`the green base is clean and carries none of these codes`) proves the code is
 * absent until the mutation introduces it — never a code the base already raised.
 *
 * PURELY ADDITIVE: a new regression test + a bug artifact. No source/validator/engine/
 * schema/generator/corpus/protected-file change, no hash re-pin — the validator is
 * exercised exactly as shipped.
 */
import { describe, it, expect } from "vitest";
import { generateRpgPack } from "../../src/gen/rpg_generator.js";
import { validateRpg } from "../../src/validate/rpg_validator.js";
import type { RpgPack } from "../../src/rpg/schema.js";

// The canonical sound pack: validates clean (pinned green by rpg_generator.test.ts).
const GREEN: RpgPack = generateRpgPack(0);

const codesOf = (pack: RpgPack): string[] =>
  validateRpg(pack)
    .findings.filter((f) => f.severity === "error")
    .map((f) => f.code);

/** The base pack always has enemies; this narrows the index access for the typechecker. */
const firstEnemy = (p: RpgPack) => {
  const e = p.enemies[0];
  if (!e) throw new Error("base pack has no enemy to mutate");
  return e;
};

/** Each case = one single-defect mutation of the GREEN base, expected to emit `code`. */
interface NegativeCase {
  code: string;
  why: string;
  mutate: (p: RpgPack) => void;
}

const CASES: NegativeCase[] = [
  {
    code: "MISSING_STAT",
    why: "meta.vars_init drops the required defense stat",
    mutate: (p) => {
      delete (p.meta.vars_init as Record<string, number>).defense;
    },
  },
  {
    code: "BAD_HP",
    why: "starting HP is zero (present, but not positive)",
    mutate: (p) => {
      p.meta.vars_init.hp = 0;
    },
  },
  {
    code: "ENEMY_ROOM_MISSING",
    why: "an enemy stands in a room id that does not exist",
    mutate: (p) => {
      firstEnemy(p).room = "no_such_room";
    },
  },
  {
    code: "ENEMY_DEATH_NOT_DEATH",
    why: "an enemy's death_ending points at a declared NON-death ending",
    mutate: (p) => {
      const nonDeath = p.endings.find((e) => !e.death);
      if (!nonDeath) throw new Error("base pack has no non-death ending to point at");
      firstEnemy(p).death_ending = nonDeath.id;
    },
  },
  {
    code: "SKILL_CHECK_IMPOSSIBLE",
    why: "a skill check's difficulty exceeds d20 + the best reachable skill",
    mutate: (p) => {
      let found = false;
      for (const o of p.objects)
        for (const it of o.interactions)
          if (it.skill_check) {
            // best `might` ceiling is small (init 3, no buff) ⇒ d20+might tops out ~23.
            it.skill_check.difficulty = 100;
            found = true;
          }
      if (!found) throw new Error("base pack has no skill_check to make impossible");
    },
  },
  {
    code: "END_GAME_UNDECLARED",
    why: "an RPG-only branch (enemy on_defeat) ends at an undeclared ending",
    mutate: (p) => {
      // on_defeat is an RPG-only effect list the PARSER validator never scans, so this
      // exercises validateRpg's own END_GAME_UNDECLARED loop specifically.
      firstEnemy(p).on_defeat.push({ end_game: "no_such_ending" } as never);
    },
  },
];

describe("validateRpg negative corpus — rejection-direction witnesses (bug_0182)", () => {
  it("the GREEN base validates clean and carries none of the targeted codes (differential anchor)", () => {
    const base = codesOf(GREEN);
    expect(validateRpg(GREEN).ok).toBe(true);
    for (const c of CASES) expect(base).not.toContain(c.code);
  });

  for (const c of CASES) {
    it(`REJECTS ${c.code}: ${c.why}`, () => {
      const mutant = structuredClone(GREEN);
      c.mutate(mutant);
      const report = validateRpg(mutant);
      expect(report.ok).toBe(false);
      expect(report.findings.map((f) => f.code)).toContain(c.code);
    });
  }

  it("the corpus is non-degenerate: every case mutates the base into a distinct rejection", () => {
    // Each mutation must FLIP a clean pack to a rejected one — proving the case is a
    // real defect, not a no-op that happened to share the base's (empty) error set.
    for (const c of CASES) {
      const mutant = structuredClone(GREEN);
      c.mutate(mutant);
      expect(codesOf(mutant).length).toBeGreaterThan(0);
    }
  });
});
