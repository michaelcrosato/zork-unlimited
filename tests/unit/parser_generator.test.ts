/**
 * The procedural PARSER generator (src/gen/parser_generator.ts) — the third slice of "evolve
 * the eval distribution" (docs/CURRENT_PLAN.md), completing the generator trilogy across all
 * three game modes (CYOA bug_0156, RPG bug_0159, parser here). A generator is only useful if
 * every pack it mints clears the SAME bar the hand-authored packs clear, so this suite holds
 * generated parser packs to exactly that bar — the strictest validator in the suite plus the
 * shared exhaustive solver — with no weaker, generator-specific check:
 *
 *   1. DETERMINISM (§8.5) — same seed ⇒ byte-identical pack (the reproducibility the held-out
 *      corpus rests on; a non-deterministic generator could never be a stable sealed split).
 *   2. SCHEMA-VALID — `generateParserPack` returns a `ParserPackSchema.parse`d object, so a
 *      malformed emission would already have thrown; we re-assert it parses.
 *   3. VALIDATOR-CLEAN — `validateParser` reports ZERO findings (not merely zero errors): no
 *      soft-lock, no unreachable room/win, no impossible gate, no unobtainable key/item, no lost
 *      quest item, no non-terminating dialogue, no inert flag, no dead variant, no win-fires-at-
 *      start, no score-economy smell. A generated pack is as clean as a shipped one.
 *   4. EXHAUSTIVELY SOLVABLE — the shared `exhaustiveEndings` BFS (the ground-truth proof behind
 *      bug_0121/0122) reaches EVERY declared ending by concrete play (the canonical win on the
 *      gate route AND the telegraphed death on the hazard fork) and no undeclared one, without
 *      hitting the state cap.
 *   5. SCORE ECONOMY EXACT — under the liveness action policy (bug_0146, which steps READ), the
 *      maximum score reachable over the COMPLETE reachable region equals the declared max_score
 *      (20, the v3 4×5 economy) — no overflow/farm, no phantom points (the bug_0148 invariant,
 *      applied to the mint).
 *   6. GATE IS REAL — the goal is structurally unreachable until the key opens the gate (the lock
 *      is load-bearing, not decorative).
 *
 * Run across a spread of seeds so the proof covers the whole emitted distribution, not one lucky
 * pack. If a future change to the generator emits an unsolvable or unclean pack, the relevant seed
 * fails loudly here.
 */
import { describe, it, expect } from "vitest";
import { generateParserPack } from "../../src/gen/parser_generator.js";
import { ParserPackSchema } from "../../src/parser/schema.js";
import { validateParser } from "../../src/validate/parser_validator.js";
import { indexParserPack, initStateForParserPack } from "../../src/parser/model.js";
import type { Action } from "../../src/api/types.js";
import { exhaustiveEndingsMulti } from "../regression/support/exhaustive_endings.js";
import { parserRollRuleSets } from "../regression/support/parser_rolls.js";

// A spread of seeds covering every theme (and then some, wrapping past the theme count).
const SEEDS = Array.from({ length: 24 }, (_, i) => i);
const MAX_STATES = 200_000;

// The liveness action policy (bug_0146): step every legal action EXCEPT the ones that provably
// cannot gate a score award — pure-observation verbs and DROP. Crucially this DOES step READ,
// which carries the +5 clue award (the reachability policy skips READ).
const LIVENESS_SKIP: ReadonlySet<Action["type"]> = new Set([
  "DROP",
  "CLOSE",
  "LOOK",
  "INVENTORY",
  "INSPECT",
]);
const livenessExplore = (a: Action): boolean => !LIVENESS_SKIP.has(a.type);

describe("procedural PARSER generator emits packs that clear the shipped bar", () => {
  it("is deterministic: the same seed yields a byte-identical pack", () => {
    for (const seed of [0, 3, 7, 19]) {
      expect(generateParserPack(seed)).toEqual(generateParserPack(seed));
    }
  });

  it("distinct seeds (within a theme cycle) yield distinct packs", () => {
    // Guards against a generator that ignores its seed and emits one fixed pack (which would
    // make the spread vacuous). Seeds 0 and 1 select different themes, so they must differ.
    expect(generateParserPack(0)).not.toEqual(generateParserPack(1));
  });

  for (const seed of SEEDS) {
    it(`seed ${seed}: schema-valid, validator-clean, exhaustively solvable, exact score economy`, () => {
      const pack = generateParserPack(seed);

      // (2) schema-valid (re-assert; the generator already parses internally).
      expect(() => ParserPackSchema.parse(pack)).not.toThrow();

      // (3) validator-clean — zero findings of ANY severity.
      const report = validateParser(pack);
      expect(
        report.findings,
        `validator findings for seed ${seed}: ` +
          report.findings.map((f) => `${f.severity}/${f.code}: ${f.message}`).join(" | "),
      ).toEqual([]);
      expect(report.ok).toBe(true);

      // (4) exhaustively solvable — every declared ending reached, none undeclared, no cap-out.
      const index = indexParserPack(pack);
      const declared = new Set(pack.endings.map((e) => e.id));
      const { reached, states, cappedOut } = exhaustiveEndingsMulti(
        parserRollRuleSets(index),
        initStateForParserPack(index, seed),
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
      // The pack genuinely forks: the canonical win AND the telegraphed death are both reachable.
      expect(reached.has("ending_win"), `seed ${seed} cannot win`).toBe(true);
      expect(reached.has("ending_doom"), `seed ${seed} death fork unreachable`).toBe(true);

      // (5) score economy exact — the reachable max equals the declared max_score (no overflow,
      //     no phantom points). Liveness policy so the READ-borne +5 clue award is counted.
      let maxScore = 0;
      const econ = exhaustiveEndingsMulti(
        parserRollRuleSets(index),
        initStateForParserPack(index, seed),
        MAX_STATES,
        (s) => {
          const sc = s.vars.score ?? 0;
          if (sc > maxScore) maxScore = sc;
        },
        { explore: livenessExplore },
      );
      expect(econ.cappedOut, `seed ${seed} score search hit the cap`).toBe(false);
      expect(
        maxScore,
        `seed ${seed} reachable max score ${maxScore} != declared ${pack.meta.max_score}`,
      ).toBe(pack.meta.max_score);
    });
  }

  it("the gate is load-bearing: the goal is unreachable until the great key opens it", () => {
    // Prove the lock is real, not decorative: walking only the moves available WITHOUT the
    // great-key chain (never opening the strongbox, never taking the great key, never unlocking
    // the gate) can never set the gate flag, so `go north` to the goal stays rejected and no win
    // fires. We confirm by restricting the search to the actions that do NOT touch that chain —
    // the v2 depth-2 chain means the great key is cased in the locked strongbox, not the coffer.
    const pack = generateParserPack(0);
    const index = indexParserPack(pack);
    const noKeyChain = (a: Action): boolean =>
      !(
        (a.type === "OPEN" && a.target === "strongbox") ||
        (a.type === "TAKE" && a.item === "key") ||
        (a.type === "UNLOCK" && a.target === "gate")
      );
    const { reached, cappedOut } = exhaustiveEndingsMulti(
      parserRollRuleSets(index),
      initStateForParserPack(index, 0),
      MAX_STATES,
      undefined,
      { explore: noKeyChain },
    );
    expect(cappedOut).toBe(false);
    // Without ever unlocking the gate, the win is unreachable (the death fork also needs the key,
    // so neither ending fires) — the gate genuinely gates.
    expect(reached.has("ending_win")).toBe(false);
  });
});
