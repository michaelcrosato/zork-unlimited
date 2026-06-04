/**
 * The procedural CYOA generator (src/gen/cyoa_generator.ts) — the first slice of "evolve
 * the eval distribution" (docs/CURRENT_PLAN.md, bug_0156). A generator is only useful if
 * every pack it mints clears the SAME bar the hand-authored packs clear, so this suite
 * holds generated packs to exactly that bar, reusing the production validator and the
 * shared exhaustive solver — no weaker, generator-specific check:
 *
 *   1. DETERMINISM (§8.5) — same seed ⇒ byte-identical pack (the reproducibility the whole
 *      eval-distribution idea rests on; a non-deterministic generator could never be a
 *      stable held-out corpus).
 *   2. SCHEMA-VALID — `generateCyoaPack` returns a `CyoaPackSchema.parse`d object, so a
 *      malformed emission would already have thrown; we re-assert it parses.
 *   3. VALIDATOR-CLEAN — `validateCyoa` reports ZERO findings (not merely zero errors):
 *      no soft-lock, no unreachable/dead ending, no impossible gate, no inert flag, no
 *      shadowed/unsatisfiable variant, no duplicate ending. A generated pack is as clean
 *      as a shipped one.
 *   4. EXHAUSTIVELY SOLVABLE — the shared `exhaustiveEndings` BFS (the ground-truth proof
 *      behind bug_0121) reaches EVERY declared ending by concrete play and no undeclared
 *      one, without hitting the state cap. In particular the truth-gated "best" ending is
 *      reachable only after the investigation sets the `truth` flag — so the gate is real
 *      AND passable, the exact property tithe_barn/white_stag encode by hand.
 *
 * Run across a spread of seeds so the proof covers the whole emitted distribution, not one
 * lucky pack. If a future change to the generator emits an unsolvable or unclean pack, the
 * relevant seed fails loudly here.
 */
import { describe, it, expect } from "vitest";
import { generateCyoaPack } from "../../src/gen/cyoa_generator.js";
import { CyoaPackSchema } from "../../src/cyoa/schema.js";
import { validateCyoa } from "../../src/validate/cyoa_validator.js";
import { indexPack, buildRules, initStateForPack } from "../../src/cyoa/runner.js";
import { makeStep } from "../../src/core/engine.js";
import { exhaustiveEndings } from "../regression/support/exhaustive_endings.js";

// A spread of seeds covering every theme (× the 2-vs-3-stance branch) and then some.
const SEEDS = Array.from({ length: 24 }, (_, i) => i);
const MAX_STATES = 50_000;

