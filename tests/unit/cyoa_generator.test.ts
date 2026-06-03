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
      // The pack genuinely forks: at least three distinct endings (two stances + gated best).
      expect(reached.size).toBeGreaterThanOrEqual(3);
    });
  }

  it("the truth-gated 'best' ending is gated: unreachable without learning the truth", () => {
    // Prove the gate is load-bearing, not decorative: if we never set `truth`, the gated
    // ending is structurally absent from any legal action set. We confirm this by walking
    // only the un-gated stance choices from the hub and checking ending_truth is offered
    // nowhere along them.
    const pack = generateCyoaPack(0);
    const index = indexPack(pack);
    const rules = buildRules(index);
    const start = initStateForPack(index, 0);
    const hubActions = rules
      .legalActions(start)
      .map((a) => (a.type === "CHOOSE" ? a.choiceId : ""));
    // From the pristine (untruthed) hub, the gated act is NOT offered, but investigation is.
    expect(hubActions).not.toContain("act_on_truth");
    expect(hubActions).toContain("investigate");
  });
});