describe("bug_0156 — procedural CYOA generator emits packs that clear the shipped bar", () => {
  it("is deterministic: the same seed yields a byte-identical pack", () => {
    for (const seed of [0, 3, 7, 19]) {
      expect(generateCyoaPack(seed)).toEqual(generateCyoaPack(seed));
    }
  });

  it("distinct seeds (within a theme cycle) yield distinct packs", () => {
    // Two seeds whose themes differ must differ; this guards against a generator that
    // ignores its seed and emits one fixed pack (which would make the spread vacuous).
    const a = generateCyoaPack(0);
    const b = generateCyoaPack(1);
    expect(a).not.toEqual(b);
  });

  for (const seed of SEEDS) {
    it(`seed ${seed}: schema-valid, validator-clean, and exhaustively solvable`, () => {
      const pack = generateCyoaPack(seed);

      // (2) schema-valid (re-assert; the generator already parses internally).
      expect(() => CyoaPackSchema.parse(pack)).not.toThrow();

      // (3) validator-clean — zero findings of ANY severity.
      const report = validateCyoa(pack);
      expect(
        report.findings,
        `validator findings for seed ${seed}: ` +
          report.findings.map((f) => `${f.severity}/${f.code}: ${f.message}`).join(" | "),
      ).toEqual([]);
      expect(report.ok).toBe(true);

      // (4) exhaustively solvable — every declared ending reached, none undeclared, no cap-out.
      const index = indexPack(pack);
      const rules = buildRules(index);
      const declared = new Set(pack.endings.map((e) => e.id));
      const { reached, states, cappedOut } = exhaustiveEndings(
        rules,
        initStateForPack(index, seed),
        MAX_STATES,
      );
      expect(cappedOut, `seed ${seed} hit the ${MAX_STATES} state cap (explored ${states})`).toBe(
        false,
      );
      const missing = [...declared].filter((e) => !reached.has(e));
      expect(missing, `seed ${seed} declared endings never reached: ${missing.join(", ")}`).toEqual(
        [],
      );
      const undeclared = [...reached].filter((e) => !declared.has(e));
      expect(
        undeclared,
        `seed ${seed} reached endings not declared: ${undeclared.join(", ")}`,
      ).toEqual([]);
      // The pack genuinely forks: at least three distinct endings (hold + gated best + dark).
      expect(reached.size).toBeGreaterThanOrEqual(3);
    });
  }

  it("the two-axis design (bug_0169) + v3 depth (bug_0219): both investigations gate; the 'best' act sits behind the personal axis's depth-3 reckoning tier", () => {
    // Prove the deepened shape: from the pristine hub BOTH investigations are offered and the
    // gated `best` act is NOT (it needs the depth-3 `resolved` flag, reached only via the personal
    // `knows_ally` axis and the reckoning — not the situational one).
    const pack = generateCyoaPack(0);
    const index = indexPack(pack);
    const rules = buildRules(index);
    const step = makeStep(rules);
    const start = initStateForPack(index, 0);
    const hubIds = (s: typeof start): string[] =>
      rules.legalActions(s).map((a) => (a.type === "CHOOSE" ? a.choiceId : ""));
    // Walk a sequence of CHOOSE actions from the start, asserting each step is accepted.
    const walk = (ids: string[]): typeof start => {
      let s = start;
      for (const id of ids) {
        const r = step(s, { type: "CHOOSE", choiceId: id });
        expect(r.ok, `step "${id}" was rejected`).toBe(true);
        s = r.state;
      }
      return s;
    };

    const pristine = hubIds(start);
    expect(pristine).toContain("learn_way");
    expect(pristine).toContain("learn_ally");
    expect(pristine).not.toContain("best"); // gated on knows_ally
    expect(pristine).toContain("hold"); // an ungated act is always available
    expect(pristine).toContain("dark");

    // Learning the SITUATIONAL truth alone does NOT open the gate — it is the PERSONAL axis
    // (knows_ally) the `best` act turns on. This proves the two axes are independent gates.
    const afterWay = walk(["learn_way", "learn"]);
    expect(hubIds(afterWay)).not.toContain("best");
    expect(hubIds(afterWay)).not.toContain("learn_way"); // the situational investigation retires

    // Learning the PERSONAL truth no longer opens `best` DIRECTLY (v3, bug_0219): it opens the depth
    // tier — the `go_reckon` choice — while `best` stays gated on the deeper `resolved` flag.
    const afterAlly = walk(["learn_ally", "learn"]);
    expect(hubIds(afterAlly)).not.toContain("best"); // still gated on `resolved`
    expect(hubIds(afterAlly)).toContain("go_reckon"); // the reckoning depth tier is now offered
    expect(hubIds(afterAlly)).not.toContain("learn_ally"); // the personal investigation retires once known

    // Only committing in the reckoning (which sets `resolved`) finally offers the best act — the
    // depth-3 chain learn_ally ⇒ go_reckon ⇒ commit ⇒ best.
    const afterReckon = walk(["learn_ally", "learn", "go_reckon", "commit"]);
    expect(hubIds(afterReckon)).toContain("best");
    expect(hubIds(afterReckon)).not.toContain("go_reckon"); // the depth tier retires once resolved
  });
});
